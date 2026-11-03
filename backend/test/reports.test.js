import { test } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin, createReport, resolveReport } from "../src/routes/reportRoutes.js";
import { Report } from "../src/models/Report.js";
import { Post } from "../src/models/Post.js";
import { Comment } from "../src/models/Comment.js";
import { AuthLimit } from "../src/auth/emailCodes.js";
import { Like } from "../src/models/Like.js";
const id = "507f1f77bcf86cd799439011";
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
test("admin permission denies guests and ordinary users", () => {
  for (const user of [undefined, {}, { role: "user" }]) {
    const res = response(); requireAdmin({ user }, res, () => assert.fail()); assert.equal(res.code, 403);
  }
  let allowed = false; requireAdmin({ user: { role: "admin" } }, response(), () => { allowed = true; }); assert.ok(allowed);
});
test("report validates targets and stores server-derived author and content", async t => {
  t.mock.method(AuthLimit, "findOneAndUpdate", async () => ({ count: 1 }));
  t.mock.method(Post, "findById", async () => ({ _id: id, usuario: "author", texto: "original" }));
  const create = t.mock.method(Report, "create", async () => ({}));
  const req = { user: { _id: "reporter" }, body: { tipo: "publicacao", alvo: id, motivo: "spam", autor: "fake", conteudo: "fake" } };
  const res = response(); await createReport(req, res); assert.equal(res.code, 201);
  assert.equal(create.mock.calls[0].arguments[0].autor, "author");
  assert.equal(create.mock.calls[0].arguments[0].conteudo, "original");
  req.body.alvo = "bad"; const invalid = response(); await createReport(req, invalid); assert.equal(invalid.code, 400);
  assert.equal(create.mock.callCount(), 1);
});
test("duplicate reports and missing targets return useful errors", async t => {
  t.mock.method(AuthLimit, "findOneAndUpdate", async () => ({ count: 1 }));
  const find = t.mock.method(Comment, "findById", async () => null);
  t.mock.method(Report, "create", async () => { throw { code: 11000 }; });
  const req = { user: { _id: id }, body: { tipo: "comentario", alvo: id, motivo: "spam" } };
  const missing = response(); await createReport(req, missing); assert.equal(missing.code, 404);
  find.mock.mockImplementation(async () => ({ texto: "comment" }));
  const duplicate = response(); await createReport(req, duplicate); assert.equal(duplicate.code, 409);
});
test("removing a post cleans up comments and likes and records moderator", async t => {
  t.mock.method(Report, "findById", async () => ({ _id: id, status: "pendente", tipo: "publicacao", alvo: id }));
  const post = t.mock.method(Post, "deleteOne", async () => ({}));
  const comments = t.mock.method(Comment, "deleteMany", async () => ({}));
  const likes = t.mock.method(Like, "deleteMany", async () => ({}));
  const update = t.mock.method(Report, "findOneAndUpdate", async () => ({ status: "removida" }));
  const res = response(); await resolveReport({ params: { id }, user: { _id: "admin" }, body: { acao: "remover", decisao: "spam" } }, res);
  assert.equal(res.code, 200); assert.equal(post.mock.callCount(), 1); assert.equal(comments.mock.callCount(), 1); assert.equal(likes.mock.callCount(), 1);
  assert.equal(update.mock.calls[0].arguments[1].$set.moderador, "admin");
});
test("dismissal keeps content and resolved reports cannot be changed", async t => {
  const find = t.mock.method(Report, "findById", async () => ({ _id: id, status: "pendente" }));
  const remove = t.mock.method(Post, "deleteOne", async () => assert.fail());
  t.mock.method(Report, "findOneAndUpdate", async () => ({ status: "descartada" }));
  const req = { params: { id }, user: { _id: "admin" }, body: { acao: "descartar" } };
  await resolveReport(req, response()); assert.equal(remove.mock.callCount(), 0);
  find.mock.mockImplementation(async () => ({ status: "removida" }));
  const res = response(); await resolveReport(req, res); assert.equal(res.code, 409);
});

test("other reason requires an explanation", async () => {
  const res = response();
  await createReport({ user: { _id: id }, body: { tipo: "publicacao", alvo: id, motivo: "outro", detalhes: "   " } }, res);
  assert.equal(res.code, 400);
});

test("a competing decision prevents all destructive work", async t => {
  t.mock.method(Report, "findById", async () => ({ _id: id, status: "pendente", tipo: "publicacao", alvo: id }));
  t.mock.method(Report, "findOneAndUpdate", async () => null);
  const remove = t.mock.method(Post, "deleteOne", async () => assert.fail());
  const res = response();
  await resolveReport({ params: { id }, user: { _id: "admin" }, body: { acao: "remover" } }, res);
  assert.equal(res.code, 409);
  assert.equal(remove.mock.callCount(), 0);
});
test("failed removal reopens the report for retry", async t => {
  t.mock.method(Report, "findById", async () => ({ _id: id, status: "pendente", tipo: "publicacao", alvo: id }));
  const resolved = new Date();
  t.mock.method(Report, "findOneAndUpdate", async () => ({ _id: id, resolvidaEm: resolved }));
  t.mock.method(Post, "deleteOne", async () => { throw new Error("database unavailable"); });
  const rollback = t.mock.method(Report, "updateOne", async () => ({}));
  const res = response();
  await resolveReport({ params: { id }, user: { _id: "admin" }, body: { acao: "remover" } }, res);
  assert.equal(res.code, 500);
  assert.equal(rollback.mock.calls[0].arguments[1].$set.status, "pendente");
});
test("report submission is rate limited per authenticated account", async t => {
  t.mock.method(AuthLimit, "findOneAndUpdate", async () => ({ count: 31 }));
  const find = t.mock.method(Post, "findById", async () => assert.fail());
  const res = response();
  await createReport({ user: { _id: id }, body: { tipo: "publicacao", alvo: id, motivo: "spam" } }, res);
  assert.equal(res.code, 429);
  assert.equal(find.mock.callCount(), 0);
});
