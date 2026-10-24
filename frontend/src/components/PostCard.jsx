import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import api from "../services/api";
import PostText from "./PostText";
import BookCover from "./BookCover";

function PostCard({ post, currentUserId, fullWidth = false, feedPreview = false, showBook = true, onPinned, onDeleted }) {
  const [deleted, setDeleted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const [textOverflows, setTextOverflows] = useState(false);
  const textElement = useRef(null);

  useEffect(() => {
    if (!feedPreview || expanded || textExpanded || deleted) return;
    const element = textElement.current;
    if (!element) return;
    const measure = () => setTextOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [feedPreview, expanded, textExpanded, deleted, post.texto]);
  const dialog = useRef(null);
  const cardElement = useRef(null);
  const [cardHeight, setCardHeight] = useState(0);

  function openPost() {
    setCardHeight(cardElement.current?.offsetHeight || 0);
    setExpanded(true);
  }
  const openTrigger = useRef(null);

  useEffect(() => {
    if (!expanded || deleted) return;
    const modal = dialog.current;
    modal.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      openTrigger.current?.focus();
    };
  }, [expanded, deleted]);

  const images = post.imagens?.length ? post.imagens : post.urlImagem ? [post.urlImagem] : [];
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [post.usuario?.urlAvatar]);
  const [commentText, setCommentText] = useState("");
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [activeCommentMenu, setActiveCommentMenu] = useState(null);
  const commentMenuRef = useRef(null);
  const commentMenuTriggerRef = useRef(null);

  useEffect(() => {
    if (!activeCommentMenu) return;
    function dismiss(event) {
      if (!commentMenuRef.current?.contains(event.target)) setActiveCommentMenu(null);
    }
    function escape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setActiveCommentMenu(null);
        commentMenuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
    };
  }, [activeCommentMenu]);

  useEffect(() => {
    if (!expanded) { setActiveCommentMenu(null); setCommentToDelete(null); }
  }, [expanded]);
  const [deletingComment, setDeletingComment] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinned, setPinned] = useState(Boolean(post.fixadoNoPerfil));
  const [pinning, setPinning] = useState(false);
  const menu = useRef(null);
  const menuTrigger = useRef(null);
  useEffect(() => { setPinned(Boolean(post.fixadoNoPerfil)); }, [post.fixadoNoPerfil]);
  useEffect(() => {
    if (!menuOpen) return;
    function close(event) { if (!menu.current?.contains(event.target)) setMenuOpen(false); }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isAuthor = Boolean(currentUserId) && String(post.usuario?._id || post.usuario) === String(currentUserId);
  const [liking, setLiking] = useState(false);
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState(Boolean(post.curtido));
  const [likeCount, setLikeCount] = useState(post.totalCurtidas || 0);
  const [comments, setComments] = useState([]);
  const commentLikesPending = useRef(new Set());
  const [likingComments, setLikingComments] = useState(new Set());
  const [commentCount, setCommentCount] = useState(post.totalComentarios || 0);
  const showComments = expanded;
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setLiked(Boolean(post.curtido));
    setLikeCount(post.totalCurtidas || 0);
  }, [post.curtido, post.totalCurtidas]);

  useEffect(() => {
    if (!showComments) return;
    const controller = new AbortController();
    setLoadingComments(true);
    setCommentsError("");
    api.get("/comments", { params: { post: post._id }, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) { setComments(data); setCommentCount(data.length); }
      })
      .catch(() => { if (!controller.signal.aborted) setCommentsError("Não foi possível carregar os comentários."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingComments(false); });
    return () => controller.abort();
  }, [post._id, showComments, retry]);

  async function handleLike() {
    if (!currentUserId || liking) return;
    setLiking(true);
    setError("");
    try {
      if (liked) await api.delete(`/likes/${post._id}/${currentUserId}`);
      else await api.post("/likes", { publicacao: post._id });
      setLiked(!liked);
      setLikeCount(count => Math.max(0, count + (liked ? -1 : 1)));
    } catch {
      setError("Não foi possível atualizar sua curtida. Tente novamente.");
    } finally { setLiking(false); }
  }

  async function handleDeleteComment(commentId) {
    if (!isAuthor || deletingComment) return;
    setDeletingComment(true);
    setError("");
    try {
      await api.delete(`/comments/${commentId}`);
      setComments(current => current.filter(comment => comment._id !== commentId));
      setCommentCount(count => Math.max(0, count - 1));
      setCommentToDelete(null);
      setRetry(value => value + 1);
    } catch {
      setError("Não foi possível apagar o comentário. Tente novamente.");
    } finally { setDeletingComment(false); }
  }

  async function handleCommentLike(comment) {
    if (!currentUserId || commentLikesPending.current.has(comment._id)) return;
    commentLikesPending.current.add(comment._id);
    setLikingComments(new Set(commentLikesPending.current));
    setError("");
    try {
      const { data } = await api[comment.curtido ? "delete" : "put"](`/comments/${comment._id}/like`);
      setComments(current => current.map(item => item._id === data._id ? data : item));
    } catch {
      setError("Não foi possível atualizar a curtida do comentário. Tente novamente.");
    } finally {
      commentLikesPending.current.delete(comment._id);
      setLikingComments(new Set(commentLikesPending.current));
    }
  }

  async function handleComment(event) {
    event.preventDefault();
    if (!currentUserId || !commentText.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const { data } = await api.post("/comments", { publicacao: post._id, texto: commentText.trim() });
      setComments(current => [data, ...current.filter(comment => comment._id !== data._id)]);
      setCommentCount(count => count + 1);
      setRetry(value => value + 1);
      setCommentText("");
    } catch {
      setError("Não foi possível enviar o comentário. Tente novamente.");
    } finally { setSending(false); }
  }

  async function handlePin() {
    if (!isAuthor || pinning) return;
    setPinning(true);
    setError("");
    try {
      const { data } = await api.patch(`/posts/${post._id}/pin`, { fixadoNoPerfil: !pinned });
      setPinned(data.fixadoNoPerfil);
      setMenuOpen(false);
      onPinned?.();
    } catch { setError("Não foi possível atualizar a fixação. Tente novamente."); }
    finally { setPinning(false); }
  }

  async function handleDelete() {
    if (!isAuthor || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/posts/${post._id}`);
      setDeleted(true);
      onDeleted?.(post._id);
    } catch {
      setError("Não foi possível apagar a publicação. Tente novamente.");
    } finally { setDeleting(false); }
  }

  if (deleted) return null;

  const card = (
    <article ref={expanded ? undefined : cardElement} onClick={event => {
      if (!expanded && !event.target.closest("a, button, input, form") && !window.getSelection()?.toString()) openPost();
    }} className={expanded ? "grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden md:grid-rows-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : `mx-auto w-full min-w-0 cursor-pointer transition-transform duration-200 motion-safe:hover:scale-[1.015] motion-reduce:transition-none rounded-2xl border border-line bg-panel p-4 shadow-card sm:p-5 ${fullWidth ? "" : "max-w-[560px]"}`}>
      <div className={expanded ? "min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4 sm:p-6" : ""}>
      {expanded && <h2 id={`post-title-${post._id}`} className="sr-only">Publicação de {post.usuario?.nome || "Leitor"}</h2>}
      <div className={`flex items-start justify-between gap-4 ${expanded ? "pr-12 md:pr-0" : ""}`}>
        <Link to={`/users/${post.usuario?._id || post.usuario}`} className="flex min-w-0 items-center gap-3 rounded-lg text-white transition hover:text-glow">
          {post.usuario?.urlAvatar && !avatarFailed ? (
            <img src={post.usuario.urlAvatar} alt="" onError={() => setAvatarFailed(true)} className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-line" />
          ) : <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest/25 font-display text-xl text-glow">{post.usuario?.nome?.slice(0, 1).toUpperCase() || "L"}</span>}
          <div className="min-w-0">
            <p className="truncate font-semibold">{post.usuario?.nome || "Usuário desconhecido"}</p>
            {post.usuario?.usuario && <p className="truncate text-sm text-mist">@{post.usuario.usuario}</p>}
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-glow">{post.tipo}</span>
          {isAuthor && <div ref={menu} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }} onKeyDown={event => {
            if (event.key === "Escape") { setMenuOpen(false); menuTrigger.current?.focus(); }
          }}>
            <button ref={menuTrigger} type="button" aria-label="Opções da publicação" aria-expanded={menuOpen} aria-controls={`post-options-${post._id}`} onClick={() => setMenuOpen(current => !current)} className="flex h-9 w-9 items-center justify-center rounded-full text-mist hover:bg-panelSoft hover:text-ink">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
            {menuOpen && <div id={`post-options-${post._id}`} className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-card">
              <button type="button" disabled={pinning} onClick={handlePin} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-panelSoft disabled:opacity-50">{pinning ? "Salvando…" : pinned ? "Desfixar do perfil" : "Fixar no perfil"}</button>
              <button type="button" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-400/10">Apagar</button>
            </div>}
          </div>}
        </div>
      </div>
      {pinned && <p className="mt-3 text-xs text-copper">Fixado no perfil</p>}

      {confirmDelete && <div role="group" aria-label="Confirmar exclusão da publicação" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
        <p className="text-sm text-ink">Apagar esta publicação?</p>
        <p className="mt-1 text-xs text-mist">As fotos, curtidas e comentários também serão removidos. Esta ação não pode ser desfeita.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-2 text-sm text-mist hover:text-ink">Cancelar</button>
          <button type="button" disabled={deleting} onClick={handleDelete} className="rounded-lg bg-forest px-3 py-2 text-sm font-semibold text-white hover:bg-berry disabled:opacity-50">{deleting ? "Apagando…" : "Apagar"}</button>
        </div>
      </div>}

      {showBook && post.livro && (
        <p className="mt-4 text-sm text-mist">
          Livro: {" "}
          <span className="group relative inline-block max-w-full align-bottom">
            <Link to={`/books/${post.livro._id || post.livro}`} className="rounded-sm text-copper underline-offset-4 hover:underline focus-visible:underline">
              {post.livro.titulo}
            </Link>
            <span aria-hidden="true" className="pointer-events-none invisible absolute bottom-full left-0 z-30 w-36 translate-y-1 pb-3 opacity-0 transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <span className="block aspect-[2/3] overflow-hidden rounded-xl border border-line bg-panel p-2 shadow-card">
                <BookCover url={post.livro.urlCapa} title={post.livro.titulo} />
              </span>
            </span>
          </span>
        </p>
      )}

      <p ref={textElement} id={`post-text-${post._id}-${expanded ? "dialog" : "feed"}`} className={`mt-4 whitespace-pre-line break-words text-sm leading-6 text-slate-300 ${feedPreview && !expanded && !textExpanded ? "line-clamp-[10]" : ""}`}><PostText text={post.texto} /></p>
      {feedPreview && !expanded && (textOverflows || textExpanded) && <button type="button" onClick={event => { event.stopPropagation(); setTextExpanded(current => !current); }} aria-expanded={textExpanded} aria-controls={`post-text-${post._id}-feed`} className="mt-2 rounded text-xs font-semibold text-copper hover:text-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">{textExpanded ? "Mostrar menos" : "Continuar lendo"}</button>}

      {images.length > 0 && (
        <div style={feedPreview && !expanded ? { maxHeight: 420 } : undefined} className={`mt-4 grid gap-1 overflow-hidden rounded-xl border border-line/60 bg-midnight ${images.length > 1 ? "aspect-square grid-cols-2 grid-rows-2" : "grid-cols-1"}`}>
          {images.map((src, index) => <a key={index} onClick={event => { if (!expanded) { event.preventDefault(); openPost(); } }} href={src} target="_blank" rel="noreferrer" aria-label={`Abrir foto ${index + 1}`} className={`relative block min-h-0 min-w-0 overflow-hidden ${images.length === 2 || (images.length === 3 && index === 0) ? "row-span-2" : ""}`}>
            <img src={src} alt={`Imagem ${index + 1} da publicação`} loading="lazy" className={images.length === 1 ? (feedPreview && !expanded ? "block max-h-[420px] w-full object-contain" : "block h-auto w-full") : "absolute inset-0 block h-full w-full object-cover"} />
          </a>)}
        </div>
      )}

      <div className="mt-4 flex items-center gap-5 border-t border-line/60 pt-3 text-sm text-mist">
        <button type="button" onClick={handleLike} disabled={!currentUserId || liking} aria-label={liked ? "Descurtir publicação" : "Curtir publicação"} aria-pressed={liked} className={`inline-flex items-center gap-2 rounded-lg p-2 transition hover:bg-forest/10 hover:text-forest disabled:opacity-50 ${liked ? "text-forest" : "text-mist"}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
          <span className="tabular-nums">{likeCount}<span className="sr-only"> curtidas</span></span>
        </button>
        <button type="button" ref={expanded ? undefined : openTrigger} onClick={() => { if (expanded) dialog.current?.querySelector("input")?.focus(); else openPost(); }} aria-haspopup="dialog" aria-expanded={expanded} aria-controls={`comments-${post._id}`} className="inline-flex items-center gap-2 rounded-lg p-2 hover:bg-panelSoft hover:text-ink">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-10A9 9 0 0 1 21 11.5Z" /></svg>
          {commentCount} {commentCount === 1 ? "comentário" : "comentários"}
        </button>
      </div>

      </div>

      {expanded && <section aria-label="Comentários" className="flex min-h-0 min-w-0 flex-col border-t border-line bg-panel md:min-h-0 md:border-l md:border-t-0">
      <h3 className="shrink-0 pl-4 pr-16 pt-4 font-display text-2xl text-ink sm:pl-6 sm:pr-16 sm:pt-6">Comentários <span className="text-base text-mist">({commentCount})</span></h3>
      {showComments && <div id={`comments-${post._id}`} className="mt-3 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain border-t border-line/60 p-4 sm:p-6 md:max-h-none">
        {loadingComments && <p role="status" className="text-xs text-mist">Carregando comentários…</p>}
        {commentsError && <div role="alert" className="text-sm text-red-300">{commentsError}<button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">Tentar novamente</button></div>}
        {!loadingComments && !commentsError && !comments.length && <p className="text-sm text-mist">Comece a conversa. Deixe o primeiro comentário.</p>}
        {comments.map(comment => <article key={comment._id} className="flex items-start gap-3">
          <Link to={`/users/${comment.usuario?._id || comment.usuario}`} aria-label={`Perfil de ${comment.usuario?.nome || "Leitor"}`} className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest/20 text-sm font-semibold text-glow ring-1 ring-line/50">
            {comment.usuario?.nome?.slice(0, 1).toUpperCase() || "L"}
            {comment.usuario?.urlAvatar && <img src={comment.usuario.urlAvatar} alt="" onError={event => { event.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover" />}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <Link to={`/users/${comment.usuario?._id || comment.usuario}`} className="text-sm font-semibold text-ink transition hover:text-copper">{comment.usuario?.nome || "Leitor"}</Link>
              {comment.createdAt && <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString("pt-BR")} className="text-[11px] text-mist/60">{new Date(comment.createdAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</time>}
            </div>
            {isAuthor && <div className="relative -mt-1 shrink-0" ref={activeCommentMenu === comment._id ? commentMenuRef : undefined}>
              <button type="button" aria-label={`Opções do comentário de ${comment.usuario?.nome || "Leitor"}`} aria-expanded={activeCommentMenu === comment._id} aria-controls={`comment-options-${comment._id}`} disabled={deletingComment}
                onClick={event => { commentMenuTriggerRef.current = event.currentTarget; setActiveCommentMenu(current => current === comment._id ? null : comment._id); }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-mist/70 transition hover:bg-panelSoft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-50">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
              </button>
              {activeCommentMenu === comment._id && <div id={`comment-options-${comment._id}`} className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-line bg-panel p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                <button type="button" onClick={() => { setActiveCommentMenu(null); setCommentToDelete(comment._id); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-red-300 transition hover:bg-red-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
                  Apagar
                </button>
              </div>}
            </div>}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{comment.texto}</p>
            <button type="button" onClick={() => handleCommentLike(comment)} disabled={!currentUserId || likingComments.has(comment._id)} aria-pressed={Boolean(comment.curtido)} aria-label={`${comment.curtido ? "Descurtir" : "Curtir"} comentário de ${comment.usuario?.nome || "Leitor"}`} className={`-ml-2 mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-50 ${comment.curtido ? "text-copper" : "text-mist/70 hover:text-copper"}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill={comment.curtido ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
              <span>{comment.curtido ? "Curtido" : "Curtir"}</span>
              {comment.totalCurtidas > 0 && <span className="tabular-nums">· {comment.totalCurtidas}</span>}
            </button>

            {isAuthor && commentToDelete === comment._id && <div role="group" aria-label="Confirmar exclusão do comentário" className="mt-2 rounded-xl border border-red-400/20 bg-red-400/5 p-3">
              <p className="text-xs text-ink">Apagar este comentário? Esta ação não pode ser desfeita.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" disabled={deletingComment} onClick={() => setCommentToDelete(null)} className="rounded-lg px-3 py-2 text-xs text-mist hover:text-ink disabled:opacity-50">Cancelar</button>
                <button type="button" disabled={deletingComment} onClick={() => handleDeleteComment(comment._id)} className="rounded-lg bg-forest px-3 py-2 text-xs font-semibold text-white hover:bg-berry disabled:opacity-50">{deletingComment ? "Apagando…" : "Apagar comentário"}</button>
              </div>
            </div>}
          </div>
        </article>)}
      </div>}

      {currentUserId && <form className="sticky bottom-0 z-10 flex shrink-0 gap-2 border-t border-line bg-panel p-4 sm:p-6" onSubmit={handleComment}>
        <label htmlFor={`comment-${post._id}`} className="sr-only">Escreva um comentário</label>
        <input id={`comment-${post._id}`} type="text" maxLength={500} disabled={sending} value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Escreva um comentário…" className="min-w-0 flex-1 rounded-full border border-line bg-panelSoft px-4 py-2 text-sm outline-none focus:border-copper" />
        <button type="submit" disabled={sending || !commentText.trim()} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-berry disabled:opacity-50">{sending ? "Enviando…" : "Enviar"}</button>
      </form>}
      </section>}
      {error && <p role="alert" className="m-4 text-sm text-red-300 md:col-span-2">{error}</p>}
    </article>
  );

  return <>
    <div className={feedPreview ? "min-w-0" : "p-2"}>
      {expanded ? <div aria-hidden="true" className="w-full rounded-2xl border border-line bg-panel" style={{ height: cardHeight }} /> : card}
    </div>
    {createPortal(<dialog ref={dialog} aria-labelledby={`post-title-${post._id}`} onCancel={event => { event.preventDefault(); setExpanded(false); }} className="m-auto h-[85dvh] max-h-[90dvh] w-[calc(100%-2rem)] max-w-6xl overflow-hidden open:flex open:flex-col rounded-3xl border border-line bg-panel p-0 text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      {expanded && <>
        <button type="button" aria-label="Fechar publicação" onClick={() => setExpanded(false)} className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-panel text-mist hover:bg-panelSoft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" autoFocus><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        {card}
      </>}
    </dialog>, document.body)}
  </>;
}

export default PostCard;
