import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { correctedBookGenre } from '../src/services/bookGenres.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const apply = process.argv.includes('--apply');
try {
  const uri = process.env.ATLAS_MONGODB_URI;
  if (!uri?.startsWith('mongodb+srv://') || new URL(uri).pathname !== '/litverse') {
    throw new Error('INVALID_TARGET');
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const collection = mongoose.connection.collection('livros');
  const books = await collection.find({}, { projection: { genero: 1, googleBooksId: 1 } }).toArray();
  const changes = books.map(book => ({ ...book, translated: correctedBookGenre(book) }))
    .filter(book => book.genero !== book.translated);
  console.log(JSON.stringify({ total: books.length, alterar: changes.length, aplicar: apply }));
  if (apply && changes.length) {
    const directory = new URL('../../backups/', import.meta.url);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const backup = new URL(`generos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, directory);
    await writeFile(backup, mongoose.mongo.BSON.EJSON.stringify(changes.map(({ _id, genero }) => ({ _id, genero }))), { mode: 0o600 });
    console.log(`Backup: ${fileURLToPath(backup)}`);
    const result = await collection.bulkWrite(changes.map(({ _id, genero, translated }) => ({
      updateOne: { filter: { _id, genero }, update: { $set: { genero: translated } } },
    })));
    console.log(JSON.stringify({ atualizados: result.modifiedCount }));
    const remaining = await collection.find({}, { projection: { genero: 1, googleBooksId: 1 } }).toArray();
    const pending = remaining.filter(book => book.genero !== correctedBookGenre(book)).length;
    console.log(JSON.stringify({ traducoesPendentes: pending }));
    if (pending) process.exitCode = 2;
  }
} catch {
  console.error('Falha na tradução. Confira ATLAS_MONGODB_URI (/litverse) e o acesso de rede ao Atlas. Se houve atualização parcial, é seguro repetir.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
