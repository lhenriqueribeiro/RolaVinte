# E08 — Motor de dados avançado

O motor em [motor-dados.ts](../../packages/shared/src/dados/motor-dados.ts) cobre `NdF`, `kh`/`kl`, sinais e multi-termos, com RNG injetável e 12 testes. Todo card aqui **preserva a compatibilidade** com as expressões existentes e mantém o determinismo.

**Regra transversal do épico:** cada novo modificador entra como estratégia registrada, sem crescer um `if` no parser ([04-design-patterns.md](../../.claude/rules/04-design-patterns.md)).

---

### RV-080 — Dados explosivos, rerrolagem e mínimo/máximo

**Épico:** E08 · **Depende de:** — · **Tamanho:** G · **Onda:** 2

**História**
> Como **jogador de sistemas variados**, quero **dados explosivos e rerrolagem**, para **usar as regras da minha mesa sem calcular na mão**.

**Contexto técnico**
- Refatore antes: extraia os modificadores atuais (`kh`/`kl`) para estratégias registradas num mapa; só então adicione os novos.
- **Proteção obrigatória contra laço infinito**: explosão em `1d1` explodiria para sempre — limite de 100 explosões por termo e recusa de explodir dado cujo gatilho cobre todas as faces.

**Escopo**
- `packages/shared/src/dados/modificadores/`: `manter.ts` (kh/kl), `explodir.ts`, `rerrolar.ts`, `limites.ts`
- `motor-dados.ts`: parser genérico de sufixos + registro de estratégias

**Sintaxe alvo**
| Sufixo | Efeito |
|---|---|
| `!` | Explode no valor máximo (`3d6!`) |
| `!>=N` | Explode em N ou mais |
| `r<N` | Rerrola uma vez abaixo de N (`4d6r<2`) |
| `rr<N` | Rerrola até sair N ou mais (com teto de 100) |
| `min N` / `max N` | Trava o valor de cada dado |

**Critérios de aceite**
```gherkin
Cenário: Explosão simples
  Dado um RNG determinístico que produz 6, 6, 3 num d6
  Quando eu rolar "1d6!"
  Então o total é 15 e o detalhamento mostra os três dados encadeados

Cenário: Teto de explosão
  Quando eu rolar "1d2!" com um RNG que sempre devolve o máximo
  Então a rolagem para em 100 explosões e retorna resultado com aviso, sem travar

Cenário: Explosão impossível é recusada
  Quando eu rolar "1d6!>=1"
  Então recebo erro de validação em PT-BR

Cenário: Rerrolagem única
  Dado um RNG que produz 1 e depois 5
  Quando eu rolar "1d6r<2"
  Então o resultado é 5 e o detalhamento mostra o 1 descartado

Cenário: Compatibilidade preservada
  Quando eu rolar as expressões dos testes atuais
  Então todos os 12 testes existentes continuam passando sem alteração
```

**Testes obrigatórios**
- Todos os cenários acima com RNG determinístico + teste de que nenhuma expressão executa mais que o teto de iterações.

---

### RV-081 — Pool de sucessos

**Épico:** E08 · **Depende de:** RV-080 · **Tamanho:** M · **Onda:** 2

**História**
> Como **jogador de Storyteller/Shadowrun**, quero **contar sucessos em vez de somar**, para **jogar sistemas de pool de dados**.

**Sintaxe alvo**
- `10d10>=8` → conta dados com 8 ou mais
- `10d10>=8f1` → conta sucessos e subtrai falhas críticas (1)

**Critérios de aceite**
```gherkin
Cenário: Contagem de sucessos
  Dado um RNG que produz 9, 3, 8, 1, 10 num 5d10
  Quando eu rolar "5d10>=8"
  Então o resultado é "3 sucessos", não a soma 31

Cenário: Falha crítica reduz sucessos
  Quando eu rolar "5d10>=8f1" com a mesma sequência
  Então o resultado é "2 sucessos" (3 sucessos − 1 falha)

Cenário: Zero sucessos
  Dado que nenhum dado alcança o alvo
  Então o resultado é "0 sucessos" e o chat deixa isso explícito
```

**DoD específico**
- [ ] `ResultadoRolagem` ganha modo de apresentação (`soma` | `sucessos`) — o chat renderiza os dois sem `if` espalhado.
- [ ] Contrato do DTO atualizado em `@rolavinte/shared` e consumido pelo front sem redeclaração.

---

### RV-082 — Aritmética completa na expressão

**Épico:** E08 · **Depende de:** RV-080 · **Tamanho:** G · **Onda:** 3

**História**
> Como **jogador**, quero **usar multiplicação, divisão e parênteses**, para **expressar coisas como `(2d6+3)*2`**.

**Contexto técnico**
- O tokenizador atual é linear (só `+`/`-`). Este card troca por um parser de precedência (Pratt ou descida recursiva), mantendo `TermoAvaliado` compatível para o chat continuar detalhando os dados.

**Critérios de aceite**
```gherkin
Cenário: Precedência respeitada
  Quando eu rolar "1d4+2*3" com o d4 valendo 2
  Então o total é 8, não 12

Cenário: Parênteses
  Quando eu rolar "(1d4+2)*3" com o d4 valendo 2
  Então o total é 12

Cenário: Divisão arredonda para baixo
  Quando eu rolar "7/2"
  Então o resultado é 3, com a regra documentada no card e na UI

Cenário: Divisão por zero
  Quando eu rolar "1d6/0"
  Então recebo erro de validação em PT-BR, sem exceção não tratada

Cenário: Parênteses desbalanceados
  Quando eu rolar "(1d6+2"
  Então recebo erro de validação apontando o problema
```

**Testes obrigatórios**
- Suíte de precedência, associatividade, aninhamento profundo (limite de profundidade para evitar estouro de pilha) e todos os erros acima.
- Os 12 testes atuais continuam verdes.

---

### RV-083 — Macros de rolagem

**Épico:** E08 · **Depende de:** RV-074 · **Tamanho:** G · **Onda:** 2

**História**
> Como **jogador**, quero **salvar minhas rolagens frequentes como botões**, para **atacar com um clique em vez de digitar a expressão toda rodada**.

**Escopo**
- Migration `000X_macros.sql`: `macros` (`id`, `usuario_id`, `mesa_id nullable`, `nome`, `expressao`, `motivo`, `ordem`)
- Domínio `Macro` validando a expressão via `ExpressaoDados` na criação
- CRUD: `GET/POST /mesas/:mesaId/macros`, `PATCH/DELETE /macros/:macroId`
- Front: barra de macros acima do campo de chat + gerenciador

**Critérios de aceite**
```gherkin
Cenário: Criar e usar macro
  Dado que criei a macro "Espada longa" com "1d20+7 # ataque"
  Quando eu clicar no botão
  Então a rolagem é feita e publicada como se eu tivesse digitado o comando

Cenário: Expressão inválida é barrada na criação
  Quando eu salvar a macro com "2d+x"
  Então recebo 400 e a macro não é criada

Cenário: Macro global vs. da mesa
  Dado uma macro sem mesa_id
  Então ela aparece em todas as minhas mesas
  E a macro com mesa_id aparece só naquela mesa

Cenário: Macro é privada
  Então nenhum outro usuário vê ou usa as minhas macros
```

**Testes obrigatórios**
- Domínio: expressão inválida rejeitada na criação (não só no uso).
- Autorização: editar macro de outro usuário → 403.

---

### RV-084 — Feedback visual da rolagem

**Épico:** E08 · **Depende de:** RV-081 · **Tamanho:** M · **Onda:** 3

**História**
> Como **jogador**, quero **sentir a rolagem acontecer**, para **que o momento do d20 tenha peso**.

**Escopo**
- `apps/web/src/features/jogo/AnimacaoDados.tsx`: contagem rápida até o resultado final (150–400 ms)
- Destaque especial para 20 natural (crítico) e 1 natural (falha) em d20
- Respeitar `prefers-reduced-motion`

**Critérios de aceite**
```gherkin
Cenário: Animação curta e não bloqueante
  Quando uma rolagem chegar no chat
  Então há uma animação de no máximo 400 ms
  E o chat permanece rolável durante ela

Cenário: Crítico e falha
  Dado um "1d20" que resultou em 20 natural
  Então a mensagem recebe destaque de crítico, também indicado por texto
  E um 1 natural recebe destaque de falha

Cenário: Movimento reduzido
  Dado que o sistema pede movimento reduzido
  Então o resultado aparece direto, sem animação
```

**DoD específico**
- [ ] O destaque de crítico não depende apenas de cor.
- [ ] Rolagens antigas carregadas do histórico não animam.
