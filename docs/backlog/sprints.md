# Sprints do RolaVinte

As **ondas** do [roadmap](README.md#roadmap-por-ondas) dizem *prioridade*. As sprints desta página dizem *ordem de execução*: cada uma tem um objetivo em uma frase, um conjunto fechado de cards e uma versão publicada no fim.

Uma sprint só fecha quando: `npm run check` e `npm run test` verdes, verificação independente feita por quem não implementou, release note publicada e backlog curado. É o mesmo ciclo descrito em [docs/agentes/README.md](../agentes/README.md).

## Regra de composição

Uma sprint **não** é "os próximos N cards da lista". É um conjunto que compartilha objetivo e cuja ordem interna respeita duas restrições:

1. **Card protetor primeiro.** O que fecha uma classe de risco vem antes dos que a exercitam — foi assim que o RV-115 impediu, no mesmo lote, que o `personagem:atualizado` nascesse órfão.
2. **Um agregado, um agente.** Cards que tocam o mesmo agregado vão juntos, senão viram conflito de escrita (não há git worktree aqui — ver [protocolo-comum.md](../agentes/protocolo-comum.md)).

---

## Sprint 1 — Ficha extensível · [`v0.6.0`](../release-notes/v0.6.0.md) · ✅ concluída

> **Objetivo:** qualquer sistema de RPG passa a ter a própria ficha sem tocar no código dos outros — e o histórico do chat deixa de ter teto.

Esta era a sprint que **desbloqueia o Pathfinder**, e ela desbloqueou: a ficha deixou de ser estrutura única e fixa, e o E15 pode registrar PF2e como uma linha no registro de sistemas.

| Card | Título | Como fechou |
|---|---|---|
| [RV-091](09-fichas.md) | Strategy de sistema de ficha | ✅ Registro em `packages/shared/src/sistemas/`, `personagens.dados` (migration `0007`), ficha renderizada por seções. Zero `switch (sistema)` fora do registro — varredura feita, duas violações corrigidas na verificação |
| [RV-090](09-fichas.md) | Perícias e proficiência | ✅ Cálculo puro delegando ao registro, 18 perícias de D&D 5e, rolagem em um clique pela rota que já existia |
| [RV-093](09-fichas.md) | Excluir e duplicar personagem | ✅ Com uma ressalva escrita no card: "some da lista para todos" só vale depois de recarregar — a propagação em tempo real virou [RV-117](11-tempo-real.md) |
| [RV-073](07-chat.md) | Histórico paginado (fechar o parcial) | 🚧 **Não fechou.** O backend do cursor entrou inteiro e bem testado; a metade de interface (`useInfiniteQuery`) não. Continua `Parcial` e **entra na Sprint 2** — ver abaixo |
| [RV-150](15-pathfinder2e.md) | Fronteira de licenciamento | ✅ Auditor executável sobre os arquivos reais da semente, com os cinco experimentos de reprovação registrados |

**Nasceram três cards da execução** (critério de corte aplicado sobre 19 descobertas): [RV-096](09-fichas.md) — o `check` de `mesas.sistema` é a única lista de sistemas sem amarra; [RV-097](09-fichas.md) — trocar o sistema da mesa deixa ficha gravada impossível de salvar; [RV-117](11-tempo-real.md) — excluir/duplicar ficha não chega às outras abas.

**A sprint deixou o produto um pouco pior em dois pontos, e isso está escrito no [README](README.md#roadmap-por-ondas):** a fila de migrations não aplicadas foi de uma para três (a `0007` derruba todo select de personagem contra o banco real), e o padrão do chat caiu de 100 para 50 mensagens sem que a tela ganhasse como pedir a próxima página.

## Sprint 2 — Pathfinder calcula · [`v0.7.0`](../release-notes/v0.7.0.md) · ✅ concluída

> **Objetivo:** a ficha de PF2e existe e calcula sozinha os números que o jogador somaria à mão.

Cumprido pela metade que o objetivo nomeia: a ficha existe, e o número que sai dela é o certo. A outra metade do épico — **comparar** esse número com uma CD — é a Sprint 3, e hoje não existe em lugar nenhum do produto (ver a nota sobre contrato órfão abaixo).

| Ordem | Card | Como fechou |
|---|---|---|
| 1 | [RV-096](09-fichas.md) | ✅ Guarda offline que lê `supabase/migrations/*.sql`, extrai o `check` vigente de `mesas.sistema` e o compara com `SISTEMAS_RPG` **nas duas direções**. Provada com vermelho real por dois agentes diferentes (valor só no enum → nomeia o sistema e imprime o SQL da próxima migration; valor só no SQL → nomeia o valor órfão). A `0008` nasceu junto, já com `'pathfinder2e'` |
| 2 | [RV-151](15-pathfinder2e.md) | ✅ 93 testes com todo valor esperado escrito à mão, cinco experimentos de vermelho registrados. **Entregou motor sem consumidor de produção**, por desenho — o consumidor é o RV-154 |
| 3 | [RV-152](15-pathfinder2e.md) | ✅ `'pathfinder2e'` no registro, ficha com identidade e os seis modificadores diretos, `usaAtributosComuns` e `atribuicao` como dados do contrato em vez de `if` na tela. **Fechou parcial e foi completado no card seguinte**: as duas linhas de interface ficaram em handoff explícito e o agente do RV-153 as executou — sem elas, a ficha de PF2e oferecia seis botões rolando `1d20+0` de colunas que o sistema ignora |
| 4 | [RV-153](15-pathfinder2e.md) | ✅ 16 perícias + Saber como **família de perícia no contrato** (`FamiliaPericia`), não como caso especial. Um defeito escapou e virou [RV-159](15-pathfinder2e.md) |
| 5 | [RV-073](07-chat.md) | 🚧 **Não fechou pela segunda vez.** `useMensagens` continua um `useQuery` pedindo a primeira página — conferido no código no fecho da sprint. Continua `Parcial`, e a regressão de 100 → 50 mensagens segue de pé |

**O RV-096 nesta sprint é o exemplo de que sprint não é contrato.** Ele não existia quando a Sprint 2 foi planejada: nasceu como *descoberta da execução da Sprint 1*, foi julgado bloqueador do E15 na curadoria da v0.6.0 e entrou aqui como **primeiro item**, na frente de cards que já estavam na página. A regra de composição nº 1 é o que decidiu a posição — o card que fecha a classe de risco vem antes do que a exercita — e o retorno foi medido dentro da própria sprint: quando o RV-152 acrescentou `'pathfinder2e'` ao enum, o vermelho apareceu exatamente onde deveria, com a instrução do que fazer. Sem ele, a divergência só apareceria no primeiro `INSERT` real, meses depois.

**Nasceu um card da execução** (critério de corte aplicado sobre 29 descobertas — 19 dos implementadores, 10 da verificação independente): [RV-159](15-pathfinder2e.md) — adicionar um Saber repetido, longo demais ou acima do teto é um no-op silencioso na ficha (o botão fica habilitado, o clique esvazia o campo e nada é salvo). Nenhum outro achado virou card; quatro viraram contexto novo dentro de cards existentes (RV-154, RV-155, RV-157, RV-158).

**A sprint deixou o produto um pouco pior em dois pontos, como a anterior:** a fila de migrations não aplicadas foi de três para **quatro** (a `0008` deixou de ser precaução e virou pré-requisito — o dashboard oferece "Pathfinder 2e" e o `INSERT` falha sem ela), e o RV-073 escorregou de novo, então a regressão do chat completa duas sprints de pé.

**Contrato órfão que a Sprint 3 precisa fechar:** `grauSucesso`, `d20NaturalDe`, `somarModificadores`, `cdPorNivel` e `CDS_SIMPLES` têm zero call sites em produção. A aritmética está certa e invisível — um 20 natural não desloca grau nenhum na tela nem no chat. Está anotado no contexto do RV-154, junto com o risco concreto: reimplementar a comparação com a CD no componente é barato e criaria duas aritméticas.

> **Fechado pela metade na Sprint 3, e a metade que sobrou está nomeada.** `grauSucesso` e `d20NaturalDe` ganharam consumidor de produção pelo RV-154 (`avaliar-rolagem.ts` → `DefinicaoSistema.avaliarRolagem` → `RolarDados`), provado contra o banco real. `cdPorNivel`, `CDS_SIMPLES`, `somarModificadores` e `MARGEM_CRITICA` continuam com **zero** call sites de produção — o RV-156 explicou por escrito por que não os usou (a penalidade de ataques múltiplos não empilha tipo nenhum), e nenhum card em aberto os promete. Consequência para o usuário: a tabela de CDs do PF2e não chega a tela nenhuma, e o mestre continua consultando o livro para escolher a CD que vai digitar — é o contexto que o [RV-161](15-pathfinder2e.md) herda. `rolagensPadrao` segue órfão em quatro sistemas e é do RV-158.

## Sprint 3 — Pathfinder na mesa · `v0.8.0` · ✅ concluída

> **Objetivo:** rolar em PF2e produz um grau de sucesso no chat, atacar respeita a penalidade de ataques múltiplos — e a mesa consegue, enfim, sentar para jogar.

As duas primeiras metades foram cumpridas, e de um jeito que nenhuma sprint anterior tinha conseguido: **isto está provado contra o Supabase real**, não só com fakes — `/r 1d20+11 cd 18` numa mesa de PF2e gravou o grau na coluna `mensagens.avaliacao` do banco em uso, e a mesma rolagem numa mesa de D&D 5e voltou 400. Com uma ressalva que não é detalhe: o grau chega ao chat **por quem digita** e **pelo ataque da ficha**, e não pela salvaguarda nem pela perícia — a CD não tem porta lá ([RV-161](15-pathfinder2e.md)). A terceira metade — "a mesa consegue sentar para jogar" — **não** foi cumprida, por um motivo que não é deste épico e que está medido na seção final desta sprint.

| Ordem | Card | Como fechou |
|---|---|---|
| 0 | [RV-098](09-fichas.md) | ✅ **Entrou fora do plano e foi executado primeiro** — ver o bloco abaixo. O atributo passou a ter uma casa só: a coluna comum, na **escala** que o sistema declara (`DefinicaoSistema.atributos: EscalaDeAtributo`). `usaAtributosComuns` morreu, a ficha de PF2e voltou a exibir os seis atributos rolando o modificador gravado, e a migration `0009` consolidou as duas metades **só** nas linhas de PF2e |
| 1 | [RV-139](13-operacao.md) | ✅ **na execução, card ainda aberto.** O que a sprint dependia aconteceu: `npm run supabase:migrar` aplicou a `0009` e a `0010` e o verificador passou a imprimir "Ambiente pronto: migrations aplicadas e Storage confere" com as **dez** migrations e os buckets. O efeito da `0009` foi conferido linha a linha (`Valeros` de 18/14/16 para +4/+2/+3, `Yume` de D&D idêntico). Ficam sem evidência dois itens do DoD do card — sussurro e `/oculto` percorridos ponta a ponta contra o banco real, e a saída colada no card — e é por isso que ele não recebe ✅: são cinco minutos de confirmação, não trabalho novo |
| 2 | [RV-154](15-pathfinder2e.md) | ✅ O eixo do épico fechou: `cd 18` no chat (parser do RV-074) **ou** `cd` como número em `rolarDadosSchema` convergem para o mesmo valor **antes** de `RolarDados`, e o selo diz "Sucesso crítico · contra CD 18" em texto, sem depender de cor. Nasceu um quarto campo que o card não previa (`efeitoNatural`), sem o qual o cenário do 20 natural não era exprimível sem mentir. Fechou o contrato órfão da Sprint 2 — `grauSucesso` e `d20NaturalDe` têm consumidor de produção |
| 3 | [RV-155](15-pathfinder2e.md) | ✅ As quatro defesas saem calculadas e nenhuma linha soma `+ nivel` — todas chamam `bonusProficiencia` do RV-151, com teste que fica vermelho se alguma se afastar dele. **Entregou a rolagem em um clique, e não a CD junto dela** (ver RV-161, abaixo): a salvaguarda rola `1d20+6`, e o grau de sucesso que o RV-154 acabou de entregar não chega nela |
| 4 | [RV-156](15-pathfinder2e.md) | ✅ Três botões de acerto com o MAP aplicado, dois de dano, arma ágil trocando para −4/−8, e **nenhum contador de MAP em lugar nenhum** — a ausência é verificada por duas varreduras em disco e por um teste que clica duas vezes no mesmo botão. É o primeiro chamador de produção da segunda porta da CD |
| 5 | [RV-159](15-pathfinder2e.md) | 🚧 **Não entrou.** O argumento que o pôs aqui era vizinhança de arquivo com o RV-155 (`SecaoPericias.tsx`, `tipos.ts`, `pericias.ts`), e a vizinhança se dissolveu quando o RV-155 criou seção própria. Continua aberto, e a ficha continua mentindo: digitar um Saber repetido esvazia o campo e não grava nada |
| 6 | [RV-073](07-chat.md) | 🚧 **Não fechou pela terceira vez.** A sprint anterior escreveu que ou ele virava estágio com agente próprio, ou saía da página. Não virou nem saiu — e a regressão de 100 → 50 mensagens completa **três** sprints de pé |

**O RV-098 é o exemplo mais forte de "sprint não é contrato" até aqui, e por um motivo desconfortável.** Ele não veio de planejamento nem de leitura de código: veio de alguém **abrir o navegador** contra o banco real e criar um personagem de Pathfinder, em 2026-08-10, **com os 1.167 testes da suíte verdes**. O que a pessoa viu foi a coluna `atributos` com `{"forca":18,…}` e o `dados` com `{"modificadorForca":0,…}` na mesma linha: as duas metades certas isoladamente, cada uma com teste próprio, e nenhuma delas exercitando a outra. Ele entrou na Sprint 3 fora do plano, foi executado **antes** dos três cards de Pathfinder e isso não foi acidente — sem ele, o RV-155 e o RV-156 teriam calculado defesas e ataques a partir de um atributo que a ficha não mostrava.

**O padrão que esta sprint confirma: as duas últimas sprints ganharam card de defeito encontrado FORA da suíte de testes.**

| Sprint | Card | Como foi encontrado | Estado da suíte na hora |
|---|---|---|---|
| Sprint 2 (`v0.7.0`) | [RV-159](15-pathfinder2e.md) | verificação independente **em execução** (Testing Library, clique de verdade), não por leitura de código | verde |
| Sprint 3 (`v0.8.0`) | [RV-098](09-fichas.md) | verificação **manual no navegador** contra o Supabase real | verde, 1.167 testes |

E a Sprint 3 produziu o terceiro caso pelo mesmo mecanismo: [RV-160](15-pathfinder2e.md) — `/r 1d8+4 cd 18` recebe "Falha crítica" e grava o grau errado — foi medido pela verificação independente **contra a API em execução**, e a suíte tem um teste que parece cobrir isso e passa por outro motivo (a ficha não manda `cd` no dano; o servidor nunca recusou).

**O que o padrão diz, e não é "faltam testes".** A suíte foi de 1.167 para **1.475** nesta sprint e ficou verde nos três casos. O que ela não alcança é a **costura**: duas metades corretas isoladamente (F3 — o fake regrava o agregado inteiro e nunca vê a coluna esquecida), o ambiente que nunca foi exercitado (F10 — todo teste roda com fake, e migration em disco não é migration aplicada) e a proteção que mora na **forma do chamador** em vez de no servidor (F4 — o dano não leva CD porque a tela não manda, não porque o domínio recuse). Os três defeitos vivem exatamente aí, e nenhum deles é o tipo de coisa que mais um teste unitário pega.

Duas consequências de priorização, que são de quem decide e não da curadoria:

1. **A Sprint 5 (Confiança — `RV-006` modo memória, `RV-133` E2E) é a resposta estrutural a este padrão, e está duas sprints depois dele.** Enquanto ela não chega, o instrumento que mais rende neste projeto é a verificação em ambiente real — as três vezes que ela rodou, ela achou defeito que 1.167 e depois 1.475 testes verdes não achavam.
2. **Verificação em ambiente real não é formalidade de fim de sprint.** Nesta sprint ela deixou dados de auditoria no banco (4 usuários, 7 mesas, 5 personagens e 7 mensagens com prefixos `verificador+`, `Auditoria `, `Legado `, `Dano `) porque apagar linha em base real é decisão do humano. Limpar isso, ou aceitar o lixo, é operação — não virou card por não ter consequência para nenhum usuário: mesa é por dono.

**Uma correção de escopo dentro do RV-155 se confirmou útil:** o enunciado previa as defesas como bloco "somente leitura", e a curadoria da v0.7.0 acrescentou o cenário de rolagem em um clique. Foi entregue, e o RV-156 estendeu a leitura para o lugar certo — na ficha somente leitura, o acerto **continua rolável**, porque "não editável" nunca significou "sem botão de dado".

### Uma mesa de Pathfinder joga agora? — percurso medido, não estimado

| Passo da sessão | Estado | O que ainda impede |
|---|---|---|
| O mestre cria a mesa de PF2e | ✅ | Nada. A `0008` está aplicada e uma mesa `pathfinder2e` foi criada de verdade no banco em uso |
| Os outros quatro jogadores entram | ❌ | **É aqui que a sessão morre.** A plataforma existe em `localhost` e `RESEND_API_KEY` está vazia: todo convite cai no stdout da API, e o `ConviteDTO` não expõe o token nem para o mestre copiar à mão. [RV-132](13-operacao.md) |
| O jogador monta a ficha | ✅ com arestas | Atributos na escala do sistema, identidade, 16 perícias + Saber, defesas e ataques. Arestas: adicionar um Saber repetido é no-op silencioso ([RV-159](15-pathfinder2e.md)); bônus de acerto e armadura são digitados à mão até o catálogo ([RV-157](15-pathfinder2e.md)); ficha criada antes da sprint mostra o grau de defesa como *select* vazio até o primeiro salvamento (cosmético, registrado no RV-155) |
| Rola perícia | ✅ | Um clique, bônus certo, motivo pronto, todos veem sem recarregar |
| O mestre diz "CD 18" e o jogador rola a salvaguarda | ⚠️ | A rolagem sai certa e **sem grau de sucesso**: só o ataque tem de onde tirar a CD. A mesa volta a comparar 28 com 18 na cabeça, que é exatamente o que o épico existe para eliminar. [RV-161](15-pathfinder2e.md) |
| Ataca | ✅ | Três botões com o MAP aplicado, CA do alvo no campo, grau de sucesso no chat |
| Rola o dano | ✅ com defeito ao lado | O botão de dano nunca leva CD. Mas quem **digitar** `/r 1d8+4 cd 18` no chat recebe "Falha crítica" num dano, e o grau errado fica **gravado**. [RV-160](15-pathfinder2e.md) |
| Sofre dano | ✅ na mão | O mestre anuncia, o jogador edita `pvAtual` na ficha e a barra sobre o token acompanha na sessão. Painel de dano e cura é [RV-065](06-combate.md) |
| Iniciativa e turnos | ❌ na plataforma | Papel e caneta, como em qualquer VTT antes do tracker. [RV-061](06-combate.md)/[RV-062](06-combate.md)/[RV-063](06-combate.md) e [RV-158](15-pathfinder2e.md) |
| Três horas de chat | ⚠️ | Cinco pessoas passam de 50 mensagens rápido, e não existe caminho para alcançar o resto. [RV-073](07-chat.md), terceiro escorregão |

**A resposta honesta: a mecânica joga; a mesa não.** Um mestre sozinho, na máquina dele, conduz uma sessão de Pathfinder de ponta a ponta hoje — ficha, perícia, defesa, ataque com MAP, grau de sucesso no chat e dano no PV. **Cinco pessoas não conseguem sequer entrar.** Isso não é falha desta sprint nem do E15: é o [RV-132](13-operacao.md), segundo item da **Onda 1**, agendado para a Sprint 6.

**E aqui a curadoria registra a mesma leitura pela segunda vez.** A curadoria da v0.7.0 escreveu, nesta página, que "ou o RV-132 sobe para a Sprint 4, ou 'a mesa joga' continua significando 'o mestre joga sozinho na máquina dele'". A Sprint 3 fechou, o Pathfinder ficou pronto, e o RV-132 continua três sprints à frente. Repetir a leitura sem consequência é a mesma classe de defesa inerte que a taxonomia chama de F1 — regra escrita em documento que nenhuma linha executa. Então ela vira **proposta com composição escrita** abaixo, e a decisão continua sendo do humano.

## Proposta desta curadoria — uma sprint de publicação **antes** do Combate

> **Objetivo:** as cinco pessoas entram. Convite real, endereço de terceiro, plataforma fora do `localhost`.

`RV-132` (deploy de API e web + `RESEND_API_KEY` + um convite real entregue a um endereço de terceiro) · `RV-073` (histórico paginado, **como estágio próprio, com agente próprio** — é numa sessão real de três horas que ele morde, então é aqui que ele pertence)

Por que própria e não dentro da Sprint 4: o RV-132 é `G`, não compartilha um arquivo com o Combate e não é a mesma competência (deploy, DNS, domínio de email). Enfiá-lo numa sprint de combate reproduz exatamente o que aconteceu com o RV-073 três vezes — o item que sobra quando a sprint aperta. E o retorno é assimétrico: cada card de combate melhora uma sessão que não começa; este faz a sessão começar.

Se a decisão for **não** subir o RV-132, então o objetivo da Sprint 4 precisa ser reescrito com honestidade — "o mestre conduz uma luta pela plataforma" continua significando "sozinho".

## Sprint 4 — Combate · `v0.9.0` · ▶ próxima

> **Objetivo:** o mestre conduz uma luta pela plataforma, sem planilha ao lado.

| Ordem | Card | Por que está aqui |
|---|---|---|
| 1 | [RV-160](15-pathfinder2e.md) | **Card protetor, regra de composição nº 1.** Hoje qualquer expressão recebe grau de sucesso se vier com CD — inclusive um dano. O RV-161 vai **abrir mais portas de CD**; fechar essa classe depois de multiplicá-la é o caminho conhecido para o grau errado gravado em mais lugares. `P` |
| 2 | [RV-161](15-pathfinder2e.md) | A CD chega às rolagens da ficha (salvaguardas, Percepção, perícias). É o que falta para o eixo do épico — `ficha → bônus certo → grau no chat` — valer na checagem **mais rolada** de uma sessão de PF2e, e não só no ataque. `M` |
| 3 | `RV-060` … `RV-065` | Agregado Combate, iniciativa, turnos, painel, condições, aplicar dano/cura. É o corpo da sprint |
| 4 | [RV-158](15-pathfinder2e.md) | Iniciativa por Percepção em PF2e. Depende de RV-061 e consome a Percepção rolável do RV-155 — e é ele quem fecha a última F2 do épico (`rolagensPadrao`, declarado por quatro sistemas e lido por zero linhas de produção) |
| 5 | [RV-159](15-pathfinder2e.md) | **Segunda tentativa.** Perdeu a vizinhança de arquivo que o justificava na Sprint 3, e entra aqui por ser `P` e por ser a ficha mentindo para o jogador. Se escorregar de novo, não volta a ser apêndice: vira estágio próprio ou sai da página, como está escrito para o RV-073 |

**Regra nº 2 aplicada:** RV-160 e RV-161 tocam `rolar-dados.ts`/`avaliar-rolagem.ts` e a ficha de PF2e; RV-060…RV-065 criam o agregado Combate; RV-158 costura os dois. São três frentes de escrita distintas, então cabem na mesma sprint com agentes diferentes — o que **não** cabe é RV-161 e RV-158 no mesmo instante, porque disputam `defesas.ts` e a Percepção.

**O RV-073 não está nesta lista de propósito.** Ele saiu da sprint de Pathfinder pela terceira vez e não vira apêndice de uma sprint de combate. Ou entra na sprint de publicação proposta acima, com agente próprio, ou sai da página até ser a prioridade de alguém — que é a regra que esta página já escreveu e não cumpriu.

## Sprint 5 — Confiança · `v0.10.0`

> **Objetivo:** parar de depender de verificação manual para saber que a plataforma funciona.

`RV-006` (modo memória, desbloqueia o E2E) · `RV-133` (E2E do fluxo crítico) · `RV-136` (cobertura dos adapters Supabase) · `RV-137` (limites de abuso no Socket.IO) · `RV-140` (guardrails alinhados ao código)

## Sprint 6 — Operação · `v1.0.0`

> **Objetivo:** roda para grupos reais toda sexta à noite, sem alguém de plantão.

`RV-130` (observabilidade) · `RV-132` (deploy) · `RV-131` (backup e retenção) · `RV-134` (teste de carga)

> **Contestado na curadoria da v0.7.0:** o `RV-132` é o segundo item da Onda 1 e está aqui, três sprints depois de a plataforma ficar jogável. Ver a nota ao fim da Sprint 3.

---

## Fora das sprints planejadas

Cards abertos que não entram nas seis primeiras sprints e **por quê**:

| Épico | Cards | Motivo |
|---|---|---|
| [E01](01-contas.md) | RV-010 … RV-014 | Refresh token, logout e perfil melhoram a operação, não destravam o jogo |
| [E05](05-fog-of-war.md) | RV-050 … RV-052 | Névoa é diferencial forte, mas nenhuma mesa deixa de jogar sem ela |
| [E08](08-dados.md) | RV-080 … RV-084 | O motor atual cobre PF2e; explosão e pool servem a outros sistemas |
| [E09](09-fichas.md) | RV-092, RV-094, RV-095 | Ficha completa de D&D, inventário e bestiário são profundidade de sistema, não pré-requisito de nenhuma sprint |
| [E09](09-fichas.md) | **RV-097** | Defeito real da v0.6.0, mas exige **decisão de produto** (recusar a troca de sistema, migrar os `dados` ou tirar `sistema` do PATCH) antes de virar trabalho. Entra na primeira sprint depois da decisão; se um grupo real cair nele antes, sobe para a Onda 1 |
| [E10](10-handouts.md) | RV-100 … RV-102 | Material de apoio; o chat cobre o essencial hoje |
| [E11](11-tempo-real.md) | **RV-117** | A interface já diz a verdade ao usuário ("só verá a ficha sumir ao recarregar"), então é escopo faltando e não defeito silencioso. Candidato natural à **Sprint 4**, onde o combate passa a depender de ficha viva na tela de todo mundo |
| [E12](12-ux.md) | RV-120, RV-121, RV-123 … RV-125 | Responsivo e acessibilidade entram quando houver uso real em telas variadas |
| [E15](15-pathfinder2e.md) | RV-157 | Catálogo é o último card do épico, por decisão de licenciamento |
| Diversos | RV-025, RV-026, RV-028, RV-029, RV-043 … RV-046, RV-110, RV-111, RV-113, RV-114 | Ver o épico de cada um |

Sprint não é contrato, e isso vale nas duas direções.

**Card entra.** [RV-096](09-fichas.md) não existia quando a Sprint 2 foi escrita: nasceu da execução da Sprint 1, foi julgado bloqueador do E15 na curadoria da v0.6.0 e entrou como **primeiro item** da Sprint 2, na frente de cards já planejados. Fechou dentro dela e cobrou o próprio preço no mesmo lote. Na v0.7.0 o mesmo mecanismo produziu o [RV-159](15-pathfinder2e.md) e trouxe o [RV-139](13-operacao.md) de "sprint nenhuma" para o primeiro lugar da Sprint 3. E na Sprint 3 aconteceu a versão mais forte disso: o [RV-098](09-fichas.md) nasceu de **verificação manual no navegador**, entrou na sprint já em curso e foi executado **antes** dos três cards de Pathfinder — porque defesas e ataques calculados sobre um atributo com duas verdades teriam nascido errados.

**Card sai.** [RV-073](07-chat.md) foi planejado na Sprint 1, arrastado para a Sprint 2, arrastado para a Sprint 3 e não fechou nas três. A Sprint 3 já dizia, por escrito, "ou vira estágio com agente próprio, ou sai da página" — e ele foi mantido como sexto item de uma sprint de Pathfinder, o que é a definição de folga. Na Sprint 4 ele **não** aparece: ou entra na sprint de publicação proposta, com agente próprio, ou sai da página até que seja a prioridade de alguém. Um card que atravessa três sprints sem sair do lugar não está sendo despriorizado — está sendo usado para fazer a sprint parecer maior.

**Item executado sem o card fechar.** [RV-139](13-operacao.md) é o primeiro caso: as dez migrations foram aplicadas e conferidas na verificação da Sprint 3, o que era o efeito de que a sprint dependia, mas dois itens do DoD dele não têm evidência. O card fica aberto. Registrar isso como "concluído" seria trocar a checagem por otimismo, que é o hábito que o próprio RV-139 nasceu para corrigir.

## Histórico

As quatro primeiras entregas aconteceram como **fases**, antes desta página existir. Ficam registradas aqui pela equivalência:

| Fase | Versão | Objetivo entregue |
|---|---|---|
| 1 | [v0.2.0](../release-notes/v0.2.0.md) | Fundação: lint de arquitetura, CI, harness de contrato |
| 2 | [v0.3.0](../release-notes/v0.3.0.md) | Ciclo de vida das mesas, endurecimento HTTP, testes no front |
| 3 | [v0.4.0](../release-notes/v0.4.0.md) | Tabletop: cenas, mapa, grid, zoom, tokens ricos |
| 4 | [v0.5.0](../release-notes/v0.5.0.md) | Chat privado, reconexão, estados de UI, defeitos de produção |
