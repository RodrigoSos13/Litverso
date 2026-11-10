import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTasks, runImport, priorityCatalog, duplicateOf } from '../src/services/catalogImport.js';
import { blockedAuthor, matchesCandidate, sameWork, workKey } from '../src/services/importPolicy.js';
import { retry, createImportSources } from '../src/services/importSources.js';
import { Book } from '../src/models/Book.js';
import { catalogFields } from '../src/services/catalogFields.js';
const hobbit = { titulo: 'O Hobbit', autor: 'J. R. R. Tolkien', genero: 'Fantasia', idioma: 'pt', descricao: 'Uma aventura.', googleBooksId: 'hobbit', urlCapa: 'https://books.google.com/cover.jpg', mediaAvaliacoes: 5, totalAvaliacoes: 100 };
const task = { titulo: 'O Hobbit', autor: 'J. R. R. Tolkien', titulosAlternativos: ['The Hobbit'] };
function fixture(books = []) {
  return { books, repository: { list: async () => [...books], insert: async b => { books.push(b); return true; } }, source: { search: async () => ({ livros: [hobbit] }), coverAvailable: async () => true } };
}
test('500 candidatos prioritários, autores excluídos e filtros', () => {
  assert.ok(priorityCatalog.length >= 500);
  assert.ok(priorityCatalog.every(b => !blockedAuthor(b.autor)));
  assert.equal(buildTasks({ author: 'Jorge Amado' }).length, 0);
  assert.ok(buildTasks({ priority: true, genres: ['Terror'] }).every(b => b.genero === 'Terror'));
  for (const author of ['Machado de Assis', 'Joaquim Maria Machado de Assis', 'JORGE AMADO', 'Amado, Jorge', 'Assis, Machado de']) assert.ok(blockedAuthor(author));
  assert.ok(!blockedAuthor('Ana Maria Machado'));
});
test('valida título e autoria; rejeita guias, autor errado e autores excluídos', () => {
  assert.ok(matchesCandidate(hobbit, task));
  assert.ok(!matchesCandidate({ ...hobbit, titulo: 'Outro livro' }, task));
  assert.ok(!matchesCandidate({ ...hobbit, autor: 'Outra Pessoa' }, task));
  assert.ok(!matchesCandidate({ ...hobbit, titulo: 'O Hobbit Study Guide' }, {}));
  for (const autor of ['Machado de Assis', 'Jorge Amado']) assert.ok(!matchesCandidate({ ...hobbit, autor }, {}));
});
test('traduções e variantes representam a mesma obra; volumes diferentes permanecem separados', () => {
  const translated = { ...hobbit, titulo: 'The Hobbit', titulosAlternativos: ['O Hobbit'] };
  assert.ok(sameWork(hobbit, translated));
  assert.ok(sameWork(hobbit, { ...hobbit, titulo: 'O Hobbit — Capa Dura' }));
  assert.ok(!sameWork({ ...hobbit, titulo: 'One Piece Vol. 1' }, { ...hobbit, titulo: 'One Piece Vol. 2' }));
  assert.notEqual(workKey({ ...hobbit, numeroNaSerie: 1 }), workKey({ ...hobbit, numeroNaSerie: 2 }));
  assert.ok(!sameWork(hobbit, { ...hobbit, autor: 'Outra Pessoa' }));
});
test('importa livro válido, gera documento compatível e não copia avaliações externas', async () => {
  const f = fixture(), state = {};
  await runImport({ ...f, tasks: [task], state });
  assert.equal(f.books.length, 1);
  assert.equal(f.books[0].totalAvaliacoes, undefined);
  assert.equal(f.books[0].mediaAvaliacoes, undefined);
  const doc = new Book(f.books[0]); await doc.validate();
  assert.equal(doc.mediaAvaliacoes, 0);
  assert.ok(catalogFields(doc).titleTokens.includes('hobbit'));
  assert.equal(state.stats.inserted, 1);
});
test('preserva livro manual, ID e avaliações; execução repetida não duplica', async () => {
  const existing = { ...hobbit, _id: 'manual', googleBooksId: undefined, mediaAvaliacoes: 4.2, totalAvaliacoes: 10 };
  const f = fixture([existing]);
  for (let i=0; i<2; i++) await runImport({ ...f, tasks: [task], state: {} });
  assert.equal(f.books.length, 1);
  assert.equal(existing.mediaAvaliacoes, 4.2); assert.equal(existing.totalAvaliacoes, 10); assert.equal(existing._id, 'manual');
  assert.ok(duplicateOf({ ...hobbit, titulo: 'Diferente', isbn: '978-0000000000' }, [{ ...existing, isbn: '9780000000000' }]));
});
test('checkpoint mantém consulta após falha e permite retomar', async () => {
  const f = fixture(), state = {}; let saved = 0;
  const options = { ...f, tasks: [task], state, checkpoint: async () => saved++ };
  await runImport({ ...options, source: { ...f.source, search: async () => { throw new Error('temporary'); } } });
  assert.equal(state.task, 0); assert.equal(state.stats.errors, 1); assert.ok(saved);
  await runImport(options);
  assert.equal(f.books.length, 1); assert.equal(state.complete, true);
});
test('limite interrompe dentro da página e retomada processa restante sem duplicar', async () => {
  const f = fixture(), state = {};
  f.source.search = async () => ({ livros: [hobbit, { ...hobbit, titulo: 'As Duas Torres', googleBooksId: 'towers' }] });
  const options = { ...f, tasks: [{ autor: hobbit.autor }], state };
  await runImport({ ...options, maxNew: 1 });
  assert.equal(f.books.length, 1); assert.equal(state.task, 0);
  await runImport(options);
  assert.equal(f.books.length, 2); assert.equal(state.complete, true);
});
test('simulação e capas inválidas não gravam', async () => {
  const f = fixture();
  await runImport({ ...f, tasks: [task], state: {}, dryRun: true });
  assert.equal(f.books.length, 0);
  await runImport({ ...f, tasks: [task], state: {}, source: { ...f.source, coverAvailable: async () => false } });
  assert.equal(f.books.length, 0);
});
test('backoff recupera falhas temporárias e respeita erros permanentes', async () => {
  let calls=0; const delays=[];
  assert.equal(await retry(async () => { if (++calls<3) throw new Error('temporary'); return 'ok'; }, { sleep: async n => delays.push(n) }), 'ok');
  assert.deepEqual(delays, [1000,2000]);
  await assert.rejects(retry(async () => { const e = new Error(); e.status=404; throw e; }, { sleep: async () => assert.fail() }));
});
test('fontes selecionam edição portuguesa validada em vez do primeiro resultado', async () => {
  const source = createImportSources({ google: { search: async () => ({ livros: [{ ...hobbit, titulo: 'Errado' }, { ...hobbit, titulo: 'The Hobbit', idioma: 'en' }, hobbit] }) }, sleep: async () => {} });
  const result = await source.search(task);
  assert.equal(result.livros.length, 1); assert.equal(result.livros[0].idioma, 'pt');
});

test('Open Library usa metadados de uma edição real sem misturar arrays da obra', async () => {
  const urls=[];
  const source = createImportSources({ sleep: async () => {}, google: { search: async () => { throw Object.assign(new Error('missing key'), { status: 400 }); } }, fetchImpl: async url => {
    urls.push(String(url));
    if (String(url).includes('/search.json')) return Response.json({ docs: [{ key: '/works/OL1W', title: 'O Hobbit', author_name: [hobbit.autor] }] });
    return Response.json({ entries: [
      { key: '/books/OL1M', title: 'The Hobbit', languages: [{ key: '/languages/eng' }], isbn_13: ['9780000000001'], publishers: ['English Publisher'], covers: [123] },
      { key: '/books/OL2M', title: 'O Hobbit', languages: [{ key: '/languages/por' }], isbn_13: ['9780000000002'], publishers: ['Editora Portuguesa'], number_of_pages: 300, covers: [456] },
    ] });
  } });
  const result = await source.search(task);
  const book = result.livros[0];
  assert.equal(book.isbn, '9780000000002'); assert.equal(book.idioma, 'pt');
  assert.equal(book.editora, 'Editora Portuguesa'); assert.ok(book.urlCapa.includes('/456-'));
  assert.equal(book.openLibraryEditionId, '/books/OL2M');
  assert.equal(urls.length, 2);
});

test('descoberta pode pular prioritários sem mudar a lista dos checkpoints antigos', async () => {
  const { enableDiscoveryOnly } = await import('../src/services/catalogImport.js');
  const all = buildTasks({});
  const discovery = buildTasks({ discoveryOnly: true });
  assert.equal(all.length - discovery.length, priorityCatalog.length);
  assert.ok(discovery.every(task => !task.titulo));
  const early = { config: { genres: [] }, task: 52, cursor: 10, page: 2, stats: { inserted: 0 } };
  enableDiscoveryOnly(early);
  assert.equal(early.task, 0); assert.equal(early.cursor, 0); assert.equal(early.page, 0);
  assert.equal(early.config.discoveryOnly, true);
  const later = { config: { genres: [] }, task: priorityCatalog.length + 5, cursor: 40, page: 1 };
  enableDiscoveryOnly(later);
  assert.equal(later.task, 5); assert.equal(later.cursor, 40); assert.equal(later.page, 1);
  enableDiscoveryOnly(later);
  assert.equal(later.task, 5);
});
