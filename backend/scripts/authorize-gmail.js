import dotenv from "dotenv";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
dotenv.config({ path: envPath });
const clientId = process.env.GMAIL_CLIENT_ID?.trim();
const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
const explanations = {
  EADDRINUSE: "A porta 53682 está ocupada. Encerre a execução anterior com Ctrl+C antes de tentar novamente.",
  EACCES: "O sistema bloqueou a abertura da porta local 53682. Execute o comando diretamente no terminal do seu computador.",
  EPERM: "O ambiente bloqueou a porta local 53682. Execute o comando diretamente no terminal do seu computador.",
  AUTH_TIMEOUT: "O prazo de 5 minutos terminou sem receber a autorização. Abra o link NOVO no navegador do mesmo computador e conclua a autorização mantendo o terminal aberto.",
  access_denied: "O Google não concedeu acesso. Confira se o Gmail do Litverso está nos usuários de teste e se você aceitou a permissão de envio.",
  invalid_client: "O Google rejeitou o cliente OAuth. Confira GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET: devem pertencer ao mesmo cliente do tipo Desktop.",
  invalid_grant: "O código de autorização expirou ou não corresponde a esta execução. Execute novamente e use apenas o link novo.",
  redirect_uri_mismatch: "O retorno OAuth não foi aceito. Use um cliente do tipo Aplicativo para computador (Desktop).",
  NO_REFRESH_TOKEN: "O Google não retornou autorização de envio offline. Repita o consentimento e aceite a permissão de enviar e-mails.",
  AbortError: "A conexão com o Google foi interrompida. Confira sua rede e repita a autorização.",
  TimeoutError: "O Google não respondeu à troca do código em 15 segundos. Confira sua rede e repita a autorização.",
  EROFS: "Não foi possível salvar o token: o .env está em um sistema de arquivos somente leitura.",
};
const explain = error => explanations[error?.code] || explanations[error?.message] || explanations[error?.name]
  || "Não foi possível concluir a autorização ou salvar o token. Confira a conexão, as permissões do .env e o cliente OAuth Desktop. Execute novamente e use o link novo.";
if (!clientId || !clientSecret) {
  console.error("Preencha GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET no .env da raiz. Consulte docs/gmail-api.md.");
  process.exit(1);
}
const redirectUri = "http://127.0.0.1:53682/oauth2/callback";
const state = randomBytes(32).toString("base64url");
const verifier = randomBytes(48).toString("base64url");
const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri,
  response_type: "code", scope: "https://www.googleapis.com/auth/gmail.send", access_type: "offline",
  prompt: "consent select_account", state, code_challenge_method: "S256",
  code_challenge: createHash("sha256").update(verifier).digest("base64url"),
})) url.searchParams.set(key, value);

let server;
let timer;
let handling = false;
try {
  await new Promise((resolve, reject) => {
    server = createServer(async (req, res) => {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const callback = new URL(req.url, redirectUri);
      if (req.method !== "GET" || callback.pathname !== "/oauth2/callback") { res.writeHead(404).end(); return; }
      if (callback.searchParams.get("state") !== state) { res.writeHead(400).end("Solicitação inválida. Use o link desta execução."); return; }
      if (handling) { res.writeHead(409).end("Autorização em andamento."); return; }
      handling = true;
      clearTimeout(timer);
      if (callback.searchParams.has("error") || !callback.searchParams.get("code")) {
        res.writeHead(400).end("Autorização não concedida. Volte ao terminal.");
        const reason = callback.searchParams.get("error");
        reject(new Error(reason === "access_denied" ? "access_denied" : "AUTH_FAILED")); return;
      }
      try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
            redirect_uri: redirectUri, code: callback.searchParams.get("code"),
            code_verifier: verifier, grant_type: "authorization_code" }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          const reason = ["invalid_client", "invalid_grant", "redirect_uri_mismatch", "access_denied"].includes(result.error) ? result.error : "TOKEN_FAILED";
          throw new Error(reason);
        }
        const tokens = await response.json();
        if (!tokens.refresh_token || (tokens.scope && !tokens.scope.split(" ").includes("https://www.googleapis.com/auth/gmail.send"))) throw new Error("NO_REFRESH_TOKEN");
        // Only the refresh token is persisted, never printed in terminal or browser.
        const previous = await readFile(envPath, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
        const filtered = previous.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?GMAIL_REFRESH_TOKEN\s*=/.test(line)).join("\n").trimEnd();
        const temporary = `${envPath}.gmail-${randomBytes(8).toString("hex")}.tmp`;
        try {
          await writeFile(temporary, `${filtered}\nGMAIL_REFRESH_TOKEN=${JSON.stringify(tokens.refresh_token)}\n`, { mode: 0o600, flag: "wx" });
          await rename(temporary, envPath);
        } finally { await unlink(temporary).catch(() => {}); }
        res.end("Conta autorizada. O token foi salvo no .env local. Pode fechar esta aba e voltar ao terminal.");
        resolve();
      } catch (error) {
        res.writeHead(400).end(explain(error));
        reject(error);
      }
    });
    server.once("error", reject);
    server.listen(53682, "127.0.0.1", () => {
      console.log("Abra o link abaixo no navegador DESTE computador e escolha o Gmail exclusivo do Litverso:");
      console.log(url.toString());
      console.log("Aguardando autorização por até 5 minutos. O token será salvo no .env sem ser exibido.");
    });
    timer = setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 5 * 60000);
  });
  console.log("GMAIL_REFRESH_TOKEN salvo no .env da raiz. Configure também GMAIL_USER com a mesma conta autorizada e siga docs/gmail-api.md para o Render.");
} catch (error) {
  console.error(`Autorização não concluída. ${explain(error)}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  server?.close();
  server?.closeAllConnections();
}
