import { rateLimit } from "../auth/emailCodes.js";
import { Router } from "express";
import mongoose from "mongoose";
import { Report } from "../models/Report.js";
import { Post } from "../models/Post.js";
import { Comment } from "../models/Comment.js";
import { Like } from "../models/Like.js";
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Acesso exclusivo para administradores." });
  next();
}
const router = Router();
export async function createReport(req, res) {
  const { tipo, alvo, motivo, detalhes = "" } = req.body;
  if (!["publicacao", "comentario"].includes(tipo) || !mongoose.isValidObjectId(alvo) || !Report.schema.path("motivo").enumValues.includes(motivo) || typeof detalhes !== "string" || detalhes.length > 1000 || (motivo === "outro" && !detalhes.trim())) return res.status(400).json({ message: "Dados da denúncia inválidos." });
  try {
    if (!await rateLimit(`report:${req.user._id}`, 30, 60 * 60000)) return res.status(429).json({ message: "Muitas denúncias. Aguarde antes de enviar novamente." });
    const target = await (tipo === "publicacao" ? Post : Comment).findById(alvo);
    if (!target) return res.status(404).json({ message: "Conteúdo não encontrado." });
    await Report.create({ denunciante: req.user._id, tipo, alvo, motivo, detalhes: detalhes.trim(), conteudo: target.texto, autor: target.usuario, publicacao: tipo === "publicacao" ? target._id : target.publicacao });
    res.status(201).json({ message: "Denúncia enviada para análise. Obrigado por ajudar a comunidade." });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? "Você já denunciou este conteúdo." : "Não foi possível enviar a denúncia." });
  }
}
router.post("/", createReport);
router.use(requireAdmin);
router.get("/", async (req, res) => {
  const status = req.query.status || "pendente";
  if (!["pendente", "descartada", "removida"].includes(status)) return res.status(400).json({ message: "Filtro inválido." });
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  try {
    const [items, total] = await Promise.all([
      Report.find({ status }).populate("denunciante autor moderador", "nome usuario").sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20),
      Report.countDocuments({ status }),
    ]);
    res.json({ items, total, page });
  } catch { res.status(500).json({ message: "Não foi possível carregar as denúncias." }); }
});
export async function resolveReport(req, res) {
  const { acao, decisao = "" } = req.body;
  if (!mongoose.isValidObjectId(req.params.id) || !["descartar", "remover"].includes(acao) || typeof decisao !== "string" || decisao.length > 1000) return res.status(400).json({ message: "Decisão inválida." });
  let claimed;
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Denúncia não encontrada." });
    if (report.status !== "pendente") return res.status(409).json({ message: "Esta denúncia já foi analisada." });
    // Claim the decision before destructive work so only one moderator can act.
    claimed = await Report.findOneAndUpdate({ _id: report._id, status: "pendente" }, { $set: { status: acao === "remover" ? "removida" : "descartada", moderador: req.user._id, decisao: decisao.trim(), resolvidaEm: new Date() } }, { new: true });
    if (!claimed) return res.status(409).json({ message: "Esta denúncia já foi analisada." });
    if (acao === "remover") {
      if (report.tipo === "publicacao") {
        await Post.deleteOne({ _id: report.alvo });
        await Comment.deleteMany({ publicacao: report.alvo });
        await Like.deleteMany({ publicacao: report.alvo });
      } else {
        const comment = await Comment.findOneAndDelete({ _id: report.alvo });
        if (comment) await Post.updateOne({ _id: comment.publicacao, totalComentarios: { $gt: 0 } }, { $inc: { totalComentarios: -1 } });
      }
    }
    res.json(claimed);
  } catch {
    // Allow retry after a failed cleanup without overwriting another decision.
    if (claimed) {
      await Report.updateOne({ _id: claimed._id, moderador: req.user._id, resolvidaEm: claimed.resolvidaEm }, { $set: { status: "pendente", decisao: "" }, $unset: { moderador: "", resolvidaEm: "" } }).catch(() => {});
    }
    res.status(500).json({ message: "Não foi possível concluir a moderação." });
  }
}
router.patch("/:id", resolveReport);
export default router;
