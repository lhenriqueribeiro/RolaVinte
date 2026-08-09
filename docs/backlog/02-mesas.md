# E02 — Mesas e participação

O agregado `Mesa` já protege criação, convite e aceite. Falta todo o ciclo de vida depois disso: gerir convites, tirar gente, sair, encerrar e transferir a mestrança.

---

### RV-020 — Gerir convites da mesa

**Épico:** E02 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **mestre**, quero **ver, reenviar e revogar os convites da minha mesa**, para **acompanhar quem ainda não entrou e cancelar convites enviados por engano**.

**Contexto técnico**
- `Mesa` já guarda `convites` com `status` e cooldown de reenvio ([mesa.ts](../../apps/api/src/dominio/mesas/mesa.ts)); nada disso é exposto por rota.

**Escopo**
- `apps/api/src/dominio/mesas/mesa.ts`: `revogarConvite(solicitanteId, conviteId)` — só mestre, só pendente
- `apps/api/src/aplicacao/mesas/listar-convites.ts`, `revogar-convite.ts`
- `apps/api/src/apresentacao/http/rotas-mesas.ts`: `GET /mesas/:mesaId/convites`, `DELETE /mesas/:mesaId/convites/:conviteId`
- `apps/web/src/features/jogo/PainelMestre.tsx`: lista de convites pendentes com ações

**Critérios de aceite**
```gherkin
Cenário: Mestre vê os convites pendentes
  Dado que convidei "novo@ex.com" e o convite não foi aceito
  Quando eu abrir o painel do mestre
  Então vejo "novo@ex.com" como pendente com a data de envio

Cenário: Revogar convite invalida o link
  Dado um convite pendente para "novo@ex.com"
  Quando eu revogá-lo
  E o convidado abrir o link recebido
  Então ele vê "Convite não encontrado ou já utilizado."

Cenário: Jogador não gere convites
  Dado que sou jogador na mesa
  Quando eu chamar GET /mesas/:mesaId/convites
  Então recebo 403
```

**Testes obrigatórios**
- Domínio: revogar convite já aceito → `conflito`; revogar como jogador → `nao-autorizado`.
- Contrato: 403 para jogador, 200 para mestre.

**DoD específico**
- [ ] Convite revogado tem status próprio (`revogado`), não é apagado — histórico preservado.
- [ ] `check constraint` de `convites.status` atualizado por nova migration.

---

### RV-021 — Remover jogador da mesa

**Épico:** E02 · **Depende de:** RV-020 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **mestre**, quero **remover um jogador da mesa**, para **encerrar a participação de quem saiu do grupo**.

**Contexto técnico**
- Invariante de [02-ddd.md](../../.claude/rules/02-ddd.md): o mestre não pode remover a si mesmo.
- Decidir o destino dos personagens do removido: **mantê-los na mesa** (o mestre continua precisando das fichas do histórico), marcando-os como órfãos na UI.

**Escopo**
- `apps/api/src/dominio/mesas/mesa.ts`: `removerJogador(solicitanteId, usuarioId)`
- `apps/api/src/aplicacao/mesas/remover-jogador.ts`
- `DELETE /mesas/:mesaId/jogadores/:usuarioId`
- Broadcast: novo evento `mesa:participante-removido` em `PublicadorEventosMesa` e no contrato `eventos-ws.ts`
- Front: lista de participantes com ação de remover (só para mestre)

**Critérios de aceite**
```gherkin
Cenário: Jogador removido perde o acesso na hora
  Dado que o jogador "Bruno" está com a mesa aberta
  Quando eu removê-lo
  Então ele é retirado da sala do socket
  E a próxima chamada dele a GET /mesas/:mesaId devolve 403
  E os demais participantes veem a lista atualizada

Cenário: Mestre não se remove
  Quando eu tentar remover a mim mesmo sendo o mestre
  Então recebo 403 com a orientação de encerrar ou transferir a mesa

Cenário: Personagens do removido permanecem
  Dado que "Bruno" tinha um personagem na mesa
  Quando eu removê-lo
  Então o personagem continua listado, marcado como "sem jogador"
```

**Testes obrigatórios**
- Domínio: mestre removendo a si → `nao-autorizado`; remover quem não participa → `nao-encontrado`.
- Contrato: 204 e participação efetivamente removida.

---

### RV-022 — Sair da mesa

**Épico:** E02 · **Depende de:** RV-021 · **Tamanho:** P · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **jogador**, quero **sair de uma mesa**, para **limpar meu painel de campanhas que não jogo mais**.

**Escopo**
- `apps/api/src/dominio/mesas/mesa.ts`: `sair(usuarioId)`
- `apps/api/src/aplicacao/mesas/sair-da-mesa.ts`
- `POST /mesas/:mesaId/sair`
- Front: ação no card da mesa no dashboard, com confirmação

**Critérios de aceite**
```gherkin
Cenário: Jogador sai
  Dado que participo da mesa "Strahd" como jogador
  Quando eu sair e confirmar
  Então a mesa some do meu dashboard
  E não consigo mais abrir a mesa

Cenário: Mestre não pode sair da própria mesa
  Dado que sou o mestre
  Quando eu tentar sair
  Então recebo 403 com a orientação de transferir a mestrança ou encerrar a mesa
```

**Testes obrigatórios**
- Domínio: invariante "mestre não sai da própria mesa".

---

### RV-023 — Encerrar e arquivar mesa

**Épico:** E02 · **Depende de:** RV-022 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **mestre**, quero **encerrar uma campanha mantendo o histórico**, para **fechar o ciclo sem perder as fichas e o log da mesa**.

**Contexto técnico**
- Arquivar (soft) em vez de deletar. Exclusão definitiva fica em RV-135 (LGPD).

**Escopo**
- Migration: `mesas.encerrada_em timestamptz`
- `Mesa.encerrar(solicitanteId, agora)` e bloqueio de escrita em mesa encerrada
- Guarda nos use cases de jogo: mesa encerrada → `conflito`
- `POST /mesas/:mesaId/encerrar`
- Front: seção "Encerradas" no dashboard, mesa abre em modo somente leitura

**Critérios de aceite**
```gherkin
Cenário: Mesa encerrada vira somente leitura
  Dado que encerrei a mesa "Strahd"
  Quando qualquer participante tentar enviar mensagem, rolar dados ou mover token
  Então recebe 409 com "Esta mesa foi encerrada."
  E ainda consegue ler o histórico e as fichas

Cenário: Mesa encerrada sai da lista principal
  Quando eu abrir o dashboard
  Então "Strahd" aparece na seção "Encerradas", não entre as ativas

Cenário: Só o mestre encerra
  Dado que sou jogador
  Quando eu chamar POST /mesas/:mesaId/encerrar
  Então recebo 403
```

**Testes obrigatórios**
- Use case: cada operação de escrita do contexto `jogo` rejeita mesa encerrada (tabela de casos).

**DoD específico**
- [ ] A guarda de "mesa encerrada" fica no agregado, não replicada em cada use case.

---

### RV-024 — Editar dados da mesa

**Épico:** E02 · **Depende de:** — · **Tamanho:** P · **Onda:** 2 · **Status:** ✅ Concluído

**História**
> Como **mestre**, quero **corrigir nome, descrição e sistema da mesa**, para **manter a campanha bem identificada**.

**Escopo**
- `Mesa.atualizar(solicitanteId, { nome, descricao, sistema })` reaplicando as validações de `criar`
- `PATCH /mesas/:mesaId`
- Front: formulário no painel do mestre

**Critérios de aceite**
```gherkin
Cenário: Mestre renomeia a mesa
  Quando eu alterar o nome para "A Maldição de Strahd — Ato II"
  Então o novo nome aparece para todos os participantes ao recarregar

Cenário: Validação reaproveitada
  Quando eu enviar um nome com 2 caracteres
  Então recebo 400 com a mesma mensagem da criação
```

**DoD específico**
- [ ] Zero duplicação de regra de validação entre `criar` e `atualizar`.

---

### RV-025 — Transferir mestrança

**Épico:** E02 · **Depende de:** RV-021 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre que vai se ausentar**, quero **passar a mesa para outro participante**, para **que o grupo continue jogando sem recriar tudo**.

**Escopo**
- `Mesa.transferirMestranca(solicitanteId, novoMestreId)` — destino precisa ser participante; papéis trocam
- `POST /mesas/:mesaId/mestrança` (rota: `/mesas/:mesaId/transferir-mestranca`)
- Broadcast `mesa:mestre-alterado`

**Critérios de aceite**
```gherkin
Cenário: Transferência troca os papéis
  Dado que sou mestre e "Bruno" é jogador na mesa
  Quando eu transferir a mestrança para "Bruno"
  Então "Bruno" passa a mestre e eu passo a jogador
  E a mesa continua com exatamente um mestre

Cenário: Destino precisa participar
  Quando eu transferir para um usuário que não está na mesa
  Então recebo 404 e nada muda

Cenário: Poderes mudam imediatamente
  Dado que a transferência ocorreu
  Quando eu (antigo mestre) tentar criar uma cena
  Então recebo 403
```

**Testes obrigatórios**
- Domínio: invariante "exatamente um mestre" verificada após a troca.

---

### RV-026 — Link de convite aberto

**Épico:** E02 · **Depende de:** RV-020 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre**, quero **um link de convite que eu cole no Discord**, para **montar o grupo sem digitar o email de cada um**.

**Contexto técnico**
- Diferente do convite por email (`convites`), este é vinculado à mesa e não a um endereço: `convites_abertos` com `max_usos`, `usos`, `expira_em`.

**Escopo**
- Migration `000X_convites_abertos.sql`
- `Mesa.criarConviteAberto(...)` e `Mesa.aceitarConviteAberto(...)` com as invariantes de limite/expiração
- `POST /mesas/:mesaId/convites-abertos`, `GET /convites-abertos/:token`, `POST /convites-abertos/aceitar`
- Front: botão "Copiar link de convite" e reuso da `PaginaConvite`

**Critérios de aceite**
```gherkin
Cenário: Link com limite de usos
  Dado um link de convite com máximo de 3 usos
  Quando o quarto usuário tentar usá-lo
  Então recebe 409 com "Este link de convite atingiu o limite de usos."

Cenário: Link expirado
  Dado um link com expira_em no passado
  Quando alguém abri-lo
  Então recebe 404 e o link não aparece mais no painel do mestre

Cenário: Entrar duas vezes não duplica participação
  Dado que já participo da mesa
  Quando eu usar o link novamente
  Então recebo 409 e continuo com uma única participação
```

**Testes obrigatórios**
- Domínio: limite de usos, expiração e reentrada.
- Concorrência: dois aceites simultâneos no último uso não podem estourar o limite (documente a estratégia — constraint ou verificação transacional).

---

### RV-027 — Mesa encerrada congela também as fichas

**Épico:** E02 · **Depende de:** RV-023 · **Tamanho:** P · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisão tomada na entrega:** sair da mesa passou a ser permitido **mesmo com a mesa encerrada**.
> A implementação original de RV-023 bloqueava toda mutação do agregado, inclusive `Mesa.sair` — o
> efeito era prender o jogador a campanhas arquivadas para sempre, o oposto do que RV-022 existe para
> resolver. `Mesa.sair` deixou de passar por `garantirAberta()`, com teste de domínio cobrindo.

**História**
> Como **mestre que encerrou a campanha**, quero **que a mesa arquivada bloqueie a edição de fichas como já bloqueia chat, dados e tokens**, para **que o histórico congelado reflita de fato o fim da campanha**.

**Contexto técnico**
- RV-023 concentrou a guarda no agregado: `Mesa.autorizarEscritaDeParticipante` e `Mesa.autorizarEscritaDoMestre` chamam `garantirAberta()` e devolvem `conflito` com a constante `MESA_ENCERRADA` ("Esta mesa foi encerrada.") — ver [mesa.ts](../../apps/api/src/dominio/mesas/mesa.ts). Os **seis** casos de uso do contexto `jogo` passam por lá e têm teste de contrato provando 409.
- O contexto `personagens` ficou fora: [criar-personagem.ts](../../apps/api/src/aplicacao/personagens/criar-personagem.ts) usa `mesa.ehParticipante(usuarioId)` cru e [atualizar-personagem.ts](../../apps/api/src/aplicacao/personagens/atualizar-personagem.ts) usa apenas `personagem.podeSerEditadoPor(...)`. Consequência real: **em mesa encerrada ainda dá para criar ficha e alterar PV/atributos**, contra o invariante escrito no cabeçalho de `mesa.ts` ("mesa encerrada é somente leitura") e contra o texto que o front já exibe ao encerrar ("A mesa vira somente leitura para todo mundo").
- O front espelha o furo: [PaginaMesa.tsx](../../apps/web/src/features/jogo/PaginaMesa.tsx) passa `motivoBloqueio` para `Tabletop`, `Chat` e `PainelMestre`, mas **não** para [PainelPersonagens.tsx](../../apps/web/src/features/personagens/PainelPersonagens.tsx), que nem aceita a prop.
- **Decisão a registrar:** ficha congela junto. Leitura continua liberada — `ListarPersonagens` e abrir a ficha respondem 200 numa mesa encerrada.
- **Armadilha:** a guarda de mesa encerrada é **adicional**, não substituta. `AtualizarPersonagem` precisa continuar distinguindo dono × mestre × terceiro (403 antes de qualquer 409); só depois de passar na regra de propriedade é que o estado da mesa entra.

**Escopo**
- `apps/api/src/aplicacao/personagens/criar-personagem.ts`: trocar a checagem crua por `mesa.autorizarEscritaDeParticipante(usuarioId)`
- `apps/api/src/aplicacao/personagens/atualizar-personagem.ts`: manter `podeSerEditadoPor` e somar a guarda do agregado
- `apps/api/src/aplicacao/personagens/personagens-mesa-encerrada.test.ts` (novo)
- `apps/web/src/features/jogo/PaginaMesa.tsx` e `apps/web/src/features/personagens/PainelPersonagens.tsx` / `FichaPersonagem.tsx`: propagar `motivoBloqueio`

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — ficha congelada com o resto da mesa
  Dado que o mestre encerrou a mesa "Strahd"
  Quando um participante tentar criar uma ficha ou salvar alterações numa existente
  Então recebe 409 com "Esta mesa foi encerrada."
  E a ficha continua legível, com os mesmos PV e atributos de antes da tentativa

Cenário: Autorização — propriedade vem antes do estado da mesa
  Dado que sou jogador e a ficha é de outro jogador
  Quando eu tentar editá-la numa mesa encerrada
  Então recebo 403 ("Só o dono do personagem ou o mestre podem editar a ficha."), não 409

Cenário: Borda — mesa aberta não muda de comportamento
  Dado que a mesa não foi encerrada
  Quando eu criar e editar minha ficha
  Então tudo funciona como antes deste card
```

**Testes obrigatórios**
- Use case com fakes: tabela com as duas escritas (`CriarPersonagem`, `AtualizarPersonagem`) em mesa encerrada → `conflito`; `ListarPersonagens` → sucesso.
- Contrato (`fastify.inject()`): 409 nas duas rotas de escrita de personagem em mesa encerrada, com a ficha inalterada na leitura seguinte.
- Front: `PainelPersonagens` em mesa encerrada mostra a ação desabilitada **com o motivo por escrito** ao lado.

**DoD específico**
- [ ] Nenhum `if (mesa.encerrada)` novo nos casos de uso — a guarda continua sendo a do agregado.
- [ ] Leitura (listar fichas, abrir ficha) continua 200 em mesa encerrada.
- [ ] Botão desabilitado nunca é botão escondido: o motivo aparece na tela, não só no `title`.

---

### RV-028 — Marcar personagem sem jogador

**Épico:** E02 · **Depende de:** RV-021 · **Tamanho:** P · **Onda:** 2

**História**
> Como **mestre**, quero **enxergar quais fichas ficaram sem dono depois que alguém saiu ou foi removido**, para **saber o que reatribuir ou arquivar antes da próxima sessão**.

**Contexto técnico**
- RV-021 decidiu **manter** os personagens de quem sai na mesa, e o terceiro cenário do card exige que eles apareçam "marcados como sem jogador". As duas primeiras partes foram entregues; **a marcação não**.
- Hoje [PainelPersonagens.tsx](../../apps/web/src/features/personagens/PainelPersonagens.tsx) imprime `de {p.donoNome}` sem cruzar com a lista de participantes: a ficha órfã fica indistinguível de uma ativa.
- **Decisão a registrar:** "dono não participa mais" é fato de negócio, calculado no **servidor**. O caso de uso já carrega a mesa; acrescente `semJogador: boolean` ao `PersonagemDTO` em [dtos.ts](../../packages/shared/src/tipos/dtos.ts). O componente React não cruza `donoId` com `mesa.jogadores` — isso seria regra de negócio na UI ([06-frontend.md](../../.claude/rules/06-frontend.md)).
- **Armadilha:** `PersonagemDTO` é devolvido também por `CriarPersonagem` e `AtualizarPersonagem`; os três pontos precisam preencher o campo, senão o `check` quebra (é isso que se quer). O mestre nunca é marcado — ele é participante por definição.

**Escopo**
- `packages/shared/src/tipos/dtos.ts`: `PersonagemDTO.semJogador`
- `apps/api/src/aplicacao/personagens/listar-personagens.ts`, `criar-personagem.ts`, `atualizar-personagem.ts`
- `apps/web/src/features/personagens/PainelPersonagens.tsx` e `FichaPersonagem.tsx`: rótulo textual "Sem jogador"

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — ficha órfã fica identificada
  Dado que "Bruno" tinha o personagem "Thorin" na mesa
  Quando o mestre remover "Bruno"
  Então "Thorin" continua na lista
  E aparece com o rótulo textual "Sem jogador"

Cenário: Autorização — quem não participa não lista
  Dado que não participo da mesa
  Quando eu chamar GET /mesas/:mesaId/personagens
  Então recebo 403 e nenhuma ficha, órfã ou não, é exposta

Cenário: Borda — dono que volta deixa de ser órfão
  Dado que "Bruno" foi removido e "Thorin" está marcado como sem jogador
  Quando "Bruno" aceitar um convite novo para a mesma mesa
  Então "Thorin" volta a exibir o nome dele, sem intervenção do mestre
```

**Testes obrigatórios**
- Use case com fakes: `ListarPersonagens` marca `semJogador` só para donos ausentes (dono ativo, mestre e dono removido na mesma tabela de casos).
- Contrato: resposta de `GET /mesas/:mesaId/personagens` traz o campo com o valor correto após a remoção.
- Front: o rótulo aparece para a ficha órfã e não aparece para a ativa.

**DoD específico**
- [ ] Nenhum cruzamento de participação dentro de componente React.
- [ ] Informação textual, nunca só por cor ([RV-121](12-ux.md)).

---

### RV-029 — Corrigir POST sem corpo no cliente HTTP do front

**Épico:** E02 · **Depende de:** RV-022, RV-023 · **Tamanho:** P · **Onda:** 1

**História**
> Como **jogador que quer sair de uma mesa**, quero **que o botão funcione no navegador**, para **não receber um erro genérico numa ação que a API implementa corretamente**.

**Contexto técnico**
- **Defeito real, encontrado na auditoria e ainda em pé: "Sair da mesa" (RV-022) e "Encerrar mesa" (RV-023) falham no navegador**, embora os testes de contrato passem.
- [lib/api.ts](../../apps/web/src/lib/api.ts) sempre envia `Content-Type: application/json` (linha 26) e só inclui `body` quando `opcoes.corpo !== undefined` (linha 29). O `fetch` do navegador manda então `Content-Length: 0` **com** o cabeçalho JSON — e o parser padrão do Fastify recusa: `defaultJsonParser` devolve `FST_ERR_CTP_EMPTY_JSON_BODY` quando `body.length === 0` (`node_modules/fastify/lib/content-type-parser.js:318`), que é **400 "Body cannot be empty when content-type is set to 'application/json'"** antes de a rota rodar.
- As duas chamadas nessa forma são [features/mesas/api.ts](../../apps/web/src/features/mesas/api.ts): `useEncerrarMesa` (`POST /mesas/:id/encerrar`, linha 56) e `useSairDaMesa` (`POST /mesas/:id/sair`, linha 68).
- **Por que nenhum teste pegou:** `app.inject()` não define `content-type` quando não há payload, então o contrato da api exercita um caminho que o navegador nunca percorre. O front tem `lib/api.test.ts`, mas nenhum caso afirma os cabeçalhos de um POST sem corpo.
- Contorno já aplicado em outro lugar, que este card deve **remover**: `useAtivarCena` em [features/jogo/api.ts](../../apps/web/src/features/jogo/api.ts) manda `corpo: {}` só para escapar do problema.
- **Decisão a registrar:** a correção é **no cliente central** — não mandar `Content-Type` quando não há corpo. Alternativas rejeitadas: obrigar todo hook a enviar `{}` (a próxima rota sem corpo repete o bug) e afrouxar o parser na api (aceitar corpo vazio em JSON esconde requisição malformada de verdade).
- **Armadilha:** `DELETE` não sofre do mesmo problema (o Fastify pula o parser quando `content-length` é 0 nesse verbo), então o sintoma parece aleatório — só POST sem corpo quebra. Não "conserte" os DELETEs junto sem teste que justifique.

**Escopo**
- `apps/web/src/lib/api.ts`: montar os headers sem `Content-Type` quando `corpo === undefined`
- `apps/web/src/lib/api.test.ts`: casos de cabeçalho
- `apps/web/src/features/jogo/api.ts`: remover o `corpo: {}` de `useAtivarCena`
- `apps/api/src/apresentacao/http/rotas-mesas.test.ts`: contrato exercitando o cabeçalho que o navegador manda

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — jogador sai da mesa pelo navegador
  Dado que participo da mesa "Strahd" como jogador
  Quando eu confirmar "Sair da mesa"
  Então a requisição é aceita e a mesa some do meu dashboard
  E nenhum erro de corpo vazio é devolvido

Cenário: Autorização — a recusa que chega é a do domínio
  Dado que sou o mestre da mesa
  Quando eu tentar sair
  Então recebo 403 com a orientação de transferir a mestrança ou encerrar a mesa
  E não um 400 de corpo malformado

Cenário: Borda — POST sem corpo não anuncia JSON
  Quando o cliente central fizer um POST sem corpo
  Então a requisição sai sem o cabeçalho Content-Type
  E um POST com corpo continua enviando "application/json" e o JSON serializado
```

**Testes obrigatórios**
- Front (`lib/api.test.ts`): POST sem corpo não envia `Content-Type` e não envia `body`; POST com corpo envia os dois; `Authorization` continua presente nos dois casos.
- Contrato (`fastify.inject()`): `POST /mesas/:mesaId/sair` e `POST /mesas/:mesaId/encerrar` com `headers: { 'content-type': 'application/json' }` e sem payload respondem 204/200 — hoje respondem 400. É este caso que impede a regressão voltar.

**DoD específico**
- [ ] Nenhum hook manda `corpo: {}` como contorno.
- [ ] O teste de contrato reproduz os cabeçalhos do navegador, não os padrões do `inject`.
