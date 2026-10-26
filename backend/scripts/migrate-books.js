import dotenv from "dotenv";
import mongoose from "mongoose";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Book } from "../src/models/Book.js";
import { catalogFields } from "../src/services/catalogFields.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const apply = process.argv.includes("--apply");
const sourceUri = process.env.LOCAL_BOOKS_MONGODB_URI || "mongodb://127.0.0.1:27018/litverse";
const targetUri = process.env.ATLAS_MONGODB_URI;
if (!targetUri?.startsWith("mongodb+srv://")) {
  console.error("Defina ATLAS_MONGODB_URI no .env da raiz com a conexão do Atlas, incluindo /litverse.");
  process.exit(1);
}
let targetDatabase;
try { targetDatabase = new URL(targetUri).pathname; } catch { /* handled below */ }
if (targetDatabase !== "/litverse") {
  console.error("A conexão de destino deve selecionar explicitamente o banco /litverse.");
  process.exit(1);
}

const source = mongoose.createConnection();
const target = mongoose.createConnection();
try {
  await source.openUri(sourceUri, { serverSelectionTimeoutMS: 10000 });
  await target.openUri(targetUri, { serverSelectionTimeoutMS: 10000 });
  const books = await source.collection("livros").find({}).toArray();
  const TargetBook = target.model("Livro", Book.schema, "livros");
  const counts = { origem: books.length, inserir: 0, existentes: 0, invalidos: 0, conflitos: 0 };
  // Validate and normalize through the same Mongoose schema as the application.
  const planned = new Set();
  if (apply) {
    const directory = fileURLToPath(new URL("../../backups/", import.meta.url));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = `livros-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await writeFile(directory + filename, mongoose.mongo.BSON.EJSON.stringify(books), { mode: 0o600 });
    console.log(`Backup local do catálogo salvo em backups/${filename}.`);
    await TargetBook.init();
  }
  for (const original of books) {
    const data = { ...original, mediaAvaliacoes: 0, totalAvaliacoes: 0 };
    const book = new TargetBook(data);
    try { await book.validate(); }
    catch { counts.invalidos++; continue; }
    const normalized = book.toObject();
    Object.assign(normalized, catalogFields(normalized));
    const identities = [`id:${book._id}`];
    const filters = [{ _id: book._id }];
    if (normalized.isbnSearch) {
      filters.push({ isbnSearch: normalized.isbnSearch }, { isbn: normalized.isbn });
      identities.push(`isbn:${normalized.isbnSearch}`);
    }
    if (normalized.googleBooksId) {
      filters.push({ googleBooksId: normalized.googleBooksId });
      identities.push(`google:${normalized.googleBooksId}`);
    }
    if (identities.some(key => planned.has(key)) || await TargetBook.exists({ $or: filters })) {
      counts.existentes++; continue;
    }
    if (apply) {
      try {
        // Insert only: never overwrite books or their ratings already in Atlas.
        await TargetBook.collection.insertOne(normalized);
      } catch (error) {
        if (error.code === 11000) { counts.conflitos++; continue; }
        throw error;
      }
    }
    identities.forEach(key => planned.add(key));
    counts.inserir++;
  }
  console.log(apply ? "Transferência concluída:" : "Simulação (nenhum dado alterado):", JSON.stringify(counts));
  if (counts.invalidos || counts.conflitos) process.exitCode = 2;
} catch {
  // Never print driver errors: they may include credentials.
  console.error("Transferência interrompida. Confira as conexões, senha, IP local liberado no Atlas e disponibilidade do MongoDB. É seguro repetir: livros existentes são preservados.");
  process.exitCode = 1;
} finally {
  await Promise.allSettled([source.close(), target.close()]);
}
