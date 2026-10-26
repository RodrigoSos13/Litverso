import api from "../services/api";
import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { user, loading, authenticate } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState(() => new URLSearchParams(location.search).get("mode") === "register" ? "register" : "login");
  const [values, setValues] = useState({ identificador: "", nome: "", usuario: "", email: "", senha: "", confirmacao: "", codigo: "" });
  const [visible, setVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const verifying = mode === "verify-email";
  const recovering = mode === "forgot-password";
  const resetting = mode === "reset-password";
  const registering = mode === "register";
  const destination = location.state?.from;
  if (user) return <Navigate to={destination ? `${destination.pathname}${destination.search || ""}${destination.hash || ""}` : "/"} replace />;
  function change(event) { setValues(current => ({ ...current, [event.target.name]: event.target.value })); setError(""); }
  async function submit(event) {
    event.preventDefault();
    if ((registering || resetting) && values.senha !== values.confirmacao) { setError("As senhas não coincidem. Confira e tente novamente."); return; }
    setBusy(true); setError("");
    try {
      if (recovering) {
        const response = await api.post("/auth/forgot-password", { email: values.email });
        setNotice(response.data.message); setMode("reset-password"); setResendAt(Date.now() + 60000);
      } else if (resetting) {
        const response = await api.post("/auth/reset-password", { email: values.email, codigo: values.codigo, senha: values.senha });
        setNotice(response.data.message); setMode("login"); setValues(current => ({ ...current, senha: "", confirmacao: "", codigo: "" }));
      } else {
        const response = await authenticate(mode, values);
        if (response.registrationToken) setValues(current => ({ ...current, registrationToken: response.registrationToken }));
        if (registering) { setNotice(response.message); setMode("verify-email"); setResendAt(Date.now() + 60000); }
      }
    }
    catch (err) { setError(err.response?.data?.message || "Não foi possível conectar. Verifique sua conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  function switchMode(nextMode) { setMode(nextMode); setNotice(""); setError(""); setVisible(false); setConfirmationVisible(false); setValues(current => ({ ...current, senha: "", confirmacao: "" })); }
  async function resend() {
    if (Date.now() < resendAt) { setError("Aguarde 60 segundos antes de reenviar."); return; }
    setBusy(true); setError("");
    try {
      const response = await api.post(verifying ? "/auth/register" : "/auth/forgot-password", verifying ? values : { email: values.email });
      if (response.data.registrationToken) setValues(current => ({ ...current, registrationToken: response.data.registrationToken }));
      setNotice(response.data.message); setResendAt(Date.now() + 60000);
    } catch (err) { setError(err.response?.data?.message || "Não foi possível reenviar o código."); }
    finally { setBusy(false); }
  }
  const inputClass = "mt-2 w-full rounded-xl border border-line/80 bg-midnight/60 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-mist/60 hover:border-mist/50 focus:border-copper focus:bg-midnight focus:ring-2 focus:ring-copper/15 disabled:opacity-60";
  function field(name, label, props = {}) {
    return <label className="block text-sm font-medium text-ink" htmlFor={name}>{label}<input id={name} name={name} value={values[name]} onChange={change} className={inputClass} required disabled={busy} {...props} /></label>;
  }
  return (
    <div className="auth-screen relative min-h-screen text-ink">
      <div className="absolute right-5 top-6 z-20 sm:right-10 lg:top-8">
              <Link
                to="/"
                className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-xl border border-copper/50 bg-copper/10 px-4 py-3 sm:px-5 text-sm font-semibold text-copper transition duration-200 hover:border-copper hover:bg-copper/15 hover:text-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-4 focus-visible:ring-offset-midnight"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0"><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" /></svg>
                Entrar como visitante
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform motion-safe:group-hover:translate-x-1"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </Link>
      </div>
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="auth-hero relative flex flex-col px-7 pb-8 pt-28 sm:px-14 lg:px-20 lg:py-12">
          <div className="relative z-10 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-copper/40 text-copper" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v15M12 5C8 2 3 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Z" /></svg></span><span className="font-display text-3xl font-bold tracking-tight text-white">litverso<span className="text-copper">.</span></span></div>
          <div className="relative z-10 flex max-w-lg flex-1 flex-col justify-center py-12 lg:py-14">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-copper">Um universo de histórias</p>
            <h1 className="font-display text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">Sua próxima história começa <span className="text-glow">aqui.</span></h1>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-mist">Organize suas leituras, descubra novos mundos e encontre pessoas que compartilham sua paixão pelos livros.</p>
            <div className="relative mt-12 hidden border-t border-copper/20 pt-8 sm:block">
              <div className="pointer-events-none absolute left-[16.666%] right-[16.666%] top-[3.5rem] h-px bg-gradient-to-r from-copper/15 via-copper/50 to-copper/15" aria-hidden="true" />
              <ol className="relative grid grid-cols-3 gap-4 text-center">
              {[
                { title: "Descubra", detail: "Encontre novos mundos", icon: <><circle cx="12" cy="12" r="8" /><path d="m15 9-2 4-4 2 2-4 4-2Z" /></> },
                { title: "Leia", detail: "Viva cada capítulo", icon: <><path d="M12 5v15M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" /></> },
                { title: "Compartilhe", detail: "Conecte suas histórias", icon: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3v-9.5A7.5 7.5 0 0 1 9.5 5H14" /><path d="M17 2v6m-3-3h6M7 11h6m-6 4h9" /></> },
              ].map(({ title, detail, icon }) => (
                <li key={title} className="flex min-w-0 flex-col items-center">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-copper/30 bg-midnight text-copper shadow-[0_0_24px_rgba(182,119,86,0.08)]" aria-hidden="true">
                    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                  </span>
                  <p className="mt-4 font-display text-lg text-white">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-mist">{detail}</p>
                </li>
              ))}
              </ol>
            </div>
          </div>
        </section>
        <main className="flex min-w-0 flex-col items-center justify-center border-line/60 px-5 pb-10 sm:px-10 lg:border-l lg:bg-midnight/50 lg:pb-12 lg:pt-28">
          <section className="auth-card relative w-full max-w-md overflow-hidden rounded-3xl border border-line p-7 sm:p-10" aria-labelledby="auth-title">
            <div className="mb-8 grid grid-cols-2 gap-1 rounded-xl border border-line/60 bg-midnight/60 p-1" role="group" aria-label="Acesso à conta">
              {[{ value: "login", label: "Entrar" }, { value: "register", label: "Criar conta" }].map(option => (
                <button key={option.value} type="button" disabled={busy} aria-pressed={mode === option.value} onClick={() => { if (mode !== option.value) switchMode(option.value); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${mode === option.value ? "bg-panelSoft text-white shadow-sm ring-1 ring-line" : "text-mist hover:bg-panel/60 hover:text-white"}`}>{option.label}</button>
              ))}
            </div>
            <div className="mb-5 flex items-center gap-3" aria-hidden="true"><span className="h-px w-7 bg-copper/60" /><span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-copper">Sua comunidade literária</span></div>
            <h2 id="auth-title" className="font-display text-3xl leading-tight text-white">{verifying ? "Confirme seu e-mail" : recovering ? "Recupere sua conta" : resetting ? "Crie uma nova senha" : registering ? "Escreva um novo capítulo" : "Bom ter você de volta"}</h2>
            {registering && <p className="mt-3 text-sm leading-relaxed text-mist">Crie sua conta e comece sua jornada no litverso.</p>}
            <form onSubmit={submit} className="mt-8 space-y-5" aria-busy={busy}>
              {registering ? <>{field("nome", "Seu nome", { autoComplete: "name", maxLength: 100, placeholder: "Como podemos chamar você?" })}{field("usuario", "Nome de usuário", { autoComplete: "username", pattern: "[a-zA-Z0-9_]{3,30}", title: "Use de 3 a 30 letras, números ou sublinhados", placeholder: "seu_usuario" })}{field("email", "E-mail", { type: "email", autoComplete: "email", maxLength: 254, placeholder: "voce@exemplo.com" })}</> : mode === "login" ? field("identificador", "E-mail ou nome de usuário", { autoComplete: "username", maxLength: 254, placeholder: "voce@exemplo.com", autoFocus: true }) : field("email", "E-mail", { type: "email", autoComplete: "email", maxLength: 254, readOnly: verifying || resetting })}
              {(verifying || resetting) && field("codigo", "Código recebido por e-mail", { inputMode: "numeric", autoComplete: "one-time-code", pattern: "[0-9]{8}", minLength: 8, maxLength: 8 })}
              {!verifying && !recovering && <div><div className="relative">{field("senha", "Senha", { type: visible ? "text" : "password", autoComplete: (registering || resetting) ? "new-password" : "current-password", minLength: (registering || resetting) ? 8 : 1, maxLength: 128, placeholder: registering ? "Crie uma senha segura" : "Digite sua senha", onKeyDown: event => {
                if (event.key === "Tab" && !event.shiftKey && (registering || resetting)) {
                  const confirmation = event.currentTarget.form?.elements.namedItem("confirmacao");
                  if (confirmation && !confirmation.disabled) {
                    event.preventDefault();
                    confirmation.focus();
                  }
                }
              }, style: { paddingRight: "5.5rem" } })}<button type="button" onClick={() => setVisible(!visible)} className="absolute bottom-3.5 right-4 text-xs font-semibold text-copper hover:text-glow" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible}>{visible ? "Ocultar" : "Mostrar"}</button></div>{registering && <p className="mt-2 text-xs text-mist">Use no mínimo 8 caracteres.</p>}</div>}
              {(registering || resetting) && <div className="relative">{field("confirmacao", "Confirme sua senha", { type: confirmationVisible ? "text" : "password", autoComplete: "new-password", maxLength: 128, placeholder: "Digite a senha novamente", style: { paddingRight: "5.5rem" } })}<button type="button" onClick={() => setConfirmationVisible(current => !current)} className="absolute bottom-3.5 right-4 text-xs font-semibold text-copper hover:text-glow" aria-label={confirmationVisible ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"} aria-controls="confirmacao" aria-pressed={confirmationVisible}>{confirmationVisible ? "Ocultar" : "Mostrar"}</button></div>}
              {notice && <p role="status" className="text-sm text-mist">{notice}</p>}
              {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
              <button disabled={busy || loading} type="submit" className="group flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-gradient-to-r from-forest to-berry px-5 py-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(143,35,51,0.18)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-copper disabled:cursor-wait disabled:opacity-60">{busy ? "Aguarde…" : verifying ? "Confirmar e-mail" : recovering ? "Enviar código" : resetting ? "Alterar senha" : registering ? "Criar minha conta" : "Entrar"}<svg className="transition-transform group-hover:translate-x-1" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
            </form>
            {mode === "login" && <button type="button" disabled={busy} onClick={() => switchMode("forgot-password")} className="mt-5 text-sm text-copper">Esqueci minha senha</button>}
            {(verifying || resetting) && <button type="button" disabled={busy} onClick={resend} className="mt-5 text-sm text-copper">Reenviar código (intervalo de 60 segundos)</button>}
            {(verifying || resetting || recovering) && <button type="button" disabled={busy} onClick={() => switchMode("login")} className="mt-5 block text-sm text-mist">Voltar para entrar</button>}
          </section>
        </main>
      </div>
    </div>
  );
}
