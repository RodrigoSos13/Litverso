import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookGenre } from '../src/services/bookGenres.js';
import { normalizeVolume } from '../src/services/googleBooks.js';
import { Book } from '../src/models/Book.js';

test('traduz categorias simples e hierarquias sem alterar nomes próprios', () => {
  for (const [source, expected] of [
    ['Fiction', 'Ficção'], ['Horror tales', 'Contos de terror'],
    ['Fiction / Horror', 'Ficção / Terror'], ['Juvenile Fiction', 'Ficção infantojuvenil'],
    [' Ficção ', 'Ficção'], ['Machado de Assis', 'Machado de Assis'], ['', 'Não informado'],
  ]) {
    assert.equal(normalizeBookGenre(source), expected);
    assert.equal(normalizeBookGenre(expected), expected);
  }
});
test('tradução cobre metadados externos e cadastros pelo modelo', () => {
  const volume = normalizeVolume({ id: 'horror_book', volumeInfo: { title: 'Livro', categories: ['Fiction / Horror'] } });
  assert.equal(volume.genero, 'Terror');
  const book = new Book({ genero: 'Horror' });
  assert.equal(book.genero, 'Terror');
});

test('prefere gêneros específicos entre todas as categorias e rejeita assuntos', async () => {
  const { selectGoogleBookGenre } = await import('../src/services/bookGenres.js');
  assert.equal(selectGoogleBookGenre(['Fiction', 'Fiction / Horror / General']), 'Terror');
  assert.equal(selectGoogleBookGenre(['Mud', 'Juvenile Fiction']), 'Ficção infantojuvenil');
  assert.equal(selectGoogleBookGenre(['England', 'Authors, English']), 'Não informado');
  assert.equal(selectGoogleBookGenre(['Machado de Assis']), 'Não informado');
  assert.equal(selectGoogleBookGenre(['Unknown category']), 'Não informado');
  assert.equal(selectGoogleBookGenre([]), 'Não informado');
  assert.equal(selectGoogleBookGenre([], 'toString'), 'Não informado');
});
test('correções revisadas sobrevivem a novas importações sem classificar pelo autor', async () => {
  const { correctedBookGenre } = await import('../src/services/bookGenres.js');
  assert.equal(correctedBookGenre({ googleBooksId: 'VCVTAAAACAAJ', genero: 'Lama' }), 'Ficção infantojuvenil');
  assert.equal(correctedBookGenre({ googleBooksId: 'RMjM3c6MUkcC', genero: 'Machado de Assis' }), 'Crítica literária');
  assert.equal(normalizeVolume({ id: 'VCVTAAAACAAJ', volumeInfo: { title: 'Stuck in the Mud', categories: ['Mud'] } }).genero, 'Ficção infantojuvenil');
  assert.equal(normalizeVolume({ id: 'another_book', volumeInfo: { title: 'Livro', authors: ['Shirley Jackson'] } }).genero, 'Não informado');
});

test('importação conserva todos os gêneros e deduplica categorias traduzidas', async () => {
  const { selectGoogleBookGenres, normalizeBookGenres } = await import('../src/services/bookGenres.js');
  assert.deepEqual(selectGoogleBookGenres(['Fiction', 'Fiction / Fantasy / Epic', 'Fantasy']), ['Fantasia', 'Fantasia épica', 'Ficção']);
  assert.deepEqual(normalizeBookGenres(['Fantasy', 'Fantasia', 'Não informado']), ['Fantasia']);
  const book = new Book({ titulo: 'Livro', autor: 'Autor', descricao: 'Sinopse', generos: ['Fantasy', 'Fiction'] });
  await book.validate();
  assert.deepEqual([...book.generos], ['Fantasia', 'Ficção']);
  assert.equal(book.genero, 'Fantasia');
});
test('Palavras de Radiância usa fantasia épica sem atribuir gênero a toda obra do autor', () => {
  const volume = normalizeVolume({ id: 'radiancia', volumeInfo: { title: 'Palavras de Radiância', authors: ['Brandon Sanderson'], categories: ['Fiction'] } });
  assert.deepEqual(volume.generos, ['Fantasia', 'Fantasia épica', 'Ficção']);
  assert.equal(volume.genero, 'Fantasia');
});
