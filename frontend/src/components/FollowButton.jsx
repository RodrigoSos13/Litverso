import { useEffect, useId, useRef, useState } from "react";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";

export default function FollowButton({ user, onChanged }) {
  const { requireLogin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);
  const option = useRef(null);
  const panelId = useId();
  const label = user.seguindo ? "Seguindo" : user.segueVoce ? "Seguir de volta" : "Seguir";

  useEffect(() => {
    if (!open) return;
    function outside(event) { if (!root.current?.contains(event.target)) setOpen(false); }
    function escape(event) {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => { if (open) option.current?.focus(); }, [open]);

  async function toggle() {
    if (!requireLogin("seguir este leitor")) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api[user.seguindo ? "delete" : "put"](`/users/${user._id}/follow`);
      setOpen(false);
      button.current?.focus();
      onChanged(data);
    } catch { setError("Não foi possível atualizar. Tente novamente."); }
    finally { setBusy(false); }
  }

  return <div ref={root} className="relative shrink-0">
    <button ref={button} type="button" disabled={busy} onClick={() => user.seguindo ? setOpen(value => !value) : toggle()} aria-label={`${label} @${user.usuario}`} aria-expanded={user.seguindo ? open : undefined} aria-controls={user.seguindo ? panelId : undefined} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mist/50 disabled:opacity-50 ${user.seguindo ? "border-line bg-panel text-slate-300 hover:border-white/20 hover:bg-panelSoft hover:text-white" : "border-copper/40 text-copper hover:bg-copper/10"}`}>
      {user.seguindo && <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m5 12 4 4L19 6" /></svg>}
      {busy ? "Aguarde…" : label}
      {user.seguindo && <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>}
    </button>
    {user.seguindo && <div id={panelId} inert={open ? undefined : ""} aria-hidden={!open} className={`absolute right-0 top-full z-30 mt-2 w-48 origin-top-right rounded-xl border border-white/10 bg-panel p-1.5 shadow-xl transition duration-150 motion-reduce:transition-none ${open ? "visible translate-y-0 scale-100 opacity-100" : "invisible -translate-y-1 scale-95 opacity-0"}`}>
      <button ref={option} type="button" disabled={busy} onClick={toggle} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-300 transition-colors hover:bg-red-400/10 focus-visible:bg-red-400/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-300/40 disabled:opacity-50">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M18 11h5" /></svg>
        {busy ? "Aguarde…" : "Deixar de seguir"}
      </button>
    </div>}
    {error && <p role="alert" className="mt-2 max-w-48 text-xs text-red-300">{error}</p>}
  </div>;
}
