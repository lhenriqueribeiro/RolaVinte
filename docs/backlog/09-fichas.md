# E09 — Fichas e sistemas de RPG

A ficha atual tem 6 atributos, PV e anotações — genérica por design. Este épico a torna útil de verdade sem transformar o domínio num `if` gigante por sistema.

---

### RV-091 — Strategy de sistema de ficha

**Épico:** E09 · **Depende de:** — · **Tamanho:** G · **Onda:** 2 · **Faça este primeiro do épico**

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

**Épico:** E09 · **Depende de:** RV-091 · **Tamanho:** M · **Onda:** 2

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

**Épico:** E09 · **Depende de:** — · **Tamanho:** P · **Onda:** 2

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
