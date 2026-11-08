import { test } from "node:test";
import assert from "node:assert/strict";
import { rankRecommendations, recommendationOrder } from "../src/services/recommendations.js";
import { RecommendationProfile, RecommendationSnapshot } from "../src/models/Recommendation.js";
import { Book } from "../src/models/Book.js";
import { Reading } from "../src/models/Reading.js";
import { Follow } from "../src/models/Follow.js";
import { getCatalog } from "../src/controllers/bookController.js";
import { updateRecommendationPreferences } from "../src/controllers/recommendationController.js";

const books = Array.from({ length: 80 }, (_, i) => ({ _id: String(i), titulo: `Livro ${i}`, autor: `Autor ${i % 20}`, generos: [i < 40 ? "Fantasia" : "Romance"], idioma: "pt", urlCapa: "https://example.org/cover" }));
const res = () => ({ status(code) { this.code = code; return this; }, json(data) { this.data = data; } });
const chain = value => ({ select() { return this; }, lean: async () => value });

test("ordem é estável para a mesma visita e varia em uma nova visita, sem perder livros", () => {
  const first = rankRecommendations(books, { seed: "visit-one" });
  assert.deepEqual(first, rankRecommendations(books, { seed: "visit-one" }));
  assert.notDeepEqual(first, rankRecommendations(books, { seed: "visit-two" }));
  assert.equal(new Set(first).size, books.length);
  assert.equal(first.length, books.length);
});

test("livros lidos perdem prioridade mesmo quando há afinidade e interesse social", () => {
  const readings = [{ livro: "0", status: "lido", nota: 5 }];
  const social = Array.from({ length: 10 }, () => ({ livro: "0", status: "quero_ler" }));
  const order = rankRecommendations(books, { seed: "reader", readings, social, searches: ["Livro 0"] });
  assert.equal(order.at(-1), "0");
});

test("notas positivas e listas favorecem gêneros relacionados, sem eliminar descoberta", () => {
  const readings = books.slice(0, 5).map(book => ({ livro: book._id, nota: 5, status: "lido" }));
  const order = rankRecommendations(books, { seed: "affinity", readings });
  const top = order.slice(0, 16).map(id => books.find(b => b._id === id));
  assert.ok(top.filter(b => b.generos[0] === "Fantasia").length > 8);
  assert.ok(order.some(id => books.find(b => b._id === id).generos[0] === "Romance"));
});

test("interesse social favorece o livro; notas baixas dos amigos não contam como indicação", () => {
  const baseline = rankRecommendations(books, { seed: "social" });
  const positive = rankRecommendations(books, { seed: "social", social: [{ livro: "79", nota: 5 }] });
  assert.ok(positive.indexOf("79") < baseline.indexOf("79"));
  assert.deepEqual(rankRecommendations(books, { seed: "social", social: [{ livro: "79", status: "lido", nota: 1 }] }), baseline);
});

test("pesquisas favorecem título e autor relacionados", () => {
  const baseline = rankRecommendations(books, { seed: "search" });
  const interested = rankRecommendations(books, { seed: "search", searches: ["Livro 79"] });
  assert.ok(interested.indexOf("79") < baseline.indexOf("79"));
});

test("diversifica autores nos primeiros resultados", () => {
  const order = rankRecommendations(books, { seed: "diversity" });
  const counts = new Map();
  for (const id of order.slice(0, 8)) {
    const author = books.find(b => b._id === id).autor;
    counts.set(author, (counts.get(author) || 0) + 1);
  }
  assert.ok([...counts.values()].every(count => count <= 2));
});

test("snapshot é isolado pela conta e reutilizado sem recalcular o perfil", async t => {
  const snapshot = { books: ["4", "1"], personalized: true };
  t.mock.method(RecommendationSnapshot, "findOne", filter => {
    assert.equal(filter._id, "owner:visit-one");
    assert.ok(filter.expiresAt.$gt instanceof Date);
    return { lean: async () => snapshot };
  });
  t.mock.method(Book, "find", () => assert.fail("Snapshot não deve ser recalculado"));
  assert.deepEqual(await recommendationOrder({ userId: "owner", seed: "visit-one", languageFilter: {} }), snapshot);
});

test("visitantes recebem variedade sem criar histórico ou snapshot no banco", async t => {
  t.mock.method(Book, "find", () => chain(books));
  t.mock.method(Reading, "find", () => assert.fail("Visitante não acessa leituras"));
  t.mock.method(Follow, "find", () => assert.fail("Visitante não acessa relações"));
  t.mock.method(RecommendationSnapshot, "findOneAndUpdate", () => assert.fail("Visitante não grava snapshot"));
  const result = await recommendationOrder({ seed: "guest-seed", languageFilter: {} });
  assert.equal(result.personalized, false);
  assert.equal(result.books.length, books.length);
});

test("paginação mantém a ordem do snapshot e aplica gênero antes de fatiar", async t => {
  const ids = books.slice(0, 35).map(b => b._id);
  t.mock.method(RecommendationSnapshot, "findOne", () => ({ lean: async () => ({ books: ids, personalized: true }) }));
  let call = 0;
  t.mock.method(Book, "find", filter => {
    if (++call === 1) {
      assert.equal(filter.$or[0].generos, "Fantasia");
      return chain(books.slice(0, 35));
    }
    return chain([...books.filter(b => filter._id.$in.includes(b._id))].reverse());
  });
  const response = res();
  await getCatalog({ query: { seed: "visit-one", genre: "Fantasia", page: "2" }, user: { _id: "owner" } }, response);
  assert.deepEqual(response.data.livros.map(b => b._id), ids.slice(16, 32));
  assert.equal(response.data.hasMore, true);
});

test("rejeita sementes inválidas antes de consultar recomendações", async () => {
  for (const seed of [{ $ne: "" }, "a".repeat(81), "short"]) {
    const response = res();
    await getCatalog({ query: { seed } }, response);
    assert.equal(response.code, 400);
  }
});

test("desativar apaga pesquisas e snapshots somente da própria conta", async t => {
  t.mock.method(RecommendationProfile, "updateOne", async (filter, update) => {
    assert.deepEqual(filter, { _id: "owner" });
    assert.deepEqual(update.$set, { searches: [], enabled: false });
  });
  t.mock.method(RecommendationSnapshot, "deleteMany", async filter => assert.deepEqual(filter, { usuario: "owner" }));
  const response = res();
  await updateRecommendationPreferences({ user: { _id: "owner" }, method: "PUT", body: { enabled: false, usuario: "someone-else" } }, response);
  assert.deepEqual(response.data, { ok: true });
});

test("registro de pesquisas respeita opt-out e limita o histórico a 20 entradas", async t => {
  const calls = [];
  t.mock.method(RecommendationProfile, "updateOne", async (filter, update) => calls.push({ filter, update }));
  const response = res();
  await updateRecommendationPreferences({ user: { _id: "owner" }, method: "POST", body: { search: "Tolkien" } }, response);
  assert.equal(calls[2].filter.enabled, true);
  assert.equal(calls[2].update.$push.searches.$slice, -20);
  assert.equal(calls[2].update.$push.searches.$each[0].term, "Tolkien");
});
