import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { sendEmail } from "../src/services/emailSender.js";
import { authEmailTemplate } from "../src/services/authEmailTemplate.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (process.env.EMAIL_PROVIDER !== "gmail" || !process.env.GMAIL_USER) {
  console.error("Configure EMAIL_PROVIDER=gmail e as credenciais do Gmail no .env da raiz. Consulte docs/gmail-api.md.");
  process.exit(1);
}
try {
  await sendEmail({ to: process.env.GMAIL_USER, ...authEmailTemplate({ code: "00000000", purpose: "register", preview: true }) });
  console.log("Gmail aceitou o envio do teste para a própria conta remetente. Confira a caixa de entrada e o spam.");
} catch {
  console.error("Falha no teste de envio. Confira API habilitada, conta autorizada, credenciais e validade do refresh token. Consulte docs/gmail-api.md.");
  process.exitCode = 1;
}
