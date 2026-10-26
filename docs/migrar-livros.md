# Copiar os livros locais para o Atlas

O comando copia somente a coleção `livros`. Não transfere usuários, sessões,
publicações ou leituras, nem altera livros já existentes no destino. Livros novos
mantêm seus IDs, mas recebem zero avaliações, pois as leituras locais não são
transferidas. Duplicatas são identificadas por ID, ISBN normalizado ou Google ID.
Títulos iguais sem esses identificadores podem representar edições diferentes.

1. Mantenha o MongoDB local do Docker em execução.
2. No Atlas, em Database & Network Access → IP Access List, use **Add My Current
   IP Address** para liberar o computador que executará a cópia.
3. No `.env` da raiz, acrescente a conexão real do Atlas (nunca neste guia):

   ```dotenv
   ATLAS_MONGODB_URI=mongodb+srv://USUARIO:SENHA@CLUSTER.mongodb.net/litverse?retryWrites=true&w=majority
   ```

   Preserve as opções que o Atlas forneceu e codifique caracteres especiais da
   senha para URL. Esta variável é exclusiva do script; não muda a configuração
   do Docker. Não use `.env.example` para guardar credenciais.
4. Na raiz, rode a simulação, que apenas lê os dois bancos:

   ```bash
   npm run books:migrate --prefix backend
   ```

5. Confira o resumo de `origem`, `inserir`, `existentes`, `invalidos`, `conflitos`.
   Se houver inválidos, revise-os antes da cópia: o script os ignora.
6. Execute a cópia:

   ```bash
   npm run books:migrate --prefix backend -- --apply
   ```

   Um backup EJSON do catálogo local é salvo antes das inserções em `backups/`
   (ignorado pelo Git). Nenhuma coleção é apagada. O comando pode ser repetido;
   os documentos existentes são preservados. Se houver falha parcial, o resumo
   final pode não aparecer, mas as inserções concluídas permanecem no Atlas.
7. Atualize o catálogo do site. Não é necessário fazer novo deploy.

A origem padrão é `mongodb://127.0.0.1:27018/litverse`, a porta publicada pelo
Compose local atual. Se mudar, configure LOCAL_BOOKS_MONGODB_URI no `.env`.
Não execute `npm run seed`: ele apaga o banco de destino.

Para continuar importando pela interface, configure GOOGLE_BOOKS_API_KEY em
Render → Environment e aplique o deploy. O script de cópia não depende da chave
do Google. A importação manual continua disponível; o worker periódico do Docker
não passa a rodar no Render por causa desta transferência.
