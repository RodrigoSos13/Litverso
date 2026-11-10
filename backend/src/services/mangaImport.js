import { readFile } from 'node:fs/promises';
import { searchText } from './bookSearch.js';
import { unsuitable, sameAuthor } from './importPolicy.js';
export const mangaCatalog = JSON.parse(await readFile(new URL('../data/mangaCatalog.json', import.meta.url), 'utf8'));
const contains = (value, term) => (` ${searchText(value)} `).includes(` ${searchText(term)} `);
export function mangaVolume(book, series) {
  if (unsuitable(book) || ![series.autor, ...(series.autores || [])].some(a => sameAuthor(book.autor, a))) return null;
  const title = book.titulo;
  if (![series.serie, ...(series.aliases || [])].some(a => contains(title,a)) || (series.exclude || []).some(a => contains(title,a))) return null;
  if (/\b(omnibus|deluxe|kanzenban|bunkoban|box|guide|guidebook|chapter|chapitre|cap[ií]tulo|databook|artbook|fanbook|novel|romance|coloring|colouring|anime|edition double|big edition|3.in.1|2.in.1|3 em 1|2 em 1)\b/i.test(title)) return null;
  let identity = series.serie;
  if (/jojo/i.test(series.serie)) {
    const names = ['phantom blood', 'battle tendency', 'stardust crusaders', 'diamond is unbreakable', 'golden wind', 'stone ocean', 'steel ball run', 'jojolion', 'the jojolands'];
    const part = /\bpart(?:e)?\s*(\d+)\b/i.exec(title);
    const named = names.findIndex(name => contains(title, name));
    const number = part ? Number(part[1]) : named >= 0 ? named + 1 : null;
    if (!number || number < 1 || number > names.length || (named >= 0 && named + 1 !== number)) return null;
    identity += ` Part ${number}`;
  }
  const explicit = /\b(?:vol(?:ume)?\.?|n[º°o.]|tome)\s*[:.#-]?\s*(\d{1,3})\b/i.exec(title);
  const base = [series.serie, ...(series.aliases || [])].find(a => contains(title, a));
  const remainder = searchText(title).replace(searchText(base), '').trim();
  const trailing = /(?:^|\s)(\d{1,3})\s*$/.exec(remainder);
  const number = Number(explicit?.[1] || trailing?.[1]);
  if (!Number.isInteger(number) || number < 1 || /\b\d+\s*[-–]\s*\d+\b/.test(title)) return null;
  const canonical = `${identity} volume ${number}`;
  return { ...book, serie: identity, numeroNaSerie: number, genero: 'Mangá', generos: ['Mangá'], titulosAlternativos: [...new Set([...(book.titulosAlternativos || []), canonical])] };
}
export function mangaTasks(selected = mangaCatalog) {
  // Search Brazilian editions first via the existing client's language cursors.
  return selected.flatMap(series => [...new Set([series.serie, ...(series.aliases || [])])].map(title => ({
    manga: series,
    query: `${title} ${series.autor}`,
  })));
}
