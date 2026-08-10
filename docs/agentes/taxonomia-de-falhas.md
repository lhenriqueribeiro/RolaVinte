# Taxonomia de falhas do RolaVinte

Catálogo dos defeitos que **este projeto já produziu de verdade**. Não é teoria: cada item aconteceu, foi pego, e está referenciado pela versão em que apareceu.

Serve a três propósitos:

- **Implementador**: leia antes de codar. Reincidir numa destas é falha evitável.
- **Verificador**: é a sua lista de varredura padrão, além das perguntas dirigidas da fase.
- **Curador**: reincidência de uma classe conhecida é card de severidade `importante`, no mínimo.

Ao encontrar uma classe nova, **acrescente-a aqui** com o caso concreto. Este arquivo só tem valor se crescer.

---

## F1 — Defesa que não defende

Configuração que aparenta proteger e é inerte.

**Caso real (v0.4.0).** As rotas de upload declaravam `bodyLimit` por rota, sugerindo uma segunda camada de proteção de tamanho. O Fastify só compara `content-length` com `bodyLimit` quando o parser é `asString`/`asBuffer`; o `@fastify/multipart` registra parser de *stream*. O limite era decorativo — quem barrava era `limits.fileSize` do plugin. Removido, com o motivo escrito no lugar.

**Como caçar:** para toda config de segurança, pergunte *qual linha de código a lê*. Se não conseguir apontar, ela provavelmente não faz nada. Vá ao fonte da dependência quando necessário.

## F2 — Órfão de contrato

Duas pontas que deveriam casar, e nada verifica o casamento.

**Caso real (v0.3.0).** O evento `mesa:participante-removido` nasceu publicado pelo servidor e **sem ouvinte no cliente**. O jogador removido continuava com a mesa na tela até dar F5. Passou por `check`, `lint`, `test` e `build` sem um ruído.

**Causa raiz.** `eventos-ws.ts` se declarava "única fonte de verdade" e tinha **zero consumidores** — nenhum lado aplicava os genéricos.

**Estado hoje (RV-115).** Genéricos aplicados nos dois lados + [cobertura-eventos-ws.test.ts](../../apps/web/src/features/jogo/cobertura-eventos-ws.test.ts). Criar evento novo exige 4 passos, descritos no card RV-115. O lado inverso — evento declarado que ninguém publica — ainda está aberto (RV-116).

**Como caçar:** um contrato só é fonte de verdade se alguém **quebrar** quando ele for desrespeitado. Contrato sem consumidor é comentário.

## F3 — Fake que passa por construção

O teste passa porque o dublê é mais generoso que o adapter real.

**Caso real (v0.3.0).** `SupabaseMesaRepository.salvar()` só fazia *upsert* de `mesa_jogadores`: remover um participante do agregado não apagava a linha do banco, e ele voltava na leitura seguinte. O `FakeMesaRepository` regrava o agregado inteiro, então **jamais** exporia o bug.

**Como caçar:** quando o comportamento depende de *como o adapter persiste* (sincronização, cascata, ordem de operações), o teste tem que estar no adapter. Hoje só `mesa-repository` tem cobertura assim; os outros seguem descobertos (RV-136).

## F4 — Autorização só na interface

Botão escondido tratado como controle de acesso.

**Regra do projeto:** toda ação nova precisa de um teste de contrato provando o `403`/`409` na chamada direta. Se a única proteção é a UI não oferecer o caminho, não há proteção.

**Variante perigosa — vazamento por payload:** para dados que o usuário *não pode ver* (token oculto, sussurro, handout privado, NPC), filtrar no CSS ou no cliente é inútil. O dado **não pode sair** do use case. Os cards RV-043, RV-052, RV-070, RV-071, RV-095 e RV-100 dependem disso.

## F5 — Guarda reimplementada em vez de reusada

**Caso real (v0.3.0).** `Mesa` ganhou `autorizarEscritaDeParticipante`/`autorizarEscritaDoMestre`, que cobrem participação **e** mesa encerrada. Os seis casos de uso de jogo passaram a usá-las, mas `criar-personagem` e `atualizar-personagem` continuaram com `ehParticipante(...)` cru — resultado: com a mesa encerrada ainda dava para criar ficha e editar PV, **enquanto a UI prometia "somente leitura para todo mundo"**. Corrigido em v0.4.0 (RV-027).

**Como caçar:** quando uma regra ganha um ponto único, procure **todos** os call sites antigos. Uma varredura, não memória.

## F6 — Promessa da UI que o backend não cumpre

Texto de interface é contrato com o usuário.

**Casos reais.** O diálogo de remoção dizia "perde o acesso imediatamente, inclusive à sessão aberta agora" — e o front não assinava o evento (F2). O diálogo de encerramento dizia "somente leitura para todo mundo" — e as fichas continuavam editáveis (F5).

**Como caçar:** leia o texto que a UI mostra e verifique cada afirmação contra o backend. Se não conseguir cumprir, mude o texto — não deixe a promessa falsa.

## F7 — Recurso externo órfão

Registro apagado do banco, arquivo esquecido no armazenamento.

**Caso real (v0.4.0, aberto — RV-047).** `RemoverToken` apaga a linha e nunca chama `armazenamento.remover(...)`; nem recebe a port. `RemoverCena` limpa o mapa de fundo, mas as artes dos tokens que somem por cascata ficam para sempre no bucket.

**Como caçar:** para todo `delete`, pergunte o que mais aquele registro possuía fora do banco. Cascata de FK não alcança Storage.

## F8 — Pulo silencioso

Etapa que não roda e não avisa.

**Caso real (v0.3.0).** `npm run test --workspaces --if-present` pulava `apps/web` porque o workspace não tinha script `test`. A suíte parecia verde com **zero** cobertura de front — inclusive no CI.

**Como caçar:** desconfie de `--if-present`, `continue-on-error`, `|| true` e `catch {}` vazio. Confira a contagem por workspace, não o total.

## F9 — Limite validado isoladamente

Campo validado sozinho, ignorando o estado que ele invalida.

**Caso real (v0.4.0, aberto — RV-036).** `Cena.atualizar` valida `larguraGrid`/`alturaGrid` na faixa 5..100, mas não olha os tokens já posicionados. Encolher de 100×100 para 5×5 deixa tokens fora do mapa, desenhados no vazio, **sem caminho na UI para trazê-los de volta**.

**Como caçar:** ao encolher qualquer limite, pergunte o que já existe do lado de fora do novo limite.

## F10 — Configuração que nunca foi exercitada

Código correto que nunca rodou de verdade.

**Casos reais.** (a) `config/env.ts` lia `process.env`, mas **nada** carregava `apps/api/.env` — seguir o README não fazia a API subir (v0.2.0). (b) O workflow de CI ficou correto e inerte por três versões, até o repositório existir de fato (resolvido: há `origin/main`, e o CI roda a cada push). (c) A migration `0005` ficou em disco e fora do banco, e como `mensagens.destinatario_id` entra na lista de colunas de **todo** select de mensagem, o efeito não foi "sussurro falha" — **o chat inteiro estava fora do ar** contra o banco real (v0.5.0). A `0007` repetiu o padrão e derrubaria a aba de personagens de qualquer mesa.

**Como caçar:** "está implementado" e "está em execução em algum lugar" são estados diferentes. Diga qual dos dois você verificou. Hoje há conserto: `npm run supabase:verificar -w @rolavinte/api` compara disco com banco e `npm run supabase:migrar -w @rolavinte/api` aplica as pendentes.

## F11 — Enunciado contraditório aceito em silêncio

**Caso real (v0.4.0).** O card RV-042 dizia num cenário "40% em vermelho" e noutro "âmbar entre 25% e 50%" — 12/30 PV cai nos dois. O agente escolheu a regra das faixas, fixou os limites em teste, escreveu a decisão no código **e corrigiu o card**.

**Conduta correta:** decida, justifique, e **altere o texto do card** — senão a contradição reaparece com o próximo agente.

## F12 — Duas verdades para o mesmo conceito

O dado existe em dois lugares, um é lido e o outro é ignorado — sem ninguém avisar.

**Caso real (v0.8.0, achado no navegador com 1.475 testes verdes).** Um personagem de Pathfinder tinha os atributos em duas casas:

```
coluna atributos : {"forca":18,"destreza":14,...}   ← exigida na criação, guardada, ignorada
dados            : {"modificadorForca":0,...}       ← o que a ficha lia
```

Quem preenchia Força 18 via a perícia calcular como se fosse 0. **A suíte passou porque cada metade era testada sozinha:** havia teste de que a ficha lê `dados` e teste de que a criação persiste `atributos`. Nenhum criava informando um valor e **relia** para conferir que era o mesmo.

**A causa foi uma premissa plausível e errada** (RV-091): "as colunas comuns são iguais em todo sistema". Atributo é justamente o que não é — D&D usa valor de 1 a 30 e deriva o modificador; PF2e usa modificador direto, de −5 a +8.

**Como caçar:**
- Para todo campo, pergunte **quem escreve e quem lê**. Se as respostas apontam lugares diferentes, há duas verdades.
- Campo **exigido na criação e ausente da tela** é o sintoma mais visível.
- O teste que pega é o de ida e volta: **grave informando, releia pela API, compare**. Testar cada metade não pega.
- Desconfie de "isto é igual em todo sistema" — é a forma que a premissa errada costuma ter.
