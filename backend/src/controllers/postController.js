import { Like } from "../models/Like.js";
import { Comment } from "../models/Comment.js";
import { Post } from "../models/Post.js";
import { validateUploadedImage } from "../services/uploadedImage.js";

export async function createPost(req, res) {
  try {
    const images = req.body.imagens ?? [];
    if (!Array.isArray(images) || images.length > 4) throw new Error("Envie até 4 fotos.");
    for (const image of images) {
      if (typeof image !== "string" || !image.startsWith("data:")) throw new Error("Envie um arquivo de imagem válido.");
      validateUploadedImage(image);
    }
    if (images.reduce((total, image) => total + Buffer.from(image.split(",")[1], "base64").length, 0) > 10 * 1024 * 1024) throw new Error("As fotos juntas devem ter até 10 MB.");
    if (req.body.urlImagem) validateUploadedImage(req.body.urlImagem);
    if (req.body.tipo === "fanart" && !req.body.urlImagem && !images.length) {
      return res.status(400).json({ message: "Envie uma imagem para publicar sua fanart." });
    }
    const post = await Post.create(req.body);
    const populatedPost = await Post.findById(post._id)
      .populate("usuario", "nome usuario urlAvatar")
      .populate("livro", "titulo autor urlCapa");

    res.status(201).json(populatedPost);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

export async function getPosts(req, res) {
  try {
    const filter = {};
    const query = String(req.query.q || "").trim().slice(0, 100);
    if (query) filter.texto = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

    if (req.query.user) {
      filter.usuario = req.query.user;
    }

    if (req.query.book) {
      filter.livro = req.query.book;
    }

    const posts = await Post.find(filter)
      .populate("usuario", "nome usuario urlAvatar")
      .populate("livro", "titulo autor urlCapa")
      .sort({ createdAt: -1 });

    const likes = req.user ? await Like.find({ usuario: req.user._id, publicacao: { $in: posts.map(post => post._id) } }).select("publicacao").lean() : [];
    const liked = new Set(likes.map(like => String(like.publicacao)));
    res.json(posts.map(post => ({ ...post.toObject(), curtido: liked.has(String(post._id)) })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getPostById(req, res) {
  try {
    const post = await Post.findById(req.params.id)
      .populate("usuario", "nome usuario urlAvatar")
      .populate("livro", "titulo autor urlCapa");

    if (!post) {
      return res.status(404).json({ message: "Publicacao nao encontrada" });
    }

    const comments = await Comment.find({ publicacao: post._id })
      .populate("usuario", "nome usuario urlAvatar")
      .sort({ createdAt: -1 });

    res.json({ post, comentarios: comments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deletePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Publicação não encontrada." });
    if (String(post.usuario) !== String(req.user._id)) return res.status(403).json({ message: "Você só pode apagar suas próprias publicações." });
    await Post.deleteOne({ _id: post._id, usuario: req.user._id });
    await Promise.all([
      Comment.deleteMany({ publicacao: post._id }),
      Like.deleteMany({ publicacao: post._id }),
    ]);
    return res.json({ message: "Publicação apagada." });
  } catch (error) {
    return res.status(error.name === "CastError" ? 400 : 500).json({ message: "Não foi possível apagar a publicação." });
  }
}

export async function pinPost(req, res) {
  try {
    if (typeof req.body.fixadoNoPerfil !== "boolean") return res.status(400).json({ message: "Opção de fixação inválida." });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Publicação não encontrada." });
    if (String(post.usuario) !== String(req.user._id)) return res.status(403).json({ message: "Você só pode fixar suas próprias publicações." });
    post.fixadoNoPerfil = req.body.fixadoNoPerfil;
    await post.save();
    return res.json({ fixadoNoPerfil: post.fixadoNoPerfil });
  } catch (error) {
    return res.status(error.name === "CastError" ? 400 : 500).json({ message: "Não foi possível atualizar a fixação." });
  }
}
