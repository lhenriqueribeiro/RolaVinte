# E06 — Combate e iniciativa

Novo bounded context dentro do módulo `jogo`: o agregado `Combate` é raiz da ordem de iniciativa e do turno corrente.

Os seis cards originais (RV-060 … RV-065) foram entregues na **v0.9.0**, e o `Combate` é hoje a **terceira raiz de agregado** do projeto, ao lado de `Mesa` e `Cena`. Da execução nasceram dois cards de defeito, RV-066 e RV-067, no fim deste arquivo — o RV-066 foi fechado na própria verificação de fim de sprint, porque era furo de autorização. A iniciativa por sistema é o [RV-158](15-pathfinder2e.md#rv-158--iniciativa-por-percepção-no-combate-de-pf2e), no épico de Pathfinder, entregue na mesma sprint.

---

### RV-060 — Agregado Combate

**Épico:** E06 · **Depende de:** — · **Tamanho:** G · **Onda:** 2 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0).** Migration **`0012_combate.sql`** e não `0010`: a `0010` era da Sprint 3
> e a `0011` nasceu em paralelo no RV-064 — número de migration se deriva do disco no momento da escrita,
> nunca do planejamento. A migration foi **aplicada** no banco em uso, e a verificação independente conferiu
> o efeito no Postgres (as duas tabelas, `iniciativa` nullable, `ordem_desempate not null` e os quatro
> índices, inclusive o único parcial). Quatro das cinco invariantes têm teste de domínio; **"um combate ativo
> por mesa" não é invariante do agregado e não poderia ser** — nenhum `Combate` enxerga outro —, então ela
> vive no caso de uso (409 em PT-BR) mais o índice único parcial da `0012`. As demais decisões estão no bloco
> abaixo, escrito na execução. Sobrou uma lacuna nomeada: o índice único **não tem consumidor automatizado**,
> e na corrida de dois cliques o segundo `insert` responde 500 em vez de 409 — registrado em
> [RV-136](13-operacao.md#rv-136--cobertura-automatizada-dos-adapters-supabase).

**História**
> Como **mestre**, quero **um combate estruturado com ordem, rodada e turno**, para **conduzir a luta sem planilha paralela**.

**Contexto técnico**
- Um combate ativo por mesa. Participantes referenciam **só** `tokenId` (a peça no mapa) — respeitando a comunicação entre contextos por id ([02-ddd.md](../../.claude/rules/02-ddd.md)).

**Decisões registradas na execução** (v0.9.0):

- **Nada de `personagemId` no participante.** O enunciado original dizia "com `personagemId` opcional". Quem vincula peça e ficha é `TokenDTO.personagemId`, que o cliente já carrega: copiar o vínculo para o participante seria uma segunda verdade, divergente no instante em que o mestre trocasse a ficha do token (F12). Quem precisa da ficha resolve pelo token.
- **Nada de coluna `ausente`.** Nenhum cenário de RV-060 a RV-065 a escreve ou a lê, e o fato que ela representaria — "esta criatura está fora da luta" — ganhou casa nesta mesma sprint em `tokens.condicoes` (RV-064), que é onde o RV-065 grava `inconsciente` ao zerar o PV. Um booleano paralelo seria a segunda verdade do mesmo fato, com o painel lendo uma e o mapa a outra. Volta quando "atrasar o turno" tiver dono, leitor e teste.
- **O turno acompanha a pessoa durante a luta e o topo da ordem na preparação.** Enquanto ninguém agiu (rodada 1, turno no índice 0), rolar iniciativa recoloca a vez em quem lidera a ordem — senão o combate começaria sempre pelo primeiro token que o mestre selecionou. Depois da primeira passagem de turno, reordenar não tira a vez de quem está agindo.
- **`ordem_desempate` não sai no DTO.** É a mecânica que sustenta a ordem estável no servidor; expô-la convidaria o cliente a reordenar por conta própria, criando uma segunda implementação da regra.

**Escopo**
- Migration `0012_combate.sql`: `combates` (`id`, `mesa_id`, `cena_id`, `rodada`, `indice_turno`, `ativo`, `criado_em`) e `combate_participantes` (`combate_id`, `token_id`, `nome`, `iniciativa`, `ordem_desempate`) — mais o índice único parcial `combates (mesa_id) where ativo`, que é a segunda tranca de "um combate ativo por mesa"
- `apps/api/src/dominio/jogo/combate.ts` — agregado com `adicionar`, `remover`, `definirIniciativa`, `ordenar`, `proximoTurno`, `encerrar`
- `apps/api/src/aplicacao/ports/repositorios.ts`: `CombateRepository`

**Invariantes**
- Um combate ativo por mesa.
- Ordem decrescente por iniciativa; empate resolvido por `ordem_desempate` estável (não aleatório a cada leitura).
- `proximoTurno` no último participante incrementa a rodada e volta ao primeiro.
- Remover o participante do turno atual mantém o turno em um participante válido.

**Critérios de aceite**
```gherkin
Cenário: Ordem decrescente com desempate estável
  Dado participantes com iniciativas 18, 22 e 18
  Quando o combate for ordenado
  Então a sequência é 22, 18, 18 e a ordem entre os empatados não muda entre leituras

Cenário: Virada de rodada
  Dado 3 participantes na rodada 1 com o turno no terceiro
  Quando eu passar o turno
  Então a rodada vira 2 e o turno volta ao primeiro

Cenário: Remover quem está no turno
  Dado que o participante do turno atual morre e é removido
  Então o turno passa ao próximo participante válido, sem estourar índice

Cenário: Um combate ativo por mesa
  Dado um combate ativo
  Quando eu tentar iniciar outro
  Então recebo 409
```

**Testes obrigatórios**
- Domínio puro cobrindo as 4 invariantes acima + combate vazio (`proximoTurno` não pode quebrar).

---

### RV-061 — Iniciar combate e rolar iniciativa

**Épico:** E06 · **Depende de:** RV-060 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0).**
> - **`RolarDados` é reusado como port estreita** (`RoladorDeDados`), e não um segundo rolador: existe **uma**
>   rolagem, então o total gravado na ordem é literalmente o número que a mesa viu no chat. Testado com RNG
>   determinístico.
> - **A rolagem vai para o chat antes de a iniciativa ser gravada**, de propósito: se `RolarDados` recusar, o
>   combate não fica com um número que ninguém pode auditar. **A guarda de combate encerrado precisou subir
>   para antes disso** — a verificação independente mediu que, com o combate encerrado, a mesa via
>   `Iniciativa — Thorin: 23` no chat e recebia 409 sem iniciativa nenhuma registrada. Corrigido com
>   `combate.garantirEmCurso()` logo depois da autorização de mesa, com teste que ficou vermelho antes.
> - **`expressao` deixou de ser obrigatória** no [RV-158](15-pathfinder2e.md#rv-158--iniciativa-por-percepção-no-combate-de-pf2e),
>   entregue na mesma sprint: sem expressão, o bônus é derivado da ficha pelo sistema da mesa; informada, ela
>   manda — que é o NPC sem ficha e o número que o mestre digita (`expressao: '17'` é aceita pelo motor).
>   **Consequência aberta:** a expressão informada manda **também para o jogador**, então ele pode escolher a
>   própria iniciativa por chamada direta à rota. É [RV-066](#rv-066--iniciativa-informada-é-privilégio-do-mestre-hoje-o-jogador-escolhe-o-próprio-número).
> - **`ordem_desempate` é a ordem em que os `tokenIds` chegam** — determinística, e não a ordem em que o banco
>   devolveu a cena. Na prática isso é a ordem de criação das peças no mapa, e o mestre não a controla: a
>   frase que a tela mostra (`REGRA_DESEMPATE_INICIATIVA`) diz a verdade sobre isso, então é escopo faltando e
>   não promessa falsa.
> - **A mensagem da rolagem é do chat comum**, com o motivo `Iniciativa (Percepção) — Thorin` montado pelo
>   servidor; o cliente deixa `motivo` vazio de propósito, senão a mesa não vê **qual regra** foi aplicada.

**História**
> Como **mestre**, quero **iniciar o combate com os tokens da cena e rolar a iniciativa de todos**, para **começar a luta em segundos**.

**Escopo**
- `apps/api/src/aplicacao/jogo/iniciar-combate.ts` (recebe lista de `tokenId`)
- `apps/api/src/aplicacao/jogo/rolar-iniciativa.ts` — reusa `ServicoRolagemDados` e `ExpressaoDados`; publica a rolagem no chat como mensagem de sistema
- `POST /mesas/:mesaId/combate`, `POST /combates/:combateId/iniciativa`
- Broadcast `combate:atualizado`

**Critérios de aceite**
```gherkin
Cenário: Iniciar combate com a cena atual
  Quando eu iniciar o combate selecionando 5 tokens
  Então um combate ativo é criado na rodada 1 com os 5 participantes
  E todos os participantes da mesa recebem "combate:atualizado"

Cenário: Rolar iniciativa de um participante
  Quando eu rolar "1d20+3" para o token "Thorin"
  Então a iniciativa dele é preenchida com o total
  E a rolagem aparece no chat com o motivo "Iniciativa — Thorin"

Cenário: Jogador rola a própria iniciativa
  Dado que o token é do meu personagem
  Quando eu rolar iniciativa
  Então é aceito
  E rolar pelo token de outro jogador retorna 403
```

**Testes obrigatórios**
- Use case com RNG determinístico: total registrado = total exibido no chat.
- Autorização: jogador só rola pelo próprio personagem; mestre rola por qualquer um.

---

### RV-062 — Controle de turno

**Épico:** E06 · **Depende de:** RV-061 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0).**
> - **"Rodada 2" no chat estreou o `tipo: 'sistema'`**, que era contrato sem produtor desde a `0001`: o
>   `check` do banco o aceitava, o `Record` de visibilidade o classificava como público e **nenhuma linha o
>   gravava**. Nasceu `Mensagem.criarSistema` (`autorNome: 'Sistema'`, `autorId: null`), e `avisarNoChat` é o
>   caminho único para qualquer aviso de plataforma — o texto da rodada existe em um lugar só. Vale o
>   registro da assimetria: o registro total obriga a **classificar** um tipo novo, mas nada obriga a **usá-lo**.
> - **Encerrar é `ativo = false`, nunca `delete`.** O histórico da luta fica, o repositório não tem `remover`
>   e, sem delete, não há arquivo em Storage para ficar órfão (F7). Encerrar duas vezes é 409, e combate
>   encerrado é somente leitura para as cinco escritas, com **uma** mensagem de recusa (`COMBATE_ENCERRADO`)
>   e a guarda no agregado (`garantirEmCurso`), pública para o RV-065 usar em vez de um `if (combate.ativo)`.
> - **A entrega do "todos veem o destaque mudar" é do [RV-063](#rv-063--painel-de-iniciativa)**, que veio na
>   mesma sprint: aqui saem o `combate:atualizado` e a mensagem de rodada; o realce no mapa e o painel são lá.
> - Mesa encerrada congela passar turno e encerrar (409), e isso passou a ter teste na verificação
>   independente — antes só `IniciarCombate` provava essa metade da guarda.

**História**
> Como **mestre**, quero **passar o turno e ver a rodada avançar**, para **manter o ritmo da luta**.

**Escopo**
- `apps/api/src/aplicacao/jogo/passar-turno.ts`, `encerrar-combate.ts`
- `POST /combates/:combateId/proximo-turno`, `POST /combates/:combateId/encerrar`
- Broadcast `combate:atualizado` e mensagem de sistema no chat a cada nova rodada

**Critérios de aceite**
```gherkin
Cenário: Passar o turno avisa a mesa
  Quando eu passar o turno
  Então todos veem o destaque mudar para o próximo participante
  E o token correspondente ganha realce no mapa

Cenário: Nova rodada é registrada
  Quando o turno voltar ao primeiro participante
  Então uma mensagem de sistema "Rodada 2" aparece no chat

Cenário: Encerrar libera nova luta
  Quando eu encerrar o combate
  Então o painel de iniciativa esvazia para todos
  E consigo iniciar um novo combate

Cenário: Jogador não passa turno
  Dado que sou jogador
  Quando eu chamar POST /combates/:combateId/proximo-turno
  Então recebo 403
```

**Decisão registrada**
- Só o mestre passa o turno. "Encerrar meu turno" pelo jogador fica para depois (evita corrida entre dois clientes).

---

### RV-063 — Painel de iniciativa

**Épico:** E06 · **Depende de:** RV-062 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0):** as cinco estão no bloco ao fim do card, escrito na execução. Duas coisas
> que ele fechou e que eram dívida de outros cards: `'combate'` entrou em `CACHES_RESSINCRONIZADOS` (o passo
> que o RV-061 deixou pendente de propósito) e a frase de desempate passou a ser **renderizada**, fechando o
> item de DoD que o RV-158 tinha deixado pela metade. **Limitação nomeada:** o painel cruza os participantes
> com os tokens da **cena ativa**, e nada impede o mestre de ativar outra cena no meio da luta — quando isso
> acontece, PV, botões de dano, seletor de iniciativa e realce desaparecem sem explicação. É
> [RV-067](#rv-067--trocar-a-cena-ativa-no-meio-do-combate-esvazia-o-painel-sem-dizer-por-quê).

**História**
> Como **jogador**, quero **ver a ordem do combate e de quem é a vez**, para **me preparar antes do meu turno**.

**Escopo**
- `apps/web/src/features/jogo/PainelIniciativa.tsx` + nova aba "⚔️ Combate" na `PaginaMesa`
- `apps/web/src/features/jogo/api.ts`: `useCombate(mesaId)`, mutations de turno
- `use-socket-mesa`: trata `combate:atualizado` atualizando `['combate', mesaId]`
- Realce do token do turno no `Tabletop`

**Critérios de aceite**
```gherkin
Cenário: Ordem visível para todos
  Dado um combate ativo
  Então todos veem a lista ordenada com iniciativa, nome e destaque no turno atual

Cenário: Minha vez é evidente
  Quando chegar o turno do meu personagem
  Então a aba de combate sinaliza a minha vez de forma perceptível sem depender só de cor

Cenário: Sem combate
  Dado que não há combate ativo
  Então a aba mostra estado vazio, com botão de iniciar apenas para o mestre
```

**DoD específico**
- [x] Sinalização do turno não depende apenas de cor (acessibilidade).

**Decisões registradas na execução** (v0.9.0):

- **Três canais para o turno, nenhum deles a cor.** Na aba: `aria-current="true"` no item da ordem mais a
  palavra escrita ("▶ Na vez", ou "▶ Sua vez" quando a peça é minha), e um aviso com `role="status"`
  quando a vez é minha. No mapa: um marcador `role="img"` com `aria-label`/`title` "No turno" e o mesmo
  texto acrescentado ao rótulo do botão da peça — a moldura dourada é só reforço. `role="status"` e não
  `alert`: o aviso não pode roubar o foco de quem está digitando no chat.
- **O painel não ordena e não recalcula o turno.** A lista é renderizada na ordem em que veio e o realce
  sai de `tokenIdDoTurno`. Reordenar ou derivar do `indiceTurno` seria uma segunda implementação da regra
  do agregado — e a frase de desempate que a tela mostra (`REGRA_DESEMPATE_INICIATIVA`, do RV-158)
  passaria a descrever o que a tela faz em vez do que o servidor faz (F6).
- **Encerrar o combate pede confirmação.** É irreversível para a ordem daquela luta (a próxima começa com
  todas as iniciativas em branco) e afeta a tela de todo mundo. Diálogo próprio, com foco preso, e o texto
  diz exatamente o que se perde e o que fica.
- **O mestre escolhe as peças por caixas de seleção**, todas marcadas por padrão: o `tokenIds` da rota é
  uma escolha, e iniciar com a cena inteira é o caso comum. Cena sem peça nenhuma explica o que falta em
  vez de oferecer um botão que produziria 400.
- **`'combate'` entrou em `CACHES_RESSINCRONIZADOS`** (`use-socket-mesa.ts`), fechando o passo que o
  RV-061 deixou pendente: sem ele, uma queda de conexão no meio da luta deixava o painel apontando o
  turno de quem já agiu até o próximo evento chegar (RV-112).

---

### RV-064 — Condições e estados no token

**Épico:** E06 · **Depende de:** RV-063 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0).**
> - **Uma condição por requisição** (`{ condicao, aplicada }`), e não a lista inteira substituída. O card só
>   dizia `PATCH /tokens/:tokenId/condicoes`; substituição total é last-write-wins, e o `inconsciente` do
>   RV-065 apagaria em silêncio o `envenenado` que o mestre acabou de marcar. Delta de um item é a menor
>   escrita que expressa a intenção, e é idempotente por construção.
> - **Nenhum `check` enumerando as condições no SQL**, com o motivo escrito na própria migration: seria a
>   mesma lista em duas linguagens, o defeito que o `check` de `mesas.sistema` cobrou (RV-096). Em vez de
>   criar a segunda lista e depois uma guarda para compará-las, o teste **proíbe a cópia** — ele varre o SQL
>   procurando cada chave do catálogo e falha nomeando as que apareceram.
> - **`text[] not null default '{}'`**, e não só `default`: sem o `not null`, "sem condição" teria duas
>   representações no banco (`null` e `{}`) tratadas como sinônimos pela aplicação — semente de F12.
> - **`Token.reconstituir` descarta chave fora do catálogo** em vez de propagá-la: condição retirada de
>   circulação faz a peça perder o marcador, não a cena inteira ficar ilegível. `aplicarCondicao` recebe
>   `string` de propósito, para a recusa existir no domínio e não só na forma de quem chama.
> - **Nenhum evento WS novo:** a marcação viaja no `token:atualizado`, que já tem ouvinte. Evento próprio com
>   payload idêntico seria mais um contrato a manter e um candidato a nascer órfão (F2).
> - **Só o mestre marca condição**, como as outras propriedades do token (RV-040); o jogador continua movendo a
>   peça do próprio personagem, e há teste de contrato provando as duas coisas na mesma requisição.
> - Migration `0011_condicoes` **aplicada** no banco em uso, porque `condicoes` entrou em `COLUNAS_TOKEN` —
>   deixá-la em disco derrubaria todo select de token contra o Postgres (F10, a classe que derrubou o chat na
>   v0.5.0).
> - **O catálogo é agnóstico de sistema, e isso tem limite:** em PF2e `enfraquecido` e `lento` são numéricos
>   (mexem em acerto, CD e número de ações) e aqui são só marcadores. O lugar do efeito é `DefinicaoSistema`,
>   não este catálogo — não virou card por ser profundidade de sistema, e não defeito.

**História**
> Como **mestre**, quero **marcar condições como envenenado, caído ou atordoado**, para **que a mesa lembre dos efeitos ativos**.

**Escopo**
- Migration: `tokens.condicoes text[] default '{}'`
- `packages/shared/src/schemas/jogo.ts`: catálogo `CONDICOES` (chave + rótulo PT-BR + ícone) — extensível por adição, não por `if` central
- `Token.aplicarCondicao/removerCondicao`
- `PATCH /tokens/:tokenId/condicoes`
- `Tabletop`: ícones no canto do token, com `title` e `aria-label`

**Critérios de aceite**
```gherkin
Cenário: Aplicar condição
  Quando eu marcar "envenenado" no token
  Então o ícone aparece para todos com rótulo acessível "Envenenado"

Cenário: Condição desconhecida é rejeitada
  Quando eu enviar a condição "banana"
  Então recebo 400

Cenário: Sem duplicatas
  Quando eu aplicar "caído" duas vezes
  Então a condição consta uma única vez
```

---

### RV-065 — Aplicar dano e cura pelo painel

**Épico:** E06 · **Depende de:** RV-064 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0):** as sete estão no bloco ao fim do card. A que mais importa para quem vier
> depois é a que **não** foi tomada: nenhum segundo caminho de escrita de PV nasceu. `AplicarDano` delega a
> `AtualizarPersonagem` por uma port estreita, e a verificação independente confirmou por varredura que
> `pvAtual` só é escrito no contexto de personagens — o combate não guarda PV em tabela, DTO ou cache.

**História**
> Como **mestre**, quero **aplicar dano ou cura direto no painel de combate**, para **não abrir a ficha a cada golpe**.

**Contexto técnico**
- Reusa `AtualizarPersonagem` (que já valida `0 ≤ pvAtual ≤ pvMax`) e o evento `personagem:atualizado` de RV-042.

**Escopo**
- `apps/api/src/aplicacao/jogo/aplicar-dano.ts` (`{ tokenId, delta }`, negativo = dano)
- `POST /combates/:combateId/participantes/:tokenId/pv`
- Mensagem de sistema no chat: "Thorin sofreu 7 de dano (23/30)"
- Front: campo numérico com botões de dano/cura no painel

**Critérios de aceite**
```gherkin
Cenário: Dano atualiza ficha, token e chat
  Dado "Thorin" com 30/30 PV
  Quando eu aplicar 7 de dano
  Então a ficha vai para 23/30, a barra do token acompanha e o chat registra o evento

Cenário: PV não fica negativo
  Dado "Thorin" com 3 PV
  Quando eu aplicar 10 de dano
  Então o PV vai a 0, não a -7
  E o token recebe a condição "inconsciente"

Cenário: Cura respeita o máximo
  Dado "Thorin" com 28/30
  Quando eu curar 10
  Então o PV fica em 30

Cenário: Cura tira a condição que o dano pôs
  Dado "Thorin" inconsciente com 0 PV
  Quando eu curar 8
  Então "inconsciente" sai da peça para todos

Cenário: Token sem personagem
  Quando eu aplicar dano a um token sem ficha vinculada
  Então recebo 400 com mensagem em PT-BR

Cenário: Jogador não aplica dano pelo painel
  Dado que sou jogador
  Quando eu chamar POST /combates/:combateId/participantes/:tokenId/pv
  Então recebo 403, inclusive no meu próprio personagem
  E continuo podendo editar o meu PV na ficha
```

**Decisões registradas na execução** (v0.9.0):

- **Só o mestre aplica dano e cura pelo painel.** A história do card é a dele, e marcar `inconsciente` no token é privativo do mestre (RV-064): dar a rota ao jogador criaria duas autorizações para o mesmo efeito, uma delas capaz de marcar condição em peça alheia. O jogador continua editando o PV na própria ficha, pelo caminho que já existia.
- **A cura desmarca `inconsciente`.** O enunciado só pedia a marcação. Curar e deixar o ícone na peça seria promessa falsa na tela (F6), exatamente na situação em que o painel existe para poupar a lembrança do mestre.
- **`inconsciente` não tira ninguém da ordem nem encerra turno.** Em PF2e um personagem morrendo continua tendo turnos (teste de recuperação); decidir o contrário seria legislar sobre a regra do sistema.
- **`delta` zero é 400**, e não um no-op: gravaria o mesmo valor, publicaria eventos e escreveria "sofreu 0 de dano" no chat.
- **A rota devolve `PersonagemDTO`**, e não o combate: é a ficha que muda, porque o combate não guarda PV (RV-042). O painel recebe a mudança pelo `personagem:atualizado`, e o ícone pelo `token:atualizado` — nenhum `combate:atualizado` é publicado aqui, para não dar três oportunidades de divergir da mesma notícia.
- **A interface faz duas coisas no sucesso** (RV-063): remenda `['personagens', mesaId]` com a ficha que voltou — é dela que saem a barra de vida do token e o PV do painel — e **invalida** `['cena', mesaId]`, porque a marcação de `inconsciente` não vem na resposta. Sem a segunda, quem aplicou o golpe continuaria vendo o marcador antigo na peça até o socket chegar; numa queda de conexão, até o F5.

**Testes obrigatórios**
- Use case: tabela de casos (dano acima do PV, cura acima do máximo, delta zero, token sem personagem).

---

### RV-066 — Iniciativa informada é privilégio do mestre: hoje o jogador escolhe o próprio número

**Épico:** E06 · **Depende de:** RV-061 (✅), RV-158 (✅) · **Tamanho:** P · **Onda:** 2 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0).** Fechado pelo orquestrador na verificação de fim de sprint, no mesmo dia em
> que o card nasceu — o furo é de autorização e a v0.9.0 não seria publicada com ele aberto.
>
> **A recusa é explícita (403), não silenciosa.** O primeiro cenário de aceite pedia que a expressão informada
> fosse **ignorada** e a derivada usada no lugar. Entreguei `403` com
> `INICIATIVA_INFORMADA_E_DO_MESTRE`, e a razão é o próprio catálogo de falhas: aceitar um campo e descartá-lo
> sem dizer nada é a forma da **F8**, a etapa pulada em silêncio. Um cliente que mandasse `expressao` por bug
> ficaria rolando a derivada para sempre sem ninguém descobrir. A história do card é cumprida pelas duas
> saídas; a auditável é esta.
>
> **As duas armadilhas do card foram respeitadas.** O mestre continua informando (é o caminho do NPC), e a
> guarda de peça alheia **vem antes** — quem erra o token continua recebendo `INICIATIVA_DE_TERCEIRO`, sem
> vazar se a peça do outro tem ficha.
>
> **Vermelho conferido:** removi a guarda, o caso de uso ficou vermelho gravando `119` na ordem, restaurei e
> conferi com `git diff`. Um segundo teste cobre a rota (`403` por `app.inject`), porque o único teste que
> existia — "jogador rolando pelo próprio personagem" — **passava mandando `expressao`**, o que fazia o furo
> parecer comportamento pretendido; ele foi reescrito para o caminho derivado. Confirmado também contra o
> ambiente real: `POST /combates/:id/iniciativa` com `{ expressao: '1d20+99' }` como jogador respondeu 403,
> nada foi para o chat e a iniciativa da peça continuou `null`.
>
> **Comentário do front corrigido no mesmo passo:** `painel-iniciativa.ts` afirmava que mandar `expressao` "é
> aceito pelo servidor". Deixou de ser.

**História**
> Como **jogador de uma mesa em combate**, quero **que a minha iniciativa saia da minha ficha e não do meu navegador**, para **que a ordem do turno não seja decidida por quem manda o número maior**.

**Contexto técnico**
- **Defeito medido no código na verificação da v0.9.0**, em [rolar-iniciativa.ts](../../apps/api/src/aplicacao/jogo/rolar-iniciativa.ts):
  a primeira linha de `pedidoDeRolagem` é `if (entrada.expressao !== undefined) return ok({ expressao: entrada.expressao, … })`,
  **sem consultar o papel de quem chama**. O papel é olhado alguns passos antes, e só para decidir se vale
  carregar a ficha (`ehMestre && entrada.expressao !== undefined ? null : await this.fichaDoToken(...)`).
- **Como se explora, e por que importa:** um jogador autenticado, dono da peça, faz
  `POST /combates/:id/iniciativa` com `{ tokenId, expressao: '1d20+99' }`. A guarda de dono passa (a peça é
  dele), a expressão informada vence a derivação, o total é gravado na ordem e a rolagem aparece no chat como
  qualquer outra. Iniciativa é **competitiva**: isso decide a sequência do turno inteiro da luta.
- **É a variante mais discreta da F4** da [taxonomia](../agentes/taxonomia-de-falhas.md): a proteção existe
  **só na interface**. O front do RV-063 nunca manda `expressao` para peça com ficha (há teste de objeto
  inteiro fixando `{ tokenId }`), então nada na suíte fica vermelho — e a proteção some no primeiro chamador
  novo, exatamente como aconteceu com o RV-160.
- **A decisão já está tomada e escrita**, o que falta é a guarda: o RV-158 justificou derivar no servidor com
  a frase "a iniciativa é competitiva, então um `1d20+99` autenticado decide a ordem do turno inteiro". Este
  card não reabre a decisão, só a cumpre.
- **Armadilha — não recuse a expressão do mestre.** Ela é o caminho do NPC sem ficha e do valor combinado na
  mesa; sem ela o combate trava. A regra é por papel, não por presença do campo.
- **Armadilha — o 403 de peça alheia precisa continuar vindo antes.** A ordem das guardas foi escolhida para
  que o jogador que rola pela peça de outro receba `403`, e não um `400` de "sem ficha" que vazaria
  informação sobre a peça alheia.

**Escopo**
- `apps/api/src/aplicacao/jogo/rolar-iniciativa.ts` — `expressao` só manda quando quem chama é o mestre
- `apps/api/src/aplicacao/jogo/iniciativa-do-sistema.test.ts` (ou `combate.test.ts`) — os casos abaixo

**Critérios de aceite**
```gherkin
Cenário: Jogador não escolhe o próprio número
  Dado que sou jogador e a peça é do meu personagem
  Quando eu rolar iniciativa informando a expressão "1d20+99"
  Então a expressão informada é ignorada e a iniciativa sai da minha ficha pelo sistema da mesa
  E a linha do chat diz qual regra foi aplicada

Cenário: Mestre continua digitando a iniciativa do NPC
  Dado que sou o mestre e a peça não tem ficha
  Quando eu rolar iniciativa com expressao "17"
  Então o participante entra na ordem com 17

Cenário: Borda — jogador com peça sem ficha
  Dado que sou jogador e a minha peça não tem ficha vinculada
  Quando eu rolar iniciativa informando "1d20+5"
  Então recebo uma recusa em PT-BR e nenhuma iniciativa é gravada

Cenário: Autorização não regride
  Dado que sou jogador
  Quando eu rolar iniciativa pela peça de outro jogador
  Então recebo 403, antes de qualquer leitura de ficha
```

**Testes obrigatórios**
- Use case com fakes: o jogador informando expressão recebe a derivada da ficha (compare com o que
  `iniciativaEscolhida` declara, não com uma expressão escrita à mão no teste).
- Contrato: a rota como jogador com `expressao` não grava o número informado.

**DoD específico**
- [ ] Nenhuma proteção nova depende de o cliente omitir um campo.

---

### RV-067 — Trocar a cena ativa no meio do combate esvazia o painel sem dizer por quê

**Épico:** E06 · **Depende de:** RV-063 (✅) · **Tamanho:** P · **Onda:** 2

**História**
> Como **mestre que mudou de mapa no meio da luta**, quero **entender por que o painel perdeu PV, botões e realce**, para **não achar que o combate se corrompeu**.

**Contexto técnico**
- **Medido na entrega do RV-063.** `Combate.cenaId` é fixado quando a luta começa, mas o painel cruza os
  participantes com os tokens da **cena ativa** (`['cena', mesaId]`) — é de lá que saem o vínculo peça↔ficha
  (`TokenDTO.personagemId`), o PV e as opções de iniciativa. E nada impede a troca:
  [ativar-cena.ts](../../apps/api/src/aplicacao/jogo/ativar-cena.ts) não consulta o combate.
- **O que o usuário vê:** ordem, rodada e turno continuam corretos, mas **todos** os participantes perdem PV,
  botões de dano/cura e seletor de iniciativa, o realce não aparece em peça nenhuma, e nenhuma mensagem
  explica. É a classe F6 pelo avesso — a tela não mente, ela emudece.
- **Três saídas possíveis, e a escolha é de produto:**
  1. o backend recusa ativar outra cena com combate ativo (409, e o mestre encerra antes);
  2. o painel compara `combate.cenaId` com a cena ativa e **avisa em PT-BR** que a luta é de outra cena,
     mantendo a ordem legível e travando o que depende da peça;
  3. o combate acompanha a cena nova — o que exige repensar a lista de participantes.
- **Recomendação registrada na execução:** a (2) é a mais barata, é puro front e não legisla sobre como a mesa
  usa mapas (mudar de sala no meio da perseguição é jogo legítimo). A (1) é defensável, mas transforma uma
  troca de mapa em erro.
- **Armadilha — não invente estado novo.** Tanto o `cenaId` do combate quanto o da cena ativa já viajam nos
  DTOs; comparar os dois no lugar onde os dois já são lidos evita uma terceira verdade sobre "qual é a cena
  da luta".

**Escopo**
- `apps/web/src/features/jogo/painel-iniciativa.ts` e `PainelIniciativa.tsx` — a comparação e o aviso
- Se a decisão for a (1): `apps/api/src/aplicacao/jogo/ativar-cena.ts` + teste de contrato do 409

**Critérios de aceite**
```gherkin
Cenário: A luta é de outra cena
  Dado um combate ativo iniciado na cena "Cripta"
  Quando o mestre ativar a cena "Pátio"
  Então o painel continua mostrando ordem, rodada e turno
  E diz, em PT-BR, que a luta é de outra cena e por isso PV e ações estão indisponíveis

Cenário: Voltar à cena da luta restaura tudo
  Quando o mestre reativar a cena "Cripta"
  Então PV, botões de dano/cura e seletor de iniciativa voltam sem recarregar a página

Cenário: Borda — combate encerrado
  Dado que não há combate ativo
  Então trocar de cena não produz aviso nenhum
```

**Testes obrigatórios**
- Função pura do painel: participante sem token na cena ativa, com o combate apontando outra cena.
- Componente: o aviso aparece e os controles ficam desabilitados **com o motivo visível**, não escondidos.
