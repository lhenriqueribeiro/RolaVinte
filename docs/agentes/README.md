# Time de agentes do RolaVinte

Especificação do processo multi-agente que constrói este projeto. As definições executáveis vivem em [.claude/agents/](../../.claude/agents/); aqui está **como elas se combinam** e o que três fases de execução real ensinaram.

## O elenco

| Agente | Papel | Quando entra |
|---|---|---|
| [implementador-backend](../../.claude/agents/implementador-backend.md) | Domínio, aplicação, infra, rotas, migrations e testes | Estágio de construção |
| [implementador-frontend](../../.claude/agents/implementador-frontend.md) | Interface, hooks, cache e testes de front | Depois que o backend do card existe |
| [verificador](../../.claude/agents/verificador.md) | Qualidade independente: roda tudo do zero e audita contra a taxonomia | Sempre, ao fim da construção |
| [curador-backlog](../../.claude/agents/curador-backlog.md) | Descobertas → cards; marca concluídos; mantém roadmap | Fim da fase |
| [redator-release](../../.claude/agents/redator-release.md) | Release notes e atualização de baseline | Fim da fase |

Documentos que todos consomem:

- [protocolo-comum.md](protocolo-comum.md) — contrato de trabalho único. Cada agente aponta para ele em vez de duplicar.
- [taxonomia-de-falhas.md](taxonomia-de-falhas.md) — catálogo dos defeitos que este projeto já produziu. Cresce a cada fase.

## Anatomia de uma fase

```
[cards protetores, sozinhos]        ← mecânicos, protegem tudo o que vem depois
        ↓
[backend A]  ∥  [backend B]  ∥  [front independente]
        ↓
[frontend que consome os contratos]
        ↓
[verificação independente]
        ↓
[release notes]  ∥  [curadoria de backlog]
```

Cada fase termina com uma versão publicada, o backlog atualizado e as descobertas viradas em card. O humano no comando revisa entre fases — **nunca** se emendam duas fases sem esse ponto de parada.

## Regras de particionamento

Este repositório **não é git**: sem worktree, sem branch, sem merge. Vários agentes escrevem no mesmo sistema de arquivos ao mesmo tempo. Estas regras são o que substitui o controle de versão.

**1. Particione por posse de arquivo, nunca por card.** Dois cards que tocam o mesmo arquivo são um único agente, mesmo que sejam cinco cards.

**2. Um agregado, um agente.** Os cinco cards do ciclo de vida das mesas atacavam todos o `Mesa`. Fatiá-los entre agentes seria garantir conflito; um agente fez os cinco.

**3. Backend e frontend são estágios, não paralelos.** O front recebe `contratosNovos` do backend e lê as rotas reais. Rodá-los juntos produz UI escrita contra contrato imaginado.

**4. Cards mecânicos e protetores vão primeiro, sozinhos.** Ver o estudo de caso abaixo.

**5. O orquestrador atribui números de migration.** Dois agentes na mesma fase criando `0003_` é colisão garantida.

**6. `Edit` cirúrgico fora da posse exclusiva; `Write` nunca.** `Write` sobrescreve o arquivo inteiro.

## Responsabilidades que são só do orquestrador

O que **não** dá para delegar:

- **Mapear as armadilhas antes de disparar.** Ler o código, achar o que vai quebrar em silêncio e escrever isso no prompt. Foi assim que o *body limit* barrando o upload de 8 MB e o arrasto de token quebrando com zoom foram evitados antes de existirem.
- **Escrever as perguntas dirigidas da verificação.** Verificador genérico ("veja se está tudo bem") acha menos que verificador com dez perguntas nomeadas. Comparação direta entre a fase 1 e as fases 2–3.
- **Verificar por conta própria.** Rodar `check`, `test` e `build` e conferir se o número bate com o relatado. Já bateu sempre — o que só se sabe conferindo.
- **Decidir o que é decisão de produto.** Quando o verificador diz "isso é escolha de produto, não corrigi", ele está certo em parar. Quem decide é o humano, ou o orquestrador quando a decisão é óbvia e reversível.
- **Sequenciar.** Qual card protege qual, o que desbloqueia o quê.

## Estudo de caso: o sequenciamento que se pagou na mesma fase

Na v0.3.0, o evento `mesa:participante-removido` nasceu publicado pelo servidor e sem ouvinte no cliente. Atravessou `check`, `lint`, `test` e `build` sem um ruído, e só apareceu como bug de tela.

A causa raiz era estrutural: `eventos-ws.ts` se dizia "única fonte de verdade" e tinha **zero consumidores**.

Na v0.4.0 a fase criava um evento novo (`personagem:atualizado`). Em vez de deixá-lo junto com os demais cards, o RV-115 — tipar o contrato dos dois lados — foi promovido a **primeiro estágio, rodando sozinho**.

Resultado: quando o backend declarou o evento, o teste de cobertura deixou **3 testes do web vermelhos** até o ouvinte existir. O mesmo defeito, tentando nascer de novo, foi barrado por máquina.

**A lição, generalizada:** quando uma fase vai criar instâncias de uma classe de defeito conhecida, o card que fecha aquela classe vem antes — sozinho, e no mesmo lote.

## Práticas que geraram valor mensurável

**Prove que o teste falha.** Todo teste cuja função é *impedir* algo é quebrado de propósito, confirmado vermelho e desfeito. No RV-115 o experimento revelou que `npm run check` continuava **verde** com o evento órfão — medindo exatamente quanto aquele teste vale. Sem isso, seriam dois testes que ninguém sabe se funcionam.

**Quem implementa não assina o próprio laudo.** O verificador achou, em fases diferentes: o ouvinte de evento faltando, contratos duplicados entre api e web, o fake que passa por construção, e uma proteção inerte que exigiu ler o fonte do Fastify. Nenhum implementador viu nada disso.

**Descoberta com critério de corte.** O curador descarta a maior parte do que recebe: dezenas de descobertas por entrega viram uns poucos cards, todos com defeito ou lacuna descritível. Backlog inflado perde a função de priorizar.

**Decisão registrada no card, não na conversa.** Cards concluídos carregam um bloco de "decisões tomadas na entrega". É o que impede o próximo agente de re-decidir errado uma pergunta já respondida.

**Verificação fora da suíte, ao fim de cada sprint.** É a prática mais nova, e nasceu porque **duas sprintes seguidas ganharam card de defeito que a suíte não pegava**: a migration `0005` em disco e fora do banco (achada pelo curador, conferindo em vez de acreditar) e o atributo com duas verdades (achado no navegador, com 1.475 testes verdes).

O padrão é sempre o mesmo: **a suíte protege contra regressão, não contra premissa errada.** Cada metade é testada, nenhum teste exercita as duas juntas, e o defeito mora exatamente na junção. Por isso o ciclo da sprint termina com o orquestrador subindo a aplicação e percorrendo o caminho de verdade — não como cerimônia, mas porque foi o que achou os dois defeitos mais caros do projeto.

## Custo real

| Entrega | Versão | Agentes | Duração | Tokens | Testes |
|---|---|---|---|---|---|
| Fase 1 — Fundação | v0.2.0 | 6 | ~36 min | 590 mil | 22 → 55 |
| Fase 2 — Mesas e endurecimento | v0.3.0 | 7 | ~45 min | 1,06 mi | 55 → 179 |
| Fase 3 — Tabletop | v0.4.0 | 8 | ~1h30 + 22 min | 1,66 mi | 179 → 447 |
| Fase 4 — Pronto para jogar | v0.5.0 | 8 | ~1h50 | 1,64 mi | 447 → 663 |
| Sprint 1 — Ficha extensível | v0.6.0 | 7 | ~1h20 | 1,41 mi | 663 → 863 |
| Sprint 2 — Pathfinder calcula | v0.7.0 | 7 | ~1h50 | 1,42 mi | 863 → 1.167 |
| Sprint 3 — Pathfinder na mesa | v0.8.0 | 7 | ~2h45 | 2,23 mi | 1.167 → 1.475 |

Sete entregas até a v0.8.0, ~10 milhões de tokens de subagente. É um registro histórico, não um placar: o estado atual do backlog fica em [docs/backlog/](../backlog/README.md).

As quatro primeiras foram chamadas de **fase**; a partir da v0.6.0 o backlog passou a ser organizado em [sprints](../backlog/sprints.md), com objetivo declarado e versão. O ciclo interno é o mesmo.

**Sobre a fase 3:** três agentes do último estágio morreram com erro de rede. A reexecução aproveitou o prefixo em cache — os cinco agentes de construção não rodaram de novo, e só os três finais custaram tokens novos. **Falha de infraestrutura no meio de uma fase não exige recomeçar**: reexecute com o mesmo script e o mesmo `runId`.

## Limites conhecidos deste processo

- **O paralelismo tem teto, mesmo com git.** O repositório existe, mas todos os agentes de uma sprint compartilham a mesma árvore de trabalho — sem worktree, a disciplina de posse é o que substitui o merge, e ela custa serialização. Dar a cada agente um worktree próprio é a melhoria de maior retorno que este processo ainda não tem.
- **Agente nenhum executa a aplicação.** Todos param em `check`, `test` e `build`. Quem sobe a plataforma e clica é o orquestrador, à mão, ao fim da sprint — e foi assim que os dois defeitos mais caros apareceram. Enquanto o E2E do RV-133 não existir, essa verificação **não é opcional**.
- **A taxonomia só protege contra o que já aconteceu.** Classe nova passa na primeira vez; o processo garante que não passe duas. Das 12 classes de hoje, 3 nasceram de defeito que atravessou a suíte inteira verde.
- **Custo por card cresce com a base.** A Sprint 3 gastou 2,23 milhões de tokens em 4 cards; a Fase 1 gastou 590 mil em 3. Não é desperdício: cada agente lê mais contexto porque há mais projeto para não quebrar.
