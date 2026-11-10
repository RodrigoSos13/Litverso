import { createHash } from 'node:crypto';
import { searchText } from './bookSearch.js';

export const blockedAuthor = value => /\b(?:machado de assis|joaquim maria machado|jorge amado|amado jorge|assis machado)\b/.test(searchText(value));
export const authorKey = value => searchText(value).replace(/\b[a-z]\b/g, '').replace(/\s+/g, ' ').trim();
export const titleKey = value => searchText(String(value).replace(/\s*[—–-]\s*(?:edi[cç][aã]o especial|capa dura|edi[cç][aã]o de luxo).*$/i, ''));
export const sameAuthor = (a, b) => {
  const x = authorKey(a), y = authorKey(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
};
export const titlesOf = b => [b.titulo, b.tituloOriginal, ...(b.titulosAlternativos || [])].filter(Boolean).map(titleKey);
export const unsuitable = b => !b?.titulo || !b?.autor || blockedAuthor(b.autor) || /autor n[aã]o informado|unknown|anonymous/i.test(b.autor) || /\b(summary|study guide|workbook|resumo|apostila|box set|boxed set|cole[cç][aã]o completa|guia de leitura|collection of)\b/i.test(b.titulo);
export function matchesCandidate(book, candidate) {
  if (unsuitable(book)) return false;
  if (candidate.autor && !sameAuthor(book.autor, candidate.autor)) return false;
  if (candidate.titulo && !titlesOf(candidate).some(t => titlesOf(book).includes(t))) return false;
  if (candidate.serie && !titleKey(book.titulo).includes(titleKey(candidate.serie))) return false;
  return true;
}
export function sameWork(a, b) {
  if (!sameAuthor(a.autor, b.autor)) return false;
  if (a.numeroNaSerie != null && b.numeroNaSerie != null && a.numeroNaSerie !== b.numeroNaSerie) return false;
  return titlesOf(a).some(t => titlesOf(b).includes(t));
}
export function workKey(book) {
  return createHash('sha256').update(`${book.genero === 'Mangá' && book.serie && book.numeroNaSerie != null ? 'series:' + titleKey(book.serie) : authorKey(book.autor) + '|' + titleKey(book.tituloOriginal || book.titulo)}|${book.numeroNaSerie ?? ''}`).digest('hex');
}
