import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeBookGenres, reviewedBookGenres, correctedBookGenre } from '../src/services/bookGenres.js';
import { createGoogleBooksClient } from '../src/services/googleBooks.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const apply = process.argv.includes('--apply');
const refresh = process.argv.includes('--refresh-google');
try {
  const uri = process.env.ATLAS_MONGODB_URI;
  if (!uri?.startsWith('mongodb+srv://') || new URL(uri).pathname !== '/litverse') throw Error('INVALID_TARGET');
  if (refresh && !process.env.GOOGLE_BOOKS_API_KEY) throw Error('MISSING_KEY');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const collection = mongoose.connection.collection('livros');
  const books = await collection.find({}, { projection: { titulo: 1, autor: 1, genero: 1, generos: 1, googleBooksId: 1 } }).toArray();
  const changes = [];
  const client = createGoogleBooksClient();
  let refreshed = 0, failures = 0, quotaReached = false;
  for (const [index, book] of books.entries()) {
    let generos = normalizeBookGenres(book.generos?.length ? book.generos : correctedBookGenre(book));
    if (refresh && book.googleBooksId && !quotaReached) {
      try {
        const volume = await client.getVolume(book.googleBooksId);
        const external = volume.generos.filter(value => value !== 'Não informado');
        if (external.length) generos = normalizeBookGenres([...external, ...generos]);
        refreshed++;
      } catch (error) {
        failures++;
        if (error.status === 503) quotaReached = true;
      }
    }
    const reviewed = reviewedBookGenres(book);
    if (reviewed.length) generos = normalizeBookGenres([...reviewed, ...generos]);
    if (!generos.length) generos = ['Não informado'];
    if (book.genero !== generos[0] || JSON.stringify(book.generos) !== JSON.stringify(generos)) changes.push({ book, genero: generos[0], generos });
    if ((index + 1) % 25 === 0) console.log(JSON.stringify({ revisados: index + 1, total: books.length, consultadosGoogle: refreshed, falhas: failures }));
  }
  console.log(JSON.stringify({ total: books.length, alterar: changes.length, consultadosGoogle: refreshed, falhas: failures, aplicar: apply }));
  if (apply && changes.length) {
    const directory = new URL('../../backups/', import.meta.url);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const backup = new URL(`multiplos-generos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, directory);
    await writeFile(backup, mongoose.mongo.BSON.EJSON.stringify(changes.map(({ book }) => book)), { mode: 0o600 });
    console.log(`Backup: ${fileURLToPath(backup)}`);
    const result = await collection.bulkWrite(changes.map(({ book, genero, generos }) => ({ updateOne: {
      filter: { _id: book._id, genero: book.genero, generos: book.generos === undefined ? { $exists: false } : book.generos },
      update: { $set: { genero, generos } },
    } })));
    await collection.createIndex({ generos: 1 });
    console.log(JSON.stringify({ atualizados: result.modifiedCount, conflitosConcorrentes: changes.length - result.matchedCount }));
    console.log(JSON.stringify({ palavrasDeRadiancia: await collection.find({ titulo: /palavras de radiância|words of radiance/i, autor: /brandon sanderson/i }, { projection: { titulo: 1, genero: 1, generos: 1 } }).toArray() }));
  }
} catch {
  console.error('Migração interrompida. Confira a URI do Atlas (/litverse), a chave Google e o acesso de rede. Credenciais não são exibidas.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
