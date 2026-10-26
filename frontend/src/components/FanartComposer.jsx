import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const maxSize = 5 * 1024 * 1024;
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

export default function FanartComposer({ bookId, onPublished }) {
  const { requireLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [success, setSuccess] = useState(false);
  const input = useRef(null);
  const selection = useRef(0);
  const dialog = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    modal.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      selection.current++;
      modal.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus();
    };
  }, [open]);

  async function selectImage(file) {
    if (!file || busy) return;
    const version = ++selection.current;
    setError("");
    setProcessing(false);
    if (!allowedTypes.includes(file.type) || file.size > maxSize) {
      setError("Envie uma imagem JPG, PNG ou WebP de até 5 MB.");
      return;
    }
    setProcessing(true);
    try {
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
      if (version === selection.current) setImage({ data, name: file.name });
    } catch {
      if (version === selection.current) setError("Não foi possível abrir essa imagem. Tente outra.");
    } finally {
      if (version === selection.current) setProcessing(false);
    }
  }

  function close() {
    selection.current++;
    setOpen(false);
    setImage(null);
    setCaption("");
    setProcessing(false);
    setDragging(false);
    setError("");
  }

  async function publish(event) {
    event.preventDefault();
    if (!image || busy || processing || !caption.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/posts", { livro: bookId, tipo: "fanart", texto: caption.trim(), urlImagem: image.data });
      close();
      setSuccess(true);
      try {
        await onPublished();
      } catch {
        setError("Sua fanart foi salva. Recarregue a página para atualizar a galeria.");
      }
    } catch {
      setError("Não foi possível publicar sua fanart. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5">
      {success && <p role="status" className="mb-4 text-sm text-glow">Sua fanart foi publicada!</p>}
      {!open && error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
        <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="fanart-dialog" onClick={() => { if (requireLogin("publicar uma fanart")) setOpen(true); setSuccess(false); setError(""); }} className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white transition hover:bg-berry focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
          <span aria-hidden="true" className="text-xl">+</span> Adicionar fanart
        </button>
      {open && createPortal(
        <dialog ref={dialog} id="fanart-dialog" aria-labelledby="fanart-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }} onClick={event => { if (event.target === event.currentTarget && !busy) close(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-line bg-panel p-0 text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm">
        <form onSubmit={publish} aria-busy={busy || processing}>
          <header className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-6">
            <h2 id="fanart-title" className="min-w-0 font-display text-2xl text-white sm:text-3xl">Compartilhe sua arte</h2>
            <button type="button" aria-label="Fechar criação de fanart" disabled={busy} onClick={close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl text-mist transition hover:bg-panelSoft hover:text-white focus-visible:outline-copper disabled:opacity-50">×</button>
          </header>
          <div className="p-5 sm:px-8 sm:py-6">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" tabIndex={-1} onChange={(event) => { selectImage(event.target.files?.[0]); event.target.value = ""; }} />
          <div className={`rounded-2xl border border-dashed p-4 transition ${dragging ? "border-copper bg-copper/10" : "border-line bg-midnight/40"}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectImage(event.dataTransfer.files?.[0]); }}>
            {image ? (
              <div>
                <img src={image.data} alt="Prévia da fanart que será publicada" className="mx-auto max-h-72 max-w-full rounded-xl object-contain" />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 break-all text-sm text-mist">{image.name}</p>
                  <button type="button" disabled={busy} onClick={() => input.current.click()} className="rounded-full border border-line px-4 py-2 text-sm text-copper hover:border-copper disabled:opacity-50">Trocar imagem</button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => input.current.click()} className="flex w-full flex-col items-center rounded-xl px-3 py-8 text-center focus-visible:outline focus-visible:outline-copper">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 h-10 w-10 text-copper"><path d="M12 16V3m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
                <span className="font-semibold text-white">Envie sua imagem</span>
                <span className="mt-1 text-sm text-mist">Arraste aqui ou clique para selecionar</span>
                <span className="mt-3 text-xs text-mist">JPG, PNG ou WebP · até 5 MB</span>
              </button>
            )}
          </div>
          {processing && <p role="status" className="mt-3 text-sm text-mist">Preparando sua imagem…</p>}
          <label htmlFor="fanart-caption" className="mb-2 mt-5 block text-sm font-semibold text-mist">Legenda</label>
          <textarea id="fanart-caption" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1000} required disabled={busy} rows={3} placeholder="Conte o que inspirou sua arte…" className="w-full rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm focus:border-copper focus:outline-none" />
          <p className="mt-1 text-right text-xs text-mist">{caption.length}/1000</p>
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
          </div>
          <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-line bg-panel px-5 py-4 sm:px-8">
            <button type="button" disabled={busy} onClick={close} className="rounded-xl px-5 py-3 text-sm text-mist hover:bg-panelSoft hover:text-white disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={busy || processing || !image || !caption.trim()} className="rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-berry disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Publicando…" : "Publicar fanart"}</button>
          </footer>
        </form>
        </dialog>, document.body
      )}
    </div>
  );
}
