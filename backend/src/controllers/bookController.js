import { Like } from "../models/Like.js";
import { Post } from "../models/Post.js";
import { Reading } from "../models/Reading.js";
import { Book } from "../models/Book.js";
import { isPortuguese, isSupportedLanguage } from "../services/googleBooks.js";
import { indexedBookSearchFilter, localBookSearchFilter } from "../services/bookSearch.js";
import { validateUploadedImage } from "../services/uploadedImage.js";
import { isValidIsbn, normalizeIsbn } from "../services/isbn.js";

export async function createBook(req, res) {
  try {
    const fields = ["titulo", "autor", "genero", "descricao", "urlCapa", "destaque", "totalPaginas", "editora", "anoPublicacao", "idioma", "isbn"];
    const payload = Object.fromEntries(fields.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    if (!isValidIsbn(payload.isbn)) return res.status(400).json({ message: "Informe um ISBN válido de 10 ou 13 dígitos." });
    payload.isbn = normalizeIsbn(payload.isbn);
    if (await Book.exists({ isbnSearch: payload.isbn.toLowerCase() })) return res.status(409).json({ message: "Já existe um livro cadastrado com este ISBN." });
    if (payload.urlCapa) validateUploadedImage(payload.urlCapa);
    if (!payload.idioma) payload.idioma = "pt";
    if (!isSupportedLanguage(payload.idioma)) return res.status(400).json({ message: "O catálogo aceita edições em português ou inglês." });
    payload.idioma = isPortuguese(payload.idioma) ? "pt" : "en";
    const book = await Book.create(payload);
    res.status(201).json(book);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Já existe um livro cadastrado com este ISBN." });
    res.status(400).json({ message: error.message });
  }
}

export async function getBooks(req, res) {
  try {
    const { search, featured } = req.query;
    const filter = { idioma: { $in: [/^pt(?:-(?:br|pt))?$/i, /^portugu[eê]s$/i, /^portuguese$/i, /^en(?:-[a-z]{2})?$/i, /^english$/i, /^ingl[eê]s$/i] } };

    if (featured === "true") {
      filter.destaque = true;
    }

    if (search) {
      if (typeof search !== "string" || search.length > 200 || !search.trim()) return res.status(400).json({ message: "Informe uma busca válida de até 200 caracteres." });
      Object.assign(filter, localBookSearchFilter(search));
    }
    const books = await Book.find(filter).sort({ createdAt: -1 });

    res.json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getCatalog(req, res) {
  try {
    const search = req.query.search ?? "";
    const genre = req.query.genre ?? "";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (typeof genre !== "string" || genre.length > 200 || typeof search !== "string" || search.length > 200 || !Number.isInteger(page) || page < 1 || page > 10000) {
      return res.status(400).json({ message: "Informe uma busca e uma página válidas." });
    }
    const filter = { idioma: { $in: [/^pt(?:-(?:br|pt))?$/i, /^portugu[eê]s$/i, /^portuguese$/i, /^en(?:-[a-z]{2})?$/i, /^english$/i, /^ingl[eê]s$/i] } };
    if (search.trim()) Object.assign(filter, indexedBookSearchFilter(search));
    if (genre.trim()) filter.genero = genre.trim();
    const pageSize = 16;
    const books = await Book.find(filter)
      .select("-searchTokens -titleTokens -authorTokens -isbnSearch -catalogVersion")
      .sort({ catalogLanguageRank: 1, catalogHasCover: -1, _id: 1 })
      .skip((page - 1) * pageSize).limit(pageSize + 1).lean();
    res.json({ livros: books.slice(0, pageSize), page, hasMore: books.length > pageSize });
  } catch {
    res.status(503).json({ message: "Não foi possível consultar o catálogo. Tente novamente." });
  }
}

export async function getBookById(req, res) {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({ message: "Livro nao encontrado" });
    }

    const [posts, readingStats] = await Promise.all([
      Post.find({ livro: book._id })
        .populate("usuario", "nome usuario urlAvatar")
        .sort({ createdAt: -1 }),
      Reading.aggregate([
        { $match: { livro: book._id } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const likes = req.user?._id
      ? await Like.find({ usuario: req.user._id, publicacao: { $in: posts.map(post => post._id) } }).select("publicacao").lean()
      : [];
    const liked = new Set(likes.map(like => String(like.publicacao)));

    res.json({
      livro: book,
      posts: posts.map(post => ({ ...post.toObject(), curtido: liked.has(String(post._id)) })),
      estatisticasLeitura: readingStats,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getGenres(_req, res) {
  try {
    const genres = await Book.distinct("genero", { idioma: { $in: [/^pt(?:-(?:br|pt))?$/i, /^portugu[eê]s$/i, /^portuguese$/i, /^en(?:-[a-z]{2})?$/i, /^english$/i, /^ingl[eê]s$/i] } });
    res.json(genres.filter(value => typeof value === "string" && value.trim()).sort((a, b) => a.localeCompare(b, "pt-BR")));
  } catch {
    res.status(503).json({ message: "Não foi possível carregar os gêneros. Tente novamente." });
  }
}
