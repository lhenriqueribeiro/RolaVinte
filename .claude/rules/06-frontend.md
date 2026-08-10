# Guardrail: Frontend (apps/web)

## Stack

- **React 19** + **Vite 6** + TypeScript estrito.
- **Rotas**: React Router 7 (declarativo). **Server state**: TanStack Query 5. **Client state**: Zustand, só para estado de UI/jogo local.
- **Estilo**: Tailwind CSS 4 (tema escuro de mesa de RPG). Primitivos próprios em `components/ui`.
- **Tempo real**: socket.io-client encapsulado num módulo único, tipado pelo contrato do shared.
- **Contratos**: tipos e schemas vêm de `@rolavinte/shared`. O front **nunca** redeclara formato da API nem payload de evento.

## Estrutura (feature-sliced)

| Diretório | Conteúdo |
|---|---|
| `app/` | router, providers (QueryClient, tema) e guarda de rota autenticada |
| `components/ui/` | primitivos reutilizáveis, inclusive os estados padrão de carregando/vazio/erro |
| `features/<feature>/` | páginas, componentes, hooks de dados (`api.ts`) e stores da feature: `auth`, `mesas`, `jogo`, `personagens` |
| `lib/` | acesso HTTP (`api.ts`) e conexão de socket (`socket.ts`) — um módulo cada, e só um |
| `testes/` | setup do Vitest, utilitários de render e o socket falso |

Feature nova entra como diretório em `features/`, com o mesmo formato: um `api.ts` com os hooks, as telas ao lado, store só se houver estado efêmero de verdade.

## Regras

- **Server state ≠ client state.** Dado da API vive no TanStack Query; Zustand guarda o que não é do servidor (ferramenta selecionada, token sendo arrastado, sessão, estado da conexão). O mesmo dado nos dois é duas verdades ([10-verificabilidade.md](10-verificabilidade.md)).
- `queryKey` é `[recurso]` ou `[recurso, escopo]` — o escopo é o id da mesa quando o dado pertence a uma mesa. Chave nova segue o padrão; chave fora dele escapa das invalidações de quem já existe.
- Página não chama `fetch` direto: usa os hooks da feature, que usam o módulo de HTTP de `lib/`. Um lugar só para header de autenticação, tratamento de erro e upload.
- Evento de socket atualiza o **cache do Query** (`setQueryData`) ou uma store — nunca um `useState` paralelo que duplica o dado.
- **Cache mantido vivo por evento de socket precisa ser invalidado na reconexão.** Enquanto o socket esteve fora, os eventos que remendariam aquele cache foram entregues a ninguém, e o cliente não tem como saber o que perdeu. Cache novo escrito por handler entra também na lista de ressincronização — nem a mais (refetch inútil), nem a menos (tela mentindo até o F5).
- **Todo evento do contrato é assinado num hook só**, o do socket da mesa, com `off` na limpeza. Espalhar `socket.on` por outros hooks quebraria o teste de cobertura de ouvintes por falso positivo — e falso positivo é o pior defeito num teste cuja função é denunciar.
- Estado de carregando, vazio e erro usa os primitivos de `components/ui`. Texto próprio de carregamento ou de erro numa tela é rejeitado — e há teste varrendo o fonte para isso.
- Primitivo de `components/ui` não importa feature nem o módulo de socket: dependência de UI aponta para fora, e o lint barra as duas coisas.
- Todos os textos de UI em **PT-BR**, sem framework de i18n. String inline é aceitável.
- **Texto de UI é contrato com o usuário.** Antes de escrever "perde o acesso imediatamente" ou "somente leitura para todo mundo", verifique se o backend cumpre. Não cumpre? Mude o texto — promessa falsa é defeito (classe **F6** da [taxonomia](../../docs/agentes/taxonomia-de-falhas.md)).
- Acessibilidade mínima: elemento interativo é `button`/`a` de verdade, input tem `label`, foco visível.
- Sem `any`. Resposta da API é tipada pelos contratos do shared.

## Performance no tabletop

- Arrastar token é otimista e local (store do tabletop); a persistência e o broadcast acontecem no `pointerup`. Uma requisição por movimento de ponteiro derrubaria a sala.
- Re-render do grid não pode depender do chat: features isoladas e seletores finos na store.

## O que rejeitar em code review

- Formato da API ou payload de evento redeclarado no front.
- Dado do servidor guardado em `useState`/Zustand em paralelo ao Query.
- Evento novo do contrato sem ouvinte, ou ouvinte sem `off`.
- Cache alimentado por socket ausente da ressincronização de reconexão.
- Texto de carregando/erro inventado na tela em vez do primitivo padrão.
- Componente de `components/ui` importando feature ou socket.
- Texto de UI em inglês, ou prometendo o que o backend não faz.
