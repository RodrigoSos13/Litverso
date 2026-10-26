import mongoose from "mongoose";
import { Follow } from "../models/Follow.js";
import { publicUser } from "../auth/session.js";
import { Like } from "../models/Like.js";
import { Post } from "../models/Post.js";
import { Reading } from "../models/Reading.js";
import { User } from "../models/User.js";

export async function getUsers(req, res) {
  try {
    const query = String(req.query.q || "").trim().slice(0, 100).replace(/^@/, "");
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = { ...(req.user ? { _id: { $ne: req.user._id } } : {}), ...(query ? { $or: [{ nome: { $regex: escaped, $options: "i" } }, { usuario: { $regex: escaped, $options: "i" } }] } : {}) };
    const users = await User.find(filter).select("nome usuario biografia urlAvatar").sort({ nome: 1, _id: 1 }).limit(30);
    const follows = req.user ? await Follow.find({ seguidor: req.user._id, seguido: { $in: users.map(user => user._id) } }).lean() : [];
    const followers = req.user ? await Follow.find({ seguido: req.user._id, seguidor: { $in: users.map(user => user._id) } }).lean() : [];
    const followsYou = new Set(followers.map(follow => String(follow.seguidor)));
    const following = new Set(follows.map(follow => String(follow.seguido)));
    res.json(users.map(user => ({ ...user.toObject(), seguindo: following.has(String(user._id)), segueVoce: followsYou.has(String(user._id)) })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getUserProfile(req, res) {
  try {
    const user = await User.findById(req.params.id).select("-email");

    if (!user) {
      return res.status(404).json({ message: "Usuario nao encontrado" });
    }

    const [readings, posts] = await Promise.all([
      Reading.find({ usuario: user._id }).populate("livro").sort({ updatedAt: -1 }),
      Post.find({ usuario: user._id })
        .populate("usuario", "nome usuario urlAvatar")
        .populate("livro", "titulo autor urlCapa")
        .sort({ fixadoNoPerfil: -1, createdAt: -1 }),
    ]);

    const likes = req.user ? await Like.find({ usuario: req.user._id, publicacao: { $in: posts.map(post => post._id) } }).select("publicacao").lean() : [];
    const liked = new Set(likes.map(like => String(like.publicacao)));

    const groupedReadings = {
      quero_ler: readings.filter((item) => item.status === "quero_ler"),
      lendo: readings.filter((item) => item.status === "lendo"),
      lido: readings.filter((item) => item.status === "lido"),
    };

    res.json({
      usuario: { ...publicUser(user), ...await followState(req.user?._id, user._id) },
      leituras: groupedReadings,
      posts: posts.map(post => ({ ...post.toObject(), curtido: liked.has(String(post._id)) })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function updateUser(req, res) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, Object.fromEntries(["nome", "biografia", "urlAvatar"].filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]])), {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario nao encontrado" });
    }

    res.json(publicUser(user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function followState(viewer, target) {
  const [totalSeguidores, totalSeguindo, relation, reverseRelation] = await Promise.all([
    Follow.countDocuments({ seguido: target }),
    Follow.countDocuments({ seguidor: target }),
    viewer ? Follow.exists({ seguidor: viewer, seguido: target }) : false,
    viewer ? Follow.exists({ seguidor: target, seguido: viewer }) : false,
  ]);
  return { totalSeguidores, totalSeguindo, seguindo: Boolean(relation), segueVoce: Boolean(reverseRelation) };
}

export async function setFollow(req, res) {
  try {
    const target = req.params.id;
    if (!mongoose.isObjectIdOrHexString(target)) return res.status(400).json({ message: "Perfil inválido." });
    if (String(req.user._id) === target) return res.status(400).json({ message: "Você não pode seguir seu próprio perfil." });
    if (!await User.exists({ _id: target })) return res.status(404).json({ message: "Usuário não encontrado." });
    const relation = { seguidor: req.user._id, seguido: target };
    if (req.method === "PUT") {
      try { await Follow.updateOne(relation, { $setOnInsert: relation }, { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; }
    } else await Follow.deleteOne(relation);
    res.json(await followState(req.user._id, target));
  } catch {
    res.status(500).json({ message: "Não foi possível atualizar o seguimento. Tente novamente." });
  }
}

export async function getConnections(req, res) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: "Perfil inválido." });
    if (!await User.exists({ _id: req.params.id })) return res.status(404).json({ message: "Usuário não encontrado." });
    const following = req.params.kind === "following";
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return res.status(400).json({ message: "Página inválida." });
    const field = following ? "seguido" : "seguidor";
    const relations = await Follow.find({ [following ? "seguidor" : "seguido"]: req.params.id }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 30).limit(31).populate(field, "nome usuario urlAvatar").lean();
    res.json({ users: relations.slice(0, 30).map(item => item[field]).filter(Boolean), hasMore: relations.length > 30 });
  } catch { res.status(503).json({ message: "Não foi possível carregar a lista." }); }
}
