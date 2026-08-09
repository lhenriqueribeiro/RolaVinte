# Guardrail: Testes e Qualidade

## Estratégia (pirâmide)

1. **Domínio** (maioria): testes unitários puros — entidades, VOs, motor de dados. Sem mocks, sem I/O.
2. **Aplicação**: use cases com fakes em memória das ports (`FakeMesaRepository`). Mock de framework é proibido — se precisou, a arquitetura vazou.
3. **HTTP/WS**: testes de contrato com `criarAppDeTeste()` de `apps/api/src/testes/harness.ts` + `app.inject`. O harness devolve `{ app, fakes, autenticarComo, aguardarEventos, encerrar }` e não toca em Supabase, rede nem `process.env`.

- Os fakes de **todas** as ports vivem em `apps/api/src/testes/fakes/`. Alterou uma port? Atualize o fake — senão fake e produção divergem em silêncio.
- **Cuidado com o fake que passa por construção**: um dublê que regrava o agregado inteiro nunca expõe bug de sincronização do adapter. Quando o comportamento depende de *como o adapter persiste*, o teste vai no adapter.
- **Teste protetor precisa ter falhado ao menos uma vez.** Regra de lint, cobertura de contrato e invariante de segurança: quebre de propósito, confirme o vermelho, desfaça e registre. Ver `fronteiras-arquitetura.test.ts` e `cobertura-eventos-ws.test.ts`.

- Runner: **Vitest** em todos os pacotes. Arquivos `*.test.ts` colocados junto ao código testado.
- O motor de dados (`packages/shared/src/dados`) exige cobertura de casos: `d20`, `2d6+3`, `4d6kh3`, `2d20kl1`, limites (0 dados, 1000 dados, faces inválidas) e determinismo via RNG injetável.

## Qualidade

- TypeScript `strict: true` em todo o monorepo; `any` explícito é proibido (use `unknown` + narrowing).
- `npm run check` (typecheck de todos os workspaces) deve passar antes de qualquer entrega.
- Funções puras por padrão; efeitos nas bordas.
- Nomes em PT-BR no domínio/aplicação; termos técnicos consagrados podem ficar em inglês (`Repository`, `EventBus`, `queryKey`).
- Commits: Conventional Commits em PT-BR (`feat: convite de jogadores por email`).

## Definition of Done de uma feature

- [ ] Invariantes de domínio testadas.
- [ ] Use case testado com fakes.
- [ ] Typecheck e testes verdes no monorepo.
- [ ] Textos de UI em PT-BR revisados.
- [ ] Guardrails de `.claude/rules/` respeitados (imports, camadas, ports).
