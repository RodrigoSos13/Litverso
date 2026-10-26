import { useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import api from "../services/api";
import PostCard from "../components/PostCard";
import CreatePostPage from "./CreatePostPage";
import CommunitySidebar from "../components/CommunitySidebar";
import CommunityPeople from "../components/CommunityPeople";
import BookCatalog from "../components/BookCatalog";
import { useAuth } from "../contexts/AuthContext";

function HomePage() {
  const [params] = useSearchParams();
  const { user, requireLogin } = useAuth();
  const [activeTab, setActiveTab] = useState(() => params.get("tab") === "comunidade" ? 1 : 0);
  const [composing, setComposing] = useState(() => Boolean(user) && params.get("compose") === "1");
  const [composerVersion, setComposerVersion] = useState(0);
  const tabs = useRef([]);
  const composerDialog = useRef(null);
  const touch = useRef(null);
  const [communitySearching, setCommunitySearching] = useState(false);
  const [postsError, setPostsError] = useState(false);
  const [postsLoading, setPostsLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [postType, setPostType] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const { currentUserId, search } = useOutletContext();

  useEffect(() => {
    const controller = new AbortController();
    loadPosts(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => { if (search) setActiveTab(0); }, [search]);
  useEffect(() => { if (activeTab !== 1) setCommunitySearching(false); }, [activeTab]);

  useEffect(() => {
    if (!composing) {
      composerDialog.current?.close();
      return;
    }
    composerDialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [composing]);

  function selectTab(index, focus = false) {
    const next = Math.max(0, Math.min(1, index));
    setActiveTab(next);
    if (focus) tabs.current[next]?.focus();
  }

  async function loadPosts(signal) {
    setPostsLoading(true);
    setPostsError(false);
    try {
      const response = await api.get("/posts", { signal });
      if (!signal?.aborted) setPosts(response.data);
    } catch { if (!signal?.aborted) setPostsError(true); }
    finally { if (!signal?.aborted) setPostsLoading(false); }
  }

  const visiblePosts = posts.filter(post =>
    (postType === "all" || post.tipo === postType) &&
    (!onlyMine || String(post.usuario?._id || post.usuario) === String(currentUserId))
  );

  return (
    <div className="mx-auto max-w-6xl">

      <div className="min-w-0 space-y-6">
        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[2rem] border border-line bg-[radial-gradient(circle_at_top_left,rgba(197,59,76,0.26),transparent_30%),linear-gradient(135deg,#1a2740_0%,#111a2d_60%,#0b1324_100%)] p-8 text-white shadow-card">
            <p className="text-sm uppercase tracking-[0.25em] text-copper">Pagina inicial</p>
            <h1 className="mt-3 font-display text-4xl">Converse sobre livros como se fossem mundos que voce pode visitar.</h1>
            <p className="mt-4 max-w-2xl text-sm text-slate-300">
              Descubra livros em destaque, publique resenhas, compartilhe fanarts e deixe sua jornada de leitura visivel.
            </p>
          </div>
          <div className="rounded-[2rem] border border-line bg-panel p-6 shadow-card">
            <p className="text-sm uppercase tracking-[0.22em] text-copper">Acesso rapido</p>
            <h2 className="mt-3 font-display text-3xl text-white">
              {search ? "Explorando livros encontrados" : "Comece pela busca no cabecalho"}
            </h2>
            <p className="mt-4 text-sm text-white">
              Use o campo de busca no cabecalho para encontrar titulos e autores de qualquer parte do app.
            </p>
          </div>
        </section>

        <div role="tablist" aria-label="Explorar livros e comunidade" className="flex gap-8 border-b border-line" onKeyDown={event => {
          const next = ["ArrowLeft", "ArrowRight"].includes(event.key) ? 1 - activeTab : event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
          if (next !== null) { event.preventDefault(); selectTab(next, true); }
        }}>

          {["Livros", "Comunidade"].map((label, index) => <button key={label} ref={node => { tabs.current[index] = node; }} type="button" role="tab" id={`home-tab-${index}`} aria-controls={`home-panel-${index}`} aria-selected={activeTab === index} tabIndex={activeTab === index ? 0 : -1} onClick={() => selectTab(index)} className={`relative -mb-px flex min-h-12 items-center justify-center gap-2.5 border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${activeTab === index ? "border-copper text-ink" : "border-transparent text-mist/70 hover:text-ink"}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`h-[18px] w-[18px] transition-colors ${activeTab === index ? "text-copper" : ""}`}>
              {index === 0 ? <path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /> : <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>}
            </svg>
            {label}
          </button>)}
        </div>
        <div className="-mx-4 overflow-hidden px-4" style={{ touchAction: "pan-y" }} onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={event => {
          if (!touch.current) return;
          const dx = event.changedTouches[0].clientX - touch.current.x;
          const dy = event.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) selectTab(activeTab + (dx < 0 ? 1 : -1));
          touch.current = null;
        }}>
          <div className="flex items-start transition-transform duration-300 ease-out" style={{ transform: `translateX(-${activeTab * 100}%)` }}>
            <section role="tabpanel" id="home-panel-0" aria-labelledby="home-tab-0" aria-hidden={activeTab !== 0} inert={activeTab === 0 ? undefined : ""} tabIndex={activeTab === 0 ? 0 : -1} className={`w-full min-w-0 shrink-0 ${activeTab === 0 ? "" : "max-h-0 overflow-hidden"}`}>
              <BookCatalog query={search} />
            </section>
            <section role="tabpanel" id="home-panel-1" aria-labelledby="home-tab-1" aria-hidden={activeTab !== 1} inert={activeTab === 1 ? undefined : ""} tabIndex={activeTab === 1 ? 0 : -1} className={`w-full min-w-0 shrink-0 ${activeTab === 1 ? "" : "max-h-0 overflow-hidden"}`}>
        <div className="community-layout w-full min-w-0 pb-24">
          <div className="min-w-0">
          <div id="community-search" className="scroll-mt-28">
          {activeTab === 1 && <CommunityPeople currentUserId={currentUserId} onSearchChange={setCommunitySearching} postType={postType} onlyMine={onlyMine} />}
          </div>
          <div hidden={communitySearching} className="space-y-5">
            {(postType !== "all" || onlyMine) && <div className="flex items-center justify-between gap-3 px-1 text-xs text-mist"><span aria-live="polite">{visiblePosts.length} publicações encontradas{onlyMine ? " entre suas publicações" : ""}</span><button type="button" onClick={() => { setPostType("all"); setOnlyMine(false); }} className="rounded text-copper hover:text-glow">Limpar filtros</button></div>}
            {visiblePosts.map((post) => (
              <div key={post._id} className="min-w-0">
                <PostCard post={post} currentUserId={currentUserId} fullWidth feedPreview onDeleted={id => setPosts(current => current.filter(post => post._id !== id))} />
              </div>
            ))}
          </div>
          <div hidden={communitySearching} className="space-y-3">
            {postsLoading && <p role="status" className="text-sm text-mist">Carregando publicações…</p>}
            {postsError && <div role="alert" className="text-sm text-mist">Não foi possível carregar as publicações. <button type="button" onClick={() => loadPosts()} className="text-copper underline">Tentar novamente</button></div>}
            {!postsLoading && !postsError && visiblePosts.length === 0 && <p role="status" className="text-sm text-mist">{posts.length ? "Nenhuma publicação corresponde aos filtros selecionados." : "Ainda não há publicações. Compartilhe sua primeira leitura!"}</p>}
          </div>
          </div>
          {activeTab === 1 && <CommunitySidebar currentUserId={currentUserId} postType={postType} onTypeChange={setPostType} onlyMine={onlyMine} onOnlyMineChange={setOnlyMine} />}
        </div>
            </section>
          </div>
        </div>
      </div>
      {activeTab === 1 && <button type="button" onClick={() => { if (requireLogin("publicar na comunidade")) setComposing(true); }} aria-haspopup="dialog" aria-controls="create-post-dialog" className="fixed bottom-6 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-forest px-5 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-berry focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-midnight disabled:opacity-50 sm:right-8"><span aria-hidden="true" className="text-xl leading-none">+</span>Adicionar post</button>}
      <dialog ref={composerDialog} id="create-post-dialog" aria-label="Adicionar post" onCancel={event => { event.preventDefault(); setComposing(false); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel p-0 text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm">
        {user && <CreatePostPage embedded onCancel={() => setComposing(false)} onPublished={post => { setPosts(current => [post, ...current]); setComposing(false); setComposerVersion(version => version + 1); }} key={composerVersion} />}
      </dialog>
    </div>
  );
}

export default HomePage;
