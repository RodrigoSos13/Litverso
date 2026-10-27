import { bookGenreCorrections } from "../data/bookGenreCorrections.js";

// Shared by imports, manual registrations and the existing-catalog migration.
const translations = {
  'Fiction': 'Ficção', 'Nonfiction': 'Não ficção', 'Non-fiction': 'Não ficção',
  'Horror': 'Terror', 'Horror tales': 'Contos de terror', 'Horror fiction': 'Ficção de terror',
  'Fantasy': 'Fantasia', 'Epic': 'Fantasia épica', 'Epic Fantasy': 'Fantasia épica', 'Science Fiction': 'Ficção científica', 'Romance': 'Romance',
  'Thrillers': 'Suspense', 'Thriller': 'Suspense', 'Mystery & Detective': 'Mistério e investigação',
  'Mystery': 'Mistério', 'Suspense': 'Suspense', 'General': 'Geral',
  'Juvenile Fiction': 'Ficção infantojuvenil', 'Juvenile Nonfiction': 'Não ficção infantojuvenil',
  'Young Adult Fiction': 'Ficção para jovens adultos', 'Young Adult Nonfiction': 'Não ficção para jovens adultos',
  'Literary Criticism': 'Crítica literária', 'Literary Collections': 'Coletâneas literárias',
  'Biography & Autobiography': 'Biografia e autobiografia', 'Comics & Graphic Novels': 'Quadrinhos e romances gráficos',
  'Comic books, strips, etc': 'Histórias em quadrinhos e tirinhas',
  'Poetry': 'Poesia', 'Religion': 'Religião', 'Self-Help': 'Autoajuda', 'Art': 'Arte',
  'Computers': 'Informática', 'Psychology': 'Psicologia', 'True Crime': 'Crimes reais',
  'Language Arts & Disciplines': 'Linguagem e disciplinas relacionadas', 'Medical': 'Medicina',
  'Games & Activities': 'Jogos e atividades', 'Philosophy': 'Filosofia',
  'Family & Relationships': 'Família e relacionamentos', 'Animals': 'Animais',
  'Literature': 'Literatura', 'Brazilian literature': 'Literatura brasileira',
  'American fiction': 'Ficção norte-americana', 'Portuguese language': 'Língua portuguesa',
  'Authors, Brazilian': 'Autores brasileiros', 'Authors, American': 'Autores norte-americanos',
  'Authors, English': 'Autores ingleses', "Children's poetry, English": 'Poesia infantil inglesa',
  'New England': 'Nova Inglaterra', 'Latin America': 'América Latina', 'England': 'Inglaterra',
  'Electronic books': 'Livros digitais', 'Clocks and watches': 'Relógios', 'Mud': 'Lama',
  'History': 'História', 'Education': 'Educação', 'Science': 'Ciência', 'Mathematics': 'Matemática',
  'Business & Economics': 'Negócios e economia', 'Health & Fitness': 'Saúde e bem-estar',
  'Body, Mind & Spirit': 'Corpo, mente e espírito', 'Social Science': 'Ciências sociais',
  'Political Science': 'Ciência política', 'Law': 'Direito', 'Travel': 'Viagens',
  'Cooking': 'Culinária', 'Music': 'Música', 'Performing Arts': 'Artes cênicas',
  'Nature': 'Natureza', 'Sports & Recreation': 'Esportes e lazer', 'Humor': 'Humor',
  'Technology & Engineering': 'Tecnologia e engenharia', 'Reference': 'Referência',
  'Classics': 'Clássicos', 'Literary': 'Literária', 'Historical': 'Histórica',
  'Action & Adventure': 'Aventura', 'Adventure': 'Aventura', 'Dark Fantasy': 'Fantasia sombria',
  'Urban Fantasy': 'Fantasia urbana', 'Historical Fantasy': 'Fantasia histórica',
  'Magical Realism': 'Realismo mágico', 'Dystopian': 'Distopia', 'Dystopia': 'Distopia',
  'Space Opera': 'Ópera espacial', 'Cyberpunk': 'Cyberpunk', 'Superheroes': 'Super-heróis',
  'Fairy Tales & Folklore': 'Contos de fadas e folclore', 'Ghost': 'Fantasmas',
  'Vampires': 'Vampiros', 'Werewolves & Shifters': 'Lobisomens e metamorfos',
  'Paranormal': 'Paranormal', 'Coming of Age': 'Amadurecimento',
  'Short Stories': 'Contos', 'Gothic': 'Gótico', 'Occult & Supernatural': 'Ocultismo e sobrenatural',
  'Unknown': 'Não informado', 'Uncategorized': 'Não informado',
};
const normalized = new Map(Object.entries(translations).map(([key, value]) => [key.toLowerCase(), value]));

export function normalizeBookGenre(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Não informado';
  const genre = value.trim();
  // Google Books also returns hierarchical categories, e.g. Fiction / Horror.
  return normalized.get(genre.toLowerCase()) || genre.split(/\s*\/\s*/)
    .map(part => normalized.get(part.toLowerCase()) || part).join(' / ');
}

// Subjects, locations, formats and author names are not literary genres.
const subjects = new Set([
  'Autores brasileiros', 'Autores norte-americanos', 'Autores ingleses',
  'Língua portuguesa', 'Nova Inglaterra', 'América Latina', 'Inglaterra',
  'Livros digitais', 'Relógios', 'Lama', 'Animais',
  'Literatura brasileira', 'Ficção norte-americana',
]);
const genres = new Set([...Object.values(translations), ...Object.values(bookGenreCorrections)]
  .filter(value => !subjects.has(value) && !['Geral', 'Não informado'].includes(value)));

export function correctedBookGenre(book) {
  return Object.hasOwn(bookGenreCorrections, book.googleBooksId) ? bookGenreCorrections[book.googleBooksId] : normalizeBookGenre(book.genero);
}

export function normalizeBookGenres(values) {
  const items = (Array.isArray(values) ? values : [values])
    .filter(value => typeof value === 'string' && value.trim())
    .flatMap(value => normalizeBookGenre(value).split(' / '));
  const unique = [...new Map(items.map(value => [value.toLocaleLowerCase('pt-BR'), value])).values()];
  return unique.length > 1 ? unique.filter(value => value !== 'Não informado') : unique;
}

export function reviewedBookGenres(book) {
  const title = String(book.titulo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/brandon sanderson/i.test(book.autor || '') && /^(palavras de radiancia|words of radiance)(?:$|\s*[:(–-])/.test(title)) {
    return ['Fantasia', 'Fantasia épica', 'Ficção'];
  }
  return [];
}

export function selectGoogleBookGenres(categories, googleBooksId, book = {}) {
  const reviewed = reviewedBookGenres(book);
  if (reviewed.length) return reviewed;
  const correction = Object.hasOwn(bookGenreCorrections, googleBooksId) ? [bookGenreCorrections[googleBooksId]] : [];
  const candidates = normalizeBookGenres(categories).filter(category => genres.has(category));
  const broad = new Set(['Ficção', 'Não ficção', 'Ficção infantojuvenil', 'Ficção para jovens adultos', 'Literatura']);
  const result = normalizeBookGenres([...correction, ...candidates.filter(category => !broad.has(category)), ...candidates.filter(category => broad.has(category))]);
  return result.length ? result : ['Não informado'];
}

export function selectGoogleBookGenre(categories, googleBooksId) {
  return selectGoogleBookGenres(categories, googleBooksId)[0];
}
