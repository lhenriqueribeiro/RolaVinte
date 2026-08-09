# E10 — Handouts e anotações

Material de mesa: mapas do mundo, cartas, pistas e as notas privadas do mestre.

---

### RV-100 — Handouts com visibilidade controlada

**Épico:** E10 · **Depende de:** RV-032 · **Tamanho:** G · **Onda:** 2

**História**
> Como **mestre**, quero **compartilhar documentos com jogadores específicos**, para **entregar a carta secreta só a quem a encontrou**.

**Contexto técnico**
- Visibilidade é regra de domínio: `todos` | `especificos` | `mestre`. O filtro acontece no use case; o handout não visível **não é enviado** ao cliente.

**Escopo**
- Migration `000X_handouts.sql`: `handouts` (`id`, `mesa_id`, `titulo`, `conteudo`, `visibilidade`, `criado_em`, `atualizado_em`) e `handout_destinatarios` (`handout_id`, `usuario_id`)
- `apps/api/src/dominio/mesas/handout.ts` — agregado com `alterarVisibilidade`, `compartilharCom`, `revogarDe`
- CRUD: `GET/POST /mesas/:mesaId/handouts`, `PATCH/DELETE /handouts/:handoutId`
- Broadcast `handout:compartilhado` direcionado aos destinatários (sala `usuario:{id}` de RV-070)
- Front: aba "📜 Handouts" com lista e visualizador

**Critérios de aceite**
```gherkin
Cenário: Handout privado não vaza
  Dado um handout visível apenas para "Ana"
  Quando "Bruno" listar os handouts da mesa
  Então o documento não está na resposta dele

Cenário: Compartilhar notifica na hora
  Quando eu compartilhar o handout com "Ana"
  Então "Ana" recebe o evento e vê o documento aparecer sem recarregar

Cenário: Revogar remove o acesso
  Quando eu revogar o acesso de "Ana"
  Então a próxima leitura dela retorna 403
  E o item some da lista dela

Cenário: Só o mestre cria e edita
  Dado que sou jogador
  Quando eu tentar criar um handout
  Então recebo 403
```

**Testes obrigatórios**
- Use case: matriz visibilidade (`todos`/`especificos`/`mestre`) × solicitante (mestre/destinatário/terceiro) sobre o payload.

---

### RV-101 — Diário do mestre

**Épico:** E10 · **Depende de:** RV-100 · **Tamanho:** M · **Onda:** 2

**História**
> Como **mestre**, quero **anotações privadas por mesa e por cena**, para **guardar o roteiro sem risco de vazar no chat**.

**Escopo**
- Reuso de `handouts` com `visibilidade = 'mestre'` + `cena_id` opcional
- Front: painel lateral do mestre com anotações da cena ativa, salvamento automático com _debounce_
- Editor simples com Markdown renderizado (sem HTML bruto — ver DoD)

**Critérios de aceite**
```gherkin
Cenário: Anotação da cena aparece ao trocar de cena
  Dado anotações vinculadas à cena "Cripta"
  Quando eu ativar "Cripta"
  Então minhas anotações daquela cena são exibidas automaticamente

Cenário: Salvamento automático
  Quando eu parar de digitar por 2 segundos
  Então o conteúdo é salvo e um indicador discreto confirma

Cenário: Jogador nunca acessa
  Quando um jogador chamar a rota do diário
  Então recebe 403 em qualquer circunstância
```

**DoD específico**
- [ ] Markdown renderizado com sanitização — nenhum HTML/script do conteúdo é executado.

---

### RV-102 — Imagens em handouts

**Épico:** E10 · **Depende de:** RV-100 · **Tamanho:** M · **Onda:** 3

**História**
> Como **mestre**, quero **anexar imagens aos handouts**, para **mostrar o mapa do reino ou o retrato do vilão**.

**Escopo**
- Migration: `handouts.imagem_url text`
- Reuso da port `ArmazenamentoArquivos` (bucket `handouts`), mesmas validações de RV-032
- Front: visualizador com zoom e opção "exibir para a mesa" (abre o handout na tela de todos os destinatários)

**Critérios de aceite**
```gherkin
Cenário: Exibir para a mesa
  Quando eu clicar em "exibir para a mesa"
  Então o handout abre automaticamente na tela dos destinatários

Cenário: Imagem herda a visibilidade do handout
  Dado um handout restrito a "Ana"
  Então a URL da imagem não é enviada a quem não é destinatário

Cenário: Validação de arquivo
  Quando eu enviar arquivo de tipo ou tamanho inválido
  Então recebo 400/413 e nada é gravado
```

**DoD específico**
- [ ] Bucket privado com URL assinada de curta duração — link vazado não dá acesso permanente.
