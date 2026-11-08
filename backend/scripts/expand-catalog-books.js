import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { mkdir, appendFile } from "node:fs/promises";
import { Book } from "../src/models/Book.js";
import { googleBooks } from "../src/services/googleBooks.js";
import { catalogFields } from "../src/services/catalogFields.js";
import { searchText } from "../src/services/bookSearch.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const uri = process.env.ATLAS_MONGODB_URI;
if (!uri?.startsWith("mongodb+srv://") || new URL(uri).pathname !== "/litverse" || !process.env.GOOGLE_BOOKS_API_KEY?.trim()) throw new Error("Configure Atlas /litverse e Google Books no .env.");
const authors = [
  "Octavia Butler", "Terry Pratchett", "Diana Wynne Jones", "Jules Verne", "Graciliano Ramos",
  "J R R Tolkien", "J K Rowling", "C S Lewis", "Jane Austen", "José Saramago",
  "Isaac Asimov", "Ursula K Le Guin", "George R R Martin", "Clarice Lispector", "Jorge Amado",
  "Conceição Evaristo", "Carolina Maria de Jesus", "Milton Hatoum", "Frank Herbert", "Arthur C Clarke",
  "Philip K Dick", "Ray Bradbury", "Douglas Adams", "Liu Cixin", "Andy Weir", "Blake Crouch",
  "Suzanne Collins", "Veronica Roth", "Cassandra Clare", "Sarah J Maas", "Rebecca Yarros",
  "Holly Black", "Leigh Bardugo", "V E Schwab", "Christopher Paolini", "Cornelia Funke",
  "Colleen Hoover", "Taylor Jenkins Reid", "Emily Henry", "Ali Hazelwood", "Julia Quinn",
  "Nora Roberts", "Nicholas Sparks", "Jojo Moyes", "Sally Rooney", "Elena Ferrante",
  "Dostoiévski", "Tolstói", "Franz Kafka", "Albert Camus", "Virginia Woolf",
  "Oscar Wilde", "Victor Hugo", "Alexandre Dumas", "Charles Dickens", "Emily Brontë", "Charlotte Brontë",
  "Antoine de Saint Exupéry", "Ernest Hemingway", "John Steinbeck", "Harper Lee", "F Scott Fitzgerald",
  "José de Alencar", "Lima Barreto", "Aluísio Azevedo", "Guimarães Rosa", "Rachel de Queiroz",
  "Cecília Meireles", "Carlos Drummond de Andrade", "Manuel Bandeira", "Ariano Suassuna", "Érico Veríssimo",
  "Rubem Fonseca", "Luis Fernando Verissimo", "Paulo Coelho", "Itamar Vieira Junior", "Ailton Krenak",
  "Djamila Ribeiro", "Chimamanda Ngozi Adichie", "Toni Morrison", "Mia Couto", "Pepetela",
  "Isabel Allende", "Jorge Luis Borges", "Julio Cortázar", "Mario Vargas Llosa", "Haruki Murakami",
  "Kazuo Ishiguro", "Margaret Atwood", "José Mauro de Vasconcelos", "Lygia Bojunga", "Ana Maria Machado",
  "Pedro Bandeira", "Ruth Rocha", "Mauricio de Sousa", "Jeff Kinney", "Roald Dahl",
  "Arthur Conan Doyle", "Dan Brown", "Harlan Coben", "Gillian Flynn", "Paula Hawkins", "Freida McFadden",
  "Yuval Noah Harari", "Brené Brown", "James Clear", "Viktor Frankl", "bell hooks", "Angela Davis",
];
const compact = value => searchText(value).replace(/ /g, "");
const apply = process.argv.includes("--apply");
const journal = new URL(`../../backups/catalog-expansion-${Date.now()}.jsonl`, import.meta.url);
let inserted = 0, failures = 0, duplicates = 0, rejected = 0;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  const existing = await Book.find({}, { titulo: 1, autor: 1 }).lean();
  const counts = new Map(authors.map(author => [author, existing.filter(book => compact(book.autor).includes(compact(author))).length]));
  authors.sort((a, b) => counts.get(a) - counts.get(b));
  console.log(JSON.stringify({ apply, before: existing.length, queries: authors.length }));
  if (!apply) process.exitCode = 0;
  else {
    await mkdir(new URL("../../backups/", import.meta.url), { recursive: true });
    let consecutiveFailures = 0;
    for (const author of authors) {
      let added = 0, startIndex = 0;
      for (let page = 0; page < 4; page++) {
        let result;
        try { result = await googleBooks.search({ query: `inauthor:${author}`, startIndex, maxBatches: 1, pageSize: 40 }); consecutiveFailures = 0; }
        catch { failures++; consecutiveFailures++; console.log(`Busca indisponível: ${author}`); break; }
        for (const volume of result.livros) {
          const fields = catalogFields(volume);
          if (!fields.catalogHasCover || !compact(volume.autor).includes(compact(author))) { rejected++; continue; }
          const duplicate = await Book.exists({ $or: [
            { googleBooksId: volume.googleBooksId },
            ...(fields.isbnSearch ? [{ isbnSearch: fields.isbnSearch }, { isbn: volume.isbn }] : []),
            { titleTokens: fields.titleTokens, authorTokens: fields.authorTokens },
            { titulo: volume.titulo, autor: volume.autor },
          ] });
          if (duplicate) { duplicates++; continue; }
          const doc = new Book({ ...volume, catalogSyncedAt: new Date() });
          await doc.validate();
          // Persist the intended document before insertion for recovery/auditing.
          await appendFile(journal, JSON.stringify(doc.toObject()) + "\n");
          try { await doc.save(); inserted++; added++; }
          catch (error) { if (error.code !== 11000) throw error; duplicates++; }
        }
        if (!result.hasMore || !Number.isInteger(result.nextIndex) || result.nextIndex <= startIndex) break;
        startIndex = result.nextIndex;
      }
      console.log(`${author}: antes=${counts.get(author)}, adicionados=${added}; total inserido=${inserted}`);
      if (consecutiveFailures >= 5) { console.log("Interrompido após cinco buscas indisponíveis consecutivas."); break; }
    }
  }
  console.log(JSON.stringify({ inserted, failures, duplicates, rejected, after: await Book.countDocuments() }));
} catch (error) {
  console.error(JSON.stringify({ error: error.name, code: error.code, inserted }));
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
