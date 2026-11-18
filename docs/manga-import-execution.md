# Importação de mangás em produção

Data: 10/11/2026. Destino: Atlas configurado em `ATLAS_MONGODB_URI`, banco
`litverse`, coleção `livros`. Fonte: Google Books, usando a integração existente.
Sem alterações de interface ou criação de funcionalidades de coleções.

Validação: 125 testes passaram. A amostra real inseriu One Piece volumes 1, 44 e 70,
em inglês, após a busca em português. A execução completa foi iniciada com:

```bash
npm run catalog:manga:atlas --prefix backend -- --resume
```

A referência contém 61 séries e 80 consultas iniciais, além de buscas específicas
por números ausentes observados nas respostas. Nenhum volume é gerado para
completar uma coleção. O checkpoint é atualizado após cada lote.

## Retrato parcial

A execução ainda estava em andamento na gravação deste documento.
Inserções confirmadas por série até este momento:

```json
{
  "One Piece": 46,
  "Vinland Saga": 10
}
```

Este retrato não é o relatório final. Séries ainda não processadas não devem ser
interpretadas como indisponíveis. O JSON atualizado fica em
`backups/catalog-import/atlas-manga.json`, fora do Git. Ao término, `bySeries`
informa inseridos, disponíveis e números observados por série. `complete: true`
indica que todas as consultas programadas terminaram; `lastError` informa falhas.
Séries com zero números observados após conclusão não tiveram volumes validados
nas consultas Google realizadas. Isso não comprova inexistência de edições.

Para consultar o relatório:

```bash
npm run catalog:manga:atlas --prefix backend -- --report
```

Se a execução terminar antes de concluir, retome com:

```bash
npm run catalog:manga:resume --prefix backend
```

Os registros existentes são preservados, inclusive avaliações e relações.
Volumes com ISBN/ID já presentes são ignorados. Títulos sem volume identificável,
chapters, guias, novels e compilações identificadas são rejeitados. A correspondência
entre edições de numeração editorial diferente não é presumida.
