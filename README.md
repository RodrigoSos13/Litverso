# litverso

Rede social literária para descobrir livros, organizar leituras e compartilhar resenhas e fanarts. Desenvolvida com React, Express e MongoDB.

Para hospedar gratuitamente no Render com MongoDB Atlas, siga [o guia de publicação](docs/deploy-render.md).

A API própria usa Express e Mongoose. Consulte [a documentação da API REST](docs/api-rest.md)
para localizar o código, conhecer os endpoints de leituras e testar o CRUD no Postman.

## Rodar o sistema

**Requisito:** Docker com Docker Compose (ou Docker Desktop). Não é necessário instalar Node.js ou MongoDB separadamente.

Na raiz do projeto, execute:

```bash
docker compose up --build -d --wait
```

Acesse **http://localhost:8080** e clique em **Criar conta**. O banco começa vazio; você pode cadastrar livros manualmente.

O modo de desenvolvimento atualiza a interface e reinicia o backend ao salvar alterações no código. Após mudar dependências ou Dockerfiles, execute novamente o comando acima.

## Importar livros (opcional)

Copie o arquivo de configuração, caso ainda não tenha um `.env`:

```bash
cp -n .env.example .env
```

No `.env` da raiz, preencha `GOOGLE_BOOKS_API_KEY` com uma chave da **Books API** do Google Cloud. Depois, aplique a configuração:

```bash
docker compose up -d --wait
```

O catálogo será alimentado automaticamente em segundo plano. Para importar um autor específico:

```bash
docker compose exec backend npm run catalog:sync -- "Stephen King"
```

Sem a chave, o sistema continua funcionando com os livros cadastrados localmente.

## Comandos úteis

```bash
# Acompanhar logs
docker compose logs -f

# Conferir os serviços
docker compose ps

# Parar sem apagar os dados
docker compose down
```

Os dados ficam em um volume Docker e são preservados entre execuções.

### Confirmação de e-mail e recuperação de senha

Novas contas são criadas somente após informar o código de 8 dígitos recebido por e-mail. Na tela de entrada, **Esqueci minha senha** envia um código para redefinir a senha; a alteração invalida todas as sessões anteriores. Contas antigas continuam acessíveis: não são marcadas automaticamente como verificadas. A recuperação por código também confirma o acesso ao e-mail dessas contas.

Configure no `.env` da raiz (Docker) ou em `backend/.env` (execução direta):

```dotenv
RESEND_API_KEY=<chave de envio do Resend>
EMAIL_FROM=litverso <contato@seu-dominio.com>
EMAIL_CODE_SECRET=<segredo aleatório de pelo menos 32 caracteres>
```

Gere o segredo com `openssl rand -hex 32`. Ele deve ser privado, estável e igual em todas as instâncias da API. Alterá-lo invalida códigos pendentes. Nunca coloque essas variáveis em `VITE_*`, no frontend ou no Git. No [Resend](https://resend.com/docs/dashboard/domains/introduction), verifique seu domínio e configure os registros DNS solicitados. O remetente de testes do provedor não serve para enviar a qualquer pessoa. Reinicie o backend após configurar; em Docker, execute `docker compose up -d --build backend`.

Sem configuração, cadastro e recuperação retornam indisponibilidade; não há código de teste, impressão de códigos no console ou confirmação automática. O login das contas existentes continua funcionando. Uma resposta de envio aceita pelo provedor não garante entrega na caixa de entrada: confira spam e o painel de entregas do serviço. Para validar a configuração real, cadastre um endereço sob seu controle, confirme o código e teste **Esqueci minha senha** com uma segunda sessão aberta. Ela deve perder o acesso após a alteração. Não compartilhe códigos ou chaves ao relatar falhas.

Os códigos expiram em 10 minutos, permitem cinco tentativas e são consumidos atomicamente uma única vez. Há intervalo de 60 segundos, limite de cinco solicitações por endereço/finalidade por hora e 20 pedidos por IP/rota a cada 15 minutos, persistidos no MongoDB. Os limites usam janelas fixas. O cadastro vincula a confirmação a um token da solicitação mantido apenas na memória da página; após recarregar a página, reinicie o cadastro e aguarde o intervalo de reenvio. O banco guarda um HMAC dos códigos com segredo externo e somente hashes de senha; cadastros pendentes expiram automaticamente. Endereços de e-mail não aparecem nos perfis, listagens ou respostas de edição. Cadastro e recuperação usam mensagens genéricas quando uma conta/endereço não permite envio; isso reduz enumeração, mas tempos de rede e falhas do provedor ainda podem produzir diferenças observáveis.

O e-mail é armazenado criptografado no banco e enviado em texto ao provedor por HTTPS para entregar a mensagem. Restrinja o acesso ao MongoDB, proteja backups e credenciais e use HTTPS em produção. O Compose incluído é para desenvolvimento HTTP; em produção, configure `NODE_ENV=production`, `FRONTEND_ORIGIN` com HTTPS e um proxy confiável antes de habilitar `TRUST_PROXY=1`. Nenhum sistema pode prometer ausência absoluta de vazamentos.


### Criptografia dos endereços no banco

Os endereços das contas e dos cadastros pendentes usam AES-256-GCM com IV aleatório por gravação. `emailEncrypted` contém o texto cifrado e `emailHash` contém um HMAC-SHA-256 para busca e unicidade. Ambos são privados nas consultas e respostas. O campo original `email` é somente uma entrada virtual no modelo e não é persistido. Login, confirmação e recuperação continuam com o mesmo fluxo; as senhas mantêm o hash scrypt.

Configure **duas chaves diferentes e permanentes**, geradas separadamente com `openssl rand -hex 32`:

```dotenv
EMAIL_ENCRYPTION_KEY=<64 caracteres hexadecimais>
EMAIL_LOOKUP_KEY=<outros 64 caracteres hexadecimais>
```

Em Docker, use o `.env` da raiz; ao executar scripts ou servidor diretamente em `backend/`, disponibilize as mesmas chaves em `backend/.env` ou no ambiente do processo. Não gere chaves novas para um banco já migrado. Guarde cópia segura das duas chaves fora do banco e não as envie ao frontend ou ao Git. Elas são independentes de `EMAIL_CODE_SECRET`. Uma troca exige uma migração específica de rotação; substituir as variáveis diretamente não faz rotação.

Na inicialização, antes de abrir a API, o backend valida as chaves contra os registros cifrados existentes, preenche o índice HMAC dos usuários antigos, remove apenas o índice legado de e-mail e converte os campos em texto aberto das contas e cadastros pendentes. A migração pode ser repetida e preserva IDs, senhas, tokens de confirmação e sessões. Falhas de chave ou inconsistências interrompem a inicialização. Em instalações com várias instâncias, pare as versões antigas antes de migrar: elas ainda gravam o formato legado. Para aplicar no ambiente local: `docker compose up -d --build --force-recreate backend`.

A migração remove o texto aberto dos documentos atuais; backups antigos, históricos do banco e blocos antigos de armazenamento não são apagados por essa mudança. A criptografia protege uma cópia do banco sem as chaves; o backend com acesso às chaves pode descriptografar, e o provedor de e-mail recebe o destinatário para fazer a entrega.


Para desativar somente a sincronização automática, mantenha a chave do Google Books e defina no `.env` da raiz:

```dotenv
CATALOG_SYNC_ENABLED=false
```

Aplique com `docker compose up -d catalog-sync`. O processo fica ocioso, sem consultar MongoDB ou Google Books, e a importação manual por `docker compose exec backend npm run catalog:sync -- "inauthor:Carl Sagan"` continua disponível. Para reativar, altere para `true` e execute novamente o comando do Compose. Na primeira atualização do código, use `docker compose up -d --build catalog-sync`. Alterações no `.env` exigem recriar o serviço com `up -d`; apenas `restart` não recarrega as variáveis.
