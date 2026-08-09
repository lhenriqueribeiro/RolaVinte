# Modelo de card

Copie o bloco abaixo ao criar um card novo. Numere na faixa do épico (`RV-0X0` … `RV-0X9`) e registre-o no índice do [README](README.md).

---

### RV-000 — Título curto no imperativo

**Épico:** E00 · **Depende de:** — · **Tamanho:** P|M|G · **Onda:** 1|2|3

**História**
> Como **&lt;papel&gt;**, quero **&lt;capacidade&gt;**, para **&lt;benefício concreto&gt;**.

**Contexto técnico**
- O que já existe hoje e onde (com link para o arquivo).
- Decisões tomadas e o porquê — evita que o agente re-decida errado.
- Armadilhas conhecidas (concorrência, vazamento de dados, laço infinito, N+1).

**Escopo**
- Arquivos a criar/alterar. Orientação, não camisa de força.

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz
  Dado <estado inicial>
  Quando <ação>
  Então <resultado observável>

Cenário: Autorização
  Dado que sou <papel sem permissão>
  Quando <ação>
  Então recebo 403

Cenário: Borda
  Quando <entrada inválida ou limite>
  Então <erro em PT-BR, sem efeito colateral>
```

**Testes obrigatórios**
- Domínio: invariantes.
- Use case: com fakes das ports.
- Contrato: `fastify.inject()` quando houver rota nova.

**DoD específico**
- [ ] Só o que este card exige **além** do [DoD global](README.md#definition-of-done-global).

---

## Como escrever um bom card aqui

- **Um card = uma intenção de usuário.** Se o título tem "e", provavelmente são dois cards.
- **Escreva os cenários de falha**, não só o feliz. Autorização e borda são onde os bugs moram.
- **Registre a decisão, não só a tarefa.** "Presença fica em memória, não no banco" poupa uma discussão inteira depois.
- **Aponte o arquivo real.** Um agente sem contexto acha o caminho muito mais rápido com um link.
- **Cenário observável.** "Então o estado interno muda" não é verificável; "então os jogadores veem X sem recarregar" é.
