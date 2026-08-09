# E14 — Documentação e conhecimento

Épico novo, criado na revisão de documentação de 2026-08-09. Nasce com um card só, de propósito: o critério de corte vale também aqui.

O problema que ele existe para resolver: a documentação **gerada pelo processo** (backlog, release notes) está atual porque é revisada a cada fase, enquanto a documentação **fundacional** (`.claude/rules/`) foi escrita no primeiro dia e nunca mais tocada. Agentes leem a fundacional antes de codar.

---

### RV-140 — Alinhar os guardrails ao código que existe hoje

**Épico:** E14 · **Depende de:** — · **Tamanho:** M · **Onda:** 1

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
- [ ] Cada uma das 9 regras foi lida contra o código, não apenas as que tinham divergência conhecida.
- [ ] Nenhuma regra ganhou detalhe que vai apodrecer na próxima versão.
- [ ] A tabela "o que rejeitar em code review" de cada regra continua acionável — é o que um revisor usa.
