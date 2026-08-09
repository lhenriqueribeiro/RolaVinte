# E06 — Combate e iniciativa

Novo bounded context dentro do módulo `jogo`: o agregado `Combate` é raiz da ordem de iniciativa e do turno corrente.

---

### RV-060 — Agregado Combate

**Épico:** E06 · **Depende de:** — · **Tamanho:** G · **Onda:** 2

**História**
> Como **mestre**, quero **um combate estruturado com ordem, rodada e turno**, para **conduzir a luta sem planilha paralela**.

**Contexto técnico**
- Um combate ativo por mesa. Participantes referenciam `tokenId` (a peça no mapa), com `personagemId` opcional — respeitando a comunicação entre contextos por id ([02-ddd.md](../../.claude/rules/02-ddd.md)).

**Escopo**
- Migration `000X_combates.sql`: `combates` (`id`, `mesa_id`, `cena_id`, `rodada`, `indice_turno`, `ativo`, `criado_em`) e `combate_participantes` (`combate_id`, `token_id`, `nome`, `iniciativa`, `ordem_desempate`, `ausente`)
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

**Épico:** E06 · **Depende de:** RV-060 · **Tamanho:** M · **Onda:** 2

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

**Épico:** E06 · **Depende de:** RV-061 · **Tamanho:** M · **Onda:** 2

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

**Épico:** E06 · **Depende de:** RV-062 · **Tamanho:** M · **Onda:** 2

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
- [ ] Sinalização do turno não depende apenas de cor (acessibilidade).

---

### RV-064 — Condições e estados no token

**Épico:** E06 · **Depende de:** RV-063 · **Tamanho:** M · **Onda:** 2

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

**Épico:** E06 · **Depende de:** RV-064 · **Tamanho:** M · **Onda:** 2

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

Cenário: Token sem personagem
  Quando eu aplicar dano a um token sem ficha vinculada
  Então recebo 400 com mensagem em PT-BR
```

**Testes obrigatórios**
- Use case: tabela de casos (dano acima do PV, cura acima do máximo, delta zero, token sem personagem).
