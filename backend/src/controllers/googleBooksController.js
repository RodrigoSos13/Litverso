import { blockedAuthor } from "../services/importPolicy.js";
import { Book } from "../models/Book.js";
import { googleBooks, GoogleBooksError, isSupportedLanguage } from "../services/googleBooks.js";

function handleError(error, res) {
  if (error instanceof GoogleBooksError) return res.status(error.status).json({ message: error.message, code: error.code });
  return res.status(503).json({ message: "Não foi possível acessar o catálogo agora. Tente novamente." });
}

export async function searchGoogleBooks(req, res) {
  try {
    const result = req.path === "/google/discover" ? await googleBooks.discover({ startIndex: req.query.startIndex === undefined ? 0 : Number(req.query.startIndex) }) : await googleBooks.search({ query: req.query.q, startIndex: req.query.startIndex === undefined ? 0 : Number(req.query.startIndex), language: req.query.language ?? "pt" });
    const ids = result.livros.map(book => book.googleBooksId);
    const existing = await Book.find({ googleBooksId: { $in: ids } }).select("googleBooksId").lean();
    const saved = new Map(existing.map(book => [book.googleBooksId, String(book._id)]));
    res.json({ ...result, livros: result.livros.map(book => ({ ...book, localId: saved.get(book.googleBooksId) || null })) });
  } catch (error) { handleError(error, res); }
}

export async function importGoogleBook(req, res) {
  try {
    const id = req.body.googleBooksId;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return res.status(400).json({ message: "Selecione um livro válido para adicionar ao catálogo." });
    await Book.init();
    const existing = await Book.findOne({ googleBooksId: id });
    if (existing) {
      if (!isSupportedLanguage(existing.idioma)) return res.status(400).json({ message: "Selecione uma edição em português ou inglês." });
      return res.json(existing);
    }
    const volume = await googleBooks.getVolume(id);
    if (blockedAuthor(volume.autor)) return res.status(400).json({ message: "Autor excluído da importação." });
    if (!isSupportedLanguage(volume.idioma)) return res.status(400).json({ message: "Selecione uma edição em português ou inglês." });
    // Dados vêm do Google, nunca dos metadados enviados pelo navegador.
    // O índice único e o upsert mantêm uma edição por ID, inclusive com pedidos simultâneos.
    const book = await Book.findOneAndUpdate({ googleBooksId: id }, { $setOnInsert: volume }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    res.status(201).json(book);
  } catch (error) {
    if (error.code === 11000) {
      try {
        const book = await Book.findOne({ googleBooksId: req.body.googleBooksId });
        if (book) return res.json(book);
      } catch { /* Responde com mensagem pública abaixo. */ }
    }
    handleError(error, res);
  }
}
