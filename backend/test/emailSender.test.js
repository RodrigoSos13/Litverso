import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmailSender, emailTransportConfigured } from "../src/services/emailSender.js";
import { authEmailTemplate } from "../src/services/authEmailTemplate.js";

const env = { EMAIL_PROVIDER: "gmail", GMAIL_USER: "litverso@example.com", GMAIL_CLIENT_ID: "client",
  GMAIL_CLIENT_SECRET: "private-client-secret", GMAIL_REFRESH_TOKEN: "private-refresh-token" };
const message = { to: "reader@outlook.com", subject: "Confirmação de e-mail", text: "Seu código é 12345678.\nNão compartilhe." };
const token = () => Response.json({ access_token: "access-token", expires_in: 3600 });

test("Gmail entrega HTML e texto alternativo com o mesmo código e conteúdo UTF-8", async () => {
  const template = authEmailTemplate({ code: "01234567", purpose: "register" });
  const send = createEmailSender({ config: () => env, fetchImpl: async (url, options) => {
    if (url.includes("oauth2.googleapis.com")) return token();
    const mime = Buffer.from(JSON.parse(options.body).raw, "base64url").toString("utf8");
    const boundary = /boundary="([^"]+)"/.exec(mime)[1];
    const parts = mime.split(`--${boundary}`);
    assert.equal(parts.length, 4);
    for (const [part, expected, type] of [[parts[1], template.text, "text/plain"], [parts[2], template.html, "text/html"]]) {
      const [headers, body] = part.split("\r\n\r\n");
      assert.ok(headers.includes(type));
      assert.equal(Buffer.from(body.trim(), "base64").toString("utf8"), expected);
      assert.ok(expected.includes("01234567"));
    }
    return Response.json({ id: "styled" });
  } });
  await send({ to: message.to, ...template });
});

test("modelos distinguem confirmação, recuperação e prévia e rejeitam conteúdo injetado", () => {
  const reset = authEmailTemplate({ code: "12345678", purpose: "reset" });
  assert.match(reset.html, /RECUPERAÇÃO DE SENHA/);
  assert.doesNotMatch(reset.text, /Se você não pediu uma nova senha/);
  assert.doesNotMatch(reset.html, /Sua senha permanece a mesma/);
  assert.match(reset.html, /10 minutos/);
  assert.doesNotMatch(reset.html, /<script|<img|<form|https?:\/\//);
  assert.throws(() => authEmailTemplate({ code: '<img onerror="alert(1)">', purpose: "register" }));
  assert.throws(() => authEmailTemplate({ code: "12345678", purpose: "unknown" }));
  assert.match(authEmailTemplate({ code: "00000000", purpose: "register", preview: true }).text, /ilustrativo/);
});

test("Resend recebe o HTML junto do texto alternativo", async () => {
  const template = authEmailTemplate({ code: "12345678", purpose: "reset" });
  const send = createEmailSender({ config: () => ({ RESEND_API_KEY: "key", EMAIL_FROM: "sender@example.com" }), fetchImpl: async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.html, template.html);
    assert.equal(payload.text, template.text);
    return Response.json({ id: "sent" });
  } });
  await send({ to: message.to, ...template });
});

test("configuração seleciona explicitamente Gmail ou Resend, sem fallback silencioso", () => {
  assert.equal(emailTransportConfigured(env), true);
  assert.equal(emailTransportConfigured({ ...env, GMAIL_REFRESH_TOKEN: "" }), false);
  assert.equal(emailTransportConfigured({ ...env, GMAIL_USER: "invalid\r\nFrom: attacker" }), false);
  assert.equal(emailTransportConfigured({ ...env, EMAIL_PROVIDER: "unknown" }), false);
  assert.equal(emailTransportConfigured({ RESEND_API_KEY: "key", EMAIL_FROM: "from@example.com" }), true);
});

test("envia MIME UTF-8 por HTTPS e compartilha renovação entre envios simultâneos", async () => {
  let refreshes = 0;
  let sends = 0;
  const send = createEmailSender({ config: () => env, fetchImpl: async (url, options) => {
    assert.match(url, /^https:\/\//);
    if (url.includes("oauth2.googleapis.com")) {
      refreshes++;
      assert.equal(options.body.get("grant_type"), "refresh_token");
      assert.equal(options.body.get("refresh_token"), env.GMAIL_REFRESH_TOKEN);
      return token();
    }
    sends++;
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(options.headers.Authorization, "Bearer access-token");
    const mime = Buffer.from(JSON.parse(options.body).raw, "base64url").toString("utf8");
    assert.match(mime, /From: litverso <litverso@example.com>\r\nTo: reader@outlook.com/);
    const [headers, body] = mime.split("\r\n\r\n");
    assert.equal(Buffer.from(body, "base64").toString("utf8"), message.text);
    const subject = /Subject: =\?UTF-8\?B\?(.+)\?=/.exec(headers)[1];
    assert.equal(Buffer.from(subject, "base64").toString("utf8"), message.subject);
    return Response.json({ id: "sent" });
  } });
  await Promise.all([send(message), send(message)]);
  assert.equal(refreshes, 1);
  assert.equal(sends, 2);
});

test("renova tokens antes da expiração e ao mudar as credenciais", async () => {
  let clock = 0;
  let refreshes = 0;
  let current = { ...env };
  const send = createEmailSender({ config: () => current, now: () => clock, fetchImpl: async url => {
    if (url.includes("oauth2.googleapis.com")) { refreshes++; return token(); }
    return Response.json({ id: "sent" });
  } });
  await send(message); await send(message);
  assert.equal(refreshes, 1);
  clock = 3600 * 1000;
  await send(message);
  assert.equal(refreshes, 2);
  current.GMAIL_REFRESH_TOKEN = "replacement-token";
  await send(message);
  assert.equal(refreshes, 3);
});

test("401 explícito renova credencial uma vez; não repete falhas ambíguas de envio", async () => {
  let sends = 0;
  let refreshes = 0;
  const send = createEmailSender({ config: () => env, fetchImpl: async url => {
    if (url.includes("oauth2.googleapis.com")) { refreshes++; return token(); }
    sends++;
    return sends === 1 ? Response.json({}, { status: 401 }) : Response.json({ id: "sent" });
  } });
  await send(message);
  assert.equal(sends, 2); assert.equal(refreshes, 2);
  for (const status of [403, 429, 500, 503]) {
    let attempts = 0;
    const failed = createEmailSender({ config: () => env, fetchImpl: async url => {
      if (url.includes("oauth2.googleapis.com")) return token();
      attempts++; return Response.json({ error: "secret" }, { status });
    } });
    await assert.rejects(failed(message), { message: "EMAIL_SEND_FAILED" });
    assert.equal(attempts, 1);
  }
});

test("revogação, timeout e respostas inválidas não expõem segredos nem enviam sem token", async () => {
  for (const response of [() => Response.json({ error: "invalid_grant" }, { status: 400 }),
    () => Response.json({ access_token: "bad" }), () => { throw new Error(env.GMAIL_REFRESH_TOKEN); }]) {
    const send = createEmailSender({ config: () => env, fetchImpl: async () => response() });
    await assert.rejects(send(message), { message: "EMAIL_SEND_FAILED" });
  }
  let calls = 0;
  const send = createEmailSender({ config: () => env, fetchImpl: async () => { calls++; return token(); } });
  await assert.rejects(send({ ...message, to: "reader@example.com\r\nBcc: another@example.com" }));
  await assert.rejects(send({ ...message, subject: "Subject\r\nBcc: another@example.com" }));
  assert.equal(calls, 0);
});

test("Resend continua compatível quando Gmail não foi selecionado", async () => {
  const send = createEmailSender({ config: () => ({ RESEND_API_KEY: "resend-key", EMAIL_FROM: "sender@example.com" }), fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.deepEqual(JSON.parse(options.body), { ...message, to: [message.to], from: "sender@example.com" });
    return Response.json({ id: "sent" });
  } });
  await send(message);
});
