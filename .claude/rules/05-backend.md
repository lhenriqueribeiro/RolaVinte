# Guardrail: Backend (apps/api)

## Stack

- **Runtime**: Node.js ≥ 22, ESM (`"type": "module"`), TypeScript estrito.
- **HTTP**: Fastify 5. **Tempo real**: Socket.IO 4. **Validação**: Zod (schemas vêm de `packages/shared`).
- **Auth**: JWT próprio (access token) + hash de senha com bcrypt. Segredos via env.
- **Banco**: Supabase (Postgres) via `@supabase/supabase-js` com `SERVICE_ROLE` — o backend é a única fronteira com o banco (RLS não substitui autorização de domínio).
- **Email**: Resend via port `ServicoEmail`.

## Estrutura obrigatória

```
apps/api/src/
  config/            env tipado e validado (Zod) — único lugar que lê process.env
  dominio/
    compartilhado/   Entidade, ValueObject, Result, ErroDominio, EventoDominio
    <contexto>/      entidades, VOs, eventos, serviços de domínio
  aplicacao/
    ports/           interfaces: repositórios, ServicoEmail, ServicoToken, EventBus...
    <contexto>/      use cases (1 classe = 1 caso de uso, método executar())
  infra/
    supabase/        client + repositórios + mappers row↔entidade
    email/           ResendServicoEmail
    auth/            JwtServicoToken, BcryptServicoSenha
    eventos/         EventBusEmMemoria
  apresentacao/
    http/            rotas Fastify, middlewares, tradução de erros
    ws/              gateway Socket.IO (salas por mesa)
  testes/            harness de contrato + fakes em memória de todas as ports
  app.ts             criarServidorHttp() e registrarRotas() — montagem HTTP testável
  main.ts            composition root: env, infra real, socket, listen
```

**Por que a montagem HTTP saiu do `main.ts`:** o publicador de eventos depende do `io`, que depende do `app.server` — um `criarApp(deps)` único cairia em ciclo. `criarServidorHttp` cria o Fastify; `registrarRotas` recebe os casos de uso já montados. É isso que permite subir a API em teste sem Supabase nem Socket.IO.

## Regras

- `process.env` só em `config/env.ts`. Env inválido → processo não sobe (fail fast).
- Toda rota: schema Zod de entrada → use case → mapa de erro central. Sem try/catch ad hoc por rota.
- Use case retorna `Result`; rota converte: `NaoAutorizado→403`, `NaoEncontrado→404`, `Validacao→400`, `Conflito→409`.
- Socket.IO: cliente entra na sala `mesa:{id}` **somente** após verificação de participação. Todo evento recebido passa por Zod antes do use case.
- Logs estruturados (logger do Fastify). Nunca logar senha, hash, token ou corpo de email.
- IDs: UUID v4 gerados pela aplicação (port `GeradorId`), não pelo banco — entidades nascem completas.

## Migrations

- SQL versionado em `supabase/migrations/NNNN_nome.sql`. Nunca alterar migration aplicada; sempre criar a próxima.
- Schema em PT-BR snake_case (`mesas`, `personagens`, `mesa_jogadores`).
