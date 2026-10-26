import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const uri = process.env.ATLAS_MONGODB_URI;
let database;
try { database = new URL(uri).pathname; } catch { /* validated below */ }
if (!uri?.startsWith("mongodb+srv://") || database !== "/litverse") {
  console.error("Defina ATLAS_MONGODB_URI no .env da raiz com a conexão do Atlas e o banco /litverse. Nenhuma importação foi executada.");
  process.exit(1);
}
if (!process.env.GOOGLE_BOOKS_API_KEY?.trim()) {
  console.error("Defina GOOGLE_BOOKS_API_KEY no .env da raiz. Nenhuma importação foi executada.");
  process.exit(1);
}

// Reuse the local worker's queries, filters, normalization, formatting and deduplication.
process.env.MONGODB_URI = uri;
if (!process.argv.includes("--once")) process.argv.push("--once");
try {
  await import("../src/catalogWorker.js");
} catch {
  console.error("Não foi possível importar no Atlas. Confira a conexão e libere seu IP atual no Atlas. Credenciais não são exibidas.");
  process.exitCode = 1;
  const { default: mongoose } = await import("mongoose");
  await mongoose.disconnect();
}
