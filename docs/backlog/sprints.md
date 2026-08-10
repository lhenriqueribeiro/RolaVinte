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

> **Fechado pela metade na Sprint 3, e a metade que sobrou está nomeada.** `grauSucesso` e `d20NaturalDe` ganharam consumidor de produção pelo RV-154 (`avaliar-rolagem.ts` → `DefinicaoSistema.avaliarRolagem` → `RolarDados`), provado contra o banco real. `cdPorNivel`, `CDS_SIMPLES`, `somarModificadores` e `MARGEM_CRITICA` continuam com **zero** call sites de produção — o RV-156 explicou por escrito por que não os usou (a penalidade de ataques múltiplos não empilha tipo nenhum), e nenhum card em aberto os promete. Consequência para o usuário: a tabela de CDs do PF2e não chega a tela nenhuma, e o mestre continua consultando o livro para escolher a CD que vai digitar — é o contexto que o [RV-161](15-pathfinder2e.md) herda — e que **continua de pé**, porque o RV-161 não entrou na
> Sprint 4. `rolagensPadrao`, por outro lado, **deixou de ser órfão na Sprint 4**: o RV-158 lhe deu consumidor de
> produção (`RolarIniciativa`) e duas guardas que ficam vermelhas se ele voltar a não ter.

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

## Proposta da curadoria da v0.8.0 — uma sprint de publicação **antes** do Combate · ❌ não adotada

> **Objetivo:** as cinco pessoas entram. Convite real, endereço de terceiro, plataforma fora do `localhost`.

`RV-132` (deploy de API e web + `RESEND_API_KEY` + um convite real entregue a um endereço de terceiro) · `RV-073` (histórico paginado, **como estágio próprio, com agente próprio** — é numa sessão real de três horas que ele morde, então é aqui que ele pertence)

Por que própria e não dentro da Sprint 4: o RV-132 é `G`, não compartilha um arquivo com o Combate e não é a mesma competência (deploy, DNS, domínio de email). Enfiá-lo numa sprint de combate reproduz exatamente o que aconteceu com o RV-073 três vezes — o item que sobra quando a sprint aperta. E o retorno é assimétrico: cada card de combate melhora uma sessão que não começa; este faz a sessão começar.

Se a decisão for **não** subir o RV-132, então o objetivo da Sprint 4 precisa ser reescrito com honestidade — "o mestre conduz uma luta pela plataforma" continua significando "sozinho".

> **Desfecho, registrado na curadoria da v0.9.0:** a proposta não foi adotada, a Sprint 4 rodou como estava e o
> objetivo dela **de fato** significou "sozinho" — a leitura acima se confirmou palavra por palavra. Ela fica aqui
> como história datada, não como pendência: a proposta viva agora é outra, porque o argumento mudou de qualidade.
> Com o combate entregue, **não há mais nenhum card de produto** entre o repositório e uma sessão real de cinco
> pessoas; o que resta é publicar. Ver o fecho da Sprint 4 e a nota da Sprint 6.

## Sprint 4 — Combate · `v0.9.0` · ✅ concluída

> **Objetivo:** o mestre conduz uma luta pela plataforma, sem planilha ao lado.

**Cumprido, e mais do que o objetivo dizia: a luta é conduzida por quem joga, não só pelo mestre.** O painel é
visível a todos os participantes, o jogador rola a iniciativa da própria peça e vê a vez chegar por três canais
que não dependem de cor. O que **não** foi cumprido é a metade de Pathfinder da sprint: dos dez cards planejados
(RV-160, RV-161, os seis do E06, RV-158 e RV-159), **três não entraram** — e um deles era o primeiro item da
lista, o card protetor.

| Ordem planejada | Card | Como fechou |
|---|---|---|
| 1 | [RV-160](15-pathfinder2e.md) | ❌ **Não entrou.** Era o card protetor da sprint pela regra de composição nº 1. Conferido no fecho: `rolar-dados.ts` continua chamando `avaliar(...)` para **qualquer** expressão que venha com CD, então `/r 1d8+4 cd 18` segue gravando "Falha crítica" num dano |
| 2 | [RV-161](15-pathfinder2e.md) | ❌ **Não entrou.** Conferido no fecho: só o caminho de ataque manda `cd`; salvaguarda, Percepção e perícia continuam rolando sem grau de sucesso |
| 3 | `RV-060` … `RV-065` | ✅ **Os seis.** Agregado `Combate` (terceira raiz de agregado do projeto), iniciar/rolar iniciativa, turno e rodada, painel de iniciativa com realce no mapa, catálogo de 14 condições no token e dano/cura pelo painel. Migrations `0011_condicoes` e `0012_combate` escritas **e aplicadas**, com o efeito conferido no Postgres pela verificação independente |
| 4 | [RV-158](15-pathfinder2e.md) | ✅ Iniciativa é resposta do **sistema**: Percepção em PF2e (lida da mesma lista de `defesas(ficha)` que a ficha desenha, sem recalcular), dezesseis perícias como alternativa, Destreza em D&D 5e — e a mesa de D&D **recusa** a alternativa de PF2e. Fechou a última F2 do épico: `rolagensPadrao` tem consumidor de produção e duas guardas |
| 5 | [RV-159](15-pathfinder2e.md) | ❌ **Não entrou pela segunda vez.** A Sprint 3 já havia escrito "se escorregar de novo, vira estágio próprio ou sai da página". Escorregou. A ficha continua esvaziando o campo de Saber sem dizer por quê |
| — | [RV-140](14-documentacao.md) | ✅ **Entrou fora do plano, vindo da Sprint 5.** As nove regras de `.claude/rules/` foram lidas contra o código, mais `CLAUDE.md`, o protocolo e a taxonomia. Cinco símbolos citados que não existem foram removidos, duas exigências que ninguém cumpria foram apagadas em vez de mantidas, e quatro afirmações falsas de estado saíram da taxonomia |

**Por que o RV-140 antes da hora foi acerto, e por que a troca ainda saiu no vermelho.** Ele não é uma
funcionalidade: é a superfície que **todo** agente lê antes de codar. Os quatro agentes de implementação que
vieram depois dele justificaram decisões citando guardrail e taxonomia — inclusive mecanismos que só passaram a
estar **escritos** por causa dele: as guardas do agregado, os quatro passos do evento WS e o registro total como
único ponto de associação chave→comportamento. Vindo antes dos cards de combate, ele pagou dentro da própria
sprint (o `combate:atualizado` nasceu com os quatro passos completos, e nenhuma escrita reimplementou guarda de
autorização à mão, que era o furo do RV-027). Mas a conta líquida
é desconfortável: **entrou um card de qualidade e saíram três de produto**, sendo um deles protetor. Isso não é
o RV-140 tirando o lugar de ninguém — é a sprint tendo sido composta com sete cards para quatro agentes.

**A regra nº 1 foi escrita e não foi cumprida, e o preço é conhecido.** O RV-160 estava em primeiro lugar
porque o RV-161 multiplicaria as portas de CD. O RV-161 também não entrou, então a classe **não** foi
multiplicada e o dano imediato é zero — mas a dívida ficou intacta e agora ela atravessa uma versão em que o
combate existe. Se a próxima sprint puxar o RV-161 sem o RV-160 na frente, o grau errado passa a ser gravado
por três portas em vez de uma.

**Nasceram cinco cards da execução** (critério de corte aplicado sobre 43 achados — 27 descobertas dos cinco
agentes de implementação, 10 da verificação independente e 6 problemas abertos que ela listou, com sobreposição
entre eles): [RV-066](06-combate.md) — a expressão informada vence a
derivação para **qualquer** papel, então o jogador escolhe a própria iniciativa por chamada direta à rota (F4,
proteção que mora só na interface); [RV-067](06-combate.md) — trocar a cena ativa no meio da luta esvazia PV,
botões e realce sem uma palavra de explicação; [RV-162](15-pathfinder2e.md) — a ficha diz ao jogador que a
plataforma "ainda não sabe de quem é o turno", frase que esta sprint tornou falsa em três lugares;
[RV-141](14-documentacao.md) — o vocabulário do guardrail de DDD não incorporou a terceira raiz de agregado, e
invocar o script `typecheck`, que não existe, devolve exit 0; [RV-142](13-operacao.md) — roteiro de fumaça contra o ambiente
real, com ida e volta de campo (ver a Sprint 5, abaixo).

**O que foi descartado, e por quê** — o descarte justificado é parte do trabalho de curadoria, e sem ele estes
achados voltam como card na próxima sprint. **Viraram contexto dentro de card existente, não card novo:** a
ausência de teste do `cena-repository.supabase.ts` (agora com `condicoes` conferido só por script descartável) e
o `unique` do banco respondendo 500 em vez de 409 nas corridas — os dois entraram no
[RV-136](13-operacao.md#rv-136--cobertura-automatizada-dos-adapters-supabase), que também teve um cenário de
borda **corrigido**, porque ele pedia o oposto do desenho registrado na regra 07; e a ressincronização do cache
`['combate']`, que virou nota fechada no [RV-112](11-tempo-real.md). **Não viraram nada:** condições de PF2e sem
efeito mecânico (`enfraquecido`, `lento`) — é profundidade de sistema, não defeito, e o lugar do efeito é a
definição do sistema, não o catálogo; a ausência de `atualizado_em` em todas as tabelas — se o produto quiser
"editado em", é card de schema com leitor, não conserto de documentação; o mestre não poder digitar iniciativa
manual em peça **com** ficha — decisão deliberada, com o desenho certo (modificador circunstancial) já escrito
caso vire necessidade; a ordem de entrada como desempate que o mestre não controla — a tela diz a verdade sobre
isso, então é escopo faltando sem promessa falsa, e "jogador antes de NPC" foi decidido contra por escrito; o
`tipo: 'sistema'` que ficou quatro versões sem produtor — ganhou um agora, e a assimetria que sobra (o registro
obriga a classificar, não a usar) não tem consequência hoje; e três achados de **processo**, não de produto: o
briefing da fase chegou com número de migration ocupado e com contagem de testes de duas entregas atrás, e o
orquestrador atribuiu ao agente de backend duas linhas de front. Isso é matéria de
[docs/agentes/](../agentes/README.md), não de backlog.

**Um defeito foi encontrado e corrigido dentro da verificação, e vale como registro do método:** rolar
iniciativa num combate encerrado gravava e transmitia `Iniciativa — Thorin: 23` no chat de toda a mesa **antes**
de responder 409 — um número que a mesa viu e a ordem não tem. A guarda existia; a **ordem** dela estava errada.
Foi achado escrevendo o teste primeiro, vendo-o vermelho, e só então mexendo no caso de uso.

**A sprint não deixou nenhum item do baseline pior**, o que é a primeira vez em quatro. As duas migrations novas
foram aplicadas na mesma entrega que as criou, então a fila continua em zero — a disciplina que a F10 cobrou na
v0.5.0 virou hábito.

### Uma mesa de Pathfinder joga uma sessão inteira agora? — percurso medido, não estimado

| Passo da sessão | Estado | O que ainda impede |
|---|---|---|
| O mestre cria a mesa de PF2e e a cena | ✅ | Nada. Mesa, cena, mapa de fundo, grid e zoom |
| Os outros quatro jogadores entram | ❌ | **É aqui que a sessão morre, pela quarta versão seguida.** A plataforma existe em `localhost`, `RESEND_API_KEY` está vazia, todo convite cai no stdout da API e o `ConviteDTO` não expõe o token nem para o mestre copiar à mão. [RV-132](13-operacao.md) |
| O jogador monta a ficha | ✅ com arestas | Atributos na escala do sistema, identidade, 16 perícias + Saber, defesas e ataques calculados. Arestas: Saber repetido é no-op silencioso ([RV-159](15-pathfinder2e.md), segundo escorregão); bônus de acerto e armadura digitados à mão até o catálogo ([RV-157](15-pathfinder2e.md)) |
| Entra em combate | ✅ | O mestre escolhe as peças por caixas de seleção e inicia. Um combate ativo por mesa, com 409 no segundo |
| Rola iniciativa | ✅ com defeito ao lado | Sai da Percepção da ficha sem ninguém digitar número, e a alternativa por perícia existe para a emboscada. **Mas o jogador pode mandar `1d20+99` pela rota e a plataforma aceita** ([RV-066](06-combate.md)) — e o mestre não controla o desempate, que é a ordem das peças na cena |
| Ataca | ✅ | Três botões com o MAP aplicado, CA do alvo no campo, grau de sucesso no chat |
| Sofre dano | ✅ | Dano e cura pelo painel, um clique: a ficha muda, a barra do token acompanha, o chat registra e o PV para em 0 |
| Ganha condição | ✅ | 14 condições marcáveis pelo mestre, com rótulo textual para todos, e `inconsciente` marcado/desmarcado automaticamente ao zerar e recuperar PV |
| O turno passa | ✅ | Rodada, turno, "Rodada 2" no chat, realce da peça no mapa e "É a sua vez" por três canais sem depender de cor |
| O mestre diz "CD 18" e o jogador rola a salvaguarda | ⚠️ | A rolagem sai certa e **sem grau de sucesso**. A mesa volta a comparar 28 com 18 na cabeça. [RV-161](15-pathfinder2e.md), não entregue |
| Rola o dano | ✅ com defeito ao lado | Quem **digitar** `/r 1d8+4 cd 18` recebe "Falha crítica" num dano, e o grau errado fica gravado. [RV-160](15-pathfinder2e.md), não entregue |
| Troca de mapa no meio da luta | ⚠️ | O painel perde PV, botões e realce sem explicação. [RV-067](06-combate.md) |
| Três horas de chat | ⚠️ | Cinco pessoas passam de 50 mensagens rápido e não existe caminho para alcançar o resto. [RV-073](07-chat.md), **fora das sprints por decisão registrada** |

**A resposta honesta: o combate joga; a mesa continua não jogando, e o motivo é o mesmo de três sprints atrás.**
Um mestre sozinho, na máquina dele, conduz hoje uma luta de Pathfinder inteira pela plataforma — iniciativa
derivada da ficha, turno, condições, dano no PV e grau de sucesso no ataque. **Cinco pessoas ainda não
conseguem entrar.** A Sprint 4 melhorou muito uma sessão que não começa, que é exatamente o que a curadoria da
v0.7.0 e a da v0.8.0 previram por escrito, nesta página, e que nenhuma decisão desfez.

**Terceira vez que esta leitura é registrada, e agora com uma diferença factual.** Nas duas anteriores a
resposta possível era "o Pathfinder ainda não está pronto". Agora está: com o combate entregue, **não há mais
nenhum card de produto entre o repositório e uma sessão real** — o que sobra é publicação e entrega de convite.
Se o [RV-132](13-operacao.md) continuar na Sprint 6, a versão `v1.0.0` chega antes da primeira sessão de cinco
pessoas, e a métrica de pronto do produto vira decorativa.

## Sprint 5 — Confiança · `v0.10.0` · ▶ próxima

> **Objetivo:** parar de depender de verificação manual para saber que a plataforma funciona.

`RV-006` (modo memória, desbloqueia o E2E) · `RV-133` (E2E do fluxo crítico) · `RV-136` (cobertura dos adapters
Supabase) · `RV-137` (limites de abuso no Socket.IO) · ~~`RV-140`~~ (**entregue na Sprint 4**) · **`RV-142`
(roteiro de fumaça contra o ambiente real — card novo, ver abaixo)**

### O conteúdo desta sprint está certo? — três reparos, medidos

**1. O RV-140 saiu: já foi entregue.** Ele foi executado na Sprint 4, fora do plano, e não deve ser recontado
aqui.

**2. O RV-133 não é executável nesta sprint como a página o compõe.** Ele declara `**Depende de:** RV-006,
RV-132`, e o **RV-132 está na Sprint 6** — a Definition of Ready falha antes de o agente começar. São só duas
saídas honestas: ou o RV-132 sobe (o que a v0.7.0 e a v0.8.0 já pediram, sem consequência), ou a dependência do
RV-133 é reduzida por escrito ao modo memória, aceitando que o E2E rode só em `localhost` até haver ambiente
publicado. Deixar como está é agendar o quarto escorregão do projeto.

**3. O E2E do RV-133 é a resposta certa para uma classe de defeito, e não para a que mais custou aqui.** Ele
roda com `PERSISTENCIA=memoria` para não depender de banco no CI — o próprio RV-136 registra que "nem o E2E
encosta nos adapters Supabase". Confira o padrão contra o que ele pegaria:

| Defeito | Como foi achado | O E2E em modo memória pegaria? |
|---|---|---|
| [RV-159](15-pathfinder2e.md) (Saber no-op) | Testing Library, em execução | **Sim** — é interação de tela, e é aqui que o E2E rende |
| [RV-098](09-fichas.md) (atributo com duas casas) | navegador contra o Supabase real | **Não.** As duas metades estavam certas isoladamente; o que expôs foi ler a linha gravada. Em memória, o fake regrava o objeto inteiro e a divergência não existe |
| [RV-160](15-pathfinder2e.md) (grau em dano) | API em execução, chamada direta | **Não.** A tela nunca manda `cd` num dano — o E2E percorre a tela, então reproduz a mesma proteção que mora na forma do chamador (F4) |
| F10 (migration em disco, chat fora do ar) | ambiente real | **Não, por construção:** modo memória existe para não ter banco |

Dois dos três defeitos mais caros — e a classe que derrubou o chat inteiro — passam pelo E2E como escrito. **Não
é que o RV-133 esteja errado; é que ele cobre a metade de cima da costura.** A metade de baixo (escreveu no
Postgres real e releu pelo mesmo contrato?) não tem card nenhum no backlog: o `supabase:verificar` responde "o
schema está lá", o RV-136 prova a **consulta** com cliente falso, e o RV-009 pegaria coluna inexistente em
compilação, mas nenhum deles grava e relê.

**Daí o card novo, [RV-142](13-operacao.md).** Um roteiro executável (o script `fumaca`) que percorre o fluxo
crítico contra o Supabase em uso, gravando cada campo que o usuário informa e **relendo pelo mesmo contrato**,
falhando com o nome do campo divergente. Ele é a versão repetível do único instrumento que achou defeito quatro
vezes neste projeto, custa `M`, **não depende de RV-006 nem de RV-132** e roda hoje. Se a sprint precisar
escolher, ele rende mais cedo que o RV-133 — e é o RV-133 que depende de um card de outra sprint, não ele.

**Uma recomendação de composição, que é decisão de quem prioriza e não da curadoria:** o
[RV-009](00-fundacao.md) (tipos gerados do banco) é o quarto item da Onda 1 e não está em sprint nenhuma. Ele é
a versão em tempo de compilação da mesma classe — nome de coluna errado deixaria de compilar em vez de estourar
na mesa de alguém — e é mais barato que o RV-136. Numa sprint chamada "Confiança", a ausência dele chama atenção.

**Os dois defeitos abertos de combate cabem aqui, e por afinidade e não por sobra:** [RV-066](06-combate.md) é
`P`, é F4 (proteção que existe só na interface) e a sprint é sobre não confiar na forma do chamador;
[RV-067](06-combate.md) é `P` e puro front. Juntos são menos de meio dia.

## Sprint 6 — Operação · `v1.0.0`

> **Objetivo:** roda para grupos reais toda sexta à noite, sem alguém de plantão.

`RV-130` (observabilidade) · `RV-132` (deploy) · `RV-131` (backup e retenção) · `RV-134` (teste de carga)

> **Contestado na curadoria da v0.7.0:** o `RV-132` é o segundo item da Onda 1 e está aqui, três sprints depois de a plataforma ficar jogável. Ver a nota ao fim da Sprint 3.
>
> **Contestado pela terceira vez na curadoria da v0.9.0, e agora o argumento é aritmético, não retórico.** Com o
> combate entregue, o `RV-132` é o **único** card entre o repositório e a métrica de pronto do produto ("um grupo
> de 5 pessoas completa uma sessão de 3h"). Ele também é o único item da Sprint 6 que **outros** cards esperam:
> `RV-133` e `RV-134` declaram dependência dele — então, como a página está composta, a Sprint 5 contém um card
> `G` que só fica pronto na Sprint 6. Ou o `RV-132` sobe para a Sprint 5, ou o `RV-133` desce para a Sprint 6
> junto com ele. As duas resolvem; manter as duas coisas onde estão não resolve, e a página já registrou essa
> mesma inconsistência duas vezes sem consequência.

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
| [E11](11-tempo-real.md) | **RV-117** | A interface já diz a verdade ao usuário ("só verá a ficha sumir ao recarregar"), então é escopo faltando e não defeito silencioso. Era candidato à Sprint 4 e **não entrou**; o combate entregue não o tornou urgente, porque o painel lê o PV do cache de personagens, que o `personagem:atualizado` mantém vivo — o que fica de fora é criar/excluir ficha durante a sessão |
| [E06](06-combate.md) | **RV-066**, **RV-067** | Nascidos da v0.9.0. Os dois são `P` e estão **recomendados para a Sprint 5** (ver lá): RV-066 é F4 e RV-067 é puro front |
| [E13](13-operacao.md) | **RV-142** | Nascido da v0.9.0 e **proposto para a Sprint 5**, onde ele é a metade da costura que o E2E não alcança |
| [E14](14-documentacao.md) | **RV-141** | Nascido da v0.9.0. `P`, sem urgência: o guardrail não está errado, está incompleto — mas a guarda que ele cria é o que impede a próxima raiz de agregado de ficar de fora |
| [E15](15-pathfinder2e.md) | **RV-162** | Nascido da v0.9.0. Depende de uma decisão de produto (o turno pré-seleciona o ataque?), e o texto falso ao usuário é a parte de uma linha |
| [E12](12-ux.md) | RV-120, RV-121, RV-123 … RV-125 | Responsivo e acessibilidade entram quando houver uso real em telas variadas |
| [E15](15-pathfinder2e.md) | RV-157 | Catálogo é o último card do épico, por decisão de licenciamento |
| Diversos | RV-025, RV-026, RV-028, RV-029, RV-043 … RV-046, RV-110, RV-111, RV-113, RV-114 | Ver o épico de cada um |

Sprint não é contrato, e isso vale nas duas direções.

**Card entra.** [RV-096](09-fichas.md) não existia quando a Sprint 2 foi escrita: nasceu da execução da Sprint 1, foi julgado bloqueador do E15 na curadoria da v0.6.0 e entrou como **primeiro item** da Sprint 2, na frente de cards já planejados. Fechou dentro dela e cobrou o próprio preço no mesmo lote. Na v0.7.0 o mesmo mecanismo produziu o [RV-159](15-pathfinder2e.md) e trouxe o [RV-139](13-operacao.md) de "sprint nenhuma" para o primeiro lugar da Sprint 3. E na Sprint 3 aconteceu a versão mais forte disso: o [RV-098](09-fichas.md) nasceu de **verificação manual no navegador**, entrou na sprint já em curso e foi executado **antes** dos três cards de Pathfinder — porque defesas e ataques calculados sobre um atributo com duas verdades teriam nascido errados.

**Card sai.** [RV-073](07-chat.md) foi planejado na Sprint 1, arrastado para a Sprint 2, arrastado para a Sprint 3 e não fechou nas três. A Sprint 3 já dizia, por escrito, "ou vira estágio com agente próprio, ou sai da página" — e ele foi mantido como sexto item de uma sprint de Pathfinder, o que é a definição de folga. Na Sprint 4 ele **não** aparece: ou entra na sprint de publicação proposta, com agente próprio, ou sai da página até que seja a prioridade de alguém. Um card que atravessa três sprints sem sair do lugar não está sendo despriorizado — está sendo usado para fazer a sprint parecer maior.

> **A regra funcionou, e o [RV-159](15-pathfinder2e.md) é o caso seguinte.** Fora da página, o RV-073 parou de
> inflar sprint — continua aberto, continua sendo a regressão de 100 → 50 mensagens, e agora está honestamente
> classificado como "não é prioridade de ninguém". O RV-159 escorregou duas vezes com a mesma promessa escrita
> ("vira estágio próprio ou sai da página") e a Sprint 4 o manteve como quinto item. Pela regra desta seção ele
> **sai da Sprint 5** e vira decisão explícita: ou alguém o toma como estágio, ou ele desce para a lista acima.
> Ele é `P` e é a ficha mentindo para o jogador — o que o mantém preso é justamente ser pequeno o bastante para
> ser sempre o último.

**Item executado sem o card fechar.** [RV-139](13-operacao.md) é o primeiro caso: as dez migrations foram aplicadas e conferidas na verificação da Sprint 3, o que era o efeito de que a sprint dependia, mas dois itens do DoD dele não têm evidência. O card fica aberto. Registrar isso como "concluído" seria trocar a checagem por otimismo, que é o hábito que o próprio RV-139 nasceu para corrigir.

## Histórico

As quatro primeiras entregas aconteceram como **fases**, antes desta página existir. Ficam registradas aqui pela equivalência:

| Fase | Versão | Objetivo entregue |
|---|---|---|
| 1 | [v0.2.0](../release-notes/v0.2.0.md) | Fundação: lint de arquitetura, CI, harness de contrato |
| 2 | [v0.3.0](../release-notes/v0.3.0.md) | Ciclo de vida das mesas, endurecimento HTTP, testes no front |
| 3 | [v0.4.0](../release-notes/v0.4.0.md) | Tabletop: cenas, mapa, grid, zoom, tokens ricos |
| 4 | [v0.5.0](../release-notes/v0.5.0.md) | Chat privado, reconexão, estados de UI, defeitos de produção |
