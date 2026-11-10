import { googleBooks } from './googleBooks.js';
import { matchesCandidate } from './importPolicy.js';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function retry(operation, { sleep = pause, attempts = 3 } = {}) {
  for (let n = 0; ; n++) {
    try { return await operation(); }
    catch (error) {
      if (n + 1 >= attempts || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await sleep(1000 * 2 ** n);
    }
  }
}
export function createImportSources({ google = googleBooks, fetchImpl = fetch, sleep = pause, delay = 1100 } = {}) {
  async function json(url) {
    return retry(async () => {
      await sleep(delay);
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json', 'User-Agent': 'LitversoCatalog/1.0 (metadata importer)' } });
      if (!response.ok) { const error = new Error('SOURCE_UNAVAILABLE'); error.status = response.status; throw error; }
      return response.json();
    }, { sleep });
  }
  async function openLibrary(candidate) {
    const url = new URL('https://openlibrary.org/search.json');
    if (candidate.titulo) url.searchParams.set('title', candidate.titulo);
    if (candidate.autor) url.searchParams.set('author', candidate.autor);
    if (!candidate.titulo && !candidate.autor) url.searchParams.set('q', candidate.query || candidate.serie);
    url.searchParams.set('limit', '5');
    url.searchParams.set('fields', 'key,title,author_name');
    const results = [];
    for (const work of (await json(url)).docs || []) {
      if (!/^\/works\/OL\d+W$/.test(work.key)) continue;
      const author = work.author_name?.join(', ');
      if (!matchesCandidate({ titulo: work.title, autor: author }, candidate)) continue;
      // Never combine work-level ISBN, language and cover arrays: obtain one actual edition.
      const editions = await json(`https://openlibrary.org${work.key}/editions.json?limit=30`);
      const eligible = (editions.entries || []).filter(e => e.languages?.some(l => ['/languages/por', '/languages/eng'].includes(l.key)));
      eligible.sort((a,b) => Number(b.languages?.some(l => l.key === '/languages/por')) - Number(a.languages?.some(l => l.key === '/languages/por')));
      for (const edition of eligible) {
        const book = {
          titulo: edition.title, autor: author, openLibraryId: work.key,
          openLibraryEditionId: edition.key, idioma: edition.languages.some(l => l.key === '/languages/por') ? 'pt' : 'en',
          isbn: edition.isbn_13?.[0] || edition.isbn_10?.[0] || '',
          editora: edition.publishers?.join(', ') || '',
          ...(Number.isInteger(edition.number_of_pages) && edition.number_of_pages > 0 ? { totalPaginas: edition.number_of_pages } : {}),
          ...(String(edition.publish_date || '').match(/\b\d{4}\b/) ? { anoPublicacao: Number(String(edition.publish_date).match(/\b\d{4}\b/)[0]) } : {}),
          descricao: typeof edition.description === 'string' ? edition.description : edition.description?.value || 'Sinopse não disponível para esta edição.',
          urlCapa: edition.covers?.[0] > 0 ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg?default=false` : '',
          genero: candidate.genero || 'Literatura', generos: [candidate.genero || 'Literatura'],
        };
        if (matchesCandidate(book, candidate)) { results.push(book); break; }
      }
    }
    return results;
  }
  return {
    async search(candidate, cursor = 0) {
      let result, googleError;
      try {
        await sleep(delay);
        const query = candidate.query || (candidate.titulo ? `${candidate.titulo} ${candidate.autor || ''}` : candidate.autor ? `inauthor:${candidate.autor}` : candidate.serie);
        result = await retry(() => google.search({ query, startIndex: cursor, maxBatches: 1, pageSize: 40, matchResults: false }), { sleep });
      } catch (error) { googleError = error; }
      let books = (result?.livros || []).filter(b => matchesCandidate(b, candidate));
      const rejected = (result?.livros?.length || 0) - books.length;
      if (!books.length && cursor === 0) {
        try { books = await openLibrary(candidate); }
        catch { if (!result) throw googleError || new Error('SOURCES_UNAVAILABLE'); }
      }
      // Exact-title tasks select a verified match, preferring Portuguese editions.
      books.sort((a,b) => Number(/^pt/i.test(b.idioma)) - Number(/^pt/i.test(a.idioma)));
      return { rejected, livros: candidate.titulo ? books.slice(0,1) : books, hasMore: !candidate.titulo && Boolean(result?.hasMore), nextIndex: result?.nextIndex };
    },
    async coverAvailable(url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !['books.google.com', 'books.google.com.br', 'covers.openlibrary.org'].includes(parsed.hostname)) return false;
        await sleep(delay);
        const response = await retry(async () => {
          const res = await fetchImpl(parsed, { signal: AbortSignal.timeout(10000) });
          if (res.status === 429 || res.status >= 500) { await res.body?.cancel(); throw new Error('COVER_UNAVAILABLE'); }
          return res;
        }, { sleep });
        const valid = response.ok && /^image\//i.test(response.headers.get('content-type') || '');
        await response.body?.cancel();
        return valid;
      } catch { return false; }
    },
  };
}
