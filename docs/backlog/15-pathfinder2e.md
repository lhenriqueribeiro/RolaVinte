# E15 — Pathfinder 2e

Suporte a Pathfinder Segunda Edição no RolaVinte: ficha, rolagem e chat falando a mesma língua que a mesa fala.

Este épico existe porque PF2e é o sistema onde **automação vale mais**. Em D&D 5e o jogador soma um número e pronto; em PF2e cada checagem depende de nível + grau de treinamento + modificador de atributo, e o resultado ainda precisa ser comparado a uma CD para virar um dos quatro graus de sucesso. É conta demais para fazer na mão três vezes por turno — e é exatamente o tipo de conta que um computador faz de graça.

---

## Estratégia — leia antes de pegar qualquer card

### 1. Onde está o valor: integração, não volume

No Roll20 o que faz diferença **não** é ter dez mil talentos no banco. É clicar na perícia e sair a rolagem com o modificador certo, e o chat dizer "Sucesso crítico". O eixo deste épico é, nesta ordem:

```
ficha  →  rolagem com o bônus certo  →  chat com o grau de sucesso
```

Catálogo grande é Onda 3 e é o **último** card do épico (RV-157). Se o épico parar em RV-156, a mesa já joga.

**Ressalva escrita na curadoria da v0.7.0, para a frase acima não ser lida como promessa cumprida:** "a mesa joga" é uma afirmação sobre *mecânica*, e ela continua verdadeira. O que a mecânica pronta **não** entrega é uma sessão: as migrations do repositório não estão aplicadas em ambiente nenhum ([RV-139](13-operacao.md) — sem a `0008`, a mesa de PF2e nem é criada) e a plataforma não está publicada, com todo convite caindo no stdout da API ([RV-132](13-operacao.md)). Os dois são Onda 1, nenhum dos dois é deste épico, e nenhum dos dois é resolvido por um card daqui. Ver a Sprint 3 em [sprints.md](sprints.md).

**Atualização medida na curadoria da v0.8.0.** O épico chegou ao RV-156 e a ressalva acima se dividiu em duas
metades de sortes diferentes. A metade do banco **fechou**: as dez migrations estão aplicadas e conferidas, uma
mesa `pathfinder2e` foi criada de verdade e o grau de sucesso foi gravado no Postgres em uso. A metade do
acesso **não**: sem o RV-132, a plataforma só existe em `localhost` e nenhum convite chega a ninguém, então
"a mesa joga" hoje significa, literalmente, "o mestre joga sozinho na máquina dele". E a mecânica ganhou duas
lacunas nomeadas dentro do próprio épico, nenhuma delas prevista quando o diagrama foi desenhado:
[RV-160](#rv-160--grau-de-sucesso-só-para-checagem-rolagem-de-dano-não-tem-cd) (um dano com CD recebe grau de
sucesso e o grau errado é gravado) e
[RV-161](#rv-161--a-cd-precisa-chegar-às-rolagens-da-ficha-salvaguarda-percepção-e-perícia) (a CD não chega à
salvaguarda, que é a checagem mais rolada da mesa). Com esses dois, o eixo `ficha → rolagem → grau` vale na
sessão inteira e não só no ataque.

### 2. Licenciamento — decidido, não re-decidir

Isto foi pesquisado e fechado. Não reabra. A decisão vive em [docs/licencas/pathfinder2e.md](../licencas/pathfinder2e.md), e desde o RV-150 ela é **verificada por teste** — `packages/shared/src/sistemas/pathfinder2e/licenca.test.ts` reprova conteúdo sem `fonte`, semente acima do teto e conteúdo que chegue antes da atribuição completa. O resumo abaixo continua valendo:

- **[2e.aonprd.com](https://2e.aonprd.com/)** (Archives of Nethys) opera sob a **Community Use Policy da Paizo** somada à **OGL 1.0a**, e **proíbe expressamente uso comercial**. Fazer *scraping* em massa do AoN para dentro deste repositório está **proibido**.
- O **dataset do sistema pf2e do Foundry VTT** existe sob uma permissão específica da parceria Foundry Gaming ↔ Paizo. Essa permissão **não é transferível** para este projeto. Empacotar aquele dataset está **proibido**.
- As **mecânicas** do jogo — proficiência, graus de sucesso, CDs, tipos de modificador, economia de ações, MAP — são **Open Game Content** sob a OGL. São implementáveis **com atribuição**.

O corolário arquitetural, que é a espinha deste épico:

| | Onde vive | Por quê |
|---|---|---|
| **Mecânica** (aritmética, tabelas de regra) | `packages/shared/src/sistemas/pathfinder2e/` — funções puras | É OGC. É pouca coisa. É o que dá valor. |
| **Conteúdo** (talentos, magias, itens, monstros) | atrás da port `CatalogoPathfinder`, com um adapter de **semente curada e pequena** | Não podemos distribuir o corpus. Amanhã, com um import licenciado, troca-se o adapter e **o domínio não muda uma linha**. |

Consequência prática para quem executa: **todo card que faça conteúdo aparecer em tela ou em resposta de API exige a atribuição OGL/CUP junto do conteúdo** — no corpo da resposta, não só no rodapé da página. O RV-150 fecha essa classe de risco antes que qualquer card a exercite.

Ao pesquisar regras no AoN: **leia para entender, não copie**. Texto descritivo não entra no repositório. Fórmula, faixa numérica e nome de mecânica entram.

### 3. Dependência dura: RV-091 e RV-090 — **satisfeita na v0.6.0**

[RV-091 — Strategy de sistema de ficha](09-fichas.md) e [RV-090 — Perícias e proficiência](09-fichas.md) eram **pré-requisito** e estão **concluídos**. O que isso te entrega, concretamente:

- `definicaoDoSistema(sistema)` em [registro.ts](../../packages/shared/src/sistemas/registro.ts) é o único lugar que associa chave de sistema a comportamento; **registrar PF2e é uma linha ali**.
- A ficha do front (`FichaPersonagem.tsx`) renderiza percorrendo `secoes`/`campos`/`pericias` da definição e **não cita o nome de nenhum sistema** — o RV-152 não cria tela nova.
- `bonusPericia`, `expressaoDePericia`, `motivoDeRolagemDePericia` e `definirGrauDePericia` já existem em [calculo.ts](../../packages/shared/src/sistemas/calculo.ts) e delegam ao registro: o RV-153 fornece a **tabela**, não a aritmética.
- Sistema no enum sem definição no registro derruba `npm run check` **e** `npm run test`, nomeando o sistema (medido).

Sem eles, Pathfinder viraria `switch (sistema)` espalhado por schema, use case e componente — exatamente o oposto do Open/Closed de [03-solid.md](../../.claude/rules/03-solid.md) e do ponto de extensão canônico (`Map<tipo, Handler>` no composition root) de [04-design-patterns.md](../../.claude/rules/04-design-patterns.md). Se você abrir um card e precisar escrever um `switch (sistema)`, a Definition of Ready não está satisfeita: **pare e reporte**.

**O que continua aberto e morde o RV-152:** o lado do banco. `SISTEMAS_RPG` e o `check` de `mesas.sistema` não têm amarra — é o [RV-096](09-fichas.md#rv-096--amarrar-o-check-de-mesassistema-ao-sistemas_rpg), card protetor que vem **antes** do RV-152 pela mesma lógica da seção 6.

### 4. Linguagem ubíqua (PT-BR) — [02-ddd.md](../../.claude/rules/02-ddd.md)

O domínio é modelado em português. A tradução de referência é a da Devir.

| Inglês | PT-BR no código |
|---|---|
| ancestry | `ancestralidade` |
| heritage | `heranca` |
| background | `antecedente` |
| class | `classe` |
| level | `nivel` |
| attribute modifier | `modificador` |
| proficiency rank | `grauTreinamento` |
| degree of success | `grauSucesso` |
| Difficulty Class (DC) | `cd` |
| multiple attack penalty (MAP) | `penalidadeAtaquesMultiplos` |
| saving throw | `salvaguarda` (Fortitude · Reflexos · Vontade) |
| Armor Class (AC) | `ca` |
| Perception | `percepcao` |

**Colisão de vocabulário que você precisa conhecer.** O grau de treinamento "master" traduz para **mestre** — e `Mestre` já significa dono da mesa (GM) neste domínio. Decisão: `'mestre'` existe **apenas como valor literal** da união `GrauTreinamento`; nunca como nome de tipo, classe ou variável. Nenhum arquivo deste épico declara um tipo chamado `Mestre`.

### 5. Referência de regras (o que o motor precisa saber)

Resumo de mecânica, em nossas palavras, para você não precisar reabrir o AoN a cada card. Fontes ao final.

**Personagem.** Ancestralidade + herança (subgrupo da ancestralidade) + antecedente + classe + nível (1–20).

**Atributos.** Seis: Força, Destreza, Constituição, Inteligência, Sabedoria, Carisma. **No PF2e remasterizado o personagem tem o modificador direto**, não o valor 3–18 do d20 clássico: começa em +0, cada aumento soma +1, e no nível 1 nenhum modificador fica abaixo de −1 nem acima de +4. Isto é diferente de D&D 5e e é a armadilha nº 1 de quem vem do RV-092.

**Proficiência.** Cinco graus. O bônus **inclui o nível do personagem**, exceto quando destreinado:

| Grau | Bônus |
|---|---|
| destreinado | **+0** (sem o nível) |
| treinado | nível + 2 |
| perito | nível + 4 |
| mestre | nível + 6 |
| lendário | nível + 8 |

Aplica-se a CA, jogadas de ataque, Percepção, salvaguardas, perícias e efetividade de magias.

**Graus de sucesso.** Compare o total com a CD:

| Resultado | Grau |
|---|---|
| ≥ CD + 10 | sucesso crítico |
| ≥ CD | sucesso |
| < CD | falha |
| ≤ CD − 10 | falha crítica |

**20 natural melhora um grau; 1 natural piora um grau** — e o ajuste é aplicado **depois** da comparação com a CD. Não são sucesso/falha automáticos: um 20 natural contra CD altíssima ainda pode ser só falha, e um 1 natural com bônus enorme ainda pode ser sucesso.

**CDs.** CDs simples por grau: destreinado 10 · treinado 15 · perito 20 · **mestre 30** · lendário 40 (repare no salto de 20 para 30). CDs por nível: tabela de nível 0 a 25, indo de 14 a 50.

**Defesas.** CA = 10 + bônus de proficiência + modificador de Destreza **limitado pelo limite de Destreza da armadura** + bônus de item da armadura. Salvaguardas = proficiência + Constituição (Fortitude) / Destreza (Reflexos) / Sabedoria (Vontade). Percepção = proficiência + Sabedoria. CD de classe = 10 + proficiência + modificador do atributo-chave da classe.

**Modificadores e empilhamento.** Bônus e penalidades têm tipo: circunstância, item, status, e sem-tipo. **Do mesmo tipo não somam — vale o maior (ou a pior penalidade)**; tipos diferentes somam; sem-tipo soma com tudo.

**Economia de ações.** Três ações por turno + uma reação. Toda ação com o traço *ataque* usada mais de uma vez no mesmo turno sofre a **penalidade de ataques múltiplos**: −5 no segundo, −10 no terceiro em diante; arma **ágil** troca por −4/−8. A penalidade é calculada **pela arma daquele ataque**, não pela anterior, e zera no fim do turno.

**Perícias.** Dezessete, cada uma com um atributo-chave, e algumas ações só disponíveis a quem é ao menos treinado. Percepção **não** é perícia, e é ela que rola iniciativa.

Fontes: [Proficiência](https://2e.aonprd.com/Rules.aspx?ID=3305) · [Graus de sucesso](https://2e.aonprd.com/Rules.aspx?ID=2286) · [Bônus e penalidades](https://2e.aonprd.com/Rules.aspx?ID=2281) · [Penalidade de ataques múltiplos](https://2e.aonprd.com/Rules.aspx?ID=2188) · [Calcular modificadores](https://2e.aonprd.com/Rules.aspx?ID=89) · [Finalizar modificadores de atributo](https://2e.aonprd.com/Rules.aspx?ID=2036) · [CDs simples](https://2e.aonprd.com/Rules.aspx?ID=2628) · [CDs por nível](https://2e.aonprd.com/Rules.aspx?ID=2629) · [Perícias](https://2e.aonprd.com/Skills.aspx)

### 6. Ordem dos cards

O card que **fecha** uma classe de risco vem antes dos que a exercitam:

```
RV-150 licenciamento ──┬─────────────────────────────────────► RV-157 catálogo   (✅ v0.6.0)
                       │
RV-151 motor de regras ┴─► RV-152 ficha ─┬─► RV-153 perícias ─► RV-154 grau no chat ─┐
                       ↑                 │                                            ├─► RV-156 ataques + MAP
       RV-096 (E09) ───┘                 └─► RV-155 defesas ───────────────────────── ┘
       protege o enum                                                                  └─► RV-158 iniciativa
```

[RV-096](09-fichas.md#rv-096--amarrar-o-check-de-mesassistema-ao-sistemas_rpg) mora no E09 mas serve a este épico: é ele que impede o RV-152 de acrescentar `'pathfinder2e'` ao enum e esquecer a migration do `check`. Mesma lógica do RV-150 — fechar a classe de risco antes de exercitá-la. **Funcionou como projetado na v0.7.0:** o vermelho apareceu no momento em que o enum ganhou o valor, e a migration já estava em disco.

**RV-159 não está no diagrama de propósito:** é reparo de um defeito entregue pelo RV-153, não dependência de ninguém. Ele estava na Sprint 3 por vizinhança de arquivo com o RV-155 — vizinhança que se dissolveu quando o RV-155 criou seção própria —, **não fechou**, e entra na Sprint 4. O épico fecha sem ele, mas a ficha mente até que ele feche.

**RV-160 e RV-161 também ficam fora do diagrama, e pelo mesmo critério:** nasceram da entrega da Sprint 3, não do desenho do épico. A ordem entre eles, essa sim, é dependência de verdade e segue a regra de composição nº 1 — **RV-160 antes de RV-161**: enquanto qualquer expressão com CD receber grau, abrir mais portas de CD na ficha multiplica o número de lugares por onde o grau errado entra.

**Convenção deste épico:** RV-150 e RV-151 não têm superfície HTTP — não existe autorização a testar neles. Nesses dois cards o cenário de autorização é substituído por um cenário `Guarda:`, que é a verificação automatizada que ocupa o mesmo lugar. Todos os demais cards têm cenário de autorização de verdade, com `403`/`401` provado por teste de contrato ([F4 da taxonomia](../agentes/taxonomia-de-falhas.md)).

---

### RV-150 — Fixar a fronteira de licenciamento com atribuição e teto de conteúdo

**Épico:** E15 · **Depende de:** — · **Tamanho:** P · **Onda:** 2 · **Faça este primeiro do épico** · **Status:** ✅ Concluído

> **Decisões tomadas na entrega (v0.6.0).** [licenca.ts](../../packages/shared/src/sistemas/pathfinder2e/licenca.ts)
> é um auditor **puro**: recebe `ArquivoDeSemente[]` já lidos e devolve `ViolacaoDeLicenca[]`. Quem
> toca o disco é o teste, porque o mesmo bundle de `@rolavinte/shared` vai para o navegador e um
> `import 'node:fs'` exportado pelo índice quebraria o web.
> **Nasceu uma quarta regra que o card não pedia — `atribuicao-incompleta`.** Sem ela, o documento de
> licença conteria a promessa em prosa "antes de publicar conteúdo, inclua a OGL e a Seção 15", que é
> exatamente o F1 que este card veio matar. Agora o marcador `OGL-PENDENTE` é **lido por código**:
> semente vazia passa; no primeiro item, vermelho dizendo o que completar. **O texto verbatim da OGL
> 1.0a não foi transcrito de propósito** — escrevê-lo de memória arriscaria texto legal impreciso, o
> que é pior que a ausência; ele precisa vir da fonte oficial, e a guarda impede que conteúdo entre
> antes disso.
> **Formato da semente decidido aqui:** um `.json` por tipo, nome do arquivo = tipo, array no topo,
> itens com `chave`/`nome`/`fonte`. Está escrito no README do diretório e o auditor reprova o que
> fugir disso. O diretório nasce **vazio**, que é o estado válido de hoje.
> **A guarda do front é uma varredura:** `AvisoLicenca.test.tsx` percorre `apps/web/src` e reprova
> qualquer arquivo que escreva "Paizo", "Open Game License" ou "Community Use" fora do componente —
> então a tela que exibir conteúdo de PF2e monta `<AvisoLicenca />` ou fica vermelha.
> **Prova de que a guarda reprova, medida com violação real em disco:** 31 itens num tipo, item sem
> `fonte`, arquivo de 70053 bytes, conteúdo com o documento pendente e o número do teto repetido no
> documento — cinco experimentos, cinco vermelhos com o arquivo nomeado, todos desfeitos.
> **`<AvisoLicenca>` ainda não é montado por tela nenhuma, e isso está correto hoje**: `pathfinder2e`
> não é valor de `SISTEMAS_RPG` e nenhuma tela exibe conteúdo do sistema. O primeiro consumidor é o
> RV-152 (rodapé da ficha).
> **Limite honesto:** a auditoria cobre **apenas** o diretório da semente. Conteúdo de PF2e colado em
> `apps/api` ou em outro pacote passaria sem ser visto.

**História**
> Como **mantenedor**, quero **a fronteira legal do conteúdo de Pathfinder escrita e verificada por teste**, para **que nenhum card seguinte arraste para o repositório um dataset que não podemos distribuir**.

**Contexto técnico**
- A decisão está tomada e resumida na [estratégia do épico](#2-licenciamento--decidido-não-re-decidir): proibido *scraping* do AoN, proibido empacotar o dataset pf2e do Foundry, mecânicas liberadas sob a OGL com atribuição, conteúdo apenas como semente curada e pequena.
- Este card não repete a decisão em prosa — ele produz **a linha de código que a lê**. Classe de falha coberta: **F1 — defesa que não defende** ([taxonomia](../agentes/taxonomia-de-falhas.md)). Regra que existe só em documento é inerte; para toda regra, pergunte *qual linha de código a verifica*.
- O teto é deliberadamente baixo (**30 itens por tipo, 64 KB por arquivo**): ele não existe para limitar o produto, existe para ficar vermelho no dia em que alguém colar um dump. Aumentar o teto tem que ser uma decisão consciente com o motivo escrito no diff.
- `fonte` é campo obrigatório de todo item de semente porque a atribuição precisa viajar **junto do dado**, não estar só no rodapé de uma tela — quem consome a API também precisa dela (ver RV-157).

**Escopo**
- `docs/licencas/pathfinder2e.md` — a decisão, o texto da OGL 1.0a e o aviso de Community Use da Paizo
- `packages/shared/src/sistemas/pathfinder2e/atribuicao.ts` — `ATRIBUICAO_PF2E` (texto curto em PT-BR) e `LIMITE_SEMENTE = { itensPorTipo: 30, bytesPorArquivo: 64 * 1024 }`
- `packages/shared/src/sistemas/pathfinder2e/semente/README.md` — o diretório nasce com a regra escrita nele
- `packages/shared/src/sistemas/pathfinder2e/licenca.test.ts` — varre o diretório da semente **no disco** e falha por: contagem acima do teto, arquivo acima do teto, ou item sem `fonte`
- `apps/web/src/components/ui/AvisoLicenca.tsx` — rodapé reutilizável com `ATRIBUICAO_PF2E`

**Critérios de aceite**
```gherkin
Cenário: Atribuição acompanha o conteúdo
  Dado uma ficha de uma mesa com sistema "pathfinder2e"
  Quando eu abrir a ficha
  Então o rodapé exibe o texto de ATRIBUICAO_PF2E em PT-BR
  E o mesmo componente é usado por toda tela que exibir conteúdo de catálogo

Cenário: Teto de semente é verificado, não prometido
  Quando alguém adicionar o 31º item de um tipo ao diretório da semente
  Então "npm run test" fica vermelho apontando o arquivo e a contagem

Guarda: Item sem fonte não passa
  Quando um item da semente não declarar "fonte"
  Então o teste de licença falha nomeando o arquivo e a chave do item

Cenário: Borda — semente vazia é estado válido
  Dado o diretório da semente sem nenhum item
  Então o teste de licença passa
  E nenhuma tela quebra por ausência de conteúdo
```

**Testes obrigatórios**
- `licenca.test.ts` roda sobre **os arquivos reais** do diretório, não sobre um fake — um dublê generoso jamais exporia o estouro do teto (**F3** da taxonomia).
- Teste de que o teste de licença **falha** quando apontado para um diretório-fixture que viola cada uma das três regras (teto de itens, teto de bytes, `fonte` ausente). Guarda que não sabe reprovar não guarda nada.
- Front: `AvisoLicenca` renderiza o texto vindo de `ATRIBUICAO_PF2E`, sem string duplicada no JSX.

**DoD específico**
- [ ] Zero dependência nova de rede, script de download ou *crawler* no repositório.
- [ ] `docs/licencas/pathfinder2e.md` linkado a partir deste épico e do `README.md` do backlog.
- [ ] Aumentar o teto exige alterar `LIMITE_SEMENTE` — não existe segundo lugar onde o número esteja escrito.

---

### RV-151 — Motor de regras PF2e no `@rolavinte/shared`

**Épico:** E15 · **Depende de:** RV-150 · **Tamanho:** G · **Onda:** 2 · **Status:** ✅ Concluído (v0.7.0)

> **Decisões tomadas na entrega.**
> **A exceção do destreinado é dado, não `if`.** `PROFICIENCIA_POR_GRAU` é um
> `Record<GrauTreinamento, { somaNivel: boolean; acrescimo: number }>`: escrita como
> `if (grau === 'destreinado')`, a regra ficaria escondida no meio de uma conta; como coluna, ela é
> visível para quem lê a tabela, e grau novo **não compila** sem declarar as duas coisas.
> **`bonusProficiencia` não limita o nível a 1..20** de propósito — criatura e CD de encontro passam
> disso, e cortar aqui devolveria número errado sem avisar. Quem precisa da faixa valida antes (é o
> `schemaFicha` do RV-152).
> **`d20NaturalDe` também recusa d20 subtraído** (`30-1d20` → `null`), o que o card não pedia: um d20
> subtraído não é uma checagem, e ajustar o crítico ali seria inventar regra.
> **`cdPorNivel` recusa nível fracionário** em vez de truncar — truncar seria escolher uma CD por conta
> própria. E a **CD por nível é tabela literal, não fórmula**: a curva é +1 por nível com +1 extra a
> cada três até o 20 e +2 do 21 em diante, e uma fórmula que casa até o 20 e erra depois é pior que
> transcrever, porque erra em silêncio.
> **Bônus e penalidade do mesmo tipo não se cancelam** — entram os dois (maior bônus + pior penalidade
> daquele tipo). Tem teste próprio, porque é onde um `reduce` "corrigido pela metade" ainda erra.
> **Os testes de `d20NaturalDe` rodam sobre o motor de dados real** com RNG determinístico, e não sobre
> `ResultadoRolagem` montado à mão: um fixture escrito pelo implementador casaria com a leitura dele do
> formato, não com o que o motor produz (F3). Há uma asserção que valida o próprio dublê antes.
> **`penalidadeAtaquesMultiplos` não foi criada aqui** — continua escopo do RV-156, neste mesmo arquivo.
> **Este card entrega motor sem consumidor de produção, e isso é por desenho.** Só `bonusProficiencia`
> chega ao produto (via `definicao.ts`); `grauSucesso`, `d20NaturalDe`, `somarModificadores`, `cdPorNivel`,
> `CDS_SIMPLES` e `MARGEM_CRITICA` têm **zero** call sites fora dos testes — varredura da verificação
> independente. O consumidor é o **RV-154**, e o risco nomeado está escrito lá: quando ele for
> implementado, é barato reimplementar a comparação com a CD no componente e passar a existir duas
> aritméticas. Não faça isso.

**História**
> Como **mantenedor**, quero **a aritmética do PF2e como funções puras num único arquivo**, para **que ficha, chat e combate cheguem ao mesmo número e uma errata seja um patch de uma linha**.

**Contexto técnico**
- O motor de dados atual ([motor-dados.ts](../../packages/shared/src/dados/motor-dados.ts)) **rola dados** e é agnóstico de sistema. Ele não conhece CD nem grau de sucesso e **não deve passar a conhecer**: as regras de PF2e vivem em arquivo próprio e apenas *consomem* `ResultadoRolagem`.
- Nada aqui é conteúdo: são tabelas de mecânica (OGC). Ainda assim o arquivo abre com o cabeçalho de atribuição do RV-150.
- **Armadilha 1 — destreinado não soma o nível.** `bonusProficiencia(12, 'destreinado')` é `0`, não `12`. Errar isto infla silenciosamente toda perícia não treinada de todo personagem.
- **Armadilha 2 — ordem do ajuste natural.** O 20/1 natural desloca **um grau**, aplicado *depois* da comparação com a CD, e nunca é sucesso/falha automático. Um teste que só verifica "20 natural ⇒ sucesso" passa e está errado.
- **Armadilha 3 — qual é o d20?** `ResultadoRolagem.termos[].dados[].valor` existe, mas em `1d20+1d6` a pergunta "qual foi o d20 natural?" é ambígua. **Decisão: nunca adivinhe.** `d20NaturalDe(resultado)` devolve o valor **só** quando a expressão tem exatamente **um** termo de dados (constantes não contam — `1d20+11`, que é o formato de toda checagem, funciona), esse termo é de faces 20, está somado e não subtraído, e sobra exatamente um dado não descartado; em qualquer outro caso devolve `null`, e sem d20 identificável **não há ajuste**. Em `2d20kh1` o dado mantido é o natural (o descartado não conta). *(Redação precisada na entrega do RV-151, por F11: a original dizia "exatamente um termo de faces 20 com exatamente um dado não descartado", o que faria `1d20+1d6` devolver o d20 — contradizendo o cenário `Guarda:` deste mesmo card. Vale o cenário.)*
- **Armadilha 4 — empilhamento por tipo.** Dois bônus de item não somam; vale o maior. Um `reduce` ingênuo dá o número errado e ninguém percebe até a mesa reclamar.
- `packages/shared` não tem `Result` (é o padrão do domínio da api, ver [01-arquitetura.md](../../.claude/rules/01-arquitetura.md)). Siga a convenção que já existe em `validarExpressao`: falha esperada volta como valor, não como exceção. `cdPorNivel` fora de 0..25 devolve `null`.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/regras.ts`:
  - `GRAUS_TREINAMENTO = ['destreinado','treinado','perito','mestre','lendario'] as const` + tipo `GrauTreinamento`
  - `bonusProficiencia(nivel: number, grau: GrauTreinamento): number`
  - `GRAUS_SUCESSO = ['sucesso-critico','sucesso','falha','falha-critica'] as const` + tipo `GrauSucesso`
  - `grauSucesso({ total, cd, d20Natural }): GrauSucesso`
  - `CDS_SIMPLES: Record<GrauTreinamento, number>` — 10 / 15 / 20 / 30 / 40
  - `cdPorNivel(nivel: number): number | null` — tabela 0..25
  - `Modificador = { valor: number; tipo: 'circunstancia' | 'item' | 'status' | 'sem-tipo'; origem: string }` e `somarModificadores(mods: Modificador[]): number`
  - `d20NaturalDe(resultado: ResultadoRolagem): number | null`
- `packages/shared/src/sistemas/pathfinder2e/regras.test.ts`
- Export em [index.ts](../../packages/shared/src/index.ts)

**Critérios de aceite**
```gherkin
Cenário: Bônus de proficiência inclui o nível
  Dado um personagem de nível 5, perito
  Quando eu calcular o bônus de proficiência
  Então o resultado é 9

Cenário: Destreinado não soma o nível
  Dado um personagem de nível 12, destreinado
  Então o bônus de proficiência é 0

Cenário: As quatro faixas de grau
  Dado a CD 20
  Então o total 30 é "sucesso-critico"
  E o total 20 é "sucesso"
  E o total 19 é "falha"
  E o total 10 é "falha-critica"

Cenário: 20 natural melhora um grau, não garante sucesso
  Dado a CD 40 e o total 25 com d20 natural 20
  Então o grau é "falha" — a falha crítica subiu para falha, e parou aí

Cenário: 1 natural piora um grau, não garante falha
  Dado a CD 10 e o total 31 com d20 natural 1
  Então o grau é "sucesso", não "sucesso-critico"

Guarda: d20 ambíguo não recebe ajuste
  Dado a rolagem "1d20+1d6"
  Quando eu pedir o d20 natural do resultado
  Então recebo null
  E o grau é calculado sem nenhum ajuste

Cenário: Borda — bônus do mesmo tipo não somam
  Dado bônus de item +1, bônus de item +2 e bônus de status +1
  Então somarModificadores devolve +3

Cenário: Borda — CD por nível fora da tabela
  Quando eu pedir a CD do nível -1 ou do nível 26
  Então recebo null, sem exceção
```

**Testes obrigatórios**
- Tabela completa de `bonusProficiencia`: 5 graus × níveis 1, 5, 10 e 20 — 20 asserções, incluindo o `0` de destreinado em todos os níveis.
- Tabela de `grauSucesso`: as 4 faixas × {sem d20 natural, natural 20, natural 1} = 12 casos, com os dois casos-limite acima escritos explicitamente.
- `CDS_SIMPLES` conferido nos 5 graus e `cdPorNivel` conferido nas pontas (nível 0 = 14, nível 25 = 50) e fora da faixa.
- `somarModificadores`: mesmo tipo (vale o maior), tipos diferentes (somam), penalidades do mesmo tipo (vale a pior), sem-tipo somando entre si, lista vazia = 0.
- `d20NaturalDe`: `1d20` puro, `2d20kh1` (devolve o mantido), `1d20+1d6` → `null`, `3d6` → `null`, `2d20` sem `kh` → `null`.

**DoD específico**
- [ ] `regras.ts` é puro: sem `import` de `apps/`, sem I/O, sem `Date`, sem `Math.random`.
- [ ] Nenhum número de regra de PF2e escrito fora de `regras.ts` — nem `+2`, nem `10`, nem `-5`.
- [ ] `motor-dados.ts` não ganhou uma linha sobre CD ou grau de sucesso.

---

### RV-152 — Ficha de Pathfinder 2e sobre a strategy de sistema

**Épico:** E15 · **Depende de:** RV-091 (✅), RV-151, RV-096 · **Tamanho:** G · **Onda:** 2 · **Status:** ✅ Concluído (v0.7.0)

> **Decisões tomadas na entrega.** As três correções de enunciado (F11) já estão escritas no **Escopo** e
> no primeiro cenário; o que segue são as decisões que o card não determinava.
> **Dois campos novos e obrigatórios no contrato, em vez de um `if` na tela.** `DefinicaoSistema` ganhou
> `usaAtributosComuns: boolean` (PF2e = `false`, porque guarda o modificador direto e ignora as colunas
> 1..30) e `atribuicao: AtribuicaoDeSistema | null` (PF2e = `ATRIBUICAO_PF2E`, os demais `null`). Sem
> eles, os cenários "o botão genérico não aparece" e "atribuição montada" só se resolveriam com
> `switch (sistema)` no componente, proibido pelo DoD. São **obrigatórios** — sem valor padrão — pelo
> mesmo raciocínio do `Record` total do RV-091: sistema novo decide as duas coisas conscientemente.
> **`usaAtributosComuns` foi removido pelo [RV-098](09-fichas.md#rv-098--atributo-não-pode-ter-duas-verdades-na-mesma-ficha)**:
> era a pergunta errada. "As colunas comuns valem?" escondia o problema real — em que **escala** o número
> está —, e a resposta `false` foi o que criou a segunda casa do atributo (coluna exigida e ignorada,
> modificador em `dados`). No lugar dele entrou `atributos: EscalaDeAtributo`, e o bloco dos seis atributos
> voltou a aparecer na ficha de PF2e, agora rolando o modificador gravado. `atribuicao` continua como
> entregue aqui.
> **`treinamentos` nasceu como objeto estrito vazio**, reservando o lugar e o caminho de escrita para que
> RV-153 e RV-155 fossem tabela e nada mais. Aberto pelo RV-153 com as 16 chaves fixas.
> **Identidade é texto livre, com teste exigindo que continue sendo** — enumerar ancestralidades seria
> distribuir conteúdo da Paizo; a lista curada é o RV-157.
> **`bonusDeChecagem` mora em `definicao.ts`, e não em `regras.ts`:** `regras.ts` é do RV-151 e não conhece
> o formato da ficha; a ponte entre "onde o número está gravado" e "qual é a conta" é deste card.
> **A metade de interface foi entregue pelo agente do RV-153**, no mesmo lote e nos mesmos arquivos: o
> gate `usaAtributosComuns` no bloco dos seis atributos comuns
> ([FichaPersonagem.tsx](../../apps/web/src/features/personagens/FichaPersonagem.tsx):215) e o
> `<AvisoLicenca />` no rodapé (:314). Enquanto ela não existiu, a ficha de PF2e ofereceu seis botões
> "🎲 +0" rolando `1d20+0` a partir de colunas que o sistema ignora (F6) — o card só está fechado porque
> isso foi corrigido, verificado em código na curadoria.
> **A `0008` (RV-096) é a migration deste card.** Nenhuma foi criada aqui: o valor `'pathfinder2e'` já
> estava reservado no `check`, e a reserva `SISTEMAS_ANTECIPADOS_NO_CHECK` venceu e foi apagada, como o
> handoff previa. **Consequência que saiu do papel:** o dashboard agora oferece "Pathfinder 2e" e, contra
> o Supabase real, criar essa mesa falha no `INSERT` enquanto a `0008` não for aplicada (RV-139).

**História**
> Como **jogador de PF2e**, quero **criar minha ficha com ancestralidade, herança, antecedente, classe, nível e os seis modificadores de atributo**, para **entrar na campanha sem manter uma planilha paralela**.

**Contexto técnico**
- RV-091 cria `packages/shared/src/sistemas/` com `DefinicaoSistema` (`schemaFicha`, `secoes`, `rolagensPadrao`) e o registro `Map<SistemaRpg, DefinicaoSistema>`. **Este card é uma entrada nova nesse registro e nada além disso.** Se você precisar de um `switch (sistema)` em qualquer lugar, RV-091 não está pronto: pare e reporte.
- **Armadilha dura — o enum tem duas metades.** `SISTEMAS_RPG` em [mesas.ts](../../packages/shared/src/schemas/mesas.ts) é um `z.enum`, e a coluna correspondente tem `check (sistema in ('dnd5e','tormenta20','ordem-paranormal','generico'))` em [0001_esquema_inicial.sql](../../apps/api/supabase/migrations/0001_esquema_inicial.sql). Adicionar `'pathfinder2e'` só no TypeScript **compila, passa no lint, passa em todo teste com fake — e estoura no primeiro INSERT real**. Classe **F10 — configuração que nunca foi exercitada**. Migration nova é obrigatória. **Desde a curadoria da v0.6.0 isto deixou de ser só um aviso:** o [RV-096](09-fichas.md#rv-096--amarrar-o-check-de-mesassistema-ao-sistemas_rpg) transforma o esquecimento em suíte vermelha e é pré-requisito deste card. Se ele já estiver feito, você vai *ver* o vermelho ao acrescentar o valor ao enum — é o comportamento esperado, e a migration é a correção.
- **A metade do TypeScript já está fechada:** acrescentar `'pathfinder2e'` a `SISTEMAS_RPG` sem entrada no registro derruba `npm run check` (`TS2741`) e `registro.test.ts`. Registrar a definição é o que apaga esse vermelho — não edite o teste.
- **Atribuição (RV-150, ✅):** monte `<AvisoLicenca />` de [components/ui](../../apps/web/src/components/ui/AvisoLicenca.tsx) no rodapé da ficha. **Nunca reescreva o texto no JSX** — há uma varredura em `AvisoLicenca.test.tsx` que reprova qualquer arquivo de `apps/web/src` contendo "Paizo", "Open Game License" ou "Community Use" fora do componente. Esta ficha é o **primeiro consumidor** dele.
- **Armadilha de modelo — modificador direto, não valor de atributo.** `atributosSchema` em [personagens.ts](../../packages/shared/src/schemas/personagens.ts) guarda 1..30 e é usado por todos os sistemas e pelo `PersonagemDTO`. **Não altere.** A ficha PF2e guarda os seis modificadores em `dados.modificadores` (faixa −5..+8) e **ignora** `atributos`; `modificadorAtributo()` não participa deste sistema. Escreva esse porquê no schema.
- **Consequência direta disso (F6 — promessa da UI):** o "teste de atributo em 1 clique" genérico, que hoje deriva o bônus de `atributos`, rolaria `+0` eternamente numa ficha PF2e. Ele **não pode ser oferecido** nesse sistema; a rolagem correta chega no RV-153.
- Faixa de nível: 1..20, coerente com `criarPersonagemSchema`.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` — `schemaFicha` Zod (`ancestralidade`, `heranca`, `antecedente`, os seis modificadores como chaves de topo `modificadorForca`…`modificadorCarisma`, `treinamentos`), `secoes` (Identidade · Atributos), `rolagensPadrao`. **Três correções feitas na execução (F11), porque o enunciado original era impossível ou contraditório:** (1) `classe` e `nivel` **não** entram em `dados` — são colunas comuns de `personagens`, já exibidas e validadas (`criarPersonagemSchema`, 1..20), e duplicá-las daria dois campos "Nível" na mesma tela e duas respostas na hora de somar proficiência; (2) os modificadores são chaves **planas**, e não um objeto `modificadores` aninhado, porque `CampoFicha.chave` endereça uma chave de topo de `dados` e o teste do RV-091 exige que todo campo de seção exista na ficha inicial — aninhado, a seção não renderizaria; (3) as seções Perícias e Defesas não são declaradas aqui: Perícias chega no RV-153 pela lista `pericias` (que já tem seção própria na interface, e uma `SecaoFicha` homônima duplicaria o título) e Defesas no RV-155. `rolagensPadrao` nasce vazio: iniciativa é por Percepção (RV-158)
- `packages/shared/src/sistemas/registro.ts` — registrar `pathfinder2e`
- `packages/shared/src/schemas/mesas.ts` — `SISTEMAS_RPG` ganha `'pathfinder2e'`
- `apps/api/supabase/migrations/000X_sistema_pathfinder2e.sql` — recria o `check` de `mesas.sistema` com o valor novo
- Front: **nenhuma tela nova.** [FichaPersonagem.tsx](../../apps/web/src/features/personagens/FichaPersonagem.tsx) renderiza pelas seções da definição — a única alteração prevista é montar `<AvisoLicenca />` no rodapé

**Critérios de aceite**
```gherkin
Cenário: Ficha nasce com o esqueleto do sistema
  Dado uma mesa com sistema "pathfinder2e"
  Quando eu criar o personagem "Seelah"
  Então a ficha exibe as seções Identidade e Atributos
  # Perícias chega no RV-153 e Defesas no RV-155, na mesma definição (F11, ver Escopo)
  E os seis modificadores começam em +0
  E o nível começa em 1

Cenário: Autorização
  Dado que sou jogador da mesa
  Quando eu tentar editar a ficha de outro jogador
  Então recebo 403
  E o mestre consegue editar qualquer ficha da mesa

Cenário: Sistema novo chega ao banco
  Dado o banco com a migration deste card aplicada
  Quando o mestre criar uma mesa com sistema "pathfinder2e"
  Então a mesa é criada e aparece no dashboard

Cenário: Borda — modificador fora da faixa
  Quando eu salvar destreza com +9
  Então recebo 400 com mensagem em PT-BR
  E nada é gravado na ficha

# SUPERADO PELO RV-098 (F11). Este cenário existia porque o modificador certo
# morava em `dados` e a coluna comum era ignorada, então o botão rolaria `1d20+0`.
# Desde o RV-098 o atributo tem uma casa só — a coluna comum, na escala declarada
# pelo sistema —, o botão rola o modificador gravado e `usaAtributosComuns` não
# existe mais. O que continua valendo é a proibição de derivar bônus de PF2e pela
# fórmula `(valor − 10) / 2`, e há teste disso.
Cenário: Borda — o botão genérico de atributo não aparece
  Dado uma ficha "pathfinder2e"
  Então o botão genérico "testar atributo" não é oferecido
  E nenhuma rolagem é derivada de "atributos" neste sistema

Cenário: Ficha genérica intacta
  Dado uma mesa "generico" criada antes deste card
  Quando eu abrir a ficha
  Então ela está idêntica e nenhum dado se perdeu
```

**Testes obrigatórios**
- O teste de contrato do registro entregue pelo RV-091 (toda entrada de `SISTEMAS_RPG` tem definição) passa a cobrir `pathfinder2e` **sem alteração** — se precisou editar aquele teste, o registro não é genérico.
- Schema: modificador fora de −5..+8, nível fora de 1..20, grau de treinamento inexistente — os três recusados com mensagem em PT-BR.
- Contrato `fastify.inject()`: criar mesa `pathfinder2e`, criar personagem nela, editar ficha de terceiro → 403.
- Regressão: personagem de mesa `generico` criado antes continua legível e editável.

**DoD específico**
- [ ] Migration nova criada e somada à lista de pendências operacionais do [README](README.md) / RV-138 — ela **não** foi aplicada em ambiente nenhum e o card diz isso.
- [ ] Zero `switch (sistema)` novo em api, web ou shared.
- [ ] `atributosSchema` (1..30) inalterado no shared e no banco.
- [ ] O motivo de a ficha PF2e ignorar `atributos` está escrito no `definicao.ts`, não só neste card.
- [ ] `<AvisoLicenca />` montado no rodapé da ficha, sem uma linha do texto de atribuição copiada para o JSX.

---

### RV-153 — Perícias de PF2e com rolagem em um clique

**Épico:** E15 · **Depende de:** RV-090, RV-152 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.7.0)

> **Decisões tomadas na entrega.** A tabela mora em
> [pericias.ts](../../packages/shared/src/sistemas/pathfinder2e/pericias.ts) e a definição só a
> pluga no registro. **Saber virou um conceito do contrato, não um caso especial do PF2e:**
> `DefinicaoSistema` ganhou `familiasPericia: readonly FamiliaPericia[]` e
> `acoesDePericia(ficha, chave)`, os dois obrigatórios, porque as alternativas eram um
> `if (sistema === 'pathfinder2e')` na tela (proibido pelo DoD) ou uma tela que não desenha o que a
> ficha guarda. As instâncias moram em `dados.saberes` como lista de `{ especializacao, grau }`, e a
> chave (`saber:Guerra`) carrega a especialização **de propósito**: é o que deixa
> `motivoDeRolagemDePericia` montar "Saber (Guerra) — Seelah" sem a ficha em mãos.
> **`acoesTreinadas` não é catálogo:** é o subconjunto de ações que a interface precisa marcar como
> indisponíveis, e a lista completa continua sendo o RV-157, atrás da port.
> **O cenário de autorização foi corrigido (F11)** — ver a nota no próprio cenário.
> **Duas pendências de interface do RV-152 foram fechadas junto**, por caírem nos mesmos arquivos e
> por serem o que faria esta entrega mentir: a ficha de PF2e deixou de oferecer o teste genérico de
> atributo (`usaAtributosComuns`) e passou a montar `<AvisoLicenca />` (`atribuicao`).
> **Teto e limites decididos aqui:** 12 Saberes por ficha e 40 caracteres por especialização (constantes
> exportadas, não números espalhados) — uma lista dentro de `jsonb` que a tela renderiza inteira precisa
> de fundo. As **ações ficam num `<details>` por perícia**, com o estado em texto ("indisponível: Exige ao
> menos treinado em Medicina."), e não como botão: botão que não faz nada é a promessa falsa que o card
> veio evitar.
> **Um defeito escapou desta entrega e virou o [RV-159](#rv-159--adicionar-saber-recusado-precisa-dizer-o-motivo-em-vez-de-esvaziar-o-campo):**
> `acrescentarSaber` devolve `dados` inalterado quando a especialização é repetida, longa demais ou está
> acima do teto, e o comentário da função afirma que "a interface impede as três" — a interface só impede
> o campo vazio. Medido em execução pela verificação independente: o botão fica habilitado, o clique
> esvazia o campo e nada acontece.
> **Nenhuma migration:** as perícias moram no `dados jsonb` da `0007` e toda chave nova tem padrão, então
> ficha antiga (`{}`) continua válida — provado pelo teste do registro para todos os sistemas.

**História**
> Como **jogador de PF2e**, quero **clicar na perícia e ver a rolagem já com nível, grau de treinamento e modificador somados**, para **não recalcular +11 toda vez que o grupo sobe de nível**.

**Contexto técnico**
- RV-090 entrega `bonusPericia(personagem, pericia)` em `packages/shared/src/sistemas/calculo.ts`. Este card fornece **a tabela de perícias do PF2e** e delega a aritmética a `bonusProficiencia` do RV-151. **Não reimplemente a conta.**
- As 17 perícias e seus atributos-chave, na nomenclatura PT-BR do projeto:

  | Perícia | Atributo | | Perícia | Atributo |
  |---|---|---|---|---|
  | Acrobacia | Destreza | | Medicina | Sabedoria |
  | Arcanismo | Inteligência | | Natureza | Sabedoria |
  | Atletismo | Força | | Ocultismo | Inteligência |
  | Atuação | Carisma | | Ofício | Inteligência |
  | Diplomacia | Carisma | | Religião | Sabedoria |
  | Enganação | Carisma | | Saber (especializado) | Inteligência |
  | Furtividade | Destreza | | Sobrevivência | Sabedoria |
  | Intimidação | Carisma | | Sociedade | Inteligência |
  | Ladinagem | Destreza | | | |

- **Percepção não é perícia.** Ela mora nas Defesas (RV-155) e é o que rola iniciativa (RV-158). Não a coloque nesta tabela.
- **Armadilha — Saber é uma família, não uma chave.** Um personagem pode ter "Saber (Guerra)" treinado e "Saber (Náutico)" destreinado ao mesmo tempo. Modele como lista de `{ especializacao, grau }`, não como entrada fixa do `Record` de treinamentos.
- **Armadilha — ações só de treinado.** Algumas ações de perícia exigem treinamento. A regra pertence à tabela (`acoesTreinadas`), **não** a um `if` no componente: esconder o botão sem a regra no dado é F4/F6.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/pericias.ts` — `PERICIAS_PF2E: { chave, rotulo, atributo, acoesTreinadas: string[] }[]` (16 de chave fixa) + `FAMILIA_SABER` e o schema de `dados.saberes`. *(Na entrega: `rotulo`, e não `nome`, porque é o campo do contrato `PericiaFicha` que a interface já renderiza; e os graus de treinamento migraram para cá, junto da tabela que os usa — a exportação de `@rolavinte/shared` não mudou.)*
- `packages/shared/src/sistemas/tipos.ts` — `FamiliaPericia`, `AcaoDePericia` e os dois campos novos de `DefinicaoSistema`
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` — pluga a tabela e a família. **Não** há `SecaoFicha` de perícias: a interface já tem seção própria para a lista `pericias` (RV-152, F11)
- [FichaPersonagem.tsx](../../apps/web/src/features/personagens/FichaPersonagem.tsx) e `SecaoPericias.tsx` — seção renderizada a partir da definição, com marcador de grau, botão de dado, criação/remoção de instância de família e as ações indisponíveis com o motivo

**Critérios de aceite**
```gherkin
Cenário: Bônus exibido
  Dado um personagem de nível 5, treinado em Furtividade, com destreza +4
  Então a ficha exibe Furtividade +11

Cenário: Destreinado não soma o nível
  Dado o mesmo personagem, destreinado em Arcanismo, com inteligência +1
  Então a ficha exibe Arcanismo +1

Cenário: Rolar em um clique
  Quando eu clicar no dado de Furtividade
  Então é publicada a rolagem "1d20+11" com o motivo "Furtividade — Seelah"
  E todos na mesa a veem sem recarregar

# Redação corrigida na entrega (F11): o enunciado original dizia "jogador rolando pela
# ficha de outro jogador → 403", e isso não é exprimível na rota única de rolagem — o
# corpo dela é uma expressão de dados, e quem participa da mesa pode rolar dados. Criar
# uma rota "rolar perícia do personagem X" só para produzir o 403 duplicaria a
# autorização que já vive no agregado Mesa. A guarda que existe de verdade é a de
# participação, e a escrita na ficha de terceiro já devolve 403 desde o RV-152.
Cenário: Autorização
  Dado que não participo da mesa
  Quando eu chamar a rota de rolagem com a expressão da perícia
  Então recebo 403
  E nada aparece no chat nem é publicado na sala "mesa:{id}"

Cenário: Borda — Saber com especialização
  Dado "Saber (Guerra)" treinado e "Saber (Náutico)" destreinado
  Então os dois aparecem em linhas separadas, com bônus diferentes
  E salvar um Saber com especialização vazia devolve 400 em PT-BR

Cenário: Borda — ação de treinado indisponível
  Dado que sou destreinado em Medicina
  Então a ação treinada de Medicina aparece indisponível com texto explicando o motivo
  E não apenas oculta
```

**Testes obrigatórios**
- Unitário puro em tabela: as perícias de chave fixa × {destreinado, treinado, lendário} nos níveis 1 e 20, conferidas contra `bonusProficiencia` — nenhuma constante recalculada no teste. *(96 combinações na entrega: 16 × 3 × 2, mais as âncoras escritas à mão. O Saber tem teste próprio, com duas especializações em graus diferentes.)*
- Front: clicar no dado chama o hook de rolagem com **a expressão exata**; o componente não faz aritmética.
- Contrato: não-participante chamando a rota de rolagem → 403, sem nada publicado (ver a nota do cenário de autorização).

**DoD específico**
- [ ] Nenhum bônus calculado dentro de JSX.
- [ ] Percepção **não** aparece na lista de perícias.

---

### RV-154 — Grau de sucesso no chat

**Épico:** E15 · **Depende de:** RV-151, RV-153 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.8.0)

> **Decisões tomadas na entrega.**
> **Como a CD chega — duas portas, uma gramática, nenhuma no caso de uso.** O card deixou isso aberto e a
> resposta é: *quem digita* escreve o sufixo `cd N`, lido pelo parser do RV-074 em
> [chat/comandos.ts](../../packages/shared/src/chat/comandos.ts) (`ComandoChat.rolagem` ganhou
> `cd: number | null`); *quem não digita* — a ficha, ao clicar numa salvaguarda (RV-155) ou num ataque
> (RV-156) — manda `cd` como **número** no corpo de `POST /mesas/:id/rolagens`. Montar `"1d20+6 cd 18"`
> na ficha só para o servidor desmontar seria a segunda gramática que o RV-074 acabou de apagar do
> `Chat.tsx`. As duas portas convergem para o mesmo `cd: number | null` **antes** de `RolarDados`, que por
> isso não interpreta texto nenhum. Há teste de contrato provando que as duas produzem avaliação idêntica.
> **Sem CD não há grau, e não existe CD padrão.** `/r 1d20` continua sendo exatamente a mensagem que era.
> Isso vale também para o histórico: mensagem gravada antes desta migration volta sem avaliação e o chat a
> renderiza como sempre.
> **`avaliarRolagem` é obrigatório e anulável, e não opcional (`?`) como o Escopo pedia — F11.** Um `?`
> deixaria todo sistema novo respondendo "não avalio" por **omissão**, quando "esta mesa aceita CD?" é
> comportamento que o jogador percebe (ele recebe 400). Virou `avaliarRolagem: AvaliadorDeRolagem | null`,
> igual a `atribuicao`, `familiasPericia` e `defesas` — mesma razão escrita nos três. D&D 5e declara `null`
> **com o motivo no código**: lá o crítico é do ataque, não da checagem, e anunciar "Sucesso crítico" numa
> mesa de D&D seria inventar regra.
> **Nasceu um quarto campo que o Escopo não previa: `efeitoNatural`.** O Escopo dizia
> `{ cd, grau, d20Natural }`, e com esses três o cenário de aceite "indica em texto que o 20 natural
> melhorou um grau" **não é exprimível sem mentir**: um 20 natural contra CD baixa já entra como sucesso
> crítico e o ajuste não tem para onde subir. O campo é `'melhorou' | 'piorou' | 'sem-efeito' | null`,
> apurado no servidor comparando `grauSucesso` **com** e **sem** o dado natural — a mesma função, duas
> perguntas, nenhuma aritmética nova. Gravado, e não deduzido na renderização, porque a avaliação é o
> **registro do que foi anunciado**: uma errata de regra amanhã não pode reescrever o que o chat disse
> ontem.
> **Quais são os 20 e o 1 continua sendo segredo de `regras.ts`.** Para saber se um dado aciona o ajuste,
> `avaliar-rolagem.ts` **pergunta ao motor** (`grauSucesso` numa checagem sintética exatamente na CD, que
> cai no meio da escala e pode subir ou descer) em vez de escrever `=== 20 || === 1`. O DoD do RV-151
> proíbe número de regra fora dele, e a alternativa seria a segunda cópia da regra.
> **A faixa da CD (1..60) é limite de entrada, não regra de PF2e**, e por isso mora em
> [chat/avaliacao.ts](../../packages/shared/src/chat/avaliacao.ts) com `cdValida`. Ela é consultada em
> **três** lugares — parser do chat, `rolarDadosSchema` e o caso de uso — e isso é de propósito: três call
> sites de uma regra só. A validação existir apenas nas bordas é o que o RV-156 furaria ao criar o próximo
> caminho de escrita.
> ~~**A migration `0010` NÃO foi aplicada**~~ (ver `descobertas`): aplicar no banco real é ação de operação, e
> este card entrega a migration. Enquanto ela não rodar, rolar com CD contra o Supabase real falha no
> `INSERT` — falha ruidosa, de propósito.
> **Não fiz percurso manual no navegador**, pelo mesmo motivo: sem a `0010` o navegador mostraria o estado
> pré-migration, e não o comportamento entregue. A ponta a ponta está coberta por 17 testes de contrato.
>
> **Resolvido na verificação independente da sprint: a `0010` foi aplicada e o comportamento foi medido
> contra o Supabase real.** `/r 1d20+11 cd 18` numa mesa de PF2e gravou
> `avaliacao {"cd":18,"grau":"sucesso","d20Natural":14}` na coluna nova; `/r 1d20+11` sem CD voltou
> `avaliacao: null`; e a mesma rolagem com CD numa mesa de D&D 5e voltou **400 em PT-BR nomeando o sistema**,
> pelas duas portas (corpo `{cd: 15}` e sufixo `cd 15`). Também foi exercitado o `mensagens_avaliacao_check`
> da migration: um `update` pondo grau de sucesso numa mensagem de fala foi recusado pelo Postgres nomeando a
> constraint — a segunda tranca defende de verdade, não é decorativa (F1). E o histórico com `avaliacao`
> forçado a `null` volta 200 e renderiza inteiro, que é o cenário de borda do card provado no banco e não no
> fake.
>
> **O limite que a verificação encontrou, e que este card não fecha: qualquer expressão com CD é avaliada,
> inclusive um dano.** `RolarDados` chama o avaliador sem exigir que a expressão seja uma checagem, então
> `/r 1d8+4 cd 18` volta 201 com `grau: falha-critica` e **grava** o grau errado. A separação
> `acertos`/`danos` do RV-156 protege a ficha, mas ela protege pela **forma do chamador** (a tela não manda
> `cd` no dano), não porque o domínio recuse — é a variante de F4. Virou o
> [RV-160](#rv-160--grau-de-sucesso-só-para-checagem-rolagem-de-dano-não-tem-cd), e a decisão que ele precisa
> tomar já está nomeada lá: exigir "um d20" e exigir "um d20 **identificável**" são regras diferentes, e a
> segunda recusaria `1d20+1d6`, que este card avalia de propósito.
>
> **O que este card entregou e ninguém consumiu ainda:** o campo `cd` de `rolarDadosSchema` foi apontado, na
> entrega, para o RV-155 (salvaguardas e Percepção) e o RV-156 (ataques). Só o RV-156 o consumiu. A CD
> continua sem porta na ficha para perícia e salvaguarda — é o
> [RV-161](#rv-161--a-cd-precisa-chegar-às-rolagens-da-ficha-salvaguarda-percepção-e-perícia).

**História**
> Como **jogador**, quero **informar a CD e o chat dizer o grau de sucesso**, para **a mesa parar de conferir na mão se 28 contra CD 18 foi crítico**.

**Contexto técnico**
- Hoje [rolar-dados.ts](../../apps/api/src/aplicacao/jogo/rolar-dados.ts) monta `Mensagem.criarRolagem` com um `ResultadoRolagem` ([mensagem.ts](../../apps/api/src/dominio/jogo/mensagem.ts)).
- **Você é o primeiro consumidor de metade do RV-151, e essa é a armadilha nº 0 deste card.** Desde a
  v0.7.0, `grauSucesso`, `d20NaturalDe`, `somarModificadores`, `cdPorNivel`, `CDS_SIMPLES` e
  `MARGEM_CRITICA` existem, estão testados com 93 asserções e têm **zero** call sites em código de
  produção (varredura da verificação independente da v0.7.0). Hoje um 20 natural não desloca grau nenhum
  em lugar nenhum. Comparar o total com a CD dentro do componente ou do use case é barato e **está
  errado**: passariam a existir duas aritméticas, e a errata seria aplicada em uma só. Chame
  `grauSucesso({ total, cd, d20Natural: d20NaturalDe(resultado) })` — esse é o par canônico, e
  `d20Natural: null` significa "sem ajuste", não "não deu 20".
- **Decisão de extensão — hook na definição do sistema, não `if` no use case.** `DefinicaoSistema` (RV-091) ganha `avaliarRolagem`. `RolarDados` busca a definição pelo `mesa.sistema` no registro e chama o hook quando ele não é `null`. Zero `switch`. É o ponto de extensão canônico de [04-design-patterns.md](../../.claude/rules/04-design-patterns.md). *(Entregue como campo **obrigatório e anulável**, e não com `?` opcional — F11, ver a nota de entrega.)*
- **Decisão — a avaliação é campo próprio, não invade `ResultadoRolagem`.** `motor-dados.ts` é agnóstico de sistema e continua assim. A avaliação vira `MensagemDTO.avaliacao` em [dtos.ts](../../packages/shared/src/tipos/dtos.ts), persistida em coluna nova `mensagens.avaliacao jsonb` (nullable) — migration necessária. Nada de aninhar dentro do `rolagem jsonb`, que é o espelho exato de `ResultadoRolagem`.
- **Decisão — o tipo `GrauSucesso` mora em `sistemas/pathfinder2e/regras.ts` e o DTO o referencia.** Hoje só o PF2e produz avaliação. Generalizar antes da segunda variação é ornamento (heurística de [04-design-patterns.md](../../.claude/rules/04-design-patterns.md)).
- **Decisão — sistema que não avalia recusa a CD.** Em mesa `generico`, `... cd 15` devolve **400 em PT-BR**. Descartar em silêncio é F6. *(A frase entregue **nomeia o sistema**: "Mesas de Genérico não avaliam grau de sucesso: remova a CD da rolagem." — "este sistema" não diz qual é, e a mensagem precisa dizer o conserto, não só o problema.)*
- Sintaxe: sufixo `cd N` na expressão (`1d20+11 cd 18`). Se [RV-074 — registry de comandos de chat](07-chat.md) já estiver feito, entre como comando registrado; se não, o *parsing* fica em `rolarDadosSchema` ([jogo.ts](../../packages/shared/src/schemas/jogo.ts)). Nos dois casos, **fora** de `RolarDados`. *(O RV-074 **está** feito, então o sufixo entrou no parser. E as duas coisas acabaram sendo necessárias, não alternativas: `rolarDadosSchema` também ganhou `cd` como número, porque a ficha do RV-155/RV-156 não digita texto — ver a nota de entrega.)*
- **Armadilha F2 — órfão de contrato.** Campo novo no DTO sem consumidor no front é comentário. [cobertura-eventos-ws.test.ts](../../apps/web/src/features/jogo/cobertura-eventos-ws.test.ts) cobre *quais eventos* têm ouvinte, **não** o formato do payload — não conte com ele aqui.
- **Armadilha — histórico.** Mensagens gravadas antes deste card voltam com `avaliacao: null`. O chat trata isso como "sem CD informada", não como erro.

**Escopo**
- `packages/shared/src/sistemas/tipos.ts` — `DefinicaoSistema.avaliarRolagem: AvaliadorDeRolagem | null` (obrigatório — F11, ver a nota de entrega)
- `packages/shared/src/chat/avaliacao.ts` — **arquivo novo na entrega**: `AvaliacaoRolagem`, a faixa da CD (`cdValida`), as mensagens de recusa e `descreverAvaliacao` (o vocabulário PT-BR do selo). Mora em `chat/` porque a única superfície que exibe grau é o chat, e porque `sistemas/tipos.ts` e `tipos/dtos.ts` precisavam os dois do tipo sem criar ciclo
- `packages/shared/src/sistemas/pathfinder2e/avaliar-rolagem.ts` — **arquivo novo na entrega**: implementa via `grauSucesso` + `d20NaturalDe`, e `definicao.ts` só o pluga (uma linha)
- `packages/shared/src/tipos/dtos.ts` — `MensagemDTO.avaliacao: { cd, grau, d20Natural, efeitoNatural } | null` (o quarto campo nasceu na entrega — F11)
- `apps/api/supabase/migrations/0010_avaliacao_mensagem.sql`
- [rolar-dados.ts](../../apps/api/src/aplicacao/jogo/rolar-dados.ts), [mensagem.ts](../../apps/api/src/dominio/jogo/mensagem.ts), [mapeadores.ts](../../apps/api/src/aplicacao/mapeadores.ts) e o mapper Supabase de mensagens
- [Chat.tsx](../../apps/web/src/features/jogo/Chat.tsx) — selo do grau

**Critérios de aceite**
```gherkin
Cenário: Sucesso crítico anunciado
  Dado uma mesa "pathfinder2e"
  Quando eu rolar "1d20+11 cd 18" e o d20 sair 17
  Então o chat mostra o total 28 e "Sucesso crítico"
  E todos na mesa veem o mesmo, sem recarregar

Cenário: 20 natural não vira sucesso automático
  Quando eu rolar "1d20+2 cd 40" e o d20 sair 20
  Então o chat mostra "Falha"
  E indica em texto que o 20 natural melhorou um grau

Cenário: Sem CD, comportamento de hoje
  Quando eu rolar "1d20+11" sem CD
  Então a mensagem sai exatamente como antes, sem selo de grau

Cenário: Sistema que não avalia recusa a CD
  Dado uma mesa "generico"
  Quando eu rolar "1d20+5 cd 15"
  Então recebo 400 em PT-BR dizendo que este sistema não avalia grau de sucesso
  E nenhuma mensagem é criada

Cenário: Autorização
  Dado que não sou participante da mesa
  Quando eu chamar a rota de rolagem com CD
  Então recebo 403
  E nada é publicado na sala "mesa:{id}"

Cenário: Borda — CD inválida
  Quando eu rolar "1d20+3 cd 0" ou "1d20+3 cd 200"
  Então recebo 400 em PT-BR
  E nenhuma mensagem é criada

Cenário: Borda — histórico antigo
  Dado mensagens gravadas antes deste card
  Quando o chat carregar o histórico
  Então elas renderizam sem selo e sem erro no console
```

**Testes obrigatórios**
- Use case com fakes: mesa `pathfinder2e` com CD produz `avaliacao`; mesa `generico` com CD devolve `Validacao`; mesa `pathfinder2e` sem CD produz `avaliacao: null`.
- Contrato `fastify.inject()`: os quatro casos acima mais o 403 de não-participante.
- **Adapter Supabase de mensagens**: round-trip de `avaliacao` (grava e relê). O fake regrava o agregado inteiro e nunca exporia coluna esquecida no mapper — **F3** da taxonomia.
- Front: mensagem com `avaliacao: null` renderiza; mensagem com grau exibe **texto**, não só cor.

**DoD específico**
- [ ] Nenhum `switch (sistema)` em `RolarDados`.
- [ ] O selo de grau é legível sem cor (mesma regra do RV-084).
- [ ] `motor-dados.ts` e `ResultadoRolagem` inalterados.
- [ ] Migration nova somada à lista de pendências operacionais do [README](README.md).

---

### RV-155 — Defesas de PF2e: CA, salvaguardas, Percepção e CD de classe

**Épico:** E15 · **Depende de:** RV-152 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído (v0.8.0)

> **Decisões tomadas na entrega.** A aritmética está em
> [defesas.ts](../../packages/shared/src/sistemas/pathfinder2e/defesas.ts) e nenhuma linha dela soma
> `+ nivel`: as quatro defesas chamam `bonusProficiencia` do RV-151, e há um teste que fica vermelho se
> alguma delas se afastar dele em qualquer grau ou nível.
> **Dois contratos novos, e nenhum `switch (sistema)`.** (1) `CampoFicha` ganhou o tipo `selecao` com
> `opcoes` — os seis graus e o atributo-chave são escolhas, e sem isso a seção Defesas só existiria com
> uma lista de opções escrita no JSX, divergindo do `schemaFicha` no primeiro valor novo; o teste do
> registro passou a exigir que **toda** opção declarada seja aceita pelo schema e que um valor fora dela
> seja recusado. (2) `DefinicaoSistema.defesas(ficha)` é obrigatório e devolve `DefesaFicha[]` — `[]` nos
> outros sistemas, pela mesma disciplina de `familiasPericia`.
> **O derivado não é campo.** CA, salvaguardas, Percepção, CD de classe e o PV sugerido são calculados a
> cada leitura; `dados` guarda só o que é **informado** (seis graus, bônus de item e limite de Destreza da
> armadura, atributo-chave da classe, as duas entradas de PV). Gravar o derivado seria a segunda verdade
> que o RV-098 fechou para o atributo — o personagem sobe de nível e o número gravado continua o de
> antes. Há guarda para isso no registro (para todo sistema) e um 400 de contrato que recusa `dados.ca`.
> **Ausência ≠ zero no limite de Destreza.** `limiteDestrezaArmadura` é `number | null`, e `null` é a
> armadura que não limita a Destreza — tratá-lo como `0` apagaria a Destreza de quem não veste armadura. O
> campo esvaziado na interface (`''`) atravessa a pilha como ausência, e não como 400: há teste de
> contrato disso, porque é o caminho que a tela usa de verdade.
> **A CD de classe recusa-se a existir sem o atributo-chave.** Quem o define é a classe; escolher o maior
> (ou a Força, por ser a primeira da lista) daria um número plausível e errado — do tipo que a mesa só
> descobre quando o inimigo passa na CD. Sem ele o valor é `null` e a ficha diz o que falta, em PT-BR.
> **`pvSugerido` entregue como derivado, com as entradas informadas à mão.** "Nenhum campo de PV novo"
> continua valendo e está coberto por guarda: a ficha não declara `pvAtual`, `pvMax`, `pvSugerido` nem
> forma equivalente. O que ela guarda são `pvDaAncestralidade` e `pvDaClassePorNivel`, que **não** são os
> PV de ninguém — são constantes da ancestralidade e da classe, informadas à mão até o catálogo (RV-157),
> exatamente como o bônus de item da armadura. A sugestão aparece como **linha derivada** na lista de
> defesas (no PF2e os pontos de vida são um capítulo de defesa, ao lado de CA e salvaguardas), e é assim
> que ela chega à tela sem que a ficha genérica pergunte qual é o sistema. Ficha sem as duas entradas não
> sugere `0`: diz o que falta, porque "PV máximo sugerido: 0" parece resultado.
> **`BASE_DEFESA = 10` mora em `defesas.ts`, e não em `regras.ts`** — o DoD do RV-151 pede que nenhum
> número de regra fique fora de `regras.ts`, e esta é uma divergência consciente: `regras.ts` guarda o que
> atravessa o sistema (proficiência, graus de sucesso, empilhamento) e as regras de **defesa** são deste
> arquivo. O número está escrito uma vez, e é lido pela CA e pela CD de classe.
> **A previsão do RV-153 de que as defesas entrariam em `TREINAVEIS` foi superada (F11).** Aquela lista é
> também o `pericias` da definição, então Percepção dentro dela apareceria entre as perícias — o que os
> dois cards proíbem. Os graus das defesas são chaves de topo de `dados` (`grauArmadura`, `grauFortitude`,
> …), porque `CampoFicha.chave` endereça uma chave de topo e é assim que a seção renderiza. O comentário
> em `definicao.ts` foi corrigido.
> **Uma asserção de teste alheia mudou de forma, não de intenção:** `FichaPersonagem.pathfinder2e.test.tsx`
> afirmava "Percepção não aparece em lugar nenhum da ficha"; desde este card ela **aparece**, nas defesas,
> com dado próprio. A asserção passou a ser por seção (dentro do `fieldset` de perícias) e ganhou a
> contraprova de que o botão de Percepção existe.
>
> **O que este card entregou pela metade, e a metade que falta virou card.** O cenário acrescentado na
> curadoria da v0.7.0 — "rolar salvaguarda e Percepção em um clique" — foi cumprido ao pé da letra: a
> salvaguarda publica `1d20+6` com o motivo pronto. Mas a entrega do RV-154, no mesmo lote, tinha nomeado
> **este** card como o consumidor do campo `cd` de `rolarDadosSchema` para as salvaguardas, e isso não veio.
> Consequência para a mesa: o mestre diz "CD 18", o jogador clica em Reflexos, e o chat mostra o total **sem
> grau de sucesso** — na checagem mais rolada de uma sessão de PF2e, o eixo do épico
> (`ficha → bônus certo → grau no chat`) para no meio. Só o ataque tem de onde tirar a CD hoje. Virou o
> [RV-161](#rv-161--a-cd-precisa-chegar-às-rolagens-da-ficha-salvaguarda-percepção-e-perícia), que herda as
> decisões deste card (a expressão e o motivo já vêm prontos de `defesasDoPersonagem`; a tela não faz
> aritmética).
>
> **A `0009` e a `0010` foram aplicadas na verificação da sprint**, então o bloqueador registrado na entrega
> — "as defesas só são editáveis em ficha criada depois da `0009`" — **não existe mais**: `PATCH` numa ficha
> de PF2e antiga volta 200, e o schema preenche as onze chaves novas nos padrões (`destreinado`, `0`, `null`,
> `[]`). Isso foi conferido contra o banco real, forçando `dados` para o formato pré-Sprint-3 e relendo pela
> rota.
>
> **A aresta cosmética registrada na entrega continua de pé e não virou card:** ficha de PF2e gravada antes
> deste card mostra o grau de defesa como *select* sem seleção (a chave ausente devolve `''`, que não é uma
> das opções), até o primeiro salvamento. Não há perda de dado, o `detalhe` da defesa já exibe "proficiência
> +0" e o valor efetivo está certo. As duas saídas plausíveis mexem em contrato (`CampoFicha` declarando qual
> opção é o padrão) ou inventam valor na tela (cair na primeira opção por convenção de ordenação) — desproporcional
> para um sintoma que dura um salvamento. Fica como contexto para quem pegar o [RV-092](09-fichas.md) ou o
> [RV-159](#rv-159--adicionar-saber-recusado-precisa-dizer-o-motivo-em-vez-de-esvaziar-o-campo), que mexem nos
> mesmos componentes.

**História**
> Como **jogador de PF2e**, quero **CA, as três salvaguardas, Percepção e a CD de classe calculadas na ficha**, para **responder "qual é a sua CA?" sem abrir o livro no meio do combate**.

**Contexto técnico**
- Fórmulas (OGC, resumidas na [referência do épico](#5-referência-de-regras-o-que-o-motor-precisa-saber)); toda a aritmética sai de `bonusProficiencia` e `somarModificadores` do RV-151.
- **Armadilha nº 1 — o limite de Destreza da armadura.** É o erro clássico e é **F9 — limite validado isoladamente**: Destreza +4 com meia-armadura (limite +1) contribui **+1**, não +4. A conta precisa de tabela de teste, não de uma asserção.
- **Armadilha nº 2 — PV já existe e não pode ser duplicado.** `pvAtual`/`pvMax` vivem em `PersonagemDTO` ([dtos.ts](../../packages/shared/src/tipos/dtos.ts)) e alimentam a barra de vida sobre o token (RV-042), que existe justamente para **não** haver duas fontes de PV. A ficha PF2e pode *sugerir* o PV máximo (ancestralidade + classe + Constituição × nível), mas o valor final continua sendo `pvMax`, editável. **Nenhum campo de PV novo.**
- **Dependência que este card deliberadamente não tem:** a armadura equipada é um item de catálogo, e catálogo é RV-157. Até lá, `limiteDes` e `bonusItemArmadura` são campos informados à mão, marcados como manuais na UI. Não bloqueie este card no catálogo.
- Percepção entra aqui, não em perícias (RV-153).
- **Salvaguardas e Percepção precisam ser roláveis em um clique, e não só exibidas** *(acrescentado na
  curadoria da v0.7.0 — ver o cenário "Rolar salvaguarda e Percepção em um clique")*. O enunciado original
  falava só em "bloco de defesas somente leitura (derivado)", e isso deixaria a mesa numa situação
  estranha: depois do RV-153 o jogador clica na Furtividade e a rolagem sai pronta, mas a jogada de
  Reflexos — que numa sessão de PF2e acontece **mais vezes** que qualquer perícia, uma por magia de área,
  uma por perigo — teria que ser digitada à mão, junto com a CD. É o eixo do épico
  (`ficha → rolagem com o bônus certo → chat com o grau de sucesso`) quebrando exatamente onde ele mais
  vale. "Somente leitura" continua valendo para **edição** do número derivado; não é proibição de botão
  de dado. Reaproveite o caminho do RV-153 (`POST /mesas/:mesaId/rolagens` com `{ expressao, motivo }`) e
  o sufixo `cd N` do RV-154 — nenhuma rota nova. A Percepção rolável também é o que o RV-158 vai
  consumir para a iniciativa.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/defesas.ts` — `calcularCa`, `calcularSalvaguarda`, `calcularPercepcao`, `calcularCdClasse`, `pvSugerido`
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` — seção Defesas
- [FichaPersonagem.tsx](../../apps/web/src/features/personagens/FichaPersonagem.tsx) — bloco de defesas somente leitura (derivado), com os campos manuais de armadura editáveis

**Critérios de aceite**
```gherkin
Cenário: CA com o limite de Destreza aplicado
  Dado nível 3, perito em armadura média e destreza +4
  E meia-armadura com bônus de item +4 e limite de Destreza +1
  Então a CA exibida é 22

Cenário: As três salvaguardas
  Dado nível 3, perito em Fortitude e treinado em Reflexos e Vontade
  E constituição +3, destreza +1 e sabedoria +0
  Então Fortitude é +10, Reflexos é +6 e Vontade é +5

Cenário: CD de classe
  Dado nível 1, treinado na CD de classe e atributo-chave +4
  Então a CD de classe exibida é 17

# Acrescentado na curadoria da v0.7.0: sem isto a ficha calcula a defesa e o jogador
# digita a rolagem à mão — o inverso do que o RV-153 acabou de entregar nas perícias.
Cenário: Rolar salvaguarda e Percepção em um clique
  Dado Reflexos +6 e Percepção +9 na ficha
  Quando eu clicar no dado de Reflexos
  Então é publicada a rolagem "1d20+6" com o motivo "Reflexos — Seelah"
  E clicar no dado de Percepção publica "1d20+9" com o motivo "Percepção — Seelah"
  E todos na mesa as veem sem recarregar
  E o componente não faz aritmética nenhuma

Cenário: Autorização
  Dado que sou jogador
  Quando eu tentar alterar os campos de armadura da ficha de outro jogador
  Então recebo 403

Cenário: Borda — PV continua único
  Dado que eu alterei o PV máximo na ficha
  Então a barra de vida sobre o token acompanha na mesma sessão
  E a ficha PF2e não tem um segundo campo de PV

Cenário: Borda — limite de Destreza ausente
  Dado uma armadura sem limite de Destreza informado
  Então a Destreza entra inteira na CA
  E a UI marca o campo como não informado, em texto
```

**Testes obrigatórios**
- Tabela pura de `calcularCa`: destreza de +0 a +5 × limite de Destreza de +0 a +5 — prova o teto em todas as combinações, inclusive limite maior que a Destreza.
- Salvaguardas nos 5 graus × níveis 1, 10 e 20.
- `calcularCdClasse` com atributo-chave negativo e nos 5 graus.
- Regressão: teste que falha se a ficha PF2e declarar campo próprio de PV.

**DoD específico**
- [ ] Percepção aparece nas Defesas e **não** na lista de perícias.
- [ ] Campos derivados são somente leitura na UI; só armadura e graus são editáveis — **somente leitura
      significa não editável, e não "sem botão de dado"**: as três salvaguardas e a Percepção rolam em um
      clique, pela mesma rota do RV-153.

---

### RV-156 — Ataques com penalidade de ataques múltiplos

**Épico:** E15 · **Depende de:** RV-154, RV-155 · **Tamanho:** G · **Onda:** 2 · **Status:** ✅ Concluído (v0.8.0)

> **Decisões tomadas na entrega.**
> **Onde mora o contador: em lugar nenhum, e isso é verificado.** O card já indicava a escolha explícita, e
> a entrega a levou até o fim — não existe contador de MAP no servidor, no banco, nem no navegador. A ordem
> é argumento de `penalidadeAtaquesMultiplos(ordem, agil)`, e a interface oferece os três botões. Duas
> guardas em disco provam a ausência em vez de prometê-la (`ataques.test.ts`): nenhum arquivo de
> `apps/api/src` conhece o vocabulário deste card, e nenhuma migration fala de ataque. Um teste de front
> clica **duas vezes no mesmo botão** e exige a mesma expressão — se a tela contasse, o segundo clique
> sairia `-5` e ninguém saberia zerar. *(O RV-062 passou a existir na v0.9.0; a pré-seleção continua não
> implementada, e a decisão sobre ela é o [RV-162](#rv-162--a-ficha-justifica-o-map-manual-com-um-fato-que-deixou-de-ser-verdade).)*
> **A tabela é `MAP_POR_ORDEM` em [regras.ts](../../packages/shared/src/sistemas/pathfinder2e/regras.ts)**,
> com uma coluna para arma comum e outra para ágil, pela mesma disciplina do destreinado no RV-151. Há teste
> exigindo que a ágil **não** seja "um a menos": a diferença é 1 no segundo golpe e 2 no terceiro, e derivar
> um do outro casa por acidente num degrau e erra no outro.
> **`ordem` é `number`, e não `1 | 2 | 3` como o Escopo escreveu — F11.** O próprio critério de aceite exige
> `null` para ordem fora da faixa, e com o tipo estreito esse caminho só seria alcançável por `as`: uma
> guarda que não dá para exercitar (F1). O Escopo abaixo foi corrigido. A tabela tem **três** entradas, e o
> terceiro degrau se chama "3º ataque ou mais" — inventar uma entrada 4 sugeriria que o quarto golpe tem
> penalidade própria, e ele usa a do terceiro.
> **Contrato novo: `DefinicaoSistema.ataques: ModeloDeAtaques | null`** (obrigatório e anulável, como
> `avaliarRolagem`). O modelo carrega os campos editáveis de um ataque — como `CampoFicha`, reusando o
> renderizador genérico e o `never` dele —, o teto da lista, as três funções puras de edição e **todo o
> texto de regra da seção**. D&D 5e declara `null` **com o motivo escrito**: lá não existe MAP (o ataque
> repetido vem de Ação de Ataque Extra, sem penalidade), e reusar o modelo do PF2e aplicaria −5 a um golpe
> que não sofre nada.
> **`acertos` e `danos` são listas separadas no contrato, e a separação é a defesa.** Só o acerto aceita CD,
> então a rolagem de dano não tem como carregar `cd` nem por esquecimento — em vez de uma lista só com um
> `aceitaCd` que a tela pode ignorar. Há teste de front provando que o dano sai **sem** a chave `cd` mesmo
> com a CA do alvo preenchida na tela, e teste de contrato provando que ele volta com `avaliacao: null`.
> **A CA do alvo é efêmera e não é gravada.** Ela é do inimigo, não do personagem: vive no estado da seção,
> viaja como o `cd` **número** de `rolarDadosSchema` (a segunda porta que o RV-154 abriu, agora com o
> primeiro chamador de produção no front) e some ao fechar a ficha. Fora da faixa 1..60 a rolagem sai **sem**
> CD, em vez de virar 400: quem digitou 200 não perde o golpe, só não vê o grau.
> **Dano dobrado: a variante que o livro permite, dita em voz alta.** O motor de dados soma e subtrai termos
> e **não multiplica um total**, então "role e dobre o total" — o padrão do livro — é inexprimível hoje. A
> regra oferece uma alternativa com a concordância do mestre: rolar os dados duas vezes e dobrar os
> modificadores, que é `1d8+4+1d8+4`. É essa que o botão usa, e o `detalhe` da rolagem **diz qual das duas
> leituras foi usada**, porque a média é a mesma e o espalhamento não. As alternativas eram piores:
> multiplicação na gramática do motor é card do E08 e mexeria no chat, na validação e na api de uma vez; e
> "role o normal e dobre à mão" devolve ao jogador a conta que este épico existe para tirar dele. Expressão
> de dano cuja versão dobrada não caiba no motor desabilita **só** a variante, com o motivo.
> **Nome, bônus de acerto, dano e ágil são informados à mão**, como o bônus de item da armadura no RV-155 —
> catálogo de armas é o RV-157. A expressão de dano é validada pelo **motor de dados** (`validarExpressao`),
> e não por um regex próprio: o erro do motor entra na mensagem de 400, e não há segunda gramática de dados.
> **A chave de um ataque é posicional** (`ataque:0`), ao contrário do `saber:Guerra` do RV-153: o nome muda a
> cada tecla, e uma chave derivada dele remontaria a linha e tiraria o foco do campo no meio da palavra. Ela
> não é gravada em lugar nenhum.
> **As chaves das variantes de dano levam prefixo (`dano:normal`)** porque a guarda do registro — "nenhuma
> rolagem de ataque é campo gravado da ficha" — acusou colisão com o campo `dano`. Sem o prefixo, a guarda
> teria de ser afrouxada até não provar mais nada.
>
> **A guarda de ausência do contador foi exercitada por quem verificou, e defende.** Acrescentar uma linha com
> `penalidadeAtaquesMultiplos` em `apps/api/src/aplicacao/jogo/rolar-dados.ts` deixou a suíte de `shared`
> vermelha em 1 de 59, nomeando o arquivo culpado e o motivo. É a diferença entre uma decisão de arquitetura
> escrita no card e uma decisão que o repositório sabe cobrar (F1).
>
> **A separação `acertos`/`danos` protege a ficha, e só a ficha.** O teste de contrato que "prova" que o dano
> não tem grau prova que a **tela não manda** `cd` — o servidor avalia qualquer expressão que venha com CD, e
> quem digitar `/r 1d8+4 cd 18` no chat recebe "Falha crítica" num dano, com o grau errado **gravado** em
> `mensagens.avaliacao`. Medido contra a API em execução na verificação da sprint. Isto **não** invalida a
> decisão deste card (a separação estrutural continua sendo a forma certa de a ficha não errar); o que falta é
> a tranca do outro lado, e ela virou o
> [RV-160](#rv-160--grau-de-sucesso-só-para-checagem-rolagem-de-dano-não-tem-cd) — card protetor da Sprint 4,
> antes de o RV-161 abrir mais portas de CD.
>
> **A `0009` e a `0010` foram aplicadas na verificação da sprint**, então os dois bloqueadores registrados na
> entrega — acerto com CA falhando no `INSERT`, e `PATCH` de ataques recusado por escala em ficha antiga —
> **não existem mais** contra o banco em uso.
>
> **A leitura de dano dobrado continua sendo a variante da regra, e isso é decisão de produto pendente, não
> defeito.** O motor de dados não multiplica um total, então "role e dobre o total" (o padrão do livro) é
> inexprimível hoje e o botão usa "role os dados duas vezes e dobre os modificadores", dizendo qual leitura
> usou. Não virou card: o trabalho real é um multiplicador na gramática do motor, que é o
> [E08](08-dados.md) (RV-080…RV-084) e mexeria no chat, no VO `ExpressaoDados`, na validação e na api de uma
> vez. Se um dia entrar, este parágrafo é o contexto.

**História**
> Como **jogador de PF2e**, quero **botões de ataque com −0 / −5 / −10 já aplicados**, para **não errar a conta do segundo golpe no meio do turno**.

**Contexto técnico**
- Regra (OGC): ação com o traço *ataque* usada mais de uma vez no mesmo turno sofre −5 no segundo e −10 no terceiro em diante; arma **ágil** troca por −4/−8. A penalidade é calculada **pela arma daquele ataque**, não pela anterior. Zera no fim do turno.
- **Decisão crítica — o MAP não é estado do servidor neste card.** Quando este card foi escrito e executado (v0.8.0), [RV-060 e RV-062](06-combate.md) não existiam, então o servidor não sabia de quem era o turno nem quando zerar um contador, e um contador global seria estado compartilhado errado por construção. Aqui o MAP é **escolha explícita do jogador**: três botões rotulados ("1º ataque", "2º ataque −5", "3º ataque −10"). **Atualização de 2026-08-10 (v0.9.0): RV-060 e RV-062 foram entregues, então a premissa acima é história e não estado atual** — o servidor entrega `CombateDTO.tokenIdDoTurno`. A escolha explícita continua sendo a decisão vigente; se o contador vier, ele **pré-seleciona** e a ficha não muda. O texto de UI que ainda repete a premissa falsa é o [RV-162](#rv-162--a-ficha-justifica-o-map-manual-com-um-fato-que-deixou-de-ser-verdade).
- **Armadilha F6 — promessa da UI.** Não rotule nada como "automático". O texto do botão precisa dizer que a escolha é sua, porque é.
- **Decisão — crítico não dobra dano sozinho.** Acerto com sucesso crítico dobra o dano da arma. Este card **informa** ("Sucesso crítico — dano dobrado") e oferece a variante dobrada como botão rotulado; dobrar em silêncio esconde a regra de quem está aprendendo e vira discussão na mesa.
- Acerto e dano são **duas rolagens separadas**, como já é no RV-092.
- A CD/CA alvo do acerto usa o mesmo caminho do RV-154 (`cd N`), então o grau de sucesso já vem de graça.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/regras.ts` — `penalidadeAtaquesMultiplos(ordem: number, agil: boolean): number | null` *(o Escopo dizia `ordem: 1 | 2 | 3`; corrigido na entrega — ver as decisões acima, F11)*
- `packages/shared/src/sistemas/pathfinder2e/ataques.ts` — a lista `{ nome, bonusAcerto, dano, agil }[]`, o schema e as variantes de rolagem *(arquivo novo: a tabela não caberia em `definicao.ts`, que só a pluga)*
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` — pluga o modelo de ataques no registro
- [FichaPersonagem.tsx](../../apps/web/src/features/personagens/FichaPersonagem.tsx) + `SecaoAtaques.tsx` — três botões de acerto, dois de dano e a CA do alvo por ficha

**Critérios de aceite**
```gherkin
Cenário: Três ataques com a penalidade certa
  Dado o ataque "Espada longa" com +9 de acerto, sem o traço ágil
  Quando eu usar os três botões na ordem
  Então saem as rolagens "1d20+9", "1d20+4" e "1d20-1"
  E cada mensagem nomeia o ataque e a ordem

Cenário: Arma ágil
  Dado "Adaga" com +9 de acerto e o traço ágil
  Então o segundo ataque é "1d20+5" e o terceiro é "1d20+1"

Cenário: A penalidade é da arma daquele ataque
  Dado que meu primeiro ataque foi com a espada
  Quando eu escolher "2º ataque" na adaga (ágil)
  Então a penalidade aplicada é -4, não -5

Cenário: Crítico avisa, não dobra sozinho
  Dado o ataque contra "cd 18" com total 28
  Então o chat marca "Sucesso crítico"
  E o botão de dano passa a oferecer a variante dobrada, rotulada
  E nenhuma rolagem de dano é publicada sem eu clicar

Cenário: Autorização
  Dado que sou jogador
  Quando eu tentar atacar pela ficha de outro jogador
  Então recebo 403
  E nada é publicado na sala da mesa

Cenário: Borda — ataque sem bônus informado
  Dado um ataque salvo sem bônus de acerto
  Então os três botões ficam desabilitados com texto explicando o motivo
  E nenhuma rolagem é publicada

Cenário: Borda — ordem inválida
  Quando a ordem pedida não for 1, 2 ou 3
  Então penalidadeAtaquesMultiplos devolve null e nada é rolado
```

**Testes obrigatórios**
- Tabela pura de `penalidadeAtaquesMultiplos`: 3 ordens × {ágil, não ágil} = 6 casos, mais ordem 0 e 4 → `null`.
- Front: os três botões produzem exatamente as três expressões esperadas, sem aritmética no JSX.
- Contrato: ataque pela ficha de terceiro → 403.
- Integração com RV-154: ataque com `cd` produz `avaliacao` na mensagem.

**DoD específico**
- [ ] O rótulo dos botões deixa explícito que a escolha da ordem é do jogador.
- [ ] Nenhum contador de MAP no servidor, em memória ou no banco.
- [ ] A variante de dano dobrado é um botão distinto, nunca um efeito colateral.

---

### RV-157 — Port de catálogo de Pathfinder com semente curada

**Épico:** E15 · **Depende de:** RV-150, RV-152 · **Tamanho:** G · **Onda:** 3

**História**
> Como **mestre**, quero **escolher talentos, magias e itens de uma lista dentro do RolaVinte**, para **preencher a ficha sem alternar de janela** — e quero **que trocar a origem desses dados amanhã não mexa na ficha**.

**Contexto técnico**
- **Esta port existe por causa do licenciamento.** Releia a [seção 2 da estratégia](#2-licenciamento--decidido-não-re-decidir): não podemos raspar o AoN nem empacotar o dataset do Foundry. Portanto a ficha depende de **`CatalogoPathfinder`**, jamais de um arquivo de dados. No dia em que houver um import licenciado, ele entra como **adapter novo** registrado no composition root ([main.ts](../../apps/api/src/main.ts)) e nada do domínio muda.
- Este card entrega **uma** implementação: `CatalogoSementeCurada`, escrita à mão, dentro do teto do RV-150. O adapter licenciado **não é deste épico**.
- **Armadilha F3 — fake generoso.** O teto e a atribuição precisam ser verificados sobre o **arquivo real** da semente (o teste do RV-150 faz isso); um fake em teste de use case devolve o que você mandar e não prova nada disso.
- **Atribuição viaja no corpo da resposta**, não só no rodapé da tela: quem consome `GET /catalogo/pathfinder2e` precisa recebê-la. Cada item carrega `fonte`.
- **Decisão pendente que este card precisa fechar por escrito** *(levantada na verificação da v0.7.0)*: o
  auditor do RV-150 está verde sobre **zero itens** — ele varre só o diretório `semente/`, que hoje tem
  apenas o `README.md` — enquanto conteúdo de PF2e **já sai pela API** por outra porta: `GET
  /api/mesas/:id/personagens` devolve `dados.treinamentos` com as 16 chaves de perícia, e `POST
  /api/mesas/:id/rolagens` devolve `motivo: "Saber (Guerra) — Seelah"`, nenhum dos dois com campo de
  atribuição. Na tela a atribuição acompanha (RV-152/RV-153, verificado); no JSON não. A regra escrita em
  [licenca.ts](../../packages/shared/src/sistemas/pathfinder2e/licenca.ts):32 diz que "a atribuição precisa
  viajar junto do dado", sem qualificar. Ou ela vale **só para itens de catálogo** — e então o comentário
  precisa dizer isso, porque hoje é uma regra que o próprio repositório não cumpre (F1) — ou as respostas
  que carregam mecânica precisam de campo de atribuição. Nome de mecânica é OGC e o caso é bem mais fraco
  que o de item de catálogo; a curadoria **não** decidiu por conta própria, mas a decisão não pode ficar
  implícita depois que este card puser itens de verdade na semente.
- Sem N+1 e sem `select('*')` ([07-supabase.md](../../.claude/rules/07-supabase.md)) — a semente é estática, então a busca é em memória, paginada, com termo mínimo de 2 caracteres.

**Escopo**
- `apps/api/src/aplicacao/ports/catalogo-pathfinder.ts` — `buscar({ tipo, termo, nivelMax, pagina })` e `obter(chave)`
- `apps/api/src/infra/catalogo/catalogo-semente-curada.ts`
- `packages/shared/src/sistemas/pathfinder2e/semente/{talentos,magias,itens}.ts` — cada item `{ chave, nome, tipo, nivel, resumo, fonte }`
- `apps/api/src/apresentacao/http/rotas-catalogo.ts` — `GET /catalogo/pathfinder2e`
- Front: seletor de busca dentro da ficha + `AvisoLicenca` do RV-150 no rodapé

**Critérios de aceite**
```gherkin
Cenário: Buscar e anexar
  Dado a semente com o talento "Ataque Poderoso"
  Quando eu buscar "poderoso" na ficha
  Então vejo o item com nome, nível e resumo
  E ao anexá-lo, ele aparece na seção de talentos da ficha

Cenário: Atribuição na resposta da API
  Quando eu chamar GET /catalogo/pathfinder2e
  Então cada item traz o campo "fonte"
  E o corpo traz o texto de atribuição

Cenário: Autorização
  Dado que não estou autenticado
  Quando eu chamar GET /catalogo/pathfinder2e
  Então recebo 401

Cenário: Troca de adapter não toca no domínio
  Dado um segundo adapter de catálogo registrado no composition root
  Quando eu trocar a implementação injetada
  Então o caso de uso e a ficha não mudam uma linha

Cenário: Borda — termo curto e página além do fim
  Quando eu buscar com 1 caractere
  Então recebo 400 em PT-BR
  E pedir uma página além do fim devolve lista vazia, não erro

Cenário: Borda — semente estourando o teto
  Quando alguém adicionar itens acima do teto do RV-150
  Então o teste de licença fica vermelho e o build falha
```

**Testes obrigatórios**
- Use case com **fake** da port e depois com o **adapter real**, provando substituibilidade (L de [03-solid.md](../../.claude/rules/03-solid.md)).
- Contrato `fastify.inject()`: 401 sem token, 400 com termo curto, corpo com `fonte` e atribuição, paginação além do fim.
- Teste sobre o **arquivo real** da semente: teto e `fonte` (herdado do RV-150, agora com dados dentro).

**DoD específico**
- [ ] Nenhum item da semente copia texto descritivo do AoN — só nome, nível e resumo próprio.
- [ ] A ficha importa a **port**, nunca o módulo de semente.
- [ ] Zero script de download, *crawler* ou dependência de rede.

---

### RV-158 — Iniciativa por Percepção no combate de PF2e

**Épico:** E15 · **Depende de:** RV-061, RV-155 · **Tamanho:** M · **Onda:** 3 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0):** as cinco estão no bloco "Decisões registradas na execução" ao fim do card.
> O que o card entregou além do enunciado: `rolagensPadrao` deixou de ser contrato órfão (é a última F2 do
> épico), a Percepção **não foi recalculada** — a iniciativa lê a mesma lista de `defesas(ficha)` que a ficha
> desenha, com teste comparando as duas expressões caractere por caractere —, e a iniciativa passou a existir
> em Tormenta 20 e Ordem Paranormal por herança da definição genérica (decisão registrada no código: a
> alternativa era deixar as duas sem iniciativa nenhuma; para Ordem Paranormal, cuja iniciativa é a perícia
> Agilidade, é aproximação declarada até a ficha própria existir).
> **Consequência aberta que este card criou:** com `expressao` opcional, a expressão informada vence a
> derivação **para qualquer papel**, e o jogador pode escolher o próprio número por chamada direta à rota — é
> [RV-066](06-combate.md#rv-066--iniciativa-informada-é-privilégio-do-mestre-hoje-o-jogador-escolhe-o-próprio-número).

**História**
> Como **mestre de PF2e**, quero **que "rolar iniciativa" use a Percepção da ficha (ou a perícia que a cena pedir)**, para **começar o combate sem perguntar o número de cada jogador**.

**Contexto técnico**
- Regra: no PF2e a iniciativa é uma checagem de **Percepção** — ou de uma perícia quando a situação pede (Furtividade numa emboscada, Enganação numa negociação que desanda). Não há CD: os totais são comparados entre si.
- [RV-061 — Iniciar combate e rolar iniciativa](06-combate.md) já define o agregado e o fluxo. **Este card só fornece o modificador certo** ao que o RV-061 faz, através da definição do sistema (`rolagensPadrao`). Sem `switch (sistema)` no combate.
- **`rolagensPadrao` é contrato órfão desde que nasceu, em todos os sistemas** *(medido na verificação da
  v0.7.0)*: `dnd5e` (iniciativa), `tormenta20`, `ordem-paranormal` e `generico` o preenchem, e **zero**
  linhas de produção o leem — só testes. O PF2e o declara `[]` com um comentário apontando para este card,
  o que reforça a impressão contrária. Efeito para o usuário: a iniciativa que a definição promete não é
  oferecida em tela nenhuma, em sistema nenhum. Este card (com o RV-061) é o **primeiro consumidor** —
  então é aqui que cabe fechar a classe F2, no mesmo espírito do RV-116: um teste que fique vermelho
  quando um sistema declarar `rolagensPadrao` sem que nada as ofereça.
- Depende de **Percepção rolável** (RV-155, cenário acrescentado na curadoria da v0.7.0): a iniciativa de
  PF2e é uma checagem de Percepção, e o bônus tem que sair da ficha, não de um número digitado.
- **Armadilha — empate silencioso é bug de mesa.** A ordem tem que ser **estável** entre
  recarregamentos, não depender de ordenação instável. *(Corrigido na execução — F11: o enunciado
  original pedia também "personagem de jogador vem antes de NPC", e esse desempate **não** foi
  implementado. Ver "Decisões registradas na execução", abaixo: o desempate é do agregado `Combate`
  (RV-060) e já existe pronto e testado; um segundo desempate aqui exigiria que o participante
  soubesse se é peça de jogador, que é o vínculo peça↔ficha que o contrato do combate recusou de
  propósito para não ter duas verdades.)*
- NPC sem ficha PF2e existe e é comum. O mestre precisa poder digitar o valor na mão sem que o combate trave.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` — `rolagensPadrao.iniciativa` apontando para Percepção, com perícia alternativa selecionável
- Caso de uso de iniciativa do RV-061 — passa a consultar a definição do sistema da mesa
- Front: seletor "rolar iniciativa por…" no painel do mestre + campo manual por participante

**Critérios de aceite**
```gherkin
Cenário: Iniciativa pela Percepção da ficha
  Dado um personagem com Percepção +9
  Quando o mestre iniciar o combate
  Então a iniciativa dele é rolada como "1d20+9"
  E ele entra na ordem de turno com esse total

Cenário: Iniciativa por perícia escolhida
  Dado que o mestre escolheu Furtividade para esta cena
  Então a rolagem de cada participante usa o bônus de Furtividade da ficha dele

Cenário: Autorização
  Dado que sou jogador
  Quando eu tentar iniciar o combate
  Então recebo 403

Cenário: Borda — empate
  Dado dois participantes com o mesmo total
  Então vale a ordem de entrada no combate
  E a ordem é idêntica depois de recarregar a página
  E a regra do desempate está escrita na tela, com as mesmas palavras do servidor

Cenário: Borda — participante sem ficha PF2e
  Dado um NPC sem ficha do sistema
  Então o mestre informa a iniciativa dele na mão
  E o combate começa normalmente
```

**Testes obrigatórios**
- Unitário puro da ordenação: empates entre iguais e estabilidade da ordem em duas execuções — **já
  entregues e verdes no RV-060** (`apps/api/src/dominio/jogo/combate.test.ts`, inclusive o caso de duas
  reconstituições com as linhas do banco em ordens invertidas). Este card não os reescreve.
- Use case com fakes: iniciativa derivada da ficha PF2e; mesa de outro sistema mantém o comportamento do RV-061.
- Contrato: iniciar combate como jogador → 403.

**DoD específico**
- [x] Zero `switch (sistema)` no caso de uso de combate.
- [x] A regra de desempate está escrita na UI, não só no código. *(Fechado pelo RV-063: a frase existe
  uma vez só, em `REGRA_DESEMPATE_INICIATIVA` (`packages/shared/src/schemas/combate.ts`), e o
  `PainelIniciativa` a **importa** em vez de redigir a própria — há teste comparando o texto na tela com
  a constante, para que a interface não passe a anunciar um desempate que o servidor não aplica.)*

**Decisões registradas na execução (RV-158)**

1. **O desempate continua sendo o do agregado, e "jogador antes de NPC" não existe** (F11 — o cenário
   do card foi corrigido acima). Três razões, na ordem do peso: (a) o `Combate` (RV-060) já ordena por
   iniciativa decrescente com desempate por ordem de entrada, com comparador **total** e provado
   estável entre duas reconstituições; (b) para saber que uma peça é "de jogador" o participante teria
   de carregar o vínculo peça↔ficha, que `ParticipanteCombateDTO` recusa **por escrito** para não criar
   uma segunda verdade sobre esse vínculo (F12); (c) na regra do PF2e o empate é resolvido pelo mestre,
   não por precedência de jogador — a precedência é convenção de mesa. A frase que a interface deve
   mostrar está escrita uma vez em `REGRA_DESEMPATE_INICIATIVA`, para a tela não descrever um
   desempate que o servidor não aplica (F6).
2. **A iniciativa é derivada no servidor, e `expressao` virou opcional** em `rolarIniciativaSchema`.
   Era obrigatória com a justificativa "quem chama diz o que está rolando, porque quem responde é
   `rolagensPadrao` no RV-158" — este card é o RV-158, então quem responde passou a ser consultado.
   `expressao` informada continua mandando (é o NPC sem ficha e o valor que o mestre digita), e nada
   do RV-061 quebrou. Efeito colateral desejado: a iniciativa do jogador deixou de ser um número que
   o cliente escolhe.
3. **A ficha genérica mantém a iniciativa por Destreza.** Ela não é "sistema sem regra": é a ficha do
   d20 clássico, e já declara isso em `ESCALA_D20_CLASSICA` e `dadoDeTeste: '1d20'`. Tirá-la deixaria
   Tormenta 20 e Ordem Paranormal — que reusam esta definição — sem iniciativa nenhuma na plataforma.
4. **As alternativas por perícia são declaradas pelo sistema**, como entradas `iniciativa:<perícia>` de
   `rolagensPadrao`, e não montadas genericamente a partir de `definicao.pericias`: "o mestre pode
   pedir outra perícia" é regra de PF2e, e oferecê-la numa mesa de D&D 5e seria legislar sobre regra
   alheia — do lado errado, porque em D&D a iniciativa é sempre Destreza. Há teste provando que a mesa
   de D&D recusa `iniciativa:furtividade`.
5. **A F2 de `rolagensPadrao` foi fechada por dois testes, e por dois porque um só não alcança.**
   `packages/shared/src/sistemas/iniciativa.test.ts` exige que toda rolagem padrão declarada seja
   oferecida como opção (vermelho nomeando sistema e chave); `apps/api/src/aplicacao/jogo/iniciativa-do-sistema.test.ts`
   rola a iniciativa de **todo** sistema do registro sem informar expressão e compara com o que a
   definição declara — é este que fica vermelho se o caso de uso parar de perguntar.

---

### RV-159 — Adicionar Saber recusado precisa dizer o motivo, em vez de esvaziar o campo

**Épico:** E15 · **Depende de:** RV-153 (✅) · **Tamanho:** P · **Onda:** 2

**História**
> Como **jogador de PF2e**, quero **saber por que o Saber que digitei não foi criado**, para **não descobrir três sessões depois que "Guerra" nunca entrou na ficha**.

**Contexto técnico**
- **Defeito entregue na v0.7.0, medido em execução pela verificação independente** (Testing Library, não
  leitura de código). Com "Guerra" já na ficha, digitar `guerra` deixa o botão "Adicionar Saber"
  **habilitado**, com o `title` genérico; o clique **limpa o campo** e nada acontece: nenhuma linha nova,
  nenhum `role="alert"`. O mesmo com 12 especializações gravadas e uma 13ª tentativa, e o mesmo com uma
  especialização acima de 40 caracteres. O jogador digita, clica, vê o campo esvaziar e conclui que
  salvou. Classe **F6** (promessa da UI que o backend não cumpre) combinada com **F8** (etapa pulada em
  silêncio) — [taxonomia](../agentes/taxonomia-de-falhas.md).
- **Onde está.** `acrescentarSaber` em
  [pericias.ts](../../packages/shared/src/sistemas/pathfinder2e/pericias.ts):326 devolve `dados`
  **inalterado** nos quatro casos de recusa (vazio, repetido, acima de `LIMITE_SABERES` = 12, acima de
  `TAMANHO_MAXIMO_ESPECIALIZACAO` = 40) e não tem como dizer qual foi. `FormularioFamilia` em
  [SecaoPericias.tsx](../../apps/web/src/features/personagens/SecaoPericias.tsx):124-162 só sabe distinguir
  o campo vazio, e é o único caso tratado.
- **O comentário do código afirma o contrário do que o código faz** — "a interface impede as três antes de
  chegar aqui". Corrigi-lo é parte deste card: comentário que mente é a mesma classe de defeito que a
  regra escrita só em documento.
- **A defesa de verdade existe e não é alcançada.** O `schemaFicha` recusa duplicata e teto com 400 em
  PT-BR, e há teste de contrato disso — mas a interface **nunca chega a mandar a requisição**. Não
  "conserte" removendo a validação do shared: o problema é a UI ser otimista, não a API ser permissiva.
- **Decisão a tomar e registrar no diff:** o padrão certo já existe nesta mesma seção, aplicado ao campo
  vazio — **botão desabilitado com o motivo no `title`**. Estendê-lo exige que a família saiba *por que*
  recusaria, o que significa acrescentar ao contrato `FamiliaPericia`
  ([tipos.ts](../../packages/shared/src/sistemas/tipos.ts):99) um método puro do tipo
  `motivoParaRecusar(dados, especializacao): string | null` — `null` = pode adicionar. Isso mantém a regra
  no dado e fora do JSX, que é o mesmo motivo pelo qual `acoesDePericia` devolve `{ disponivel, motivo }`
  em vez de a tela deduzir. **Não** resolva com um `if (sistema === 'pathfinder2e')` na tela nem com uma
  segunda cópia das regras dentro do componente: seriam duas verdades sobre o mesmo limite.
- **Armadilha — o limite que não limita (F9).** O `<input>` de especialização não tem `maxLength`, então o
  caso dos 40 caracteres é o mais fácil de esquecer: ele não tem nem o sintoma de "botão que não faz
  nada", porque o jogador nem imagina que existe um teto. Se optar por `maxLength`, ele precisa vir do
  `TAMANHO_MAXIMO_ESPECIALIZACAO` exportado, nunca de um número escrito no JSX.
- **Armadilha — a comparação de duplicata não diferencia caixa nem acentos** (`normalizar` em
  `pericias.ts`). A mensagem precisa dizer qual especialização já existe, com a grafia gravada: "Você já
  tem Saber (Guerra)" é útil; "especialização repetida" depois de digitar `guerra` deixa o jogador
  procurando o que não vê.

**Escopo**
- `packages/shared/src/sistemas/tipos.ts` — `FamiliaPericia.motivoParaRecusar` (obrigatório, como os
  demais campos da família)
- `packages/shared/src/sistemas/pathfinder2e/pericias.ts` — implementação para `FAMILIA_SABER` e correção
  do comentário de `acrescentarSaber`
- [SecaoPericias.tsx](../../apps/web/src/features/personagens/SecaoPericias.tsx) — `FormularioFamilia`
  consome o motivo; botão desabilitado com o texto no `title`, e o campo **não** é esvaziado quando a
  adição não acontece

**Critérios de aceite**
```gherkin
Cenário: Especialização repetida é recusada com o motivo na tela
  Dado uma ficha PF2e com "Saber (Guerra)"
  Quando eu digitar "guerra" no campo de especialização
  Então o botão "Adicionar Saber" fica desabilitado
  E o motivo em PT-BR nomeia o Saber que já existe
  E o texto que digitei continua no campo

Cenário: Teto de Saberes explicado antes do clique
  Dado uma ficha com 12 Saberes
  Quando eu digitar qualquer especialização
  Então o botão fica desabilitado dizendo que o limite de 12 foi atingido

Cenário: Especialização longa demais
  Quando eu digitar mais de 40 caracteres
  Então a interface impede a adição explicando o limite
  E o limite exibido vem de TAMANHO_MAXIMO_ESPECIALIZACAO, não de um número no JSX

Cenário: Caminho feliz continua igual
  Dado o campo com "Náutico" numa ficha que não o tem
  Quando eu clicar em "Adicionar Saber"
  Então a linha "Saber (Náutico)" aparece destreinada
  E o campo é esvaziado

Cenário: Autorização
  Dado que estou vendo a ficha de outro jogador
  Então o campo e o botão continuam desabilitados com "Ficha somente leitura."
  E a API recusa a escrita com 403, como desde o RV-152

Cenário: Borda — sistema sem família de perícia
  Dado uma mesa "dnd5e"
  Então nenhum formulário de família é renderizado
  E nada neste card muda o comportamento dela
```

**Testes obrigatórios**
- Puro: `motivoParaRecusar` nos quatro casos (vazio, repetida ignorando caixa e acento, no teto, acima de
  40) e `null` no caso válido — com a mensagem conferida, não só a existência dela.
- Front: **o teste que reprova o defeito de hoje** — digitar uma especialização já gravada e provar que o
  clique não é possível, que o campo mantém o texto e que existe motivo legível. Quebre a correção de
  propósito e veja o vermelho antes de confiar nele.
- Front: o caso dos 12 Saberes, que é o que a suíte da v0.7.0 não cobria.

**DoD específico**
- [ ] Nenhuma recusa silenciosa: toda saída de `acrescentarSaber` que devolva `dados` inalterado tem um
      motivo correspondente que a interface consegue exibir.
- [ ] Zero número de limite escrito no JSX.
- [ ] O comentário de `acrescentarSaber` descreve o que o código faz.

---

### RV-160 — Grau de sucesso só para checagem: rolagem de dano não tem CD

**Épico:** E15 · **Depende de:** RV-154 (✅) · **Tamanho:** P · **Onda:** 2 · **Faça este antes do RV-161**

**História**
> Como **jogador de PF2e**, quero **que o chat só anuncie grau de sucesso quando a rolagem for uma checagem**, para **não ver "Falha crítica" num dano de espada — e não ter esse veredito gravado no histórico da campanha**.

**Contexto técnico**
- **Defeito medido contra a API em execução na verificação independente da v0.8.0**, numa mesa de PF2e real:
  `POST /mesas/:id/chat {texto:'/r 1d8+4 cd 18'}` → **201** com `avaliacao {"cd":18,"grau":"falha-critica"}`;
  `/r 2d6+3 cd 20` → 201 com `grau "falha-critica"`;
  `POST /mesas/:id/rolagens {expressao:'1d8+4', motivo:'Dano — Espada longa', cd:18}` → 201 com `grau "falha"`.
- **Onde está.** [rolar-dados.ts](../../apps/api/src/aplicacao/jogo/rolar-dados.ts) chama `avaliar(avaliador, resultado, cd)`
  para **qualquer** expressão que venha com CD; nada no caminho exige que a expressão seja uma checagem de
  d20. O avaliador ([avaliar-rolagem.ts](../../packages/shared/src/sistemas/pathfinder2e/avaliar-rolagem.ts))
  faz o que promete: compara `resultado.total` com a CD. Ele não tem como saber que aquele total é dano.
- **Por que a suíte não pega — e por que o teste que parece cobrir isso não cobre.** O RV-156 modelou
  `acertos` e `danos` como listas separadas justamente para a tela não ter como mandar `cd` num dano, e há um
  teste de contrato em
  [rotas-personagens-ataques-pf2e.test.ts](../../apps/api/src/apresentacao/http/rotas-personagens-ataques-pf2e.test.ts):302
  provando `avaliacao: null` no dano. Ele passa porque **a ficha não manda** `cd`, não porque o servidor
  recuse. É a variante de **F4** da [taxonomia](../agentes/taxonomia-de-falhas.md): a proteção mora na forma
  do chamador, e some no primeiro chamador novo — que é literalmente a caixa de texto do chat, que já existe.
- **Consequência que não se conserta depois.** A avaliação é, por decisão do RV-154, "o registro do que foi
  anunciado" — gravada em `mensagens.avaliacao` e não deduzida na renderização. Um grau errado no histórico
  não é corrigido por errata: fica lá.
- **Decisão a tomar, com justificativa escrita no diff — e as duas candidatas não são equivalentes:**
  1. **"A expressão precisa ter um termo de dados de 20 faces somado."** Aceita `1d20+11`, `1d20+1d6` e
     `2d20kh1`; recusa `1d8+4`, `3d6` e `7`. Preserva o comportamento que o RV-154 escolheu de propósito:
     `1d20+1d6` **é** avaliada, com `d20Natural: null` significando "sem ajuste do dado natural", não "não
     avalio".
  2. **"O d20 precisa ser identificável" (`d20NaturalDe(resultado) !== null`).** Mais simples de escrever e
     **muda entrada aceita hoje**: recusaria `1d20+1d6`, contrariando o cenário `Guarda:` do RV-151 e a
     decisão do RV-154. Se for esta, o card tem de dizer por que aquela decisão foi revertida.
- **A regra não é um `if` dentro de `RolarDados`.** Quem sabe o que é uma checagem é o **sistema** —
  `DefinicaoSistema.avaliarRolagem` é o ponto de extensão que o RV-154 abriu, e o predicado pertence a esse
  lado da fronteira (o avaliador devolvendo "não é checagem", ou um irmão dele). Um `switch`/`if` de formato de
  expressão no caso de uso é o que o DoD do RV-154 proíbe.
- **Armadilha — o `20` é número de regra.** O DoD do RV-151 exige que nenhum número de regra de PF2e seja
  escrito fora de `regras.ts`. "Faces 20" já está encapsulado em `d20NaturalDe`; se a saída 1 precisar de um
  predicado novo, ele mora ao lado dela, em `regras.ts`, e não no shared genérico nem na api.
- **Armadilha — recusar em silêncio é F6.** O RV-154 já decidiu isto para o outro caso ("mesa de D&D 5e recusa
  CD com 400 nomeando o sistema, nenhuma mensagem criada"). Aceitar a rolagem e só omitir o selo faria o
  jogador que digitou `cd 18` acreditar que informou a CD. **400 em PT-BR, dizendo o conserto**, e a mensagem
  não é criada — mesma forma da recusa que já existe.
- **Não há dado velho a migrar.** As únicas mensagens conhecidas com grau sobre expressão que não é checagem
  são as 7 linhas de auditoria da verificação da v0.8.0 (mesas com prefixo `Dano `/`Auditoria `). Não reescreva
  `mensagens.avaliacao` de linhas existentes: a decisão do RV-154 é que a avaliação registra o que foi
  anunciado, e uma migration que reescreve o passado contradiz o card que criou a coluna.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/regras.ts` e/ou
  [avaliar-rolagem.ts](../../packages/shared/src/sistemas/pathfinder2e/avaliar-rolagem.ts) — o predicado de
  "isto é uma checagem"
- `packages/shared/src/chat/avaliacao.ts` — a mensagem de recusa em PT-BR, ao lado de `MENSAGEM_CD_INVALIDA` e
  `mensagemSistemaSemAvaliacao` (é onde as outras duas já moram, e é o que evita a terceira grafia da mesma ideia)
- [rolar-dados.ts](../../apps/api/src/aplicacao/jogo/rolar-dados.ts) — a recusa entra **antes** de rolar, junto
  da que já existe para sistema sem avaliação
- `packages/shared/src/sistemas/tipos.ts` — só se o contrato do avaliador precisar mudar de forma

**Critérios de aceite**
```gherkin
Cenário: Dano com CD é recusado, e nada é gravado
  Dado uma mesa "pathfinder2e"
  Quando eu rolar "/r 1d8+4 cd 18"
  Então recebo 400 em PT-BR dizendo que a CD só se aplica a uma checagem
  E nenhuma mensagem é criada nem publicada na sala "mesa:{id}"

Cenário: Checagem continua avaliada, pelas duas portas
  Quando eu rolar "/r 1d20+11 cd 18"
  E quando a ficha chamar POST /mesas/:id/rolagens com { expressao: "1d20+11", cd: 18 }
  Então as duas produzem a mesma avaliação, com o grau no chat

Cenário: A decisão do RV-154 sobre d20 ambíguo é preservada
  Quando eu rolar "1d20+1d6 cd 18"
  Então a rolagem é avaliada
  E o dado natural não ajusta o grau (d20Natural nulo)

Cenário: Sem CD, nada muda
  Quando eu rolar "/r 1d8+4" sem CD
  Então a mensagem sai exatamente como hoje, sem selo e sem erro

Cenário: Autorização
  Dado que não participo da mesa
  Quando eu chamar a rota de rolagem com CD
  Então recebo 403
  E a recusa de autorização vem antes de qualquer avaliação

Cenário: Borda — expressão sem dados
  Quando eu rolar "/r 7 cd 10"
  Então recebo 400 em PT-BR
  E nenhuma mensagem é criada
```

**Testes obrigatórios**
- Puro: o predicado sobre resultados vindos do **motor de dados real com RNG determinístico**, nunca sobre
  `ResultadoRolagem` montado à mão — mesma disciplina do RV-151 e do RV-154, e pelo mesmo motivo (**F3**).
  Cobrir `1d20+11`, `2d20kh1`, `1d20+1d6`, `1d8+4`, `2d6+3`, `3d6` e constante pura.
- Use case com fakes: dano com CD devolve `Validacao` sem salvar nem publicar; checagem com CD continua
  produzindo `avaliacao`.
- Contrato `fastify.inject()`: as **duas** portas (sufixo `cd N` no `/chat` e `cd` número em `/rolagens`)
  recusando o dano, com o histórico conferido vazio depois.
- **Prove o vermelho antes de confiar:** reintroduza o defeito e veja o teste de contrato falhar com o sintoma
  exato (`expected 400 to be 201` não serve — o teste precisa nomear o grau que não deveria existir).

**DoD específico**
- [ ] A recusa vive do lado do **sistema**, não como `if` de formato de expressão dentro de `RolarDados`.
- [ ] Nenhum número de regra novo fora de `regras.ts`.
- [ ] O teste de `rotas-personagens-ataques-pf2e.test.ts` que hoje passa por outro motivo ganha um irmão que
      manda `cd` no dano de propósito.
- [ ] Nenhuma linha existente de `mensagens.avaliacao` é reescrita.

---

### RV-161 — A CD precisa chegar às rolagens da ficha: salvaguarda, Percepção e perícia

**Épico:** E15 · **Depende de:** RV-154 (✅), RV-155 (✅), RV-160 · **Tamanho:** M · **Onda:** 2

**História**
> Como **jogador de PF2e**, quero **informar a CD que o mestre acabou de anunciar quando clico na minha salvaguarda**, para **o chat dizer "Sucesso crítico" na checagem que eu mais rolo, e não só nos ataques**.

**Contexto técnico**
- **É a metade que faltou da Sprint 3, e o eixo do épico para exatamente aqui.** O RV-154 entregou a CD por
  duas portas e nomeou, na própria entrega, quem consumiria a segunda: "o RV-155 (botão de dado das
  salvaguardas e da Percepção) e o RV-156 (ataques)". Só o RV-156 consumiu. Hoje o mestre diz "CD 18", o
  jogador clica em Reflexos, e o chat mostra o total **sem grau** — a mesa volta a comparar 28 com 18 de
  cabeça, que é o trabalho que este épico existe para tirar dela. Salvaguarda é a checagem mais rolada de uma
  sessão de PF2e (uma por magia de área, uma por perigo).
- **A canalização já existe e está testada; falta a interface.** `rolarDadosSchema` aceita
  `cd: number | null` ([jogo.ts](../../packages/shared/src/schemas/jogo.ts)); `useRolarDados`
  ([api.ts](../../apps/web/src/features/jogo/api.ts)) aceita `cd?: number | null` e **só põe a chave no corpo
  quando ela existe**, para que as rolagens que já existiam continuem mandando exatamente
  `{ expressao, motivo }`. A expressão e o motivo das defesas já vêm prontos de `defesasDoPersonagem`
  ([calculo.ts](../../packages/shared/src/sistemas/calculo.ts)) e das perícias de `expressaoDePericia` — **a
  tela não faz aritmética nenhuma**, e não deve passar a fazer.
- **O precedente a copiar é o campo de CA do alvo do RV-156**
  ([SecaoAtaques.tsx](../../apps/web/src/features/personagens/SecaoAtaques.tsx):216-237), com as três decisões
  que ele já tomou e que valem aqui: o campo é **efêmero** (a CD é da situação, não do personagem — gravá-la em
  `dados` guardaria na minha ficha um dado que é do mestre); a faixa vem de `CD_MINIMA`/`CD_MAXIMA` e é testada
  por `cdValida`; e **valor fora da faixa faz a rolagem sair sem CD, não 400** — quem digitou 200 não perde a
  jogada, só não vê o grau.
- **Decisão a tomar, com justificativa escrita:** onde mora o campo — **um por ficha** (a CD anunciada vale para
  o que o jogador vai rolar agora), **um por seção** (defesas e perícias com campos independentes) ou **um por
  linha**. Um por linha é o pior dos três: multiplica um campo que quase sempre tem o mesmo valor. Entre os
  outros dois, decida e escreva o porquê; se for um por ficha, ele precisa ficar visível de onde se rola, não no
  topo de uma página longa.
- **Armadilha F6 — o campo não pode existir onde a CD é recusada.** Numa mesa de D&D 5e a CD devolve 400
  nomeando o sistema (RV-154). Oferecer um campo de CD lá é prometer um grau que a API recusa. A existência do
  campo tem de derivar de `definicao.avaliarRolagem !== null`, **nunca** de `switch (sistema)` — proibido pelo
  DoD de todo card deste épico.
- **Armadilha F9 — a faixa escrita duas vezes.** Se o campo aparecer em três seções, a faixa e o texto de ajuda
  precisam sair de **um** componente (extraia o que hoje está inline em `SecaoAtaques.tsx`), senão a próxima
  mudança de faixa acerta duas telas e esquece a terceira.
- **Armadilha — somente leitura não é "sem botão de dado".** É a correção de escopo que o RV-155 recebeu e o
  RV-156 aplicou: na ficha de outro jogador os campos não são editáveis, e o dado **continua rolável**. O campo
  de CD é entrada de quem está rolando, então ele segue o dado, não a edição.
- **Fora de escopo, de propósito, e por que:** o mestre **sugerir** ou **anunciar** a CD para a mesa exige saber
  de quem é a vez e o que está acontecendo na cena — é combate ([RV-063](06-combate.md)) e não ficha. E a CD
  sugerida por nível/grau (`cdPorNivel`, `CDS_SIMPLES` do RV-151, que seguem **sem consumidor de produção**) é
  outra intenção de usuário: um card = uma intenção. Registre o handoff, não amplie.

**Escopo**
- [SecaoDefesas.tsx](../../apps/web/src/features/personagens/SecaoDefesas.tsx) e
  [SecaoPericias.tsx](../../apps/web/src/features/personagens/SecaoPericias.tsx) — o campo e a CD viajando na
  rolagem
- [SecaoAtaques.tsx](../../apps/web/src/features/personagens/SecaoAtaques.tsx) — extrair o campo de CD para um
  componente único, sem mudar o comportamento dele
- [FichaPersonagem.tsx](../../apps/web/src/features/personagens/FichaPersonagem.tsx) — repassa `cd` a
  `useRolarDados`, que já o aceita
- Nada em `apps/api` e nada de migration: o caminho do servidor está entregue e testado

**Critérios de aceite**
```gherkin
Cenário: Salvaguarda com a CD anunciada
  Dado Reflexos +6 na ficha e a CD 18 informada
  Quando eu clicar no dado de Reflexos
  Então é publicada "1d20+6" com o motivo "Reflexos — Seelah" e a CD 18
  E o chat exibe o grau de sucesso para todos, sem recarregar

Cenário: Percepção e perícia pelo mesmo caminho
  Dado a CD 20 informada
  Então clicar no dado de Percepção e no de Furtividade publica as duas com a CD
  E o componente não faz aritmética nenhuma

Cenário: Sem CD, comportamento de hoje
  Dado o campo de CD vazio
  Quando eu clicar no dado de Reflexos
  Então o corpo enviado é exatamente { expressao, motivo }, sem a chave "cd"
  E a mensagem sai sem selo de grau

Cenário: Sistema que não avalia não oferece o campo
  Dado uma ficha de mesa "dnd5e"
  Então nenhum campo de CD é renderizado na ficha
  E nada muda no comportamento dela

Cenário: Autorização
  Dado que estou vendo a ficha de outro jogador
  Então os campos da ficha continuam desabilitados
  E o dado da salvaguarda continua rolável, com a CD que eu informar
  E não-participante da mesa chamando a rota de rolagem recebe 403

Cenário: Borda — CD fora da faixa
  Quando eu digitar 0 ou 200 no campo de CD
  Então a rolagem sai sem CD, em vez de falhar
  E o limite exibido vem de CD_MINIMA/CD_MAXIMA, não de números no JSX
```

**Testes obrigatórios**
- Front: clicar na salvaguarda com CD informada chama o hook com **o corpo exato** (expressão, motivo e `cd`);
  com o campo vazio, o corpo **não tem** a chave `cd` — a asserção é de igualdade profunda, senão a chave
  sobrando passa.
- Front: ficha de mesa `dnd5e` sem campo de CD; ficha somente leitura com campos desabilitados **e** dado
  rolável.
- Front: valor fora da faixa produz rolagem sem CD (e não uma requisição que volta 400).
- Contrato: já coberto pelo RV-154 — **não** duplique o teste de rota; se precisou de rota nova, o card está
  errado.

**DoD específico**
- [ ] Zero aritmética de bônus no JSX: a expressão vem pronta do sistema.
- [ ] Um único componente de campo de CD no front, consumido pelas três seções.
- [ ] Nenhuma CD gravada em `personagens.dados`.
- [ ] Zero `switch (sistema)`: a presença do campo deriva de `avaliarRolagem !== null`.

---

### RV-162 — A ficha justifica o MAP manual com um fato que deixou de ser verdade

**Épico:** E15 · **Depende de:** RV-156 (✅), RV-062 (✅) · **Tamanho:** P · **Onda:** 2

**História**
> Como **jogador de PF2e**, quero **que a ficha não me explique uma limitação com um motivo que a aba ao lado desmente**, para **confiar no que a plataforma diz sobre si mesma**.

**Contexto técnico**
- **Medido na verificação da v0.9.0.** O texto de ajuda da seção Ataques
  ([ataques.ts](../../packages/shared/src/sistemas/pathfinder2e/ataques.ts):562-563) diz ao usuário que a
  plataforma não conta os ataques dele **"porque ela ainda não sabe de quem é o turno"**. A segunda metade
  ficou falsa nesta sprint: `Combate` (RV-060) e `PassarTurno` (RV-062) existem, e o servidor entrega
  `CombateDTO.tokenIdDoTurno`.
- **Três lugares repetem a premissa falsa**, e é por isso que ela contamina quem chega depois: o texto exibido,
  o comentário no topo do mesmo arquivo (que diz que combate e turno "são da Sprint 4") e a mensagem da guarda
  em `ataques.test.ts`. A justificativa do próprio [RV-156](#rv-156--ataques-com-penalidade-de-ataques-múltiplos)
  também segue dizendo que "sem RV-060 e RV-062 o servidor não sabe de quem é o turno" — é a F11 da
  [taxonomia](../agentes/taxonomia-de-falhas.md) esperando acontecer: o próximo agente lê que o combate não
  existe.
- **Nenhum teste fixa a cláusula falsa** (a guarda cobra "não conta os seus ataques", que continua verdadeiro),
  então a correção do texto é de uma linha — **depois** de a decisão ser tomada.
- **A decisão que este card precisa tomar:** agora que o turno existe, o contador de MAP deve ser automático?
  O que foi medido na entrega do combate: (1) o contador por participante zerado a cada `proximoTurno` é
  barato, porque o agregado já tem o gatilho; (2) a associação `turno → ficha` já existe pelo caminho
  `tokenIdDoTurno → TokenDTO.personagemId`; (3) **a regra não é trivial** — em PF2e o MAP conta ações de
  ataque, e Golpe Duplo, ataques de oportunidade e reações fora do próprio turno também contam, então um
  contador ingênuo por turno erraria justamente nos casos em que o jogador mais precisaria de ajuda.
- **Recomendação registrada:** manter os três botões como verdade única e, se houver contador, ele **pré-seleciona**
  em vez de decidir — foi o que o RV-156 previu por escrito ("quando RV-062 existir, ele pode pré-selecionar o
  botão"). E a ausência de contador continua sendo verificada por duas varreduras em disco: se este card criar
  um, elas precisam ser reescritas no mesmo lote, não removidas.
- **Armadilha — não deixe a ficha ler o combate para calcular ataque.** A ficha é do contexto de personagens e
  o turno é do contexto de jogo; o vínculo é por id, e a ordem 1ª/2ª/3ª continua sendo escolha explícita de
  quem clica. Uma ficha que dependa de haver combate ativo passa a mentir fora do combate.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/ataques.ts` — o texto exibido e o comentário do topo
- `packages/shared/src/sistemas/pathfinder2e/ataques.test.ts` — a mensagem da guarda
- `docs/backlog/15-pathfinder2e.md` — a justificativa do RV-156, que descreve o combate como inexistente
- Se a decisão for pré-selecionar: `apps/web/src/features/personagens/` + o contador no agregado `Combate`

**Critérios de aceite**
```gherkin
Cenário: O texto diz a verdade
  Quando eu abrir a seção de ataques de uma ficha de PF2e
  Então a explicação sobre escolher a ordem do ataque não afirma que a plataforma desconhece o turno

Cenário: Fora do combate a ficha não muda
  Dado que não há combate ativo na mesa
  Então os três botões de acerto continuam disponíveis, com o MAP de cada ordem

Cenário: Borda — se houver pré-seleção
  Dado um combate ativo com o turno na minha peça e um ataque já rolado nesta rodada
  Então o botão sugerido é o do segundo ataque
  E eu continuo podendo escolher outro, e o valor rolado é o do botão que eu cliquei
```

**Testes obrigatórios**
- A guarda existente de "nenhum contador de MAP" continua verde, ou é reescrita com o experimento de vermelho
  registrado.
- Se houver contador: zerar a cada turno, e a reação fora do próprio turno **não** silenciar o botão manual.

**DoD específico**
- [ ] Nenhum texto de UI justifica uma limitação com um fato de estado do projeto — a justificativa é da regra
      do sistema, ou não existe.
