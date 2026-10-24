import mongoose from "mongoose";
import { Comment } from "../models/Comment.js";
import { Post } from "../models/Post.js";

function presentComment(comment, userId) {
  const { curtidas = [], ...data } = comment.toObject();
  return { ...data, totalCurtidas: curtidas.length, curtido: curtidas.some(id => String(id) === String(userId)) };
}

export async function updateCommentLike(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Comentário inválido." });
  try {
    const update = req.method === "PUT" ? { $addToSet: { curtidas: req.user._id } } : { $pull: { curtidas: req.user._id } };
    const comment = await Comment.findByIdAndUpdate(req.params.id, update, { new: true }).populate("usuario", "nome usuario urlAvatar");
    if (!comment) return res.status(404).json({ message: "Comentário não encontrado." });
    res.json(presentComment(comment, req.user._id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createComment(req, res) {
  try {
    const comment = await Comment.create(req.body);
    await Post.findByIdAndUpdate(req.body.publicacao, { $inc: { totalComentarios: 1 } });

    const populatedComment = await Comment.findById(comment._id).populate(
      "usuario",
      "nome usuario urlAvatar"
    );

    res.status(201).json(presentComment(populatedComment, req.user._id));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

export async function getComments(req, res) {
  try {
    const filter = req.query.post ? { publicacao: req.query.post } : {};

    const comments = await Comment.find(filter)
      .populate("usuario", "nome usuario urlAvatar")
      .sort({ createdAt: -1 });

    res.json(comments.map(comment => presentComment(comment, req.user._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteComment(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Comentário inválido." });
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: "Comentário não encontrado." });
    const post = await Post.findById(comment.publicacao).select("usuario");
    if (!post || String(post.usuario) !== String(req.user._id)) {
      return res.status(403).json({ message: "Apenas o dono da publicação pode apagar este comentário." });
    }
    const deleted = await Comment.findOneAndDelete({ _id: comment._id });
    if (deleted) {
      await Post.updateOne({ _id: comment.publicacao, totalComentarios: { $gt: 0 } }, { $inc: { totalComentarios: -1 } });
    }
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
