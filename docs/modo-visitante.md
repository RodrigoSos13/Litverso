# Modo visitante

Não é necessário criar uma conta para explorar o Litverso. A página inicial,
o catálogo com busca/filtros, detalhes de livros, publicações, comentários,
perfis e bibliotecas públicas podem ser consultados sem login.

## Experiência

- O cabeçalho oferece acesso à conta e a tela de login permite voltar ao catálogo.
- Curtir publicações/comentários, comentar, seguir, avaliar, adicionar à lista,
  cadastrar livros e publicar abrem um convite de acesso quando não há sessão.
- O convite tem opções para criar conta, entrar ou continuar explorando. Usa
  um dialog nativo com identificação acessível, navegação de teclado, Escape e
  restauração de foco ao fechar.
- Login/cadastro preservam a URL de origem, inclusive busca, filtros e fragmento.
  Depois de entrar, o visitante volta à página e pode repetir a ação desejada.
- Notificações e controles pessoais não aparecem para visitantes.
- Acesso direto às telas de criação mostra uma explicação com links de acesso,
  sem montar os formulários restritos.

## Backend

`backend/src/app.js` mantém uma lista explícita de consultas públicas. Apenas
GET/HEAD dessas rotas aceitam autenticação opcional:

- `/api/books`, `/api/books/catalog`, `/api/books/genres`, `/api/books/:id`;
- `/api/posts`, `/api/posts/:id`, `/api/comments`;
- `/api/users`, `/api/users/:id/profile`, `/api/users/:id/followers`,
  `/api/users/:id/following`.

Os IDs dessas rotas públicas devem ser ObjectIds hexadecimais de 24 caracteres.
Todas as alterações continuam exigindo sessão, inclusive pedidos feitos fora da
interface. Leituras individuais/listagens de leituras, notificações e consultas
externas ao Google Books também exigem autenticação. Bibliotecas são apresentadas
pela consulta pública de perfil, como já acontece entre usuários autenticados.

O middleware de autenticação opcional personaliza curtidas e seguimentos quando
há sessão válida. Sem sessão, esses indicadores retornam falsos. Cookie inválido
ou expirado não impede a navegação pública. Falhas na consulta da sessão retornam
indisponibilidade, sem simular uma autenticação válida.

Os controllers mantêm as projeções públicas e removem campos privados de usuário.
As respostas passam a usar `Cache-Control: private, no-store` para evitar reutilizar
respostas personalizadas entre visitantes e usuários autenticados.

## Verificação

Execute `npm test --prefix backend` (requer mongod para os testes de integração)
e `npm run build --prefix frontend`. A integração testa consultas sem sessão,
ausência de campos privados, cookie inválido e rejeição de alterações anônimas.

No navegador, abra uma janela anônima e verifique catálogo, busca, livro,
publicação expandida/comentários e perfil. Tente curtir, comentar, avaliar,
seguir e publicar: o convite deve abrir e permitir continuar navegando. Entre
pela opção do convite e confira que voltou à página de origem.

Para disponibilizar no Render, faça commit/push das alterações para a branch
configurada e aguarde o deploy. Não há novas variáveis nem migração do banco.
