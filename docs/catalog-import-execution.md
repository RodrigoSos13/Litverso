# Execução da importação em produção

Em 10/11/2026, a etapa prioritária terminou no Atlas de produção, banco `litverse`,
coleção `livros`. Foram processados os 500 candidatos da referência.

## Resultado real

```json
{
  "analyzed": 5084,
  "inserted": 262,
  "duplicates": 109,
  "updated": 0,
  "rejected": 4713,
  "withoutPortuguese": 13,
  "errors": 0
}
```

`analyzed` conta resultados examinados nas APIs, não obras únicas.
`withoutPortuguese` conta inserções em inglês nesta execução.
Os registros existentes não foram atualizados pelo importador.

A execução terminou sem falhas de busca (`lastError: null`), com
`complete: true` e sem lock pendente. O campo `executionError` do checkpoint ainda
registra a primeira tentativa bloqueada no sandbox (`ECONNREFUSED`); é histórico,
não uma falha da execução concluída.

A meta de 3000–5000 novas obras ainda não foi atingida. A etapa executada foi
somente a lista prioritária. A descoberta por autores e assuntos é uma execução
separada, com checkpoint próprio:

```bash
npm run catalog:import:atlas --prefix backend -- --max-new 5000 --pages 10 --state ../backups/catalog-import/atlas-discovery.json
```

O checkpoint completo, com distribuição por gênero, cobertura dos prioritários
e rejeições, está em `backups/catalog-import/atlas.json`, fora do Git.

```bash
npm run catalog:import:atlas --prefix backend -- --report
```

A primeira execução local foi interrompida após o usuário esclarecer o destino.
Não foram copiados registros locais para produção. O importador foi validado com
117 testes passando, incluindo MongoDB temporário isolado, busca por título
alternativo e gênero e preservação de avaliações.
