# 🎲 RolaVinte

Plataforma de RPG de mesa online em PT-BR — um clone evoluído do Roll20: mesas (campanhas), tabletop com grid e tokens em tempo real, chat com rolagem de dados, fichas de personagem e convites por email.

## Stack

- **Frontend**: React 19 · Vite 6 · TypeScript · React Router 7 · TanStack Query 5 · Zustand 5 · Tailwind CSS 4 · Socket.IO client
- **Backend**: Node 22+ (ESM) · Fastify 5 · Socket.IO 4 · Zod · JWT + bcrypt — monolito com Clean Architecture + DDD
- **Banco**: Supabase (Postgres), acessado exclusivamente pelo backend
- **Email**: Resend (com fallback console em desenvolvimento)

## Como rodar

1. **Instale as dependências** (Node ≥ 22):

   ```bash
   npm install
   ```

2. **Configure o Supabase**: crie um projeto em [supabase.com](https://supabase.com), abra o SQL Editor e execute, em ordem, os arquivos de `apps/api/supabase/migrations/`.

3. **Configure o ambiente**: copie `.env.example` para `apps/api/.env` e preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `JWT_SEGREDO`. `RESEND_API_KEY` é opcional — sem ela, os emails de convite aparecem no console da API.

4. **Suba tudo**:

   ```bash
   npm run dev
   ```

   - Web: http://localhost:5173
   - API: http://localhost:3333 (health check em `/api/saude`)

## Comandos

| Comando | Efeito |
|---|---|
| `npm run dev` | API + Web em paralelo |
| `npm run lint` | ESLint (estilo + fronteiras de arquitetura); zero aviso tolerado |
| `npm run lint:fix` | Aplica as correções automáticas do ESLint |
| `npm run format` | Formata o código com o Prettier |
| `npm run format:check` | Verifica a formatação sem alterar arquivos |
| `npm run check` | Lint + typecheck de todos os workspaces |
| `npm run test` | Testes (Vitest) dos três workspaces — shared, api e web |
| `npm run build` | Build de produção |

O `npm run lint` transforma os guardrails de [.claude/rules/01-arquitetura.md](.claude/rules/01-arquitetura.md) em erro de build: `dominio/` e `aplicacao/` não compilam com `fastify`, `@supabase/*`, `resend` ou `socket.io`, `apresentacao/` não alcança `infra/`, e `components/ui` não importa `lib/socket`. A prova de que cada fronteira realmente dispara é automatizada em `apps/api/src/testes/fronteiras-arquitetura.test.ts`.

## Funcionalidades

- ✅ Registro e login (JWT)
- ✅ Criação de mesas com sistema de RPG (D&D 5e, Tormenta20, Ordem Paranormal, genérico)
- ✅ Convite de jogadores por email (Resend) com token de uso único
- ✅ Gestão de convites: lista com status (pendente/aceito/revogado) e revogação que invalida o link na hora
- ✅ Ciclo de vida da mesa: remover jogador, sair da mesa, editar nome/descrição/sistema e encerrar (a mesa fica arquivada em somente leitura, com o histórico legível)
- ✅ Tabletop com grid, cenas e tokens arrastáveis em tempo real (Socket.IO)
- ✅ Gerenciador de cenas: criar, renomear, excluir e ativar em um clique (com o motivo escrito quando a exclusão é recusada)
- ✅ Imagem de fundo da cena por upload (PNG/JPEG/WebP, até 8 MB) e grid configurável: tamanho de célula, visibilidade e cor
- ✅ Zoom e pan no tabletop (Ctrl + roda, botão do meio, barra de espaço e botões com `aria-label`), com o arrasto de token acertando a célula em qualquer escala
- ✅ Tokens editáveis pelo mestre: nome, cor e arte por upload, com fallback de iniciais quando a imagem falha
- ✅ Barra de vida no token vinculada à ficha do personagem, atualizada ao vivo por evento WS — sem PV duplicado no token
- ✅ Chat da mesa com rolagem de dados: `/r 2d20kh1+5 # ataque com vantagem`
- ✅ Motor de dados com vantagem/desvantagem (`kh`/`kl`), multi-termos e RNG injetável
- ✅ Fichas de personagem (atributos d20, PV, anotações) com testes de atributo em 1 clique
- ✅ Contrato de eventos WS aplicado nos dois lados: evento novo sem ouvinte no front derruba a suíte, em vez de falhar em silêncio
- ✅ Autorização de domínio: só o mestre cria cenas/tokens, gere convites, remove jogadores, edita e encerra a mesa; jogador move apenas tokens dos próprios personagens
- ✅ Endurecimento da API: cabeçalhos do helmet, rate limit (300 req/min global, 10 req/min em login e registro), body limit de 256 KB, erro global `{ erro, requisicaoId }` em PT-BR e logs com segredos redigidos

## Backlog

O caminho do MVP atual até a plataforma completa está em [docs/backlog/](docs/backlog/README.md) — 14 épicos e 89 cards (21 concluídos), organizados em três ondas (mesa jogável → paridade com o Roll20 → operação). Os cards novos nascem das descobertas de cada entrega, então a contagem cresce junto com o que já foi feito.

## Arquitetura

Monorepo npm workspaces. Regras completas em [CLAUDE.md](CLAUDE.md) e nos guardrails de [.claude/rules/](.claude/rules/).

```
packages/shared   contratos Zod + tipos + motor de dados (fonte única de verdade api ↔ web)
apps/api          dominio/ → aplicacao/ → infra/ + apresentacao/ (a regra de dependência aponta para dentro)
apps/web          features/ (auth, mesas, jogo, personagens) + lib/ + components/ui
```
