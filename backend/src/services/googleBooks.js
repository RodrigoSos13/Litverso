import { selectGoogleBookGenres } from "./bookGenres.js";
import { matchesBookSearch, parseBookSearch } from "./bookSearch.js";
const API_ROOT = "https://www.googleapis.com/books/v1/volumes";
const PAGE_SIZE = 15;
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export const isPortuguese = language => typeof language === "string" && ["pt", "pt-br", "pt-pt", "português", "portugues", "portuguese"].includes(language.trim().toLowerCase());

export const isEnglish = language => typeof language === "string" && /^(?:en(?:-[a-z]{2})?|english|inglês|ingles)$/i.test(language.trim());
export const isSupportedLanguage = language => isPortuguese(language) || isEnglish(language);

export class GoogleBooksError extends Error {
  constructor(message, status = 502, code = "GOOGLE_BOOKS_UNAVAILABLE") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function plainText(value, maxLength = 20000) {
  if (typeof value !== "string") return "";
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, entity) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[entity])
    .replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function httpsUrl(value, allowedHost) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    if (allowedHost && !allowedHost(url.hostname)) return "";
    url.protocol = "https:";
    return url.toString();
  } catch { return ""; }
}

export function normalizeVolume(volume) {
  const info = volume?.volumeInfo;
  if (!validId(volume?.id) || !info || !plainText(info.title)) return null;
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
  const isbn = identifiers.find(item => item.type === "ISBN_13") || identifiers.find(item => item.type === "ISBN_10");
  const year = /^\d{4}/.exec(info.publishedDate || "");
  const generos = selectGoogleBookGenres(Array.isArray(info.categories) ? info.categories.map(category => plainText(category, 200)) : [], volume.id, { titulo: info.title, autor: info.authors?.join(", ") });
  return {
    googleBooksId: volume.id,
    titulo: plainText(info.title, 500),
    autor: Array.isArray(info.authors) ? info.authors.map(author => plainText(author, 200)).filter(Boolean).join(", ") || "Autor não informado" : "Autor não informado",
    genero: generos[0],
    generos,
    descricaoFormatada: typeof info.description === "string" ? info.description.slice(0, 20000) : "",
    descricao: plainText(info.description) || "Sinopse não disponível para esta edição.",
    urlCapa: httpsUrl(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
    editora: plainText(info.publisher, 300),
    idioma: plainText(info.language, 30),
    isbn: plainText(isbn?.identifier, 30),
    ...(Number.isInteger(info.pageCount) && info.pageCount > 0 ? { totalPaginas: info.pageCount } : {}),
    ...(year ? { anoPublicacao: Number(year[0]) } : {}),
    googleBooksUrl: httpsUrl(info.infoLink, host => ["books.google.com", "books.google.com.br"].includes(host)) || `https://books.google.com/books?id=${encodeURIComponent(volume.id)}`,
  };
}

export function createGoogleBooksClient({ fetchImpl = (...args) => fetch(...args), apiKey = () => process.env.GOOGLE_BOOKS_API_KEY, timeoutMs = 8000, englishFallback = true } = {}) {
  const cache = new Map();
  const pending = new Map();

  async function request(path, params = {}) {
    const key = apiKey()?.trim();
    if (!key) throw new GoogleBooksError("A busca externa ainda não está disponível. Você pode consultar o catálogo ou cadastrar um livro manualmente.", 503, "GOOGLE_BOOKS_NOT_CONFIGURED");
    const url = new URL(API_ROOT + path);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    url.searchParams.set("key", key);
    const cacheKey = url.toString();
    const now = Date.now();
    for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id);
    if (cache.has(cacheKey)) return cache.get(cacheKey).data;
    if (pending.has(cacheKey)) return pending.get(cacheKey);

    const operation = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
          response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
          if (![500, 502, 503, 504].includes(response.status) || attempt === 2) break;
          await response.body?.cancel();
          await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
          if (controller.signal.aborted) throw new Error("Timeout");
        }
        if (response.status === 404) throw new GoogleBooksError("Este livro não está mais disponível no Google Books.", 404, "GOOGLE_BOOKS_NOT_FOUND");
        if ([403, 429].includes(response.status)) throw new GoogleBooksError("O Google Books está indisponível ou atingiu o limite de consultas. Tente novamente mais tarde.", 503);
        if (!response.ok) throw new GoogleBooksError("O Google Books não conseguiu concluir esta busca. Tente outro título ou tente novamente em instantes.", 503);
        const data = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data) || data.error) throw new GoogleBooksError("O Google Books retornou uma resposta inválida.");
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { data, expires: Date.now() + 5 * 60 * 1000 });
        return data;
      } catch (error) {
        if (error instanceof GoogleBooksError) throw error;
        throw new GoogleBooksError(controller.signal.aborted ? "A consulta ao Google Books demorou demais. Tente novamente." : "Não foi possível conectar ao Google Books. Tente novamente.", controller.signal.aborted ? 504 : 502);
      } finally { clearTimeout(timer); }
    })();
    pending.set(cacheKey, operation);
    try { return await operation; }
    finally { pending.delete(cacheKey); }
  }

  return {
    async search({ query, startIndex = 0, language = "pt", maxBatches = 3, matchResults = true, pageSize = PAGE_SIZE }) {
      if (typeof query !== "string" || query.trim().length < 2 || query.length > 200 || !Number.isInteger(startIndex) || startIndex < 0 || startIndex > 2001 || language !== "pt") throw new GoogleBooksError("Informe uma busca válida de 2 a 200 caracteres. O catálogo prioriza português e aceita inglês.", 400, "INVALID_SEARCH");
      const term = query.trim();
      const parsed = parseBookSearch(term);
      const isbn = term.replace(/[\s-]/g, "");
      // Consultas combinando intitle/inauthor com OR retornam zero para autores
      // disponíveis. Use texto livre e valide título/autor nos metadados abaixo.
      const q = parsed.field ? `${parsed.field}:${parsed.field === "isbn" ? parsed.compact : parsed.term.trim()}`
        : /^(?:\d{9}[\dXx]|\d{13})$/.test(isbn) ? `isbn:${isbn}` : term;
      const books = [];
      const ids = new Set();
      const isbns = new Set();
      const english = startIndex >= 1001;
      const languageOffset = english ? 1001 : 0;
      let cursor = startIndex - languageOffset;
      let remaining = false;
      const deadline = Date.now() + 45000;
      for (let batch = 0; batch < maxBatches && cursor <= 1000 && Date.now() < deadline; batch++) {
        let data;
        try {
          data = await request("", { q, startIndex: cursor, maxResults: 40, printType: "books", langRestrict: english ? "en" : "pt" });
        } catch (error) {
          if (!books.length) throw error;
          return { livros: books, startIndex, nextIndex: cursor + languageOffset, hasMore: true };
        }
        const items = Array.isArray(data.items) ? data.items : [];
        for (let index = 0; index < items.length && cursor + index <= 1000; index++) {
          const book = normalizeVolume(items[index]);
          if (!book || !(english ? isEnglish(book.idioma) : isPortuguese(book.idioma)) || (matchResults && !matchesBookSearch(book, term)) || ids.has(book.googleBooksId) || (book.isbn && isbns.has(book.isbn))) continue;
          books.push(book); ids.add(book.googleBooksId);
          if (book.isbn) isbns.add(book.isbn);
          if (books.length === pageSize) {
            const consumed = cursor + index + 1;
            const nextIndex = consumed + languageOffset;
            return { livros: books, startIndex, nextIndex, hasMore: (!english && englishFallback) || (consumed <= 1000 && (index + 1 < items.length || items.length === 40 || Number(data.totalItems) > consumed)) };
          }
        }
        cursor += items.length;
        remaining = items.length > 0 && cursor <= 1000 && (items.length === 40 || Number(data.totalItems) > cursor);
        if (!remaining) break;
      }
      if (!english && englishFallback && !remaining) {
        let fallback;
        try {
          fallback = await this.search({ query, startIndex: 1001, language, maxBatches, matchResults, pageSize: pageSize - books.length });
        } catch (error) {
          if (!books.length) throw error;
          return { livros: books, startIndex, nextIndex: 1001, hasMore: true };
        }
        const seen = new Set(books.map(book => book.googleBooksId));
        return { ...fallback, startIndex, livros: [...books, ...fallback.livros.filter(book => !seen.has(book.googleBooksId) && !(book.isbn && isbns.has(book.isbn)))] };
      }
      return { livros: books, startIndex, nextIndex: cursor + languageOffset, hasMore: remaining };
    },
    async discover({ startIndex = 0 } = {}) {
      return this.search({ query: "ficção", startIndex, matchResults: false });
    },
    async getVolume(id) {
      if (!validId(id)) throw new GoogleBooksError("Identificador de livro inválido.", 400, "INVALID_VOLUME");
      const volume = normalizeVolume(await request(`/${encodeURIComponent(id)}`));
      if (!volume || volume.googleBooksId !== id) throw new GoogleBooksError("O Google Books não retornou os dados desta edição.", 502);
      return volume;
    },
  };
}

export const googleBooks = createGoogleBooksClient();
