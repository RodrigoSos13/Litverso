# Publicar no Render + MongoDB Atlas

O `render.yaml` cria um único Web Service Free. O Express entrega a API e o
frontend React no mesmo endereço HTTPS, preservando os cookies de login.
O banco fica no Atlas; o volume MongoDB do Docker local não é usado no Render.

## 1. Enviar os arquivos ao GitHub

Revise as alterações com `git diff` e envie para seu repositório pelo Git do IDE.
Inclua `render.yaml`, `backend/src/app.js`, `backend/.env.example`, `README.md`
e este guia. Não envie `.env`, credenciais ou dumps. O `.gitignore` já os ignora.

## 2. Criar o banco no Atlas

1. Entre em https://cloud.mongodb.com/ e crie um projeto Litverso.
2. Crie um cluster **Free/M0**, em uma região disponível próxima do serviço.
3. Em Database Access, crie um usuário de banco com acesso de leitura e escrita
   somente ao banco `litverse`. Guarde a senha.
4. Em Connect → Drivers → Node.js, copie a URI. Substitua usuário e senha e
   acrescente `/litverse` antes do `?`, preservando as opções da conexão.
   Caracteres especiais no usuário/senha precisam de codificação de URL.

Exemplo fictício:

```text
mongodb+srv://USUARIO:SENHA@cluster.xxxxx.mongodb.net/litverse?retryWrites=true&w=majority
```

O banco começa vazio. Dados locais não são transferidos automaticamente.
Se quiser manter contas e livros existentes, faça backup e uma migração separada
com mongodump/mongorestore e preserve as chaves de criptografia existentes.
**Não execute `npm run seed` em um banco com dados: esse script apaga o banco.**

## 3. Preparar os segredos e o envio de e-mail

Para um banco novo, execute `openssl rand -hex 32` três vezes no terminal.
Guarde cada resultado em um gerenciador de senhas: um para EMAIL_ENCRYPTION_KEY,
outro para EMAIL_LOOKUP_KEY e outro para EMAIL_CODE_SECRET.
As duas primeiras chaves devem ser diferentes. Se migrar o banco atual, use
os valores atuais; trocá-los impede o acesso aos e-mails já armazenados.

No https://resend.com/, crie uma chave de API para envio.
Para teste com o endereço da própria conta Resend, use
`EMAIL_FROM=litverso <onboarding@resend.dev>`.
Para cadastrar outras pessoas, adicione um domínio seu ao Resend, configure os
registros DNS solicitados e use um remetente desse domínio. O subdomínio gratuito
do Render não é um domínio que você pode verificar no Resend. Se não tiver um
domínio próprio, o cadastro público depende de resolver essa etapa ou alterar
o sistema de autenticação. Sem envio configurado, novos cadastros e recuperação
de senha ficam indisponíveis.

## 4. Criar o serviço pelo Blueprint

1. Entre em https://dashboard.render.com/ e conecte seu GitHub.
2. Escolha **New → Blueprint**, selecione o repositório e a branch enviada.
3. Use o arquivo `render.yaml` da raiz. Confira que o serviço tem plano **Free**.
4. Preencha as variáveis solicitadas:

| Variável | Valor |
| --- | --- |
| MONGODB_URI | URI do Atlas com o banco litverse |
| FRONTEND_ORIGIN | https://NOME-REAL.onrender.com, sem barra no fim |
| EMAIL_ENCRYPTION_KEY | Primeira chave permanente de 64 caracteres hexadecimais |
| EMAIL_LOOKUP_KEY | Segunda chave permanente de 64 caracteres hexadecimais |
| EMAIL_CODE_SECRET | Terceiro segredo |
| RESEND_API_KEY | Chave de envio do Resend |
| EMAIL_FROM | Remetente configurado na etapa anterior |

Se ainda não souber o endereço público, use `https://example.invalid` como valor
temporário de FRONTEND_ORIGIN. Assim que o Render atribuir a URL, substitua-a em
**Environment** e aplique com novo deploy. Login/cadastro pelo navegador só
funcionam depois dessa correção.

O arquivo configura Node 24, build, inicialização, health check, HTTPS via proxy
e `VITE_API_URL=/api`. Não precisa definir PORT nem criar outro serviço frontend.
As dependências de build do Vite são instaladas mesmo com NODE_ENV=production.

## 5. Permitir que o Render acesse o banco

1. Abra o serviço criado no Render e vá em **Connect → Outbound**.
2. Copie todos os intervalos de IP de saída exibidos.
3. No Atlas, vá em **Network Access → IP Access List → Add IP Address**.
4. Adicione cada intervalo CIDR do Render.
5. Volte ao Render e use **Manual Deploy → Deploy latest commit** caso o
   primeiro deploy tenha falhado enquanto o banco estava bloqueado.

## 6. Testar

1. Espere o deploy ficar disponível.
2. Abra `https://NOME-REAL.onrender.com/api/health`: deve retornar JSON de saúde.
3. Abra o endereço principal e cadastre uma conta com um e-mail permitido pelo Resend.
4. Confirme o código, entre, navegue e atualize uma página interna.
5. Teste sair e entrar novamente e a recuperação de senha.

Se aparecer erro de origem, confira FRONTEND_ORIGIN (HTTPS, URL exata e sem `/`
no final). Falha de inicialização: confira acesso de rede, URI e chaves nos logs.
Erro de e-mail: confira as entregas no Resend e o domínio/remetente verificado.

## 7. Importar livros (opcional)

Adicione GOOGLE_BOOKS_API_KEY no Environment do Render e aplique a mudança para
habilitar recursos que usam a API do Google Books. Não coloque a chave em VITE_*.
O worker contínuo do Compose não é iniciado neste plano de publicação.

Para alimentar o catálogo manualmente pelo seu computador, configure em
`backend/.env` a URI do Atlas e GOOGLE_BOOKS_API_KEY. No Atlas, adicione também
seu IP atual à lista de acesso. Dentro de `backend`, execute:

```bash
npm run catalog:sync -- "inauthor:Machado de Assis"
```

Este comando grava no banco definido em MONGODB_URI. Confirme o destino antes de
executá-lo. O site não depende de um worker ativo para servir os livros já salvos.

## Limites e documentação

O Render Free suspende o serviço após 15 minutos sem tráfego; o próximo acesso
pode demorar cerca de um minuto. O Atlas Free tem limites de armazenamento e uso.
O envio público pelo Resend exige domínio verificado, que pode ter custo se você
ainda não possuir um. Não foram configurados workers ou cron jobs pagos.

- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://render.com/docs/outbound-ip-addresses
- https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
