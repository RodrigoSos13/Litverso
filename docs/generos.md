# Gêneros do catálogo

`backend/src/services/bookGenres.js` traduz categorias reconhecidas para português.
Na importação Google Books, todas as categorias são consideradas e um gênero
específico aparece primeiro; as demais categorias válidas também são mantidas na lista `generos`.
O campo `genero` mantém o primeiro item para compatibilidade. Filtros consultam
qualquer item de `generos`, com fallback para livros antigos ainda não migrados.
O cadastro aceita até 20 gêneros; na interface, eles são separados por vírgula.
Assuntos, formatos, lugares e nomes de autores não viram gêneros automaticamente.
Se não houver categoria reconhecida, a importação usa Não informado.
O cadastro manual continua aceitando gêneros próprios.

`backend/src/data/bookGenreCorrections.js` contém correções de edições revisadas,
identificadas por Google Books ID. Elas têm prioridade em novas importações para
impedir que a sincronização restaure metadados incorretos. Não se presume o gênero
com base apenas no autor. As classificações foram inferidas dos títulos e sinopses
do catálogo, com consulta bibliográfica em casos ambíguos. Categorias já válidas
não foram reclassificadas em massa; edições sem evidência suficiente continuam
como Não informado.

Referências complementares da revisão:

- [Stuck in the Mud no Google Books](https://books.google.com/books/about/Stuck_in_the_Mud.html?id=VCVTAAAACAAJ): leitura infantil; não o assunto Lama.
- [Correspondências na Biblioteca Brasiliana da USP](https://digital.bbm.usp.br/handle/bbm/3932): Machado de Assis e Joaquim Nabuco.
- [Crítica de Alcides Maya, PUCRS](https://revistaseletronicas.pucrs.br/fale/article/view/10208): estudo crítico sobre Machado.
- [Conheça Jorge Amado, acervo da Fundação Casa de José Américo](https://fcja.phlnet.com.br/cgi-bin/wxis.exe?IsisScript=searchterm.xis&from=21&searchterm=SEARA+VERMELHA): crítica e interpretação para estudantes.
- [Clarice Lispector, Maria José Somerlate Barbosa](https://books.google.com/books/about/Clarice_Lispector.html?id=6lBfAAAAMAAJ): estudo literário.
- [Wizard and Glass, editora Bonnier](https://www.albertbonniersforlag.se/bocker/212710/magiker-och-glas/): fantasia.
- [The Last Man, editora Simon & Schuster](https://www.simonandschuster.com/books/The-Last-Man/Mary-Shelley/Essential-Gothic-SF-Dark-Fantasy/9781787556225): ficção científica pós-apocalíptica.
- [Proserpine and Midas, texto no Project Gutenberg](https://www.gutenberg.org/files/6447/6447-h/6447-h.htm): drama.

## Atualizar livros existentes no Atlas

Na raiz, com ATLAS_MONGODB_URI apontando explicitamente para /litverse no `.env`:

```bash
node backend/scripts/translate-book-genres.js
node backend/scripts/translate-book-genres.js --apply
```

O primeiro comando simula. O segundo salva um backup dos gêneros anteriores em
`backups/` (ignorado pelo Git) antes de alterar apenas `genero`. O filtro inclui
ID e gênero anterior para preservar alterações concorrentes. É seguro repetir.
IDs, avaliações, leituras e demais campos são preservados.

Após a migração, publicar o código atualizado também é necessário para que os
processos hospedados passem a usar as correções nas próximas importações.

## Migrar para múltiplos gêneros

```bash
node backend/scripts/migrate-book-genres.js
node backend/scripts/migrate-book-genres.js --apply --refresh-google
```

A opção `--refresh-google` consulta as categorias das edições existentes e exige
GOOGLE_BOOKS_API_KEY. Em caso de cota indisponível, os gêneros anteriores são
preservados e a migração continua sem consultas adicionais. O backup inclui os
valores anteriores de `genero` e `generos`. O script também cria o índice da lista.

Palavras de Radiância / Words of Radiance, de Brandon Sanderson, recebe Fantasia,
Fantasia épica e Ficção. A regra confere título e autor, inclusive para futuras
edições; ela não classifica todas as obras do autor como fantasia.
Referências: [editora Trama](https://www.lojaeditoratrama.com.br/produto/palavras-de-radiancia.html)
e [série na editora Macmillan](https://us.macmillan.com/series/thestormlightarchive).
