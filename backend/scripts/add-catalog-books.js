import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { Book } from "../src/models/Book.js";
import { googleBooks } from "../src/services/googleBooks.js";
import { catalogFields } from "../src/services/catalogFields.js";
import { searchText } from "../src/services/bookSearch.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const uri = process.env.ATLAS_MONGODB_URI;
let database;
try { database = new URL(uri).pathname; } catch { /* validated below */ }
if (!uri?.startsWith("mongodb+srv://") || database !== "/litverse" || !process.env.GOOGLE_BOOKS_API_KEY?.trim()) {
  console.error("Configure ATLAS_MONGODB_URI com o banco /litverse e GOOGLE_BOOKS_API_KEY no .env da raiz.");
  process.exit(1);
}

const authors = ["Ursula K Le Guin", "Octavia Butler", "Neil Gaiman", "Isaac Asimov",
  "Carolina Maria de Jesus", "Lygia Fagundes Telles", "Milton Hatoum", "Graciliano Ramos",
  "Jules Verne", "Mary Shelley", "Terry Pratchett", "Diana Wynne Jones"];
const limit = 60;
let inserted = 0;
let failures = 0;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const before = await Book.countDocuments();
  for (const author of authors) {
    for (let page = 0, startIndex = 0; page < 3 && inserted < limit; page++) {
      let result;
      try { result = await googleBooks.search({ query: author, startIndex, maxBatches: 1 }); }
      catch { failures++; console.error(`Busca indisponível: ${author}`); break; }
      for (const volume of result.livros) {
        const normalizedAuthor = searchText(volume.autor);
        if (normalizedAuthor.includes("machado") || !volume.googleBooksId) continue;
        const fields = catalogFields(volume);
        if (!fields.catalogHasCover) continue;
        const duplicate = await Book.exists({ $or: [
          { googleBooksId: volume.googleBooksId },
          ...(fields.isbnSearch ? [{ isbnSearch: fields.isbnSearch }, { isbn: volume.isbn }] : []),
          { titleTokens: fields.titleTokens, authorTokens: fields.authorTokens },
          { titulo: volume.titulo, autor: volume.autor },
        ] });
        if (duplicate) continue;
        // Insert only: keep existing editions, ratings and reading relationships intact.
        try {
          await Book.create({ ...volume, catalogSyncedAt: new Date() });
          inserted++;
          console.log(`Cadastrado: ${volume.titulo} — ${volume.autor}`);
        } catch (error) {
          if (error.code !== 11000) throw error;
        }
        if (inserted >= limit) break;
      }
      if (!result.hasMore || !Number.isInteger(result.nextIndex) || result.nextIndex <= startIndex) break;
      startIndex = result.nextIndex;
    }
    if (inserted >= limit) break;
  }
  console.log(JSON.stringify({ inserted, before, after: await Book.countDocuments(), searchFailures: failures }));
} catch {
  console.error("Importação interrompida. Confira a conexão e a liberação do IP no Atlas. Os cadastros concluídos foram preservados.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
