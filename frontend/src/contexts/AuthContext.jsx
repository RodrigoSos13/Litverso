import { createContext, useContext, useEffect, useState } from "react";
import api from "../services/api";
import GuestPrompt from "../components/GuestPrompt";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guestAction, setGuestAction] = useState(null);
  function requireLogin(action = "participar da comunidade") {
    if (user) return true;
    setGuestAction(action);
    return false;
  }
  async function restore() {
    setLoading(true);
    setError("");
    try { const response = await api.get("/auth/me"); setUser(response.data); }
    catch (err) { if (err.response?.status === 401) setUser(null); else setError("Não foi possível conectar ao litverso. Verifique sua conexão e tente novamente."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    localStorage.removeItem("litverse:user");
    restore();
    const expired = () => { setUser(null); setGuestAction("continuar participando da comunidade"); };
    window.addEventListener("litverse:session-expired", expired);
    return () => window.removeEventListener("litverse:session-expired", expired);
  }, []);
  async function authenticate(mode, values) {
    const response = await api.post(`/auth/${mode}`, values);
    if (mode === "login" || mode === "verify-email") setUser(response.data);
    return response.data;
  }
  async function updateProfile(values) {
    const response = await api.put(`/users/${user._id}`, values);
    setUser(current => ({ ...current, ...response.data }));
  }
  async function logout() { await api.post("/auth/logout"); setUser(null); }
  return <AuthContext.Provider value={{ user, loading, error, restore, authenticate, logout, updateProfile, requireLogin }}>{children}<GuestPrompt action={guestAction} onClose={() => setGuestAction(null)} /></AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
