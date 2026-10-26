import { useEffect, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import api from "../services/api";
import BookDescription from "../components/BookDescription";
import BookCover from "../components/BookCover";
import StarRating from "../components/StarRating";
import PostCard from "../components/PostCard";
import FanartComposer from "../components/FanartComposer";
import { useAuth } from "../contexts/AuthContext";

const initialReadingForm = {
  status: null,
  nota: "",
};

const statusLabels = {
  quero_ler: "Quero ler",
  lendo: "Lendo",
  lido: "Lido",
};

function BookPage() {
  const { id } = useParams();
  const { requireLogin } = useAuth();
  const { currentUserId } = useOutletContext();
  const [data, setData] = useState(null);
  const [activeSection, setActiveSection] = useState("community");
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [readingForm, setReadingForm] = useState(initialReadingForm);
  const [savedStatus, setSavedStatus] = useState(null);
  const [savingReading, setSavingReading] = useState(false);
  const [activeReadingMenu, setActiveReadingMenu] = useState(null);

  const sectionTabsRef = useRef([]);
  const readingActionsRef = useRef(null);
  const readingTriggerRef = useRef(null);

  useEffect(() => {
    if (!activeReadingMenu) return;
    function dismiss(event) {
      if (!readingActionsRef.current?.contains(event.target)) setActiveReadingMenu(null);
    }
    function escape(event) {
      if (event.key === "Escape") {
        setActiveReadingMenu(null);
        readingTriggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [activeReadingMenu]);

  function loadBookPage() {
    return api.get(`/books/${id}`).then((response) => setData(response.data));
  }

  useEffect(() => {
    setExpandedDescription(false);
    setActiveSection("community");
    loadBookPage().catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!currentUserId) {
      setReadingForm(initialReadingForm);
      setSavedStatus(null);
      return;
    }

    const controller = new AbortController();
    setSavedStatus(null);
    setReadingForm(initialReadingForm);
    api
      .get("/readings", {
        params: {
          user: currentUserId,
          book: id,
        },
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        const reading = response.data[0];
        setSavedStatus(reading?.status || null);

        setReadingForm({
          status: reading?.status || null,
          nota: reading?.nota ?? "",
        });
      })
      .catch(error => { if (!controller.signal.aborted) console.error(error); });
    return () => controller.abort();
  }, [currentUserId, id]);

  if (!data) {
    return <p>Carregando livro...</p>;
  }

  const statsMap = data.estatisticasLeitura.reduce((accumulator, item) => {
    accumulator[item._id] = item.count;
    return accumulator;
  }, {});
  const communityPosts = data.posts.filter((post) => post.tipo === "resenha" || post.tipo === "citacao");
  const fanarts = data.posts.filter((post) => post.tipo === "fanart");

  async function handleRatingSubmit(event) {
    event.preventDefault();

    if (!currentUserId) {
      return;
    }

    setSavingReading(true);

    try {
      await api.post("/readings", {
        usuario: currentUserId,
        livro: id,
        status: readingForm.status,
        nota: readingForm.nota === "" ? null : Number(readingForm.nota),
      });
      setSavedStatus(readingForm.status);
      await loadBookPage();
      setActiveReadingMenu(null);
    } catch (error) {
      console.error(error);
    } finally {
      setSavingReading(false);
    }
  }

  async function handleStatusSubmit(nextStatus) {
    if (!currentUserId) {
      return;
    }

    setSavingReading(true);

    try {
      await api.post("/readings", {
        usuario: currentUserId,
        livro: id,
        status: nextStatus,
        nota: readingForm.nota === "" ? null : Number(readingForm.nota),
      });
      setReadingForm((current) => ({ ...current, status: nextStatus }));
      setSavedStatus(nextStatus);
      await loadBookPage();
      setActiveReadingMenu(null);
    } catch (error) {
      console.error(error);
    } finally {
      setSavingReading(false);
    }
  }


  return (
    <div className="space-y-6">
      <section className="book-detail">
        <aside className="book-detail-sidebar">
          <div className="book-cover-stage">
            <BookCover url={data.livro.urlCapa} title={data.livro.titulo} className="book-detail-cover" />
            <div
              className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-copper/30 bg-midnight/90 px-3 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm"
              aria-label={data.livro.totalAvaliacoes > 0 ? `Avaliação média: ${data.livro.mediaAvaliacoes} de 5, ${data.livro.totalAvaliacoes} ${data.livro.totalAvaliacoes === 1 ? "avaliação" : "avaliações"}` : "Sem avaliações"}
              title={data.livro.totalAvaliacoes > 0 ? `${data.livro.totalAvaliacoes} avaliações` : "Sem avaliações ainda"}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-copper"><path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5Z" /></svg>
              {data.livro.totalAvaliacoes > 0 && <span className="tabular-nums">{Number(data.livro.mediaAvaliacoes || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>}
              <span className="text-[10px] font-normal text-mist/80">{data.livro.totalAvaliacoes > 0 ? `(${Number(data.livro.totalAvaliacoes).toLocaleString("pt-BR")} ${data.livro.totalAvaliacoes === 1 ? "avaliação" : "avaliações"})` : "(0 avaliações)"}</span>
            </div>
          </div>

          <p className="book-community-label">Na comunidade</p>
          <dl aria-label="Leituras da comunidade" className="space-y-3 px-1">
            {[
              { key: "lido", label: "Já leram", icon: <><path d="M20 11.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /><path d="m10 9 3 3 8-8M4 17h16" /></> },
              { key: "lendo", label: "Lendo agora", icon: <><path d="M12 5v15M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" /></> },
              { key: "quero_ler", label: "Querem ler", icon: <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z" /> },
            ].map(({ key, label, icon }) => (
              <div key={key} className="flex items-center gap-3">
                <dt className="flex shrink-0 items-center gap-2.5 text-xs text-mist">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mist/70" aria-hidden="true">{icon}</svg>
                  {label}
                </dt>
                <span className="h-px min-w-2 flex-1 bg-line/50" aria-hidden="true" />
                <dd className="text-xs font-semibold tabular-nums text-ink">{Number(statsMap[key] || 0).toLocaleString("pt-BR")}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 border-t border-line/60 pt-4">
            {!currentUserId ? (
              <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => requireLogin("avaliar este livro")} className="rounded-xl bg-gradient-to-r from-forest to-berry px-3 py-2.5 text-xs font-semibold text-white hover:brightness-110 focus-visible:outline-copper">Avaliar</button><button type="button" onClick={() => requireLogin("adicionar este livro à sua lista")} className="rounded-xl border border-line bg-panelSoft px-3 py-2.5 text-xs font-semibold text-white hover:border-copper/50 focus-visible:outline-copper">Adicionar à lista</button></div><p className="text-xs leading-5 text-mist">Sua próxima leitura merece um lugar. Entre ou crie uma conta para organizar sua biblioteca.</p></div>
            ) : (
              <div ref={readingActionsRef} className="relative">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={event => {
                      readingTriggerRef.current = event.currentTarget;
                      setActiveReadingMenu(current => current === "rating" ? null : "rating");
                    }}
                    aria-expanded={activeReadingMenu === "rating"}
                    aria-controls="book-reading-popover"
                    className="rounded-xl bg-gradient-to-r from-forest to-berry px-3 py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
                  >
                    Avaliar
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      readingTriggerRef.current = event.currentTarget;
                      setActiveReadingMenu(current => current === "status" ? null : "status");
                    }}
                    aria-expanded={activeReadingMenu === "status"}
                    aria-controls="book-reading-popover"
                    className="rounded-xl border border-line bg-panelSoft px-3 py-2.5 text-xs font-semibold text-white transition hover:border-mist/50"
                  >
                    {savedStatus ? statusLabels[savedStatus] : "Adicionar à lista"}
                  </button>
                </div>

                {activeReadingMenu && <div id="book-reading-popover" role="region" aria-label={activeReadingMenu === "rating" ? "Avaliar livro" : "Adicionar à lista"} className="absolute inset-x-0 top-full z-40 mt-2 rounded-2xl border border-line bg-panel p-3 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white">{activeReadingMenu === "rating" ? "Avaliar livro" : "Adicionar à lista"}</p>
                    <button type="button" aria-label="Fechar opções" onClick={() => { setActiveReadingMenu(null); readingTriggerRef.current?.focus(); }} className="flex h-7 w-7 items-center justify-center rounded-lg text-mist hover:bg-panelSoft hover:text-white">×</button>
                  </div>
                {activeReadingMenu === "rating" && (
                  <form className="space-y-3" onSubmit={handleRatingSubmit}>
                    <StarRating
                      value={readingForm.nota}
                      onChange={(nota) => setReadingForm((current) => ({ ...current, nota }))}
                      disabled={savingReading}
                    />

                    <button
                      type="submit"
                      disabled={savingReading || readingForm.nota === ""}
                      className="w-full rounded-lg bg-forest px-3 py-2 text-xs font-semibold text-white transition hover:bg-berry disabled:opacity-60"
                    >
                      {savingReading ? "Salvando..." : "Salvar nota"}
                    </button>
                  </form>
                )}

                {activeReadingMenu === "status" && (
                  <div className="grid gap-1.5">
                    {Object.entries(statusLabels).map(([status, label]) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => handleStatusSubmit(status)}
                        disabled={savingReading}
                        aria-pressed={savedStatus === status}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition enabled:hover:border-copper enabled:hover:bg-copper enabled:hover:text-midnight focus-visible:border-copper focus-visible:bg-copper focus-visible:text-midnight disabled:opacity-60 ${
                          savedStatus === status
                            ? "border-copper bg-copper text-midnight"
                            : "border-line bg-midnight/70 text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                </div>}
              </div>
            )}
          </div>
        </aside>

        <div className="book-detail-content">
          <header className="book-detail-header">
            <div className="book-detail-title-row">
              <h1 className="book-detail-title">{data.livro.titulo}</h1>
              <p className="book-detail-eyebrow">{data.livro.genero || "Literatura"}</p>
            </div>
            <p className="book-detail-author"><span>por</span> {data.livro.autor}</p>
          </header>

          <section className="book-synopsis" aria-labelledby="book-synopsis-heading">
            <h2 id="book-synopsis-heading" className="book-section-title">Sinopse</h2>
            <div id="book-description" className={`book-description ${!expandedDescription && data.livro.descricao?.length > 850 ? "book-description-collapsed" : ""}`}>
              <BookDescription text={data.livro.descricaoFormatada || data.livro.descricao || "Ainda não há uma sinopse disponível para este livro."} />
            </div>
            {data.livro.descricao?.length > 850 && (
              <button type="button" className="book-description-toggle" aria-expanded={expandedDescription} aria-controls="book-description" onClick={() => setExpandedDescription(current => !current)}>
                {expandedDescription ? "Mostrar menos" : "Ler sinopse completa"}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`h-4 w-4 transition-transform ${expandedDescription ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
              </button>
            )}
          </section>

          <section className="book-edition" aria-labelledby="book-edition-heading">
            <h2 id="book-edition-heading" className="book-section-title">Sobre esta edição</h2>
            <dl className="book-edition-grid">
              {[
                { label: "Páginas", value: data.livro.totalPaginas },
                { label: "Editora", value: data.livro.editora },
                { label: "Publicação", value: data.livro.anoPublicacao },
                { label: "Idioma", value: ({ "pt-BR": "Português (Brasil)", pt: "Português", en: "Inglês", es: "Espanhol" })[data.livro.idioma] || data.livro.idioma },
                { label: "ISBN", value: data.livro.isbn },
              ].filter(({ value }) => value).map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </section>

      <section aria-label="Publicações sobre o livro">
        <div role="tablist" aria-label="Publicações sobre o livro" className="mb-6 flex gap-8 border-b border-line" onKeyDown={event => {
          const keys = ["community", "fanarts"];
          const next = ["ArrowLeft", "ArrowRight"].includes(event.key) ? (activeSection === "community" ? 1 : 0) : event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
          if (next !== null) {
            event.preventDefault();
            setActiveSection(keys[next]);
            sectionTabsRef.current[next]?.focus();
          }
        }}>
          {[
            { key: "community", label: "Comunidade" },
            { key: "fanarts", label: "Fanarts" },
          ].map(({ key, label }, index) => (
            <button key={key} ref={node => { sectionTabsRef.current[index] = node; }} type="button" role="tab"
              id={`book-tab-${key}`} aria-selected={activeSection === key} aria-controls={`book-panel-${key}`}
              tabIndex={activeSection === key ? 0 : -1} onClick={() => setActiveSection(key)}
              className={`relative -mb-px flex min-h-12 items-center justify-center gap-2.5 border-b-2 px-1 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${activeSection === key ? "border-copper text-ink" : "border-transparent text-mist/70 hover:text-ink"}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`h-[18px] w-[18px] transition-colors ${activeSection === key ? "text-copper" : ""}`}>
                {key === "community" ? <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> : <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>}
              </svg>
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`book-panel-${activeSection}`} aria-labelledby={`book-tab-${activeSection}`} tabIndex={0} className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
        {activeSection === "community" ? (
          <>
            <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6 pb-8 sm:gap-8">
              <h2 className="sr-only">Resenhas e citações</h2>
              {communityPosts.map(post => (
                <PostCard key={post._id} post={post} currentUserId={currentUserId} fullWidth feedPreview showBook={false}
                  onDeleted={postId => setData(current => ({ ...current, posts: current.posts.filter(item => item._id !== postId) }))} />
              ))}
              {communityPosts.length === 0 && <p className="py-6 text-sm text-mist">Ainda não há resenhas ou citações deste livro.</p>}
            </div>
          </>
        ) : (
          <>
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-3xl">Fanarts deste livro</h2>
          </div>
          <span className="text-sm text-mist">{fanarts.length} fanarts</span>
        </div>

        <FanartComposer key={id} bookId={id} bookTitle={data.livro.titulo} onPublished={loadBookPage} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {fanarts.map((post) => (
            <article key={post._id} className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
              <div className="flex aspect-[3/4] items-center justify-center bg-panelSoft p-2">
                <img
                  src={post.urlImagem}
                  alt={post.texto || `Fanart de ${data.livro.titulo}`}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="space-y-1 p-3">
                <p className="line-clamp-2 text-xs leading-5 text-slate-300">{post.texto}</p>
                <p className="truncate text-xs text-mist">
                  por {post.usuario?.nome || "Usuario desconhecido"}
                </p>
              </div>
            </article>
          ))}
          {fanarts.length === 0 && (
            <p className="col-span-full py-2 text-xs text-mist/70">
              Nenhuma fanart por aqui ainda.
            </p>
          )}
        </div>
          </>
        )}
        </div>
      </section>
    </div>
  );
}

export default BookPage;
