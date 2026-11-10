import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const uri = process.env.ATLAS_MONGODB_URI;
let database;
try { database = new URL(uri).pathname; } catch {}
if (!uri?.startsWith('mongodb+srv://') || database !== '/litverse') {
  console.error('Configure ATLAS_MONGODB_URI para o banco /litverse. Nenhum registro foi importado.');
  process.exit(1);
}
process.env.MONGODB_URI = uri;
if (!process.argv.includes('--state')) process.argv.push('--state', fileURLToPath(new URL('../../backups/catalog-import/atlas.json', import.meta.url)));
await import('./import-catalog.js');
