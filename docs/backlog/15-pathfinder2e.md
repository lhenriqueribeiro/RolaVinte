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

**RV-159 não está no diagrama de propósito:** é reparo de um defeito entregue pelo RV-153, não dependência de ninguém. Ele está na Sprint 3 por vizinhança de arquivo com o RV-155, e o épico fecha sem ele — mas a ficha mente até que ele feche.

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

**Épico:** E15 · **Depende de:** RV-151, RV-153 · **Tamanho:** M · **Onda:** 2

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
- **Decisão de extensão — hook na definição do sistema, não `if` no use case.** `DefinicaoSistema` (RV-091) ganha `avaliarRolagem?(resultado, cd)`. `RolarDados` busca a definição pelo `mesa.sistema` no registro e chama o hook **se existir**. Zero `switch`. É o ponto de extensão canônico de [04-design-patterns.md](../../.claude/rules/04-design-patterns.md).
- **Decisão — a avaliação é campo próprio, não invade `ResultadoRolagem`.** `motor-dados.ts` é agnóstico de sistema e continua assim. A avaliação vira `MensagemDTO.avaliacao` em [dtos.ts](../../packages/shared/src/tipos/dtos.ts), persistida em coluna nova `mensagens.avaliacao jsonb` (nullable) — migration necessária. Nada de aninhar dentro do `rolagem jsonb`, que é o espelho exato de `ResultadoRolagem`.
- **Decisão — o tipo `GrauSucesso` mora em `sistemas/pathfinder2e/regras.ts` e o DTO o referencia.** Hoje só o PF2e produz avaliação. Generalizar antes da segunda variação é ornamento (heurística de [04-design-patterns.md](../../.claude/rules/04-design-patterns.md)).
- **Decisão — sistema que não avalia recusa a CD.** Em mesa `generico`, `... cd 15` devolve **400 em PT-BR** ("Este sistema não avalia grau de sucesso"). Descartar em silêncio é F6.
- Sintaxe: sufixo `cd N` na expressão (`1d20+11 cd 18`). Se [RV-074 — registry de comandos de chat](07-chat.md) já estiver feito, entre como comando registrado; se não, o *parsing* fica em `rolarDadosSchema` ([jogo.ts](../../packages/shared/src/schemas/jogo.ts)). Nos dois casos, **fora** de `RolarDados`.
- **Armadilha F2 — órfão de contrato.** Campo novo no DTO sem consumidor no front é comentário. [cobertura-eventos-ws.test.ts](../../apps/web/src/features/jogo/cobertura-eventos-ws.test.ts) cobre *quais eventos* têm ouvinte, **não** o formato do payload — não conte com ele aqui.
- **Armadilha — histórico.** Mensagens gravadas antes deste card voltam com `avaliacao: null`. O chat trata isso como "sem CD informada", não como erro.

**Escopo**
- `packages/shared/src/sistemas/tipos.ts` — `DefinicaoSistema.avaliarRolagem?`
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` — implementa via `grauSucesso` + `d20NaturalDe`
- `packages/shared/src/tipos/dtos.ts` — `MensagemDTO.avaliacao: { cd, grau, d20Natural } | null`
- `apps/api/supabase/migrations/000X_avaliacao_mensagem.sql`
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

**Épico:** E15 · **Depende de:** RV-152 · **Tamanho:** M · **Onda:** 2

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

**Épico:** E15 · **Depende de:** RV-154, RV-155 · **Tamanho:** G · **Onda:** 2

**História**
> Como **jogador de PF2e**, quero **botões de ataque com −0 / −5 / −10 já aplicados**, para **não errar a conta do segundo golpe no meio do turno**.

**Contexto técnico**
- Regra (OGC): ação com o traço *ataque* usada mais de uma vez no mesmo turno sofre −5 no segundo e −10 no terceiro em diante; arma **ágil** troca por −4/−8. A penalidade é calculada **pela arma daquele ataque**, não pela anterior. Zera no fim do turno.
- **Decisão crítica — o MAP não é estado do servidor neste card.** Sem [RV-060 (agregado Combate) e RV-062 (controle de turno)](06-combate.md), o servidor não sabe de quem é o turno nem quando zerar o contador; um contador global seria estado compartilhado errado por construção. Aqui o MAP é **escolha explícita do jogador**: três botões rotulados ("1º ataque", "2º ataque −5", "3º ataque −10"). Quando RV-062 existir, ele pode **pré-selecionar** o botão; a ficha não muda.
- **Armadilha F6 — promessa da UI.** Não rotule nada como "automático". O texto do botão precisa dizer que a escolha é sua, porque é.
- **Decisão — crítico não dobra dano sozinho.** Acerto com sucesso crítico dobra o dano da arma. Este card **informa** ("Sucesso crítico — dano dobrado") e oferece a variante dobrada como botão rotulado; dobrar em silêncio esconde a regra de quem está aprendendo e vira discussão na mesa.
- Acerto e dano são **duas rolagens separadas**, como já é no RV-092.
- A CD/CA alvo do acerto usa o mesmo caminho do RV-154 (`cd N`), então o grau de sucesso já vem de graça.

**Escopo**
- `packages/shared/src/sistemas/pathfinder2e/regras.ts` — `penalidadeAtaquesMultiplos(ordem: 1 | 2 | 3, agil: boolean): number | null`
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` — seção de ataques: `{ nome, bonusAcerto, dano, agil }[]`
- [FichaPersonagem.tsx](../../apps/web/src/features/personagens/FichaPersonagem.tsx) — três botões de acerto + botão de dano por ataque

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

**Épico:** E15 · **Depende de:** RV-061, RV-155 · **Tamanho:** M · **Onda:** 3

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
- **Armadilha — empate silencioso é bug de mesa.** Decisão a implementar e a escrever na UI: em empate, personagem de jogador vem antes de NPC; entre iguais, vale a ordem de entrada no combate. A ordem tem que ser **estável** entre recarregamentos, não depender de ordenação instável.
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
  Então o personagem de jogador vem antes do NPC
  E entre dois iguais vale a ordem de entrada
  E a ordem é idêntica depois de recarregar a página

Cenário: Borda — participante sem ficha PF2e
  Dado um NPC sem ficha do sistema
  Então o mestre informa a iniciativa dele na mão
  E o combate começa normalmente
```

**Testes obrigatórios**
- Unitário puro da ordenação: empates entre jogador/NPC, empates entre iguais, estabilidade da ordem em duas execuções.
- Use case com fakes: iniciativa derivada da ficha PF2e; mesa de outro sistema mantém o comportamento do RV-061.
- Contrato: iniciar combate como jogador → 403.

**DoD específico**
- [ ] Zero `switch (sistema)` no caso de uso de combate.
- [ ] A regra de desempate está escrita na UI, não só no código.

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
