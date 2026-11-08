import { createHash } from "node:crypto";
import { Book } from "../models/Book.js";
import { Reading } from "../models/Reading.js";
import { Follow } from "../models/Follow.js";
import { RecommendationProfile, RecommendationSnapshot } from "../models/Recommendation.js";
import { matchesBookSearch, searchText } from "./bookSearch.js";

const unit = (seed, id) => createHash("sha256").update(`${seed}:${id}`).digest().readUInt32BE(0) / 4294967296;
const authors = book => String(book.autor || "").split(",").map(searchText).filter(Boolean);
const genres = book => [...new Set((book.generos?.length ? book.generos : [book.genero]).map(searchText).filter(Boolean))];

// Pure scoring: no user identities or private reading details leave this service.
export function rankRecommendations(books, { readings = [], social = [], searches = [], seed }) {
  const byId = new Map(books.map(book => [String(book._id), book]));
  const authorWeights = new Map(), genreWeights = new Map(), own = new Map(), friendWeights = new Map();
  function learn(book, weight) {
    if (!book) return;
    for (const author of authors(book)) authorWeights.set(author, (authorWeights.get(author) || 0) + weight);
    for (const genre of genres(book)) genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight);
  }
  for (const reading of readings) {
    own.set(String(reading.livro), reading.status);
    const weight = reading.nota != null ? (reading.nota >= 4 ? 4 : reading.nota <= 2 ? -3 : 0) : reading.status ? 2 : 0;
    learn(byId.get(String(reading.livro)), weight);
  }
  for (const reading of social) {
    if ((reading.nota != null && reading.nota <= 2) || (!reading.status && !(reading.nota >= 4))) continue;
    const id = String(reading.livro);
    friendWeights.set(id, Math.min(8, (friendWeights.get(id) || 0) + 2));
    learn(byId.get(id), 0.25);
  }
  for (const term of searches) {
    const matches = books.filter(book => matchesBookSearch(book, term));
    for (const book of matches) learn(book, 2 / Math.max(1, matches.length));
  }
  const ranked = books.map(book => {
    const id = String(book._id), status = own.get(id);
    const affinity = Math.max(-8, Math.min(12, authors(book).reduce((sum, author) => sum + (authorWeights.get(author) || 0), 0)))
      + Math.max(-6, Math.min(8, genres(book).reduce((sum, genre) => sum + (genreWeights.get(genre) || 0), 0)));
    const searchScore = Math.min(8, searches.reduce((score, term) => score + (matchesBookSearch(book, term) ? 3 : 0), 0));
    const discovery = unit(seed, `discovery:${id}`) < 0.25;
    const popularity = Math.min(2, Math.log1p(book.totalAvaliacoes || 0) * (book.mediaAvaliacoes || 0) / 5);
    const score = affinity + searchScore + (friendWeights.get(id) || 0) + (discovery ? 8 : 0)
      + unit(seed, id) * 8 + popularity + (book.urlCapa ? 1 : 0) + (/^pt/i.test(book.idioma) ? 1 : 0)
      - (status === "lido" ? 100 : status === "lendo" ? 25 : status === "quero_ler" ? 5 : 0);
    return { book, score };
  }).sort((a, b) => b.score - a.score || String(a.book._id).localeCompare(String(b.book._id)));
  const result = [], recent = [];
  while (ranked.length) {
    let index = ranked.findIndex(({ book, score }) => (ranked[0].score < -50 || score >= -50) && recent.filter(author => author === authors(book)[0]).length < 2);
    if (index < 0) index = 0;
    const [{ book }] = ranked.splice(index, 1);
    result.push(book._id);
    recent.push(authors(book)[0]);
    if (recent.length > 7) recent.shift();
  }
  return result;
}

export async function recommendationOrder({ userId, seed, languageFilter }) {
  const key = `${userId || "guest"}:${seed}`;
  const snapshot = userId ? await RecommendationSnapshot.findOne({ _id: key, expiresAt: { $gt: new Date() } }).lean() : null;
  if (snapshot) return snapshot;
  const [books, readings, follows, profile] = await Promise.all([
    Book.find(languageFilter).select("titulo autor genero generos idioma urlCapa mediaAvaliacoes totalAvaliacoes").lean(),
    userId ? Reading.find({ usuario: userId }).select("livro status nota").lean() : [],
    userId ? Follow.find({ seguidor: userId }).select("seguido").lean() : [],
    userId ? RecommendationProfile.findById(userId).lean() : null,
  ]);
  const social = follows.length ? await Reading.find({ usuario: { $in: follows.map(f => f.seguido) } }).select("livro status nota").lean() : [];
  const cutoff = Date.now() - 90 * 86400000;
  const searches = profile?.enabled !== false ? (profile?.searches || []).filter(s => new Date(s.at).getTime() > cutoff).map(s => s.term) : [];
  const order = rankRecommendations(books, { readings, social, searches, seed });
  if (!userId) return { books: order, personalized: false };
  await RecommendationSnapshot.deleteOne({ _id: key, expiresAt: { $lte: new Date() } });
  // An atomic insert fixes one ordering across requests and API instances.
  return RecommendationSnapshot.findOneAndUpdate({ _id: key }, { $setOnInsert: {
    ...(userId ? { usuario: userId } : {}), books: order,
    personalized: Boolean(readings.length || social.length || searches.length),
    expiresAt: new Date(Date.now() + 3600000),
  } }, { upsert: true, new: true }).lean();
}
