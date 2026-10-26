// Inline styles and tables support email clients without remote assets or scripts.
export function authEmailTemplate({ code, purpose, preview = false }) {
  if (!/^\d{8}$/.test(code) || !["register", "reset"].includes(purpose)) throw new Error("INVALID_AUTH_EMAIL");
  const registering = purpose === "register";
  const subject = preview ? "Prévia do e-mail do litverso" : registering ? "Confirme seu e-mail no litverso" : "Redefina sua senha no litverso";
  const title = preview ? "Um novo visual para suas histórias." : registering ? "Seu próximo capítulo começa aqui." : "Vamos recuperar seu acesso.";
  const instruction = preview ? "Esta é uma mensagem de teste do visual dos e-mails do litverso. O código abaixo é ilustrativo e não confirma contas nem altera senhas." : registering
    ? "Falta só um passo para fazer parte da nossa comunidade. Digite o código abaixo na tela de confirmação do litverso."
    : "Recebemos um pedido para redefinir sua senha. Digite o código abaixo na tela de recuperação do litverso para continuar.";
  const footer = preview ? "Prévia de configuração enviada para a própria conta do litverso. Nenhuma ação é necessária." : "";
  const text = `${subject}\n\n${instruction}\n\nSeu código do litverso é: ${code}\n\nEle expira em 10 minutos e pode ser usado uma única vez. Não compartilhe este código.${footer ? `\n\n${footer}` : ""}\n\nEquipe litverso`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#e9edf5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${registering ? "Confirme seu e-mail para começar sua jornada no litverso." : "Seu código para recuperar o acesso ao litverso chegou."}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td align="center" style="padding:12px 8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b1324" style="width:100%;max-width:520px;background-color:#0b1324;border-radius:20px;padding:20px;">
<tr><td style="padding:0 0 18px;">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:bold;letter-spacing:-1px;color:#ffffff;">litverso<span style="color:#d8a24a;">.</span></span>
<p style="margin:8px 0 0;font-size:11px;letter-spacing:2px;color:#aebbd0;">UM UNIVERSO DE HISTÓRIAS</p>
</td></tr>
<tr><td bgcolor="#152037" style="padding:0;background-color:#152037;border:1px solid #2d3a51;border-radius:20px;overflow:hidden;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td height="4" bgcolor="#a33547" style="height:4px;background-color:#a33547;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 20px;">
<p style="margin:0 0 16px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#e3b766;">${registering ? "CONFIRMAÇÃO DE E-MAIL" : "RECUPERAÇÃO DE SENHA"}</p>
<h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:normal;line-height:1.25;color:#ffffff;">${title}</h1>
<p style="margin:16px 0 20px;font-size:15px;line-height:1.7;color:#c4cede;">${instruction}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b1324" style="background-color:#0b1324;border:1px solid #795d36;border-radius:12px;"><tr><td align="center" style="padding:18px 8px;">
<p style="margin:0 0 12px;font-size:10px;font-weight:bold;letter-spacing:2px;color:#aebbd0;">SEU CÓDIGO DE VERIFICAÇÃO</p>
<p dir="ltr" style="margin:0;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:4px;line-height:1.4;color:#f1c77c;white-space:nowrap;">${code}</p>
<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#b9c5d8;">Válido por <strong style="color:#ffffff;">10 minutos</strong> · Uso único</p>
</td></tr></table>
<p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#c4cede;">Este código é só seu. Não compartilhe com ninguém, mesmo que a pessoa diga fazer parte da equipe litverso.</p>
${footer ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;"><tr><td style="border-top:1px solid #324058;padding-top:20px;font-size:12px;line-height:1.7;color:#aebbd0;">${footer}</td></tr></table>` : ""}
</td></tr></table></td></tr>
<tr><td align="center" style="padding:18px 0 0;">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#c4cede;">Histórias conectam. Leituras aproximam.</p>
<p style="margin:10px 0 0;font-size:11px;line-height:1.7;color:#93a3bc;">Mensagem automática do litverso. Não é necessário responder.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
