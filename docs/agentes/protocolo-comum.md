# Protocolo comum — leitura obrigatória de todo agente

Este arquivo é o contrato de trabalho de **qualquer** agente que atue no RolaVinte. Cada especificação em [.claude/agents/](../../.claude/agents/) aponta para cá em vez de repetir o conteúdo — uma cópia a menos para divergir.

Raiz do repositório: `C:\Projetos\RolaVinte`, que já é o seu diretório de trabalho. Use caminhos relativos.

---

## 1. Leia antes de escrever qualquer código

1. [CLAUDE.md](../../CLAUDE.md) — stack, layout, comandos.
2. Os guardrails de [.claude/rules/](../../.claude/rules/) citados pelo seu card.
3. [docs/backlog/README.md](../backlog/README.md) — protocolo do backlog e Definition of Done global.
4. O card completo que você vai implementar.
5. A release note mais recente em [docs/release-notes/](../release-notes/) — é onde o estado real e as limitações conhecidas ficam registrados.
6. [taxonomia-de-falhas.md](taxonomia-de-falhas.md) — as classes de defeito que este projeto já produziu. Não repita nenhuma.

> **Aviso sobre os guardrails:** `.claude/rules/` descreve princípios, e alguns trechos descrevem a estrutura de arquivos como ela era no início do projeto. Quando o texto e o código divergirem, **o código manda** — e você registra a divergência em `descobertas`. Princípio desatualizado é bug de documentação; siga o princípio, corrija o mapa.

## 2. Meça o estado, não confie no briefing

O briefing que você recebeu descreve o repositório no momento em que a fase foi planejada. Outros agentes podem ter mudado a base desde então.

- **Nunca** repita um número do briefing como se fosse fato atual. Rode os comandos e leia a saída.
- Antes de mexer num arquivo compartilhado, leia-o. Ele pode não estar como o briefing sugere.
- Encontrou trabalho de outro agente que o briefing não previa? Não desfaça. Relate em `observacoes`.

## 3. Regras inegociáveis de arquitetura

- **Regra de dependência**: `dominio` ← `aplicacao` ← `infra`/`apresentacao`. É proibido importar `fastify`, `@supabase/*`, `resend` ou `socket.io` em `apps/api/src/dominio` ou `apps/api/src/aplicacao`. O lint barra, e [fronteiras-arquitetura.test.ts](../../apps/api/src/testes/fronteiras-arquitetura.test.ts) prova que barra.
- **Todo acesso externo novo passa por port** declarada em `aplicacao/ports/`, com adapter em `infra/`.
- **Falha esperada devolve `Result`**, nunca exceção. Exceção é bug.
- **Autorização é regra de domínio.** Verifique no agregado ou no caso de uso — nunca só escondendo o botão. Se a proteção existe apenas na UI, ela não existe.
- **Reuse as guardas do agregado.** `Mesa.autorizarEscritaDeParticipante(usuarioId)` e `Mesa.autorizarEscritaDoMestre(usuarioId, mensagem)` já cobrem participação **e** mesa encerrada juntas. Reimplementar a checagem à mão é como o congelamento de mesa encerrada furou nas fichas.
- **Contratos vivem em `packages/shared`.** Schemas Zod, DTOs e eventos WS. O front nunca redeclara — isso já foi violado e custou retrabalho.
- **PT-BR** em nomes de domínio e em todo texto de UI.
- **Proibido `any`.** Use `unknown` com narrowing.

## 4. Não amplie o escopo

O card é o contrato. Encontrou outro problema — mesmo grave, mesmo de uma linha?

1. Registre em `descobertas` com severidade.
2. Siga o seu card.

A exceção única: se o seu card não puder ser concluído sem a correção. Nesse caso faça o mínimo e explique em `observacoes`.

## 5. Concorrência: como não apagar o trabalho alheio

Este projeto **não é um repositório git**, então não há isolamento por worktree nem merge para socorrer. Vários agentes editam o mesmo sistema de arquivos ao mesmo tempo.

- Você recebe uma lista de **arquivos de posse exclusiva**. Neles pode usar `Write`.
- Em **qualquer outro arquivo**, use `Edit` com trechos mínimos e únicos. **Nunca `Write`** — ele sobrescreve o arquivo inteiro e apaga alterações de quem estava lá.
- Não reformate nem refatore arquivo que não é seu. Rode `npm run format` apenas nos seus.
- Precisou mesmo tocar um arquivo fora da sua lista (ex.: um campo novo obrigatório no DTO quebrou uma fixture de teste alheia)? Faça a alteração **mínima**, não toque em mais nada, e **reporte explicitamente** em `observacoes` dizendo qual arquivo e quantas linhas. Isso já aconteceu e foi a conduta certa.

## 6. Teste que nunca falhou não protege nada

Esta regra pagou duas vezes neste projeto e é obrigatória sempre que você escrever um teste cuja função é **impedir** algo (regra de lint, cobertura de contrato, invariante de segurança):

1. Quebre a coisa de propósito.
2. Confirme que o teste fica **vermelho**, e que a mensagem nomeia o problema.
3. Desfaça.
4. Relate o experimento em `observacoes`.

Casos reais: o teste de fronteiras de arquitetura (RV-001) e o de cobertura de eventos WS (RV-115). No segundo, o experimento revelou que `npm run check` continuava **verde** com um evento órfão no contrato — medindo exatamente o valor do teste.

## 7. Pirâmide de testes

1. **Domínio** — invariantes, puro, sem mock.
2. **Caso de uso** — com os fakes de [apps/api/src/testes/fakes/](../../apps/api/src/testes/fakes/). Mock de framework é proibido: se precisou, a arquitetura vazou.
3. **Contrato HTTP/WS** — `criarAppDeTeste()` de [harness.ts](../../apps/api/src/testes/harness.ts) + `app.inject`.

Alterou uma port? **Atualize o fake correspondente** — senão a suíte de contrato quebra e, pior, fake e produção passam a divergir.

**Cuidado com o fake que passa por construção.** `FakeMesaRepository` regrava o agregado inteiro, então um bug de sincronização no adapter Supabase é invisível para ele. Quando a correção estiver *no adapter*, o teste também precisa estar lá.

## 8. Encerramento

1. `npm run check` (lint com `--max-warnings=0` + typecheck dos 3 workspaces).
2. `npm run test` (shared + api + web).
3. Os dois **precisam** passar por causa do seu código. Quebrou por trabalho de outro agente? Não conserte: relate em `observacoes`.
4. `npm run format` nos seus arquivos.
5. Responda **somente** com o objeto estruturado pedido. Números vêm da saída real dos comandos — **nunca invente e nunca estime**.
