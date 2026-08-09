# E07 — Chat avançado

Hoje o chat tem fala e rolagem, e o parser de comando é um regex dentro do componente [Chat.tsx](../../apps/web/src/features/jogo/Chat.tsx). Este épico move a inteligência para onde ela pertence e adiciona o que uma mesa real usa.

---

### RV-074 — Registry de comandos de chat

**Épico:** E07 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Faça este primeiro do épico**

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

**Épico:** E07 · **Depende de:** RV-074 · **Tamanho:** G · **Onda:** 1

**História**
> Como **jogador**, quero **falar em particular com o mestre ou outro jogador**, para **combinar uma ação secreta sem sair da mesa**.

**Contexto técnico**
- Segurança: sussurro **não pode** ser transmitido a quem não é destinatário. Entregue por socket direcionado (sala pessoal `usuario:{id}`), nunca com filtro no cliente. `ListarMensagens` também precisa filtrar.

**Escopo**
- Migration: `mensagens.destinatario_id uuid references usuarios(id)`; `tipo` aceita `'sussurro'`
- `Mensagem.criarSussurro(...)`; `MensagemRepository.listarDaMesa` filtra por visibilidade do solicitante
- `PublicadorEventosMesa.mensagemPrivada(usuarioIds, mensagem)`; `GatewayJogo` faz cada socket entrar em `usuario:{id}`
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

**Épico:** E07 · **Depende de:** RV-070 · **Tamanho:** M · **Onda:** 1

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

**Épico:** E07 · **Depende de:** — · **Tamanho:** M · **Onda:** 1

**História**
> Como **jogador**, quero **rolar o chat para trás e carregar mensagens antigas**, para **consultar o que aconteceu em sessões passadas**.

**Contexto técnico**
- Hoje `ListarMensagens` traz as últimas 100 e o front carrega tudo de uma vez.
- Use cursor por `criado_em` + `id` (estável, sem `offset`).

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

**Escopo**
- Parser de `@nome` no `packages/shared` (reaproveita RV-074)
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
