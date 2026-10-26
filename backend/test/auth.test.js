import { createHash } from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import app from "../src/app.js";
import { prepareCatalog, saveCatalogVolumes, syncCatalog } from "../src/services/catalogSync.js";
import { Book } from "../src/models/Book.js";
import { Reading } from "../src/models/Reading.js";
import { Post } from "../src/models/Post.js";
import { Follow } from "../src/models/Follow.js";
import { Like } from "../src/models/Like.js";
import { Comment } from "../src/models/Comment.js";
import { User } from "../src/models/User.js";
import { EmailCode, AuthLimit } from "../src/auth/emailCodes.js";
import { Session } from "../src/auth/session.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
let mongo, directory, server, base, cookie, otherUser, post;
const delivered = new Map();
const realFetch = globalThis.fetch;
const password = "Test-password-123";
async function request(path, { method = "GET", body, session = cookie, origin } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(session ? { Cookie: session } : {}), ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text && JSON.parse(text), cookie: response.headers.get("set-cookie") };
}
before(async () => {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.EMAIL_ENCRYPTION_KEY = "11".repeat(32);
  process.env.EMAIL_LOOKUP_KEY = "22".repeat(32);
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "litverso <test@example.com>";
  process.env.EMAIL_CODE_SECRET = "test-secret-for-codes-at-least-32-characters";
  globalThis.fetch = (url, options) => {
    if (String(url) === "https://api.resend.com/emails") {
      const message = JSON.parse(options.body);
      delivered.set(message.to[0], message.text.match(/\d{8}/)[0]);
      return Promise.resolve(Response.json({ id: "test-message" }));
    }
    return realFetch(url, options);
  };
  directory = await mkdtemp(join(tmpdir(), "litverse-auth-test-"));
  mongo = spawn("mongod", ["--dbpath", directory, "--bind_ip", "127.0.0.1", "--port", "27941", "--nounixsocket"], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MongoDB temporário não iniciou")), 15000);
    mongo.on("error", error => { clearTimeout(timer); reject(error); });
    mongo.on("exit", code => { clearTimeout(timer); reject(new Error(`mongod saiu: ${code}`)); });
    mongo.stdout.on("data", data => { if (data.toString().includes("Waiting for connections")) { clearTimeout(timer); resolve(); } });
  });
  await mongoose.connect("mongodb://127.0.0.1:27941/auth_test");
  await EmailCode.init(); await AuthLimit.init(); await User.init(); await Session.init(); await Book.init();
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  globalThis.fetch = realFetch;
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo && mongo.exitCode === null) { const exited = new Promise(resolve => mongo.once("exit", resolve)); mongo.kill(); await exited; }
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("senhas recebem salt e rejeitam credenciais incorretas", async () => {
  const first = await hashPassword(password);
  assert.notEqual(first, await hashPassword(password));
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(await verifyPassword(password, undefined), false);
});
test("API permite leitura pública e bloqueia escrita anônima e origens externas", async () => {
  assert.equal((await request("/posts", { session: null })).status, 200);
  assert.equal((await request("/posts", { method: "POST", session: null, body: { texto: "Não deve gravar" } })).status, 401);
  assert.equal((await request("/auth/register", { method: "POST", origin: "https://other.example", body: {} })).status, 403);
});
test("cadastro valida dados, cria sessão segura e não expõe senha", async () => {
  assert.equal((await request("/auth/register", { method: "POST", body: { nome: "Test", usuario: "test", email: "test@example.com", senha: "short" } })).status, 400);
  const pending = await request("/auth/register", { method: "POST", body: { nome: "Test", usuario: "test", email: "test@example.com", senha: password } });
  assert.equal(pending.status, 202);
  assert.equal(pending.cookie, null);
  assert.equal(await User.countDocuments({ usuario: "test" }), 0);
  const code = delivered.get("test@example.com");
  const challenge = await EmailCode.findOne({ purpose: "register" });
  assert.ok(code); assert.notEqual(challenge.codeHash, code);
  assert.equal(challenge.payload.email, undefined);
  assert.ok(challenge.payload.emailEncrypted);
  assert.equal(JSON.stringify(challenge).includes("test@example.com"), false);
  assert.equal(JSON.stringify(pending.data).includes(code), false);
  assert.equal((await request("/auth/verify-email", { method: "POST", body: { email: "test@example.com", codigo: code, registrationToken: "a".repeat(64) } })).status, 400);
  const response = await request("/auth/verify-email", { method: "POST", body: { email: "test@example.com", codigo: code, registrationToken: pending.data.registrationToken } });
  assert.equal(response.status, 201);
  assert.equal((await request("/auth/verify-email", { method: "POST", body: { email: "test@example.com", codigo: code, registrationToken: pending.data.registrationToken } })).status, 400);
  assert.equal(response.data.passwordHash, undefined);
  assert.match(response.cookie, /HttpOnly/); assert.match(response.cookie, /SameSite=Lax/);
  cookie = response.cookie.split(";")[0];
  assert.equal((await request("/auth/me")).data.usuario, "test");
  assert.equal((await request("/auth/register", { method: "POST", body: { nome: "Test", usuario: "test", email: "test@example.com", senha: password } })).status, 202);
  const stored = await User.findOne({ usuario: "test" }).select("+passwordHash");
  assert.notEqual(stored.passwordHash, password);
  const raw = await User.collection.findOne({ _id: stored._id });
  assert.equal(raw.email, undefined); assert.ok(raw.emailEncrypted); assert.ok(raw.emailHash);
  assert.equal(JSON.stringify(response.data).includes("emailEncrypted"), false);
  assert.equal(JSON.stringify(response.data).includes("emailHash"), false);
  assert.equal((await User.findById(stored._id)).emailEncrypted, undefined);
  const session = await Session.findOne();
  assert.notEqual(session.token, cookie.split("=")[1]);
});
test("visitar perfil e forjar ID não permite agir como outro usuário", async () => {
  otherUser = await User.create({ nome: "Other", usuario: "other", email: "other@example.com", passwordHash: await hashPassword(password) });
  assert.equal((await request(`/users/${otherUser._id}/profile`)).status, 200);
  assert.equal((await request("/auth/me")).data.usuario, "test");
  const response = await request("/posts", { method: "POST", body: { usuario: otherUser._id, tipo: "opiniao", texto: "Hello" } });
  assert.equal(response.status, 201); assert.equal(response.data.usuario.usuario, "test"); post = response.data;
  assert.equal((await request(`/users/${otherUser._id}`, { method: "PUT", body: { nome: "Forged" } })).status, 403);
  assert.equal((await request(`/likes/${post._id}/${otherUser._id}`, { method: "DELETE" })).status, 403);
  assert.equal((await request("/users", { method: "POST", body: {} })).status, 403);
  const comment = await request("/comments", { method: "POST", body: { publicacao: post._id, usuario: otherUser._id, texto: "Comment" } });
  assert.equal(comment.data.usuario.usuario, "test");
  const like = await request("/likes", { method: "POST", body: { publicacao: post._id, usuario: otherUser._id } });
  assert.equal(like.data.usuario, post.usuario._id);
  const book = await Book.create({ titulo: "Test book", autor: "Author", genero: "Test", descricao: "Test description" });
  const reading = await request("/readings", { method: "POST", body: { usuario: otherUser._id, livro: book._id, status: "lendo", $set: { usuario: otherUser._id } } });
  assert.equal(reading.status, 201);
  assert.equal(reading.data.usuario.usuario, "test");
  const ownEdit = await request(`/users/${post.usuario._id}`, { method: "PUT", body: { nome: "Updated", email: "changed@example.com", passwordHash: "forged", usuario: "other" } });
  assert.equal(ownEdit.status, 200);
  assert.equal(ownEdit.data.usuario, "test");
  assert.equal(ownEdit.data.email, undefined);
});
test("visitantes leem conteúdo público sem dados privados, mas não interagem", async () => {
  const book = await Book.findOne();
  const publicPaths = ["/books", "/books/catalog", "/books/genres", `/books/${book._id}`,
    "/posts", `/posts/${post._id}`, `/comments?post=${post._id}`, "/users",
    `/users/${otherUser._id}/profile`, `/users/${otherUser._id}/followers`, `/users/${otherUser._id}/following`];
  for (const path of publicPaths) {
    const response = await request(path, { session: null });
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(JSON.stringify(response.data), /emailEncrypted|emailHash|passwordHash|authVersion/);
  }
  assert.equal((await request("/posts", { session: "litverse_session=invalid" })).status, 200);
  const publicPost = (await request("/posts", { session: null })).data.find(item => item._id === post._id);
  assert.equal(publicPost.curtido, false);
  const comment = await Comment.findOne({ publicacao: post._id });
  const mutations = [
    ["POST", "/books", { titulo: "Bloqueado" }],
    ["POST", "/books/google/import", { googleBooksId: "test" }],
    ["POST", "/posts", { texto: "Bloqueado" }],
    ["POST", "/comments", { publicacao: post._id, texto: "Bloqueado" }],
    ["POST", "/likes", { publicacao: post._id }],
    ["POST", "/readings", { livro: book._id }],
    ["PATCH", `/posts/${post._id}/pin`, { fixadoNoPerfil: true }],
    ["DELETE", `/posts/${post._id}`, {}],
    ["PUT", `/comments/${comment._id}/like`, {}],
    ["PUT", `/users/${otherUser._id}/follow`, {}],
    ["PUT", `/users/${otherUser._id}`, { nome: "Bloqueado" }],
  ];
  for (const [method, path, body] of mutations) {
    assert.equal((await request(path, { method, body, session: null })).status, 401, `${method} ${path}`);
  }
  for (const path of ["/readings", "/notifications", "/books/google/search?q=King", "/books/google/discover"]) {
    assert.equal((await request(path, { session: null })).status, 401, path);
  }
  assert.equal((await Post.findById(post._id)).texto, "Hello");
});

test("API de leituras valida entradas, protege autoria e recalcula avaliações no CRUD", async () => {
  await Reading.init();
  const book = await Book.create({ titulo: "REST", autor: "Autor", genero: "Teste", descricao: "Livro para testar a API" });
  assert.equal((await request("/readings", { method: "POST", body: { livro: "invalido" } })).status, 400);
  assert.equal((await request("/readings", { method: "POST", body: { livro: new mongoose.Types.ObjectId() } })).status, 404);
  const created = await request("/readings", { method: "POST", body: { livro: book._id, status: "lendo", nota: 4 } });
  assert.equal(created.status, 201);
  const id = created.data._id;
  const foreign = await Reading.create({ usuario: otherUser._id, livro: book._id, nota: 2 });
  assert.equal((await request(`/readings/${id}`, { session: null })).status, 401);
  assert.equal((await request(`/readings/${id}`)).data.livro.titulo, "REST");
  assert.equal((await request("/readings/invalido")).status, 400);
  assert.equal((await request(`/readings/${new mongoose.Types.ObjectId()}`)).status, 404);
  for (const body of [{ nota: 6 }, { nota: "5" }, { status: "outro" }, {}]) {
    assert.equal((await request(`/readings/${id}`, { method: "PATCH", body })).status, 400);
  }
  assert.equal((await request(`/readings/${foreign._id}`, { method: "PATCH", body: { nota: 5 } })).status, 404);
  assert.equal((await request(`/readings/${foreign._id}`, { method: "DELETE" })).status, 404);
  const updated = await request(`/readings/${id}`, { method: "PATCH", body: { status: "lido", nota: 5, usuario: otherUser._id, livro: foreign._id } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.status, "lido");
  assert.equal(updated.data.usuario, created.data.usuario._id);
  assert.equal(updated.data.livro._id, String(book._id));
  assert.equal((await Book.findById(book._id)).mediaAvaliacoes, 3.5);
  assert.equal((await request(`/readings/${id}`, { method: "PATCH", body: { nota: null } })).status, 200);
  assert.equal((await Book.findById(book._id)).mediaAvaliacoes, 2);
  const removed = await request(`/readings/${id}`, { method: "DELETE" });
  assert.equal(removed.status, 204);
  assert.equal(removed.data, "");
  assert.equal((await request(`/readings/${id}`)).status, 404);
  assert.equal((await Book.findById(book._id)).totalAvaliacoes, 1);
  await Reading.deleteOne({ _id: foreign._id });
  const again = await request("/readings", { method: "POST", body: { livro: book._id, nota: 3 } });
  assert.equal((await request(`/readings/${again.data._id}`, { method: "DELETE" })).status, 204);
  assert.equal((await Book.findById(book._id)).totalAvaliacoes, 0);
  assert.equal((await Book.findById(book._id)).mediaAvaliacoes, 0);
});

test("feed e perfil mantêm curtida e comentários após recarregar", async () => {
  const findPost = response => response.data.find(item => item._id === post._id);
  assert.equal(findPost(await request("/posts")).curtido, true);
  const profile = await request(`/users/${post.usuario._id}/profile`);
  assert.equal(profile.data.posts.find(item => item._id === post._id).curtido, true);
  const comments = await request(`/comments?post=${post._id}`);
  assert.ok(comments.data.some(comment => comment.texto === "Comment" && comment.usuario.usuario === "test"));
  assert.equal((await request(`/likes/${post._id}/${post.usuario._id}`, { method: "DELETE" })).status, 200);
  const unliked = findPost(await request("/posts"));
  assert.equal(unliked.curtido, false);
  assert.equal(unliked.totalCurtidas, 0);
});
test("curtidas em comentários persistem, não duplicam e usam o usuário autenticado", async () => {
  const created = await request("/comments", { method: "POST", body: { publicacao: post._id, texto: "Uma boa conversa" } });
  const path = `/comments/${created.data._id}/like`;
  assert.equal(created.data.totalCurtidas, 0);
  const liked = await request(path, { method: "PUT", body: { usuario: otherUser._id } });
  assert.equal(liked.status, 200);
  assert.equal(liked.data.curtido, true);
  assert.equal(liked.data.totalCurtidas, 1);
  const stored = await Comment.findById(created.data._id);
  assert.deepEqual(stored.curtidas.map(String), [String(post.usuario._id)]);
  await Promise.all([request(path, { method: "PUT" }), request(path, { method: "PUT" })]);
  const comments = await request(`/comments?post=${post._id}`);
  const reloaded = comments.data.find(comment => comment._id === created.data._id);
  assert.equal(reloaded.totalCurtidas, 1);
  assert.equal(reloaded.curtido, true);
  assert.equal(reloaded.curtidas, undefined);
  assert.equal((await request(path, { method: "DELETE" })).data.totalCurtidas, 0);
  assert.equal((await request(path, { method: "DELETE" })).data.curtido, false);
  assert.equal((await request(path, { method: "PUT", session: "" })).status, 401);
  assert.equal((await request("/comments/invalid/like", { method: "PUT" })).status, 400);
  assert.equal((await request(`/comments/${new mongoose.Types.ObjectId()}/like`, { method: "PUT" })).status, 404);
});
test("somente o autor apaga publicações, removendo comentários e curtidas", async () => {
  const { Post } = await import("../src/models/Post.js");
  const { Comment } = await import("../src/models/Comment.js");
  const { Like } = await import("../src/models/Like.js");
  const foreign = await Post.create({ usuario: otherUser._id, tipo: "opiniao", texto: "Outro autor" });
  assert.equal((await request(`/posts/${foreign._id}`, { method: "DELETE", body: { usuario: otherUser._id } })).status, 403);
  assert.ok(await Post.findById(foreign._id));
  const own = await request("/posts", { method: "POST", body: { tipo: "opiniao", texto: "Apagar" } });
  const id = own.data._id;
  await request("/comments", { method: "POST", body: { publicacao: id, texto: "Comentário" } });
  await request("/likes", { method: "POST", body: { publicacao: id } });
  assert.equal((await request(`/posts/${id}`, { method: "DELETE", session: null })).status, 401);
  assert.equal((await request(`/posts/${id}`, { method: "DELETE" })).status, 200);
  assert.equal(await Post.findById(id), null);
  assert.equal(await Comment.countDocuments({ publicacao: id }), 0);
  assert.equal(await Like.countDocuments({ publicacao: id }), 0);
  assert.equal((await request(`/posts/${id}`, { method: "DELETE" })).status, 404);
  assert.equal((await request("/posts/invalido", { method: "DELETE" })).status, 400);
});
test("fixação pertence ao autor e coloca posts no topo do perfil", async () => {
  const { Post } = await import("../src/models/Post.js");
  const foreign = await Post.findOne({ usuario: otherUser._id });
  assert.equal((await request(`/posts/${foreign._id}/pin`, { method: "PATCH", body: { fixadoNoPerfil: true } })).status, 403);
  assert.equal((await request(`/posts/${post._id}/pin`, { method: "PATCH", body: { fixadoNoPerfil: "true" } })).status, 400);
  await request("/posts", { method: "POST", body: { tipo: "opiniao", texto: "Mais recente" } });
  assert.equal((await request(`/posts/${post._id}/pin`, { method: "PATCH", body: { fixadoNoPerfil: true } })).status, 200);
  const profile = await request(`/users/${post.usuario._id}/profile`);
  assert.equal(profile.data.posts[0]._id, post._id);
  assert.equal(profile.data.posts[0].fixadoNoPerfil, true);
  assert.equal((await request(`/posts/${post._id}/pin`, { method: "PATCH", body: { fixadoNoPerfil: false } })).data.fixadoNoPerfil, false);
});
test("busca local aplica todos os termos antes de consultar e não retorna sugestões iniciais", async () => {
  const matching = await Book.create({ titulo: "O Caminho dos Reis", autor: "Brandon Sanderson", genero: "Fantasia", descricao: "Livro de teste", idioma: "pt" });
  await Book.create({ titulo: "Dom Casmurro", autor: "Machado de Assis", genero: "Romance", descricao: "Livro de teste", idioma: "pt" });
  const result = await request("/books?search=Brandon%20Sanderson");
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.map(book => book._id), [String(matching._id)]);
  assert.deepEqual((await request("/books?search=autor%20inexistente")).data, []);
  assert.deepEqual((await request("/books?search=%25%25")).data, []);
});
test("cadastro aceita capa enviada e idioma escolhido, e rejeita imagens inválidas", async () => {
  const urlCapa = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII=";
  const body = { titulo: "Uploaded cover", autor: "Test author", genero: "Fantasy", descricao: "á".repeat(20000), idioma: "en", isbn: "9780261102217", urlCapa };
  const created = await request("/books", { method: "POST", body });
  assert.equal(created.status, 201);
  assert.equal(created.data.idioma, "en");
  assert.equal(created.data.urlCapa, urlCapa);
  assert.equal(created.data.catalogHasCover, true);
  const stored = await request(`/books/${created.data._id}`);
  assert.equal(stored.data.livro.urlCapa, urlCapa);
  const portuguese = await request("/books", { method: "POST", body: { ...body, idioma: "pt", isbn: "9788533613379" } });
  assert.equal(portuguese.status, 201);
  assert.equal(portuguese.data.idioma, "pt");
  for (const invalid of ["data:image/png;base64,aGVsbG8=", "data:image/svg+xml;base64,PHN2Zz4=", `data:image/jpeg;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`]) {
    assert.equal((await request("/books", { method: "POST", body: { ...body, isbn: "9780140328721", urlCapa: invalid } })).status, 400);
  }
});

test("cadastro exige ISBN válido e bloqueia duplicatas inclusive em pedidos simultâneos", async () => {
  const body = { titulo: "ISBN test", autor: "Author", genero: "Test", descricao: "Test" };
  for (const isbn of [undefined, "", "123", "9780261102218", "abcdefghij"]) {
    assert.equal((await request("/books", { method: "POST", body: { ...body, isbn } })).status, 400);
  }
  const responses = await Promise.all([
    request("/books", { method: "POST", body: { ...body, isbn: "978-0-14-044913-6" } }),
    request("/books", { method: "POST", body: { ...body, isbn: "9780140449136" } }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(await Book.countDocuments({ isbnSearch: "9780140449136" }), 1);
  const existing = await Book.create({ ...body, isbn: "978-0-14-032872-1" });
  assert.equal((await request("/books", { method: "POST", body: { ...body, isbn: "9780140328721" } })).status, 409);
  await Book.deleteOne({ _id: existing._id });
});

test("Google Books exige login e configuração, importa sem duplicar e preserva avaliações locais", async () => {
  assert.equal((await request("/books/google/search?q=test", { session: null })).status, 401);
  assert.equal((await request("/books/google/import", { method: "POST", session: null, body: { googleBooksId: "test_volume" } })).status, 401);
  const previousKey = process.env.GOOGLE_BOOKS_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.GOOGLE_BOOKS_API_KEY;
    const unavailable = await request("/books/google/search?q=configuration_test");
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.data.code, "GOOGLE_BOOKS_NOT_CONFIGURED");
    process.env.GOOGLE_BOOKS_API_KEY = "test-private-key";
    let upstreamCalls = 0;
    const volume = { id: "test_volume", volumeInfo: { title: "Imported title", authors: ["Imported author"], description: "<p>Imported description</p>", pageCount: 150, publishedDate: "2020", language: "pt", averageRating: 5 } };
    globalThis.fetch = (url, options) => {
      if (String(url).startsWith("https://www.googleapis.com/books/v1/volumes")) {
        upstreamCalls++;
        if (new URL(url).searchParams.get("langRestrict") === "en") return Promise.resolve(Response.json({ totalItems: 0 }));
        return Promise.resolve(Response.json(new URL(url).pathname.endsWith("/test_volume") ? volume : { totalItems: 1, items: [volume] }));
      }
      return originalFetch(url, options);
    };
    const search = await request("/books/google/search?q=Imported&language=pt");
    assert.equal(search.status, 200);
    assert.equal(search.data.livros[0].localId, null);
    assert.equal(JSON.stringify(search.data).includes("test-private-key"), false);
    assert.equal((await request("/books/google/search?q=x")).status, 400);
    assert.equal((await request("/books/google/import", { method: "POST", body: { googleBooksId: "../../invalid" } })).status, 400);
    const [first, second] = await Promise.all([
      request("/books/google/import", { method: "POST", body: { googleBooksId: "test_volume", titulo: "Forged title", mediaAvaliacoes: 5 } }),
      request("/books/google/import", { method: "POST", body: { googleBooksId: "test_volume" } }),
    ]);
    assert.ok([200, 201].includes(first.status));
    assert.ok([200, 201].includes(second.status));
    assert.equal(first.data._id, second.data._id);
    assert.equal(first.data.titulo, "Imported title");
    assert.equal(first.data.totalPaginas, 150);
    assert.equal(first.data.mediaAvaliacoes, 0);
    assert.equal(await Book.countDocuments({ googleBooksId: "test_volume" }), 1);
    assert.equal(upstreamCalls, 3);
    await Book.findByIdAndUpdate(first.data._id, { mediaAvaliacoes: 4, totalAvaliacoes: 1 });
    const again = await request("/books/google/import", { method: "POST", body: { googleBooksId: "test_volume" } });
    assert.equal(again.status, 200);
    assert.equal(again.data.mediaAvaliacoes, 4);
    assert.equal(upstreamCalls, 3);
    const saved = await request("/books/google/search?q=Imported&language=pt");
    assert.equal(saved.data.livros[0].localId, first.data._id);
    assert.equal((await request("/books/google/search?q=test&language=en")).status, 400);
    const english = await Book.create({ titulo: "English", autor: "Author", genero: "Test", descricao: "Test", idioma: "en", googleBooksId: "english_volume" });
    assert.equal((await request("/books/google/import", { method: "POST", body: { googleBooksId: "english_volume" } })).status, 200);
    assert.equal((await request("/books")).data.some(book => book._id === String(english._id)), true);
    assert.equal((await request("/books", { method: "POST", body: { titulo: "English manual", autor: "Author", genero: "Test", descricao: "Test", idioma: "en", isbn: "9780747532743" } })).status, 201);
    const manual = await request("/books", { method: "POST", body: { titulo: "Manual title", autor: "Manual author", genero: "Test", descricao: "Manual description", totalPaginas: 200, editora: "Publisher", isbn: "9780439064873", googleBooksId: "forged_volume" } });
    assert.equal(manual.status, 201);
    assert.equal(manual.data.googleBooksId, undefined);
    assert.equal(manual.data.totalPaginas, 200);
    assert.equal(manual.data.idioma, "pt");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = previousKey;
  }
});

test("catálogo pagina e prioriza português e capas inteiramente no banco", async () => {
  const volumes = Array.from({ length: 20 }, (_, index) => ({ titulo: `Catalog ${index}`, autor: "Catalog Author", genero: "Teste", descricao: "Teste", idioma: index < 17 ? "pt" : "en", urlCapa: index < 5 || index >= 17 ? "https://example.com/cover.jpg" : "" }));
  await Book.create(volumes);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    assert.ok(!String(url).includes("googleapis.com"), "busca local não deve acessar Google");
    return originalFetch(url, options);
  };
  try {
    const first = await request("/books/catalog?search=Catalog%20Author&page=1");
    const second = await request("/books/catalog?search=Catalog%20Author&page=2");
    assert.equal(first.status, 200);
    assert.equal(first.data.livros.length, 16);
    assert.equal(first.data.hasMore, true);
    assert.ok(first.data.livros.every(book => book.idioma === "pt"));
    assert.ok(first.data.livros.slice(0, 5).every(book => book.urlCapa));
    assert.equal(first.data.livros[0].searchTokens, undefined);
    assert.equal(second.data.livros.length, 4);
    assert.equal(second.data.hasMore, false);
    assert.equal(new Set([...first.data.livros, ...second.data.livros].map(book => book._id)).size, 20);
    assert.equal((await request("/books/catalog?search=inauthor:Cat&page=1")).data.livros.length, 16);
    assert.deepEqual((await request("/books/catalog?search=naoexiste")).data.livros, []);
    assert.equal((await request("/books/catalog?page=-1")).status, 400);
    assert.equal((await request("/books/catalog?page=1.5")).status, 400);
    assert.equal((await request("/books/catalog", { session: null })).status, 200);
  } finally { globalThis.fetch = originalFetch; }
});

test("migração torna livros antigos pesquisáveis sem mudar IDs e avaliações", async () => {
  const { insertedId } = await Book.collection.insertOne({ titulo: "Memórias Antigas", autor: "José Antigo", genero: "Teste", descricao: "Original", idioma: "pt", mediaAvaliacoes: 4, totalAvaliacoes: 2, isbn: "978-1234567890" });
  await prepareCatalog();
  const result = await request("/books/catalog?search=Jose%20Antigo");
  assert.equal(result.data.livros[0]._id, String(insertedId));
  assert.equal(result.data.livros[0].mediaAvaliacoes, 4);
  assert.equal((await request("/books/catalog?search=9781234567890")).data.livros[0]._id, String(insertedId));
});

test("sincronização reutiliza IDs, preserva avaliações e evita duplicar ISBN manual", async () => {
  const volume = { googleBooksId: "synced_volume", titulo: "Primeiro título", autor: "Autor Sync", genero: "Teste", descricao: "Descrição", idioma: "pt", isbn: "9781111111111", urlCapa: "https://example.com/first-cover.jpg" };
  assert.equal((await saveCatalogVolumes([volume])).inserted, 1);
  const stored = await Book.findOne({ googleBooksId: volume.googleBooksId });
  await Book.updateOne({ _id: stored._id }, { $set: { mediaAvaliacoes: 4, totalAvaliacoes: 3 } });
  assert.equal((await saveCatalogVolumes([{ ...volume, titulo: "Título atualizado", urlCapa: "https://example.com/cover.jpg" }])).updated, 1);
  const updated = await Book.findById(stored._id);
  assert.equal(updated.mediaAvaliacoes, 4);
  assert.equal(updated.totalAvaliacoes, 3);
  assert.equal(updated.titulo, "Título atualizado");
  assert.ok(updated.catalogHasCover);
  assert.equal(await Book.countDocuments({ googleBooksId: volume.googleBooksId }), 1);
  await Book.create({ titulo: "Manual", autor: "Manual", genero: "Teste", descricao: "Manual", isbn: "9782222222222" });
  await saveCatalogVolumes([{ ...volume, googleBooksId: "manual_duplicate", isbn: "9782222222222" }]);
  assert.equal(await Book.countDocuments({ isbn: "9782222222222" }), 1);
});

test("sincronização descarta livros sem capa e preserva a capa de livros existentes", async () => {
  const volume = { googleBooksId: "cover_required", titulo: "Livro com capa", autor: "Autor", genero: "Teste", descricao: "Descrição", idioma: "pt", urlCapa: "https://example.com/cover.jpg" };
  for (const urlCapa of [undefined, null, "", "   "]) {
    assert.deepEqual(await saveCatalogVolumes([{ ...volume, urlCapa }]), { inserted: 0, updated: 0 });
  }
  assert.equal(await Book.countDocuments({ googleBooksId: volume.googleBooksId }), 0);
  await saveCatalogVolumes([volume]);
  assert.deepEqual(await saveCatalogVolumes([{ ...volume, urlCapa: "" }]), { inserted: 0, updated: 0 });
  assert.equal((await Book.findOne({ googleBooksId: volume.googleBooksId })).urlCapa, volume.urlCapa);
});

test("sincronização retoma cursor e mantém progresso após falha externa", async () => {
  const offsets = [];
  const client = { search: async ({ startIndex }) => { offsets.push(startIndex); return { livros: [], nextIndex: startIndex + 40, hasMore: true }; } };
  const options = { queries: ["Autor Cursor"], pagesPerQuery: 1, client, report: () => {} };
  await syncCatalog(options);
  await syncCatalog({ ...options, client: { search: async () => { throw new Error("offline"); } } });
  await syncCatalog(options);
  assert.deepEqual(offsets, [0, 40]);
});

test("somente um processo sincroniza o catálogo por vez", async () => {
  let release;
  let announce;
  const started = new Promise(resolve => { announce = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = syncCatalog({ queries: ["Autor Trava"], pagesPerQuery: 1, report: () => {}, client: { search: async () => {
    announce();
    await gate;
    return { livros: [], nextIndex: 0, hasMore: false };
  } } });
  await started;
  try {
    const second = await syncCatalog({ queries: ["Autor Trava"], report: () => {} });
    assert.equal(second.busy, true);
  } finally { release(); await first; }
});

test("seguidores, seguindo e notificações respeitam a conta autenticada", async () => {
  await Follow.init();
  const ownId = String(post.usuario._id);
  const target = String(otherUser._id);
  assert.equal((await request(`/users/${target}/follow`, { method: "PUT" })).status, 200);
  assert.equal((await request(`/users/${target}/follow`, { method: "PUT" })).status, 200);
  const following = await request(`/users/${ownId}/following`);
  assert.ok(following.data.users.some(user => user._id === target));
  assert.equal((await request(`/users/${target}/followers`)).data.users.filter(user => user._id === ownId).length, 1);
  await Follow.create({ seguidor: target, seguido: ownId });
  const ownPost = await Post.create({ usuario: ownId, tipo: "opiniao", texto: "Notificações" });
  await Like.create({ usuario: target, publicacao: ownPost._id });
  await Comment.create({ usuario: target, publicacao: ownPost._id, texto: "Boa leitura!" });
  await Comment.create({ usuario: ownId, publicacao: ownPost._id, texto: "Obrigado!" });
  const notifications = await request("/notifications");
  assert.equal(notifications.status, 200);
  for (const tipo of ["follow", "like", "comment"]) assert.ok(notifications.data.items.some(item => item.tipo === tipo && item.ator._id === target));
  assert.ok(notifications.data.items.every(item => item.ator._id !== ownId));
  const followerNotification = notifications.data.items.find(item => item.tipo === "follow");
  assert.equal(followerNotification.lida, false);
  const readUrl = `/notifications/${followerNotification._id}/read`;
  assert.equal((await request(readUrl, { method: "PATCH" })).status, 200);
  let refreshed = await request("/notifications");
  assert.equal(refreshed.data.unread, notifications.data.unread - 1);
  assert.equal(refreshed.data.items.find(item => item._id === followerNotification._id).lida, true);
  assert.ok(refreshed.data.items.some(item => item.tipo === "comment" && !item.lida));
  assert.equal((await request(readUrl, { method: "PATCH" })).status, 200);
  refreshed = await request("/notifications");
  assert.equal(refreshed.data.unread, notifications.data.unread - 1);
  assert.equal((await request("/notifications/invalid/read", { method: "PATCH" })).status, 400);
  const foreignFollow = await Follow.findOne({ seguidor: ownId, seguido: target });
  assert.equal((await request(`/notifications/follow-${foreignFollow._id}/read`, { method: "PATCH" })).status, 404);
  assert.equal((await request(readUrl, { method: "PATCH", session: "" })).status, 401);

  assert.equal((await request(`/notifications/read?before=${encodeURIComponent(notifications.data.checkedAt)}`, { method: "PATCH" })).status, 200);
  assert.equal((await request("/notifications")).data.unread, 0);
  assert.equal((await request("/notifications", { session: "" })).status, 401);
  assert.equal((await request("/notifications/read?before=invalid", { method: "PATCH" })).status, 400);
  assert.equal((await request(`/users/${ownId}/following?page=-1`)).status, 400);
  await request(`/users/${target}/follow`, { method: "DELETE" });
  assert.equal((await request(`/users/${ownId}/following`)).data.users.length, 0);
});

test("logout revoga token; login valida senha e renova sessão", async () => {
  const previous = cookie;
  assert.equal((await request("/auth/logout", { method: "POST" })).status, 204);
  assert.equal((await request("/auth/me", { session: previous })).status, 401);
  assert.equal((await request("/auth/login", { method: "POST", body: { identificador: "test", senha: "wrong" } })).status, 401);
  const response = await request("/auth/login", { method: "POST", body: { identificador: "TEST@EXAMPLE.COM", senha: password } });
  assert.equal(response.status, 200); cookie = response.cookie.split(";")[0];
  const refreshed = await request("/auth/login", { method: "POST", body: { identificador: "test", senha: password } });
  assert.equal(refreshed.status, 200);
  assert.equal((await request("/auth/me")).status, 401);
  cookie = refreshed.cookie.split(";")[0];
  await Session.updateMany({}, { expiresAt: new Date(0) });
  assert.equal((await request("/auth/me")).status, 401);
});

test("recuperação não enumera contas, valida códigos e revoga todas as sessões", async () => {
  const existing = await request("/auth/forgot-password", { method: "POST", body: { email: "test@example.com" } });
  const missing = await request("/auth/forgot-password", { method: "POST", body: { email: "missing@example.com" } });
  assert.equal(existing.status, 202); assert.deepEqual(existing.data, missing.data);
  assert.equal(delivered.has("missing@example.com"), false);
  const code = delivered.get("test@example.com");
  const reset = codigo => request("/auth/reset-password", { method: "POST", body: { email: "test@example.com", codigo, senha: "New-password-123" } });
  assert.equal((await reset("abcdefgh")).status, 400);
  assert.equal((await reset(code === "00000000" ? "11111111" : "00000000")).status, 400);
  const logged = await request("/auth/login", { method: "POST", body: { identificador: "test", senha: password } });
  const active = logged.cookie.split(";")[0];
  const results = await Promise.all([reset(code), reset(code)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  assert.equal((await request("/auth/me", { session: active })).status, 401);
  assert.equal((await request("/auth/login", { method: "POST", body: { identificador: "test", senha: password } })).status, 401);
  assert.equal((await request("/auth/login", { method: "POST", body: { identificador: "test", senha: "New-password-123" } })).status, 200);
});

test("códigos expiram, têm cinco tentativas e reenvio não burla o limite", async () => {
  const { issueCode, consumeCode } = await import("../src/auth/emailCodes.js");
  const email = "limits@example.com";
  const token = "b".repeat(64);
  await issueCode(email, "register", { nome: "Test", registrationTokenHash: createHash("sha256").update(token).digest("hex") });
  const code = delivered.get(email);
  await issueCode(email, "register", { nome: "Other" });
  assert.equal(delivered.get(email), code);
  for (let i = 0; i < 5; i++) assert.equal(await consumeCode(email, "register", "invalid", token), null);
  assert.equal(await consumeCode(email, "register", code, token), null);
  assert.equal((await EmailCode.findOne({ "payload.nome": "Test" })).attempts, 5);
  await EmailCode.updateMany({ purpose: "register" }, { sentAt: new Date(0) });
  await issueCode(email, "register", { registrationTokenHash: createHash("sha256").update(token).digest("hex") });
  await EmailCode.updateMany({ purpose: "register" }, { expiresAt: new Date(0) });
  assert.equal(await consumeCode(email, "register", delivered.get(email), token), null);
});

test("falha de envio não confirma conta e remove código não entregue", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (url, options) => String(url) === "https://api.resend.com/emails" ? Promise.resolve(Response.json({}, { status: 500 })) : original(url, options);
  try {
    const response = await request("/auth/register", { method: "POST", body: { nome: "Fail", usuario: "fail", email: "fail@example.com", senha: password } });
    assert.equal(response.status, 503);
    assert.equal(await User.countDocuments({ usuario: "fail" }), 0);
    assert.equal(await EmailCode.countDocuments({ "payload.usuario": "fail" }), 0);
  } finally { globalThis.fetch = original; }
});

test("migração protege contas antigas e cadastros pendentes sem alterar IDs ou senhas", async () => {
  const { prepareEmailStorage } = await import("../src/auth/migrateEmails.js");
  const { emailHash, decryptEmail } = await import("../src/auth/emailPrivacy.js");
  // Simulate the old unique index and multiple plaintext accounts.
  // Existing new users need distinct placeholder legacy emails only for this fixture.
  for await (const user of User.collection.find({})) {
    const email = decryptEmail(user.emailEncrypted);
    await User.collection.updateOne({ _id: user._id }, { $set: { email } });
  }
  await User.collection.createIndex({ email: 1 }, { unique: true });
  const legacyHash = await hashPassword(password);
  const first = await User.collection.insertOne({ nome: "Legacy", usuario: "legacy", email: "legacy@example.com", passwordHash: legacyHash });
  const second = await User.collection.insertOne({ nome: "Legacy2", usuario: "legacy2", email: "legacy2@example.com", passwordHash: legacyHash });
  const pending = await EmailCode.collection.insertOne({ key: "legacy-test", purpose: "register", payload: { email: "pending@example.com", nome: "Pending", passwordHash: legacyHash } });
  await prepareEmailStorage();
  for (const id of [first.insertedId, second.insertedId]) {
    const raw = await User.collection.findOne({ _id: id });
    assert.equal(raw.email, undefined); assert.equal(raw.passwordHash, legacyHash);
    assert.equal(raw.emailHash, emailHash(decryptEmail(raw.emailEncrypted)));
  }
  const code = await EmailCode.collection.findOne({ _id: pending.insertedId });
  assert.equal(code.payload.email, undefined);
  assert.equal(decryptEmail(code.payload.emailEncrypted), "pending@example.com");
  assert.deepEqual(await prepareEmailStorage(), { users: 0, pending: 0 });
  const logged = await request("/auth/login", { method: "POST", body: { identificador: "LEGACY@EXAMPLE.COM", senha: password } });
  assert.equal(logged.status, 200);
  await assert.rejects(User.create({ nome: "Duplicate", usuario: "duplicate", email: "LEGACY@example.com" }), error => error.code === 11000);
  const previous = process.env.EMAIL_LOOKUP_KEY;
  try { process.env.EMAIL_LOOKUP_KEY = "33".repeat(32); await assert.rejects(prepareEmailStorage()); }
  finally { process.env.EMAIL_LOOKUP_KEY = previous; }
});

test("Gmail HTTPS confirma cadastro, recupera senha e descarta código quando envio falha", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["EMAIL_PROVIDER", "GMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { EMAIL_PROVIDER: "gmail", GMAIL_USER: "litverso@example.com", GMAIL_CLIENT_ID: "integration-client", GMAIL_CLIENT_SECRET: "integration-secret", GMAIL_REFRESH_TOKEN: "integration-refresh" });
  let deliveredCode;
  let fail = false;
  globalThis.fetch = (url, options) => {
    if (String(url) === "https://oauth2.googleapis.com/token") return Promise.resolve(Response.json({ access_token: "test-access", expires_in: 3600 }));
    if (String(url) === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      if (fail) return Promise.resolve(Response.json({}, { status: 503 }));
      const mime = Buffer.from(JSON.parse(options.body).raw, "base64url").toString("utf8");
      const encoded = /Content-Type: text\/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/.exec(mime)[1];
      const body = Buffer.from(encoded, "base64").toString("utf8");
      deliveredCode = body.match(/\d{8}/)[0];
      return Promise.resolve(Response.json({ id: "gmail-sent" }));
    }
    return originalFetch(url, options);
  };
  try {
    const email = "gmail-user@outlook.com";
    const pending = await request("/auth/register", { method: "POST", body: { nome: "Gmail", usuario: "gmailuser", email, senha: password } });
    assert.equal(pending.status, 202);
    assert.ok(deliveredCode);
    const verified = await request("/auth/verify-email", { method: "POST", body: { email, codigo: deliveredCode, registrationToken: pending.data.registrationToken } });
    assert.equal(verified.status, 201);
    assert.equal((await request("/auth/forgot-password", { method: "POST", body: { email } })).status, 202);
    assert.equal((await request("/auth/reset-password", { method: "POST", body: { email, codigo: deliveredCode, senha: "New-gmail-password-123" } })).status, 200);
    assert.equal((await request("/auth/me", { session: verified.cookie.split(";")[0] })).status, 401);
    fail = true;
    assert.equal((await request("/auth/register", { method: "POST", body: { nome: "Fail Gmail", usuario: "gmailfail", email: "gmail-fail@example.com", senha: password } })).status, 503);
    assert.equal(await User.countDocuments({ usuario: "gmailfail" }), 0);
    assert.equal(await EmailCode.countDocuments({ "payload.usuario": "gmailfail" }), 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

test("limite de tentativas bloqueia abuso da autenticação", async () => {
  let response;
  for (let index = 0; index < 21; index++) response = await request("/auth/login", { method: "POST", body: {} });
  assert.equal(response.status, 429);
});
