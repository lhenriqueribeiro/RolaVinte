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

## Sprint 2 — Pathfinder calcula · [`v0.7.0`](../release-notes/v0.7.0.md) · ✅ concluída

> **Objetivo:** a ficha de PF2e existe e calcula sozinha os números que o jogador somaria à mão.

Cumprido pela metade que o objetivo nomeia: a ficha existe, e o número que sai dela é o certo. A outra metade do épico — **comparar** esse número com uma CD — é a Sprint 3, e hoje não existe em lugar nenhum do produto (ver a nota sobre contrato órfão abaixo).

| Ordem | Card | Como fechou |
|---|---|---|
| 1 | [RV-096](09-fichas.md) | ✅ Guarda offline que lê `supabase/migrations/*.sql`, extrai o `check` vigente de `mesas.sistema` e o compara com `SISTEMAS_RPG` **nas duas direções**. Provada com vermelho real por dois agentes diferentes (valor só no enum → nomeia o sistema e imprime o SQL da próxima migration; valor só no SQL → nomeia o valor órfão). A `0008` nasceu junto, já com `'pathfinder2e'` |
| 2 | [RV-151](15-pathfinder2e.md) | ✅ 93 testes com todo valor esperado escrito à mão, cinco experimentos de vermelho registrados. **Entregou motor sem consumidor de produção**, por desenho — o consumidor é o RV-154 |
| 3 | [RV-152](15-pathfinder2e.md) | ✅ `'pathfinder2e'` no registro, ficha com identidade e os seis modificadores diretos, `usaAtributosComuns` e `atribuicao` como dados do contrato em vez de `if` na tela. **Fechou parcial e foi completado no card seguinte**: as duas linhas de interface ficaram em handoff explícito e o agente do RV-153 as executou — sem elas, a ficha de PF2e oferecia seis botões rolando `1d20+0` de colunas que o sistema ignora |
| 4 | [RV-153](15-pathfinder2e.md) | ✅ 16 perícias + Saber como **família de perícia no contrato** (`FamiliaPericia`), não como caso especial. Um defeito escapou e virou [RV-159](15-pathfinder2e.md) |
| 5 | [RV-073](07-chat.md) | 🚧 **Não fechou pela segunda vez.** `useMensagens` continua um `useQuery` pedindo a primeira página — conferido no código no fecho da sprint. Continua `Parcial`, e a regressão de 100 → 50 mensagens segue de pé |

**O RV-096 nesta sprint é o exemplo de que sprint não é contrato.** Ele não existia quando a Sprint 2 foi planejada: nasceu como *descoberta da execução da Sprint 1*, foi julgado bloqueador do E15 na curadoria da v0.6.0 e entrou aqui como **primeiro item**, na frente de cards que já estavam na página. A regra de composição nº 1 é o que decidiu a posição — o card que fecha a classe de risco vem antes do que a exercita — e o retorno foi medido dentro da própria sprint: quando o RV-152 acrescentou `'pathfinder2e'` ao enum, o vermelho apareceu exatamente onde deveria, com a instrução do que fazer. Sem ele, a divergência só apareceria no primeiro `INSERT` real, meses depois.

**Nasceu um card da execução** (critério de corte aplicado sobre 29 descobertas — 19 dos implementadores, 10 da verificação independente): [RV-159](15-pathfinder2e.md) — adicionar um Saber repetido, longo demais ou acima do teto é um no-op silencioso na ficha (o botão fica habilitado, o clique esvazia o campo e nada é salvo). Nenhum outro achado virou card; quatro viraram contexto novo dentro de cards existentes (RV-154, RV-155, RV-157, RV-158).

**A sprint deixou o produto um pouco pior em dois pontos, como a anterior:** a fila de migrations não aplicadas foi de três para **quatro** (a `0008` deixou de ser precaução e virou pré-requisito — o dashboard oferece "Pathfinder 2e" e o `INSERT` falha sem ela), e o RV-073 escorregou de novo, então a regressão do chat completa duas sprints de pé.

**Contrato órfão que a Sprint 3 precisa fechar:** `grauSucesso`, `d20NaturalDe`, `somarModificadores`, `cdPorNivel` e `CDS_SIMPLES` têm zero call sites em produção. A aritmética está certa e invisível — um 20 natural não desloca grau nenhum na tela nem no chat. Está anotado no contexto do RV-154, junto com o risco concreto: reimplementar a comparação com a CD no componente é barato e criaria duas aritméticas.

## Sprint 3 — Pathfinder na mesa · `v0.8.0` · ▶ próxima

> **Objetivo:** rolar em PF2e produz um grau de sucesso no chat, atacar respeita a penalidade de ataques múltiplos — e a mesa consegue, enfim, sentar para jogar.

| Ordem | Card | Por que está aqui |
|---|---|---|
| 1 | [RV-139](13-operacao.md) | **Proposta da curadoria, e o item que decide se esta sprint significa alguma coisa.** São **quatro** migrations não aplicadas (`0005`, `0006`, `0007`, `0008`), e a `0008` é a que faz `'pathfinder2e'` caber na coluna: contra o banco real, criar a mesa falha no primeiro `INSERT`, e a aba de personagens e o chat inteiro já estavam fora do ar antes disso. É o único item das três sprints que a suíte **não** consegue provar — todos os testes rodam com fakes. Entra primeiro pela regra nº 1: fechar a classe de risco (F10) antes que a sprint inteira a exercite |
| 2 | [RV-154](15-pathfinder2e.md) | Grau de sucesso no chat — primeiro consumidor de metade do RV-151 |
| 3 | [RV-155](15-pathfinder2e.md) | CA, salvaguardas, Percepção e CD de classe, **roláveis em um clique** (cenário acrescentado na curadoria — ver abaixo) |
| 4 | [RV-156](15-pathfinder2e.md) | Ataques com MAP; depende dos dois acima |
| 5 | [RV-159](15-pathfinder2e.md) | **Defeito entregue na v0.7.0**, não bloqueador do E15. Entra aqui pela regra nº 2: mexe em `SecaoPericias.tsx`, `tipos.ts` e `pericias.ts` — exatamente os arquivos do RV-155. Fora desta sprint, viraria conflito de escrita |
| 6 | [RV-073](07-chat.md) | **Terceira tentativa.** O argumento "não compete por arquivo nenhum, cabe em paralelo" já falhou duas vezes: o card acabou sendo o item que sobra quando a sprint aperta. Desta vez ele **não é apêndice de uma sprint de Pathfinder** — é um estágio próprio, com agente próprio, ou sai da sprint e vira a primeira coisa da seguinte. Se em três horas o grupo passa de 50 mensagens (passa), o chat perde metade do histórico em toda sessão de PF2e que esta sprint promete viabilizar |

**Nenhum card novo desta curadoria é bloqueador do PF2e** — o RV-159 é reparo de defeito, não pré-requisito. O que **é** bloqueador e não era card novo é o RV-139, e é por isso que a curadoria propõe movê-lo para cá em vez de deixá-lo sem sprint.

**Uma correção de escopo dentro do RV-155:** o enunciado previa as defesas como bloco "somente leitura", o que deixaria a mesa clicando no dado da Furtividade e digitando a jogada de Reflexos à mão — sendo que salvaguarda é a checagem **mais rolada** de uma sessão de PF2e. Somente leitura passou a significar "não editável", não "sem botão de dado". O cenário está escrito no card.

Fechando esta sprint com o RV-139 dentro dela, **uma mesa de Pathfinder joga de verdade** — nos limites registrados abaixo. Sem o RV-139, fecha uma sprint em que tudo funciona menos o produto. O catálogo (RV-157) continua sendo conforto, não requisito.

**O que a mesa ainda faz na mão depois desta sprint, e por que está tudo bem:** ordem de iniciativa e turnos (Sprint 4 — hoje se resolve com papel, como em qualquer VTT antes do tracker), condições e aplicação de dano (RV-064/RV-065, Sprint 4 — o PV já é único e editável, e a barra sobre o token acompanha), magias e itens (RV-157, com o livro ao lado), e ficha de NPC/monstro (RV-095 — o mestre rola pelo chat com `1d20+13 cd 22`, que o RV-154 já avalia). Nada disso impede uma sessão: são coisas que toda mesa fazia antes de existir VTT.

**O que impede, e é a segunda proposta desta curadoria: [RV-132](13-operacao.md) está tarde demais.** Sem deploy e sem `RESEND_API_KEY`, a plataforma existe em `localhost` e nenhum convite chega a ninguém — os outros quatro jogadores não têm como entrar, e o `ConviteDTO` não expõe o token nem para o mestre copiar à mão. Ele é o **segundo item da Onda 1** e está agendado para a **Sprint 6 (`v1.0.0`)**: pelo plano atual, a primeira mesa de Pathfinder com cinco pessoas de verdade acontece três sprints depois de o Pathfinder ficar pronto. A curadoria não o move sozinha — é escopo grande e a decisão é do humano —, mas registra a leitura: **ou o RV-132 sobe para a Sprint 4, ou "a mesa joga" continua significando "o mestre joga sozinho na máquina dele".**

## Sprint 4 — Combate · `v0.9.0`

> **Objetivo:** o mestre conduz uma luta pela plataforma, sem planilha ao lado.

`RV-060` … `RV-065` (agregado, iniciativa, turnos, painel, condições, dano) · `RV-158` (iniciativa por Percepção em PF2e)

## Sprint 5 — Confiança · `v0.10.0`

> **Objetivo:** parar de depender de verificação manual para saber que a plataforma funciona.

`RV-006` (modo memória, desbloqueia o E2E) · `RV-133` (E2E do fluxo crítico) · `RV-136` (cobertura dos adapters Supabase) · `RV-137` (limites de abuso no Socket.IO) · `RV-140` (guardrails alinhados ao código)

## Sprint 6 — Operação · `v1.0.0`

> **Objetivo:** roda para grupos reais toda sexta à noite, sem alguém de plantão.

`RV-130` (observabilidade) · `RV-132` (deploy) · `RV-131` (backup e retenção) · `RV-134` (teste de carga)

> **Contestado na curadoria da v0.7.0:** o `RV-132` é o segundo item da Onda 1 e está aqui, três sprints depois de a plataforma ficar jogável. Ver a nota ao fim da Sprint 3.

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

Sprint não é contrato, e isso vale nas duas direções.

**Card entra.** [RV-096](09-fichas.md) não existia quando a Sprint 2 foi escrita: nasceu da execução da Sprint 1, foi julgado bloqueador do E15 na curadoria da v0.6.0 e entrou como **primeiro item** da Sprint 2, na frente de cards já planejados. Fechou dentro dela e cobrou o próprio preço no mesmo lote. Na v0.7.0 o mesmo mecanismo produziu o [RV-159](15-pathfinder2e.md), que entra na Sprint 3 — por vizinhança de arquivo, não por bloqueio —, e trouxe o [RV-139](13-operacao.md) de "sprint nenhuma" para o primeiro lugar da Sprint 3.

**Card sai.** [RV-073](07-chat.md) foi planejado na Sprint 1, arrastado para a Sprint 2 e não fechou nas duas. Um card que atravessa duas sprints inteiras sem sair do lugar não está sendo despriorizado — está sendo tratado como folga. Ou vira estágio com agente próprio, ou sai da página até que seja a prioridade de alguém.

## Histórico

As quatro primeiras entregas aconteceram como **fases**, antes desta página existir. Ficam registradas aqui pela equivalência:

| Fase | Versão | Objetivo entregue |
|---|---|---|
| 1 | [v0.2.0](../release-notes/v0.2.0.md) | Fundação: lint de arquitetura, CI, harness de contrato |
| 2 | [v0.3.0](../release-notes/v0.3.0.md) | Ciclo de vida das mesas, endurecimento HTTP, testes no front |
| 3 | [v0.4.0](../release-notes/v0.4.0.md) | Tabletop: cenas, mapa, grid, zoom, tokens ricos |
| 4 | [v0.5.0](../release-notes/v0.5.0.md) | Chat privado, reconexão, estados de UI, defeitos de produção |
