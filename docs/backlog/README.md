# Backlog do RolaVinte

Roteiro do estado atual (MVP jogável) até a plataforma completa. Cada card é uma unidade de trabalho **autossuficiente**, escrita para ser executada por um agente sem contexto prévio da conversa que a originou.

## Estado atual (baseline)

Já implementado e verde (`npm run check`, `npm run test`):

- Contas: registro, login, JWT no REST e no handshake do socket.
- Mesas: criação, listagem, detalhe, edição de nome/descrição/sistema (**RV-024**), convite por email (Resend, token de uso único, cooldown de reenvio), aceite de convite.
- Ciclo de vida das mesas: listar e revogar convites (**RV-020**), remover jogador (**RV-021**), sair da mesa (**RV-022**), encerrar/arquivar com mesa em somente leitura (**RV-023**). O agregado `Mesa` concentra as guardas de escrita em `autorizarEscritaDeParticipante`/`autorizarEscritaDoMestre`, e o front tem dashboard separado em "Ativas"/"Encerradas" e diálogos de confirmação acessíveis.
- Jogo: uma cena ativa por mesa, tokens arrastáveis com autorização de domínio, chat com fala e rolagem, broadcast por sala `mesa:{id}` (incluindo `mesa:participante-removido` e `personagem:atualizado`).
- Cenas e mapas: CRUD de cenas (**RV-030**), ativar cena existente devolvendo cena + tokens numa resposta só (**RV-031**), upload da imagem de fundo pela API atrás da port `ArmazenamentoArquivos` (**RV-032**), grid configurável — tamanho de célula, visibilidade e cor — como propriedade da cena (**RV-033**) e zoom/pan no tabletop com a matemática de câmera em funções puras (**RV-034**). Toda escrita de cena passa por `carregarCenaParaEscritaDoMestre`.
- Tokens: editar nome e cor (**RV-040**), arte do token por upload em bucket próprio (**RV-041**) e barra de vida vinculada à ficha (**RV-042**) — sem PV duplicado no token: o front cruza `token.personagemId` com `['personagens', mesaId]` e o evento `personagem:atualizado` mantém a barra viva.
- Personagens: criação, listagem, ficha editável, teste de atributo em 1 clique.
- Motor de dados: `NdF`, `kh`/`kl`, multi-termos, sinais, limites e RNG injetável.
- Tempo real: **RV-115** — o contrato de `eventos-ws.ts` é aplicado nos dois lados (`Server`/`Socket` parametrizados na api, `Socket` tipado no web), sem remover nenhuma validação Zod do gateway, e `cobertura-eventos-ws.test.ts` fica vermelho se um evento do contrato nascer sem ouvinte no front.
- Fundação: **RV-001** (ESLint com fronteiras de camada + Prettier), **RV-002** (CI), **RV-003** (harness de contrato HTTP com fakes em memória), **RV-004** (helmet, rate limit e body limit), **RV-005** (erro global `{ erro, requisicaoId }`, request id do servidor e logs redigidos) e **RV-008** (Vitest + Testing Library no `apps/web`) concluídos — `npm run check` roda lint + typecheck e `npm run test` cobre os **três** workspaces, com 447 testes verdes (12 shared / 278 api / 157 web).

Pendências operacionais conhecidas do baseline: as migrations `0002_ciclo_de_vida_das_mesas.sql`, `0003_cenas.sql` e `0004_tokens.sql` ainda não foram aplicadas em nenhum ambiente (e os buckets `mapas` e `tokens` não existem), e as limitações abertas estão em [docs/release-notes/v0.4.0.md](../release-notes/v0.4.0.md).

Tudo o que **não** está nessa lista é backlog.

### Cards concluídos

Convenção: o card concluído **mantém o texto original** (é o registro do que foi combinado) e ganha `**Status:** ✅ Concluído` na linha de metadados, dentro do épico. No [roadmap](#roadmap-por-ondas) ele aparece ~~riscado~~.

| Épico | Concluídos |
|---|---|
| [E00](00-fundacao.md) | RV-001, RV-002, RV-003, RV-004, RV-005, RV-008 |
| [E02](02-mesas.md) | RV-020, RV-021, RV-022, RV-023, RV-024, RV-027 |
| [E03](03-cenas.md) | RV-030, RV-031, RV-032, RV-033, RV-034 |
| [E04](04-tokens.md) | RV-040, RV-041, RV-042 |
| [E11](11-tempo-real.md) | RV-115 |

Cards **nascidos da execução destes** — defeito real ou lacuna que morde depois, não desejo novo: [RV-027](02-mesas.md), [RV-028](02-mesas.md), [RV-115](11-tempo-real.md), [RV-136](13-operacao.md), [RV-137](13-operacao.md) e, da entrega de cenas e tokens, [RV-029](02-mesas.md), [RV-036](03-cenas.md), [RV-047](04-tokens.md), [RV-116](11-tempo-real.md), [RV-138](13-operacao.md).

## Como um agente executa um card

1. Leia [CLAUDE.md](../../CLAUDE.md) e os guardrails citados no card (`.claude/rules/`).
2. Confirme a **Definition of Ready** abaixo. Se faltar dependência, pare e reporte.
3. Implemente seguindo a pirâmide de testes: domínio puro → use case com fakes → contrato HTTP/WS.
4. **Não amplie o escopo.** Achou algo fora do card? Registre um card novo neste diretório e siga.
5. Rode `npm run check` e `npm run test`, preencha o DoD e faça um commit em Conventional Commits PT-BR.

### Definition of Ready

- [ ] Dependências (`Depende de:`) concluídas.
- [ ] O contrato em `@rolavinte/shared` existe ou está no escopo do card.
- [ ] Mudança de schema tem migration nova prevista (nunca editar migration aplicada).

### Definition of Done global

Vale para **todos** os cards; cada card adiciona só o que for específico.

- [ ] Guardrails respeitados: regra de dependência aponta para dentro, falha esperada via `Result`, acesso externo via port, nomes de domínio em PT-BR.
- [ ] Autorização verificada **no use case**, não apenas na UI.
- [ ] `npm run check` verde (sem `any`, sem contrato redeclarado fora de `@rolavinte/shared`).
- [ ] `npm run test` verde, incluindo os testes novos listados no card.
- [ ] Textos de UI em PT-BR revisados.
- [ ] Schema alterado → nova migration em `apps/api/supabase/migrations/` + mappers atualizados.
- [ ] `README.md`/`CLAUDE.md` atualizados se algum comando ou fluxo mudou.

## Convenções

| Campo | Significado |
|---|---|
| **Tamanho** | `P` ≤ 2h · `M` ~meio dia · `G` 1–2 dias |
| **Onda** | Ordem sugerida de execução (ver roadmap) |
| **Escopo** | Arquivos a criar/alterar — orientação, não camisa de força |
| **Critérios de aceite** | Gherkin PT-BR; é o contrato do card |
| **Testes obrigatórios** | O que precisa virar teste automatizado |

## Épicos

| Épico | Tema | Cards | Concluídos |
|---|---|---|---|
| [E00](00-fundacao.md) | Fundação técnica e qualidade | RV-001 … RV-009 | 6 de 9 |
| [E01](01-contas.md) | Contas e sessão | RV-010 … RV-014 | — |
| [E02](02-mesas.md) | Mesas e participação | RV-020 … RV-029 | 6 de 10 |
| [E03](03-cenas.md) | Cenas e mapas | RV-030 … RV-036 | 5 de 7 |
| [E04](04-tokens.md) | Tokens | RV-040 … RV-047 | 3 de 8 |
| [E05](05-fog-of-war.md) | Névoa de guerra | RV-050 … RV-052 | — |
| [E06](06-combate.md) | Combate e iniciativa | RV-060 … RV-065 | — |
| [E07](07-chat.md) | Chat avançado | RV-070 … RV-075 | — |
| [E08](08-dados.md) | Motor de dados avançado | RV-080 … RV-084 | — |
| [E09](09-fichas.md) | Fichas e sistemas de RPG | RV-090 … RV-095 | — |
| [E10](10-handouts.md) | Handouts e anotações | RV-100 … RV-102 | — |
| [E11](11-tempo-real.md) | Tempo real e presença | RV-110 … RV-116 | 1 de 7 |
| [E12](12-ux.md) | Experiência e acessibilidade | RV-120 … RV-124 | — |
| [E13](13-operacao.md) | Operação, segurança e deploy | RV-130 … RV-138 | — |
| [E14](14-documentacao.md) | Documentação e conhecimento | RV-140 | — |

## Roadmap por ondas

`~~riscado~~` = concluído.

**Onda 1 — Mesa jogável de verdade.** Sem isto, um grupo real não completa uma sessão.

> ~~RV-001~~, ~~RV-002~~, ~~RV-003~~, ~~RV-004~~, ~~RV-005~~, ~~RV-008~~, RV-009 · ~~RV-020~~, ~~RV-021~~, ~~RV-022~~, ~~RV-023~~, ~~RV-027~~, **RV-029** · ~~RV-030~~, ~~RV-031~~, ~~RV-032~~, ~~RV-033~~, ~~RV-034~~ · ~~RV-040~~, ~~RV-041~~, ~~RV-042~~ · RV-070, RV-071, RV-073, RV-074 · RV-112, ~~RV-115~~ · RV-122 · **RV-138**

Com E03, E04 e RV-115 entregues, o mapa deixou de ser o gargalo: o mestre prepara cenas, sobe o mapa, ajusta o grid, dá zoom, e as peças têm arte, nome, cor e barra de vida ligada à ficha. **O que ainda impede um grupo real de completar uma sessão de 3h**, em ordem de bloqueio:

1. **RV-138 — banco e Storage reais.** As migrations `0002`, `0003` e `0004` nunca foram aplicadas e os buckets `mapas`/`tokens` não existem. Hoje **nenhum** grupo joga: cena, mapa e arte de token só funcionaram contra fakes. É o único item que bloqueia tudo o mais.
2. **RV-029 — POST sem corpo volta 400.** "Sair da mesa" e "Encerrar mesa" falham no navegador (o cliente manda `Content-Type: application/json` sem corpo), embora a API esteja correta e os contratos passem no `inject`. Defeito entregue, não desejo novo.
3. **RV-112 — reconexão resiliente.** "Sessão de 3h sem recarregar a página" é literalmente a métrica de pronto; qualquer queda de rede hoje deixa o cliente com estado velho e sem aviso.
4. **RV-009 — tipos do banco.** Os mappers de cena e token ganharam **7 colunas novas** que nada exercita fora de fakes: nome de coluna errado compila e só quebra na mesa de alguém. Sem isto, cada rodada do RV-138 vira caça a erro de runtime.
5. **RV-074 → RV-070, RV-071, RV-073 — chat.** Registry de comandos, sussurro, rolagem oculta do mestre e histórico paginado: sem eles a mesa joga, mas o mestre não conduz segredo nenhum e o log de 3h carrega inteiro de uma vez.
6. **RV-122 — estados de carregamento, erro e vazio.** O que separa "deu erro" de "a tela travou" durante a sessão.

**RV-110 (presença) saiu da Onda 1**: o próprio card já a declarava Onda 2 e dependente de RV-112 — saber quem está online é conforto, não requisito para terminar uma sessão. A lista acima é o que resta; tudo o mais que estava aqui foi entregue.

**Onda 2 — Paridade com o Roll20.** O que faz um mestre migrar.

> RV-010, RV-011, RV-012 · ~~RV-024~~, RV-025, RV-026, **RV-028** · RV-035, **RV-036** · RV-043, RV-044, RV-045, RV-046, **RV-047** · RV-050, RV-051, RV-052 · RV-060 … RV-065 · RV-080, RV-081, RV-083 · RV-090, RV-091, RV-092, RV-093 · RV-100, RV-101 · RV-110, **RV-116** · RV-120, RV-121 · **RV-136**, **RV-137**

**Onda 3 — Diferenciais e operação.** O que sustenta o produto em produção.

> RV-006, RV-007 · RV-013, RV-014 · RV-072, RV-075 · RV-082, RV-084 · RV-094, RV-095 · RV-102 · RV-111, RV-113, RV-114 · RV-123, RV-124 · RV-130 … RV-135

## Métricas de pronto do produto

O projeto é considerado "100% funcional" quando, além do DoD de cada card:

- Um grupo de 5 pessoas completa uma sessão de 3h sem recarregar a página.
- O fluxo crítico (registrar → criar mesa → convidar → aceitar → jogar) passa em E2E automatizado (RV-133).
- p95 de latência de `token:atualizado` abaixo de 150 ms com 8 clientes na mesma mesa (RV-134).
- Zero violação de camada detectada por lint de arquitetura (RV-001).
