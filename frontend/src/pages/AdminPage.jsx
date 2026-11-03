import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PostCard from "../components/PostCard";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import { reasons } from "../components/ReportButton";
export default function AdminPage() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(null);
  const [moderating, setModerating] = useState(null);
  const [status, setStatus] = useState("pendente");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState({});
  const [preview, setPreview] = useState(null);
  const [inspecting, setInspecting] = useState(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const previewDialog = useRef(null);
  useEffect(() => {
    if (!preview) return;
    const modal = previewDialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = "hidden";
    return () => { modal.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [preview]);
  async function inspect(id) {
    setInspecting(id); setError("");
    try { const { data } = await api.get(`/posts/${id}`); setPreview(data.post); }
    catch { setError("Publicação não encontrada. Ela pode já ter sido apagada."); }
    finally { setInspecting(null); }
  }
  const [confirm, setConfirm] = useState(null);
  useEffect(() => {
    if (user?.role !== "admin") return;
    let active = true;
    setLoading(true); setError(""); setConfirm(null);
    api.get("/reports", { params: { status, page } }).then(response => { if (active) setData(response.data); }).catch(() => { if (active) setError("Não foi possível carregar as denúncias."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.role, status, page, revision]);
  async function resolve(id, acao) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.patch(`/reports/${id}`, { acao, decisao: decision[id] || "" });
      setData(current => ({ ...current, items: current.items.filter(item => item._id !== id), total: Math.max(0, current.total - 1) }));
      setExpanded(null); setModerating(null); setPreview(null);
      setDecision(current => { const next = { ...current }; delete next[id]; return next; });
      setNotice(acao === "remover" ? "Conteúdo removido." : "Decisão salva.");
      if (data.items.length === 1 && page > 1) setPage(value => value - 1);
      else setRevision(value => value + 1);
    }
    catch (err) { setError(err.response?.data?.message || "Não foi possível salvar a decisão."); }
    finally { setBusy(false); setConfirm(null); }
  }
  if (user?.role !== "admin") return <p role="alert">Acesso exclusivo para administradores.</p>;
  const filters = [{ value: "pendente", label: "Pendentes" }, { value: "descartada", label: "Descartadas" }, { value: "removida", label: "Conteúdo removido" }];
  const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-xl border border-line px-4 py-2 text-xs font-semibold transition hover:border-copper/50 hover:bg-panelSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-40";
  return <section className="space-y-6 pb-12">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-copper/20 bg-copper/10 text-copper"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg></span>
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-copper">Gestão da comunidade</p><h2 className="mt-1 font-display text-3xl text-ink">Central de moderação</h2></div>
      </div>
      <button type="button" disabled={loading || busy} onClick={() => setRevision(value => value + 1)} className={buttonClass}>Atualizar denúncias</button>
    </div>
    
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
      <div className="flex flex-col justify-between gap-4 border-b border-line p-4 sm:flex-row sm:items-center sm:px-6">
        <div role="group" aria-label="Filtrar denúncias" className="flex flex-wrap gap-1 rounded-xl bg-midnight/60 p-1">
          {filters.map(filter => <button key={filter.value} type="button" disabled={busy} aria-pressed={status === filter.value} onClick={() => { setStatus(filter.value); setPage(1); setExpanded(null); setModerating(null); setPreview(null); setNotice(""); }} className={`min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-40 ${status === filter.value ? "bg-panelSoft text-ink shadow-sm" : "text-mist hover:text-ink"}`}>{filter.label}</button>)}
        </div>
        <span role="status" className="text-xs text-mist">{loading ? "Buscando relatos…" : `${data.total} ${data.total === 1 ? "denúncia" : "denúncias"}`}</span>
      </div>
      <div className="space-y-4 p-4 sm:p-6">
    {preview && createPortal(<dialog ref={previewDialog} aria-labelledby="moderation-preview-title" onCancel={event => { event.preventDefault(); setPreview(null); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel p-0 text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-panel px-5 py-4"><h2 id="moderation-preview-title" className="font-semibold">Publicação denunciada</h2><button autoFocus type="button" onClick={() => setPreview(null)} aria-label="Fechar publicação" className="flex h-9 w-9 items-center justify-center rounded-full text-mist hover:bg-panelSoft focus-visible:ring-2 focus-visible:ring-copper">✕</button></div>
      <div className="p-3 sm:p-5"><PostCard key={preview._id} post={preview} currentUserId={user._id} fullWidth /></div>
    </dialog>, document.body)}
    {notice && createPortal(<div role="status" aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-50 flex max-w-[calc(100%-2.5rem)] items-center gap-2 rounded-xl border border-forest/30 bg-panel px-4 py-3 text-xs text-ink shadow-card"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-glow"><path d="m5 12 4 4L19 6" /></svg>{notice}</div>, document.body)}
    {error && <p role="alert" className="text-red-300">{error} <button onClick={() => setRevision(value => value + 1)} className="underline">Tentar novamente</button></p>}
    {loading ? <div role="status" className="space-y-3 py-8 text-center text-sm text-mist"><span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-line border-t-copper motion-reduce:animate-none" />Carregando denúncias…</div> : <>
      {!data.items.length && !error && <div className="flex flex-col items-center px-4 py-16 text-center"><span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-forest/30 bg-forest/10 text-glow"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7"><path d="m5 12 4 4L19 6" /></svg></span><h3 className="font-display text-2xl">{status === "pendente" ? "Tudo em dia por aqui" : "Nenhuma decisão por aqui"}</h3><p className="mt-3 max-w-sm text-sm leading-6 text-mist">{status === "pendente" ? "Novas denúncias de publicações, fanarts e comentários aparecerão aqui para análise." : "As denúncias concluídas nesta categoria ficarão disponíveis para consulta."}</p></div>}
      {data.items.length > 0 && <div className="grid min-w-0 overflow-hidden rounded-xl border border-line lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-line bg-midnight/40 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-mist"><span>Denúncias recebidas</span><span>Mais recentes</span></div>
          <ul aria-label="Lista de denúncias" className="max-h-[640px] divide-y divide-line overflow-y-auto">
            {data.items.map(report => <li key={report._id}>
              <button type="button" disabled={busy} aria-pressed={expanded === report._id} aria-controls="report-detail" onClick={() => { setExpanded(report._id); setModerating(null); setConfirm(null); }} className={`group relative flex w-full items-start gap-3 border-l-2 p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper disabled:opacity-50 ${expanded === report._id ? "border-copper bg-copper/5" : "border-transparent hover:bg-panelSoft/60"}`}>
                <span aria-hidden="true" className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${expanded === report._id ? "bg-copper/10 text-copper" : "bg-panelSoft text-mist"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">{report.tipo === "comentario" ? <path d="M4 4h16v12H9l-5 4V4Z" /> : <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>}</svg></span>
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-ink">{reasons[report.motivo]}</span><time dateTime={report.createdAt} title={new Date(report.createdAt).toLocaleString("pt-BR")} className="shrink-0 pt-0.5 text-[10px] text-mist">{new Date(report.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</time></span>
                  <span className="block truncate text-xs text-mist">{report.conteudo}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-mist/70"><span>{report.tipo === "comentario" ? "Comentário" : "Publicação"}</span><span aria-hidden="true">·</span><span className="truncate">@{report.autor?.usuario || "conta removida"}</span><span className={`ml-auto flex items-center gap-1.5 ${status === "pendente" ? "text-copper" : status === "removida" ? "text-red-300" : "text-glow"}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{status === "pendente" ? "Pendente" : status === "removida" ? "Removida" : "Descartada"}</span></span>
                </span>
              </button>
            </li>)}
          </ul>
        </div>
        <div id="report-detail" role="region" aria-label="Detalhes da denúncia" className="min-w-0 bg-midnight/20">
          {data.items.find(report => report._id === expanded) ? data.items.filter(report => report._id === expanded).map(report => <article key={report._id}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mist">{status === "pendente" ? "Análise da denúncia" : "Registro da decisão"}</p><button type="button" disabled={busy} onClick={() => { setExpanded(null); setModerating(null); setConfirm(null); }} aria-label="Fechar detalhes da denúncia" className="flex h-7 w-7 items-center justify-center rounded-lg text-mist hover:bg-panelSoft focus-visible:ring-2 focus-visible:ring-copper">✕</button></div>
        <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="rounded-md border border-line bg-panelSoft px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-mist">{report.tipo === "comentario" ? "Comentário" : "Publicação"}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${status === "pendente" ? "bg-copper/10 text-copper" : status === "removida" ? "bg-red-400/10 text-red-300" : "bg-forest/15 text-glow"}`}>{status === "pendente" ? "Aguardando análise" : status === "removida" ? "Conteúdo removido" : "Descartada"}</span></div>
        <h3 className="font-display text-2xl text-ink">{reasons[report.motivo]}</h3>
        <p className="text-xs text-mist">Denunciado por @{report.denunciante?.usuario || "conta removida"} em {new Date(report.createdAt).toLocaleString("pt-BR")} · Autor: @{report.autor?.usuario || "conta removida"}</p>
        <blockquote className="whitespace-pre-wrap break-words rounded-lg bg-panelSoft p-3 text-sm">{report.conteudo}</blockquote>
        {report.detalhes && <p className="whitespace-pre-wrap break-words text-sm">Relato: {report.detalhes}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
        {report.publicacao && <button type="button" disabled={Boolean(inspecting) || busy} onClick={() => inspect(report.publicacao)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-copper transition hover:bg-copper/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-40"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>{inspecting === report.publicacao ? "Abrindo…" : "Ver publicação"}</button>}
        {status === "pendente" && <button type="button" disabled={busy} aria-expanded={moderating === report._id} aria-controls={`moderation-form-${report._id}`} onClick={() => { setModerating(value => value === report._id ? null : report._id); setConfirm(null); }} className={`ml-auto ${buttonClass}`}>{moderating === report._id ? "Cancelar moderação" : "Moderar denúncia"}</button>}
        </div>
        </div>
        {(status !== "pendente" || moderating === report._id) && <div className="space-y-4 border-t border-line bg-panelSoft/30 p-4 sm:p-5">
        {status === "pendente" ? <>
          {moderating === report._id && <div id={`moderation-form-${report._id}`} className="space-y-4">
          <label className="block text-sm">Observação da decisão<textarea maxLength={1000} value={decision[report._id] || ""} onChange={event => setDecision(values => ({ ...values, [report._id]: event.target.value }))} placeholder="Descreva o motivo da sua decisão (opcional)…" rows={3} className="mt-2 block w-full resize-y rounded-xl border border-line bg-midnight/50 p-3 text-sm outline-none transition focus:border-copper" /></label>
          <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => resolve(report._id, "descartar")} className={buttonClass}>{busy ? "Salvando…" : "Descartar denúncia"}</button><button disabled={busy} onClick={() => setConfirm(report._id)} className="min-h-10 rounded-xl border border-red-400/25 bg-red-400/5 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/15 focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-40">Remover conteúdo</button></div>
          {confirm === report._id && <div role="group" aria-label="Confirmar remoção" className="rounded-lg border border-red-400/40 p-3"><p className="text-sm">Remover permanentemente este conteúdo? Ao remover uma publicação, seus comentários e curtidas também serão apagados.</p><button disabled={busy} onClick={() => resolve(report._id, "remover")} className="mt-3 rounded-xl bg-red-500/90 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">{busy ? "Removendo…" : "Confirmar remoção"}</button><button disabled={busy} onClick={() => setConfirm(null)} className="ml-3">Cancelar</button></div>}
          </div>}
        </> : <p className="whitespace-pre-wrap break-words text-sm text-mist">Analisada por @{report.moderador?.usuario || "conta removida"} em {new Date(report.resolvidaEm).toLocaleString("pt-BR")}. {report.decisao}</p>}
        </div>}
          </article>) : <div className="flex min-h-[320px] flex-col items-center justify-center px-8 py-12 text-center lg:min-h-[400px]"><span aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line text-mist"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-6 w-6"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg></span><h3 className="font-display text-xl text-ink">Selecione uma denúncia</h3><p className="mt-2 max-w-xs text-xs leading-6 text-mist">Consulte o relato, veja a publicação e registre sua decisão neste painel.</p></div>}
        </div>
      </div>}
      {data.total > 0 && <div className="flex items-center justify-between gap-4 border-t border-line pt-5 text-xs text-mist"><button disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)} className={buttonClass}>Anterior</button><span>Página {page}</span><button disabled={page * 20 >= data.total || busy} onClick={() => setPage(value => value + 1)} className={buttonClass}>Próxima →</button></div>}
    </>}
      </div>
    </div>
    <p className="text-center text-xs leading-5 text-mist/60">As decisões ficam registradas no histórico de moderação.</p>
  </section>;
}
