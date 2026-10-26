const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const address = value => typeof value === "string" && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) && !/[\r\n]/.test(value);

export function emailTransportConfigured(env = process.env) {
  const provider = env.EMAIL_PROVIDER || "resend";
  if (provider === "gmail") return Boolean(address(env.GMAIL_USER) && env.GMAIL_CLIENT_ID?.trim() && env.GMAIL_CLIENT_SECRET?.trim() && env.GMAIL_REFRESH_TOKEN?.trim());
  return provider === "resend" && Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

export function createEmailSender({ fetchImpl = (...args) => fetch(...args), config = () => process.env, now = Date.now } = {}) {
  let cached;
  let pending;
  let credentials;

  async function accessToken(env, force = false) {
    const identity = JSON.stringify([env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REFRESH_TOKEN]);
    if (credentials !== identity) { credentials = identity; cached = null; pending = null; }
    if (!force && cached?.expires > now()) return cached.token;
    if (pending) return pending;
    const operation = (async () => {
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
          refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: "refresh_token" }),
      });
      if (!response.ok) throw new Error("GMAIL_AUTHORIZATION_FAILED");
      const data = await response.json();
      if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("GMAIL_AUTHORIZATION_FAILED");
      if (credentials === identity) cached = { token: data.access_token, expires: now() + Math.max(0, data.expires_in - 60) * 1000 };
      return data.access_token;
    })();
    pending = operation;
    try { return await operation; }
    finally { if (pending === operation) pending = null; }
  }

  return async function sendEmail({ to, subject, text }) {
    const env = { ...config() };
    if (!emailTransportConfigured(env)) throw new Error("EMAIL_NOT_CONFIGURED");
    if (!address(to) || typeof subject !== "string" || /[\r\n]/.test(subject) || typeof text !== "string") throw new Error("INVALID_EMAIL_MESSAGE");
    try {
      if ((env.EMAIL_PROVIDER || "resend") === "resend") {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
        });
        if (!response.ok) throw new Error("EMAIL_SEND_FAILED");
        return;
      }

      const encodedText = Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
      const mime = [
        `From: litverso <${env.GMAIL_USER}>`, `To: ${to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
        "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64", "", encodedText,
      ].join("\r\n");
      const raw = Buffer.from(mime, "utf8").toString("base64url");
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = await accessToken(env, attempt === 1);
        const response = await fetchImpl(SEND_URL, {
          method: "POST", signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        });
        // Only retry an explicit authentication rejection, never an ambiguous send failure.
        if (response.status === 401 && attempt === 0) { cached = null; await response.body?.cancel(); continue; }
        if (!response.ok) throw new Error("EMAIL_SEND_FAILED");
        const result = await response.json();
        if (typeof result.id !== "string" || !result.id) throw new Error("EMAIL_SEND_FAILED");
        return;
      }
      throw new Error("EMAIL_SEND_FAILED");
    } catch {
      // Upstream errors and response bodies may contain credentials or message contents.
      throw new Error("EMAIL_SEND_FAILED");
    }
  };
}

export const sendEmail = createEmailSender();
