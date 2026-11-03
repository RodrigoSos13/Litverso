import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
export const reasons = { assedio: "Assédio ou bullying", odio: "Discurso de ódio", spam: "Spam ou golpe", conteudo_inadequado: "Conteúdo inadequado", direitos_autorais: "Violação de direitos autorais", outro: "Outros" };
export default function ReportButton({ tipo, alvo, onClose }) {
  const id = useId();
  const dialog = useRef(null);
  useEffect(() => {
    const modal = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  const [motivo, setMotivo] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!motivo || (motivo === "outro" && !detalhes.trim()) || busy) return;
    setBusy(true); setMessage("");
    try { const { data } = await api.post("/reports", { tipo, alvo, motivo, detalhes: motivo === "outro" ? detalhes.trim() : "" }); setMessage(data.message); setSent(true); }
    catch (error) { setMessage(error.response?.data?.message || "Não foi possível enviar. Tente novamente."); }
    finally { setBusy(false); }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }} onClick={event => {
    event.stopPropagation();
    if (event.target === event.currentTarget && !busy) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }
  }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel p-0 text-sm text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm">
    <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
      <h2 id={`${id}-title`} className="font-semibold text-red-300">Denunciar {tipo === "comentario" ? "comentário" : "publicação"}</h2>
      <button type="button" disabled={busy} onClick={onClose} aria-label="Fechar denúncia" className="flex h-9 w-9 items-center justify-center rounded-full text-mist transition hover:bg-panelSoft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    </div>
    <div className="p-5">
    {sent ? <><p role="status" className="text-copper">{message}</p><button type="button" onClick={onClose} className="mt-3 rounded-lg border border-line px-3 py-2 text-xs">Fechar</button></> : <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy}>
        <legend className="font-semibold text-ink">Por que você está denunciando {tipo === "comentario" ? "este comentário" : "esta publicação"}?</legend>
        <div className="mt-3 space-y-1">{Object.entries(reasons).map(([value, label], index) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${motivo === value ? "border-copper/40 bg-copper/5 text-ink" : "border-transparent text-mist hover:bg-panel"}`}><input autoFocus={index === 0} type="radio" name={`${id}-reason`} value={value} checked={motivo === value} onChange={() => setMotivo(value)} required className="accent-copper" />{label}</label>)}</div>
      </fieldset>
      {motivo === "outro" && <label className="block text-xs text-mist" htmlFor={`${id}-details`}>Conte por que você está denunciando<textarea id={`${id}-details`} required maxLength={1000} rows={3} disabled={busy} value={detalhes} onChange={event => setDetalhes(event.target.value)} placeholder="Descreva o que aconteceu…" className="mt-2 block w-full resize-y rounded-xl border border-line bg-panel p-3 text-sm text-ink outline-none focus:border-copper" /><span className="mt-1 block text-right text-[10px]">{detalhes.length}/1000</span></label>}
      {message && <p role="alert" className="text-xs text-red-300">{message}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs text-mist hover:text-ink disabled:opacity-50">Cancelar</button><button disabled={busy || !motivo || (motivo === "outro" && !detalhes.trim())} className="rounded-xl bg-red-500/90 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50">{busy ? "Enviando…" : "Enviar denúncia"}</button></div>
    </form>}
    </div>
  </dialog>, document.body);
}
