# Sprints do RolaVinte

As **ondas** do [roadmap](README.md#roadmap-por-ondas) dizem *prioridade*. As sprints desta página dizem *ordem de execução*: cada uma tem um objetivo em uma frase, um conjunto fechado de cards e uma versão publicada no fim.

Uma sprint só fecha quando: `npm run check` e `npm run test` verdes, verificação independente feita por quem não implementou, release note publicada e backlog curado. É o mesmo ciclo descrito em [docs/agentes/README.md](../agentes/README.md).

## Regra de composição

Uma sprint **não** é "os próximos N cards da lista". É um conjunto que compartilha objetivo e cuja ordem interna respeita duas restrições:

1. **Card protetor primeiro.** O que fecha uma classe de risco vem antes dos que a exercitam — foi assim que o RV-115 impediu, no mesmo lote, que o `personagem:atualizado` nascesse órfão.
2. **Um agregado, um agente.** Cards que tocam o mesmo agregado vão juntos, senão viram conflito de escrita (não há git worktree aqui — ver [protocolo-comum.md](../agentes/protocolo-comum.md)).

---

## Sprint 1 — Ficha extensível · [`v0.6.0`](../release-notes/v0.6.0.md) · ✅ concluída

> **Objetivo:** qualquer sistema de RPG passa a ter a própria ficha sem tocar no código dos outros — e o histórico do chat deixa de ter teto.

Esta era a sprint que **desbloqueia o Pathfinder**, e ela desbloqueou: a ficha deixou de ser estrutura única e fixa, e o E15 pode registrar PF2e como uma linha no registro de sistemas.

| Card | Título | Como fechou |
|---|---|---|
| [RV-091](09-fichas.md) | Strategy de sistema de ficha | ✅ Registro em `packages/shared/src/sistemas/`, `personagens.dados` (migration `0007`), ficha renderizada por seções. Zero `switch (sistema)` fora do registro — varredura feita, duas violações corrigidas na verificação |
| [RV-090](09-fichas.md) | Perícias e proficiência | ✅ Cálculo puro delegando ao registro, 18 perícias de D&D 5e, rolagem em um clique pela rota que já existia |
| [RV-093](09-fichas.md) | Excluir e duplicar personagem | ✅ Com uma ressalva escrita no card: "some da lista para todos" só vale depois de recarregar — a propagação em tempo real virou [RV-117](11-tempo-real.md) |
| [RV-073](07-chat.md) | Histórico paginado (fechar o parcial) | 🚧 **Não fechou.** O backend do cursor entrou inteiro e bem testado; a metade de interface (`useInfiniteQuery`) não. Continua `Parcial` e **entra na Sprint 2** — ver abaixo |
| [RV-150](15-pathfinder2e.md) | Fronteira de licenciamento | ✅ Auditor executável sobre os arquivos reais da semente, com os cinco experimentos de reprovação registrados |

**Nasceram três cards da execução** (critério de corte aplicado sobre 19 descobertas): [RV-096](09-fichas.md) — o `check` de `mesas.sistema` é a única lista de sistemas sem amarra; [RV-097](09-fichas.md) — trocar o sistema da mesa deixa ficha gravada impossível de salvar; [RV-117](11-tempo-real.md) — excluir/duplicar ficha não chega às outras abas.

**A sprint deixou o produto um pouco pior em dois pontos, e isso está escrito no [README](README.md#roadmap-por-ondas):** a fila de migrations não aplicadas foi de uma para três (a `0007` derruba todo select de personagem contra o banco real), e o padrão do chat caiu de 100 para 50 mensagens sem que a tela ganhasse como pedir a próxima página.

## Sprint 2 — Pathfinder calcula · `v0.7.0` · ▶ próxima

> **Objetivo:** a ficha de PF2e existe e calcula sozinha os números que o jogador somaria à mão.

| Ordem | Card | Por que está aqui |
|---|---|---|
| 1 | [RV-096](09-fichas.md) | **Protetor, movido da Sprint 1 para cá.** Nasceu na v0.6.0 e é **bloqueador do E15**: o RV-152 acrescenta `'pathfinder2e'` a `SISTEMAS_RPG`, e o `check (sistema in …)` de `mesas.sistema` é a única lista de sistemas que não é verificada por nada — o esquecimento compila, passa no lint, passa na suíte inteira (que roda com fakes) e só estoura no primeiro `INSERT` real. Pela regra de composição nº 1, o card que fecha a classe de risco vem antes do que a exercita; entrar depois seria descobrir o buraco pelo mesmo caminho que o RV-139 descobriu o dele |
| 2 | [RV-151](15-pathfinder2e.md) | Motor de regras no shared: aritmética pura antes de qualquer tela |
| 3 | [RV-152](15-pathfinder2e.md) | Ficha de PF2e como entrada nova no registro — e primeiro consumidor de `<AvisoLicenca>` |
| 4 | [RV-153](15-pathfinder2e.md) | Perícias com rolagem em um clique; fornece a tabela, não a conta |
| 5 | [RV-073](07-chat.md) | **Metade de interface, arrastada da Sprint 1.** Entra aqui e não numa sprint de chat porque hoje é **regressão visível**: o chat mostra 50 mensagens onde mostrava 100, sem caminho para o resto. Não compete por arquivo nenhum com os quatro acima (`features/jogo` × `features/personagens` e `sistemas/`), então cabe em paralelo sem ferir a regra nº 2 |

Os cards 2 a 4 são sequenciais entre si (o épico tem ordem rígida) e todos tocam `packages/shared/src/sistemas/pathfinder2e/` — **um agente**, pela regra nº 2.

## Sprint 3 — Pathfinder na mesa · `v0.8.0`

> **Objetivo:** rolar em PF2e produz um grau de sucesso no chat, e atacar respeita a penalidade de ataques múltiplos.

`RV-154` (grau de sucesso no chat) · `RV-155` (CA, salvaguardas, Percepção, CD de classe) · `RV-156` (ataques com MAP)

Fechando esta sprint, **uma mesa de Pathfinder joga** — o catálogo (RV-157) é conforto, não requisito.

## Sprint 4 — Combate · `v0.9.0`

> **Objetivo:** o mestre conduz uma luta pela plataforma, sem planilha ao lado.

`RV-060` … `RV-065` (agregado, iniciativa, turnos, painel, condições, dano) · `RV-158` (iniciativa por Percepção em PF2e)

## Sprint 5 — Confiança · `v0.10.0`

> **Objetivo:** parar de depender de verificação manual para saber que a plataforma funciona.

`RV-006` (modo memória, desbloqueia o E2E) · `RV-133` (E2E do fluxo crítico) · `RV-136` (cobertura dos adapters Supabase) · `RV-137` (limites de abuso no Socket.IO) · `RV-140` (guardrails alinhados ao código)

## Sprint 6 — Operação · `v1.0.0`

> **Objetivo:** roda para grupos reais toda sexta à noite, sem alguém de plantão.

`RV-130` (observabilidade) · `RV-132` (deploy) · `RV-131` (backup e retenção) · `RV-134` (teste de carga)

---

## Fora das sprints planejadas

Cards abertos que não entram nas seis primeiras sprints e **por quê**:

| Épico | Cards | Motivo |
|---|---|---|
| [E01](01-contas.md) | RV-010 … RV-014 | Refresh token, logout e perfil melhoram a operação, não destravam o jogo |
| [E05](05-fog-of-war.md) | RV-050 … RV-052 | Névoa é diferencial forte, mas nenhuma mesa deixa de jogar sem ela |
| [E08](08-dados.md) | RV-080 … RV-084 | O motor atual cobre PF2e; explosão e pool servem a outros sistemas |
| [E09](09-fichas.md) | RV-092, RV-094, RV-095 | Ficha completa de D&D, inventário e bestiário são profundidade de sistema, não pré-requisito de nenhuma sprint |
| [E09](09-fichas.md) | **RV-097** | Defeito real da v0.6.0, mas exige **decisão de produto** (recusar a troca de sistema, migrar os `dados` ou tirar `sistema` do PATCH) antes de virar trabalho. Entra na primeira sprint depois da decisão; se um grupo real cair nele antes, sobe para a Onda 1 |
| [E10](10-handouts.md) | RV-100 … RV-102 | Material de apoio; o chat cobre o essencial hoje |
| [E11](11-tempo-real.md) | **RV-117** | A interface já diz a verdade ao usuário ("só verá a ficha sumir ao recarregar"), então é escopo faltando e não defeito silencioso. Candidato natural à **Sprint 4**, onde o combate passa a depender de ficha viva na tela de todo mundo |
| [E12](12-ux.md) | RV-120, RV-121, RV-123 … RV-125 | Responsivo e acessibilidade entram quando houver uso real em telas variadas |
| [E15](15-pathfinder2e.md) | RV-157 | Catálogo é o último card do épico, por decisão de licenciamento |
| Diversos | RV-025, RV-026, RV-028, RV-029, RV-043 … RV-046, RV-110, RV-111, RV-113, RV-114 | Ver o épico de cada um |

Sprint não é contrato: card novo nascido de uma entrega pode entrar na seguinte se for `bloqueador`. Foi o que aconteceu com o [RV-096](09-fichas.md), nascido na Sprint 1 e promovido a primeiro item da Sprint 2 por bloquear o E15.

## Histórico

As quatro primeiras entregas aconteceram como **fases**, antes desta página existir. Ficam registradas aqui pela equivalência:

| Fase | Versão | Objetivo entregue |
|---|---|---|
| 1 | [v0.2.0](../release-notes/v0.2.0.md) | Fundação: lint de arquitetura, CI, harness de contrato |
| 2 | [v0.3.0](../release-notes/v0.3.0.md) | Ciclo de vida das mesas, endurecimento HTTP, testes no front |
| 3 | [v0.4.0](../release-notes/v0.4.0.md) | Tabletop: cenas, mapa, grid, zoom, tokens ricos |
| 4 | [v0.5.0](../release-notes/v0.5.0.md) | Chat privado, reconexão, estados de UI, defeitos de produção |
