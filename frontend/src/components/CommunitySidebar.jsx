import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import BookCover from "./BookCover";
import { useAuth } from "../contexts/AuthContext";

const filters = [["all", "Todas"], ["resenha", "Resenhas"], ["fanart", "Fanarts"], ["opiniao", "Pensamentos"], ["citacao", "Citações"]];

export default function CommunitySidebar({ currentUserId, postType, onTypeChange, onlyMine, onOnlyMineChange }) {
  const { requireLogin } = useAuth();
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReadings([]);
    setError(false);
    if (!currentUserId) { setLoading(false); return; }
    setLoading(true);
    api.get("/readings", { params: { user: currentUserId, status: "lendo" }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setReadings(data.filter(reading => reading.livro)); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentUserId, retry]);

  const content = <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-panel p-5">
      <h3 className="text-sm font-semibold text-ink">Explorar publicações</h3>
      <div className="mt-4 space-y-1" role="group" aria-label="Tipo de publicação">
        {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={postType === value} onClick={() => onTypeChange(value)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${postType === value ? "bg-copper/10 font-semibold text-copper" : "text-mist hover:bg-panelSoft hover:text-ink"}`}>{label}{postType === value && <span aria-hidden="true">✓</span>}</button>)}
      </div>
    </section>
    {!currentUserId ? <section className="rounded-2xl border border-copper/20 bg-panel p-5"><h3 className="font-display text-xl text-white">Toda leitura abre uma conversa.</h3><p className="mt-3 text-sm leading-6 text-mist">Crie sua biblioteca, encontre outros leitores e compartilhe o que ficou com você.</p><button type="button" onClick={() => requireLogin("criar sua biblioteca e participar")} className="mt-4 min-h-11 rounded-xl bg-forest px-4 text-sm font-semibold text-white hover:bg-berry focus-visible:outline-copper">Quero participar</button></section> : <section className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">Lendo agora</h3><span aria-hidden="true" className="text-copper">↗</span></div>
      <div className="mt-4 space-y-4">
        {loading && <p role="status" className="text-xs text-mist">Carregando suas leituras…</p>}
        {error && <p role="alert" className="text-xs leading-5 text-mist">Não foi possível carregar suas leituras. <button type="button" onClick={() => setRetry(value => value + 1)} className="text-copper underline">Tentar novamente</button></p>}
        {!loading && !error && !readings.length && <p className="text-xs leading-5 text-mist">Marque um livro como “Lendo” para acompanhar suas leituras aqui.</p>}
        {readings.slice(0, 3).map(({ _id, livro }) => <Link key={_id} to={`/books/${livro._id}`} className="group flex min-w-0 items-center gap-3 rounded-lg">
          <div className="h-16 w-11 shrink-0"><BookCover url={livro.urlCapa} title={livro.titulo} className="h-full w-full rounded object-contain" /></div>
          <span className="min-w-0"><span className="line-clamp-2 text-sm font-semibold leading-5 text-ink group-hover:text-copper">{livro.titulo}</span>{livro.autor && <span className="mt-1 block truncate text-xs text-mist">{livro.autor}</span>}</span>
        </Link>)}
      </div>
      {currentUserId && <Link to={`/users/${currentUserId}/library?status=lendo`} className="mt-4 inline-block rounded text-xs font-semibold text-copper hover:text-glow">Ver minha biblioteca →</Link>}
    </section>}
    {currentUserId && <section className="rounded-2xl border border-line bg-panel p-5">
      <h3 className="text-sm font-semibold text-ink">Minha participação</h3>
      <button type="button" aria-pressed={onlyMine} onClick={() => onOnlyMineChange(!onlyMine)} className={`mt-4 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${onlyMine ? "bg-copper/10 font-semibold text-copper" : "text-mist hover:bg-panelSoft hover:text-ink"}`}>Minhas publicações{onlyMine && <span aria-hidden="true">✓</span>}</button>
      <Link to={`/users/${currentUserId}`} className="mt-1 block rounded-lg px-3 py-2.5 text-sm text-mist hover:bg-panelSoft hover:text-ink">Meu perfil <span aria-hidden="true">↗</span></Link>
    </section>}
  </div>;
  return <>
    <aside aria-label="Filtros e minhas leituras" className="hidden min-w-0 lg:block">{content}</aside>
    <details className="order-first rounded-2xl border border-line bg-panel p-4 lg:hidden">
      <summary className="cursor-pointer text-sm font-semibold text-copper">Filtros e minhas leituras</summary>
      <div className="mt-4">{content}</div>
    </details>
  </>;
}
