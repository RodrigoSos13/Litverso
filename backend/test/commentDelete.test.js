import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteComment } from "../src/controllers/commentController.js";
import { Comment } from "../src/models/Comment.js";
import { Post } from "../src/models/Post.js";

const id = "507f1f77bcf86cd799439011";
function response() {
  return { status(code) { this.code = code; return this; }, json(data) { this.data = data; }, end() {} };
}

test("somente o dono da publicação pode apagar comentários", async t => {
  t.mock.method(Comment, "findById", async () => ({ _id: id, publicacao: "livro-post", usuario: "comentarista" }));
  t.mock.method(Post, "findById", () => ({ select: async () => ({ usuario: "autor" }) }));
  const remove = t.mock.method(Comment, "findOneAndDelete", async () => ({ _id: id }));
  const update = t.mock.method(Post, "updateOne", async () => ({}));
  for (const user of ["outro", "comentarista"]) {
    const res = response();
    await deleteComment({ params: { id }, user: { _id: user } }, res);
    assert.equal(res.code, 403);
  }
  assert.equal(remove.mock.callCount(), 0);
  const res = response();
  await deleteComment({ params: { id }, user: { _id: "autor" } }, res);
  assert.equal(res.code, 204);
  assert.deepEqual(update.mock.calls[0].arguments, [{ _id: "livro-post", totalComentarios: { $gt: 0 } }, { $inc: { totalComentarios: -1 } }]);
  remove.mock.mockImplementation(async () => null);
  await deleteComment({ params: { id }, user: { _id: "autor" } }, response());
  assert.equal(update.mock.callCount(), 1);
});

test("rejeita identificadores inválidos e comentários inexistentes", async t => {
  const find = t.mock.method(Comment, "findById", async () => null);
  const invalid = response();
  await deleteComment({ params: { id: "invalid" }, user: { _id: "autor" } }, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(find.mock.callCount(), 0);
  const missing = response();
  await deleteComment({ params: { id }, user: { _id: "autor" } }, missing);
  assert.equal(missing.code, 404);
});
