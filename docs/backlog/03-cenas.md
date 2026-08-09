# E03 — Cenas e mapas

Hoje só existe "criar cena" (que ativa e desativa as demais) e um grid liso. Este épico transforma o tabletop em mesa de verdade.

---

### RV-030 — CRUD de cenas

**Épico:** E03 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisão tomada na entrega:** além da única cena, **a cena ativa também não é excluída** (409
> `CENA_ATIVA_NAO_EXCLUI`). A alternativa — ativar outra cena automaticamente — teleportaria a mesa
> para um mapa que o mestre não escolheu no meio da sessão. A UI mostra o botão travado **com o
> motivo escrito**. As escritas passam por `carregarCenaParaEscritaDoMestre`
> ([acesso-cena.ts](../../apps/api/src/aplicacao/jogo/acesso-cena.ts)); a listagem é leitura e
> continua respondendo em mesa encerrada.

**História**
> Como **mestre**, quero **manter várias cenas preparadas na mesa**, para **montar os mapas antes da sessão e não perder tempo durante o jogo**.

**Contexto técnico**
- [CriarCena](../../apps/api/src/aplicacao/jogo/criar-cena.ts) já desativa as demais. Falta listar, renomear e excluir.
- Excluir cena apaga tokens em cascata (FK já definida na migration inicial).

**Escopo**
- `apps/api/src/aplicacao/ports/repositorios.ts`: `listarDaMesa(mesaId)` e `remover(cenaId)` em `CenaRepository`
- `apps/api/src/aplicacao/jogo/listar-cenas.ts`, `atualizar-cena.ts`, `remover-cena.ts`
- `GET /mesas/:mesaId/cenas`, `PATCH /cenas/:cenaId`, `DELETE /cenas/:cenaId`
- Front: gerenciador de cenas no `PainelMestre`

**Critérios de aceite**
```gherkin
Cenário: Mestre prepara cenas com antecedência
  Quando eu criar as cenas "Taverna" e "Cripta"
  Então ambas aparecem na lista, com "Cripta" marcada como ativa

Cenário: Excluir cena ativa exige outra cena
  Dado que "Cripta" é a única cena da mesa
  Quando eu tentar excluí-la
  Então recebo 409 orientando criar ou ativar outra cena antes

Cenário: Excluir cena inativa remove seus tokens
  Dado que "Taverna" está inativa e tem 3 tokens
  Quando eu excluí-la
  Então a cena e os 3 tokens somem
  E os participantes na cena ativa não são afetados

Cenário: Jogador não vê a lista de cenas
  Dado que sou jogador
  Quando eu chamar GET /mesas/:mesaId/cenas
  Então recebo 403 — jogador só enxerga a cena ativa
```

**Testes obrigatórios**
- Use case: excluir última cena → `conflito`; excluir cena de outra mesa → `nao-autorizado`.

---

### RV-031 — Ativar cena existente

**Épico:** E03 · **Depende de:** RV-030 · **Tamanho:** P · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisão tomada na entrega:** `POST /cenas/:cenaId/ativar` devolve **`CenaComTokensDTO`**, não só a
> cena — quem clica troca o mapa sem depender de refetch nem do socket. O handler de `cena:ativada`
> em [use-socket-mesa.ts](../../apps/web/src/features/jogo/use-socket-mesa.ts) passou a distinguir os
> dois usos do evento: **mesma cena** (ajuste de grid, upload de mapa) preserva os tokens em cache;
> **outra cena** chama `refetchQueries`, nunca grava `tokens: []` — era esse o pisca-vazio que o card
> mandava evitar. `invalidateQueries` não serve: sem observador montado ele não busca.

**História**
> Como **mestre**, quero **alternar a cena ativa em um clique**, para **levar o grupo da taverna à cripta no meio da sessão**.

**Escopo**
- `apps/api/src/aplicacao/jogo/ativar-cena.ts`
- `POST /cenas/:cenaId/ativar`
- Reuso do broadcast `cena:ativada` já existente em `PublicadorEventosMesa`
- Front: `use-socket-mesa` já trata `cena:ativada` — validar que os tokens da nova cena chegam

**Critérios de aceite**
```gherkin
Cenário: Troca de cena chega a todos
  Dado que "Taverna" está ativa e os jogadores estão com a mesa aberta
  Quando eu ativar "Cripta"
  Então todos passam a ver "Cripta" com seus tokens, sem recarregar a página
  E "Taverna" fica inativa

Cenário: Exatamente uma cena ativa
  Quando eu ativar qualquer cena
  Então a consulta ao banco retorna uma única cena com ativa = true para a mesa
```

**Testes obrigatórios**
- Use case: ativar cena de outra mesa → `nao-autorizado`; invariante de cena única ativa.
- Front: `cena:ativada` substitui cena e recarrega tokens (hoje o handler seta `tokens: []` e invalida — garanta que não pisca vazio).

---

### RV-032 — Imagem de fundo da cena (upload)

**Épico:** E03 · **Depende de:** RV-004 · **Tamanho:** G · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega:** (1) bucket `mapas` **público para leitura**, documentado na
> migration `0003` e no topo de
> [supabase-armazenamento-arquivos.ts](../../apps/api/src/infra/storage/supabase-armazenamento-arquivos.ts)
> — a URL fica persistida em `cenas.imagem_fundo_url`, e URL assinada expiraria com o mapa já gravado;
> escrita segue exclusiva do backend com service role. (2) Duas colunas (`imagem_fundo_url` +
> `imagem_fundo_caminho`), porque a extensão muda entre uploads e sem o caminho não há como apagar o
> mapa anterior; só a URL vai para o DTO. (3) **Armadilha confirmada empiricamente:**
> `@fastify/multipart` deriva `fileSize` de `fastify.initialConfig.bodyLimit` — sem `limits.fileSize`
> explícito o upload morre em 413 no body limit de 256 KB do RV-004. `bodyLimit` de rota **não**
> alcança corpo multipart (o Fastify só o aplica a parsers `asString`/`asBuffer`). (4) A imagem é
> esticada para a área do grid (`larguraGrid × alturaGrid × tamanhoCelula`): garante o alinhamento em
> qualquer zoom, ao custo de distorcer mapa com outra proporção — offset/escala próprios da imagem
> seriam campo novo na cena. **Nada foi validado contra Supabase real: o bucket ainda não existe (ver
> [RV-138](13-operacao.md)).**

**História**
> Como **mestre**, quero **subir a imagem do mapa como fundo da cena**, para **jogar com o mapa que preparei em vez de um fundo liso**.

**Contexto técnico**
- Supabase Storage atrás de uma port nova — o SDK não pode aparecer fora de `infra/` ([07-supabase.md](../../.claude/rules/07-supabase.md)).
- Upload direto do browser para o Storage está **fora** do padrão do projeto (o front nunca fala com o Supabase): o arquivo passa pela API, que valida e repassa.

**Escopo**
- `apps/api/src/aplicacao/ports/infraestrutura.ts`: `ArmazenamentoArquivos { salvar(caminho, conteudo, tipo): Promise<string /* url */>; remover(caminho) }`
- `apps/api/src/infra/storage/supabase-armazenamento.ts` + bucket `mapas` (migration/documentação)
- `@fastify/multipart` na rota `POST /cenas/:cenaId/fundo`
- `cenas.imagem_fundo_url text` (migration)
- Front: campo de upload no `PainelMestre`; `Tabletop` renderiza a imagem sob o grid

**Regras**
- Tipos aceitos: `image/png`, `image/jpeg`, `image/webp`. Máx. 8 MB.
- Nome do arquivo gerado pela aplicação (nunca o nome enviado pelo cliente).

**Critérios de aceite**
```gherkin
Cenário: Mapa aparece para todos
  Quando eu subir um PNG de 2 MB como fundo da cena ativa
  Então a imagem aparece sob o grid para mim e para os jogadores conectados
  E o grid continua alinhado sobre a imagem

Cenário: Arquivo inválido é recusado
  Quando eu enviar um PDF ou uma imagem de 20 MB
  Então recebo 400 (tipo) ou 413 (tamanho) com mensagem em PT-BR
  E nada é gravado no Storage

Cenário: Trocar o fundo remove o anterior
  Dado que a cena já tem um fundo
  Quando eu subir outro
  Então o arquivo antigo é removido do Storage
```

**Testes obrigatórios**
- Use case com fake de `ArmazenamentoArquivos`: tipo inválido, limite de tamanho, substituição removendo o anterior.
- Contrato: `POST /cenas/:cenaId/fundo` como jogador → 403.

**DoD específico**
- [ ] Nenhum import de `@supabase/*` fora de `infra/`.
- [ ] Bucket privado com URL assinada, ou público documentado como decisão consciente.

---

### RV-033 — Configuração do grid

**Épico:** E03 · **Depende de:** RV-032 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega:** `MENSAGEM_TAMANHO_CELULA` vive em `@rolavinte/shared` e é importada
> **tanto** pelo Zod quanto pelo agregado `Cena` — a mesma frase chega da borda HTTP e do domínio, sem
> cópia para divergir. `atualizarCenaSchema` é `criarCenaSchema.omit({ mesaId }).partial()`: campo
> ausente chega como `undefined` e o PATCH parcial não zera o resto. A cor do grid é aplicada com alfa
> 0,45 (`corComAlfa` em [aparencia.ts](../../apps/web/src/features/jogo/aparencia.ts)) — linha opaca
> sobre o mapa esconde o desenho. Editar a cena **ativa** reemite `cena:ativada`; editar cena inativa
> não emite nada.

**História**
> Como **mestre**, quero **ajustar tamanho, cor e visibilidade do grid**, para **encaixá-lo na escala do mapa que subi**.

**Contexto técnico**
- Hoje `CELULA = 44` é constante no [Tabletop.tsx](../../apps/web/src/features/jogo/Tabletop.tsx). Vira propriedade da cena.

**Escopo**
- Migration: `cenas.tamanho_celula int default 44`, `cenas.grid_visivel boolean default true`, `cenas.cor_grid text`
- `Cena` valida `tamanho_celula` entre 20 e 200
- `CenaDTO` + `atualizarCenaSchema` em `@rolavinte/shared`
- `Tabletop` passa a ler `cena.tamanhoCelula`

**Critérios de aceite**
```gherkin
Cenário: Ajustar a célula ao mapa
  Dado um mapa cujas células têm 64 px
  Quando eu definir tamanho de célula 64
  Então o grid coincide com o desenho do mapa para todos

Cenário: Ocultar o grid
  Quando eu desmarcar "exibir grid"
  Então o grid some para todos, e os tokens continuam alinhados às células

Cenário: Limites validados
  Quando eu enviar tamanho de célula 5
  Então recebo 400 com "Tamanho da célula deve estar entre 20 e 200."
```

**Testes obrigatórios**
- Domínio: limites de `tamanho_celula`.
- Front: token em `(x=3,y=2)` renderiza em `(3*celula, 2*celula)` para dois tamanhos diferentes.

---

### RV-034 — Zoom e pan no tabletop

**Épico:** E03 · **Depende de:** RV-033 · **Tamanho:** G · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega:** a matemática da câmera é pura e testável em
> [store-tabletop.ts](../../apps/web/src/features/jogo/store-tabletop.ts) (`telaParaGrid`,
> `posicionarTokenNoPonteiro`, `celulaDoCanto`, `aplicarZoomAncorado`, `centralizarMapa`,
> `limitarEscala`), todas recebendo `tamanhoCelula` por parâmetro — **qualquer gesto novo sobre o mapa
> (régua do RV-035, névoa do E05, ping do RV-113) converte por essas funções, nunca dividindo
> `getBoundingClientRect` por uma constante**. Armadilhas registradas: o `onWheel` do React é listener
> **passivo** (o `preventDefault` é ignorado — a roda precisou de `addEventListener(..., { passive:
> false })`), e o jsdom 26 não implementa `PointerEvent` nem `setPointerCapture`. O pan **não** tem
> clamp: dá para jogar o mapa para fora do visor, e a saída é o botão "Centralizar o mapa". A câmera é
> store de módulo compartilhada; um `ref` guarda qual cena já foi centralizada para que refetch de
> `['cena', mesaId]` não sequestre o zoom no meio da sessão.

**História**
> Como **jogador**, quero **dar zoom e arrastar o mapa**, para **enxergar um mapa 40×30 numa tela de notebook**.

**Contexto técnico**
- Estado de câmera é **UI efêmera** → Zustand, nunca no servidor ([06-frontend.md](../../.claude/rules/06-frontend.md)).
- Atenção: o cálculo de arrasto de token em `Tabletop` usa `getBoundingClientRect` e precisa dividir pelo fator de escala.

**Escopo**
- `apps/web/src/features/jogo/store-tabletop.ts`: `{ escala, deslocX, deslocY, aplicarZoom, arrastarCamera, centralizar }`
- `Tabletop.tsx`: wrapper com `transform: translate(...) scale(...)`
- Controles: roda do mouse com Ctrl, botão do meio/espaço para pan, botões +/−/centralizar

**Critérios de aceite**
```gherkin
Cenário: Zoom mantém o ponto sob o cursor
  Dado o mapa em escala 1
  Quando eu der zoom com o cursor sobre a célula (10,10)
  Então a célula (10,10) permanece sob o cursor

Cenário: Arrastar token com zoom aplicado
  Dado o mapa em escala 0,5
  Quando eu arrastar um token para a célula (12,7)
  Então o token é persistido em x=12, y=7

Cenário: Limites de escala
  Quando eu tentar reduzir abaixo de 0,25 ou ampliar acima de 3
  Então a escala é limitada a esses extremos
```

**Testes obrigatórios**
- Unitário puro da conversão tela↔grid com escala e deslocamento (extraia para função testável).

**DoD específico**
- [ ] Zoom/pan não dispara requisição nem re-render do chat.

---

### RV-035 — Régua e medição de distância

**Épico:** E03 · **Depende de:** RV-034 · **Tamanho:** M · **Onda:** 2

**História**
> Como **jogador**, quero **medir a distância entre dois pontos**, para **saber se meu movimento ou minha magia alcança o alvo**.

**Escopo**
- Migration: `cenas.unidade_medida text default 'm'`, `cenas.valor_celula numeric default 1.5`
- `packages/shared/src/jogo/distancia.ts`: estratégias de medição (`euclidiana`, `chebyshev`/D&D 5e, `diagonal-alternada`)
- `Cena.regraDistancia` selecionando a estratégia (Strategy, ver [04-design-patterns.md](../../.claude/rules/04-design-patterns.md))
- Front: ferramenta de régua com linha e rótulo; ping efêmero via socket `mapa:regua`

**Critérios de aceite**
```gherkin
Cenário: Medição em linha reta (5e)
  Dado uma cena com célula = 1,5 m e regra "chebyshev"
  Quando eu medir de (0,0) a (0,4)
  Então o rótulo mostra "6 m"

Cenário: Medição diagonal (5e)
  Dado a mesma cena
  Quando eu medir de (0,0) a (3,3)
  Então o rótulo mostra "4,5 m" (diagonal conta como 1 célula)

Cenário: A régua dos outros aparece
  Quando eu arrastar a régua
  Então os demais participantes veem a linha enquanto eu arrasto
  E ela some ao soltar
```

**Testes obrigatórios**
- Unitário de cada estratégia de distância com tabela de casos (reto, diagonal, misto).
- A régua **não** é persistida: nenhum registro criado no banco.

---

### RV-036 — Encolher o grid não pode abandonar tokens fora do mapa

**Épico:** E03 · **Depende de:** RV-030, RV-033 · **Tamanho:** P · **Onda:** 2

**História**
> Como **mestre que redimensiona a cena depois de subir o mapa**, quero **ser avisado quando o novo tamanho deixar peças de fora**, para **não perder tokens numa área que o mapa não tem mais**.

**Contexto técnico**
- Defeito real encontrado na auditoria do RV-030/RV-033, ainda **latente**: o front não expõe o redimensionamento, mas a API expõe.
- [Cena.atualizar](../../apps/api/src/dominio/jogo/cena.ts) valida `larguraGrid`/`alturaGrid` isoladamente (5..100) e **não olha os tokens já posicionados**. Como `atualizarCenaSchema` ([schemas/jogo.ts](../../packages/shared/src/schemas/jogo.ts)) expõe os dois campos no `PATCH /cenas/:cenaId`, encolher de 100×100 para 5×5 deixa tokens com `x`/`y` fora de `contemPosicao()`.
- Consequência observável: as peças são desenhadas fora da área do mapa e **a UI não oferece caminho de volta** — só um `PATCH /tokens/:id/posicao` manual resolve. `MoverToken` protege o limite na hora de mover; ninguém protege na hora de encolher.
- **Decisão a registrar:** **recusar** a redução com `conflito`, não reposicionar as peças em silêncio. Mover token de terceiro sem o mestre pedir é surpresa pior que um 409; a mensagem diz quantas peças estão no caminho para o mestre agir. A validação vive no **caso de uso** ([atualizar-cena.ts](../../apps/api/src/aplicacao/jogo/atualizar-cena.ts)), não no agregado: `Cena` não guarda os tokens, e a lista vem de `CenaRepository.listarTokensDaCena` ([repositorios.ts](../../apps/api/src/aplicacao/ports/repositorios.ts)).
- **Armadilha:** só consulte os tokens quando `larguraGrid` ou `alturaGrid` **diminuírem**. Buscar a lista em todo PATCH transforma um ajuste de cor de grid numa query extra por tecla no formulário.

**Escopo**
- `apps/api/src/aplicacao/jogo/atualizar-cena.ts`: guarda antes de `cena.atualizar(...)`
- `apps/api/src/aplicacao/jogo/cenas.test.ts`: casos novos
- `apps/api/src/apresentacao/http/rotas-cenas.test.ts`: 409 de contrato
- Front (`PropriedadesCena.tsx`): se o card for acompanhado da UI de redimensionamento, o 409 aparece em `role="alert"` como as demais recusas

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — encolher área vazia é permitido
  Dado uma cena 40x30 cujos tokens estão todos dentro de 20x20
  Quando eu enviar PATCH /cenas/:cenaId com larguraGrid 20 e alturaGrid 20
  Então recebo 200 com a cena no novo tamanho
  E nenhum token muda de posição

Cenário: Autorização — jogador não redimensiona
  Dado que sou jogador da mesa
  Quando eu enviar PATCH /cenas/:cenaId com larguraGrid 10
  Então recebo 403
  E a cena continua com o tamanho anterior

Cenário: Borda — token na área removida barra a redução
  Dado uma cena 40x30 com um token em (35,10)
  Quando eu enviar larguraGrid 20
  Então recebo 409 em PT-BR informando quantos tokens ficariam fora do mapa
  E a cena continua 40x30 e o token continua em (35,10)

Cenário: Borda — ajuste que não encolhe não consulta tokens
  Quando eu enviar apenas corGrid ou gridVisivel
  Então a cena é atualizada sem nenhuma leitura de tokens
```

**Testes obrigatórios**
- Use case com fakes: redução com token fora → `conflito`, com asserção de que **nada** foi persistido (nome, tamanho e posição do token conferidos depois); redução com área livre → sucesso; aumento de grid nunca é barrado.
- Use case: PATCH que não mexe em largura/altura não chama `listarTokensDaCena` (espião no fake).
- Contrato: `PATCH /cenas/:cenaId` → 409 com a mensagem em PT-BR.

**DoD específico**
- [ ] Nenhum token é movido, apagado ou reposicionado pela API sem pedido explícito.
- [ ] A mensagem de conflito diz o número de peças no caminho, não só "tamanho inválido".
