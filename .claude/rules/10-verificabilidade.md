# Guardrail: Verificabilidade

## O princípio

**Toda afirmação que o projeto faz sobre si mesmo precisa de um consumidor que quebra quando ela deixa de ser verdade.**

Afirmação sem consumidor é comentário. Comentário não apodrece com barulho — apodrece em silêncio, e continua sendo lido como verdade por quem chega depois.

Isso vale para as três coisas que este projeto afirma:

| Afirma | Consumidor que quebra |
|---|---|
| **Contrato de código** — "domínio não importa infra", "este evento tem ouvinte" | tipo, lint ou teste |
| **Estado do ambiente** — "as migrations estão aplicadas", "o bucket existe" | verificação derivada, nunca lista escrita à mão |
| **Documentação** — "a estrutura é assim", "este comando existe" | `npm run docs:verificar`, mais auditoria de quem revisa |

## Por que este guardrail existe

Não é teoria. Cada linha abaixo é um defeito que este projeto produziu, com a afirmação que ninguém verificava:

| Afirmação | Não tinha consumidor | O que custou | O que fechou |
|---|---|---|---|
| "a regra de dependência aponta para dentro" | revisão humana | — (pego antes) | lint de fronteiras + teste que grava fixture proibido e exige o vermelho |
| "`eventos-ws.ts` é a fonte única de verdade" | **zero** — nenhum lado aplicava os genéricos | jogador removido ficava com a mesa na tela até dar F5 | genéricos nos dois lados + teste de cobertura de ouvinte |
| "`SISTEMAS_RPG` é a lista de sistemas" | o `check` do banco era uma segunda lista | mesa de sistema novo recusada só em runtime | guarda que lê o SQL e compara nas duas direções |
| "o ambiente está pronto" | verificador com **lista fixa** de tabelas | migration em disco e fora do banco derrubou **o chat inteiro** | verificador derivado dos arquivos × `migrations_aplicadas` |
| "atributo é igual em todo sistema" | cada metade testada sozinha | ficha ignorava o que o jogador digitava, com a suíte verde | teste de ida e volta: grava informando, relê, compara |
| "este projeto não é um repositório git" | nada ligava a frase ao fato | agentes liam instrução errada por oito versões | `docs:verificar` + pergunta na auditoria do verificador |

O padrão é sempre o mesmo, e é o que torna este guardrail necessário: **a afirmação era verdadeira quando escrita.** Nenhuma nasceu errada. Todas apodreceram porque o mundo mudou e nada estava preso a elas.

## As três formas de dar um consumidor

Em ordem de preferência — use a mais forte que alcançar:

1. **O compilador quebra.** Um `Record<Chave, Definicao>` obriga a declarar toda chave. É a defesa mais barata e mais difícil de contornar por engano.
2. **A suíte quebra.** Quando o tipo não alcança: nenhum tipo exige que exista um `socket.on(...)` para cada evento, nem que uma lista em SQL case com um enum em TypeScript.
3. **Um papel nomeado quebra.** Quando nenhum script alcança — afirmação semanticamente falsa em prosa, por exemplo. Aí a defesa é **uma pergunta na lista de auditoria de alguém**, não "todo mundo deve lembrar".

`npm run check` já roda 1 e 2. O 3 vive em [.claude/agents/verificador.md](../agents/verificador.md).

**"Todo mundo deve lembrar" não é uma das três.** Se a sua defesa depende de disciplina, ela é decorativa.

## Documentação: separe por volatilidade, não por assunto

Todo documento mistura três coisas com prazos de validade radicalmente diferentes. Trate cada uma do seu jeito:

| Tipo | Exemplo | Prazo | Como escrever |
|---|---|---|---|
| **Princípio** | "falha esperada devolve `Result`" | anos | prosa; diga o **porquê** e o teste objetivo de review |
| **Fato do estado atual** | caminhos, contagens, comandos, o que está aplicado | dias | **derive**; se precisar aparecer, aponte para onde é mantido |
| **História** | "na v0.4.0 o evento nasceu órfão" | imutável | prosa, mas **datada** |

Três regras que caem daí:

- **Nunca justifique um princípio com um fato volátil.** O protocolo dizia "use `Edit`, não `Write`, porque não há git". O princípio era certo; a justificativa apodreceu e arrastou a credibilidade dele. A forma durável era *"vários agentes escrevem na mesma árvore; quem sobrescreve, apaga"*.
- **Não repita um número que outro arquivo mantém.** A contagem do backlog vive no backlog, que o curador atualiza a cada entrega. Copiada para `CLAUDE.md` e para o `README`, ela ficou defasada em duas sprints e ninguém notou — porque nada ali dependia dela para funcionar.
- **Guardrail não é changelog.** Detalhe de implementação que muda toda versão pertence à release note. Se uma regra cita versão, contagem de teste ou id de card como se fosse norma permanente, ela vai divergir em duas sprints.

## O teste tem que ter falhado ao menos uma vez

Regra completa em [protocolo-comum.md](../../docs/agentes/protocolo-comum.md), com uma ressalva que custou caro para aprender:

**A asserção tem que ser precisa, não só presente.** Uma guarda de migration afirmava "cada chave aparece ao menos duas vezes" no SQL; ao reintroduzir o defeito, **ela passou verde**, porque a chave também aparecia no `where`. Se o seu experimento não produzir vermelho, a suspeita recai sobre o **teste**, não sobre o experimento.

## O que rejeitar em code review

- [ ] Contrato novo (evento, enum, lista, port) **sem** um consumidor que quebre quando ele for desrespeitado.
- [ ] Verificação baseada em **lista escrita à mão** do que deveria existir, em vez de derivada da fonte.
- [ ] Duas listas da mesma coisa em linguagens diferentes, sem nada comparando (TypeScript × SQL × prosa).
- [ ] Campo **exigido na escrita e ausente da leitura** — sintoma de duas verdades (F12 da [taxonomia](../../docs/agentes/taxonomia-de-falhas.md)).
- [ ] Teste protetor cuja falha ninguém viu.
- [ ] Configuração que aparenta proteger sem que se possa apontar a linha que a lê (F1).
- [ ] Documento afirmando fato volátil — caminho, contagem, comando, estado de ambiente.
- [ ] Princípio justificado por fato que muda.

## Quando nada disso alcança

Existe afirmação que nenhum script verifica: *"o SDK do Supabase só aparece em `infra/`"* é automatizável; *"esta regra ainda descreve o projeto"* não é.

Nesse caso a resposta **não** é desistir nem confiar na disciplina. É **nomear o papel e colocar a pergunta na lista dele**. O verificador tem, na auditoria, a pergunta "alguma afirmação em `.claude/rules/` ou `docs/agentes/` ficou falsa com esta sprint?".

Uma pergunta na lista de alguém é uma defesa real. Uma intenção não é.
