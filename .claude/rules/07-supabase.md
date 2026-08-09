# Guardrail: Banco de Dados (Supabase/Postgres)

## Papel do Supabase no projeto

- Supabase é usado como **Postgres gerenciado** (+ Storage futuramente). O acesso é **exclusivamente pelo backend** com `SUPABASE_SERVICE_ROLE_KEY`.
- O frontend **nunca** fala com o Supabase diretamente — toda autorização é regra de domínio no monolito.
- RLS fica habilitado com política "deny all" para anon/authenticated como defesa em profundidade.

## Convenções de schema

- Tabelas e colunas em PT-BR `snake_case`: `usuarios`, `mesas`, `mesa_jogadores`, `convites`, `personagens`, `cenas`, `tokens`, `mensagens`.
- Toda tabela: `id uuid primary key`, `criado_em timestamptz not null default now()`; mutáveis também `atualizado_em`.
- FKs sempre com `references ... on delete` explícito (pense na cascata: apagar mesa apaga cenas, tokens, mensagens).
- Enums de domínio como `text` + `check constraint` (mais fácil de evoluir que enum nativo).
- Índices para todo padrão de acesso real (ex.: `mensagens(mesa_id, criado_em)`).

## Migrations

- Arquivos em `apps/api/supabase/migrations/NNNN_descricao.sql`, ordenados, idempotência não requerida, **imutáveis após aplicados**.
- Toda mudança de schema = nova migration + atualização dos mappers em `infra/supabase`.

## Repositórios

- Mapeamento row↔entidade em arquivos `*.mapper.ts`; o domínio nunca vê um row do Supabase.
- Erros do supabase-js são convertidos para `ErroDominio` (ex.: unique violation → `Conflito`).
- Sem N+1: buscas de agregado carregam filhos com `in ()`/joins, não loops de query.
- Nunca usar `select('*')` em código de produção — liste colunas.
