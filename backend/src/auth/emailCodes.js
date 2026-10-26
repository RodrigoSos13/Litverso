import { protectedEmail } from "./emailPrivacy.js";
import { emailTransportConfigured, sendEmail } from "../services/emailSender.js";
import mongoose from "mongoose";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

const schema = new mongoose.Schema({
  key: { type: String, unique: true },
  purpose: String,
  codeHash: String,
  attempts: { type: Number, default: 0 },
  payload: mongoose.Schema.Types.Mixed,
  sentAt: Date,
  expiresAt: { type: Date, expires: 0 },
});
export const EmailCode = mongoose.model("EmailCode", schema);
const limitSchema = new mongoose.Schema({ key: { type: String, unique: true }, count: Number, expiresAt: { type: Date, expires: 0 } });
export const AuthLimit = mongoose.model("AuthLimit", limitSchema);
export function emailConfigured() {
  return emailTransportConfigured() && Boolean(process.env.EMAIL_CODE_SECRET?.length >= 32);
}
function digest(value) {
  if (!emailConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");
  return createHmac("sha256", process.env.EMAIL_CODE_SECRET).update(value).digest("hex");
}
export async function rateLimit(key, maximum, duration) {
  const bucket = Math.floor(Date.now() / duration);
  const entry = await AuthLimit.findOneAndUpdate({ key: process.env.EMAIL_CODE_SECRET ? createHmac("sha256", process.env.EMAIL_CODE_SECRET).update(`${key}:${bucket}`).digest("hex") : createHash("sha256").update(`${key}:${bucket}`).digest("hex") }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * duration) },
  }, { upsert: true, new: true });
  return entry.count <= maximum;
}
export async function issueCode(email, purpose, payload) {
  if (payload?.email) {
    const { email: plaintext, ...rest } = payload;
    payload = { ...rest, ...protectedEmail(plaintext) };
  }
  const key = digest(`${purpose}:${email}`);
  const now = new Date();
  const code = String(randomInt(0, 100000000)).padStart(8, "0");
  // A unique key and conditional update enforce cooldown across all API replicas.
  let challenge;
  try {
    challenge = await EmailCode.findOneAndUpdate({ key, sentAt: { $lte: new Date(Date.now() - 60000) } }, {
      $set: { purpose, payload, codeHash: digest(`${key}:${code}`), attempts: 0, sentAt: now, expiresAt: new Date(Date.now() + 10 * 60000) },
    }, { upsert: true, new: true });
  } catch (error) { if (error.code === 11000) return; throw error; }
  try {
    await sendEmail({
      to: email,
      subject: purpose === "register" ? "Confirme seu e-mail no litverso" : "Redefina sua senha no litverso",
      text: `Seu código do litverso é: ${code}\n\nEle expira em 10 minutos e pode ser usado uma única vez. Não compartilhe este código. Se você não solicitou, ignore esta mensagem.`,
    });
  } catch {
    await EmailCode.deleteOne({ _id: challenge._id, codeHash: challenge.codeHash });
    throw new Error("EMAIL_SEND_FAILED");
  }
}
export async function consumeCode(email, purpose, code, registrationToken) {
  const key = digest(`${purpose}:${email}`);
  if (purpose === "register" && (typeof registrationToken !== "string" || !/^[a-f0-9]{64}$/.test(registrationToken))) return null;
  const binding = purpose === "register" ? { "payload.registrationTokenHash": createHash("sha256").update(registrationToken).digest("hex") } : {};
  const challenge = await EmailCode.findOneAndUpdate({ key, ...binding, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true });
  if (!challenge) return null;
  const actual = Buffer.from(digest(`${key}:${code}`), "hex");
  if (!timingSafeEqual(actual, Buffer.from(challenge.codeHash, "hex"))) return null;
  // Only one concurrent request can consume the challenge.
  return EmailCode.findOneAndDelete({ _id: challenge._id, codeHash: challenge.codeHash, attempts: { $lte: 5 }, expiresAt: { $gt: new Date() } });
}
