# Guardrail: Arquitetura Geral (Clean Architecture + Monolito Modular)

## Visão

O RolaVinte é um **monolito modular** com fronteiras estritas entre camadas, organizado em monorepo npm workspaces:

```
apps/api        → Backend Node (Fastify) — Clean Architecture + DDD
apps/web        → Frontend React — feature-sliced
packages/shared → Contratos compartilhados (schemas Zod, tipos, motor de dados)
```

## A Regra de Dependência (inviolável)

As dependências apontam **sempre para dentro**. Camadas externas conhecem as internas; o inverso é proibido.

```
presentation → application → domain
infrastructure → application (implementa ports) → domain
```

| Camada | Pode importar de | NUNCA importa de |
|---|---|---|
| `domain/` | somente `domain/` e `packages/shared` | application, infrastructure, presentation, frameworks |
| `application/` | `domain/`, `shared` | infrastructure, presentation, fastify, supabase, resend |
| `infrastructure/` | `application/ports`, `domain/` | presentation |
| `presentation/` | `application/`, `domain/` (tipos), `shared` | infrastructure (exceto no composition root) |

## Composition Root

- Toda a montagem de dependências acontece **exclusivamente** em `apps/api/src/main.ts` (e módulos `container.ts`).
- Use cases recebem dependências via **injeção por construtor** (interfaces/ports), nunca instanciam infraestrutura.
- Proibido `import { supabase } from ...` dentro de use case ou entidade.

## Ports & Adapters

- Todo acesso externo (banco, email, relógio, ids, websocket broadcast) passa por uma **port** (interface TypeScript) declarada em `application/ports/`.
- Implementações concretas vivem em `infrastructure/` e são adapters: `SupabaseMesaRepository`, `ResendServicoEmail`, etc.
- Teste de sanidade: o diretório `application/` deve compilar sem `node_modules` de fastify/supabase/resend.

## Erros

- Domínio e aplicação retornam `Result<T, ErroDominio>` — nunca lançam exceções para controle de fluxo.
- Exceções são reservadas para bugs/estados impossíveis.
- A camada HTTP converte `ErroDominio` em status codes num único lugar (`presentation/http/erros.ts`).

## O que rejeitar em code review

- Import de framework em `domain/` ou `application/`.
- Lógica de negócio em rota/controller/handler de socket.
- Query SQL/supabase fora de `infrastructure/`.
- Use case chamando outro use case por atalho de infraestrutura (use composição via ports/eventos).
