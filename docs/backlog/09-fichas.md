# E09 — Fichas e sistemas de RPG

A ficha atual tem 6 atributos, PV e anotações — genérica por design. Este épico a torna útil de verdade sem transformar o domínio num `if` gigante por sistema.

---

### RV-098 — Atributo não pode ter duas verdades na mesma ficha

**Épico:** E09 · **Depende de:** RV-152 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído (v0.8.0)

> **Decisão tomada na entrega: a saída 2 — a definição declara a escala.**
> O atributo continua na coluna comum `personagens.atributos`, que passa a ser a **única** casa dele em
> todo sistema, e o que vira dado da definição é a **escala**: `DefinicaoSistema.atributos:
> EscalaDeAtributo` (`descricao`, `minimo`, `maximo`, `padrao`, `modificador(valor)`). D&D 5e, Tormenta
> 20, Ordem Paranormal e genérico declaram `ESCALA_D20_CLASSICA` (1..30, bônus por `(valor − 10) / 2`);
> PF2e declara `ESCALA_ATRIBUTO_PF2E` (−5..+8, `modificador` é a identidade). O `dados` da ficha de PF2e
> **não guarda mais modificador nenhum**.
>
> **Por que não a saída 1 (atributo vira do sistema, sai da coluna comum).** É a mais correta no papel e a
> mais caroa na prática: exigiria mover o atributo de **todo personagem já gravado** para `dados`,
> reescrever `PersonagemDTO`, `FichaCalculavel`, o agregado, o mapper e as fixtures de meia dúzia de
> suítes — tudo isso onde a armadilha nº 1 do card manda ter mais cuidado ("D&D 5e não pode regredir") e
> sem ganho nenhum para o jogador. Atributo é um conceito que **todo** sistema tem; o que varia é a
> escala, e escala cabe num dado.
>
> **Por que não a saída 3 (a definição declara quais campos comuns usa, e PF2e ignora `atributos`).**
> Ela conserta a metade errada: manteria o campo exigido-e-ignorado, só com uma justificativa por escrito.
> E contradiz o primeiro cenário de aceite deste card — "informei os atributos, a ficha exibe exatamente o
> que informei". Ignorar não é uma verdade só, é continuar com duas e escolher a outra.
>
> **`usaAtributosComuns` morreu, e isso corrige um cenário do [RV-152](15-pathfinder2e.md) (F11).** O
> booleano era a pergunta errada — "as colunas comuns valem neste sistema?" —, e enquanto ele existia a
> ficha de PF2e **escondia** os seis atributos, porque o número certo estava na outra casa. Com a escala
> declarada, o bloco comum desenha a faixa do sistema, o botão de dado rola
> `definicao.atributos.modificador(...)` (o +4 gravado, não o `+0` que o RV-152 temia) e o cenário "o botão
> genérico de atributo não aparece" daquele card **deixou de valer** — a razão de ele existir era o número
> errado, não o botão.
>
> **Escala é cobrada no agregado, não no schema HTTP.** `atributosSchema` passou a validar só a forma (seis
> inteiros) e `criarPersonagemSchema.atributos` ficou **opcional, sem padrão** — um `10` fixo ali é o
> padrão de um sistema só, e numa mesa de PF2e significaria "+10 em tudo", 400 em toda criação. Quem valida
> é `validarAtributosDoSistema(sistema, atributos)` (irmão de `validarDadosDaFicha`), chamado por
> `Personagem.criar` e `Personagem.atualizar`; omitido, o agregado usa `atributosIniciais(sistema)`. A
> mensagem sai em PT-BR com atributo, valor e faixa: *"Atributos de Pathfinder 2e: Força 18 está fora da
> escala do sistema (modificador direto, de -5 a +8)."*
>
> **Migration `0009_consolidar_atributos_pathfinder2e.sql`**, só para mesas de PF2e (D&D não é tocado —
> nem uma linha). Consolida atributo por atributo: modificador gravado em `dados` diferente de zero manda;
> senão converte o valor da coluna comum pela fórmula do d20, limitado à escala (o Força 18 do defeito vira
> +4, que é o que aquele 18 sempre significou); senão 0. Nenhuma das duas metades é descartada em silêncio.
> O `where` também exige uma das seis chaves antigas, para que uma reaplicação não converta de novo o que
> já foi consolidado. ~~**Medido em 2026-08-10: `0001`–`0008` aplicadas no Supabase real, buckets
> provisionados, e a `0009` é a única pendente**~~ — **a `0009` foi aplicada na verificação independente
> desta sprint** (`npm run supabase:migrar -w @rolavinte/api`), e o efeito foi conferido linha a linha no
> banco em uso: o único personagem de PF2e existente (`Valeros`) tinha `atributos` = 18/14/16/10/12/10 **e**
> os seis `modificador*` = 0 em `dados` — as duas verdades convivendo, exatamente como o card descreve — e
> passou a ter `atributos` = +4/+2/+3/+0/+1/+0 com as seis chaves removidas de `dados`. O personagem de D&D
> 5e (`Yume`) ficou **idêntico**, como o `where m.sistema = 'pathfinder2e'` promete. A falha ruidosa que este
> bloco descrevia (ficha antiga recusando salvamento com 400 de escala) **não existe mais**, e nunca chegou
> a nenhum usuário.
>
> **O cenário "uma verdade só" foi verificado no banco, não no fake.** Criando um personagem de PF2e com
> `{forca:4, destreza:2, …}` pela API em execução: a criação devolveu os mesmos números, a listagem releu os
> mesmos números e a linha do Postgres tem **zero** chaves `modificador*` em `dados` (contadas por
> `jsonb_object_keys`). Em D&D 5e, 18/14/16/10/12/8 voltaram idênticos na escala 1..30, com `dados` guardando
> só o que é do sistema. O teste que o card pedia — criar informando e **reler pela listagem** — existe e é
> de verdade: [rotas-personagens-atributos.test.ts](../../apps/api/src/apresentacao/http/rotas-personagens-atributos.test.ts),
> 9 casos de contrato nos dois sistemas.
>
> **Uma consequência de fronteira ficou aberta e é a única coisa deste card que merece atenção futura:** com
> a faixa fora do `atributosSchema`, quem valida é o agregado, e hoje os três caminhos de escrita
> (`POST /mesas/:id/personagens`, `PATCH /personagens/:id`, `duplicar`) passam por ele. Um caso de uso novo
> que grave `atributos` sem atravessar `Personagem.criar`/`atualizar` não teria faixa nenhuma no caminho e
> nada acusaria — a defesa mais forte seria um `check` em `personagens.atributos`, que não é escrevível sem
> saber o sistema da linha (o sistema é da `Mesa`). Não virou card: não há caminho de escrita novo previsto,
> e um card para um risco sem consequência descritível hoje seria backlog inflado.
>
> **A varredura dos outros campos comuns (DoD) virou teste, não parágrafo.** `nome`, `classe`, `nivel`,
> `pvAtual`, `pvMax` e `anotacoes` **não** tinham segunda casa: nenhum `schemaFicha` os declara, e os dois
> que participam de conta — `nivel` (proficiência) e `pvMax`/`pvAtual` (barra de vida sobre o token) — têm
> significado e escala idênticos em todo sistema, ao contrário do atributo. Diferente do atributo, também,
> é que ninguém tentou duplicá-los: o RV-152 recusou explicitamente repetir `classe`/`nivel` em `dados`, e
> o RV-155 já traz escrito que não haverá segundo campo de PV. Para a resposta não depender de memória,
> `registro.test.ts` agora reprova **qualquer** sistema que declare em `dados` (ou numa seção) um campo com
> o nome de coluna comum — as seis colunas mais as formas derivadas do atributo.

**História**
> Como **jogador de Pathfinder**, quero **que os atributos que eu preencho sejam os que a ficha usa**, para **não digitar Força 18 e ver a perícia calcular como se fosse 0**.

**Contexto técnico**
- Encontrado por verificação manual no navegador contra o banco real, em 2026-08-10, **com os 1.167 testes verdes**. Cada metade é testada isoladamente, e nenhuma exercitava as duas juntas.
- Estado de um personagem de Pathfinder recém-criado pela API, lido direto do Postgres:

  ```
  coluna atributos : {"forca":18,"destreza":14,"constituicao":16,...}   ← ignorada pela ficha
  dados            : {"modificadorForca":0,"modificadorDestreza":0,...} ← o que a ficha lê
  ```

- A causa é uma premissa do [RV-091](#rv-091--strategy-de-sistema-de-ficha) que não se sustentou: as colunas comuns seriam "iguais em todo sistema". **Atributo é justamente o que não é.** D&D 5e usa valor de 1 a 30 e deriva o modificador; Pathfinder 2e (pós-remaster) usa o **modificador direto**, de −5 a +8. São escalas diferentes para o mesmo conceito.
- Consequência hoje: `criarPersonagemSchema` **exige** `atributos`, o banco persiste, a ficha de PF2e não mostra e nada usa. Quem preenche na criação vê o valor desaparecer sem aviso.
- **Não é bug de um sistema, é da fronteira.** Qualquer sistema futuro com escala própria de atributo cai no mesmo buraco.

**Escopo**
- `packages/shared/src/sistemas/tipos.ts` — decidir de quem é o atributo: da definição do sistema ou da coluna comum
- `packages/shared/src/schemas/personagens.ts` — `atributos` deixa de ser obrigatório na criação, ou a definição declara como interpretá-lo
- `packages/shared/src/sistemas/pathfinder2e/definicao.ts` e `dnd5e.ts`
- `apps/api/src/dominio/personagens/personagem.ts` e a migration de consolidação, se houver
- `apps/web/src/features/personagens/FichaPersonagem.tsx`

**Decisão a tomar, com justificativa escrita** *(tomada: saída 2 — ver o bloco no início do card)*

Três saídas, e o card **não** determina qual — quem executa escolhe e registra o porquê:

1. **O atributo passa a ser do sistema.** A coluna comum sai da ficha, cada definição declara os seus. Mais correto conceitualmente; exige migration de consolidação e mexe no D&D.
2. **A definição declara a escala.** A coluna comum fica, e a definição diz se o número é valor ou modificador. Menos migration; mantém uma coluna que alguns sistemas interpretam de um jeito e outros de outro.
3. **A definição declara quais campos comuns usa.** `atributos` fica opcional e a ficha de PF2e o ignora explicitamente, com o schema de criação deixando de exigi-lo.

O que **não** é aceitável é o estado atual: exigir, guardar e ignorar.

**Critérios de aceite**
```gherkin
Cenário: O que eu preencho é o que a ficha usa
  Dado uma mesa de Pathfinder 2e
  Quando eu criar um personagem informando os atributos
  Então a ficha exibe exatamente os valores que eu informei
  E o bônus de perícia é calculado a partir deles

Cenário: Uma verdade só
  Quando eu ler a linha do personagem no banco
  Então o atributo aparece em um único lugar, não em dois

Cenário: D&D 5e não regride
  Dado uma mesa de D&D 5e com personagem existente
  Então a ficha continua exibindo e calculando como antes, sem perda de dado

Cenário: Borda — escala respeitada
  Dado uma mesa de Pathfinder 2e
  Quando eu informar 18 num atributo
  Então recebo 400, porque a escala do sistema vai de -5 a +8
```

**Testes obrigatórios**
- Contrato: criar personagem em mesa de PF2e e **ler de volta** conferindo que o valor informado é o que sai — o teste que faltava, exercitando as duas metades juntas.
- Domínio: valor fora da escala do sistema é recusado.
- Migração: personagem de D&D 5e gravado antes deste card continua legível e calculando igual.

**DoD específico**
- [ ] Nenhum campo é exigido na criação e ignorado na leitura.
- [ ] A varredura por "duas fontes de verdade do mesmo conceito" foi feita nos outros campos comuns (PV e nível também são iguais em todo sistema?), com o resultado registrado.

---

### RV-091 — Strategy de sistema de ficha

**Épico:** E09 · **Depende de:** — · **Tamanho:** G · **Onda:** 2 · **Faça este primeiro do épico** · **Status:** ✅ Concluído

> **Decisões tomadas na entrega (v0.6.0).** O registro vive em
> [packages/shared/src/sistemas/registro.ts](../../packages/shared/src/sistemas/registro.ts) e é o
> **único ponto do repositório autorizado a associar chave de sistema a comportamento** — a varredura
> por `switch (sistema)` foi feita pelo verificador e só sobrou o que está listado abaixo. A ficha tem
> duas metades: as **colunas comuns** (nome, classe, nível, PV, os seis atributos, anotações), que
> continuam JSX fixo porque são iguais em todo sistema, e `personagens.dados` (jsonb, migration
> [0007](../../apps/api/supabase/migrations/0007_fichas_por_sistema.sql)), validado pelo `schemaFicha`
> do sistema **da mesa**. Colocar as colunas comuns no registro obrigaria os quatro sistemas a
> redeclarar a mesma coisa.
> **O `Personagem` não guarda o sistema** — quem tem `sistema` é a `Mesa`, e todo método do agregado
> que valida `dados` o recebe por parâmetro. A alternativa (coluna `personagens.sistema`) deixaria a
> ficha imune à troca de sistema da mesa, ao custo de uma segunda verdade permanente. O efeito
> colateral dessa escolha virou card: [RV-097](#rv-097--trocar-o-sistema-da-mesa-não-pode-deixar-ficha-gravada-impossível-de-salvar).
> `PersonagemDTO` ganhou `sistema` e `dados` como campos **obrigatórios**, o primeiro derivado na
> leitura (`ListarPersonagens` completa com a mesa que já carregou para autorizar — zero query a mais).
> **`dados` substitui a ficha inteira no PATCH, não faz merge:** PATCH parcial de jsonb aninhado é
> ambíguo (como se apaga uma chave?). Para mudar um campo, mande `{ ...personagem.dados, ca: 18 }`. A
> ficha do front inicializa o estado local com `personagem.dados` **completo**, de propósito — montar
> o payload só com os campos visíveis apagaria em silêncio o que a definição guarda fora das seções,
> como o mapa `dados.pericias` do D&D.
> **Ficha genérica é `z.object({}).strict()`**, então toda linha antiga (que a migration cria com
> `'{}'`) já é válida. Isso está provado **no mapper**
> ([personagem.mapper.test.ts](../../apps/api/src/infra/supabase/personagem.mapper.test.ts)) e não no
> fake, que regrava o agregado inteiro e jamais veria uma linha sem a coluna nova (F3).
> **Tormenta 20 e Ordem Paranormal reusam a ficha genérica** via `definicaoGenericaPara(...)`: estão no
> enum desde o início, não têm card de ficha própria, e deixá-los sem definição quebraria o registro —
> que é exatamente o ponto. Trocar cada um por uma definição real é uma linha.
> **O DoD "zero `switch (sistema)`" foi medido, e duas violações foram corrigidas na verificação:**
> `NOME_SISTEMA` no front (um segundo mapa chave→rótulo que **já divergia** — "Tormenta20" no painel,
> "Tormenta 20" na ficha) virou `nomeDoSistema()` delegando ao registro, e o `1d20` fixo do teste de
> atributo passou a vir de `definicao.dadoDeTeste`. Sobrou **uma** associação fora do registro, e ela
> não é TypeScript: o `check (sistema in (...))` da
> [0001](../../apps/api/supabase/migrations/0001_esquema_inicial.sql) — é o
> [RV-096](#rv-096--amarrar-o-check-de-mesassistema-ao-sistemas_rpg).
> **⚠️ A migration 0007 não foi aplicada em ambiente nenhum**, e `dados` entra na lista `COLUNAS` de
> **todo** select de personagem: num banco sem ela, a aba de personagens de qualquer mesa quebra, não
> só a ficha nova. Ver [RV-139](13-operacao.md).

**História**
> Como **mantenedor**, quero **que cada sistema de RPG defina seu próprio esquema de ficha**, para **adicionar Tormenta20 sem tocar no código do D&D**.

**Contexto técnico**
- `SISTEMAS_RPG` já existe em [mesas.ts](../../packages/shared/src/schemas/mesas.ts). A ficha ainda é única e fixa.
- Modelo: `Personagem` guarda `atributos` (comum) + `dados: Record<string, unknown>` validado pelo schema do sistema. O registro de sistemas fica em `packages/shared`, consumido por api e web.

**Escopo**
- `packages/shared/src/sistemas/`: `tipos.ts` (`DefinicaoSistema` com `schemaFicha`, `secoes`, `rolagensPadrao`), `generico.ts`, `registro.ts` (`Map<SistemaRpg, DefinicaoSistema>`)
- Migration: `personagens.dados jsonb default '{}'`
- `Personagem.atualizarDados(dados)` validando pelo schema do sistema da mesa
- Front: `FichaPersonagem` renderiza as seções a partir da definição, não de JSX fixo por sistema

**Critérios de aceite**
```gherkin
Cenário: Ficha genérica preservada
  Dado uma mesa com sistema "generico"
  Então a ficha atual continua funcionando igual, sem perda de dados

Cenário: Campo fora do schema é rejeitado
  Dado uma mesa "dnd5e"
  Quando eu enviar um campo que não existe na definição do sistema
  Então recebo 400

Cenário: Novo sistema entra por adição
  Quando eu adicionar a definição de um sistema novo ao registro
  Então a ficha renderiza sem alterar componentes existentes
```

**Testes obrigatórios**
- Contrato do registro: toda entrada de `SISTEMAS_RPG` tem definição correspondente (teste que quebra ao adicionar sistema sem ficha).
- Migração de dados: personagem existente continua legível após o card.

**DoD específico**
- [ ] Zero `switch (sistema)` fora do registro.

---

### RV-090 — Perícias e proficiência

**Épico:** E09 · **Depende de:** RV-091 · **Tamanho:** M · **Onda:** 2 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega (v0.6.0).** `bonusPericia`, `expressaoDePericia`, `grauDePericia`,
> `definirGrauDePericia`, `motivoDeRolagemDePericia`, `formatarBonus` e `periciasDoSistema` são funções
> puras em [sistemas/calculo.ts](../../packages/shared/src/sistemas/calculo.ts) que **delegam ao
> registro** — nenhuma delas sabe o nome de um sistema. Todas aceitam `{ sistema, nivel, atributos,
> dados }`, que o `PersonagemDTO` já satisfaz, e devolvem **`null`** para perícia inexistente (nunca
> zero, que produziria uma rolagem falsamente legítima).
> **O grau de proficiência não se escreve na mão:** use `definicao.grauDePericia(...)` e
> `definicao.definirGrauDePericia(...)`. Onde o grau mora dentro de `dados` é decisão do sistema, e o
> PF2e vai guardá-lo de outro jeito ([RV-153](15-pathfinder2e.md)).
> **D&D 5e recebeu o conteúdo mínimo para o card ser demonstrável:** as 18 perícias, os três graus
> (não proficiente · proficiente · especialista) e o bônus de proficiência por nível. O restante da
> ficha é [RV-092](#rv-092--ficha-completa-de-dd-5e), que só estende `dnd5e.ts`.
> **O bônus é recalculado a partir do que está na tela, não do que está gravado** — trocar o grau ou o
> nível muda o número antes de salvar, que é o contrato que o teste de atributo já tinha. O **motivo**
> da rolagem, ao contrário, usa o `nome` persistido: o chat identifica o personagem como os outros o
> conhecem, não como quem está editando acabou de renomeá-lo sem salvar.
> **Nenhuma rota nova para rolar perícia.** `expressaoDePericia` + `motivoDeRolagemDePericia` alimentam
> `POST /mesas/:mesaId/rolagens` e `/chat`, que já existem; uma rota específica duplicaria a
> autorização. Mesa encerrada trava a rolagem de perícia com o motivo no `title` (RV-027 não regrediu).
> **O `dadoDeTeste` é do sistema**, não `1d20` fixo: um sistema não-d20 rolaria dados diferentes nas
> duas metades da mesma ficha (corrigido na verificação, com teste por definição do registro).

**História**
> Como **jogador**, quero **minhas perícias na ficha com um clique para testar**, para **rolar Furtividade sem calcular o bônus toda vez**.

**Escopo**
- Definição de perícias por sistema (atributo-base + proficiência) em `packages/shared/src/sistemas/`
- `packages/shared/src/sistemas/calculo.ts`: `bonusPericia(personagem, pericia)` — função pura
- `FichaPersonagem`: seção de perícias com marcador de proficiência e botão de rolagem

**Critérios de aceite**
```gherkin
Cenário: Bônus calculado
  Dado destreza 16 (+3), proficiência +2 e "Furtividade" proficiente
  Então a ficha exibe Furtividade +5

Cenário: Rolar perícia
  Quando eu clicar no dado de Furtividade
  Então uma rolagem "1d20+5" é publicada com o motivo "Furtividade — <personagem>"

Cenário: Sem proficiência
  Dado que não sou proficiente em Furtividade
  Então o bônus é apenas o modificador de destreza
```

**Testes obrigatórios**
- Unitário puro de `bonusPericia` com tabela: atributo par/ímpar, proficiente/não, nível 1 e 20.

---

### RV-092 — Ficha completa de D&D 5e

**Épico:** E09 · **Depende de:** RV-090 · **Tamanho:** G · **Onda:** 2

**História**
> Como **jogador de D&D 5e**, quero **CA, deslocamento, salvaguardas, ataques e espaços de magia na ficha**, para **jogar sem alternar para o PDF**.

**Contexto técnico** *(acrescentado na curadoria da v0.6.0)*
- [dnd5e.ts](../../packages/shared/src/sistemas/dnd5e.ts) já existe e traz o mínimo que o RV-090 exigia:
  18 perícias, três graus e a seção "Combate" (`ca`, `deslocamento`, `inspiracao`). **Este card estende
  esse arquivo e nada mais** — o registro, a validação e a renderização por seções já estão prontos.
- **As abas que o Escopo pede já têm estrutura:** `DefinicaoSistema.secoes` é uma lista ordenada com
  `chave` e `titulo`, então "virar abas" é agrupar por seção, sem contrato novo e sem tocar em
  `packages/shared`. O que **não** existe é a distinção entre "seção que sempre aparece" e "seção que
  vira aba"; se este card quiser as duas coisas, aí sim entra um campo no contrato. A ficha com D&D
  ligado já é longa (metade comum + Combate + 18 perícias + anotações numa coluna só), então a decisão
  é deste card e não do próximo.
- **`rolagensPadrao` é hoje um contrato com produtor e sem consumidor** (F2): toda definição o declara
  — "Iniciativa" em `dnd5e.ts` e `generico.ts` — e só o `registro.test.ts` o percorre. Os consumidores
  previstos são este card e [RV-158](15-pathfinder2e.md#rv-158--iniciativa-por-percepção-no-combate-de-pf2e).
  Se este card **não** for renderizar as rolagens padrão, remova o campo do contrato em vez de deixá-lo
  obrigando todo sistema novo a preencher algo que ninguém lê.

**Escopo**
- `packages/shared/src/sistemas/dnd5e.ts`: schema Zod completo + seções + rolagens padrão
- Front: abas da ficha (Principal · Combate · Magias · Notas)
- Ataques com botão de rolagem de acerto e de dano

**Critérios de aceite**
```gherkin
Cenário: Bônus de proficiência por nível
  Dado um personagem de nível 5
  Então o bônus de proficiência exibido é +3

Cenário: Ataque em duas rolagens
  Dado o ataque "Espada longa" com +7 de acerto e 1d8+4 de dano
  Quando eu clicar em acerto e depois em dano
  Então duas rolagens distintas aparecem no chat, identificadas pelo nome do ataque

Cenário: Espaços de magia
  Quando eu gastar um espaço de 1º círculo
  Então o contador diminui e é persistido
  E não é possível gastar abaixo de zero

Cenário: Salvaguarda
  Quando eu rolar a salvaguarda de Destreza
  Então o bônus considera proficiência quando marcada
```

**Testes obrigatórios**
- Unitário do cálculo de proficiência por nível (1–20).
- Domínio: espaços de magia não ficam negativos nem acima do máximo.

---

### RV-093 — Excluir e duplicar personagem

**Épico:** E09 · **Depende de:** — · **Tamanho:** P · **Onda:** 2 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega (v0.6.0).** `DELETE /api/personagens/:personagemId` devolve **204 sem
> corpo** (não há representação do que deixou de existir; devolver o DTO apagado convidaria a interface
> a renderizá-lo) e `POST /api/personagens/:personagemId/duplicar` devolve **201 com `PersonagemDTO`**,
> sem corpo de requisição. **Mande `{}` como payload** ao chamar a duplicação pelo cliente do front
> enquanto o [RV-029](02-mesas.md#rv-029--corrigir-post-sem-corpo-no-cliente-http-do-front) estiver
> aberto — sem isso o botão falha no navegador como "Sair da mesa" falha hoje.
> **A cópia pertence ao dono do original, não a quem clicou.** Quando o mestre duplica a ficha de um
> jogador, passar a posse ao mestre tiraria do jogador, em silêncio, o acesso de escrita ao que é dele.
> Nome longo é **encurtado** para caber em 60 caracteres com o sufixo `" (cópia)"`, não recusado:
> falhar puniria o usuário por algo que ele não causou e não consegue evitar. Duplicar **não** pede
> confirmação (não é destrutivo e desfaz-se excluindo a cópia); confirmar tudo é o caminho para
> ninguém ler confirmação nenhuma.
> **As guardas foram reusadas, não recriadas** (F5): `Personagem.autorizarEscrita` (dono ou mestre,
> a mesma da edição) e `Mesa.autorizarEscritaDeParticipante` (participação + mesa encerrada juntas).
> Mesa encerrada devolve **409** nas duas operações. Excluir e duplicar ficam na **lista**, não dentro
> da ficha: a ficha já é um modal, e botão dentro de botão é HTML inválido.
> **⚠️ O cenário "a ficha some da lista para todos" vale apenas depois de recarregar.** Não existe
> evento de tempo real de personagem criado/removido, e criá-lo exige os quatro passos do RV-115 de uma
> vez. O diálogo de confirmação **diz isso ao usuário** ("só verá a ficha sumir ao recarregar a
> página"), com teste fixando a frase — não é promessa falsa, é escopo faltando, e virou
> [RV-117](11-tempo-real.md#rv-117--personagem-criado-e-removido-em-tempo-real). **Quando o evento
> chegar, esse texto muda junto.**
> **O token sobrevive desvinculado**, como o card previa (`on delete set null` da 0001), e a barra de
> vida some porque é derivada do `PersonagemDTO`, nunca do token — provado por contrato. O que **não**
> está provado é a nulificação da coluna em Postgres real: o `FakeCenaRepository` não emula a FK e
> mantém o `personagemId` morto. Cai no [RV-136](13-operacao.md).

**História**
> Como **jogador**, quero **apagar um personagem aposentado e duplicar um pronto**, para **gerenciar minhas fichas e criar variações de NPC rapidamente**.

**Escopo**
- `apps/api/src/aplicacao/personagens/remover-personagem.ts`, `duplicar-personagem.ts`
- `DELETE /personagens/:personagemId`, `POST /personagens/:personagemId/duplicar`
- Tokens vinculados: `tokens.personagem_id` já é `on delete set null` — o token permanece, desvinculado

**Critérios de aceite**
```gherkin
Cenário: Excluir com confirmação
  Quando eu excluir "Thorin" e confirmar
  Então a ficha some da lista para todos
  E os tokens que o referenciavam continuam no mapa, sem vínculo e sem barra de vida

Cenário: Autorização
  Dado que sou jogador
  Quando eu tentar excluir o personagem de outro jogador
  Então recebo 403 — o mestre pode excluir qualquer um da mesa

Cenário: Duplicar
  Quando eu duplicar "Goblin"
  Então é criada "Goblin (cópia)" com os mesmos dados, PV cheio e id novo
```

---

### RV-094 — Inventário e equipamento

**Épico:** E09 · **Depende de:** RV-091 · **Tamanho:** M · **Onda:** 3

**História**
> Como **jogador**, quero **registrar itens, peso e moedas**, para **controlar carga e recursos**.

**Escopo**
- Item no `dados` da ficha (não tabela nova): `{ id, nome, quantidade, peso, descricao, equipado }`
- `packages/shared/src/sistemas/calculo.ts`: `cargaTotal(itens)` e `limiteCarga(forca)`
- Front: seção de inventário com adicionar/remover/editar em lote

**Critérios de aceite**
```gherkin
Cenário: Carga somada
  Dado 3 itens de 2 kg cada e 1 de 4 kg
  Então a carga total exibida é 10 kg

Cenário: Sobrecarga sinalizada
  Dado força 10 (limite 50 kg) e carga 60 kg
  Então a ficha sinaliza sobrecarga com texto, não apenas com cor

Cenário: Quantidade inválida
  Quando eu informar quantidade negativa
  Então recebo erro de validação e o item não é salvo
```

---

### RV-095 — Bestiário do mestre

**Épico:** E09 · **Depende de:** RV-093 · **Tamanho:** M · **Onda:** 3

**História**
> Como **mestre**, quero **fichas de NPC reutilizáveis**, para **jogar 6 goblins sem criar 6 fichas na mão**.

**Escopo**
- Migration: `personagens.tipo text check (tipo in ('jogador','npc')) default 'jogador'`
- NPC pertence ao mestre; visível na lista só para ele
- "Instanciar N cópias" cria N fichas + N tokens numerados na cena ativa

**Critérios de aceite**
```gherkin
Cenário: NPC oculto dos jogadores
  Dado um NPC "Goblin" na mesa
  Quando um jogador listar os personagens
  Então o NPC não aparece na resposta da API

Cenário: Instanciar em lote
  Quando eu instanciar 6 cópias de "Goblin"
  Então são criadas as fichas "Goblin 1" a "Goblin 6" com tokens na cena ativa
  E cada uma tem PV independente

Cenário: Limite de lote
  Quando eu pedir 100 cópias
  Então recebo 400 informando o limite (20)
```

**Testes obrigatórios**
- Use case: payload de `ListarPersonagens` para jogador não contém NPCs.
- Atomicidade: falha no meio do lote não deixa fichas órfãs sem token nem tokens sem ficha.

---

### RV-096 — Amarrar o CHECK de `mesas.sistema` ao `SISTEMAS_RPG`

**Épico:** E09 · **Depende de:** RV-091 · **Tamanho:** P · **Onda:** 2 · **Card protetor: faça antes de [RV-152](15-pathfinder2e.md#rv-152--ficha-de-pathfinder-2e-sobre-a-strategy-de-sistema)** · **Status:** ✅ Concluído (v0.7.0)

> **Decisões tomadas na entrega.** A extração é **parsing de SQL**, e não a lista TypeScript
> compartilhada que o card autorizava como alternativa: migration é arquivo estático e imutável, então
> um gerador só poderia produzir a *próxima* — a comparação com o disco continuaria necessária de
> qualquer jeito. O regex ganhou três defesas contra a fragilidade que a Armadilha 2 temia, e cada uma
> tem teste próprio sobre SQL sintético: comentários removidos por um scanner que **respeita literais
> de string** (sem isso a própria prosa da `0008` seria lida como declaração — F1 na veia), eventos de
> `check`/`drop constraint` registrados **em ordem** (remoção sem recriação devolve "sem restrição", não
> a lista antiga) e o SQL sugerido na mensagem de falha é relido pela própria extração, para não mandar
> quem lê para um segundo vermelho.
> **A extração vive em [check-de-sistemas.ts](../../apps/api/src/testes/check-de-sistemas.ts), separada
> do teste** — extrator exportado de um `.test.ts` não seria testável com SQL sintético.
> **Limites conhecidos, escritos no cabeçalho do arquivo:** casa `sistema in (...)` sem amarrar à tabela
> `mesas` (hoje só ela tem a coluna); remoção do constraint por um nome que não mencione `sistema` passa
> despercebida; e restrição escrita como `= any(array[...])` ou enum nativo seria reportada como
> "nenhuma restrição vigente". Os três falham **ruidosamente**, não em silêncio.
> **A `0008` já nasceu com `'pathfinder2e'`**, por instrução da sprint (evitar que dois agentes
> concorrentes disputassem número de migration). Isso exigiu uma lista de exceção de um item só,
> `SISTEMAS_ANTECIPADOS_NO_CHECK`, com um teste que fica vermelho no dia em que o valor entrar no enum.
> **A reserva venceu e foi apagada na mesma sprint**, pelo agente do RV-152 — a guarda é estritamente
> bidirecional hoje, e o DoD "nenhuma lista de sistemas fora de `SISTEMAS_RPG` e do SQL" está cumprido.
> **Prova de que a guarda reprova, medida duas vezes** (implementação e verificação independente): valor
> só no enum → vermelho nomeando o sistema, o arquivo do `check` vigente e o SQL pronto da `0009`; valor
> só no SQL → vermelho nomeando o valor órfão. Nenhum dos dois é F1.
> **A fila de migrations não aplicadas passou de três para quatro** — a `0008` é agora **pré-requisito
> de funcionamento**, não precaução: desde o RV-152 o dashboard oferece "Pathfinder 2e" e o `INSERT`
> falha sem ela. Os documentos que listavam nominalmente `0005`–`0007` foram corrigidos nesta curadoria.

**História**
> Como **mantenedor**, quero **que acrescentar um sistema de RPG sem a migration correspondente derrube a suíte**, para **não descobrir o CHECK desatualizado quando um mestre criar a primeira mesa do sistema novo**.

**Contexto técnico**
- O RV-091 fechou o lado do TypeScript: sistema declarado em `SISTEMAS_RPG`
  ([mesas.ts](../../packages/shared/src/schemas/mesas.ts)) sem entrada no registro derruba
  `npm run check` (`TS2741`, nomeando a chave) **e** `npm run test` (`registro.test.ts`, nomeando o
  sistema). Medido nas duas entregas, com `'vampiro5e'` e com `'call-of-cthulhu'`.
- **Sobrou exatamente uma lista fora dessa amarra, e é a única que falha em runtime:**
  `check (sistema in ('dnd5e','tormenta20','ordem-paranormal','generico'))` na
  [0001_esquema_inicial.sql](../../apps/api/supabase/migrations/0001_esquema_inicial.sql):18.
  Acrescentar um sistema só no TypeScript **compila, passa no lint e passa em toda a suíte** — que roda
  com fakes — e estoura no primeiro `INSERT` contra o Postgres real. Classe **F10 — configuração que
  nunca foi exercitada** ([taxonomia](../agentes/taxonomia-de-falhas.md)).
- **Por que agora:** [RV-152](15-pathfinder2e.md) acrescenta `'pathfinder2e'` ao enum. A armadilha já
  está escrita naquele card, e é exatamente o tipo de aviso em prosa que este card veio substituir por
  uma linha de código — a mesma troca que o RV-150 fez com o licenciamento.
- **Isto não é o RV-009 nem o RV-139.** [RV-009](00-fundacao.md) (tipos gerados) pega **coluna
  inexistente**, não valor recusado por `check constraint`. [RV-139](13-operacao.md) confere se as
  migrations do repositório foram **aplicadas**, e a própria armadilha 1 daquele card registra que
  `select(...).limit(0)` **não** enxerga constraint. O buraco aqui é anterior aos dois: a migration
  que faltou nem chegou a ser escrita.
- **Decisão a tomar e registrar no diff:** o teste deve ler os arquivos de `supabase/migrations/*.sql`,
  extrair o conjunto de valores do `check` mais recente de `mesas.sistema` e compará-lo com
  `SISTEMAS_RPG` **como valor**. Ler o diretório é o que impede a guarda de envelhecer — foi a lição
  registrada no RV-139 (`sql-de-instalacao.mjs` lê o disco e não desatualiza; `VERIFICACOES` era escrita
  à mão e desatualizou em uma fase).
- **Armadilha:** migration aplicada é imutável. Fechar a divergência é **sempre** uma migration nova que
  recria o `check`, nunca uma edição da 0001. O teste precisa considerar o último `check` declarado, não
  o primeiro.
- **Armadilha 2:** parsing de SQL por regex é frágil. Se a extração ficar traiçoeira, a alternativa
  aceitável é uma lista declarada num único arquivo TypeScript, consumida **tanto** pelo gerador de SQL
  quanto pelo teste. O que não é aceitável é o número de listas voltar a crescer.

**Escopo**
- `apps/api/src/testes/` — teste offline comparando `SISTEMAS_RPG` com o `check` de `mesas.sistema`
  extraído do diretório de migrations, com mensagem que **nomeia** o sistema faltante e o arquivo
- `apps/api/supabase/migrations/000X_*.sql` — só se a comparação já nascer vermelha

**Critérios de aceite**
```gherkin
Guarda: Sistema sem migration derruba a suíte
  Dado um sistema novo acrescentado a SISTEMAS_RPG
  E nenhuma migration recriando o check de mesas.sistema com esse valor
  Quando eu rodar "npm run test"
  Então a suíte falha nomeando o sistema e o arquivo de migration que precisa nascer

Cenário: Repositório atual está coerente
  Dado o repositório como está hoje
  Quando eu rodar "npm run test"
  Então a comparação passa para os quatro sistemas existentes

Cenário: Migration corretiva satisfaz a guarda
  Dado uma migration nova que recria o check com o sistema novo
  Então a suíte volta ao verde sem editar nenhuma migration já aplicada

Cenário: Borda — valor no banco que o enum não conhece
  Dado um check que aceita um valor ausente de SISTEMAS_RPG
  Então a suíte também falha, nomeando o valor órfão
```

**Testes obrigatórios**
- **Prove que a guarda sabe reprovar**: acrescente um sistema ao enum, veja o vermelho com o nome dele
  e desfaça. Guarda que nunca falhou não protege nada.
- A extração precisa de teste próprio se for por parsing: `check` em uma linha, em várias linhas, com
  aspas simples e com um `check` posterior sobrescrevendo o da 0001.

**DoD específico**
- [ ] Nenhuma lista de sistemas escrita à mão fora de `SISTEMAS_RPG` e do SQL — a quinta lista morre aqui.
- [ ] O teste roda offline, sem rede, credencial ou container.
- [ ] A mensagem de falha diz **o que fazer** (criar a migration), não só que falhou.

---

### RV-097 — Trocar o sistema da mesa não pode deixar ficha gravada impossível de salvar

**Épico:** E09 · **Depende de:** RV-091 · **Tamanho:** M · **Onda:** 2

**História**
> Como **jogador**, quero **continuar editando minha ficha depois de o mestre trocar o sistema da mesa**, para **não ficar com um personagem congelado que nem o PV eu consigo corrigir**.

**Contexto técnico**
- **Defeito real, medido no fecho da v0.6.0 com o harness na mão.** `atualizarMesaSchema` é
  `criarMesaSchema.partial()` ([mesas.ts](../../packages/shared/src/schemas/mesas.ts):17), então
  `PATCH /api/mesas/:id` aceita `sistema` (RV-024, com teste em `rotas-mesas.test.ts`). Depois do
  RV-091 isso tem consequência nova: uma mesa `dnd5e` cujas fichas têm `ca`/`pericias` em
  `personagens.dados`, ao virar `generico` ou `tormenta20`, passa a ter fichas que o `schemaFicha`
  do sistema novo **recusa**.
- **A leitura continua funcionando** — `Personagem.reconstituir` não revalida, de propósito: revalidar
  tornaria a ficha ilegível para o próprio dono. É a escrita que morre: a ficha do front sempre envia
  `dados` **inteiro** no submit (e tem de enviar; ver a decisão registrada no RV-091), e a resposta é
  `400 "Campo não previsto na ficha de Tormenta 20: ca."`. Sondado: um PATCH só de `pvAtual` pela API
  passa, mas **pela interface não existe esse caminho** — o botão Salvar devolve erro para sempre.
- **O jogador não tem saída pela tela**: os campos que ele precisaria apagar deixaram de ser
  renderizados, porque `secoes` agora é a do sistema novo. Duplicar a ficha também é recusado. O único
  contorno é o mestre desfazer a troca.
- **A v0.7.0 piorou a aposta, sem tocar neste card.** Agora são **cinco** sistemas para trocar, e a ficha
  de `pathfinder2e` é de longe a mais cara de perder: identidade, seis modificadores, 16 graus de
  treinamento e a lista de Saberes, tudo dentro de `dados`. Trocar uma mesa de PF2e para `generico`
  (cujo `schemaFicha` é `z.object({}).strict()`) congela **toda** ficha do grupo de uma vez. Se a saída
  escolhida for a (b), migrar, é esta a combinação que precisa de teste: PF2e → genérico é o caso de
  perda máxima.
- É a mesma forma do [RV-036](03-cenas.md#rv-036--encolher-o-grid-não-pode-abandonar-tokens-fora-do-mapa):
  **limite alterado sem olhar o que já existe do lado de fora**. Aquele card resolveu recusando com 409
  e dizendo quantas peças ficariam fora — é o precedente mais barato a seguir.
- **Três saídas, em ordem de custo — escolha uma e escreva o porquê no diff:**
  (a) recusar a troca quando houver ficha com `dados` não vazio (**409**, com a contagem de fichas na
  mensagem, como o RV-036 faz);
  (b) migrar os `dados` na troca, descartando o que não couber no schema novo, avisando o mestre
  **antes** de confirmar quantos campos serão perdidos;
  (c) tirar `sistema` do PATCH — a mais barata, mas desfaz uma capacidade entregue no RV-024.
  A opção (b) é a única que atende quem já caiu no problema; (a) e (c) só impedem novos casos.
- **Armadilha:** a validação vive no agregado (`Personagem.criar`/`atualizar`), que recebe o sistema por
  parâmetro. Qualquer saída aqui é regra de domínio no caso de uso de atualizar mesa — **não** um
  `if` na rota nem um aviso só na UI (F6).
- **Armadilha 2:** hoje **não há teste em nenhum nível** cobrindo o cenário "mesa troca de sistema com
  ficha gravada". Ele precisa nascer junto com a decisão, senão a próxima entrega reintroduz o buraco.

**Escopo**
- `apps/api/src/aplicacao/mesas/atualizar-mesa.ts` e/ou `packages/shared/src/schemas/mesas.ts`
- `apps/api/src/dominio/personagens/personagem.ts` — se a saída escolhida for migrar `dados`
- `apps/web/src/features/mesas/FormularioEditarMesa.tsx` — aviso em PT-BR antes de confirmar
- Testes de use case e de contrato

**Critérios de aceite**
```gherkin
Cenário: Mesa sem ficha gravada troca de sistema normalmente
  Dado uma mesa cujas fichas têm "dados" vazio
  Quando o mestre trocar o sistema
  Então a troca é aceita e as fichas continuam editáveis

Cenário: Ficha gravada não fica órfã
  Dado uma mesa "dnd5e" com duas fichas usando campos do sistema
  Quando o mestre trocar o sistema para "generico"
  Então ou a troca é recusada com 409 dizendo quantas fichas impedem
  Ou os dados incompatíveis são migrados com aviso prévio ao mestre
  E, em qualquer dos casos, o jogador continua conseguindo salvar a ficha dele

Cenário: Autorização
  Dado que sou jogador da mesa
  Quando eu tentar trocar o sistema
  Então recebo 403

Cenário: Borda — mesa encerrada
  Dado uma mesa encerrada
  Quando o mestre tentar trocar o sistema
  Então recebo 409, como toda escrita em mesa encerrada (RV-023)
```

**Testes obrigatórios**
- Use case: mesa com ficha de `dados` não vazio trocando de sistema — o comportamento escolhido,
  provado, e a ficha continuando **salvável** depois.
- Contrato `fastify.inject()`: o fluxo completo (criar mesa dnd5e → criar ficha com `ca` → trocar
  sistema → `PATCH` na ficha) termina em sucesso, não em 400 permanente.
- Regressão: mesa sem fichas continua trocando de sistema como no RV-024.
