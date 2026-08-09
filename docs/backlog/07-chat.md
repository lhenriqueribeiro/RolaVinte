# E07 — Chat avançado

Hoje o chat tem fala e rolagem, e o parser de comando é um regex dentro do componente [Chat.tsx](../../apps/web/src/features/jogo/Chat.tsx). Este épico move a inteligência para onde ela pertence e adiciona o que uma mesa real usa.

---

### RV-074 — Registry de comandos de chat

**Épico:** E07 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Faça este primeiro do épico** · **Status:** ✅ Concluído

> **Decisões tomadas na entrega.** O parser vive em
> [packages/shared/src/chat/comandos.ts](../../packages/shared/src/chat/comandos.ts) e o servidor
> **reinterpreta o texto cru**: o cliente manda `{ texto }` para a rota nova
> `POST /mesas/:mesaId/chat` e nunca um tipo já classificado — se pudesse mandar
> `{ tipo: 'rolagem-oculta' }`, estaria escolhendo o próprio caminho de autorização. O front chama
> `interpretarComando` só para decidir entre **avisar aqui** e **postar**, e a dica sob o campo sai de
> `listarUsosDeComandos()`, então comando novo aparece na UI sem editar componente.
> **O union tem uma variante a mais do que o card previa:** além de `desconhecido` existe
> `incompleto` (`/r` sem expressão, aspas não fechadas); as duas carregam `aviso` e o type guard
> `comandoEhAviso` cobre as duas. O texto do 400 da API **é** o `aviso` do parser, para a tela mostrar
> sem traduzir.
> **Prova do DoD, medida:** acrescentar `/eu` custa 3 arquivos e nenhum `switch` — a `DefinicaoComando`
> no shared e o manipulador nos **dois** composition roots ([main.ts](../../apps/api/src/main.ts) e
> [testes/harness.ts](../../apps/api/src/testes/harness.ts)), que é um `Record<TipoComandoExecutavel, …>`
> e por isso **não compila** enquanto o dono não existir. `Chat.tsx`, `ProcessarComandoChat`, a rota e o
> publicador não mudam. Se o comando exigir um **tipo de mensagem** novo, somam-se `tipos/dtos.ts`, o
> `Record` de [chat/visibilidade.ts](../../packages/shared/src/chat/visibilidade.ts) (que força a decisão
> público/privado, falhando fechado) e uma migration para o `check constraint` de `mensagens.tipo`.

**História**
> Como **mantenedor**, quero **um ponto único de extensão para comandos de chat**, para **que `/sussurro`, `/eu` e `/oculto` entrem por adição, sem inchar um `if` no componente**.

**Contexto técnico**
- [03-solid.md](../../.claude/rules/03-solid.md) (Open/Closed) e [04-design-patterns.md](../../.claude/rules/04-design-patterns.md): ponto de extensão canônico é `Map<tipo, Handler>` registrado no composition root.
- O parser é lógica de domínio compartilhada → `packages/shared`, para que front e back interpretem igual.

**Escopo**
- `packages/shared/src/chat/comandos.ts`: `interpretarComando(texto): ComandoChat` com union discriminada (`fala | rolagem | sussurro | emote | oculta | desconhecido`)
- `apps/web/src/features/jogo/Chat.tsx`: passa a delegar ao parser, sem regex local
- `apps/api`: `Map<tipo, ManipuladorComando>` no composition root, consumido por um único use case `ProcessarComandoChat`

**Critérios de aceite**
```gherkin
Cenário: Alias de rolagem
  Quando eu digitar "/r 1d20", "/rolar 1d20" ou "/R 1d20"
  Então todos são interpretados como o comando de rolagem com expressão "1d20"

Cenário: Motivo após #
  Quando eu digitar "/r 2d6+3 # dano da espada"
  Então a expressão é "2d6+3" e o motivo é "dano da espada"

Cenário: Comando inexistente
  Quando eu digitar "/banana 1d20"
  Então recebo aviso em PT-BR listando os comandos disponíveis
  E nada é enviado à mesa

Cenário: Texto comum não vira comando
  Quando eu digitar "e/ou tanto faz"
  Então é enviado como fala normal
```

**Testes obrigatórios**
- Unitário do parser em `packages/shared` com tabela de casos (cada comando, aliases, maiúsculas, `#` no meio do texto, barra no meio da frase, string vazia).

**DoD específico**
- [ ] Adicionar um comando novo não exige editar `Chat.tsx` nem um `switch` central — só registrar no mapa.

---

### RV-070 — Sussurro

**Épico:** E07 · **Depende de:** RV-074 · **Tamanho:** G · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega.** **Nenhum evento WS novo nasceu**: o sussurro chega pelo
> `mensagem:nova` que o front já assina, com o mesmo `MensagemDTO`; o que muda é a **sala para a qual o
> servidor emite**. A razão está escrita em
> [eventos-ws.ts](../../packages/shared/src/tipos/eventos-ws.ts) — o cliente faz exatamente a mesma
> coisa com os dois (anexar ao histórico), e um nome de evento separado sugeriria que o segredo mora no
> nome quando ele mora no alvo do `emit`. Efeito prático: o ouvinte existente já funciona e o teste de
> cobertura de eventos não fica vermelho.
> **O filtro de privacidade é da consulta, não do cliente:** `listarDaMesa` aplica
> `or(tipo.in.(fala,rolagem,sistema), autor_id.eq.<eu>, destinatario_id.eq.<eu>)` **antes** do `limit`
> (se fosse depois, o solicitante receberia menos de 100 mensagens porque parte do bolo seria segredo
> alheio). `MensagemChat.tsx` **não** filtra nada de propósito: esconder na renderização apagaria a
> evidência de um vazamento do servidor.
> **Destinatário aceita `@Nome` e `"Nome Com Espaço"`** — o card só mostrava `@Nome`, e um parser de
> token único sussurraria para "Ana" em vez de "Ana Maria", em silêncio e para a pessoa errada. Pelo
> mesmo motivo, dois participantes homônimos devolvem **409** explícito em vez de o servidor escolher um.
> **A migration `0005_chat.sql` leva um CHECK que o card não pedia:** só sussurro tem destinatário, e
> todo sussurro tem um. Sem ele, uma `fala` com `destinatario_id` preenchido passaria pelo filtro de
> visibilidade de um terceiro sem ser restrita.
> **No adapter, o id do solicitante é validado como UUID antes de entrar na string do `or()`** e o
> caso contrário lança exceção (estado impossível, não `Result`): um id com vírgula ou parêntese
> reescreveria a expressão inteira e derrubaria o filtro.
> **⚠️ A migration `0005` não estava aplicada no ambiente real no fecho da fase** — ver
> [RV-139](13-operacao.md#rv-139--o-verificador-de-ambiente-precisa-conhecer-toda-migration-do-repositório).

**História**
> Como **jogador**, quero **falar em particular com o mestre ou outro jogador**, para **combinar uma ação secreta sem sair da mesa**.

**Contexto técnico**
- Segurança: sussurro **não pode** ser transmitido a quem não é destinatário. Entregue por socket direcionado (sala pessoal), nunca com filtro no cliente. `ListarMensagens` também precisa filtrar.
- A sala pessoal é **por mesa** (`mesa:{mesaId}:usuario:{usuarioId}`), decidido na implementação: uma sala `usuario:{id}` global entregaria o sussurro de uma mesa a uma aba aberta em outra, e o cliente grava a mensagem em `['mensagens', mesaId]` da aba montada. Com a sala por par mesa+usuário, o socket entra nela no mesmo ponto em que entra na sala da mesa, logo após a verificação de participação.

**Escopo**
- Migration: `mensagens.destinatario_id uuid references usuarios(id)`; `tipo` aceita `'sussurro'`
- `Mensagem.criarSussurro(...)`; `MensagemRepository.listarDaMesa` filtra por visibilidade do solicitante
- `PublicadorEventosMesa.mensagemPrivada(mesaId, usuarioIds, mensagem)`; `GatewayJogo` faz cada socket entrar na sala pessoal daquela mesa
- Comando `/sussurro @Nome mensagem` (aceitar `/s`)

**Critérios de aceite**
```gherkin
Cenário: Só remetente e destinatário recebem
  Dado que sussurro para o mestre
  Então o evento chega apenas aos sockets do mestre e aos meus
  E nenhum outro participante recebe o evento

Cenário: Histórico respeita a privacidade
  Quando um terceiro carregar GET /mesas/:mesaId/mensagens
  Então o sussurro não está na resposta dele
  E está na minha e na do destinatário

Cenário: Destinatário inválido
  Quando eu sussurrar para alguém que não participa da mesa
  Então recebo 404 e nada é enviado

Cenário: Visual distinto
  Então o sussurro aparece com estilo próprio e o rótulo "sussurro para <nome>"
```

**Testes obrigatórios**
- Use case: payload de `ListarMensagens` para terceiro não contém o sussurro.
- WS: broadcast direcionado, não para a sala da mesa.

---

### RV-071 — Rolagem oculta do mestre

**Épico:** E07 · **Depende de:** RV-070 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega.** A guarda é do agregado: `RolarDados` reusa
> `mesa.autorizarEscritaDoMestre`, então o **403 vale nos dois caminhos** — `/oculto 1d20` pela rota
> `/chat` e `POST /mesas/:mesaId/rolagens` com `oculta: true`. O campo `oculta` continua **exposto** no
> `rolarDadosSchema` de propósito: a defesa é o 403, não o campo escondido.
> **A checagem no cliente é cortesia e só age quando o papel é conhecido**
> (`mesa.isSuccess && !souMestre`): sem isso, o mestre que digitasse `/oculto` antes de `['mesa', id]`
> responder seria acusado de não ser mestre — a mentira inversa. O comentário no código diz que quem
> barra é o agregado.
> **Rótulo textual, nunca só cor:** a mensagem aparece como "Rolagem oculta — só você vê este
> resultado". A frase é literalmente verdadeira e não é chute: pelo `Record` de visibilidade a rolagem
> oculta é restrita e não tem destinatário (o CHECK da `0005` garante que só sussurro tem), então quem
> a vê é sempre e só o autor.
> **A asserção de privacidade olha o corpo bruto da resposta do terceiro**
> (`expect(resposta.body).not.toContain(...)`), não o tipo da mensagem — um teste que compara tipos
> passaria com o texto vazando dentro de outro campo.

**História**
> Como **mestre**, quero **rolar dados sem os jogadores verem o resultado**, para **fazer testes secretos de percepção sem entregar o jogo**.

**Escopo**
- `Mensagem.criarRolagemOculta(...)` (`tipo = 'rolagem-oculta'`, visível só ao autor)
- Comando `/oculto <expressão>` (aliases `/go`, `/gm`)
- `RolarDados` recebe `oculta: boolean` e escolhe o publicador
- Front: badge "🔒 oculta" na própria mensagem

**Critérios de aceite**
```gherkin
Cenário: Resultado só para o mestre
  Quando eu rolar "/oculto 1d20+5"
  Então vejo o resultado com selo de oculta
  E nenhum jogador recebe evento nem vê no histórico

Cenário: Sem rastro no chat dos jogadores
  Então os jogadores não veem sequer um aviso de que houve uma rolagem

Cenário: Jogador não usa o comando
  Dado que sou jogador
  Quando eu digitar "/oculto 1d20"
  Então recebo aviso de que o comando é exclusivo do mestre
  E o servidor também rejeita a requisição com 403
```

**Testes obrigatórios**
- Contrato: jogador chamando a rota com `oculta: true` → 403 (não confie na UI).

---

### RV-073 — Histórico paginado

**Épico:** E07 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Status:** 🚧 Parcial — interface entregue, backend pendente

> **Por que continua aberto.** Verificado no código no fecho da v0.5.0:
> [rotas-jogo.ts](../../apps/api/src/apresentacao/http/rotas-jogo.ts) não lê querystring nenhuma,
> `ListarMensagens.executar(usuarioId, mesaId)` não recebe cursor e `listarDaMesa` usa um
> `LIMITE_PADRAO = 100` fixo. Não há risco de duplicar ou pular registro entre páginas porque **não há
> páginas**: numa campanha com mais de 100 mensagens o jogador simplesmente nunca alcança o histórico
> anterior, e a tela não avisa que existe algo acima. O que falta está detalhado no Contexto técnico
> abaixo; **o card só fecha quando o cursor existir na rota, na port e no `ORDER BY`.**

**História**
> Como **jogador**, quero **rolar o chat para trás e carregar mensagens antigas**, para **consultar o que aconteceu em sessões passadas**.

**Contexto técnico**
- Hoje `ListarMensagens` traz as últimas 100 e o front carrega tudo de uma vez.
- Use cursor por `criado_em` + `id` (estável, sem `offset`).
- **Estado em v0.5.0: metade entregue.** A parte de interface que não dependia do
  cursor está feita — o chat só desce sozinho quando o leitor já está no fim, e quem
  está lendo o histórico recebe o aviso "N novas mensagens" em vez de um salto
  (`features/jogo/rolagem-chat.ts` mais os testes de `Chat.rolagem.test.tsx`). O que
  falta é **inteiramente backend**: `GET /mesas/:mesaId/mensagens` ignora querystring
  e devolve sempre a mesma página, então `useInfiniteQuery` mandando `antesDe`
  receberia as mesmas mensagens de novo e as duplicaria na tela. Enquanto a rota não
  aceitar `?antesDe=<iso>&limite=<n>`, `useMensagens` continua `useQuery` de
  propósito. Ao fechar o backend, o que resta na interface é o `useInfiniteQuery` e a
  compensação de `scrollTop` ao prepender uma página
  (`scrollTopAntes + (alturaDepois - alturaAntes)`), deliberadamente **não** escrita
  agora para não parecer que a paginação existe.
- O desempate do cursor precisa entrar junto no `ORDER BY` do adapter **e** no
  `FakeMensagemRepository`: hoje os dois ordenam só por `criado_em` e invertem
  mensagens do mesmo instante (registrado na entrega do RV-070).

**Escopo**
- `MensagemRepository.listarDaMesa(mesaId, { limite, antesDe })`
- `GET /mesas/:mesaId/mensagens?antesDe=<iso>&limite=50`
- Front: `useInfiniteQuery` e carregamento ao chegar no topo, preservando a posição de rolagem

**Critérios de aceite**
```gherkin
Cenário: Carregar página anterior
  Dado 250 mensagens na mesa
  Quando eu abrir o chat
  Então vejo as 50 mais recentes
  E ao rolar até o topo, as 50 anteriores são carregadas

Cenário: Posição de rolagem preservada
  Quando uma página antiga carregar
  Então a mensagem que eu estava lendo continua na mesma posição visual

Cenário: Mensagem nova durante a leitura
  Dado que estou lendo o histórico antigo
  Quando alguém enviar uma mensagem
  Então a rolagem não salta para o fim
  E aparece o indicador "novas mensagens"
```

**Testes obrigatórios**
- Repositório/use case: paginação por cursor não repete nem pula mensagens quando chegam novas entre as páginas.

---

### RV-072 — Emote e fala em personagem

**Épico:** E07 · **Depende de:** RV-074 · **Tamanho:** P · **Onda:** 3

**História**
> Como **jogador**, quero **narrar ações e falar como meu personagem**, para **dar cor à interpretação**.

**Escopo**
- Comandos `/eu <ação>` (emote) e `/como <personagem> <fala>`
- Migration: `mensagens.personagem_id uuid` (fala atribuída ao personagem)
- Front: emote em itálico com cor distinta; fala em personagem exibe o nome do personagem

**Critérios de aceite**
```gherkin
Cenário: Emote
  Quando eu digitar "/eu saca a espada lentamente"
  Então o chat mostra "* Thorin saca a espada lentamente" em itálico

Cenário: Falar como personagem
  Dado que "Thorin" é meu personagem
  Quando eu digitar "/como Thorin Ninguém passa!"
  Então a mensagem aparece atribuída a "Thorin", não ao meu nome de usuário

Cenário: Personagem de outro jogador
  Quando eu tentar falar como um personagem que não é meu
  Então recebo 403 (mestre é exceção e pode falar por qualquer personagem)
```

---

### RV-075 — Menções e notificação

**Épico:** E07 · **Depende de:** RV-073 · **Tamanho:** M · **Onda:** 3

**História**
> Como **jogador distraído**, quero **ser avisado quando me chamam**, para **não perder a minha vez**.

**Contexto técnico**
- Herdado do RV-073: o aviso "N novas mensagens" **não distingue** uma mensagem privada de uma fala
  pública — quem está lendo o histórico vê "1 nova mensagem" mesmo quando a nova é um sussurro
  endereçado a ele, justamente a que não se quer perder. A informação já está no payload
  (`mensagem.tipo` e `destinatarioId`), então não há contrato novo a criar; este card, que já vai
  decidir o que merece som e badge, é quem deve resolver a distinção.

**Escopo**
- Parser de `@nome` no `packages/shared` (reaproveita RV-074)
- Aviso de não lidas distinguindo menção e mensagem privada da fala comum
- Front: destaque da menção, som opcional, badge na aba de chat, `document.title` piscando quando a aba está em segundo plano
- Preferência persistida em `localStorage` (som ligado/desligado)

**Critérios de aceite**
```gherkin
Cenário: Menção destacada e notificada
  Quando alguém escrever "@Ana sua vez"
  Então Ana vê a mensagem destacada, ouve o som (se habilitado) e vê o badge na aba

Cenário: Aba em segundo plano
  Dado que a aba não está em foco
  Quando eu for mencionado
  Então o título da página sinaliza a menção até eu voltar

Cenário: Som desligado é respeitado
  Dado que desliguei o som
  Então nenhuma menção toca áudio, mas o destaque visual permanece
```

**DoD específico**
- [ ] Nenhum áudio toca automaticamente sem interação prévia do usuário na página (política dos navegadores).
