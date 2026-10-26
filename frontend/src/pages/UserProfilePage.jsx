import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import useUserProfile, { readingTabs } from "../hooks/useUserProfile";
import EditProfileDialog from "../components/EditProfileDialog";
import ConnectionsDialog from "../components/ConnectionsDialog";
import FollowButton from "../components/FollowButton";
import PostCard from "../components/PostCard";

function UserProfilePage() {
  const { id } = useParams();
  const location = useLocation();
  const { currentUserId } = useOutletContext();
  const { profile, error, refresh: loadProfile } = useUserProfile(id);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [connections, setConnections] = useState(null);
  useEffect(() => { setConnections(null); }, [id]);
  useEffect(() => {
    if (profile && location.hash.startsWith("#post-")) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [profile, location.hash]);
  const [editing, setEditing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setLogoutError("Não foi possível sair. Tente novamente.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (error) return <div role="alert" className="py-16 text-center"><p className="text-mist">{error}</p><button onClick={loadProfile} className="mt-4 text-copper">Tentar novamente</button></div>;
  if (!profile) return <p role="status" className="py-16 text-center text-mist">Carregando perfil…</p>;

  const { usuario, leituras, posts } = profile;
  const completedReadings = leituras.lido || [];
  const readingsWithPages = completedReadings.filter(({ livro }) => Number.isFinite(livro?.totalPaginas) && livro.totalPaginas > 0);
  const totalPagesRead = readingsWithPages.reduce((total, { livro }) => total + livro.totalPaginas, 0);
  const missingPageCounts = completedReadings.length - readingsWithPages.length;

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-8">
      {connections && <ConnectionsDialog key={`${id}-${connections}`} userId={id} kind={connections} onClose={() => setConnections(null)} />}
      {editing && id === currentUserId && <EditProfileDialog key={id} user={usuario} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadProfile(); }} />}
      <section aria-label="Perfil" className="border-b border-line pb-8 pt-4 sm:pt-8">
        <div className="flex items-start gap-5 sm:gap-8">
          {usuario.urlAvatar ? <img src={usuario.urlAvatar} alt={usuario.nome} className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-white/5 sm:h-28 sm:w-28" /> : <div aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-forest/25 font-display text-3xl text-glow ring-4 ring-white/5 sm:h-28 sm:w-28">{usuario.nome?.slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-copper">{id === currentUserId ? "Meu espaço literário" : "Espaço literário"}</p>
            <h1 className="break-words font-display text-3xl text-white sm:text-4xl">{usuario.nome}</h1>
            <p className="mt-1 text-sm text-mist">@{usuario.usuario}</p>
            {usuario.biografia && <p className="mt-4 max-w-xl whitespace-pre-line text-sm leading-relaxed text-slate-300">{usuario.biografia}</p>}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-mist">
              <button type="button" onClick={() => setConnections("followers")} className="rounded hover:text-white focus-visible:outline-copper"><strong className="font-semibold text-ink">{usuario.totalSeguidores || 0}</strong> seguidores</button>
              <button type="button" onClick={() => setConnections("following")} className="rounded hover:text-white focus-visible:outline-copper"><strong className="font-semibold text-ink">{usuario.totalSeguindo || 0}</strong> seguindo</button>
            </div>
          </div>
          {id !== currentUserId && <FollowButton key={id} user={usuario} onChanged={loadProfile} />}
          {id === currentUserId && <button type="button" onClick={() => setEditing(true)} aria-label="Editar meu perfil" title="Editar perfil" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-mist transition hover:border-copper/50 hover:bg-panelSoft hover:text-copper"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-5L4 14l-1 7 6-2" /></svg></button>}
        </div>
        <section aria-labelledby="profile-library-title" className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="profile-library-title" className="font-display text-xl text-white">Biblioteca</h2>
            <span className="text-xs tabular-nums text-mist">{readingTabs.reduce((total, tab) => total + (leituras[tab.key]?.length || 0), 0).toLocaleString("pt-BR")} livros nas listas</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {readingTabs.map(tab => {
              const count = leituras[tab.key]?.length || 0;
              const captions = { lendo: "Em andamento", quero_ler: "Próximas leituras", lido: "Leituras concluídas" };
              return <Link key={tab.key} to={`/users/${id}/library?status=${tab.key}`} aria-label={`Ver ${tab.label.toLowerCase()}: ${count} ${count === 1 ? "livro" : "livros"}`} className="group flex items-center gap-3 rounded-xl border border-line bg-panel p-3 transition duration-200 hover:border-copper/50 hover:bg-panelSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-midnight sm:p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-midnight/40 text-copper transition group-hover:border-copper/30 group-hover:bg-copper/10">
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {tab.key === "lendo" ? <path d="M12 5v15M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" /> : tab.key === "quero_ler" ? <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z" /> : <><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8M4 17h14" /><path d="m14 6 3 3 5-6" /></>}
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{tab.label}</span>
                    <span className="text-xl font-semibold leading-none tabular-nums text-white">{count.toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="mt-1 text-xs text-mist">{captions[tab.key]}</p>
                </div>
              </Link>;
            })}
          </div>
          <div className="mt-4 flex items-start gap-4 rounded-xl border border-line bg-panel p-4 sm:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-midnight/40 text-copper">
              <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-mist">Páginas lidas</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-white">{totalPagesRead.toLocaleString("pt-BR")}</p>
              {missingPageCounts > 0 && <p className="mt-1 text-xs leading-relaxed text-mist">{missingPageCounts.toLocaleString("pt-BR")} {missingPageCounts === 1 ? "livro lido ainda não tem o número de páginas informado e não entrou na soma." : "livros lidos ainda não têm o número de páginas informado e não entraram na soma."}</p>}
            </div>
          </div>
        </section>
      </section>

      <section className="w-full">
        <div className="mb-6 flex items-center justify-between"><h2 className="font-display text-2xl">Publicações</h2><span className="text-sm tabular-nums text-mist">{posts.length}</span></div>
        {posts.length === 0 && <p className="py-10 text-center text-sm text-mist">As próximas histórias compartilhadas aparecerão aqui.</p>}
        <div className="space-y-5">
          {posts.map((post) => (
            <div key={post._id} id={`post-${post._id}`} className="min-w-0 scroll-mt-6"><PostCard
              post={post}
              fullWidth
              feedPreview
              currentUserId={currentUserId}
              onDeleted={loadProfile}
              onPinned={loadProfile}
            /></div>
          ))}
        </div>
      </section>
      {id === currentUserId && (
        <div className="border-t border-line pt-6">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 font-semibold text-red-400 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {loggingOut ? "Saindo…" : "Sair"}
          </button>
          {logoutError && <p role="alert" className="mt-2 text-sm text-red-300">{logoutError}</p>}
        </div>
      )}
    </div>
  );
}

export default UserProfilePage;
