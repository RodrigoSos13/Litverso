import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import MainLayout from "./components/MainLayout";
import HomePage from "./pages/HomePage";
import UserLibraryPage from "./pages/UserLibraryPage";
import UserProfilePage from "./pages/UserProfilePage";
import BookPage from "./pages/BookPage";
import CreateBookPage from "./pages/CreateBookPage";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
function ProtectedRoutes() {
  const { user, loading, error, restore } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center" role="status">Abrindo sua biblioteca…</div>;
  if (error) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6"><p role="alert">{error}</p><button className="rounded-xl bg-forest px-6 py-3" onClick={restore}>Tentar novamente</button></div>;
  return user ? <Outlet /> : <section className="mx-auto my-12 max-w-lg rounded-3xl border border-copper/20 bg-panel p-8 text-center shadow-card"><p className="text-xs uppercase tracking-[0.2em] text-copper">Faça parte da comunidade</p><h1 className="mt-4 font-display text-3xl text-white">Entre para compartilhar suas histórias.</h1><p className="mt-4 text-sm leading-6 text-mist">Para adicionar livros ou publicar, é necessário fazer login ou criar uma conta.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/login" state={{ from: location }} className="rounded-xl border border-line px-5 py-3 text-sm font-semibold hover:border-copper">Entrar</Link><Link to="/login?mode=register" state={{ from: location }} className="rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white hover:bg-berry">Criar conta</Link></div><Link to="/" className="mt-6 inline-block text-sm text-mist hover:text-copper">← Continuar explorando</Link></section>;
}
function App() {
  return (
    <AuthProvider><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/users/:id" element={<UserProfilePage />} />
        <Route path="/users/:id/library" element={<UserLibraryPage />} />
        <Route path="/books/:id" element={<BookPage />} />
        <Route element={<ProtectedRoutes />}>
        <Route path="/create-book" element={<CreateBookPage />} />
        <Route path="/create-post" element={<Navigate to="/?tab=comunidade&compose=1" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></AuthProvider>
  );
}

export default App;
