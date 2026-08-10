# Guardrail: Testes e Qualidade

## Estratégia (pirâmide)

1. **Domínio** (a maioria): teste unitário puro — entidades, VOs, motor de dados. Sem mock, sem I/O.
2. **Aplicação**: casos de uso com os fakes em memória das ports, em `apps/api/src/testes/fakes/`. Mock de framework é **proibido**: se foi necessário, a arquitetura vazou.
3. **Contrato HTTP/WS** (poucos): `criarAppDeTeste()` do harness em `apps/api/src/testes/` + `app.inject`. O harness monta o mesmo grafo do composition root de produção com adapters em memória — sem Supabase, sem rede, sem `process.env`.

Regras que atravessam os três níveis:

- Teste fica **junto do código testado** (`*.test.ts`). A exceção são as guardas que afirmam algo sobre o repositório inteiro (fronteiras de arquitetura, lista em SQL espelhando enum, cobertura de contrato, padronização de estados de tela): essas não pertencem a um módulo, e o nome do arquivo precisa dizer o que elas protegem — guarda escondida com nome genérico ninguém encontra quando ela fica vermelha.
- **Alterou uma port? Atualize o fake.** Senão a suíte de contrato quebra na melhor hipótese e, na pior, fake e produção passam a divergir em silêncio.
- **Cuidado com o fake que passa por construção.** Dublê que regrava o agregado inteiro nunca expõe bug de sincronização do adapter. Quando o comportamento depende de *como* o adapter persiste, o teste vai no adapter.
- **Teste de ida e volta para todo campo que o usuário informa.** Grave informando um valor, releia pela API e compare. Testar as duas metades separadas foi exatamente o que deixou passar um campo exigido na criação e ignorado na leitura (**F12** da [taxonomia](../../docs/agentes/taxonomia-de-falhas.md)).
- **Teste protetor precisa ter falhado ao menos uma vez**, e a asserção precisa ser precisa e não apenas presente. A regra completa, com o experimento obrigatório, está em [protocolo-comum.md](../../docs/agentes/protocolo-comum.md) e o princípio em [10-verificabilidade.md](10-verificabilidade.md).
- Cobertura de motor de dados: os casos da gramática (um dado, vários dados, modificadores de manter, soma e subtração de termos, expressão inválida) **mais as duas bordas de cada limite declarado** no próprio motor — o valor recusado abaixo do mínimo e acima do máximo. Os números são dele; esta regra não os repete, senão passam a existir em dois lugares.
- Determinismo: RNG e relógio entram por injeção. Teste que depende de `Math.random` ou da hora do sistema é intermitente por construção.

## Qualidade

- Runner: **Vitest** em todos os workspaces.
- TypeScript `strict: true` no monorepo. `any` explícito é proibido — use `unknown` + narrowing.
- `npm run check` (lint com zero aviso tolerado + verificação da documentação + typecheck dos workspaces) e `npm run test` precisam passar antes de qualquer entrega.
- Funções puras por padrão; efeito colateral nas bordas.
- Nomes em PT-BR no domínio e na aplicação. Termo técnico consagrado pode ficar em inglês (`Repository`, `EventBus`, `queryKey`).
- Commits em Conventional Commits, em PT-BR (`feat: convite de jogadores por email`).

## Definition of Done de uma feature

- [ ] Invariantes de domínio testadas, incluindo a negativa (quem **não** pode, recebe 403/409).
- [ ] Caso de uso testado com fakes; fake atualizado se a port mudou.
- [ ] Campo novo que o usuário informa tem teste de ida e volta.
- [ ] Contrato novo (evento, enum, lista, port) nasceu com um consumidor que quebra quando for desrespeitado ([10-verificabilidade.md](10-verificabilidade.md)).
- [ ] Teste protetor novo já foi visto vermelho, e o experimento está relatado.
- [ ] `npm run check` e `npm run test` verdes no monorepo.
- [ ] Textos de UI em PT-BR revisados, e nenhum deles promete o que o backend não cumpre.
- [ ] Guardrails de `.claude/rules/` respeitados — camadas, ports, guardas do agregado.
