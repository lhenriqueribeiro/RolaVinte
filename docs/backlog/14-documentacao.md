# E14 — Documentação e conhecimento

Épico novo, criado na revisão de documentação de 2026-08-09. Nasceu com um card só, de propósito: o critério de corte vale também aqui. O segundo (RV-141) só entrou porque a varredura do primeiro deixou uma lacuna **com defesa automatizável** — documentação sem consumidor é o assunto deste épico, então card daqui precisa terminar em algo que quebre.

O problema que ele existe para resolver: a documentação **gerada pelo processo** (backlog, release notes) está atual porque é revisada a cada fase, enquanto a documentação **fundacional** (`.claude/rules/`) foi escrita no primeiro dia e nunca mais tocada. Agentes leem a fundacional antes de codar.

---

### RV-140 — Alinhar os guardrails ao código que existe hoje

**Épico:** E14 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído (v0.9.0)

> **Decisões de entrega (v0.9.0).** As nove regras foram lidas contra o código, mais `CLAUDE.md`,
> `protocolo-comum.md` e a taxonomia. A escolha estruturante foi **reduzir o número de fatos afirmados** em vez
> de atualizá-los: os blocos de estrutura viraram tabelas de responsabilidade por diretório, **sem nomes de
> classe** — era de lá que vinham cinco símbolos citados que não existem (`EventBusEmMemoria`,
> `ServicoEmailConsole`, `ValueObject`, `NomeMesa`, `PosicaoGrid`) — e todo caminho load-bearing virou link
> markdown, ou seja, ganhou `docs:verificar` como consumidor.
>
> - **O teste opcional de caminhos não foi escrito, e o porquê está registrado:** `scripts/verificar-docs.mjs`
>   já resolve todo link markdown das regras; o que ele não pega é caminho em prosa, e um extrator de prosa
>   precisaria distinguir `aplicacao/<contexto>/` (ilustrativo) de `infra/storage/` (literal) — falso positivo
>   num verificador é pior que ausência, porque ensina a ignorá-lo.
> - **Duas exigências decorativas foram removidas em vez de mantidas.** A regra 07 exigia `atualizado_em` em
>   toda tabela mutável: **nenhuma** das doze tabelas tem, nenhuma entidade expõe e nenhum DTO carrega — norma
>   que nada cumpre desmoraliza as vizinhas. A regra 03 exigia "arquivo com mais de ~200 linhas", violado por
>   todo composition root, e virou "quantos motivos fariam este arquivo mudar".
> - **Dois mecanismos foram descritos como ausentes, de propósito.** O motor de dados **não** tem registro de
>   estratégias (é parser puro por regex, com `kh`/`kl` inline) — guardrail que promete estrutura inexistente
>   faz o próximo agente escrever contra ela. E erro do supabase-js **não** vira `ErroDominio`: `garantirSemErro`
>   lança, e o 409 de email repetido vem de uma consulta anterior à escrita.
> - **A taxonomia deixou de ser painel de pendências.** Quatro afirmações de estado estavam falsas (F7, F2, F9
>   e F3 apontavam como abertos itens já fechados). Corrigidas, e o arquivo ganhou o aviso de que o que está
>   aberto vive no backlog — anotar "aberto — RV-XXX" numa taxonomia cria um fato volátil sem consumidor, que é
>   a doença que este card veio tratar.
> - **Os nove arquivos foram mantidos**, embora `08-email.md` tenha dezesseis linhas: todas as regras são
>   linkadas de fora (backlog, `.claude/agents/`, comentários de código), então fundir arquivo trocaria
>   defasagem de texto por link quebrado. Consolidou-se o conteúdo, não a superfície.
> - **Duas âncoras passaram a ser contrato entre documentos** e não devem ser renomeadas sem atualizar quem
>   aponta: `05-backend.md#criar-um-evento-novo--os-quatro-passos-na-ordem` e
>   `02-ddd.md#guardas-do-agregado--reuse-nunca-reimplemente`. `docs:verificar` valida o arquivo, não a âncora.
> - **Ficou uma lacuna, e ela é por omissão:** o vocabulário e a lista de raízes de agregado do `02-ddd.md` não
>   incorporaram `Combate`, `Rodada`, `Turno`, `Iniciativa` e `Condição`, entregues na mesma sprint. É
>   [RV-141](#rv-141--o-que-o-agente-lê-antes-de-codar-precisa-ter-quem-o-desminta).

**História**
> Como **agente que vai implementar um card**, quero **que `.claude/rules/` descreva o projeto como ele é**, para **não escrever código contra uma estrutura que deixou de existir há três versões**.

**Contexto técnico**
- As 9 regras somam ~240 linhas escritas antes da primeira linha de código de produção. O projeto está em 447 testes e nenhuma foi revisada desde então.
- Duas correções pontuais já foram feitas na revisão de 2026-08-09 (o bloco de estrutura em `05-backend.md`, que omitia `app.ts` e `testes/`, e a camada de contrato em `09-testes-e-qualidade.md`, que ignorava o harness). **O resto continua defasado.**
- Divergências conhecidas, para servirem de ponto de partida — a varredura precisa ser completa, não só esta lista:
  - [01-arquitetura.md](../../.claude/rules/01-arquitetura.md): a tabela de camadas usa nomes em inglês (`domain/`, `application/`) enquanto o código é PT-BR (`dominio/`, `aplicacao/`); e diz "exceto no composition root" no singular, quando hoje `main.ts` e `app.ts` dividem o papel.
  - Nenhuma regra menciona a port `ArmazenamentoArquivos`, embora ela já seja o caminho obrigatório de upload e o SDK do Supabase esteja proibido fora de `infra/`.
  - Nenhuma regra menciona as guardas do agregado (`Mesa.autorizarEscritaDeParticipante` / `autorizarEscritaDoMestre`) — reimplementá-las à mão já causou o furo do RV-027.
  - [07-supabase.md](../../.claude/rules/07-supabase.md) não fala de Storage, buckets nem da política de caminho gerado pela aplicação.
  - Nenhuma regra registra o mecanismo do contrato de eventos WS (RV-115) nem os 4 passos para criar um evento novo.
  - **`docs/agentes/` tem a mesma doença e duas afirmações hoje falsas** (medido na v0.6.0):
    `protocolo-comum.md` §5 diz "Este projeto não é um repositório git" e a taxonomia diz, em F10(b),
    que o workflow de CI é código morto "porque não existe `.git`". O repositório **é** um repositório
    git — `git rev-parse --show-toplevel` devolve a raiz, há branch `main` com `origin/main` e
    histórico de commits. O raciocínio de concorrência do protocolo continua válido (todos os agentes
    escrevem na mesma árvore, sem worktree), mas um agente que leia as duas frases literalmente conclui
    que o CI é inerte e que não há histórico a consultar. Traga `docs/agentes/` para o escopo desta
    varredura: é documentação fundacional pelo mesmo critério que trouxe `.claude/rules/`.
- **Risco a evitar:** guardrail não é changelog. Ele diz *o princípio* e *o teste objetivo em review*. Detalhe de implementação que muda toda versão pertence à release note, não aqui — senão a defasagem volta em duas fases.

**Escopo**
- Os 9 arquivos de `.claude/rules/`
- `docs/agentes/protocolo-comum.md` e `docs/agentes/taxonomia-de-falhas.md` — as duas afirmações sobre git
- `CLAUDE.md`, se o resumo de "o que quebra o build de review" mudar
- Nenhum arquivo de código

**Critérios de aceite**
```gherkin
Cenário: Estrutura descrita bate com o disco
  Quando eu comparar cada árvore de diretórios citada nos guardrails com o repositório
  Então não há diretório ou arquivo citado que não exista, nem peça estrutural em uso que esteja ausente do texto

Cenário: Mecanismo em uso está registrado
  Dado que a port ArmazenamentoArquivos, as guardas do agregado Mesa e o contrato de eventos WS são obrigatórios hoje
  Então cada um aparece na regra correspondente, com o teste objetivo que um revisor aplicaria

Cenário: Nomes conferem com o código
  Quando eu procurar por nomes de camada em inglês nos guardrails
  Então não encontro nenhum — dominio, aplicacao, infra e apresentacao são os nomes reais

Cenário: Borda — o guardrail não virou changelog
  Então nenhuma regra cita número de versão, contagem de testes ou id de card como se fosse norma permanente
```

**Testes obrigatórios**
- Não há teste automatizado possível aqui sem inventar um verificador de prosa. A verificação é a varredura descrita no primeiro cenário, **registrada na entrega**: lista de diretórios citados × existentes.
- Considere, e decida com justificativa, se vale um teste que valide apenas os **caminhos de arquivo citados** nos guardrails (barato, pega a defasagem estrutural que mais engana). Se decidir que não vale, escreva o porquê.

**DoD específico**
- [x] Cada uma das 9 regras foi lida contra o código, não apenas as que tinham divergência conhecida.
- [x] Nenhuma regra ganhou detalhe que vai apodrecer na próxima versão. *(Conferido por grep na verificação
  independente: as nove regras estão sem um único id de card, número de versão ou contagem de teste — quando um
  caso real é necessário, ele aparece como classe da taxonomia, que é referência estável.)*
- [x] A tabela "o que rejeitar em code review" de cada regra continua acionável — todas as nove têm a sua.

---

### RV-141 — O que o agente lê antes de codar precisa ter quem o desminta

**Épico:** E14 · **Depende de:** RV-140 (✅) · **Tamanho:** P · **Onda:** 2

**História**
> Como **agente que vai implementar um card**, quero **que a linguagem ubíqua e os comandos de verificação sejam desmentidos por algo que quebra**, para **não aprender o vocabulário errado nem acreditar num `check` que não rodou**.

**Contexto técnico**
- O [RV-140](#rv-140--alinhar-os-guardrails-ao-código-que-existe-hoje) alinhou os nove guardrails e deixou
  **duas lacunas da mesma família**: um agente lê a superfície de onboarding e ela ainda desmente o código, sem
  que nada acuse.
- **Lacuna 1 — vocabulário e raízes de agregado.** [02-ddd.md](../../.claude/rules/02-ddd.md) diz "`Mesa` é raiz
  de participação e convites; `Cena` é raiz dos tokens" e a tabela de linguagem ubíqua não tem `Combate`,
  `Rodada`, `Turno`, `Iniciativa` nem `Condição` — todos entregues na v0.9.0, com repositório próprio e tabela
  de filhos. Quem ler só o guardrail não sabe que existe uma **terceira** raiz de agregado. Não é caminho
  inexistente (o `docs:verificar` passa); é omissão semântica, que é a forma de apodrecimento que o RV-140 se
  propôs a fechar e não fechou.
- **A defesa existe e é barata, porque a fonte já é derivável:** é a regra do projeto que haja **um repositório
  por agregado raiz** ([02-ddd.md](../../.claude/rules/02-ddd.md)), e os repositórios estão todos declarados em
  [aplicacao/ports/repositorios.ts](../../apps/api/src/aplicacao/ports/repositorios.ts). Uma guarda que extraia
  os `*Repository` de lá e exija que cada agregado correspondente seja nomeado no guardrail fica vermelha
  **nomeando o agregado ausente** — no espírito da guarda do RV-096 (SQL × TypeScript), que é o precedente
  desta casa para "duas listas da mesma coisa em linguagens diferentes".
- **Armadilha — não transforme a tabela de vocabulário num inventário.** O RV-140 removeu inventários de classe
  justamente porque apodrecem. O que a guarda deve cobrar é o **conjunto de raízes de agregado** (fato de
  estrutura, derivável), não cada termo de negócio. Termo novo sem repositório continua sendo prosa.
- **Lacuna 2 — o script `typecheck` não existe e a invocação dele falha em silêncio.** Medido na v0.9.0: um
  agente invocou `typecheck` com `--workspaces --if-present`, recebeu **exit 0 com saída vazia** (nenhum workspace tem esse
  script — o script é `check`) e seguiu acreditando que os tipos estavam conferidos; os dez erros só apareceram
  no `npm run check`. É a F8 (pulo silencioso) na forma mais barata de acontecer: o comando plausível existe na
  cabeça de quem chega e não no `package.json`. Duas saídas de uma linha, e a escolha é de quem mantém: um
  alias `"typecheck"` na raiz, ou registrar em `CLAUDE.md` que a verificação de tipos é `npm run check`.
- **A metade documental da lacuna 2 já foi feita, e criou um efeito colateral que este card precisa resolver.**
  O `README.md` da raiz passou a registrar, na tabela de comandos, que a verificação de tipos é `npm run check`
  e que o outro script não existe. Só que `scripts/verificar-docs.mjs` procura `npm run <algo>` em toda a
  documentação e reprova comando inexistente — então **a frase que avisa da armadilha reprova o verificador**, e
  hoje `npm run docs:verificar` acusa três ocorrências (duas na release note da v0.9.0, uma no README da raiz).
  Medido na curadoria da v0.9.0. O guard não sabe dizer "este comando **não** existe", e a saída barata é
  decidir uma das duas: criar o alias (aí a frase deixa de ser necessária) ou ensinar o verificador a aceitar a
  menção negada. Enquanto nenhuma das duas acontecer, `npm run check` fica vermelho por causa da documentação —
  o pior estado possível para um guard, porque ensina a ignorá-lo.

**Escopo**
- `.claude/rules/02-ddd.md` — vocabulário e raízes de agregado
- `apps/api/src/testes/` — guarda derivada das ports, com nome que diga o que ela protege
- `package.json` da raiz **ou** `CLAUDE.md` — a lacuna 2
- Nenhum arquivo de código de produção

**Critérios de aceite**
```gherkin
Cenário: Agregado novo sem vocabulário derruba a suíte
  Dado um repositório novo declarado em aplicacao/ports/repositorios.ts
  Quando o agregado dele não estiver nomeado no guardrail de DDD
  Então npm run test falha nomeando o agregado ausente e dizendo onde escrever

Cenário: Estado atual passa
  Quando eu rodar a guarda hoje, com Combate no guardrail
  Então ela passa, sem exigir termo que não tenha repositório

Cenário: O comando de verificação não mente
  Quando alguém rodar o comando documentado para conferir tipos
  Então ou ele existe e roda, ou não existe comando documentado com esse nome

Cenário: A documentação da armadilha não reprova o verificador
  Quando eu rodar npm run docs:verificar
  Então ele passa, sem acusar o comando que a própria documentação diz não existir
```

**Testes obrigatórios**
- A guarda acima, com o experimento de vermelho registrado (acrescente um `Repository` fictício à port e
  confirme que a falha **nomeia** o agregado).

**DoD específico**
- [ ] A guarda deriva os agregados das ports; nenhuma lista escrita à mão do que "deveria existir".
