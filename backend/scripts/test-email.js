import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { sendEmail } from "../src/services/emailSender.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (process.env.EMAIL_PROVIDER !== "gmail" || !process.env.GMAIL_USER) {
  console.error("Configure EMAIL_PROVIDER=gmail e as credenciais do Gmail no .env da raiz. Consulte docs/gmail-api.md.");
  process.exit(1);
}
try {
  await sendEmail({ to: process.env.GMAIL_USER, subject: "Teste de envio do litverso",
    text: "A integração do litverso com a Gmail API conseguiu enviar esta mensagem por HTTPS. Este é um teste de configuração, não um código de confirmação." });
  console.log("Gmail aceitou o envio do teste para a própria conta remetente. Confira a caixa de entrada e o spam.");
} catch {
  console.error("Falha no teste de envio. Confira API habilitada, conta autorizada, credenciais e validade do refresh token. Consulte docs/gmail-api.md.");
  process.exitCode = 1;
}
