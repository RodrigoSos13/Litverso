import { normalizeBookGenres } from "./bookGenres.js";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Book } from "../models/Book.js";
import { googleBooks, isSupportedLanguage } from "./googleBooks.js";
import { catalogFields } from "./catalogFields.js";
import { searchText } from "./bookSearch.js";

export const defaultCatalogQueries = [
  "Stephen King", "Machado de Assis", "Brandon Sanderson", "Agatha Christie",
  "Clarice Lispector", "Jorge Amado", "José Saramago", "J R R Tolkien",
  "J K Rowling", "George R R Martin", "Conceição Evaristo", "Jane Austen",
];
const stateSchema = new mongoose.Schema({
  _id: String, cursor: Number, completedAt: Date, owner: String, leaseUntil: Date,
}, { versionKey: false });
const SyncState = mongoose.model("CatalogSyncState", stateSchema);

export async function prepareCatalog() {
  // Migração incremental: preserva IDs, avaliações e relações existentes.
  const cursor = Book.find({ catalogVersion: { $ne: 1 } }).lean().cursor();
  let batch = [];
  for await (const book of cursor) {
    batch.push({ updateOne: { filter: { _id: book._id }, update: { $set: catalogFields(book) }, timestamps: false } });
    if (batch.length === 250) { await Book.bulkWrite(batch); batch = []; }
  }
  if (batch.length) await Book.bulkWrite(batch);
  await Book.init();
}

export async function saveCatalogVolumes(volumes) {
  let inserted = 0;
  let updated = 0;
  for (const volume of volumes) {
    if (!volume?.googleBooksId || !isSupportedLanguage(volume.idioma) || !catalogFields(volume).catalogHasCover) continue;
    // Um cadastro manual ou outra edição com o mesmo ISBN mantém seu ID.
    const existing = await Book.findOne({ $or: [
      { googleBooksId: volume.googleBooksId },
      ...(volume.isbn ? [{ isbnSearch: catalogFields(volume).isbnSearch }, { isbn: volume.isbn }] : []),
    ] }).lean();
    if (existing && existing.googleBooksId !== volume.googleBooksId) continue;
    const merged = { ...volume, generos: normalizeBookGenres([...(volume.generos?.length ? volume.generos : [volume.genero]), ...(existing?.generos || [])]) };
    const fields = { ...merged, ...catalogFields(merged), catalogSyncedAt: new Date() };
    const result = await Book.updateOne({ googleBooksId: volume.googleBooksId }, { $set: fields }, { upsert: true, runValidators: true });
    inserted += result.upsertedCount;
    updated += result.matchedCount;
  }
  return { inserted, updated };
}

export async function syncCatalog({ queries = defaultCatalogQueries, pagesPerQuery = 3, client = googleBooks, report = console.log } = {}) {
  const owner = randomUUID();
  const lease = () => new Date(Date.now() + 15 * 60 * 1000);
  try {
    await SyncState.findOneAndUpdate({ _id: "lease", $or: [{ leaseUntil: { $lte: new Date() } }, { leaseUntil: { $exists: false } }] },
      { $set: { owner, leaseUntil: lease() } }, { upsert: true });
  } catch (error) {
    if (error.code === 11000) return { busy: true, inserted: 0, updated: 0, failures: 0 };
    throw error;
  }
  const total = { inserted: 0, updated: 0, failures: 0 };
  try {
    await prepareCatalog();
    for (const query of queries) {
      const id = `query:${searchText(query)}`;
      const state = await SyncState.findById(id).lean();
      let startIndex = state?.cursor || 0;
      for (let page = 0; page < pagesPerQuery; page++) {
        await SyncState.updateOne({ _id: "lease", owner }, { $set: { leaseUntil: lease() } });
        try {
          const result = await client.search({ query, startIndex, maxBatches: 1 });
          const saved = await saveCatalogVolumes(result.livros);
          total.inserted += saved.inserted;
          total.updated += saved.updated;
          const advances = result.hasMore && Number.isInteger(result.nextIndex) && result.nextIndex > startIndex && result.nextIndex <= 2001;
          await SyncState.updateOne({ _id: id }, { $set: { cursor: advances ? result.nextIndex : 0, ...(!advances ? { completedAt: new Date() } : {}) } }, { upsert: true });
          report(`Catálogo: ${query}: +${saved.inserted}, ${saved.updated} atualizados`);
          if (!advances) break;
          startIndex = result.nextIndex;
        } catch (error) {
          total.failures++;
          // Não registrar URLs nem mensagens externas que possam incluir a chave.
          report(`Catálogo: falha em ${query} (${error.code || "SYNC_FAILED"}); cursor preservado`);
          break;
        }
      }
    }
    return total;
  } finally {
    await SyncState.updateOne({ _id: "lease", owner }, { $unset: { owner: "", leaseUntil: "" } });
  }
}
