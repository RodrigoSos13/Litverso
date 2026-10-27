import { test } from "node:test";
import assert from "node:assert/strict";
import { getCatalog, getGenres } from "../src/controllers/bookController.js";
import { Book } from "../src/models/Book.js";
const response = () => ({ status(code) { this.code = code; return this; }, json(data) { this.data = data; } });

test("catálogo aplica gênero antes da paginação e combina com a busca", async t => {
  let filter;
  t.mock.method(Book, "find", value => {
    filter = value;
    return { select() { return this; }, sort() { return this; }, skip(value) { assert.equal(value, 16); return this; }, limit() { return this; }, lean: async () => [] };
  });
  const res = response();
  await getCatalog({ query: { genre: "Fantasia", search: "magia", page: "2" } }, res);
  assert.equal(filter.$or[0].generos, "Fantasia");
  assert.ok(Object.keys(filter).length > 2);
  assert.equal(res.data.page, 2);
});

test("catálogo rejeita gênero inválido", async () => {
  for (const genre of [{ $ne: "" }, "a".repeat(201)]) {
    const res = response();
    await getCatalog({ query: { genre } }, res);
    assert.equal(res.code, 400);
  }
});

test("lista os gêneros existentes sem entradas vazias", async t => {
  t.mock.method(Book, "distinct", async (field, filter) => {
    assert.ok(["genero", "generos"].includes(field));
    assert.ok(filter.idioma);
    return ["Romance", "", "Fantasia", " "];
  });
  const res = response();
  await getGenres({}, res);
  assert.deepEqual(res.data, ["Fantasia", "Romance"]);
});
