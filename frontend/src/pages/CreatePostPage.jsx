import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import api from "../services/api";
import SearchBar from "../components/SearchBar";
import PostText from "../components/PostText";
import BookCover from "../components/BookCover";

const postTypes = [
  { value: "opiniao", label: "Pensamento", hint: "Uma ideia, uma descoberta ou aquela leitura que não sai da cabeça.", placeholder: "O que a sua última leitura despertou em você?" },
  { value: "resenha", label: "Resenha", hint: "Conte sua experiência com uma leitura e abra espaço para a conversa.", placeholder: "O que você achou do livro? Compartilhe suas impressões…" },
  { value: "citacao", label: "Citação", hint: "Dê um novo lugar àquelas palavras que ficaram com você.", placeholder: "Compartilhe um trecho marcante e lembre de citar a autoria…" },
];

export default function CreatePostPage({ embedded = false, onPublished, onCancel }) {
  const [tipo, setTipo] = useState("opiniao");
  const [texto, setTexto] = useState("");
  const [livro, setLivro] = useState(null);
  const [showBookSearch, setShowBookSearch] = useState(false);
  const [images, setImages] = useState([]);
  const [imageError, setImageError] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const textInput = useRef(null);
  const selection = useRef(0);
  const { currentUserId } = useOutletContext();
  const navigate = useNavigate();
  const selectedType = postTypes.find(type => type.value === tipo);

  useEffect(() => {
    return () => { selection.current++; };
  }, []);

  useLayoutEffect(() => {
    const field = textInput.current;
    if (!field) return;
    function resize() {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    }
    resize();
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width !== previousWidth) {
        previousWidth = width;
        resize();
      }
    });
    let previousWidth = field.getBoundingClientRect().width;
    observer.observe(field);
    return () => observer.disconnect();
  }, [texto]);

  function formatText(marker) {
    const field = textInput.current;
    if (!field || busy) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = texto.slice(start, end);
    const wrapped = selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2;
    const surrounded = start >= marker.length && texto.slice(start - marker.length, start) === marker && texto.slice(end, end + marker.length) === marker;
    let next, selectionStart, selectionEnd;
    if (surrounded) {
      next = texto.slice(0, start - marker.length) + selected + texto.slice(end + marker.length);
      selectionStart = start - marker.length;
      selectionEnd = end - marker.length;
    } else if (wrapped) {
      next = texto.slice(0, start) + selected.slice(marker.length, -marker.length) + texto.slice(end);
      selectionStart = start;
      selectionEnd = end - marker.length * 2;
    } else {
      next = texto.slice(0, start) + marker + selected + marker + texto.slice(end);
      selectionStart = start + marker.length;
      selectionEnd = end + marker.length;
    }
    if (next.length > 1000) return;
    setTexto(next);
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(selectionStart, selectionEnd); });
  }

  async function selectImages(files) {
    if (!files?.length || busy || reading) return;
    const batch = Array.from(files);
    setImageError("");
    if (images.length + batch.length > 4) {
      setImageError("Você pode adicionar até 4 fotos.");
      return;
    }
    if (batch.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setImageError("Selecione imagens JPG, PNG ou WebP de até 5 MB cada.");
      return;
    }
    if (images.reduce((total, image) => total + image.size, 0) + batch.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) {
      setImageError("As fotos juntas devem ter até 10 MB.");
      return;
    }
    const version = ++selection.current;
    setReading(true);
    try {
      const added = await Promise.all(batch.map(async file => {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await new Promise((resolve, reject) => {
          const preview = new Image();
          preview.onload = resolve;
          preview.onerror = reject;
          preview.src = data;
        });
        return { data, name: file.name, size: file.size };
      }));
      if (version === selection.current) setImages(current => [...current, ...added]);
    } catch {
      if (version === selection.current) setImageError("Não foi possível abrir uma das imagens. Tente outros arquivos.");
    } finally {
      if (version === selection.current) setReading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!currentUserId || busy || reading || !texto.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/posts", { tipo, texto: texto.trim(), livro: livro?._id || null, usuario: currentUserId, imagens: tipo === "citacao" ? [] : images.map(image => image.data) }, { timeout: 30000 });
      if (onPublished) onPublished(data);
      else navigate("/");
    } catch (failure) {
      setError(failure.response?.data?.message || "Não foi possível publicar. Seu texto e sua imagem foram mantidos para tentar novamente.");
    } finally { setBusy(false); }
  }

  return (
    <section className={embedded ? "w-full" : "mx-auto max-w-3xl pb-6"}>
      {!embedded && <header className="mb-7 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-copper">Entre leitores</p>
        <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">Toda leitura rende uma conversa.</h1>
        <p className="mt-3 text-sm leading-relaxed text-mist">Compartilhe o que ficou com você e encontre novas perspectivas.</p>
      </header>}

      <form onSubmit={handleSubmit} aria-busy={busy} className={embedded ? "bg-panel" : "rounded-2xl border border-line bg-panel shadow-card"}>
        <fieldset disabled={busy} className="min-w-0 p-5 sm:p-6">
          <legend className="sr-only">Adicionar post</legend>
          {embedded && <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-ink">Criar publicação</h3>
            <button type="button" onClick={onCancel} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-full text-mist transition hover:bg-panelSoft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>}
          <fieldset>
            <legend className="sr-only">Tipo de publicação</legend>
            <div className="flex flex-wrap gap-1 rounded-xl bg-midnight/40 p-1">
              {postTypes.map(type => (
                <label key={type.value} className="relative flex-1 cursor-pointer">
                  <input type="radio" name="tipo" value={type.value} checked={tipo === type.value} onChange={() => setTipo(type.value)} className="peer sr-only" />
                  <span className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-mist transition hover:text-ink peer-checked:bg-panelSoft peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-copper">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-colors ${tipo === type.value ? "text-copper" : "text-mist/70"}`}>
                      {type.value === "opiniao" && <><path d="M7 16a4 4 0 0 1-3.5-6A4.5 4.5 0 0 1 9 4.5a5 5 0 0 1 8.5 1.8A4.5 4.5 0 0 1 18 15h-7" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="4" cy="22" r=".5" /></>}
                      {type.value === "resenha" && <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M8 8h3M8 12h2M8 16h5" /><path d="m14 12 1-4 5-5a1.4 1.4 0 0 1 2 2l-5 5-3 2ZM18 5l2 2" /></>}
                      {type.value === "citacao" && <><path d="M20 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" /><path d="M8 8H7v3h3V8c0-1 .5-2 1-2M14 8h-1v3h3V8c0-1 .5-2 1-2" /></>}
                    </svg>{type.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-midnight/30 focus-within:border-copper/60 focus-within:ring-2 focus-within:ring-copper/10">
            <label htmlFor="texto" className="sr-only">Texto da publicação</label>
            <textarea ref={textInput} onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && ["b", "i"].includes(event.key.toLowerCase())) {
                event.preventDefault(); formatText(event.key.toLowerCase() === "b" ? "**" : "*");
              }
            }} id="texto" value={texto} onChange={event => setTexto(event.target.value)} required maxLength={1000} rows={5} placeholder={selectedType.placeholder} className="block w-full resize-none overflow-hidden border-0 bg-transparent min-h-[160px] p-4 text-sm leading-6 text-ink outline-none placeholder:text-mist/60" />
            <div className="flex items-center justify-between gap-3 px-3 pb-2 text-[11px] text-mist/60">
            <div role="toolbar" aria-label="Formatação do texto" className="flex items-center gap-0.5">
              <button type="button" title="Negrito (Ctrl+B)" aria-label="Negrito" onMouseDown={event => event.preventDefault()} onClick={() => formatText("**")} className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-mist hover:bg-panelSoft hover:text-ink">B</button>
              <button type="button" title="Itálico (Ctrl+I)" aria-label="Itálico" onMouseDown={event => event.preventDefault()} onClick={() => formatText("*")} className="flex h-7 w-7 items-center justify-center rounded-md font-display text-sm italic text-mist hover:bg-panelSoft hover:text-ink">I</button>
            </div>
              <span className="shrink-0 tabular-nums">{texto.length}/1000</span>
            </div>
          </div>

          {texto.trim() && /\*[^*]+\*/.test(texto) && <details className="mt-3 rounded-lg bg-midnight/20 px-3 py-2">
            <summary className="cursor-pointer text-xs text-mist">Ver prévia da formatação</summary>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink"><PostText text={texto} /></p>
          </details>}

          {tipo !== "citacao" && <div className={`mt-3 rounded-xl transition ${dragging ? "bg-copper/10 ring-1 ring-copper" : ""}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectImages(event.dataTransfer.files); }}>
            <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" tabIndex={-1} onChange={event => { selectImages(event.target.files); event.target.value = ""; }} />
            {images.length > 0 && <div className={`mb-3 grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {images.map((image, index) => <div key={`${index}-${image.name}`} className="relative overflow-hidden rounded-xl border border-line bg-midnight">
                <img src={image.data} alt={`Foto ${index + 1}: ${image.name}`} className="h-36 w-full object-cover sm:h-44" />
                <button type="button" disabled={reading} aria-label={`Remover foto ${index + 1}`} onClick={() => { setImages(current => current.filter((_, position) => position !== index)); setImageError(""); }} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-midnight/80 text-lg text-white hover:bg-midnight disabled:opacity-50">×</button>
              </div>)}
            </div>}
            <div className="flex items-center gap-3">
              <button type="button" disabled={reading || images.length >= 4} onClick={() => input.current?.click()} aria-describedby="image-help" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-copper transition hover:bg-copper/10 disabled:opacity-40">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>
                {reading ? "Preparando…" : "Adicionar fotos"}
              </button>
              <span id="image-help" className="text-xs text-mist/60">{images.length ? `${images.length}/4 fotos` : "Até 4 fotos"}</span>
            </div>
            {imageError && <p role="alert" className="mt-2 text-sm text-red-300">{imageError}</p>}
            {reading && <span role="status" className="sr-only">Preparando imagens</span>}
          </div>}

          <div className="mt-2">
            {!livro && <button type="button" aria-expanded={showBookSearch} aria-controls="post-book-search" onClick={() => setShowBookSearch(current => !current)} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-copper transition hover:bg-copper/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></svg>
              Vincular livro <span className="text-xs text-mist/60">Opcional</span>
            </button>}
            <div id="post-book-search" hidden={!livro && !showBookSearch} className="mt-2">
            <label htmlFor="livro" className="sr-only">Livro relacionado</label>
            {livro ? (
              <div className="flex items-center gap-3 rounded-xl border border-copper/30 bg-copper/5 p-3">
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-midnight"><BookCover url={livro.urlCapa} title={livro.titulo} /></div>
                <div className="min-w-0 flex-1"><p className="truncate font-display text-base text-ink">{livro.titulo}</p><p className="mt-1 truncate text-xs text-mist">{livro.autor}</p></div>
                <button id="livro" type="button" onClick={() => setLivro(null)} aria-label={`Remover vínculo com ${livro.titulo}`} className="rounded-lg px-3 py-2 text-xs text-mist hover:text-ink">Remover</button>
              </div>
            ) : <SearchBar placement="top" inputId="livro" onSelect={setLivro} disabled={busy} className="relative w-full" />}
            </div>
          </div>
        </fieldset>
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
          {!currentUserId && <p className="mr-auto text-xs text-mist">Entre na sua conta para publicar.</p>}
          {embedded && <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-mist transition hover:bg-panelSoft hover:text-ink disabled:opacity-50">Cancelar</button>}
          <button type="submit" disabled={!currentUserId || !texto.trim() || reading || busy} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-berry disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Publicando…" : "Publicar"}</button>
          {error && <p role="alert" className="w-full text-sm text-red-300">{error}</p>}
        </footer>
      </form>
    </section>
  );
}
