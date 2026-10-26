# API HTTP do Litverso

## Onde está e como funciona

O projeto já possuía uma API no estilo REST para livros, publicações, usuários,
leituras, comentários e curtidas. Esta entrega completa as operações individuais
de leituras e reforça a validação da gravação existente. Não é outra aplicação:
é a API que o React já consome.

Fluxo: React ou Postman → HTTP/JSON → Express → controller → Mongoose → MongoDB.

| Arquivo | Responsabilidade |
| --- | --- |
| `backend/src/server.js` | Conecta ao banco, prepara índices e inicia o servidor HTTP |
| `backend/src/app.js` | Monta `/api/readings`, autentica e filtra campos permitidos |
| `backend/src/routes/readingRoutes.js` | Associa método HTTP e URL a cada controller |
| `backend/src/controllers/readingController.js` | Valida, consulta, grava, atualiza e exclui leituras; recalcula notas dos livros |
| `backend/src/models/Reading.js` | Schema Mongoose da coleção `leituras`, referências, validações e índices |
| `backend/src/models/Book.js` | Schema do livro e campos de média/total de avaliações |
| `backend/src/config/db.js` | Conexão do Mongoose com o MongoDB |
| `backend/src/auth/session.js` | Autenticação por cookie de sessão |
| `frontend/src/services/api.js` | Cliente Axios usado pela interface |
| `frontend/src/pages/BookPage.jsx` | Usa GET/POST de leituras para status e avaliação |
| `backend/test/auth.test.js` | Testes reais de HTTP e MongoDB, incluindo o CRUD de leituras |

Express implementa a interface HTTP. Mongoose é o ODM: transforma documentos em
objetos, valida o schema, resolve referências com populate e executa operações no
MongoDB. Mongoose não é o servidor REST. A Google Books API é uma API externa
consumida pelo sistema; ela é diferente desta API própria.

Usamos recursos, métodos HTTP e JSON, com autenticação por sessão no servidor.
Isso é uma API no estilo REST; não alegamos cumprir a restrição estrita de
statelessness do REST, pois a autenticação mantém sessões no banco.

## Recurso leitura

Uma leitura associa um usuário a um livro, com status e nota opcionais. O índice
único `(usuario, livro)` impede duas leituras da mesma pessoa para o mesmo livro.
Status: `quero_ler`, `lendo`, `lido` ou `null`. Nota: número entre 0 e 5 ou `null`.
Campos `createdAt` e `updatedAt` são controlados pelo Mongoose.

Todas as rotas abaixo exigem o cookie `litverse_session`, obtido pelo login.
As leituras são visíveis a usuários autenticados, como já ocorre nos perfis.
Somente o dono pode alterar ou excluir sua leitura. A identidade vem da sessão,
não de um campo `usuario` enviado pelo cliente.

| Método e rota | O que faz | Resposta |
| --- | --- | --- |
| `GET /api/readings` | Lista leituras; filtros opcionais `user`, `book`, `status` | 200, array |
| `POST /api/readings` | Cadastra ou atualiza a leitura do usuário para um livro | 201, objeto |
| `GET /api/readings/:id` | Consulta uma leitura, com nome do usuário e resumo do livro | 200, objeto |
| `PATCH /api/readings/:id` | Altera apenas status e/ou nota de uma leitura própria | 200, objeto |
| `DELETE /api/readings/:id` | Remove uma leitura própria | 204, sem corpo |

GET individual, PATCH e DELETE foram adicionados nesta entrega. GET de lista e
POST já eram usados pelo frontend. POST continua como upsert e retorna 201 também
ao atualizar, por compatibilidade com o contrato existente. PATCH é a operação
explícita para atualizar uma leitura por ID. Não foi criado um PUT que fingiria
substituir todo o recurso.

Na criação, o livro precisa existir. PATCH não permite trocar o livro nem o dono.
Enviar `nota: null` remove a avaliação. Alterar notas ou excluir leituras recalcula
`mediaAvaliacoes` e `totalAvaliacoes` do livro com uma agregação do MongoDB.
Essas gravações usam operações separadas, sem transação multi-documento: em caso
de falha de banco entre elas, pode ser necessário recalcular as estatísticas.

Erros das novas rotas: 400 para ID/payload inválido, 401 sem sessão, 404 para
leitura ausente ou que não pertence à conta numa alteração/exclusão e 503 para
falha de banco. Erros retornam JSON com `message`. O 404 em mutações de outra conta
evita confirmar a existência de um recurso que ela não pode modificar.

## Demonstrar no Postman

1. Inicie o projeto: `docker compose up --build -d --wait`.
2. Use `http://localhost:8080/api` como URL base. No Docker, use a porta do
   frontend/proxy (8080), não uma porta de backend presumida.
3. Crie/valide uma conta na interface ou use uma conta existente. Cadastro novo
   depende do Resend; os testes automatizados usam um provedor simulado.
4. No Postman, faça `POST http://localhost:8080/api/auth/login`, Body → raw → JSON:

```json
{"identificador":"SEU_USUARIO","senha":"SUA_SENHA"}
```

O Postman guarda o cookie automaticamente; mantenha o mesmo host nas chamadas.
No Insomnia ou curl, habilite/preserve também o cookie. Não copie credenciais reais
para arquivos versionados ou capturas da apresentação.

5. Faça `GET http://localhost:8080/api/books` e copie o `_id` de um livro.
   Se o banco estiver vazio, cadastre ou importe um livro pela interface.
6. Faça `POST http://localhost:8080/api/readings`, com JSON:

```json
{"livro":"SUBSTITUA_PELO_ID_DO_LIVRO","status":"lendo","nota":4}
```

7. Copie o `_id` da leitura retornada. Faça `GET /api/readings/ID_DA_LEITURA`.
8. Faça `PATCH /api/readings/ID_DA_LEITURA`, com JSON:

```json
{"status":"lido","nota":5}
```

9. Confira o resultado com GET. Na interface, a leitura também estará atualizada.
10. Teste PATCH com `{"nota":8}`: deve retornar 400 e não gravar a nota inválida.
11. Faça `DELETE /api/readings/ID_DA_LEITURA`: deve retornar 204.
12. Repita o GET individual: deve retornar 404.
13. Remova o cookie e consulte a API: deve retornar 401.

Para testar autorização, entre com outra conta no Postman e tente alterar uma
leitura criada pela primeira: deve receber 404 e o documento deve ser preservado.
Ao testar métodos de escrita com header Origin, ele deve corresponder ao
FRONTEND_ORIGIN configurado; o aplicativo rejeita origens diferentes com 403.

## Executar os testes

Com Node, dependências do backend instaladas e `mongod` disponível:

```bash
npm test --prefix backend
```

O teste de integração inicia um MongoDB temporário em diretório temporário e
porta 27941; não usa o banco real do projeto. Ele testa o fluxo HTTP, validação,
acesso sem login, bloqueio de alterações em leituras alheias, campos protegidos,
atualização da média e exclusão.

## Explicação para apresentação

“O Litverso tem uma API HTTP no estilo REST implementada com Express. A interface
consome os recursos por HTTP e recebe JSON. Na API de leituras, posso cadastrar,
consultar, atualizar status/nota e excluir uma leitura. O controller usa Mongoose
para validar os documentos e persistir no MongoDB. A autenticação identifica o
usuário e impede alterações nas leituras de outra pessoa. Quando a avaliação
muda, a API recalcula as estatísticas do livro.”
