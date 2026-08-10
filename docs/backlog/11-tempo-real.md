# E11 — Tempo real e presença

O gateway atual autentica no handshake e autoriza a entrada na sala. Falta tudo o que mantém uma sessão de 3 horas de pé.

---

### RV-115 — Aplicar o contrato de eventos WS nos dois lados

**Épico:** E11 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Faça este primeiro do épico** — é mecânico e protege todo evento criado depois · **Status:** ✅ Concluído

> **Como ficou, e como criar um evento novo daqui em diante (4 passos obrigatórios):** (1) declare o
> evento em `EventosServidorParaCliente`; (2) o `Record<NomeEventoServidorParaCliente, true>` interno
> de [eventos-ws.ts](../../packages/shared/src/tipos/eventos-ws.ts) **para de compilar** até você
> registrar o nome — é a ponte tipo→valor que alimenta `EVENTOS_SERVIDOR_PARA_CLIENTE`; (3)
> `cobertura-eventos-ws.test.ts` fica vermelho nomeando o evento até existir `socket.on(...)` **e**
> `socket.off(...)` em `use-socket-mesa.ts`; (4) para publicar, acrescente o método à port
> `PublicadorEventosMesa` usando `PayloadEventoServidor<'seu:evento'>` e implemente nos **dois**
> (`PublicadorSocket` e `FakePublicadorEventosMesa`). O RV-042 exercitou o caminho inteiro: o evento
> `personagem:atualizado` nasceu e a suíte do web ficou vermelha até o ouvinte existir.
>
> **Precisão sobre o primeiro cenário:** **acrescentar** campo ao payload quebra só a api (o
> consumidor que lê um subconjunto continua válido — e está certo). Quem quebra os dois lados é
> **renomear ou remover** campo: trocar `tokenId` em `token:removido` apontou `publicador-socket.ts`
> na api e `use-socket-mesa.ts:69` no web. Não conclua que a proteção falhou ao testar com campo novo.
>
> **Assimetria que ficou de fora, de propósito:** nada exige que um evento do contrato tenha
> **publicador** no servidor — ver [RV-116](#rv-116--provar-que-todo-evento-do-contrato-tem-publicador-no-servidor).

**História**
> Como **mantenedor**, quero **que o compilador quebre quando um evento de socket mudar de forma ou ficar sem assinante**, para **que uma divergência entre api e web não atravesse `check`, `lint`, `test` e `build` sem ninguém perceber**.

**Contexto técnico**
- [eventos-ws.ts](../../packages/shared/src/tipos/eventos-ws.ts) se declara "única fonte de verdade para api e web" e hoje tem **zero consumidores**: [lib/socket.ts](../../apps/web/src/lib/socket.ts) devolve `Socket` cru, e [gateway-jogo.ts](../../apps/api/src/apresentacao/ws/gateway-jogo.ts) e [publicador-socket.ts](../../apps/api/src/apresentacao/ws/publicador-socket.ts) usam `Server`/`Socket` crus. Nenhum dos dois lados aplica os genéricos.
- O preço já foi pago: `mesa:participante-removido` (RV-021) nasceu publicado pelo servidor e **sem listener no cliente**; o jogador removido continuava com a mesa renderizada até dar F5. Nada acusou — nem tipo, nem lint, nem teste. Houve também divergência de payload: o handler de `token:removido` no front declarava `{ tokenId }` enquanto o contrato declara `{ tokenId; cenaId }`.
- Enquanto os genéricos não forem aplicados, **todo evento novo pode nascer órfão do mesmo jeito** — e o backlog adiciona vários (RV-110 presença, RV-111 digitação, RV-113 ping, RV-025 `mesa:mestre-alterado`).
- **Armadilha (a razão de isto ainda não estar feito):** o `GatewayJogo` recebe os payloads de entrada como `unknown` **de propósito**, para validar com Zod antes de chamar o use case ([05-backend.md](../../.claude/rules/05-backend.md)). Tipar `Server<EventosClienteParaServidor, ...>` colide com isso. Saída sugerida: declarar no shared um contrato de **entrada bruta** (mesmos nomes de evento, payload `unknown`) usado pelo servidor, mantendo o contrato tipado para o sentido servidor→cliente e para o cliente. **Tipo não substitui validação: o cliente é hostil e o Zod continua obrigatório.**
- Nem o TypeScript nem o lint conseguem exigir que exista um `on(...)` para cada evento do contrato — por isso o card pede também um teste de cobertura de eventos.

**Escopo**
- `packages/shared/src/tipos/eventos-ws.ts`: contrato de entrada bruta + lista de nomes de eventos servidor→cliente exportada como valor (para o teste de cobertura)
- `apps/web/src/lib/socket.ts`: `Socket<EventosServidorParaCliente, EventosClienteParaServidor>`
- `apps/web/src/features/jogo/use-socket-mesa.ts`: remover os payloads declarados inline
- `apps/api/src/apresentacao/ws/gateway-jogo.ts` e `publicador-socket.ts`: `Server`/`Socket` parametrizados
- `apps/api/src/aplicacao/ports/infraestrutura.ts`: assinaturas de `PublicadorEventosMesa` alinhadas ao contrato
- `apps/web/src/features/jogo/cobertura-eventos-ws.test.ts` (novo)

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — payload divergente não compila
  Dado que eu acrescentar um campo ao payload de "token:removido" em @rolavinte/shared
  Quando eu rodar "npm run check"
  Então o comando falha apontando o publicador na api e o handler no web

Cenário: Evento sem assinante é denunciado
  Dado um evento novo declarado em EventosServidorParaCliente
  Quando eu rodar "npm run test"
  Então o teste de cobertura de eventos falha nomeando o evento sem listener no cliente

Cenário: Autorização e validação continuam no servidor
  Dado um cliente que emite "mesa:entrar" com um número em vez de um id
  Quando o gateway receber o evento
  Então o ack devolve { ok: false } com mensagem em PT-BR
  E nenhum caso de uso ou repositório é chamado

Cenário: Borda — evento de outra mesa é ignorado
  Dado que estou na mesa A
  Quando chegar um evento carimbado com a mesa B
  Então nada é escrito no cache da mesa A
```

**Testes obrigatórios**
- Front: teste que compara a lista de eventos servidor→cliente do contrato com os ouvintes efetivamente registrados por `use-socket-mesa` — quebra ao adicionar evento sem assinante.
- WS: payload inválido em `mesa:entrar` continua recusado pelo Zod, sem tocar em repositório.
- A suíte existente segue verde: a mudança é de tipos, não de comportamento.

**DoD específico**
- [ ] `Socket`/`Server` sem parâmetros de tipo não aparecem mais em `lib/socket.ts`, `gateway-jogo.ts` e `publicador-socket.ts`.
- [ ] Nenhum payload de evento redeclarado fora de `@rolavinte/shared` (varredura registrada no PR).
- [ ] Toda entrada do cliente continua validada por Zod — a tipagem não removeu nenhuma validação.

---

### RV-116 — Provar que todo evento do contrato tem publicador no servidor

**Épico:** E11 · **Depende de:** RV-115 · **Tamanho:** P · **Onda:** 2 · **Status:** ✅ Concluído

> **Como ficou.** O teste é [apps/api/src/testes/cobertura-publicador-ws.test.ts](../../apps/api/src/testes/cobertura-publicador-ws.test.ts)
> — em `src/testes/`, e não em `apresentacao/ws/` como o Escopo abaixo previa, porque é ali que
> moram os testes transversais do repositório (fronteiras de arquitetura, endurecimento HTTP) e
> porque foi a área de posse exclusiva atribuída na fase. Nenhum mapa novo foi para
> `aplicacao/ports/infraestrutura.ts`: o `Record<NomeEventoServidorParaCliente, (p) => void>` vive no
> próprio teste, com cada entrada **executando** o adapter real `PublicadorSocket` contra um `io`
> falso — assim a asserção é sobre o nome que sai no fio, não sobre o nome do método.
>
> **O experimento (obrigatório para teste protetor).** Um evento `combate:turno-alterado` foi
> declarado no contrato sem publicador: `npm run test` ficou vermelho em duas asserções, ambas
> nomeando o evento ("…que ninguém emite: combate:turno-alterado" e "Publicar
> \"combate:turno-alterado\" … colocou no fio nada"), e `npm run check` **também** quebrou
> (`Property '"combate:turno-alterado"' is missing … in type 'Record<keyof
> EventosServidorParaCliente, …>'`). Diferença relevante em relação ao RV-115, onde o experimento
> revelou `check` verde com evento órfão: aqui as duas portas fecham.
>
> **Decisão registrada (a que o card pedia por escrito):** todo evento servidor→cliente é assinado em
> `use-socket-mesa` **e só nele** — a regra e o porquê estão no topo de
> [cobertura-eventos-ws.test.ts](../../apps/web/src/features/jogo/cobertura-eventos-ws.test.ts).
>
> **Ainda descoberto, de propósito:** método de publicação que existe e que nenhum caso de uso chama.
> O contrato tem publicador, mas ninguém puxa o gatilho.

**História**
> Como **mantenedor**, quero **que um evento declarado e nunca emitido seja denunciado por teste**, para **fechar o lado do contrato de eventos que o RV-115 deixou aberto**.

**Contexto técnico**
- O RV-115 fechou **um** lado: [cobertura-eventos-ws.test.ts](../../apps/web/src/features/jogo/cobertura-eventos-ws.test.ts) prova que todo evento de `EVENTOS_SERVIDOR_PARA_CLIENTE` tem ouvinte no cliente, e o `emit` tipado impede nome inexistente e payload errado.
- Falta o **órfão ao contrário**: um evento pode existir no contrato, ganhar listener no front e **nunca ser emitido por ninguém**. Na tela o sintoma é idêntico ao do órfão original — nada acontece — e nenhum tipo, lint ou teste acusa.
- O gancho já existe e é barato: comparar `EVENTOS_SERVIDOR_PARA_CLIENTE` com os eventos que o publicador sabe emitir. A união `EventoPublicado` do [fake-publicador-eventos-mesa.ts](../../apps/api/src/testes/fakes/fake-publicador-eventos-mesa.ts) já é derivada do contrato, e `PublicadorSocket` é o adapter real — o teste vive na api, não no web.
- **Decisão pendente que este card deve registrar por escrito:** o teste de cobertura do front inspeciona os ouvintes de **`use-socket-mesa` e só dele**. Se um evento futuro for assinado em outro hook (um `use-socket-personagens`, por exemplo), ele será acusado como órfão estando tratado — falso positivo. Duas saídas de poucas linhas: **assinar tudo em `use-socket-mesa`** (o que a arquitetura sugere, já que a sala é uma só) ou montar os dois hooks no teste antes de comparar. Decida **antes** de espalhar hooks de socket, e escreva a decisão no topo do arquivo de teste.
- **Armadilha:** o teste não pode virar leitura de código-fonte por regex. Compare **símbolos** (nomes de método da port × nomes de evento do contrato), como o do front faz com os ouvintes registrados num socket falso.

**Escopo**
- `apps/api/src/testes/cobertura-publicador-ws.test.ts` (novo — caminho corrigido na entrega; ver a nota acima)
- `apps/api/src/aplicacao/ports/infraestrutura.ts`: se necessário, um mapa `evento → método` explícito para o teste comparar sem adivinhar nome
- `apps/web/src/features/jogo/cobertura-eventos-ws.test.ts`: comentário com a decisão sobre o escopo dos hooks

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — evento sem publicador é denunciado
  Dado um evento novo declarado em EventosServidorParaCliente
  E nenhum método correspondente em PublicadorEventosMesa
  Quando eu rodar "npm run test"
  Então o teste falha nomeando o evento que ninguém emite

Cenário: Autorização — a cobertura não afrouxa o gateway
  Dado um cliente que emite "mesa:entrar" com um payload hostil
  Quando o gateway receber o evento
  Então o ack continua { ok: false } em PT-BR, nenhum repositório é consultado
  E o socket não entra em sala alguma

Cenário: Borda — publicador com método sobrando
  Dado um método de publicação para um evento que não existe no contrato
  Quando eu rodar "npm run check"
  Então o comando falha — o payload não tem de onde ser derivado
```

**Testes obrigatórios**
- API: comparação entre `EVENTOS_SERVIDOR_PARA_CLIENTE` e os eventos publicáveis, com mensagem de falha que **nomeia** o evento (como a do front faz) e uma asserção de que a lista do contrato não está vazia — senão o teste passa sem verificar nada.
- A suíte existente segue verde: o card não muda comportamento de runtime.

**DoD específico**
- [ ] Um evento novo sem publicador **e** um evento novo sem ouvinte quebram a suíte, cada um com sua mensagem.
- [ ] A regra de onde os eventos são assinados no front está escrita, não subentendida.

---

### RV-112 — Reconexão resiliente e ressincronização

**Épico:** E11 · **Depende de:** — · **Tamanho:** G · **Onda:** 1 · **Primeiro card de produto do épico** (depois do RV-115) · **Status:** ✅ Concluído

> **Como ficou.** `store-conexao.ts` guarda `{ estado }` e nada mais; quem o alimenta é
> `use-socket-mesa`, traduzindo `connect` / `disconnect` / `connect_error`. A distinção entre
> `reconectando` e `offline` vem de **`socket.active`** — o próprio socket.io dizendo se vai tentar de
> novo (já considera `io server disconnect`, falha de handshake e esgotamento de tentativas) — em vez
> de uma segunda interpretação da string de motivo aqui.
>
> **Bloqueio de escrita sem componente novo:** o motivo de conexão entra pela mesma prop
> `motivoBloqueio` que o encerramento de mesa (RV-023) já usava, então chat, tabletop, fichas e
> painel do mestre desabilitam os controles **com o motivo ao lado** sem que nenhum deles conheça o
> socket. O encerramento tem precedência sobre a conexão (é definitivo); a faixa de status é
> independente, então uma mesa encerrada **e** caída mostra as duas informações.
>
> **Correção do Escopo:** a ressincronização refez `['mensagens']`, `['cena']`, `['personagens']` e
> `['mesa', mesaId]`. `['combate', mesaId]` não entrou na v0.5.0 porque a query não existia; `['mesa']`
> entrou no lugar porque um `mesa:participante-removido` perdido durante a queda deixaria na tela uma
> mesa da qual o jogador já não participa — o defeito original do RV-021.
> **Fechado na v0.9.0:** a query de combate nasceu no [RV-063](06-combate.md#rv-063--painel-de-iniciativa)
> (`chaveDoCombate` em `features/jogo/api.ts`) e `'combate'` **já está** em `CACHES_RESSINCRONIZADOS`,
> com a lista escrita à mão do teste de invalidações exatas atualizada. Quem criar o **próximo** cache
> alimentado por socket faz o mesmo par de edições.
>
> **Backoff:** `OPCOES_RECONEXAO` em `lib/socket.ts` (0,5s inicial, teto de 10s, jitter 0,5). Quem lê
> essas opções é o `Backoff` do socket.io-client (`manager.js` → `contrib/backo2.js#duration()`,
> `min(ms * 2^tentativa, max)`) — verificado no fonte da dependência para o teste não medir uma
> reimplementação da fórmula.

**História**
> Como **jogador com internet instável**, quero **voltar ao estado correto depois de uma queda**, para **não precisar recarregar a página no meio do combate**.

**Contexto técnico**
- [use-socket-mesa.ts](../../apps/web/src/features/jogo/use-socket-mesa.ts) já reentra na sala em `connect` e invalida as queries. O buraco: eventos perdidos **durante** a queda, e a ausência de sinal para o usuário de que ele está desconectado.

**Escopo**
- `apps/web/src/features/jogo/store-conexao.ts`: `{ estado: 'conectado'|'reconectando'|'offline' }`
- Faixa de status na `PaginaMesa` ("Reconectando…"), ações de escrita desabilitadas enquanto offline
- Ressincronização: ao reconectar, refazer `['mensagens', mesaId]`, `['cena', mesaId]`, `['personagens', mesaId]` e `['combate', mesaId]` (entregue com `['mesa', mesaId]`, e `['combate']` acrescentado na v0.9.0 quando a query passou a existir — ver a nota acima)
- Backoff exponencial com teto (socket.io: `reconnectionDelayMax`)

**Critérios de aceite**
```gherkin
Cenário: Queda e volta sem recarregar
  Dado que estou numa mesa e a rede cai por 30 segundos
  Quando a conexão voltar
  Então reentro na sala automaticamente
  E o chat, a cena e as fichas refletem tudo o que aconteceu durante a queda

Cenário: Estado visível
  Enquanto eu estiver desconectado
  Então vejo uma faixa "Reconectando…" e os botões de envio ficam desabilitados

Cenário: Mensagem digitada não se perde
  Dado que digitei uma mensagem enquanto offline
  Quando a conexão voltar
  Então o texto continua no campo, pronto para envio

Cenário: Sem tempestade de requisições
  Dado 10 quedas seguidas
  Então o intervalo entre tentativas cresce até o teto configurado
```

**Testes obrigatórios**
- Front: simular `disconnect`/`connect` e verificar reentrada + invalidações exatas (nem a mais, nem a menos).

---

### RV-110 — Presença online

**Épico:** E11 · **Depende de:** RV-112 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre**, quero **ver quem está online na mesa**, para **saber se posso começar a sessão**.

**Contexto técnico**
- Presença é estado efêmero do gateway (mapa em memória por sala), **não** vai para o banco. Um usuário pode ter várias abas — conte conexões, não usuários.

**Escopo**
- `apps/api/src/apresentacao/ws/registro-presenca.ts` (memória)
- Broadcast `presenca:atualizada` com a lista de `usuarioId` online, ao entrar e ao sair
- `GatewayJogo`: trata `disconnect` removendo a conexão
- Front: indicador na lista de participantes

**Critérios de aceite**
```gherkin
Cenário: Entrar e sair
  Quando um jogador abrir a mesa
  Então os demais veem o indicador dele ficar online em até 2 segundos
  E ao fechar a aba, ele fica offline

Cenário: Múltiplas abas
  Dado que abri a mesa em duas abas
  Quando eu fechar uma
  Então continuo online para os demais

Cenário: Queda abrupta
  Dado que o cliente caiu sem enviar "disconnect" limpo
  Então o servidor marca offline pelo timeout do socket, sem presença fantasma
```

**DoD específico**
- [ ] Nenhuma escrita no banco por evento de presença.

---

### RV-114 — Autorização contínua no socket

**Épico:** E11 · **Depende de:** RV-011 · **Tamanho:** M · **Onda:** 3

**História**
> Como **operador**, quero **que sockets percam o acesso quando a sessão ou a participação termina**, para **que a autorização não fique congelada no momento do handshake**.

**Contexto técnico**
- Hoje o token é verificado uma única vez no handshake ([gateway-jogo.ts](../../apps/api/src/apresentacao/ws/gateway-jogo.ts)). Com access token de 15 min (RV-010), a sessão pode expirar com o socket aberto. (Hoje o `JwtServicoToken` emite token de **7 dias**, então o problema ainda não morde numa sessão de 3h — ele nasce com o RV-010.)
- **Duas salas ficam para trás quando o acesso termina, achado na v0.5.0:**
  (a) [publicador-socket.ts](../../apps/api/src/apresentacao/ws/publicador-socket.ts) tira o socket do
  removido de `SALA_MESA(mesaId)` mas **não** de `SALA_USUARIO_NA_MESA(mesaId, usuarioId)`, a sala de
  sussurro e rolagem oculta do RV-070 — é a única sala do sistema que sobrevive à perda de acesso. Hoje
  é inofensivo porque `EnviarSussurro` resolve o destinatário contra `mesas.listarJogadores`, mas a
  próxima entrega que emitir algo direcionado sem revalidar participação vaza para o removido. Uma
  linha ao lado do `socket.leave(sala)` fecha.
  (b) `desconectarSocket()` em [lib/socket.ts](../../apps/web/src/lib/socket.ts) **não tem chamador em
  produção** — o logout não o chama, então o socket da sessão anterior sobrevive à troca de conta até o
  próximo `obterSocket()` notar o token diferente.

**Escopo**
- Revalidação periódica do token (a cada 5 min) com desconexão em caso de expiração/revogação
- Evento `mesa:participante-removido` (RV-021) força `socket.leave` do removido, **incluindo a sala pessoal da mesa**
- Logout no front chamando `desconectarSocket()`
- Mensagem em PT-BR no cliente explicando a desconexão

**Critérios de aceite**
```gherkin
Cenário: Sessão revogada derruba o socket
  Dado que fiz logout em outro dispositivo
  Então o socket daquela sessão é desconectado na próxima revalidação
  E o cliente exibe "Sessão encerrada. Entre novamente."

Cenário: Removido da mesa perde a sala na hora
  Quando o mestre me remover
  Então saio da sala imediatamente e paro de receber eventos daquela mesa
  E também saio da sala pessoal daquela mesa, onde chegam sussurros

Cenário: Sessão válida não é interrompida
  Dado que uso a mesa por 3 horas com renovação de token funcionando
  Então nenhuma desconexão indevida ocorre
```

**Testes obrigatórios**
- WS: socket com token revogado é desconectado; socket válido sobrevive a várias revalidações.

---

### RV-111 — Indicador de digitação

**Épico:** E11 · **Depende de:** RV-110 · **Tamanho:** P · **Onda:** 3

**História**
> Como **jogador**, quero **saber que alguém está escrevendo**, para **não atropelar a fala de outra pessoa**.

**Escopo**
- Eventos `chat:digitando` / `chat:parou` (efêmeros, sem persistência)
- Throttle no cliente: no máximo 1 evento a cada 3 s; expira sozinho após 5 s sem digitar
- Front: linha discreta "Ana está digitando…" abaixo do chat

**Critérios de aceite**
```gherkin
Cenário: Indicador aparece e some
  Quando "Ana" começar a digitar
  Então vejo "Ana está digitando…" em até 1 segundo
  E o aviso some 5 segundos após ela parar

Cenário: Enviar limpa o indicador
  Quando "Ana" enviar a mensagem
  Então o indicador some imediatamente

Cenário: Sem inundar o servidor
  Dado que "Ana" digita continuamente por 30 segundos
  Então no máximo 10 eventos de digitação são emitidos
```

---

### RV-113 — Ping no mapa

**Épico:** E11 · **Depende de:** RV-034 · **Tamanho:** P · **Onda:** 3

**História**
> Como **jogador**, quero **apontar um lugar no mapa para todo mundo**, para **dizer "vou por aqui" sem descrever coordenadas**.

**Escopo**
- Evento efêmero `mapa:ping` (`{ cenaId, x, y, usuarioId }`), sem persistência
- Gesto: Alt+clique (ou clique longo no toque)
- Front: animação de círculo expandindo por ~2 s, na cor do usuário; rate limit de 1 ping/s por usuário

**Critérios de aceite**
```gherkin
Cenário: Ping visível para todos
  Quando eu der Alt+clique numa célula
  Então todos na cena veem a marca animada naquele ponto por cerca de 2 segundos

Cenário: Ping não persiste
  Dado que alguém deu um ping
  Quando um jogador entrar na mesa depois
  Então ele não vê nada — nenhum registro foi criado

Cenário: Anti-spam
  Quando eu clicar 10 vezes em 1 segundo
  Então no máximo 1 ping é propagado
```

**DoD específico**
- [ ] Nenhuma linha gravada no banco por ping.

---

### RV-117 — Personagem criado e removido em tempo real

**Épico:** E11 · **Depende de:** RV-115, RV-093 · **Tamanho:** P · **Onda:** 2

**História**
> Como **jogador com a mesa aberta**, quero **ver a lista de fichas mudar quando alguém excluir ou duplicar um personagem**, para **não continuar clicando numa ficha que já não existe**.

**Contexto técnico**
- O RV-093 entregou `DELETE /personagens/:id` e `POST /personagens/:id/duplicar`, e o RV-042 já emite
  `personagem:atualizado`. **Faltam os dois irmãos**: `personagem:criado` e `personagem:removido` não
  existem em [eventos-ws.ts](../../packages/shared/src/tipos/eventos-ws.ts) — a única entrada de
  personagem lá é `'personagem:atualizado'`. Consequência medida nos dois lados: quem está com a mesa
  aberta continua vendo na lista a ficha excluída, e a cópia recém-criada não aparece, até um F5 ou uma
  reconexão. O token vinculado mantém a barra de vida na tela pelo mesmo motivo (ela é derivada do
  `PersonagemDTO` em cache, não do token).
- **Por que a entrega do RV-093 não fez isto**: o evento não pode nascer pela metade. Os quatro passos
  do [RV-115](#rv-115--aplicar-o-contrato-de-eventos-ws-nos-dois-lados) são obrigatórios e simultâneos —
  declarar em `EventosServidorParaCliente`, registrar no `Record` interno, acrescentar o método a
  `PublicadorEventosMesa` (adapter **e** fake) e assinar em `use-socket-mesa.ts`. Declarar o evento sem
  o ouvinte deixa `cobertura-eventos-ws.test.ts` vermelho; criar o ouvinte sem publicador deixa
  `cobertura-publicador-ws.test.ts` vermelho (RV-116). É **um card só**, tocando api e web de uma vez.
- **Decisão a herdar do RV-070:** o evento vai para a sala `mesa:{id}`, e o cliente decide o que fazer
  com o cache. Aqui a decisão certa é `invalidateQueries(['personagens', mesaId])` e
  `(['cena', mesaId])`, não `setQueryData` — a lista visível depende de autorização que o cliente não
  reproduz (o [RV-095](09-fichas.md#rv-095--bestiário-do-mestre) esconderá NPCs dos jogadores, e um
  `setQueryData` com o DTO no payload vazaria a ficha para quem não pode vê-la).
- **Armadilha F6 — texto que promete.** O diálogo de exclusão em
  [PainelPersonagens.tsx](../../apps/web/src/features/personagens/PainelPersonagens.tsx) hoje diz, com
  teste fixando a frase, que os outros só verão a ficha sumir **ao recarregar**. Esse texto passa a ser
  mentira no minuto em que este card entrar: **mude os dois juntos**, o texto e o teste.
- **Armadilha 2:** duplicar cria uma ficha que talvez o destinatário não possa ver. Emitir o `criado`
  para a sala inteira com o DTO dentro repete o erro que o sussurro evitou; mande o mínimo (`{ mesaId }`
  ou o id) e deixe cada cliente recarregar o que tem direito de ver.

**Escopo**
- `packages/shared/src/tipos/eventos-ws.ts` — `personagem:criado` e `personagem:removido`
- `apps/api/src/aplicacao/ports/infraestrutura.ts` + `apresentacao/ws/publicador-socket.ts` +
  `testes/fakes/fake-publicador-eventos-mesa.ts`
- `apps/api/src/aplicacao/personagens/{criar,duplicar,remover}-personagem.ts` — publicar o evento
- `apps/web/src/features/jogo/use-socket-mesa.ts` — ouvintes e invalidação
- `apps/web/src/features/personagens/PainelPersonagens.tsx` — o texto do diálogo e o teste que o fixa

**Critérios de aceite**
```gherkin
Cenário: Ficha excluída some para todos, sem recarregar
  Dado dois jogadores com a mesma mesa aberta
  Quando o dono excluir "Thorin"
  Então a ficha some da lista dos dois em segundos
  E o token que a referenciava continua no mapa, sem barra de vida

Cenário: Cópia aparece para todos
  Quando o mestre duplicar "Goblin"
  Então "Goblin (cópia)" aparece na lista dos participantes sem F5

Cenário: Autorização — o evento não vaza ficha
  Dado um jogador que não pode ver a ficha criada
  Quando o evento chegar
  Então ele não recebe dado de personagem no payload
  E a lista dele continua exibindo apenas o que a API autoriza

Cenário: Borda — evento de outra mesa
  Dado que estou na mesa A
  Quando chegar o evento carimbado com a mesa B
  Então nada é invalidado no cache da mesa A
```

**Testes obrigatórios**
- Front: `use-socket-mesa` invalida exatamente `['personagens', mesaId]` e `['cena', mesaId]` — nem a
  mais, nem a menos —, e `cobertura-eventos-ws.test.ts` continua verde por ter ouvinte, não por
  omissão.
- API: `cobertura-publicador-ws.test.ts` cobre os dois eventos novos; use case de excluir e de duplicar
  publica pela port (com fake), sem que a rota conheça o socket.
- O teste que fixa a frase do diálogo é **atualizado**, não apagado.

**DoD específico**
- [ ] Os quatro passos do RV-115 feitos no mesmo commit — nenhum evento órfão em nenhuma direção.
- [ ] Nenhum `PersonagemDTO` viaja no payload do evento.
- [ ] O texto da UI voltou a descrever o que o código faz.
