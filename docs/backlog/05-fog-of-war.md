# E05 — Névoa de guerra

Exploração é metade da graça de um dungeon crawl. O princípio inegociável destes cards: **o que o jogador não deveria ver não pode chegar ao cliente dele**.

---

### RV-050 — Modelo de domínio da névoa

**Épico:** E05 · **Depende de:** RV-030 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre**, quero **que a cena guarde quais áreas foram reveladas**, para **que a exploração persista entre sessões**.

**Contexto técnico**
- Representação escolhida: **bitmap por célula** (`boolean[]` serializado), não polígonos — simples, difável e suficiente para grids de até 100×100 (10.000 células ≈ 1,25 KB comprimido).
- A névoa é parte do agregado `Cena`; alterações atravessam a raiz ([02-ddd.md](../../.claude/rules/02-ddd.md)).

**Escopo**
- Migration: `cenas.nevoa_ativa boolean default false`, `cenas.celulas_reveladas text` (bitmap base64)
- `apps/api/src/dominio/jogo/nevoa.ts`: VO `Nevoa` com `revelar(celulas)`, `ocultar(celulas)`, `estaRevelada(x,y)`, `revelarTudo()`, `ocultarTudo()`
- `Cena.nevoa` e ajuste de `Cena.reconstituir`
- Regra: redimensionar o grid preserva a névoa das células que continuam existindo

**Critérios de aceite**
```gherkin
Cenário: Névoa nasce fechada
  Quando eu ativar a névoa em uma cena 20x15
  Então todas as 300 células ficam ocultas

Cenário: Revelar é idempotente
  Quando eu revelar a célula (3,3) duas vezes
  Então o estado é o mesmo de uma única revelação

Cenário: Célula fora do grid é ignorada
  Quando eu tentar revelar (99,99) num grid 20x15
  Então recebo erro de validação e nenhuma célula muda
```

**Testes obrigatórios**
- Domínio puro: serialização/desserialização do bitmap (ida e volta), limites, idempotência, redimensionamento preservando o revelado.

---

### RV-051 — Pincel de revelar e ocultar

**Épico:** E05 · **Depende de:** RV-050 · **Tamanho:** G · **Onda:** 2

**História**
> Como **mestre**, quero **pintar as áreas reveladas com o mouse**, para **abrir o mapa conforme o grupo avança**.

**Escopo**
- `apps/api/src/aplicacao/jogo/atualizar-nevoa.ts` (só mestre)
- `packages/shared`: `atualizarNevoaSchema` (`cenaId`, `modo: 'revelar'|'ocultar'`, `celulas: [x,y][]`, máx. 2000 por chamada)
- `PATCH /cenas/:cenaId/nevoa` + broadcast `nevoa:atualizada`
- Front: ferramenta de pincel (tamanho 1/3/5), retângulo, "revelar tudo" e "ocultar tudo"; agrupa o arrasto e envia **uma** requisição no `pointerup`

**Critérios de aceite**
```gherkin
Cenário: Pintar revela para o grupo
  Dado a névoa ativa e o corredor oculto
  Quando eu pintar 12 células com o pincel
  Então uma única requisição é enviada ao soltar o mouse
  E os jogadores veem a área revelada imediatamente

Cenário: Ocultar de novo
  Quando eu usar o pincel em modo ocultar sobre área revelada
  Então ela volta a ficar oculta para os jogadores

Cenário: Jogador não pinta
  Dado que sou jogador
  Quando eu chamar PATCH /cenas/:cenaId/nevoa
  Então recebo 403
```

**Testes obrigatórios**
- Use case: jogador → `nao-autorizado`; lote acima de 2000 células → `validacao`.
- Front: um arrasto de 12 células dispara exatamente uma mutação.

---

### RV-052 — Renderização assimétrica (mestre × jogador)

**Épico:** E05 · **Depende de:** RV-051 · **Tamanho:** G · **Onda:** 2

**História**
> Como **jogador**, quero **enxergar só o que foi revelado**, para **que a exploração tenha graça** — e, como **mestre**, quero **ver o mapa inteiro com a névoa translúcida**, para **conduzir a cena**.

**Contexto técnico**
- Esta é a metade **de segurança** do épico. O payload enviado ao jogador precisa ser filtrado no servidor:
  - névoa: jogador recebe o bitmap (precisa dele para desenhar), o que é aceitável;
  - **tokens em célula oculta não são enviados a jogadores**, mesmo sem `oculto = true` (RV-043 cobre a ocultação manual; aqui é ocultação por névoa).

**Escopo**
- `ObterCenaAtiva`: para não-mestre, remove tokens em células ocultas
- `MoverToken`/`CriarToken`: o broadcast para jogadores omite tokens que estejam em célula oculta
- `Tabletop`: camada de névoa — preto opaco para jogador, preto a 50% para mestre

**Critérios de aceite**
```gherkin
Cenário: Monstro na escuridão não vaza
  Dado um token de monstro numa célula oculta pela névoa
  Quando o jogador carregar a cena
  Então o token não está na resposta da API

Cenário: Revelar a área revela o monstro
  Quando o mestre revelar aquela célula
  Então o jogador passa a receber o token e vê o monstro no mapa

Cenário: Visões diferentes na mesma cena
  Então o mestre vê o mapa inteiro sob névoa translúcida
  E o jogador vê preto sólido sobre as áreas não reveladas

Cenário: Meu próprio token nunca some
  Dado que meu personagem entrou numa área ainda não revelada
  Então continuo vendo o token do meu personagem
```

**Testes obrigatórios**
- Use case: matriz de casos (token revelado/oculto × mestre/jogador × é meu personagem) sobre o **payload**.
- Regressão: um jogador com o DevTools aberto não encontra dados de token oculto em nenhuma resposta ou evento.

**DoD específico**
- [ ] Nenhuma ocultação implementada apenas no CSS.
