# Backlog do RolaVinte

Roteiro do estado atual (MVP jogável) até a plataforma completa. Cada card é uma unidade de trabalho **autossuficiente**, escrita para ser executada por um agente sem contexto prévio da conversa que a originou.

## Estado atual (baseline)

Já implementado e verde (`npm run check`, `npm run test`):

- Contas: registro, login, JWT no REST e no handshake do socket.
- Mesas: criação, listagem, detalhe, edição de nome/descrição/sistema (**RV-024**), convite por email (Resend, token de uso único, cooldown de reenvio), aceite de convite.
- Ciclo de vida das mesas: listar e revogar convites (**RV-020**), remover jogador (**RV-021**), sair da mesa (**RV-022**), encerrar/arquivar com mesa em somente leitura (**RV-023**). O agregado `Mesa` concentra as guardas de escrita em `autorizarEscritaDeParticipante`/`autorizarEscritaDoMestre`, e o front tem dashboard separado em "Ativas"/"Encerradas" e diálogos de confirmação acessíveis.
- Jogo: uma cena ativa por mesa, tokens arrastáveis com autorização de domínio, chat com fala e rolagem, broadcast por sala `mesa:{id}` (incluindo `mesa:participante-removido` e `personagem:atualizado`).
- Chat: registry de comandos em `@rolavinte/shared` (**RV-074**) — `/r`|`/rolar`, `/sussurro`|`/s`, `/oculto`|`/go`|`/gm`, com aliases, motivo após `#` e aviso em PT-BR para comando desconhecido/incompleto —, sussurro entre participantes (**RV-070**) e rolagem oculta do mestre (**RV-071**). Uma rota só, `POST /mesas/:mesaId/chat`, recebe o texto cru e reinterpreta com o mesmo parser, despachando por `Map<tipo, manipulador>`; a visibilidade é filtrada **na consulta ao Postgres**, e sussurro/rolagem oculta reusam `mensagem:nova` emitido na sala pessoal `mesa:{mesaId}:usuario:{usuarioId}`.
- Tempo real (resiliência): **RV-112** — queda de rede não exige mais F5. Store de conexão com três estados alimentada por `socket.active`, reentrada na sala seguida de ressincronização de `['mensagens']`, `['cena']`, `['personagens']` e `['mesa']`, faixa `role="status"` e bloqueio de escrita pela prop `motivoBloqueio` (sem desmontar o Chat, então o texto digitado sobrevive). **RV-116** fecha o outro lado do contrato WS: evento declarado que ninguém publica derruba `npm run test` **e** `npm run check`, nomeando o evento.
- Experiência: **RV-122** — `Carregando`/`Erro`/`Vazio`, `ListaEsqueleto` e fila de toasts em `components/ui`, aplicados em 15 telas, com `padronizacao-estados.test.ts` varrendo o fonte para que nenhuma tela volte a escrever o próprio texto de carregamento/erro.
- Cenas e mapas: CRUD de cenas (**RV-030**), ativar cena existente devolvendo cena + tokens numa resposta só (**RV-031**), upload da imagem de fundo pela API atrás da port `ArmazenamentoArquivos` (**RV-032**), grid configurável — tamanho de célula, visibilidade e cor — como propriedade da cena (**RV-033**) e zoom/pan no tabletop com a matemática de câmera em funções puras (**RV-034**). Toda escrita de cena passa por `carregarCenaParaEscritaDoMestre`.
- Tokens: editar nome e cor (**RV-040**), arte do token por upload em bucket próprio (**RV-041**) e barra de vida vinculada à ficha (**RV-042**) — sem PV duplicado no token: o front cruza `token.personagemId` com `['personagens', mesaId]` e o evento `personagem:atualizado` mantém a barra viva. Excluir token ou cena limpa as artes do Storage (**RV-047**, best-effort num ponto único: falha de Storage não desfaz exclusão já persistida), e encolher o grid deixando peças fora do mapa é recusado com 409 dizendo quantas são (**RV-036**, backend — o front ainda não expõe largura/altura).
- Personagens: criação, listagem, ficha editável, teste de atributo em 1 clique.
- Motor de dados: `NdF`, `kh`/`kl`, multi-termos, sinais, limites e RNG injetável.
- Tempo real (contrato): **RV-115** — o contrato de `eventos-ws.ts` é aplicado nos dois lados (`Server`/`Socket` parametrizados na api, `Socket` tipado no web), sem remover nenhuma validação Zod do gateway, e `cobertura-eventos-ws.test.ts` fica vermelho se um evento do contrato nascer sem ouvinte no front.
- Fundação: **RV-001** (ESLint com fronteiras de camada + Prettier), **RV-002** (CI), **RV-003** (harness de contrato HTTP com fakes em memória), **RV-004** (helmet, rate limit e body limit), **RV-005** (erro global `{ erro, requisicaoId }`, request id do servidor e logs redigidos) e **RV-008** (Vitest + Testing Library no `apps/web`) concluídos — `npm run check` roda lint + typecheck e `npm run test` cobre os **três** workspaces, com 663 testes verdes (51 shared / 378 api / 234 web).
- Operação: **RV-138** — o schema foi aplicado num projeto Supabase real, os buckets `mapas` e `tokens` estão provisionados e o fluxo registrar → mesa → cena → token → rolagem → upload foi percorrido à mão no navegador. `npm run supabase:sql -w @rolavinte/api` gera o SQL de instalação a partir dos arquivos reais e `npm run supabase:verificar -w @rolavinte/api` confere schema e Storage antes de a API subir; a partida recusa a chave publicável do Supabase explicando onde pegar a secreta.

Pendências operacionais conhecidas do baseline:

- **A migration `0005_chat.sql` não está aplicada no projeto em uso, e o `supabase:verificar` diz que o ambiente está pronto.** Conferido pelo curador em 2026-08-09: o verificador imprime "Ambiente pronto" e `select destinatario_id from mensagens` responde `column mensagens.destinatario_id does not exist`. Como a coluna entra na constante `COLUNAS` de **todo** `listarDaMesa` e em **todo** `insert` de mensagem, o efeito não é "sussurro falha": **o chat inteiro está fora do ar** contra o banco real. É o [RV-139](13-operacao.md), Onda 1.
- O chat privado **nunca rodou contra o Postgres real**: sussurro, rolagem oculta e o filtro `or()` de visibilidade estão provados por teste de adapter com cliente falso, não em execução. Mesma coisa para a limpeza de arquivos do RV-047, que nunca chamou o Storage de verdade.
- Não existe paginação de mensagens (nem cursor, nem offset): `LIMITE_PADRAO = 100` fixo, então histórico acima de 100 mensagens é inalcançável — **RV-073** fica pela metade até a rota aceitar `?antesDe=<criado_em>&limite=<n>`.
- As limitações abertas estão em [docs/release-notes/v0.5.0.md](../release-notes/v0.5.0.md).

Tudo o que **não** está nessa lista é backlog.

### Cards concluídos

Convenção: o card concluído **mantém o texto original** (é o registro do que foi combinado) e ganha `**Status:** ✅ Concluído` na linha de metadados, dentro do épico. No [roadmap](#roadmap-por-ondas) ele aparece ~~riscado~~.

| Épico | Concluídos |
|---|---|
| [E00](00-fundacao.md) | RV-001, RV-002, RV-003, RV-004, RV-005, RV-008 |
| [E02](02-mesas.md) | RV-020, RV-021, RV-022, RV-023, RV-024, RV-027 |
| [E03](03-cenas.md) | RV-030, RV-031, RV-032, RV-033, RV-034, RV-036 (backend) |
| [E04](04-tokens.md) | RV-040, RV-041, RV-042, RV-047 |
| [E07](07-chat.md) | RV-070, RV-071, RV-074 |
| [E11](11-tempo-real.md) | RV-112, RV-115, RV-116 |
| [E12](12-ux.md) | RV-122 |
| [E13](13-operacao.md) | RV-138 |

Cards **nascidos da execução destes** — defeito real ou lacuna que morde depois, não desejo novo: [RV-027](02-mesas.md), [RV-028](02-mesas.md), [RV-115](11-tempo-real.md), [RV-136](13-operacao.md), [RV-137](13-operacao.md); da entrega de cenas e tokens, [RV-029](02-mesas.md), [RV-036](03-cenas.md), [RV-047](04-tokens.md), [RV-116](11-tempo-real.md), [RV-138](13-operacao.md); e da entrega de chat, resiliência e estados de UI, [RV-125](12-ux.md) e [RV-139](13-operacao.md).

`**Status:** 🚧 Parcial` marca o card cuja entrega ficou pela metade — o texto explica **o que falta e por quê**, e o card continua aberto no roadmap. Hoje só [RV-073](07-chat.md) está nesse estado.

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
| [E03](03-cenas.md) | Cenas e mapas | RV-030 … RV-036 | 6 de 7 |
| [E04](04-tokens.md) | Tokens | RV-040 … RV-047 | 4 de 8 |
| [E05](05-fog-of-war.md) | Névoa de guerra | RV-050 … RV-052 | — |
| [E06](06-combate.md) | Combate e iniciativa | RV-060 … RV-065 | — |
| [E07](07-chat.md) | Chat avançado | RV-070 … RV-075 | 3 de 6 (RV-073 parcial) |
| [E08](08-dados.md) | Motor de dados avançado | RV-080 … RV-084 | — |
| [E09](09-fichas.md) | Fichas e sistemas de RPG | RV-090 … RV-095 | — |
| [E10](10-handouts.md) | Handouts e anotações | RV-100 … RV-102 | — |
| [E11](11-tempo-real.md) | Tempo real e presença | RV-110 … RV-116 | 3 de 7 |
| [E12](12-ux.md) | Experiência e acessibilidade | RV-120 … RV-125 | 1 de 6 |
| [E13](13-operacao.md) | Operação, segurança e deploy | RV-130 … RV-139 | 1 de 10 |
| [E14](14-documentacao.md) | Documentação e conhecimento | RV-140 | — |
| [E15](15-pathfinder2e.md) | Pathfinder 2e | RV-150 … RV-158 | — |

## Roadmap por ondas

`~~riscado~~` = concluído.

**Onda 1 — Cinco pessoas reais, três horas, sem recarregar.** Não "a mesa tem as funcionalidades": **o grupo consegue jogar**.

> ~~RV-001~~, ~~RV-002~~, ~~RV-003~~, ~~RV-004~~, ~~RV-005~~, ~~RV-008~~, **RV-009** · ~~RV-020~~, ~~RV-021~~, ~~RV-022~~, ~~RV-023~~, ~~RV-027~~, **RV-029** · ~~RV-030~~, ~~RV-031~~, ~~RV-032~~, ~~RV-033~~, ~~RV-034~~ · ~~RV-040~~, ~~RV-041~~, ~~RV-042~~ · ~~RV-070~~, ~~RV-071~~, **RV-073**, ~~RV-074~~ · ~~RV-112~~, ~~RV-115~~ · ~~RV-122~~ · ~~RV-138~~, **RV-139**, **RV-132**

A v0.5.0 fechou a parte de dentro: o mestre conduz segredo (RV-074/RV-070/RV-071), a sessão sobrevive a uma queda de rede sem F5 (RV-112), a tela diz o que está acontecendo (RV-122) e existe um projeto Supabase real com schema e buckets (RV-138). O que sobrou **não é funcionalidade** — é a distância entre o código entregue e um grupo de verdade conseguindo usá-lo. Em ordem de bloqueio:

1. **RV-139 — o chat está fora do ar contra o banco real, e a verificação de ambiente diz que está tudo certo.** A migration `0005_chat.sql` não foi aplicada; `mensagens.destinatario_id` entra na lista de colunas de **toda** leitura e em **todo** insert de mensagem, então não é só o sussurro que quebra — é fala, rolagem, histórico, tudo. Pior que o defeito é a guarda: `npm run supabase:verificar` imprime "Ambiente pronto" porque a checklist dele é escrita à mão e parou na `0004`. Uma defesa que precisa ser lembrada não é defesa. Aplicar a migration é o conserto de cinco minutos; fazer o verificador derivar do diretório de migrations é o que impede a terceira vez.
2. **RV-132 — ninguém fora desta máquina consegue entrar.** A plataforma só existe em `localhost`, e `RESEND_API_KEY` está vazia, então **todo convite cai no stdout da API**: os outros quatro jogadores não recebem link nenhum, e o `ConviteDTO` não expõe o token, então nem por contorno o mestre copia e cola. Enquanto isto durar, cada card da Onda 1 melhora uma sessão que não começa. Por isso o card de deploy subiu da Onda 3 — com a dependência de RV-130 reduzida a `GET /api/pronto` e um critério novo: **um convite real entregue a um endereço de terceiro**, caminho que nunca rodou fora do `ServicoEmailConsole`.
3. **RV-029 — "Sair da mesa" e "Encerrar mesa" falham no navegador.** O cliente manda `Content-Type: application/json` sem corpo e o Fastify recusa com 400 antes de a rota rodar; a API está correta e os contratos passam no `inject`, que é justamente por que ninguém viu. Defeito entregue, não desejo novo.
4. **RV-009 — tipos gerados do banco.** É a versão em tempo de compilação do item 1: com tipos derivados do schema real, `destinatario_id` inexistente **não compilaria**, em vez de virar erro de runtime na mesa de alguém. Hoje nome de coluna errado atravessa lint, typecheck e a suíte inteira (que roda com fakes).
5. **RV-073 — histórico paginado (parcial).** Os dois cenários de rolagem foram entregues; a paginação não, porque a rota não aceita cursor e `LIMITE_PADRAO = 100` é fixo. Cinco pessoas em três horas passam de 100 mensagens com folga, e a partir daí o começo da sessão é inalcançável — sem nenhum aviso na tela de que existe algo acima.

**O que deliberadamente não entrou**, para a Onda 1 não voltar a inchar: **RV-136** (adapters Supabase sem teste) ganhou peso com o banco real em uso, mas o modo de falha que ele cobre é o mesmo do RV-009, que é mais barato e vem antes; **RV-110** (presença), **RV-137** (limites no WS) e **RV-114** (autorização contínua no socket) continuam fora — o token atual dura 7 dias, então nada expira no meio de uma sessão, e um grupo de amigos não é uma ameaça de abuso; **RV-125** (teste de montagem das páginas) é rede de segurança de manutenção, não pré-requisito para jogar.

**O teste honesto desta onda** não é `npm run test` verde: é cinco pessoas em máquinas diferentes, convidadas por email de verdade, jogando três horas, com o chat funcionando e sem ninguém apertar F5.

**Onda 2 — Paridade com o Roll20.** O que faz um mestre migrar.

> RV-010, RV-011, RV-012 · ~~RV-024~~, RV-025, RV-026, **RV-028** · RV-035, ~~RV-036~~ · RV-043, RV-044, RV-045, RV-046, ~~RV-047~~ · RV-050, RV-051, RV-052 · RV-060 … RV-065 · RV-080, RV-081, RV-083 · RV-090, RV-091, RV-092, RV-093 · RV-100, RV-101 · RV-110, ~~RV-116~~ · RV-120, RV-121, **RV-125** · **RV-136**, **RV-137** · RV-150, RV-151, RV-152, RV-153, RV-154, RV-155, RV-156

O bloco RV-150 … RV-156 é o [E15 — Pathfinder 2e](15-pathfinder2e.md) e entra **depois** de RV-091 e RV-090: sem a strategy de sistema de ficha e o cálculo de perícias, Pathfinder vira `switch (sistema)` espalhado. Dentro do épico a ordem é rígida — RV-150 (fronteira de licenciamento) e RV-151 (motor de regras) fecham as duas classes de risco que todos os outros exercitam.

**Onda 3 — Diferenciais e operação.** O que sustenta o produto em produção.

> RV-006, RV-007 · RV-013, RV-014 · RV-072, RV-075 · RV-082, RV-084 · RV-094, RV-095 · RV-102 · RV-111, RV-113, RV-114 · RV-123, RV-124 · RV-130, RV-131, RV-133, RV-134, RV-135 · RV-157, RV-158

**RV-132 saiu daqui** e virou o segundo item da Onda 1: publicar deixou de ser "o que sustenta o produto em produção" e passou a ser a condição para a métrica de pronto existir. RV-133 (E2E) e RV-134 (carga) continuam na Onda 3 e dependem dele.

## Métricas de pronto do produto

O projeto é considerado "100% funcional" quando, além do DoD de cada card:

- Um grupo de 5 pessoas completa uma sessão de 3h sem recarregar a página.
- O fluxo crítico (registrar → criar mesa → convidar → aceitar → jogar) passa em E2E automatizado (RV-133).
- p95 de latência de `token:atualizado` abaixo de 150 ms com 8 clientes na mesma mesa (RV-134).
- Zero violação de camada detectada por lint de arquitetura (RV-001).
