import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import BookCard from "./BookCard";
import { useAuth } from "../contexts/AuthContext";

export default function BookCatalog({ query = "", showSearchForm = false }) {
  const { user } = useAuth();
  const seed = useMemo(() => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, [user?._id]);
  const [searchHistoryEnabled, setSearchHistoryEnabled] = useState(null);
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [genres, setGenres] = useState([]);
  const [genresError, setGenresError] = useState(false);
  const [genresLoading, setGenresLoading] = useState(false);
  const [genresRetry, setGenresRetry] = useState(0);
  const genre = params.get("genre") || "";
  const [draft, setDraft] = useState(() => params.get("search") || "");
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState(null);
  const [retry, setRetry] = useState(0);
  const sectionRef = useRef(null);
  const filterRef = useRef(null);
  const filterButtonRef = useRef(null);
  const filterMenuRef = useRef(null);
  const [filterPosition, setFilterPosition] = useState(null);
  const term = (showSearchForm ? params.get("search") || "" : query).trim();
  const searchEnabled = !showSearchForm || Boolean(term);
  const pageParam = Number(params.get("page") || 1);
  const requestedPage = Number.isSafeInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const visible = searchEnabled && snapshot?.seed === seed && snapshot?.term === term && snapshot?.genre === genre ? snapshot : null;
  const books = visible?.livros || [];
  const page = visible?.page || 1;
  const loading = searchEnabled && (!status || status.seed !== seed || status.term !== term || status.genre !== genre || status.page !== requestedPage || status.loading);
  const error = searchEnabled && status?.seed === seed && status?.term === term && status?.genre === genre ? status.error : "";

  useEffect(() => {
    setSearchHistoryEnabled(null);
    if (!user || showSearchForm) return;
    const controller = new AbortController();
    api.get("/books/interests", { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setSearchHistoryEnabled(data.enabled);
    }).catch(() => {});
    return () => controller.abort();
  }, [user?._id, showSearchForm]);

  useEffect(() => {
    if (!user || showSearchForm || !searchHistoryEnabled || term.length < 3 || requestedPage !== 1) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (controller.signal.aborted) return;
      api.post("/books/interests", { search: term }, { signal: controller.signal }).catch(() => {});
    }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, user?._id, searchHistoryEnabled, showSearchForm, requestedPage]);

  useEffect(() => {
    if (showSearchForm) setDraft(term);
  }, [showSearchForm, term]);

  useEffect(() => {
    if (!searchEnabled) return;
    const controller = new AbortController();
    setStatus({ term, genre, seed, page: requestedPage, loading: true, error: "" });
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/books/catalog", {
          params: { ...(genre ? { genre } : {}), ...(term ? { search: term } : { seed }), page: requestedPage },
          signal: controller.signal,
          timeout: 10000,
        });
        if (controller.signal.aborted) return;
        // Uma remoção durante a navegação não deve abrir uma página vazia.
        if (requestedPage > 1 && !data.livros.length && visible) {
          setSnapshot({ ...visible, hasMore: false });
        } else {
          setSnapshot({ ...data, term, genre, seed });
          if (visible && visible.page !== data.page) requestAnimationFrame(() => {
            if (!controller.signal.aborted) sectionRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
          });
        }
        setStatus({ term, genre, seed, page: requestedPage, loading: false, error: "" });
      } catch (err) {
        if (!controller.signal.aborted) setStatus({ term, genre, seed, page: requestedPage, loading: false, error: err.response?.data?.message || "Não foi possível carregar os livros. Tente novamente." });
      }
    }, requestedPage === 1 ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, genre, requestedPage, retry, searchEnabled, seed]);

  useEffect(() => {
    if (!filtersOpen) return;
    const controller = new AbortController();
    setGenresLoading(true);
    setGenresError(false);
    api.get("/books/genres", { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setGenres(data);
    }).catch(() => { if (!controller.signal.aborted) setGenresError(true); })
      .finally(() => { if (!controller.signal.aborted) setGenresLoading(false); });
    return () => controller.abort();
  }, [filtersOpen, genresRetry]);

  useLayoutEffect(() => {
    if (!filtersOpen) { setFilterPosition(null); return; }
    function positionMenu() {
      const button = filterButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const margin = 12, gap = 8;
      const width = Math.min(256, window.innerWidth - margin * 2);
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const openAbove = below < 220 && above > below;
      setFilterPosition({
        position: "fixed",
        width,
        left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)),
        ...(openAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
        maxHeight: Math.max(0, openAbove ? above : below),
      });
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    function dismiss(event) {
      if (!filterRef.current?.contains(event.target) && !filterMenuRef.current?.contains(event.target)) setFiltersOpen(false);
    }
    function escape(event) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        filterButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [filtersOpen]);

  function selectGenre(value) {
    setFiltersOpen(false);
    filterButtonRef.current?.focus();
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set("genre", value);
      else next.delete("genre");
      next.delete("page");
      return next;
    });
  }

  function requestPage(nextPage) {
    if (loading) return;
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (nextPage > 1) next.set("page", String(nextPage));
      else next.delete("page");
      return next;
    });
  }
  function submit(event) {
    event.preventDefault();
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (draft.trim()) next.set("search", draft.trim());
      else next.delete("search");
      next.delete("page");
      return next;
    });
    setRetry(value => value + 1);
  }

  return (
    <section ref={sectionRef} className="space-y-5 scroll-mt-6" aria-label="Catálogo de livros" aria-busy={loading}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-3xl text-white">{term ? "Resultados da busca" : showSearchForm ? "Confira se o livro já existe" : visible?.personalized ? "Para você" : "Descubra sua próxima leitura"}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {searchEnabled && <span className="text-sm text-mist">{books.length} livros</span>}
          <div ref={filterRef} className="relative">
          <button ref={filterButtonRef} type="button" aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={() => setFiltersOpen(value => !value)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:border-white/20 hover:bg-panelSoft hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mist/50 ${filtersOpen || genre ? "border-white/20 bg-panelSoft text-white" : "border-line bg-panel text-mist"}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M4 4h16l-6 7v7l-4 2v-9Z" /></svg>
            Filtros{genre ? " (1)" : ""}
          </button>
          {filtersOpen && filterPosition && createPortal(<div ref={filterMenuRef} id="catalog-filters" aria-label="Filtrar por gênero" style={filterPosition} className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-panel p-2 shadow-card">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-mist">Gênero</p>
            <div className="min-h-0 max-h-64 overflow-y-auto overscroll-contain">
              {["", ...new Set([...(genre ? [genre] : []), ...genres])].map(value => <button key={value} type="button" aria-pressed={genre === value} onClick={() => selectGenre(value)} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-panelSoft focus-visible:outline-copper ${genre === value ? "bg-copper/10 text-copper" : "text-ink"}`}>
                <span>{value || "Todos os gêneros"}</span>{genre === value && <span aria-hidden="true">✓</span>}
              </button>)}
            </div>
            {genresLoading && <p role="status" className="px-3 py-2 text-sm text-mist">Carregando gêneros…</p>}
            {genresError && <p role="alert" className="px-3 py-2 text-sm text-mist">Não foi possível carregar os gêneros. <button type="button" onClick={() => setGenresRetry(value => value + 1)} className="text-copper underline">Tentar novamente</button></p>}
          </div>, document.body)}
          </div>
        </div>
      </div>
      {genre && <div className="flex items-center gap-3 text-sm text-mist"><span>Gênero: {genre}</span><button type="button" onClick={() => selectGenre("")} className="text-copper underline">Limpar filtro</button></div>}
      {showSearchForm && <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1"><span className="sr-only">Título, autor ou ISBN</span><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={200} required placeholder="Busque por título, autor ou ISBN" className="w-full rounded-2xl border border-line px-4 py-3 outline-none focus:border-copper" /></label>
        <button className="rounded-2xl bg-gradient-to-r from-forest to-berry px-6 py-3 font-semibold text-white">Buscar livros</button>
      </form>}
      {!searchEnabled && <p className="text-sm text-mist">Pesquise por título, autor ou ISBN antes de cadastrar um novo livro.</p>}
      {error && <div role="alert" className="rounded-2xl border border-line bg-panelSoft p-4 text-sm text-mist"><p>{error}</p><button onClick={() => setRetry(value => value + 1)} className="mt-2 font-semibold text-copper">Tentar novamente</button></div>}
      {loading && <p role="status" className="text-sm text-mist">Carregando livros…</p>}
      {searchEnabled && !loading && !error && books.length === 0 && <p className="rounded-2xl border border-dashed border-line p-5 text-mist">{genre ? "Nenhum livro encontrado com esse gênero e busca. Experimente limpar o filtro ou alterar a busca." : term ? "Nenhum livro encontrado no catálogo. Experimente outro título, autor ou ISBN." : "O catálogo ainda não tem livros. Você pode cadastrar sua primeira leitura."}</p>}
      <div className="grid gap-4 xl:grid-cols-2">{books.map(book => <BookCard key={book._id} book={book} />)}</div>
      {visible && books.length > 0 && <nav aria-label="Páginas da busca de livros" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-line pt-6 sm:gap-6">
        <div className="flex justify-end">
          {page > 1 && <button type="button" disabled={loading} onClick={() => requestPage(page - 1)} className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-mist transition hover:border-copper/50 hover:bg-panelSoft hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-midnight disabled:pointer-events-none disabled:opacity-40 sm:px-5">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform motion-safe:group-hover:-translate-x-0.5"><path d="m14 6-6 6 6 6" /></svg>
            Anterior
          </button>}
        </div>
        <span aria-current="page" className="flex flex-col items-center gap-0.5 px-1 text-xs text-mist sm:px-3">Página<span className="text-base font-semibold tabular-nums text-white">{page}</span></span>
        <div className="flex justify-start">
          <button type="button" disabled={loading || !visible.hasMore} onClick={() => requestPage(page + 1)} className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-mist transition hover:border-copper/50 hover:bg-panelSoft hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-midnight disabled:pointer-events-none disabled:opacity-40 sm:px-5">
            Próxima
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform motion-safe:group-hover:translate-x-0.5"><path d="m10 6 6 6-6 6" /></svg>
          </button>
        </div>
      </nav>}
    </section>
  );
}
