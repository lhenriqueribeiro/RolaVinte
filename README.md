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
| `npm run docs:verificar` | Confere a documentação: caminho citado como link, comando `npm run X` e fato volátil fora de casa |
| `npm run typecheck` | `tsc --noEmit` nos três workspaces |
| `npm run check` | Lint + `docs:verificar` + `typecheck` — **é este o comando obrigatório antes de entregar** |
| `npm run test` | Testes (Vitest) dos três workspaces — shared, api e web |
| `npm run build` | Build de produção |
| `npm run supabase:sql -w @rolavinte/api` | Imprime o SQL de instalação (migrations em ordem + buckets), derivado dos arquivos reais |
| `npm run supabase:migrar -w @rolavinte/api` | Aplica as migrations pendentes, em ordem, registrando cada uma |
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
- ✅ Ficha de Pathfinder 2e que calcula sozinha: 16 perícias somando modificador + proficiência e rolando em um clique com o motivo no chat, e as ações que exigem treinamento listadas como indisponíveis com o motivo escrito
- ✅ Atributo com **uma casa só** em todo sistema: o número fica na coluna comum e o que varia por sistema é a **escala** declarada na definição (1..30 com bônus `(valor − 10) / 2` no d20 clássico, −5..+8 no PF2e) — valor fora da escala é recusado em PT-BR nomeando atributo, valor e faixa, e nenhum sistema pode declarar na ficha um campo com nome de coluna comum
- ✅ Saber de PF2e como família de perícias: o jogador cria quantas especializações quiser ("Saber (Guerra)" treinado e "Saber (Náutico)" destreinado convivem com bônus diferentes), cada uma em sua linha, sem nenhum caso especial de sistema na tela
- ✅ Motor de regras de PF2e em funções puras: proficiência com o destreinado **sem somar o nível**, grau de sucesso com o 20/1 natural deslocando **um grau** (não decidindo o resultado), CDs simples e por nível, e empilhamento de modificadores por tipo
- ✅ Grau de sucesso no chat: `/r 1d20+11 cd 18` numa mesa de PF2e sai como "Sucesso crítico · contra CD 18" para todos, com o ajuste do 20/1 natural explicado em texto (nada só por cor) — a CD chega pelo sufixo `cd N` de quem digita ou como número de quem clica na ficha, sem CD padrão em lugar nenhum, e sistema que não avalia grau recusa a CD dizendo o nome do sistema
- ✅ Defesas de PF2e calculadas na ficha: CA (com bônus de item e limite de Destreza, em que "sem limite" é diferente de "limite 0"), Fortitude, Reflexos, Vontade, Percepção e CD de classe — as roláveis rolam em um clique, nenhum número derivado é gravado, e a CD de classe se recusa a existir sem o atributo-chave em vez de escolher um por conta própria
- ✅ Ataques de PF2e com penalidade de ataques múltiplos: três botões de acerto (`1d20+9` / `-5` / `-10`, ou `-4` / `-8` com arma ágil) e dois de dano, com a CA do alvo virando grau de sucesso no chat — o dano nunca é checado contra CD, o crítico dobra em botão próprio e **a plataforma não conta os seus ataques**: a ordem é escolha explícita do jogador
- ✅ Combate conduzido pela plataforma: o mestre escolhe as peças, a ordem de iniciativa se monta sozinha (desempate estável por ordem de entrada, com a regra escrita na tela), o turno anda, a rodada vira e o chat anuncia "Rodada 2" para todos — encerrar preserva o histórico da luta em vez de apagá-lo
- ✅ Iniciativa como resposta do **sistema**, não do combate: em Pathfinder 2e é a Percepção da ficha (com as 16 perícias como alternativas para a cena que pede Furtividade), em D&D 5e é Destreza, e a peça sem ficha entra com o número que o mestre digita — o cliente escolhe *qual* rolagem, nunca a expressão
- ✅ Painel de iniciativa visível a todos os participantes, com "é a sua vez" em três canais e **nenhum deles a cor** (marca de acessibilidade no item, a palavra escrita e aviso em `aria-live`), e a peça do turno realçada no mapa com rótulo textual — a moldura dourada é só reforço
- ✅ Dano e cura por participante no painel do mestre, sem PV duplicado em lugar nenhum: quem chega a 0 PV recebe o marcador de `inconsciente` na peça, quem é curado o perde, e o jogador continua editando o PV na própria ficha
- ✅ Condições de token: 14 marcadores que o mestre liga e desliga, visíveis para a mesa na hora com ícone **e** rótulo em texto — o catálogo vive em um único lugar, então condição nova é uma entrada num objeto, sem `if` em caso de uso, componente ou SQL
- ✅ Atribuição OGL 1.0a / Community Use da Paizo exibida na ficha de Pathfinder, montada a partir do dado da definição do sistema — nenhuma tela escreve o texto legal à mão
- ✅ Lista de sistemas de RPG amarrada ao banco: o `check` de `mesas.sistema` é extraído das migrations em disco e comparado com o enum nas duas direções, offline — sistema novo sem migration (ou migration sem sistema) derruba a suíte com o SQL da próxima migration já escrito na mensagem
- ✅ Reconexão resiliente: queda de rede não pede F5 — a mesa avisa o estado, bloqueia a escrita com o motivo escrito (sem perder o texto digitado) e ressincroniza os caches ao voltar
- ✅ Estados de carregamento, erro e vazio padronizados em toda a interface, com notificações em `aria-live` e botão de "Tentar novamente"
- ✅ Contrato de eventos WS aplicado nos dois lados: evento novo sem ouvinte no front — ou sem publicador no servidor — derruba a suíte, em vez de falhar em silêncio
- ✅ Preparo de ambiente verificável: `supabase:sql` gera o SQL de instalação a partir das migrations reais e `supabase:verificar` confere schema e Storage antes de a API subir
- ✅ Autorização de domínio: só o mestre cria cenas/tokens, gere convites, remove jogadores, edita e encerra a mesa; jogador move apenas tokens dos próprios personagens
- ✅ Endurecimento da API: cabeçalhos do helmet, rate limit (300 req/min global, 10 req/min em login e registro), body limit de 256 KB, erro global `{ erro, requisicaoId }` em PT-BR e logs com segredos redigidos

## Backlog

O caminho do MVP atual até a plataforma completa está em [docs/backlog/](docs/backlog/README.md), organizado em três ondas (mesa jogável → paridade com o Roll20 → operação). A **ordem de execução** vive em [docs/backlog/sprints.md](docs/backlog/sprints.md): objetivo, cards fechados e versão de cada sprint.

Cards novos nascem das descobertas de cada entrega, então o total cresce junto com o que já foi feito — a contagem atual fica no próprio backlog, atualizada pelo curador a cada sprint.

O histórico de versões, com o que mudou e o que ainda não funciona, está em [docs/release-notes/](docs/release-notes/README.md) — a mais recente é a [v0.9.0](docs/release-notes/v0.9.0.md).

## Arquitetura

Monorepo npm workspaces. Regras completas em [CLAUDE.md](CLAUDE.md) e nos guardrails de [.claude/rules/](.claude/rules/).

```
packages/shared   contratos Zod + tipos + motor de dados (fonte única de verdade api ↔ web)
apps/api          dominio/ → aplicacao/ → infra/ + apresentacao/ (a regra de dependência aponta para dentro)
apps/web          features/ (auth, mesas, jogo, personagens) + lib/ + components/ui
```
