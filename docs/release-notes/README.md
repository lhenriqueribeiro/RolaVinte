# Release notes

Histórico de versões do RolaVinte, da mais recente para a mais antiga. Uma linha por versão; o arquivo de
cada uma traz entregas, resultado de `check`/`test`/`build`, passos de atualização e limitações conhecidas.

| Versão | Data | Resumo |
|---|---|---|
| [v0.8.0](v0.8.0.md) | 2026-08-10 | Sprint 3: uma mesa de Pathfinder joga — grau de sucesso no chat (`cd N` no comando ou número na ficha, sem CD padrão), defesas calculadas e roláveis (CA com limite de Destreza, salvaguardas, Percepção, CD de classe), ataques com penalidade de ataques múltiplos sem contador em lugar nenhum, e o atributo com **uma casa só** (RV-098, defeito achado por verificação manual no navegador com 1167 testes verdes). As dez migrations foram aplicadas no Supabase real e cinco comportamentos foram medidos contra o Postgres — primeira versão verificada fora dos fakes (1475 testes verdes). |
| [v0.7.0](v0.7.0.md) | 2026-08-09 | Sprint 2: Pathfinder 2e virou sistema de verdade — ficha própria no registro, 16 perícias mais o Saber calculando modificador + proficiência e rolando em um clique, motor de regras (graus de sucesso, CDs, modificadores) puro no shared, atribuição OGL/Community Use montada na ficha e o `check` de `mesas.sistema` amarrado ao enum por guarda offline (migration `0008`). As três armadilhas do sistema conferidas por execução; a metade que calcula o *resultado* ainda não tem consumidor (1167 testes verdes). |
| [v0.6.0](v0.6.0.md) | 2026-08-09 | Sprint 1: ficha extensível por sistema de RPG (registro único em `packages/shared/src/sistemas/`, sem `switch (sistema)` sobrevivente), perícias e proficiência de D&D 5e, excluir e duplicar personagem, paginação do chat por cursor no backend e a fronteira de licenciamento do Pathfinder 2e como código executável — o E15 fica desbloqueado (863 testes verdes). |
| [v0.5.0](v0.5.0.md) | 2026-08-09 | Primeiro Supabase real (schema, buckets e fluxo crítico no navegador), chat com registry de comandos, sussurro e rolagem oculta, reconexão resiliente sem F5, estados de carregamento/erro/vazio padronizados e os dois defeitos de Storage/grid da v0.4.0 fechados (663 testes verdes). |
| [v0.4.0](v0.4.0.md) | 2026-08-09 | Cenas e mapas (CRUD, ativação, imagem de fundo, grid, zoom e pan), tokens com arte e barra de vida vinculada à ficha, com o contrato de eventos WS aplicado nos dois lados antes do resto (447 testes verdes). |
| [v0.3.0](v0.3.0.md) | 2026-08-09 | Ciclo de vida das mesas (convites, remoção, saída, encerramento, edição), endurecimento HTTP com helmet/rate limit/erro global e suíte de testes do front (178 testes verdes). |
| [v0.2.0](v0.2.0.md) | 2026-08-09 | Fundação técnica: lint de arquitetura no `check`, workflow de CI e harness de testes de contrato HTTP com fakes em memória (55 testes verdes). |

## Convenções

- Um arquivo por versão, nomeado `vMAJOR.MINOR.PATCH.md`, igual ao campo `version` do `package.json` da
  raiz.
- Escrito para quem desenvolve: o que mudou, por que importa e o que fazer com um clone existente.
- Números (testes, tamanhos, tempos) só entram quando vieram de uma execução real.
- Problema conhecido no fim da fase vai para "Limitações conhecidas", não é omitido.
