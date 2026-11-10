import { readFile } from 'node:fs/promises';
import { catalogFields } from './catalogFields.js';
import { blockedAuthor, matchesCandidate, sameWork, workKey } from './importPolicy.js';
export const priorityCatalog = JSON.parse(await readFile(new URL('../data/priorityCatalog.json', import.meta.url), 'utf8'));
const topics = ['Poesia brasileira', 'Contos e crônicas', 'Policial nórdico', 'Fantasia sombria', 'Realismo mágico', 'Literatura asiática', 'Ficção histórica', 'Romance gótico', 'Romance de época', 'Drama', 'Literatura LGBTQIA+', 'Biografias', 'História mundial', 'Divulgação científica', 'Tecnologia e computação', 'Cibersegurança', 'Economia e negócios', 'Mitologia', 'Filosofia', 'Sociologia', 'Literatura de viagem', 'Espiritualidade', 'Humor'];
export function buildTasks({ priority = false, genres = [], author, series } = {}) {
  const selected = priorityCatalog.filter(b => !genres.length || genres.some(g => b.genero.toLowerCase() === g.toLowerCase()));
  if (author) return blockedAuthor(author) ? [] : [{ autor: author, ...(series ? { serie: series } : {}) }];
  if (series) return [{ serie: series }];
  if (priority) return selected;
  const authors = [...new Map(selected.map(b => [b.autor, { autor: b.autor, genero: b.genero }])).values()];
  const discovery = genres.length ? genres : topics;
  // Rotate authors across genres to avoid exhausting the limit on the first genre.
  authors.sort((a,b) => a.autor.localeCompare(b.autor));
  return [...selected, ...authors, ...discovery.map(genero => ({ query: genero, genero }))];
}
export function duplicateOf(book, existing) {
  const isbn = String(book.isbn || '').replace(/[\s-]/g, '').toLowerCase();
  return existing.find(b => (book.googleBooksId && b.googleBooksId === book.googleBooksId) ||
    (book.openLibraryId && b.openLibraryId === book.openLibraryId) ||
    (isbn && String(b.isbn || '').replace(/[\s-]/g, '').toLowerCase() === isbn) || sameWork(b, book));
}
export async function runImport({ tasks, source, repository, state, checkpoint = async () => {}, maxNew = 5000, pages = 10, dryRun = false, log = () => {} }) {
  const existing = await repository.list();
  state.results ||= [];
  state.stats ||= { analyzed: 0, inserted: 0, duplicates: 0, updated: 0, rejected: 0, withoutPortuguese: 0, errors: 0 };
  state.task ||= 0; state.cursor ||= 0; state.page ||= 0;
  let lastCheckpoint = Date.now();
  let newThisRun = 0;
  while (state.task < tasks.length && newThisRun < maxNew) {
    const task = tasks[state.task];
    let result;
    try { result = await source.search(task, state.cursor); }
    catch {
      state.stats.errors++;
      state.lastError = { task, reason: 'SOURCES_UNAVAILABLE', at: new Date().toISOString() };
      await checkpoint(state); break; // Retry the same cursor on resume.
    }
    state.stats.rejected += result.rejected || 0;
    state.stats.analyzed += result.rejected || 0;
    let accepted = 0;
    for (const volume of result.livros) {
      if (newThisRun >= maxNew) break; // Cursor remains on this page; duplicates make replay safe.
      state.stats.analyzed++;
      if (!matchesCandidate(volume, task)) { state.stats.rejected++; continue; }
      const known = priorityCatalog.find(b => matchesCandidate(volume, b));
      const book = { ...volume,
        ...(known ? { titulosAlternativos: [...new Set([known.titulo, ...(known.titulosAlternativos || [])])], ...(known.titulosAlternativos?.length ? { tituloOriginal: known.titulosAlternativos[0] } : {}) } : {}),
        ...(task.titulo ? { titulosAlternativos: [...new Set([...(task.titulosAlternativos || []), task.titulo])], ...(task.titulosAlternativos?.length ? { tituloOriginal: task.titulosAlternativos[0] } : {}) } : {}),
        ...(task.serie ? { serie: task.serie } : {}),
      };
      if (duplicateOf(book, existing)) { state.stats.duplicates++; accepted++; continue; }
      if (!await source.coverAvailable(book.urlCapa)) { state.stats.rejected++; state.results.push({ task, title: book.titulo, status: 'rejected', reason: 'COVER_UNAVAILABLE' }); continue; }
      const now = new Date();
      const payload = { ...book, ...catalogFields(book), importWorkKey: workKey(book), origemImportacao: book.googleBooksId ? 'google-books' : 'open-library', dataImportacao: now, ultimaVerificacao: now };
      // External ratings and social fields are never accepted, even from an injected source.
      for (const field of ['_id', 'mediaAvaliacoes', 'totalAvaliacoes', 'destaque', 'createdAt', 'updatedAt']) delete payload[field];
      const inserted = dryRun ? true : await repository.insert(payload);
      existing.push(payload);
      if (inserted) { state.stats.inserted++; newThisRun++; } else state.stats.duplicates++;
      accepted++;
      if (!/^pt(?:-|$)/i.test(book.idioma)) state.stats.withoutPortuguese++;
      state.results.push({ task, title: book.titulo, status: dryRun ? 'would-insert' : inserted ? 'inserted' : 'duplicate', source: payload.origemImportacao });
    }
    if (!accepted && !result.livros.length) state.results.push({ task, status: 'unresolved', reason: 'NO_VERIFIED_EDITION' });
    state.page++;
    if (newThisRun < maxNew) {
      if (result.hasMore && Number.isInteger(result.nextIndex) && result.nextIndex > state.cursor && state.page < pages) state.cursor = result.nextIndex;
      else { state.task++; state.cursor = 0; state.page = 0; }
    } else state.page--; // Revisit an interrupted page on resume.
    state.lastError = null;
    state.elapsedMs = (state.elapsedMs || 0) + Date.now() - lastCheckpoint;
    lastCheckpoint = Date.now();
    await checkpoint(state);
    log({ task: state.task, totalTasks: tasks.length, ...state.stats });
  }
  state.complete = state.task >= tasks.length;
  state.distribution = {};
  for (const book of existing) state.distribution[book.genero || 'Sem gênero'] = (state.distribution[book.genero || 'Sem gênero'] || 0) + 1;
  state.priorityCoverage = tasks.filter(t => t.titulo).map(task => ({ titulo: task.titulo, autor: task.autor, present: existing.some(b => matchesCandidate(b, task)), reason: existing.some(b => matchesCandidate(b, task)) ? null : 'NO_VERIFIED_EDITION_OR_NOT_PROCESSED' }));
  await checkpoint(state);
  return state;
}
