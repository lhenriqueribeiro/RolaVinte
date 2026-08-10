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

2. **Prepare o Supabase**: crie um projeto em [supabase.com](https://supabase.com), gere o SQL de instalação e cole no SQL Editor:

   ```bash
   npm run supabase:sql -w @rolavinte/api
   ```

   A saída são as migrations em ordem mais o provisionamento dos buckets de Storage (`mapas` e `tokens`). Ela é derivada dos arquivos reais, então não desatualiza. **Migrations são imutáveis depois de aplicadas** — rode isto só em projeto novo; para um projeto que já tem parte aplicada, execute apenas os arquivos que faltam.

3. **Configure o ambiente**: copie `.env.example` para `apps/api/.env` e preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `JWT_SEGREDO`.

   > ⚠️ **Tem que ser a chave secreta** (`sb_secret_…`, ou `service_role` num projeto legado), em *Project Settings → API Keys*. A chave **publicável** (`sb_publishable_…`, antiga `anon`) não serve: o RLS está em deny-all para `anon`/`authenticated`, então a API subiria com todas as consultas vazias. A partida recusa a chave errada com essa explicação, em vez de deixar você descobrir depois.

   `RESEND_API_KEY` é opcional — sem ela, os emails de convite aparecem no console da API.

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
| `npm run supabase:sql -w @rolavinte/api` | Imprime o SQL de instalação (migrations em ordem + buckets), derivado dos arquivos reais |
| `npm run supabase:verificar -w @rolavinte/api` | Confere schema e Storage do projeto apontado pelo `.env` antes de a API subir |

O `npm run lint` transforma os guardrails de [.claude/rules/01-arquitetura.md](.claude/rules/01-arquitetura.md) em erro de build: `dominio/` e `aplicacao/` não compilam com `fastify`, `@supabase/*`, `resend` ou `socket.io`, `apresentacao/` não alcança `infra/`, e `components/ui` não importa `lib/socket`. A prova de que cada fronteira realmente dispara é automatizada em `apps/api/src/testes/fronteiras-arquitetura.test.ts`.

## Funcionalidades

- ✅ Registro e login (JWT)
- ✅ Criação de mesas com sistema de RPG (D&D 5e, Pathfinder 2e, Tormenta20, Ordem Paranormal, genérico)
- ✅ Convite de jogadores por email (Resend) com token de uso único
- ✅ Gestão de convites: lista com status (pendente/aceito/revogado) e revogação que invalida o link na hora
- ✅ Ciclo de vida da mesa: remover jogador, sair da mesa, editar nome/descrição/sistema e encerrar (a mesa fica arquivada em somente leitura, com o histórico legível)
- ✅ Tabletop com grid, cenas e tokens arrastáveis em tempo real (Socket.IO)
- ✅ Gerenciador de cenas: criar, renomear, excluir e ativar em um clique (com o motivo escrito quando a exclusão é recusada)
- ✅ Imagem de fundo da cena por upload (PNG/JPEG/WebP, até 8 MB) e grid configurável: tamanho de célula, visibilidade e cor
- ✅ Zoom e pan no tabletop (Ctrl + roda, botão do meio, barra de espaço e botões com `aria-label`), com o arrasto de token acertando a célula em qualquer escala
- ✅ Tokens editáveis pelo mestre: nome, cor e arte por upload, com fallback de iniciais quando a imagem falha
- ✅ Barra de vida no token vinculada à ficha do personagem, atualizada ao vivo por evento WS — sem PV duplicado no token
- ✅ Arte de token e mapa apagados do Storage ao excluir o token ou a cena (falha de Storage não desfaz a exclusão)
- ✅ Encolher o grid deixando peças fora do mapa é recusado, dizendo quantas são — nenhum token é movido sem o mestre pedir
- ✅ Chat da mesa com registry de comandos: `/r 2d20kh1+5 # ataque com vantagem`, `/sussurro @Fulano …`, `/oculto 1d20`, com aliases e aviso em PT-BR para comando desconhecido ou incompleto
- ✅ Sussurro entre participantes e rolagem oculta do mestre, com a visibilidade filtrada no banco (não na tela) e rótulo textual explícito em cada mensagem privada
- ✅ Motor de dados com vantagem/desvantagem (`kh`/`kl`), multi-termos e RNG injetável
- ✅ Fichas de personagem (atributos, PV, anotações) com teste de atributo em 1 clique, usando o dado que o sistema define
- ✅ Ficha extensível por sistema de RPG: cada sistema declara a própria ficha (campos, seções, perícias e graus) num registro único em `packages/shared/src/sistemas/`, e a tela renderiza a partir dele — sistema novo não pede `switch (sistema)` em schema, caso de uso ou componente, e campo fora da definição é recusado nomeando o campo
- ✅ Perícias e proficiência de D&D 5e: 18 perícias, três graus de treinamento (rótulo textual, nunca só cor), bônus de proficiência por nível e rolagem de perícia em 1 clique com o motivo no chat (`Furtividade — Thorin`)
- ✅ Excluir e duplicar ficha (dono ou mestre), com confirmação acessível — a cópia continua pertencendo ao dono do original e o token vinculado sobrevive no mapa, desvinculado
- ✅ Histórico do chat paginado por cursor na API (`?antesDe`&`antesDeId`&`limite`), com a visibilidade de sussurro e rolagem oculta preservada em toda página — a rolagem infinita na tela ainda não existe
- ✅ Fronteira de licenciamento do Pathfinder 2e verificada por teste: teto de semente, atribuição obrigatória junto do dado e conteúdo barrado enquanto o documento de licença estiver incompleto
- ✅ Ficha de Pathfinder 2e que calcula sozinha: modificadores de atributo em −5..+8 gravados direto (o sistema ignora as colunas 1..30), 16 perícias somando modificador + proficiência e rolando em um clique com o motivo no chat, e as ações que exigem treinamento listadas como indisponíveis com o motivo escrito
- ✅ Saber de PF2e como família de perícias: o jogador cria quantas especializações quiser ("Saber (Guerra)" treinado e "Saber (Náutico)" destreinado convivem com bônus diferentes), cada uma em sua linha, sem nenhum caso especial de sistema na tela
- ✅ Motor de regras de PF2e em funções puras: proficiência com o destreinado **sem somar o nível**, grau de sucesso com o 20/1 natural deslocando **um grau** (não decidindo o resultado), CDs simples e por nível, e empilhamento de modificadores por tipo — pronto para o grau de sucesso no chat, que ainda não está ligado
- ✅ Atribuição OGL 1.0a / Community Use da Paizo exibida na ficha de Pathfinder, montada a partir do dado da definição do sistema — nenhuma tela escreve o texto legal à mão
- ✅ Lista de sistemas de RPG amarrada ao banco: o `check` de `mesas.sistema` é extraído das migrations em disco e comparado com o enum nas duas direções, offline — sistema novo sem migration (ou migration sem sistema) derruba a suíte com o SQL da próxima migration já escrito na mensagem
- ✅ Reconexão resiliente: queda de rede não pede F5 — a mesa avisa o estado, bloqueia a escrita com o motivo escrito (sem perder o texto digitado) e ressincroniza os caches ao voltar
- ✅ Estados de carregamento, erro e vazio padronizados em toda a interface, com notificações em `aria-live` e botão de "Tentar novamente"
- ✅ Contrato de eventos WS aplicado nos dois lados: evento novo sem ouvinte no front — ou sem publicador no servidor — derruba a suíte, em vez de falhar em silêncio
- ✅ Preparo de ambiente verificável: `supabase:sql` gera o SQL de instalação a partir das migrations reais e `supabase:verificar` confere schema e Storage antes de a API subir
- ✅ Autorização de domínio: só o mestre cria cenas/tokens, gere convites, remove jogadores, edita e encerra a mesa; jogador move apenas tokens dos próprios personagens
- ✅ Endurecimento da API: cabeçalhos do helmet, rate limit (300 req/min global, 10 req/min em login e registro), body limit de 256 KB, erro global `{ erro, requisicaoId }` em PT-BR e logs com segredos redigidos

## Backlog

O caminho do MVP atual até a plataforma completa está em [docs/backlog/](docs/backlog/README.md) — 15 épicos e 98 cards (38 concluídos), organizados em três ondas (mesa jogável → paridade com o Roll20 → operação). Os cards novos nascem das descobertas de cada entrega, então a contagem cresce junto com o que já foi feito. A **ordem de execução** vive em [docs/backlog/sprints.md](docs/backlog/sprints.md): objetivo, cards fechados e versão de cada sprint.

O histórico de versões, com o que mudou e o que ainda não funciona, está em [docs/release-notes/](docs/release-notes/README.md) — a mais recente é a [v0.7.0](docs/release-notes/v0.7.0.md).

## Arquitetura

Monorepo npm workspaces. Regras completas em [CLAUDE.md](CLAUDE.md) e nos guardrails de [.claude/rules/](.claude/rules/).

```
packages/shared   contratos Zod + tipos + motor de dados (fonte única de verdade api ↔ web)
apps/api          dominio/ → aplicacao/ → infra/ + apresentacao/ (a regra de dependência aponta para dentro)
apps/web          features/ (auth, mesas, jogo, personagens) + lib/ + components/ui
```
