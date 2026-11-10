import { mangaVolume, mangaCatalog } from '../src/services/mangaImport.js';
import { googleBooks } from '../src/services/googleBooks.js';
import { retry, pause } from '../src/services/importSources.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Book } from '../src/models/Book.js';
import { buildTasks, runImport, enableDiscoveryOnly } from '../src/services/catalogImport.js';
import { createImportSources } from '../src/services/importSources.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const args = process.argv.slice(2), options = {};
const switches = new Set(['manga', 'priority', 'discovery-only', 'dry-run', 'resume', 'report', 'help']);
const values = new Set(['genre', 'author', 'series', 'max-new', 'pages', 'state', 'delay']);
for (let i=0; i<args.length; i++) {
  const key = args[i].replace(/^--/, '');
  if (!args[i].startsWith('--') || (!switches.has(key) && !values.has(key))) throw new Error(`Argumento inválido: ${args[i]}`);
  if (switches.has(key)) options[key] = true;
  else { if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Falta valor: ${key}`); options[key] = args[++i]; }
}
if (options.help) {
  console.log('npm run catalog:import -- [--manga | --priority | --discovery-only] [--genre "Fantasia,Romance"] [--author "Nome"] [--series "Série"] [--max-new 5000] [--pages 10] [--dry-run] [--resume] [--report] [--state /caminho/execucao.json] [--delay 1100]\nConcorrência: 1 lote por vez. --max-new limita novas obras nesta invocação. --pages limita páginas por consulta.');
  process.exit(0);
}
const statePath = resolve(options.state || fileURLToPath(new URL('../../backups/catalog-import/latest.json', import.meta.url)));
if (options.report) { console.log(await readFile(statePath, 'utf8')); process.exit(0); }
const maxNew = Number(options['max-new'] || (options.manga ? Number.MAX_SAFE_INTEGER : 5000)), pages = Number(options.pages || (options.manga ? Number.MAX_SAFE_INTEGER : 10)), delay = Number(options.delay || 1100);
if (!Number.isInteger(maxNew) || maxNew < 1 || !Number.isInteger(pages) || pages < 1 || (options.pages && pages > 100) || !Number.isFinite(delay) || delay < 1000) throw new Error('Limites inválidos (delay mínimo: 1000ms).');
const config = { manga: Boolean(options.manga), priority: Boolean(options.priority), discoveryOnly: Boolean(options['discovery-only']), genres: options.genre?.split(',').map(g=>g.trim()) || [], author: options.author, series: options.series };
await mkdir(dirname(statePath), { recursive: true });
let lock, connected = false, stopping = false;
const stop = () => { stopping = true; console.log('Encerrando após salvar o lote atual; aguarde.'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  lock = await open(`${statePath}.lock`, 'wx');
  let state = options.resume ? JSON.parse(await readFile(statePath, 'utf8')) : { config, dryRun: Boolean(options['dry-run']), startedAt: new Date().toISOString() };
  if (options.resume && state.dryRun !== Boolean(options['dry-run'])) throw new Error('Não misture checkpoint de simulação com importação real.');
  let tasks = buildTasks(state.config);
  if (!tasks.length) throw new Error('Nenhum candidato para os filtros informados.');
  let fingerprint = createHash('sha256').update(JSON.stringify(tasks)).digest('hex');
  if (state.fingerprint && state.fingerprint !== fingerprint) throw new Error('A lista mudou. Use um novo --state.');
  if (options.resume && options['discovery-only'] && !state.config.discoveryOnly) {
    enableDiscoveryOnly(state);
    tasks = buildTasks(state.config);
    fingerprint = createHash('sha256').update(JSON.stringify(tasks)).digest('hex');
  }
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
    async list() {
      const books = await Book.find({}).select('titulo autor tituloOriginal titulosAlternativos serie numeroNaSerie isbn googleBooksId openLibraryId genero').lean();
      return state.config.manga ? books.map(book => mangaCatalog.map(series => mangaVolume(book, series)).find(Boolean) || book) : books;
    },
    async insert(payload) {
      const doc = new Book(payload); await doc.validate();
      try { const r = await Book.updateOne({ importWorkKey: payload.importWorkKey }, { $setOnInsert: doc.toObject() }, { upsert: true, runValidators: true }); return Boolean(r.upsertedCount); }
      catch (error) { if (error.code === 11000) return false; throw error; }
    },
  };
  const source = createImportSources({ delay });
  if (state.config.manga) {
    source.search = async (task, cursor = 0) => {
      await pause(delay);
      const result = await retry(() => googleBooks.search({ query: task.query, startIndex: cursor, maxBatches: 1, pageSize: 40, matchResults: false }));
      const volumes = result.livros.map(book => {
        const titled = book.subtitulo && !mangaVolume(book, task.manga) ? { ...book, titulo: `${book.titulo}: ${book.subtitulo}` } : book;
        return mangaVolume(titled, task.manga);
      }).filter(Boolean).filter(book => !task.volume || book.numeroNaSerie === task.volume);
      state.observedVolumes ||= {};
      const observed = new Set(state.observedVolumes[task.manga.serie] || []);
      volumes.forEach(book => observed.add(book.numeroNaSerie));
      state.observedVolumes[task.manga.serie] = [...observed];
      return { ...result, livros: volumes, rejected: result.livros.length - volumes.length };
    };
  }
  const run = async () => runImport({ tasks, source, repository, state, checkpoint, maxNew, pages, dryRun: state.dryRun, shouldStop: () => stopping, log: value => console.log(JSON.stringify(value)) });
  if (state.mangaGapTasks) tasks.push(...state.mangaGapTasks);
  state = await run();
  if (state.config.manga && state.complete && !state.mangaGapTasks && !stopping) {
    const books = await repository.list();
    state.mangaGapTasks = [];
    for (const series of mangaCatalog) {
      const observed = state.observedVolumes?.[series.serie] || [];
      if (!observed.length || /jojo/i.test(series.serie)) continue;
      const present = new Set(books.filter(b => b.serie === series.serie).map(b => b.numeroNaSerie));
      for (let n = 1; n <= Math.max(...observed); n++) {
        if (!present.has(n)) state.mangaGapTasks.push({ manga: series, volume: n, query: `${series.serie} ${series.autor} ${n}` });
      }
    }
    tasks.push(...state.mangaGapTasks);
    await checkpoint(state);
    if (state.mangaGapTasks.length) state = await run();
  }
  if (state.config.manga) {
    const books = await repository.list();
    state.bySeries = mangaCatalog.filter(s => !state.config.series || [s.serie, ...(s.aliases || [])].some(a => a.toLowerCase() === state.config.series.toLowerCase())).map(series => ({
      serie: series.serie,
      inserted: state.results.filter(r => r.status === 'inserted' && r.task.manga?.serie === series.serie).length,
      available: books.filter(b => mangaVolume(b, series)).length,
      observed: state.observedVolumes?.[series.serie]?.length || 0,
    }));
    await checkpoint(state);
    console.log(JSON.stringify({ bySeries: state.bySeries }));
  }
  console.log(JSON.stringify({ report: statePath, complete: state.complete, stats: state.stats, error: state.lastError }));
  if (state.lastError) process.exitCode = 1;
} catch (error) {
  if (lock) {
    try { const saved = JSON.parse(await readFile(statePath, 'utf8')); saved.executionError = { code: error.code || error.name, at: new Date().toISOString() }; await writeFile(statePath, JSON.stringify(saved, null, 2) + '\n'); } catch {}
  }
  console.error(error.code === 'EEXIST' ? 'Checkpoint em uso: escolha outro --state ou verifique o processo antes de remover o .lock.' : 'Importação interrompida; checkpoint preservado. Código: ' + (error.code || error.name));
  process.exitCode = 1;
} finally {
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
  if (connected) await mongoose.disconnect();
  if (lock) { await lock.close(); await unlink(`${statePath}.lock`); }
}
