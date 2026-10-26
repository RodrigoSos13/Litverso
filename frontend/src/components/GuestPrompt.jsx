import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

export default function GuestPrompt({ action, onClose }) {
  const dialog = useRef(null);
  const location = useLocation();
  useEffect(() => {
    if (!action) return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => { element.close(); previousFocus?.focus(); };
  }, [action]);
  if (!action) return null;
  return createPortal(<dialog ref={dialog} aria-labelledby="guest-prompt-title" aria-describedby="guest-prompt-description" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-3xl border border-copper/25 bg-panel p-0 text-ink shadow-[0_24px_100px_rgba(0,0,0,0.6)] backdrop:bg-black/70 backdrop:backdrop-blur-sm">
    <div className="relative border-b border-line bg-[radial-gradient(ellipse_at_top,rgba(197,59,76,0.2),transparent_75%)] px-7 pb-6 pt-9">
      <button type="button" onClick={onClose} aria-label="Fechar convite" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-mist hover:bg-white/5 hover:text-white focus-visible:outline-copper">✕</button>
      <span aria-hidden="true" className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-copper/30 bg-copper/10 text-copper"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6"><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></svg></span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-copper">Seu próximo capítulo</p>
      <h2 id="guest-prompt-title" className="mt-3 font-display text-3xl text-white">A conversa fica melhor com você.</h2>
      <p id="guest-prompt-description" className="mt-4 text-sm leading-6 text-mist">Para {action}, entre na sua conta ou crie uma. Você pode continuar explorando os livros e as resenhas como visitante.</p>
    </div>
    <div className="space-y-3 p-7">
      <Link to="/login?mode=register" state={{ from: location }} onClick={onClose} className="flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-forest to-berry px-5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-copper">Criar minha conta</Link>
      <Link to="/login" state={{ from: location }} onClick={onClose} className="flex min-h-12 items-center justify-center rounded-xl border border-line px-5 text-sm font-semibold transition hover:border-copper/50 hover:bg-panelSoft focus-visible:outline-copper">Já tenho conta · Entrar</Link>
      <button type="button" onClick={onClose} className="min-h-11 w-full rounded-xl text-xs text-mist hover:text-white focus-visible:outline-copper">Continuar explorando</button>
    </div>
  </dialog>, document.body);
}
