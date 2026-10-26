# Códigos por Gmail API (HTTPS)

O Litverso pode enviar códigos de cadastro e recuperação usando uma conta Gmail
exclusiva, sem SMTP, senha de app ou domínio próprio. O backend renova o access
token por HTTPS e chama a Gmail API. O consentimento é dado uma vez pelo dono da
conta remetente; os destinatários não autorizam acesso às próprias contas.
Destinatários podem usar outros provedores. Aplicam-se os limites e controles
antispam do Google; uma resposta de envio aceita não garante entrega na caixa de entrada.

## 1. Criar e proteger a conta remetente

Crie ou escolha o Gmail exclusivo do Litverso, ative a verificação em duas etapas
e configure a recuperação da conta. Não é necessário gerar senha de app.
Mantenha a senha da conta fora do projeto.

## 2. Configurar o Google Cloud

1. Entre em https://console.cloud.google.com/ com uma conta que administrará o
   projeto. Pode usar o projeto da Books API ou criar um chamado Litverso.
2. Abra **APIs & Services → Library**, procure **Gmail API** e clique em **Enable**.
   A chave GOOGLE_BOOKS_API_KEY não autentica envios do Gmail.
3. Abra **Google Auth Platform → Get started** (ou OAuth consent screen).
4. Em **Branding**, preencha nome `Litverso`, e-mail de suporte e contato do
   desenvolvedor. Use informações reais. Campos opcionais de domínio podem ficar
   vazios quando o console permitir; não invente um domínio verificado.
5. Em **Audience**, selecione **External** para uma conta Gmail pessoal.
   Durante os testes, adicione **somente o Gmail remetente** em **Test users**.
   Não precisa cadastrar os destinatários dos códigos como usuários de teste.
6. Em **Data Access → Add or remove scopes**, adicione somente:

   ```text
   https://www.googleapis.com/auth/gmail.send
   ```

   Ele permite enviar e-mail; não solicita leitura da caixa de entrada.
7. Em **Clients → Create client**, escolha **Desktop app / Aplicativo para
   computador**, com nome `Litverso - autorização de envio`. Esse cliente é usado
   pelo utilitário administrativo executado no seu computador. Não escolha Web
   application para este procedimento. O cliente Desktop admite o retorno local
   usado pelo utilitário; não precisa cadastrar uma rota no site ou no Render.
8. Copie **Client ID** e **Client secret** para o `.env` local, conforme a etapa 3.
   Se baixar um JSON de credenciais, não o coloque no repositório.

### Atenção ao status Testing

Com consentimento **External + Testing**, o Google emite refresh tokens para
escopos do Gmail com validade de **sete dias**. Isso serve para validar o envio,
mas não para deixá-lo funcionando continuamente no site.

Para uso contínuo, abra **Audience → Publish app / In production**, seguindo as
exigências de consentimento/verificação que o console apresentar para seu caso.
O escopo gmail.send é sensível. Publicar não equivale a verificar o app e pode
haver avisos ou exigências adicionais. Não é preciso que os leitores autorizem
OAuth: só a conta remetente faz isso.

Depois de mudar o status para produção, execute novamente a autorização da
etapa 4 e substitua o token no Render. Não conte com a mudança de status para
prolongar um token de teste já emitido. Mesmo em produção, tokens podem ser
revogados ou invalidados (por exemplo, ao trocar a senha da conta Gmail).

## 3. Preencher o .env da raiz

Edite **`.env`**, não `.env.example`. Acrescente:

```dotenv
EMAIL_PROVIDER=gmail
GMAIL_USER=seu-gmail-exclusivo@gmail.com
GMAIL_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=seu-client-secret
```

Use os valores reais, sem compartilhá-los em capturas ou no chat. GMAIL_USER deve
ser exatamente a conta que você vai autorizar, sem `litverso <...>`.

Não altere EMAIL_CODE_SECRET, EMAIL_ENCRYPTION_KEY ou EMAIL_LOOKUP_KEY. Elas
continuam necessárias. RESEND_API_KEY e EMAIL_FROM não são usados com provedor
gmail; podem ser removidos quando a migração estiver validada. Nenhuma credencial
deve ser colocada em variável VITE_* ou no frontend.

## 4. Autorizar a conta no seu computador

Na raiz do repositório, com as dependências do backend instaladas, execute:

```bash
npm run gmail:authorize --prefix backend
```

O comando imprime um link do Google. Abra-o **no navegador do mesmo computador**
em que o comando roda, selecione o Gmail exclusivo do Litverso e conceda a
permissão de envio. Confira o nome do projeto e a conta escolhida. O processo usa
state e PKCE e espera por até cinco minutos em
`http://127.0.0.1:53682/oauth2/callback`, acessível apenas localmente.

Ao concluir, o script salva GMAIL_REFRESH_TOKEN diretamente no `.env` da raiz,
sem exibir o token no terminal ou no navegador. O `.env` continua ignorado pelo
Git. Não execute esse utilitário no Render nem dentro do contêiner Docker; o
navegador precisa alcançar a porta local no seu computador. Não autorize uma
conta de leitor: esta operação é exclusiva da administração do remetente.

Se aparecer access_denied, confira a conta nos Test users ou as políticas do
Google/Workspace. Se houver redirect_uri_mismatch, confira que o cliente é do
tipo Desktop. Se a porta estiver ocupada, encerre a execução anterior e repita.

## 5. Testar localmente

```bash
npm run email:test --prefix backend
```

Esse comando envia **uma mensagem de teste real para o próprio GMAIL_USER**.
Verifique o recebimento e o spam. Ele não cadastra usuário nem imprime códigos.

Se usar o Docker do projeto, aplique as novas variáveis:

```bash
docker compose up -d --build backend
```

Se executar diretamente em `backend/`, configure as mesmas variáveis também em
`backend/.env` ou no ambiente do processo; o servidor usa dotenv no diretório de
execução. Os dois utilitários administrativos acima leem sempre o `.env` da raiz.

## 6. Configurar o Render

Em **litverso → Environment → Edit**, adicione/atualize:

| Variável | Valor |
| --- | --- |
| EMAIL_PROVIDER | gmail |
| GMAIL_USER | Mesmo Gmail autorizado |
| GMAIL_CLIENT_ID | Client ID criado no Google Cloud |
| GMAIL_CLIENT_SECRET | Client secret do mesmo cliente |
| GMAIL_REFRESH_TOKEN | Token salvo no seu .env pela etapa 4 |

Copie valores sem aspas externas do `.env` para o painel. Não compartilhe o token.
Mantenha as três variáveis EMAIL_* de segredo/criptografia e a configuração do
banco/origem existentes. Não precisa de senha de app ou callback OAuth no Render.

Envie o código atualizado para a branch de deploy no GitHub. Salve as variáveis
e aplique o novo deploy no Render. Confira que ele utiliza a versão que inclui
`backend/src/services/emailSender.js`. No Blueprint existente, não remova
credenciais de outro provedor antes de o Gmail funcionar; o código mantém Resend
como padrão quando EMAIL_PROVIDER não foi definido. O Blueprint atual não precisa
ser alterado: adicione as novas variáveis diretamente no painel do serviço existente.

## 7. Validar no site

1. Abra uma janela anônima e cadastre um endereço sob seu controle, preferencialmente
   de outro provedor, como Outlook. Ele não precisa ser Test user do OAuth.
2. Confira recebimento, informe o código e faça login.
3. Teste **Esqueci minha senha** e verifique que a senha anterior deixa de funcionar.
4. Confira em Enviados na conta Gmail se as mensagens aparecem.

Falha geral de envio: confira Gmail API habilitada, variáveis, conta autorizada,
escopo gmail.send, limites do Google e validade do token. Token expirado/revogado:
execute novamente `gmail:authorize` e atualize GMAIL_REFRESH_TOKEN no Render.
O sistema não imprime credenciais nem respostas externas com conteúdos de e-mail
nos logs. Não repete automaticamente um envio que falhou de modo ambíguo, para
evitar mensagens duplicadas. Erro explícito 401 permite uma renovação e nova tentativa.

## Arquivos e garantias preservadas

- `backend/src/services/emailSender.js`: seleção de provedor, OAuth refresh,
  cache de access token, MIME UTF-8 e envio por HTTPS.
- `backend/src/auth/emailCodes.js`: continua gerando e consumindo os códigos,
  com 10 minutos de validade, uso único, cinco tentativas e limites de reenvio.
- `backend/scripts/authorize-gmail.js`: autorização administrativa local.
- `backend/scripts/test-email.js`: teste real de envio para a conta remetente.
- `compose.yaml`: repassa as novas variáveis ao backend local.

As regras de criptografia, sessão, confirmação e recuperação foram preservadas.
Se o envio falha, o código não entregue é descartado e nenhuma conta é confirmada.
Não há fallback automático para outro provedor quando Gmail falha.

## Fontes oficiais

- [Envio e formato MIME](https://developers.google.com/workspace/gmail/api/guides/sending)
- [OAuth Desktop e loopback](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Refresh tokens e expiração em Testing](https://developers.google.com/identity/protocols/oauth2)
- [Escopos do Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes)
