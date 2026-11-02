# Decisões de arquitetura (ADR)

Um ADR registra **uma decisão e as alternativas que perderam**. Ele existe porque a alternativa
descartada é a parte que some primeiro: seis meses depois todo mundo lembra o que foi feito, e
ninguém lembra o que foi considerado e por que não serviu — então a mesma discussão volta do zero,
ou pior, alguém "corrige" a decisão sem saber que ela foi deliberada.

## Quando escrever um

Quando a escolha é cara de reverter **e** havia mais de um caminho defensável: topologia de
publicação, formato de um contrato que atravessa os três workspaces, troca de um pedaço de
infraestrutura, decisão de licença que restringe o produto.

Não escreva ADR para o que o card já resolve. A maior parte das decisões deste projeto vive no
bloco de "decisões de entrega" do card, que é o lugar certo para elas — perto de quem vai ler
depois. ADR é para quando a decisão **não cabe num card** porque atravessa vários, ou porque o card
já existe e assumiu a resposta sem comparar.

## Como escrever

Pelo guardrail de [verificabilidade](../../.claude/rules/10-verificabilidade.md), um ADR mistura os
três prazos de validade e precisa tratar cada um do seu jeito:

- **Princípio e trade-off** — prosa, envelhece bem, é o valor do documento.
- **Fato do estado atual** — meça antes de escrever, e diga que mediu. O contexto de um ADR é a
  parte que apodrece mais rápido; é por isso que ele é **datado** e que o status muda em vez de o
  texto ser reescrito.
- **Consequências** — inclua explicitamente **quais afirmações do repositório a decisão torna
  falsas**. Decisão que invalida um comentário e não o corrige deixa duas verdades para trás.

Status vai de `Proposto` → `Aceito` → `Substituído por ADR-NNNN`. ADR aceito **não se edita** para
mudar a decisão: escreve-se outro, e o antigo vira `Substituído`. É a mesma regra das migrations, e
pela mesma razão — histórico que se reescreve não é histórico.

`npm run docs:verificar` confere este diretório como qualquer outro: caminho citado como link tem
que existir, comando `npm run X` tem que existir.

## Índice

| # | Decisão | Status | Data |
|---|---|---|---|
| [0001](0001-topologia-de-publicacao.md) | Topologia de publicação: origem única, bundle da API, convite por link | Proposto | 2026-11-01 |
