import { emailHash, protectedEmail } from "./emailPrivacy.js";
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { User } from "../models/User.js";
import { hashPassword, verifyPassword } from "./password.js";
import { endSession, publicUser, requireAuth, startSession } from "./session.js";
import { consumeCode, emailConfigured, issueCode, rateLimit } from "./emailCodes.js";
import { Session } from "./session.js";
const router = Router();
const genericMessage = "Se os dados permitirem, você receberá um código por e-mail. Confira também o spam. Aguarde 60 segundos antes de reenviar.";
const validEmail = email => typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
router.use(async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST" || req.path === "/logout") return next();
  if (!emailConfigured() && req.path !== "/login") return res.status(503).json({ message: "O envio de e-mails ainda não está configurado. Tente novamente mais tarde." });
  try {
    if (!await rateLimit(`ip:${req.ip}:${req.path}`, 20, 15 * 60000)) return res.status(429).json({ message: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
    next();
  } catch { res.status(503).json({ message: "Serviço indisponível. Tente novamente." }); }
});
async function canSend(email, purpose) {
  return rateLimit(`send:${purpose}:${email}`, 5, 60 * 60000);
}
router.post("/register", async (req, res) => {
  const { nome, usuario, email, senha } = req.body;
  if (typeof nome !== "string" || !nome.trim() || nome.length > 100 || typeof usuario !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(usuario) || typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof senha !== "string" || senha.length < 8 || senha.length > 128) return res.status(400).json({ message: "Informe nome, usuário válido, e-mail e uma senha de 8 a 128 caracteres." });
  let stage = "password";
  try {
    const normalized = email.trim().toLowerCase();
    const registrationToken = randomBytes(32).toString("hex");
    // Hash even for existing accounts to reduce account enumeration by timing.
    const passwordHash = await hashPassword(senha);
    stage = "rate-limit";
    const allowed = await canSend(normalized, "register");
    stage = "lookup";
    const exists = await User.exists({ $or: [{ emailHash: emailHash(normalized) }, { usuario: usuario.toLowerCase() }] });
    if (allowed && !exists) {
      stage = "email-encryption";
      const account = { nome: nome.trim(), usuario: usuario.toLowerCase(), ...protectedEmail(normalized), passwordHash, registrationTokenHash: createHash("sha256").update(registrationToken).digest("hex") };
      stage = "issue-code";
      await issueCode(normalized, "register", account);
    }
    res.status(202).json({ message: genericMessage, registrationToken });
  } catch {
    console.error("[auth] Falha no cadastro:", stage);
    res.status(503).json({ message: "Não foi possível enviar o código. Tente novamente mais tarde." });
  }

});
router.post("/login", async (req, res) => {
  const { identificador, senha } = req.body;
  if (typeof identificador !== "string" || identificador.length > 254 || typeof senha !== "string" || senha.length > 128) return res.status(400).json({ message: "Informe seu e-mail ou usuário e sua senha." });
  try {
    const identifier = identificador.trim().toLowerCase();
    const user = await User.findOne({ $or: [{ emailHash: emailHash(identifier) }, { usuario: identifier }] }).select("+passwordHash +authVersion");
    const valid = await verifyPassword(senha, user?.passwordHash);
    if (!user || !valid) return res.status(401).json({ message: "E-mail, usuário ou senha incorretos." });
    await startSession(req, res, user);
    res.json(publicUser(user));
  } catch { res.status(503).json({ message: "Não foi possível entrar agora. Tente novamente." }); }
});
router.post("/verify-email", async (req, res) => {
  const { email, codigo } = req.body;
  if (!validEmail(email) || typeof codigo !== "string" || !/^\d{8}$/.test(codigo)) return res.status(400).json({ message: "Informe e-mail e código de 8 dígitos." });
  try {
    const challenge = await consumeCode(email.trim().toLowerCase(), "register", codigo, req.body.registrationToken);
    if (!challenge) return res.status(400).json({ message: "Código inválido ou expirado. Solicite um novo código se necessário." });
    const { registrationTokenHash, ...account } = challenge.payload;
    const user = await User.create({ ...account, emailVerifiedAt: new Date() });
    await startSession(req, res, user);
    res.status(201).json(publicUser(user));
  } catch { res.status(400).json({ message: "Não foi possível confirmar. Tente entrar ou solicite um novo cadastro." }); }
});
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!validEmail(email)) return res.status(400).json({ message: "Informe um e-mail válido." });
  try {
    const normalized = email.trim().toLowerCase();
    const allowed = await canSend(normalized, "reset");
    const user = await User.findOne({ emailHash: emailHash(normalized) }).select("+authVersion");
    if (allowed && user) await issueCode(normalized, "reset", { userId: String(user._id), authVersion: user.authVersion || 0 });
    res.status(202).json({ message: genericMessage });
  } catch { res.status(503).json({ message: "Não foi possível enviar o código. Tente novamente mais tarde." }); }
});
router.post("/reset-password", async (req, res) => {
  const { email, codigo, senha } = req.body;
  if (!validEmail(email) || typeof codigo !== "string" || !/^\d{8}$/.test(codigo) || typeof senha !== "string" || senha.length < 8 || senha.length > 128) return res.status(400).json({ message: "Informe e-mail, código de 8 dígitos e senha de 8 a 128 caracteres." });
  try {
    const challenge = await consumeCode(email.trim().toLowerCase(), "reset", codigo);
    if (!challenge) return res.status(400).json({ message: "Código inválido ou expirado." });
    const version = challenge.payload.authVersion;
    const user = await User.findOneAndUpdate({ _id: challenge.payload.userId, $or: [{ authVersion: version }, ...(version === 0 ? [{ authVersion: { $exists: false } }] : [])] }, {
      $set: { passwordHash: await hashPassword(senha), emailVerifiedAt: new Date() }, $inc: { authVersion: 1 },
    });
    if (!user) return res.status(400).json({ message: "Código inválido ou expirado." });
    await Session.deleteMany({ user: user._id });
    res.json({ message: "Senha alterada. Entre com sua nova senha." });
  } catch { res.status(503).json({ message: "Não foi possível alterar a senha. Solicite um novo código." }); }
});
router.get("/me", requireAuth, (req, res) => res.json(publicUser(req.user)));
router.post("/logout", async (req, res) => {
  try { await endSession(req, res); res.sendStatus(204); }
  catch { res.status(503).json({ message: "Não foi possível encerrar a sessão. Tente novamente." }); }
});
export default router;
