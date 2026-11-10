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

Acesse **http://localhost:8080** para explorar o catálogo e a comunidade como visitante.
Para publicar, curtir, comentar, seguir leitores, avaliar ou organizar leituras,
entre ou clique em **Criar conta**. O banco começa vazio; usuários autenticados
podem cadastrar livros manualmente.

O [modo visitante](docs/modo-visitante.md) permite consultar conteúdo público e
exibe um convite de acesso ao tentar interagir. A API também exige autenticação
para todas as alterações.

O modo de desenvolvimento atualiza a interface e reinicia o backend ao salvar alterações no código. Após mudar dependências ou Dockerfiles, execute novamente o comando acima.

## Recomendações no catálogo

O catálogo varia a seleção em cada visita. Para contas autenticadas, combina
autores e gêneros das leituras, avaliações, pesquisas recentes e interesses dos
leitores que a pessoa segue. Livros já lidos perdem prioridade, e a ordenação
inclui variedade de autores e novas descobertas. A busca por título, autor ou
ISBN continua usando seus filtros habituais.

As preferências de pesquisa são gerenciadas pela API autenticada
`/api/books/interests`: `PUT` com `{ "enabled": false }` desativa o uso das pesquisas
e apaga o histórico; `DELETE` apaga somente o histórico. O perfil guarda até 20 pesquisas, usa apenas as dos últimos
90 dias e não expõe esses termos a outros usuários. Desativar também apaga o
histórico; as listas e avaliações continuam contribuindo para as sugestões.

Cada visita autenticada mantém sua ordem por até uma hora em um snapshot com
expiração automática no MongoDB, inclusive entre instâncias da API. Uma nova visita
inicia uma nova seleção. Não depende de serviços externos
nem exige recalcular o catálogo ou alterar os livros existentes.

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

O envio pode usar **Gmail API por HTTPS/OAuth**, compatível com Render Free e sem
domínio próprio, ou Resend. Para configurar o Gmail, siga [o passo a passo](docs/gmail-api.md),
incluindo autorização da conta, token e variáveis no Render. Nenhuma senha de app
é necessária. Sem `EMAIL_PROVIDER`, o provedor padrão continua sendo Resend.

Novas contas são criadas somente após informar o código de 8 dígitos recebido por e-mail. Na tela de entrada, **Esqueci minha senha** envia um código para redefinir a senha; a alteração invalida todas as sessões anteriores. Contas antigas continuam acessíveis: não são marcadas automaticamente como verificadas. A recuperação por código também confirma o acesso ao e-mail dessas contas.

Para **Resend**, configure no `.env` da raiz (Docker) ou em `backend/.env` (execução direta):

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

### Administração e denúncias

Usuários autenticados podem denunciar publicações (incluindo fanarts, resenhas e citações) e comentários. Cada conta pode enviar uma denúncia por conteúdo. O painel `/admin`, disponível pela aba Administração ao lado de Livros e Comunidade, permite filtrar denúncias pendentes e concluídas, consultar o texto denunciado e a publicação com imagens, registrar uma observação e descartar a denúncia ou remover o conteúdo. A remoção de uma publicação também apaga seus comentários e curtidas. O histórico mantém o texto denunciado e a identificação do administrador responsável; denúncias não são expostas aos demais usuários.

Para conceder acesso a uma conta existente, execute em `backend/` com o banco configurado:

```bash
npm run user:set-admin -- nome_do_usuario
```

Para revogar o acesso: `npm run user:set-admin -- nome_do_usuario user`. Atualize a página da conta após a alteração. Cadastro e edição de perfil não permitem alterar a função administrativa.

## Importação em massa do catálogo

O comando `npm run catalog:import --prefix backend -- --help` importa metadados reais sem
executar na inicialização da API. A referência versionada em
`backend/src/data/priorityCatalog.json` contém 500 candidatos extraídos do pedido inicial.
São candidatos de pesquisa, não registros prontos: títulos, atribuições e lançamentos
precisam ser confirmados pelas fontes. Não há alegação de ranking de vendas.

O importador usa Google Books como fonte principal e Open Library como complemento.
Configurações: `MONGODB_URI` e, para Google, `GOOGLE_BOOKS_API_KEY` no `.env` da raiz.
Não usa `ATLAS_MONGODB_URI` implicitamente: o destino sempre é o MongoDB configurado
para esta execução. Sem `MONGODB_URI`, usa `mongodb://127.0.0.1:27017/litverse`.
No Compose de desenvolvimento, a porta publicada é 27018.

```bash
# Apenas a referência prioritária, primeiro em simulação (lê o banco, não grava nem cria índices).
MONGODB_URI=mongodb://127.0.0.1:27018/litverse npm run catalog:import --prefix backend -- --priority --dry-run --state ../backups/catalog-import/simulation.json

# Prioritários, no máximo 500 novas obras nesta invocação.
MONGODB_URI=mongodb://127.0.0.1:27018/litverse npm run catalog:import --prefix backend -- --priority --max-new 500 --state ../backups/catalog-import/priority.json

# Lista prioritária seguida de descoberta por autores e assuntos; limite de 5000 inserções.
MONGODB_URI=mongodb://127.0.0.1:27018/litverse npm run catalog:import --prefix backend -- --max-new 5000 --pages 10

# Um ou vários grupos da referência (use os nomes de genero do JSON).
npm run catalog:import --prefix backend -- --genre "Fantasia,Romance" --max-new 300
npm run catalog:import --prefix backend -- --author "Agatha Christie" --max-new 100
npm run catalog:import --prefix backend -- --series "One Piece" --author "Eiichiro Oda" --max-new 100

# Retoma os filtros originais e o cursor; max-new é um novo limite por invocação.
npm run catalog:import --prefix backend -- --resume --max-new 1000
npm run catalog:import --prefix backend -- --report
```

`--state` é relativo ao diretório de execução (com `npm --prefix backend`, ao backend).
Sem esse parâmetro, o relatório fica em `backups/catalog-import/latest.json` na raiz.
Use arquivos separados para simulação e gravação. `--resume` recupera os filtros salvos,
valida a versão da lista e repete a página interrompida com deduplicação.
`--report --state caminho.json` lê um relatório sem conectar ao banco ou às APIs.
`--pages` limita páginas por consulta (1–50); `--delay` ajusta o intervalo entre
requisições (mínimo 1000 ms; padrão 1100). A concorrência é deliberadamente 1.
Requisições têm timeout e falhas temporárias recebem até três tentativas com backoff.
Uma falha de busca preserva o cursor e encerra a execução com código 1 para retomada.

### Docker

A imagem do backend inclui scripts e dados. Após alterações, reconstrua a imagem.
Monte o diretório de relatórios para manter os checkpoints ao remover o container:

```bash
docker compose build backend
mkdir -p backups/catalog-import
docker compose run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/backups/catalog-import:/reports" \
  backend npm run catalog:import -- --priority --max-new 500 --state /reports/priority.json

docker compose run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/backups/catalog-import:/reports" \
  backend npm run catalog:import -- --resume --max-new 1000 --state /reports/priority.json
```

O MongoDB existente do Compose é reutilizado. Não execute `seed` para importar livros.
O worker antigo `catalog-sync` continua separado; esta expansão não é agendada na
inicialização. É possível desativar o worker com `CATALOG_SYNC_ENABLED=false`.

### Qualidade, preservação e relatórios

Machado de Assis e Jorge Amado são excluídos tanto nas buscas Google quanto na
persistência do importador e do worker. Os registros antigos não são apagados.
O importador nunca altera um livro existente: mantém seus IDs, dados manuais,
avaliações, leituras e publicações. Avaliações externas são removidas do payload.
São inserções idempotentes com `$setOnInsert`, índice parcial único de obra importada,
ISBN, IDs de fonte e comparação conservadora de título/autoria. Nenhum índice existente
é removido ou reconstruído. O índice novo não modifica registros anteriores.

As traduções usam aliases explícitos da referência ou o identificador de obra da
Open Library. Não se presume que títulos diferentes sejam traduções: aliases novos
podem ser acrescentados ao JSON após revisão. A referência não oferece um mapa
universal de traduções. Sufixos conhecidos de acabamento não criam novas obras;
números e títulos de volumes são preservados. Volumes de mangás nunca são gerados
artificialmente. Correspondência aproximada de títulos é evitada para não unir obras.

A seleção prioriza português e usa inglês como alternativa, compatível com os filtros
atuais. O código `pt` da fonte não comprova que uma edição seja brasileira; idioma e
editora são preservados como fornecidos, sem renomeá-los como `pt-BR`. A Open Library
fornece campos de uma única edição: não se misturam arrays de ISBN/capa/idioma de obras.
As capas precisam responder com conteúdo de imagem em HTTPS nos hosts das fontes.
Uma capa indisponível no momento da verificação descarta o candidato. Não se inventam
páginas ou sinopses; para sinopse ausente usa-se a mensagem já adotada pelo projeto.

O relatório JSON contém analisados, inseridos (ou inserções previstas em simulação),
duplicatas, rejeitados, erros, edições sem português, duração, distribuição por gênero
e cobertura dos prioritários. `updated` permanece zero no importador por preservação.
A distribuição inclui os livros que já existiam; a cobertura não representa uma
certificação editorial. Uma interrupção abrupta entre a gravação e o checkpoint pode
subestimar as inserções no relatório, mas a retomada reconhece os registros gravados.
O arquivo `.lock` impede duas execuções com o mesmo checkpoint. Se o processo for
morto sem limpeza, confirme que terminou antes de remover apenas esse arquivo.
Execuções concorrentes com checkpoints diferentes devem ser evitadas.

Não há garantia de atingir 3000–5000 novas obras: metadados, quotas e disponibilidade
prevalecem sobre a meta. Relatórios e backups locais ficam fora do Git; um registro
resumido da validação fica em `docs/catalog-import-execution.md`.

Referências técnicas: [Google Books](https://developers.google.com/books/docs/v1/using)
e [Open Library Search API](https://openlibrary.org/dev/docs/api/search).

Testes: `npm test --prefix backend`. A suíte de integração usa um MongoDB temporário
isolado, iniciado com `mongod`, e não realiza operações destrutivas no catálogo local.

### Importar diretamente em produção (Atlas)

Com `ATLAS_MONGODB_URI` já configurado no `.env` da raiz, use o comando específico
abaixo. Ele exige uma URI Atlas com banco `/litverse`, não usa o MongoDB local e
mantém um checkpoint separado em `backups/catalog-import/atlas.json`:

```bash
npm run catalog:import:atlas --prefix backend -- --priority --max-new 5000
npm run catalog:import:atlas --prefix backend -- --resume --max-new 5000
npm run catalog:import:atlas --prefix backend -- --report

# Depois da lista prioritária, uma execução independente de descoberta completa:
npm run catalog:import:atlas --prefix backend -- --max-new 5000 --pages 10 --state ../backups/catalog-import/atlas-discovery.json
```

É necessário que o IP da máquina executora tenha acesso ao Atlas. A importação escreve
diretamente na coleção `livros` de produção; os livros passam a aparecer no site sem
copiar o banco local ou executar seed. Não é necessário novo deploy para disponibilizar
os registros. Alterações de código da aplicação continuam sujeitas ao deploy habitual.
