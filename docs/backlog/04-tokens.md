# E04 — Tokens

O token hoje é um círculo colorido com nome e posição. Este épico o torna a peça central do combate.

---

### RV-040 — Editar token

**Épico:** E04 · **Depende de:** — · **Tamanho:** P · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega:** `renomear`/`recolorir` existem porque o card os nomeia, mas
> delegam a `atualizar`, que é o único ponto de validação e de atribuição — edição parcial é atômica
> (valida tudo antes de escrever qualquer campo). A **cor passou a ser validada no domínio**
> (`MENSAGEM_COR_TOKEN`), não só no Zod; `Token.reconstituir` continua sem revalidar, então dado
> legado carrega normalmente e só é recusado na primeira edição — a tabela `tokens` tem default
> `'#e74c3c'` sem check constraint. A guarda do mestre vive em
> [acesso-token.ts](../../apps/api/src/aplicacao/jogo/acesso-token.ts)
> (`carregarTokenParaEscritaDoMestre`), gêmeo de `acesso-cena.ts`: nenhuma escrita de propriedade
> nasce sem ela. `MoverToken` **não** usa esse helper de propósito — é a escrita que o jogador faz.
> O `PATCH` reusa o broadcast `token:atualizado`, então o front não precisou de handler novo.

**História**
> Como **mestre**, quero **renomear e recolorir um token já criado**, para **corrigir erros sem apagar e recriar a peça**.

**Contexto técnico**
- Hoje só existe criar, mover e remover ([token.ts](../../apps/api/src/dominio/jogo/token.ts)).

**Escopo**
- `Token.renomear(nome)`, `Token.recolorir(cor)` com as validações de `criar`
- `apps/api/src/aplicacao/jogo/atualizar-token.ts`
- `PATCH /tokens/:tokenId`
- Front: painel de propriedades do token selecionado no `Tabletop`

**Critérios de aceite**
```gherkin
Cenário: Renomear reflete em tempo real
  Quando eu renomear o token "Gob1" para "Chefe Goblin"
  Então todos os participantes veem o novo nome sem recarregar

Cenário: Só o mestre edita propriedades
  Dado que sou jogador e o token é do meu personagem
  Quando eu tentar renomeá-lo
  Então recebo 403 — jogador move, mas não edita propriedades
```

**Testes obrigatórios**
- Domínio: nome vazio ou > 60 caracteres → `validacao`.
- Use case: jogador → `nao-autorizado`.

---

### RV-041 — Imagem no token

**Épico:** E04 · **Depende de:** RV-032 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega:** bucket **`tokens` separado** do `mapas` (mesma política pública,
> para que cota e limpeza de um não arrastem o outro), com o mesmo adapter instanciado duas vezes no
> composition root. As constantes de tipo/tamanho são **aliases** das do fundo em `@rolavinte/shared`
> — apertar o limite vale para os dois uploads de uma vez; só o texto da mensagem de tamanho é
> próprio. O `fileSize` do `@fastify/multipart` virou `Math.max(...)` das duas constantes: **quem
> adicionar um terceiro upload precisa somar a sua ao cálculo**, senão o upload passa a morrer em 413
> pelo motivo errado. O caminho é `tokens/{tokenId}/{uuid}.{ext}` com extensão derivada do mimetype
> validado — o `filename` do cliente é lido e descartado. **O bucket ainda não existe em ambiente
> nenhum (ver [RV-138](13-operacao.md)); a limpeza da arte ao excluir token ou cena ficou faltando e
> virou [RV-047](#rv-047--apagar-a-arte-do-token-do-storage-ao-excluir-token-ou-cena).**

**História**
> Como **mestre**, quero **usar arte no token**, para **que a mesa reconheça personagens e monstros de relance**.

**Escopo**
- Migration: `tokens.imagem_url text`
- Reuso da port `ArmazenamentoArquivos` (bucket `tokens`)
- `POST /tokens/:tokenId/imagem`
- `Tabletop`: renderiza a imagem recortada em círculo; sem imagem, mantém o comportamento atual (cor + iniciais)

**Critérios de aceite**
```gherkin
Cenário: Token com arte
  Quando eu subir um PNG para o token "Chefe Goblin"
  Então ele passa a exibir a arte recortada em círculo para todos
  E a borda mantém a cor definida

Cenário: Fallback sem imagem
  Dado um token sem imagem
  Então ele continua exibindo cor de fundo e as 4 primeiras letras do nome

Cenário: Imagem quebrada não quebra o mapa
  Dado um token cuja URL de imagem retorna 404
  Então o token cai no fallback de cor sem erro no console
```

**Testes obrigatórios**
- Use case com fake de armazenamento (tipo/tamanho, como em RV-032).

---

### RV-042 — Barra de vida vinculada à ficha

**Épico:** E04 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega:** o "zero estado duplicado" ficou **amarrado por teste**, não por
> disciplina: a migration `0004` diz por escrito que não cria coluna de PV, `tokens.test.ts` crava as
> chaves exatas do `TokenDTO` e `rotas-tokens.test.ts` compara o token byte a byte antes e depois de
> um dano. O evento novo `personagem:atualizado` (payload `PersonagemDTO`) deixou 3 testes do web
> vermelhos até o ouvinte existir — **foi o mecanismo do [RV-115](11-tempo-real.md) funcionando**, o
> mesmo buraco por onde `mesa:participante-removido` passou.
> **Contradição do enunciado, resolvida:** o primeiro cenário diz "40% em vermelho" e o terceiro
> define âmbar entre 25% e 50%. Valeu a regra das faixas — 12/30 PV é **âmbar** —, com os limites
> exatos fixados em teste (51% saudável, 50% ferido, 25% ferido, 24% crítico) e a decisão escrita em
> [aparencia.ts](../../apps/web/src/features/jogo/aparencia.ts). Mudar isso exige mudar o texto do
> card junto, senão a contradição volta no próximo agente.

**História**
> Como **jogador**, quero **ver a vida dos personagens no próprio token**, para **acompanhar o combate sem abrir cada ficha**.

**Contexto técnico**
- `Token.personagemId` já existe. A barra reflete `pvAtual/pvMax` do personagem vinculado — **sem duplicar estado**: o front cruza os dados que já carrega (`['cena', mesaId]` e `['personagens', mesaId]`).
- Ao atualizar personagem (`AtualizarPersonagem`), publique `personagem:atualizado` na sala da mesa para que a barra mude ao vivo.

**Escopo**
- `PublicadorEventosMesa.personagemAtualizado(mesaId, personagem)` + evento em `eventos-ws.ts`
- `AtualizarPersonagem` publica o evento
- `use-socket-mesa`: atualiza o cache `['personagens', mesaId]`
- `Tabletop`: barra sobre o token quando há personagem vinculado

**Critérios de aceite**
```gherkin
Cenário: Dano aparece no mapa
  Dado que o token "Thorin" está vinculado ao personagem com 30/30 PV
  Quando o mestre alterar o PV atual para 12
  Então a barra do token vai para 40% em vermelho para todos, sem recarregar

Cenário: Token sem vínculo não tem barra
  Dado um token de objeto sem personagem
  Então nenhuma barra é exibida

Cenário: Faixas de cor
  Então a barra é verde acima de 50%, âmbar entre 25% e 50% e vermelha abaixo de 25%
```

**Testes obrigatórios**
- Use case: `AtualizarPersonagem` publica exatamente um evento por atualização bem-sucedida e nenhum em falha.

**DoD específico**
- [ ] Zero estado duplicado: o PV vive apenas no cache de personagens.

---

### RV-043 — Tokens ocultos do jogador

**Épico:** E04 · **Depende de:** RV-040 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre**, quero **preparar monstros invisíveis para os jogadores**, para **revelar a emboscada na hora certa**.

**Contexto técnico**
- Segurança real: o token oculto **não pode ser enviado** ao jogador. Filtre no use case `ObterCenaAtiva` e no broadcast, não no CSS.

**Escopo**
- Migration: `tokens.oculto boolean default false`
- `Token.ocultar()/revelar()`; `ObterCenaAtiva` filtra ocultos quando o solicitante não é mestre
- `PublicadorEventosMesa`: broadcast de token oculto vai só para os sockets do mestre (sala `mesa:{id}:mestre`)
- `GatewayJogo`: mestre entra também na sala de mestre
- Front: token oculto renderizado com opacidade e ícone 👁 para o mestre

**Critérios de aceite**
```gherkin
Cenário: Jogador não recebe o token oculto
  Dado um token oculto na cena ativa
  Quando o jogador chamar GET /mesas/:mesaId/cena
  Então o token não aparece na resposta

Cenário: Movimento de token oculto não vaza
  Quando eu mover um token oculto
  Então apenas os sockets do mestre recebem "token:atualizado"

Cenário: Revelar propaga na hora
  Quando eu revelar o token
  Então todos os participantes passam a vê-lo imediatamente
```

**Testes obrigatórios**
- Use case: resposta de `ObterCenaAtiva` para jogador não contém tokens ocultos (asserção sobre o payload, não sobre a UI).
- Contrato/WS: broadcast direcionado à sala de mestre.

---

### RV-044 — Camadas do mapa

**Épico:** E04 · **Depende de:** RV-043 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre**, quero **separar cenário, tokens e anotações em camadas**, para **posicionar mobília sem esbarrar nos personagens**.

**Escopo**
- Migration: `tokens.camada text check (camada in ('mapa','tokens','mestre')) default 'tokens'`
- Regra: camada `mestre` segue as garantias de RV-043; camada `mapa` não é arrastável por jogador
- Front: seletor de camada ativa no painel do mestre; ordem de renderização mapa → tokens → mestre

**Critérios de aceite**
```gherkin
Cenário: Ordem de empilhamento
  Dado tokens nas três camadas na mesma célula
  Então o de "mapa" fica atrás, "tokens" no meio e "mestre" na frente

Cenário: Jogador não interage com a camada de mapa
  Quando o jogador clicar sobre uma peça de cenário
  Então a seleção passa para o token de personagem abaixo do cursor, se houver

Cenário: Camada de mestre é invisível ao jogador
  Então tokens na camada "mestre" nunca são enviados a jogadores
```

---

### RV-045 — Seleção múltipla e movimento em grupo

**Épico:** E04 · **Depende de:** RV-034 · **Tamanho:** G · **Onda:** 2

**História**
> Como **mestre**, quero **selecionar e mover vários tokens de uma vez**, para **reposicionar um bando de goblins sem 8 arrastos**.

**Contexto técnico**
- Movimento em lote precisa de endpoint próprio para não gerar N requisições e N broadcasts.

**Escopo**
- `packages/shared`: `moverTokensSchema` (lista de `{ tokenId, x, y }`, máx. 50)
- `apps/api/src/aplicacao/jogo/mover-tokens.ts` — autoriza **cada** token individualmente e falha tudo se algum não for permitido
- `PATCH /cenas/:cenaId/tokens/posicoes` + broadcast `token:lote-atualizado`
- Front: seleção por retângulo (arrasto no vazio) e Shift+clique; arrasto move o conjunto mantendo deslocamentos relativos

**Critérios de aceite**
```gherkin
Cenário: Mover 5 tokens de uma vez
  Dado 5 tokens selecionados
  Quando eu arrastar o grupo 3 células à direita
  Então uma única requisição é enviada
  E os 5 tokens aparecem deslocados para todos, mantendo as posições relativas

Cenário: Lote com token proibido falha inteiro
  Dado que a seleção inclui um token que não posso mover
  Quando eu soltar o grupo
  Então recebo 403 e nenhum token é movido

Cenário: Lote fora dos limites
  Quando o deslocamento levar qualquer token para fora do grid
  Então recebo 400 e nenhum token é movido
```

**Testes obrigatórios**
- Use case: atomicidade (nenhuma escrita parcial) nos dois cenários de falha.

---

### RV-046 — Arrastar ficha para o mapa

**Épico:** E04 · **Depende de:** RV-041 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre**, quero **arrastar um personagem da lista direto para o mapa**, para **montar a cena de combate em segundos**.

**Escopo**
- Front: `PainelPersonagens` com itens arrastáveis (HTML5 drag ou pointer events, coerente com o arrasto já usado no `Tabletop`)
- `Tabletop` como alvo de soltura: calcula a célula e chama `useCriarToken` com `personagemId`, nome e cor derivados do personagem
- Nenhuma rota nova

**Critérios de aceite**
```gherkin
Cenário: Ficha vira token
  Quando eu arrastar "Thorin" da lista e soltar na célula (5,4)
  Então um token vinculado a "Thorin" é criado em (5,4) com o nome do personagem
  E ele já nasce com a barra de vida da ficha

Cenário: Personagem já no mapa
  Dado que "Thorin" já tem um token na cena ativa
  Quando eu arrastá-lo novamente
  Então recebo aviso em PT-BR e nenhum token duplicado é criado

Cenário: Jogador não cria tokens
  Dado que sou jogador
  Então os itens da lista não são arrastáveis para o mapa
```

**Testes obrigatórios**
- Use case `CriarToken`: rejeita segundo token para o mesmo `personagemId` na mesma cena (nova invariante — cubra também no domínio).

---

### RV-047 — Apagar a arte do token do Storage ao excluir token ou cena

**Épico:** E04 · **Depende de:** RV-041 · **Tamanho:** P · **Onda:** 2

**História**
> Como **operador**, quero **que a arte de um token suma do armazenamento quando a peça deixa de existir**, para **não pagar por um bucket que só cresce e nunca é limpo**.

**Contexto técnico**
- Defeito real deixado pelo RV-041: **toda arte enviada fica órfã para sempre** no bucket `tokens`.
- [remover-token.ts](../../apps/api/src/aplicacao/jogo/remover-token.ts) apaga a linha (`cenas.removerToken`) e publica `token:removido`, mas nunca chama `armazenamento.remover(token.imagemCaminho)` — o caso de uso **nem recebe** a port `ArmazenamentoArquivos` no construtor (`main.ts:191` injeta só `cenas`, `mesas`, `publicador`).
- [remover-cena.ts](../../apps/api/src/aplicacao/jogo/remover-cena.ts) limpa só `cena.imagemFundoCaminho`. Os tokens da cena somem por cascata no banco (`tokens.cena_id on delete cascade`, migration `0001`), e as artes deles ficam no bucket: o caso de uso só recebe o armazenamento de **mapas** (`main.ts:171`), não o de tokens.
- O padrão correto já existe no repositório: `DefinirImagemToken` e `DefinirImagemFundoCena` apagam o arquivo anterior em **best-effort** (`try/catch` que engole) — arquivo órfão é lixo, não inconsistência de domínio, e a falha do Storage não pode desfazer uma exclusão já persistida.
- **Armadilha 1:** em `RemoverCena`, os caminhos precisam ser lidos **antes** do `cenas.remover(cenaId)` — depois da cascata não há mais de onde tirá-los. `CenaRepository.listarTokensDaCena` já existe.
- **Armadilha 2:** são **dois** armazenamentos distintos (buckets `mapas` e `tokens`), instâncias separadas do mesmo adapter no composition root. `RemoverCena` passa a precisar dos dois; o harness já expõe `fakes.armazenamento` e `fakes.armazenamentoTokens` separados exatamente para o teste provar em qual bucket cada arquivo caiu.
- **Armadilha 3:** não transforme isto em varredura do bucket. Limpeza é derivada do caminho guardado na entidade; um "coletor de órfãos" é outro problema (e outro card).

**Escopo**
- `apps/api/src/aplicacao/jogo/remover-token.ts`: recebe `ArmazenamentoArquivos` e limpa `token.imagemCaminho`
- `apps/api/src/aplicacao/jogo/remover-cena.ts`: lista os tokens antes de excluir e limpa as artes no armazenamento de tokens
- `apps/api/src/main.ts` e `apps/api/src/testes/harness.ts`: injeção das instâncias
- `apps/api/src/aplicacao/jogo/tokens.test.ts` e `cenas.test.ts`: casos novos

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — excluir o token leva a arte junto
  Dado um token com arte enviada pelo RV-041
  Quando o mestre remover o token
  Então o token some da cena
  E o arquivo dele não está mais no armazenamento de tokens

Cenário: Caminho feliz — excluir a cena leva as artes dos tokens
  Dado uma cena inativa com 3 tokens, sendo 2 com arte, e um mapa de fundo
  Quando o mestre excluir a cena
  Então as 2 artes e o mapa somem do armazenamento
  E as artes dos tokens da cena que continua ativa permanecem

Cenário: Autorização — jogador não apaga nada
  Dado que sou jogador e o token é do meu personagem
  Quando eu chamar DELETE /tokens/:tokenId
  Então recebo 403
  E nenhum arquivo é removido do armazenamento

Cenário: Borda — Storage indisponível não trava a exclusão
  Dado que o armazenamento falha ao remover
  Quando o mestre remover o token
  Então a exclusão é concluída (204) e o evento token:removido é publicado
  E nenhuma exceção vaza para a rota
```

**Testes obrigatórios**
- Use case com fakes: `RemoverToken` de token **com** arte registra o caminho em `caminhosRemovidos`; de token **sem** arte não chama `remover` nenhuma vez.
- Use case com fakes: `RemoverCena` remove o mapa no armazenamento de mapas **e** as artes no de tokens, sem tocar nas artes de outra cena.
- Use case com fakes: armazenamento que lança no `remover` não impede a exclusão nem o broadcast (nos dois casos de uso).

**DoD específico**
- [ ] Limpeza best-effort: falha de Storage nunca vira erro de domínio nem desfaz a escrita.
- [ ] Nenhum caminho de arquivo é reconstruído a partir da URL — sempre o `imagemCaminho` guardado na entidade.
