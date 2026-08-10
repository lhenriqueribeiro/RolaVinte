# RolaVinte — Plataforma de RPG Online (clone evoluído do Roll20)

Plataforma web em PT-BR para jogar RPG de mesa online: mesas (campanhas), tabletop com grid e tokens em tempo real, chat com rolagem de dados, fichas de personagem e convites por email.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite 6, TypeScript, React Router 7, TanStack Query 5, Zustand 5, Tailwind CSS 4, socket.io-client |
| Backend | Node ≥22 (ESM), Fastify 5, Socket.IO 4, Zod, JWT + bcrypt |
| Banco | Supabase (Postgres) — acesso só pelo backend via service role |
| Email | Resend (port `ServicoEmail`; fallback console em dev) |
| Testes | Vitest em todos os workspaces |

## Layout do monorepo (npm workspaces)

```
packages/shared   @rolavinte/shared — schemas Zod (contratos API/WS), tipos, motor de dados
apps/api          @rolavinte/api    — monolito Clean Architecture + DDD (dominio/aplicacao/infra/apresentacao)
apps/web          @rolavinte/web    — React feature-sliced (features/auth, mesas, jogo, personagens)
```

## Comandos

```bash
npm install                 # instala tudo (workspaces)
npm run dev                 # api (porta 3333) + web (porta 5173) em paralelo
npm run dev -w @rolavinte/api
npm run dev -w @rolavinte/web
npm run lint                # eslint: estilo + fronteiras de arquitetura (zero aviso tolerado)
npm run format              # prettier --write
npm run check               # lint + typecheck de todos os workspaces — obrigatório antes de entregar
npm run test                # vitest em todos os workspaces
npm run build               # build de produção
```

O lint é a versão executável dos guardrails abaixo: `eslint.config.js` codifica a regra de dependência com `no-restricted-imports` por diretório, e `apps/api/src/testes/fronteiras-arquitetura.test.ts` prova que cada fronteira dispara.

Configuração: copie `.env.example` para `apps/api/.env`. Sem `RESEND_API_KEY` os emails caem no console; sem Supabase configurado a API não sobe (fail fast em `config/env.ts`). Migrations SQL em `apps/api/supabase/migrations/` (aplicar no SQL Editor do Supabase, em ordem).

## Arquitetura — regras inegociáveis

Os guardrails completos estão em `.claude/rules/` e **devem ser lidos antes de alterar código**:

1. [01-arquitetura.md](.claude/rules/01-arquitetura.md) — regra de dependência, ports & adapters, composition root
2. [02-ddd.md](.claude/rules/02-ddd.md) — linguagem ubíqua PT-BR, bounded contexts, agregados, invariantes
3. [03-solid.md](.claude/rules/03-solid.md) — aplicação prática + checklist de review
4. [04-design-patterns.md](.claude/rules/04-design-patterns.md) — padrões canônicos e proibidos
5. [05-backend.md](.claude/rules/05-backend.md) — estrutura da api, rotas, sockets, migrations
6. [06-frontend.md](.claude/rules/06-frontend.md) — feature-sliced, Query vs Zustand, sockets
7. [07-supabase.md](.claude/rules/07-supabase.md) — convenções de schema, mappers, RLS
8. [08-email.md](.claude/rules/08-email.md) — Resend atrás de port, envio por eventos
9. [09-testes-e-qualidade.md](.claude/rules/09-testes-e-qualidade.md) — pirâmide de testes, DoD

Resumo do que quebra o build de review:

- Import de fastify/supabase/resend em `dominio/` ou `aplicacao/` (a regra de dependência aponta para dentro).
- Lógica de negócio em rota, handler de socket ou componente React.
- Falha esperada lançada como exceção em vez de `Result`.
- Front redeclarando contrato que existe em `@rolavinte/shared`.
- Texto de UI fora de PT-BR.

## Time de agentes

Este projeto é construído por agentes em fases. A especificação está em [docs/agentes/](docs/agentes/README.md):

- [protocolo-comum.md](docs/agentes/protocolo-comum.md) — **leitura obrigatória de todo agente** antes de codar: regras de arquitetura, disciplina de concorrência sem isolamento (todos os agentes na mesma árvore de trabalho), e critério de encerramento.
- [taxonomia-de-falhas.md](docs/agentes/taxonomia-de-falhas.md) — as 12 classes de defeito que este projeto já produziu de verdade. Não reincida.
- Definições executáveis em [.claude/agents/](.claude/agents/): `implementador-backend`, `implementador-frontend`, `verificador`, `curador-backlog`, `redator-release`.

Duas regras do processo que valem para qualquer contribuição, humana ou não: **quem implementa não verifica o próprio trabalho**, e **teste protetor precisa ter falhado ao menos uma vez** para valer alguma coisa.

## Backlog

O roteiro do produto vive em [docs/backlog/](docs/backlog/README.md), organizado em [sprints](docs/backlog/sprints.md) com objetivo declarado e versão. Cada card traz história, critérios de aceite em Gherkin, testes obrigatórios e DoD. A contagem de cards e o que está concluído ficam **só** no backlog, que o curador atualiza a cada entrega — repetir o número aqui garante que ele fique errado. Antes de implementar uma feature, procure o card correspondente — ele traz as decisões já tomadas e as armadilhas mapeadas. Card novo segue o [modelo](docs/backlog/_modelo-card.md).

## Fluxos principais (visão de 10 segundos)

- **Auth**: registro/login → JWT no header `Authorization` (REST) e no handshake do socket.
- **Mesa**: mestre cria mesa → convida por email (Resend, token de uso único) → convidado aceita e vira jogador.
- **Jogo em tempo real**: cliente conecta socket → `entrarNaMesa(mesaId)` (autoriza participação) → sala `mesa:{id}` recebe `mensagem:nova`, `token:atualizado`, `cena:ativada`.
- **Dados**: expressão (`4d6kh3+2`) validada pelo VO `ExpressaoDados` → `ServicoRolagemDados` (RNG injetável) → mensagem de rolagem persistida e broadcast.
