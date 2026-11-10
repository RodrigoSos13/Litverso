import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Book } from '../src/models/Book.js';
import { buildTasks, runImport } from '../src/services/catalogImport.js';
import { createImportSources } from '../src/services/importSources.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const args = process.argv.slice(2), options = {};
const switches = new Set(['priority', 'dry-run', 'resume', 'report', 'help']);
const values = new Set(['genre', 'author', 'series', 'max-new', 'pages', 'state', 'delay']);
for (let i=0; i<args.length; i++) {
  const key = args[i].replace(/^--/, '');
  if (!args[i].startsWith('--') || (!switches.has(key) && !values.has(key))) throw new Error(`Argumento inválido: ${args[i]}`);
  if (switches.has(key)) options[key] = true;
  else { if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Falta valor: ${key}`); options[key] = args[++i]; }
}
if (options.help) {
  console.log('npm run catalog:import -- [--priority] [--genre "Fantasia,Romance"] [--author "Nome"] [--series "Série"] [--max-new 5000] [--pages 10] [--dry-run] [--resume] [--report] [--state /caminho/execucao.json] [--delay 1100]\nConcorrência: 1 lote por vez. --max-new limita novas obras nesta invocação. --pages limita páginas por consulta.');
  process.exit(0);
}
const statePath = resolve(options.state || fileURLToPath(new URL('../../backups/catalog-import/latest.json', import.meta.url)));
if (options.report) { console.log(await readFile(statePath, 'utf8')); process.exit(0); }
const maxNew = Number(options['max-new'] || 5000), pages = Number(options.pages || 10), delay = Number(options.delay || 1100);
if (!Number.isInteger(maxNew) || maxNew < 1 || !Number.isInteger(pages) || pages < 1 || pages > 50 || !Number.isFinite(delay) || delay < 1000) throw new Error('Limites inválidos (delay mínimo: 1000ms).');
const config = { priority: Boolean(options.priority), genres: options.genre?.split(',').map(g=>g.trim()) || [], author: options.author, series: options.series };
await mkdir(dirname(statePath), { recursive: true });
let lock, connected = false;
try {
  lock = await open(`${statePath}.lock`, 'wx');
  let state = options.resume ? JSON.parse(await readFile(statePath, 'utf8')) : { config, dryRun: Boolean(options['dry-run']), startedAt: new Date().toISOString() };
  if (options.resume && state.dryRun !== Boolean(options['dry-run'])) throw new Error('Não misture checkpoint de simulação com importação real.');
  const tasks = buildTasks(state.config);
  if (!tasks.length) throw new Error('Nenhum candidato para os filtros informados.');
  const fingerprint = createHash('sha256').update(JSON.stringify(tasks)).digest('hex');
  if (state.fingerprint && state.fingerprint !== fingerprint) throw new Error('A lista mudou. Use um novo --state.');
  state.fingerprint = fingerprint;
  const checkpoint = async value => {
    await writeFile(`${statePath}.tmp`, JSON.stringify(value, null, 2) + '\n');
    await rename(`${statePath}.tmp`, statePath);
  };
  await checkpoint(state);
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/litverse', { serverSelectionTimeoutMS: 5000, autoIndex: false, autoCreate: false });
  connected = true;
  state.executionError = null;
  if (!state.dryRun) {
    // Only our new partial unique index; never rebuild/drop existing indexes.
    await Book.collection.createIndex({ importWorkKey: 1 }, { name: 'unique_import_work', unique: true, partialFilterExpression: { importWorkKey: { $type: 'string' } } });
  }
  const repository = {
    list: () => Book.find({}).select('titulo autor tituloOriginal titulosAlternativos numeroNaSerie isbn googleBooksId openLibraryId genero').lean(),
    async insert(payload) {
      const doc = new Book(payload); await doc.validate();
      try { const r = await Book.updateOne({ importWorkKey: payload.importWorkKey }, { $setOnInsert: doc.toObject() }, { upsert: true, runValidators: true }); return Boolean(r.upsertedCount); }
      catch (error) { if (error.code === 11000) return false; throw error; }
    },
  };
  state = await runImport({ tasks, source: createImportSources({ delay }), repository, state, checkpoint, maxNew, pages, dryRun: state.dryRun, log: value => console.log(JSON.stringify(value)) });
  console.log(JSON.stringify({ report: statePath, complete: state.complete, stats: state.stats, error: state.lastError }));
  if (state.lastError) process.exitCode = 1;
} catch (error) {
  if (lock) {
    try { const saved = JSON.parse(await readFile(statePath, 'utf8')); saved.executionError = { code: error.code || error.name, at: new Date().toISOString() }; await writeFile(statePath, JSON.stringify(saved, null, 2) + '\n'); } catch {}
  }
  console.error(error.code === 'EEXIST' ? 'Checkpoint em uso: escolha outro --state ou verifique o processo antes de remover o .lock.' : 'Importação interrompida; checkpoint preservado. Código: ' + (error.code || error.name));
  process.exitCode = 1;
} finally {
  if (connected) await mongoose.disconnect();
  if (lock) { await lock.close(); await unlink(`${statePath}.lock`); }
}
