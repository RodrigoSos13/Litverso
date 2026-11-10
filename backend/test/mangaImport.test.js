import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mangaVolume, mangaCatalog, mangaTasks } from '../src/services/mangaImport.js';
import { duplicateOf, runImport } from '../src/services/catalogImport.js';
import { workKey } from '../src/services/importPolicy.js';
import { Book } from '../src/models/Book.js';
const series = mangaCatalog[0];
const book = { titulo: 'One Piece, Vol. 1', autor: 'Eiichiro Oda', idioma: 'en', googleBooksId: 'manga1', descricao: 'Sinopse.', urlCapa: 'https://books.google.com/cover.jpg', genero: 'Ficção' };
test('valida autor, série e número explícito; define gênero Mangá', async () => {
  const volume = mangaVolume(book, series);
  assert.equal(volume.numeroNaSerie, 1); assert.equal(volume.genero, 'Mangá');
  assert.deepEqual(volume.generos, ['Mangá']);
  const model = new Book(volume); await model.validate(); assert.equal(model.genero, 'Mangá');
  assert.equal(mangaVolume({ ...book, autor: 'Outra Pessoa' }, series), null);
  assert.equal(mangaVolume({ ...book, titulo: 'One Piece' }, series), null);
  assert.equal(mangaVolume({ ...book, titulo: 'One Piece Official Guide Vol. 1' }, series), null);
  assert.equal(mangaVolume({ ...book, titulo: 'One Piece Omnibus 1-3' }, series), null);
  assert.equal(mangaVolume({ ...book, titulo: 'One Piece Novel Vol. 1' }, series), null);
});
test('edições em português e inglês deduplicam sem unir volumes diferentes', () => {
  const en = mangaVolume(book, series);
  const pt = mangaVolume({ ...book, titulo: 'One Piece - Volume 01', idioma: 'pt', googleBooksId: 'other' }, series);
  const two = mangaVolume({ ...book, titulo: 'One Piece - Volume 02', googleBooksId: 'two' }, series);
  assert.ok(duplicateOf(pt, [en])); assert.equal(workKey(pt), workKey(en));
  assert.equal(duplicateOf(two, [en]), undefined); assert.notEqual(workKey(two), workKey(en));
});
test('aliases identificam obras e não separam Naruto Shippuden; spin-offs ficam separados', () => {
  const naruto = mangaCatalog.find(s => s.serie === 'Naruto');
  assert.equal(mangaVolume({ ...book, titulo: 'Naruto Shippuden Vol. 30', autor: 'Masashi Kishimoto' }, naruto).serie, 'Naruto');
  const tokyo = mangaCatalog.find(s => s.serie === 'Tokyo Ghoul');
  assert.equal(mangaVolume({ ...book, titulo: 'Tokyo Ghoul: re Vol. 1', autor: 'Sui Ishida' }, tokyo), null);
  const attack = mangaCatalog.find(s => s.serie === 'Attack on Titan');
  assert.equal(mangaVolume({ ...book, titulo: 'Shingeki no Kyojin Vol. 5', autor: 'Hajime Isayama' }, attack).numeroNaSerie, 5);
});
test('importação de amostra preserva avaliações e permite repetir sem duplicar', async () => {
  const books = []; const tasks = mangaTasks([series]);
  const source = { search: async () => ({ livros: [mangaVolume(book,series), mangaVolume({ ...book, titulo: 'One Piece Vol. 2', googleBooksId: 'two' },series)] }), coverAvailable: async () => true };
  const repository = { list: async () => [...books], insert: async b => { books.push(b); return true; } };
  await runImport({ tasks, source, repository, state: {} });
  assert.equal(books.length, 2);
  books[0].mediaAvaliacoes = 4.5; books[0].totalAvaliacoes = 2;
  await runImport({ tasks, source, repository, state: {} });
  assert.equal(books.length, 2); assert.equal(books[0].mediaAvaliacoes, 4.5);
});

test('não interpreta número do nome da série como volume nem capítulos como livros', () => {
  const mob = mangaCatalog.find(s => s.serie === 'Mob Psycho 100');
  assert.equal(mangaVolume({ ...book, titulo: 'Mob Psycho 100', autor: 'ONE' }, mob), null);
  assert.equal(mangaVolume({ ...book, titulo: 'Mob Psycho 100 Vol. 2', autor: 'ONE' }, mob).numeroNaSerie, 2);
  assert.equal(mangaVolume({ ...book, titulo: 'One Piece Chapter 200' }, series), null);
});
test('partes de JoJo com numeração reiniciada permanecem distintas', () => {
  const jojo = mangaCatalog.find(s => /JoJo/.test(s.serie));
  const a = mangaVolume({ ...book, titulo: "JoJo's Bizarre Adventure Part 1 Phantom Blood Vol. 1", autor: 'Hirohiko Araki' }, jojo);
  const b = mangaVolume({ ...book, googleBooksId: 'part2', titulo: "JoJo's Bizarre Adventure Part 2 Battle Tendency Vol. 1", autor: 'Hirohiko Araki' }, jojo);
  assert.ok(a); assert.ok(b); assert.notEqual(workKey(a), workKey(b)); assert.equal(duplicateOf(a, [b]), undefined);
});

test('roteirista e desenhista conhecidos não duplicam o mesmo volume', () => {
  const death = mangaCatalog.find(s => s.serie === 'Death Note');
  const writer = mangaVolume({ ...book, titulo: 'Death Note Vol. 1', autor: 'Tsugumi Ohba' }, death);
  const artist = mangaVolume({ ...book, titulo: 'Death Note Volume 1', autor: 'Takeshi Obata', googleBooksId: 'artist' }, death);
  assert.ok(duplicateOf(artist, [writer]));
});
