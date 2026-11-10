import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoogleBooksClient, normalizeVolume } from "../src/services/googleBooks.js";

const example = {
  id: "google_test_id",
  volumeInfo: {
    title: "Livro &amp; leitura", authors: ["Autora"], categories: ["Fiction"],
    description: "<p>Uma <b>história</b>.</p><script>bad()</script>",
    imageLinks: { thumbnail: "http://books.google.com/cover.jpg" },
    infoLink: "http://books.google.com/books?id=google_test_id",
    publisher: "Editora", publishedDate: "2024-10-01", pageCount: 250, language: "pt",
    industryIdentifiers: [{ type: "ISBN_10", identifier: "1234567890" }, { type: "ISBN_13", identifier: "9781234567890" }],
    averageRating: 5, ratingsCount: 100,
  },
};

test("normaliza metadados sem misturar avaliações externas com as do litverso", () => {
  const book = normalizeVolume(example);
  assert.equal(book.titulo, "Livro & leitura");
  assert.equal(book.isbn, "9781234567890");
  assert.equal(book.totalPaginas, 250);
  assert.equal(book.anoPublicacao, 2024);
  assert.match(book.urlCapa, /^https:/);
  assert.doesNotMatch(book.descricao, /<|script|bad/);
  assert.equal(book.mediaAvaliacoes, undefined);
  assert.equal(book.totalAvaliacoes, undefined);
});

test("lida com edições incompletas, capas inválidas e links não confiáveis", () => {
  const book = normalizeVolume({ id: "incomplete", volumeInfo: { title: "Livro", pageCount: 0, imageLinks: { thumbnail: "javascript:bad()" }, infoLink: "https://evil.example" } });
  assert.equal(book.autor, "Autor não informado");
  assert.equal(book.urlCapa, "");
  assert.equal(book.totalPaginas, undefined);
  assert.equal(book.googleBooksUrl, "https://books.google.com/books?id=incomplete");
  assert.equal(normalizeVolume({ id: "invalid", volumeInfo: {} }), null);
});

test("busca valida parâmetros, pagina e reutiliza consultas simultâneas", async () => {
  let calls = 0;
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async url => {
    calls++;
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(url.searchParams.get("q"), 'leitura');
    assert.equal(url.searchParams.get("startIndex"), "12");
    assert.equal(url.searchParams.get("maxResults"), "40");
    assert.equal(url.searchParams.get("langRestrict"), "pt");
    return Response.json({ totalItems: 40, items: Array.from({ length: 16 }, (_, index) => ({ ...example, id: `volume_${index}`, volumeInfo: { ...example.volumeInfo, industryIdentifiers: [] } })) });
  } });
  const query = { query: "leitura", startIndex: 12 };
  const [first, second] = await Promise.all([client.search(query), client.search(query)]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(first.nextIndex, 27);
  assert.equal(first.hasMore, true);
  await client.search(query);
  assert.equal(calls, 1);
  await assert.rejects(client.search({ query: "a" }), error => error.status === 400);
  await assert.rejects(client.getVolume("../../evil"), error => error.status === 400);
});

test("falhas e falta de chave retornam mensagens públicas e não ficam no cache", async () => {
  const missing = createGoogleBooksClient({ englishFallback: false, apiKey: () => "" });
  await assert.rejects(missing.search({ query: "test" }), error => error.status === 503 && error.code === "GOOGLE_BOOKS_NOT_CONFIGURED");
  let calls = 0;
  const limited = createGoogleBooksClient({ englishFallback: false, apiKey: () => "private-test-key", fetchImpl: async () => { calls++; return Response.json({ error: "private-test-key" }, { status: 429 }); } });
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(limited.search({ query: "test" }), error => error.status === 503 && !error.message.includes("private-test-key"));
  assert.equal(calls, 2);
  const malformed = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async () => new Response("bad JSON") });
  await assert.rejects(malformed.search({ query: "test" }), error => error.status === 502);
});

test("ISBN digitado com hífens usa a busca específica em português", async () => {
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async url => {
    assert.equal(url.searchParams.get("q"), "isbn:9781234567890");
    assert.equal(url.searchParams.get("langRestrict"), "pt");
    return Response.json({ totalItems: 1, items: [example] });
  } });
  assert.equal((await client.search({ query: "978-1-234-56789-0" })).livros[0].googleBooksId, example.id);
});

test("consulta cancela por timeout e permite resposta sem resultados", async () => {
  const timed = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  await assert.rejects(timed.search({ query: "test" }), error => error.status === 504);
  const empty = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async () => Response.json({ totalItems: 0 }) });
  const result = await empty.search({ query: "test" });
  assert.deepEqual(result.livros, []);
  assert.equal(result.hasMore, false);
});

test("repete falhas temporárias do Google sem repetir erros de credenciais", async () => {
  let calls = 0;
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async () => {
    calls++;
    return calls < 3 ? Response.json({ error: { errors: [{ reason: "backendFailed" }] } }, { status: 503 }) : Response.json({ totalItems: 1, items: [example] });
  } });
  const result = await client.search({ query: "leitura" });
  assert.equal(calls, 3);
  assert.equal(result.livros.length, 1);
  calls = 0;
  const forbidden = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async () => { calls++; return new Response(null, { status: 403 }); } });
  await assert.rejects(forbidden.search({ query: "romance" }), error => error.status === 503);
  assert.equal(calls, 1);
});


test("catálogo rejeita outros idiomas e descarta respostas que desrespeitam o filtro", async () => {
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async () => Response.json({ totalItems: 3, items: [example, { id: "english", volumeInfo: { title: "English edition", language: "en" } }, { id: "unknown", volumeInfo: { title: "Unknown language" } }] }) });
  const result = await client.search({ query: "leitura" });
  assert.deepEqual(result.livros.map(book => book.googleBooksId), [example.id]);
  await assert.rejects(client.search({ query: "test", language: "en" }), error => error.status === 400);
});

test("descoberta pagina ficção em português sem exigir título específico", async () => {
  const volumes = Array.from({ length: 36 }, (_, index) => ({ id: `fiction_${index}`, volumeInfo: { title: `História ${index}`, language: index % 6 === 0 ? "en" : "pt" } }));
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async url => {
    assert.equal(url.searchParams.get("q"), "ficção");
    assert.equal(url.searchParams.get("langRestrict"), "pt");
    const offset = Number(url.searchParams.get("startIndex"));
    return Response.json({ totalItems: volumes.length, items: volumes.slice(offset, offset + 40) });
  } });
  const first = await client.discover();
  const second = await client.discover({ startIndex: first.nextIndex });
  assert.equal(first.livros.length, 15);
  assert.equal(second.livros.length, 15);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.livros, ...second.livros].map(book => book.googleBooksId)).size, 30);
  assert.ok([...first.livros, ...second.livros].every(book => book.idioma === "pt"));
});

test("paginação preenche resultados relevantes em português e continua pelo cursor real", async () => {
  const volumes = Array.from({ length: 55 }, (_, index) => ({ id: `book_${index}`, volumeInfo: {
    title: index % 3 === 0 ? "Outro livro" : `Livro ${index}`,
    authors: [index % 3 === 0 ? "Outro autor" : "Brandon Sanderson"],
    language: index % 3 === 1 ? "en" : "pt",
  } }));
  const offsets = [];
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async url => {
    const offset = Number(url.searchParams.get("startIndex")); offsets.push(offset);
    return Response.json({ totalItems: 1, items: volumes.slice(offset, offset + 40) });
  } });
  const first = await client.search({ query: "Brandon Sanderson" });
  assert.equal(first.livros.length, 15);
  assert.equal(first.nextIndex, 45);
  assert.equal(first.hasMore, true);
  const second = await client.search({ query: "Brandon Sanderson", startIndex: first.nextIndex });
  assert.equal(second.livros.length, 3);
  assert.equal(second.hasMore, false);
  assert.deepEqual(offsets, [0, 40, 45]);
  const combined = [...first.livros, ...second.livros];
  assert.equal(new Set(combined.map(book => book.googleBooksId)).size, 18);
  assert.ok(combined.every(book => book.idioma === "pt" && book.autor === "Brandon Sanderson"));
});

test("limita lotes descartados e permite continuar pelo cursor", async () => {
  const volumes = Array.from({ length: 173 }, (_, index) => ({ id: `scattered_${index}`, volumeInfo: { title: `Livro ${index}`, authors: [index < 160 ? 'Outro autor' : 'Brandon Sanderson'], language: 'pt' } }));
  let calls = 0;
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => 'test-key', fetchImpl: async url => {
    calls++;
    const offset = Number(url.searchParams.get('startIndex'));
    return Response.json({ totalItems: volumes.length, items: volumes.slice(offset, offset + 40) });
  } });
  const result = await client.search({ query: 'Brandon Sanderson' });
  assert.equal(calls, 3);
  assert.equal(result.livros.length, 0);
  assert.equal(result.nextIndex, 120);
  assert.equal(result.hasMore, true);
  const next = await client.search({ query: 'Brandon Sanderson', startIndex: result.nextIndex });
  assert.equal(next.livros.length, 13);
  assert.equal(next.nextIndex, 173);
  assert.equal(next.hasMore, false);
});


test("Stephen King consulta título e autor e preserva livros em português", async () => {
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async url => {
    assert.equal(url.searchParams.get("q"), 'stephen king');
    return Response.json({ totalItems: 3, items: [
      { id: "it_pt", volumeInfo: { title: "It: A coisa", authors: ["Stephen King"], language: "pt" } },
      { id: "shining_pt", volumeInfo: { title: "O iluminado", authors: ["Stephen King"], language: "pt-BR" } },
      { id: "other", volumeInfo: { title: "Outro livro", authors: ["Outro autor"], language: "pt" } },
    ] });
  } });
  const result = await client.search({ query: "stephen king" });
  assert.deepEqual(result.livros.map(book => book.googleBooksId), ["it_pt", "shining_pt"]);
});


test("retorna página completa sem buscar outro lote para confirmar próximo livro", async () => {
  let calls = 0;
  const client = createGoogleBooksClient({ englishFallback: false, apiKey: () => "test-key", fetchImpl: async () => {
    calls++;
    return Response.json({ totalItems: 100, items: Array.from({ length: 40 }, (_, index) => ({
      id: `fast_${index}`, volumeInfo: { title: index < 15 ? "Livro" : "Outro", language: "pt" },
    })) });
  } });
  const result = await client.search({ query: "Livro" });
  assert.equal(calls, 1);
  assert.equal(result.livros.length, 15);
  assert.equal(result.nextIndex, 15);
  assert.equal(result.hasMore, true);
});


test("prioriza português e completa com inglês usando cursor independente", async () => {
  const calls = [];
  const client = createGoogleBooksClient({ apiKey: () => "test-key", fetchImpl: async url => {
    const language = url.searchParams.get("langRestrict");
    const offset = Number(url.searchParams.get("startIndex"));
    calls.push([language, offset]);
    const items = Array.from({ length: language === "pt" ? 2 : 20 }, (_, index) => ({
      id: `${language}_${index}`, volumeInfo: { title: "Livro", language },
    }));
    return Response.json({ totalItems: items.length, items: items.slice(offset, offset + 40) });
  } });
  const first = await client.search({ query: "Livro" });
  assert.equal(first.livros.length, 15);
  assert.deepEqual(first.livros.slice(0, 2).map(book => book.idioma), ["pt", "pt"]);
  assert.ok(first.livros.slice(2).every(book => book.idioma === "en"));
  assert.equal(first.nextIndex, 1014);
  const next = await client.search({ query: "Livro", startIndex: first.nextIndex });
  assert.equal(next.livros.length, 7);
  assert.equal(next.hasMore, false);
  assert.deepEqual(calls, [["pt", 0], ["en", 0], ["en", 13]]);
  assert.equal(new Set([...first.livros, ...next.livros].map(book => book.googleBooksId)).size, 22);
});

test("busca em inglês quando não há português e rejeita outros idiomas", async () => {
  const client = createGoogleBooksClient({ apiKey: () => "test-key", fetchImpl: async url => Response.json({ totalItems: 2, items: url.searchParams.get("langRestrict") === "pt" ? [] : [
    { id: "english", volumeInfo: { title: "Dune", language: "en" } },
    { id: "french", volumeInfo: { title: "Dune", language: "fr" } },
  ] }) });
  assert.deepEqual((await client.search({ query: "Dune" })).livros.map(book => book.googleBooksId), ["english"]);
});

test("não consulta inglês antecipadamente quando português preenche a página", async () => {
  let calls = 0;
  const client = createGoogleBooksClient({ apiKey: () => "test-key", fetchImpl: async url => {
    calls++;
    assert.equal(url.searchParams.get("langRestrict"), "pt");
    return Response.json({ totalItems: 20, items: Array.from({ length: 20 }, (_, index) => ({ id: `pt_${index}`, volumeInfo: { title: "Livro", language: "pt" } })) });
  } });
  assert.equal((await client.search({ query: "Livro" })).livros.length, 15);
  assert.equal(calls, 1);
});


test("preserva português se a consulta complementar em inglês falhar", async () => {
  const client = createGoogleBooksClient({ apiKey: () => "test-key", fetchImpl: async url => {
    if (url.searchParams.get("langRestrict") === "en") return new Response(null, { status: 429 });
    return Response.json({ totalItems: 1, items: [example] });
  } });
  const result = await client.search({ query: "leitura" });
  assert.equal(result.livros[0].googleBooksId, example.id);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextIndex, 1001);
});


test("busca autores por texto livre sem combinar filtros que zeram resultados", async () => {
  for (const author of ["Stephen King", "Machado de Assis"]) {
    const client = createGoogleBooksClient({ apiKey: () => "test-key", fetchImpl: async url => {
      const q = url.searchParams.get("q");
      const portuguese = url.searchParams.get("langRestrict") === "pt";
      const items = q === author && portuguese ? Array.from({ length: 18 }, (_, index) => ({
        id: `author_${index}`, volumeInfo: { title: `Obra ${index}`, authors: [author], language: "pt-BR" },
      })) : [];
      const offset = Number(url.searchParams.get("startIndex"));
      return Response.json({ totalItems: items.length, items: items.slice(offset, offset + 40) });
    } });
    const result = await client.search({ query: author });
    assert.equal(result.livros.length, author === "Machado de Assis" ? 0 : 15);
    assert.ok(result.livros.every(book => book.autor === author));
  }
});


test("falha de um lote posterior preserva livros e permite repetir seu cursor", async () => {
  const client = createGoogleBooksClient({ apiKey: () => "test-key", fetchImpl: async url => {
    if (Number(url.searchParams.get("startIndex")) > 0) return new Response(null, { status: 429 });
    return Response.json({ totalItems: 100, items: [example] });
  } });
  const result = await client.search({ query: "leitura" });
  assert.equal(result.livros.length, 1);
  assert.equal(result.nextIndex, 1);
  assert.equal(result.hasMore, true);
});

test("normaliza espaços após inauthor e mantém filtro exclusivo por autor", async () => {
  const client = createGoogleBooksClient({ apiKey: () => "test-key", englishFallback: false, fetchImpl: async url => {
    assert.equal(url.searchParams.get("q"), "inauthor:Carl Sagan");
    return Response.json({ totalItems: 2, items: [
      { id: "cosmos_sagan", volumeInfo: { title: "Cosmos", authors: ["Carl Sagan"], language: "pt" } },
      { id: "about_sagan", volumeInfo: { title: "Carl Sagan: uma biografia", authors: ["Outro Autor"], language: "pt" } },
    ] });
  } });
  const result = await client.search({ query: "inauthor: Carl Sagan" });
  assert.deepEqual(result.livros.map(book => book.googleBooksId), ["cosmos_sagan"]);
});

test("preserva a sinopse formatada separada do resumo em texto simples", () => {
  const description = '<p>Uma <strong>história</strong> com <em>ênfase</em>.<br>Outra linha.</p>\n<p>Novo parágrafo.</p>';
  const book = normalizeVolume({ ...example, volumeInfo: { ...example.volumeInfo, description } });
  assert.equal(book.descricaoFormatada, description);
  assert.doesNotMatch(book.descricao, /<[^>]*>/);
  assert.equal(normalizeVolume({ id: "empty", volumeInfo: { title: "Livro" } }).descricaoFormatada, "");
  assert.equal(normalizeVolume({ ...example, volumeInfo: { ...example.volumeInfo, description: "x".repeat(21000) } }).descricaoFormatada.length, 20000);
});
