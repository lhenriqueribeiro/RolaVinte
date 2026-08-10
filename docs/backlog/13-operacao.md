# E13 — Operação, segurança e deploy

O que separa "roda na minha máquina" de "roda para grupos reais toda sexta à noite".

---

### RV-130 — Observabilidade

**Épico:** E13 · **Depende de:** RV-005 · **Tamanho:** M · **Onda:** 3

**História**
> Como **operador**, quero **saber se a plataforma está saudável e onde ela dói**, para **agir antes de o grupo reclamar**.

**Escopo**
- `GET /api/saude` (liveness, já existe) e `GET /api/pronto` (readiness: checa Supabase)
- Métricas: contador de rolagens, mensagens, sockets conectados, duração das requisições — expostas em `/api/metricas` (protegida por token de operação)
- Log estruturado com `requisicaoId`, `usuarioId` e `mesaId` quando aplicável
- Decorator de logging sobre as ports de repositório (sem poluir use case — ver [04-design-patterns.md](../../.claude/rules/04-design-patterns.md))

**Critérios de aceite**
```gherkin
Cenário: Readiness reflete o banco
  Dado que o Supabase está inacessível
  Quando eu chamar GET /api/pronto
  Então recebo 503
  E GET /api/saude continua 200

Cenário: Métrica de sockets
  Dado 3 clientes conectados
  Então a métrica de conexões ativas reporta 3

Cenário: Métricas protegidas
  Quando eu chamar /api/metricas sem o token de operação
  Então recebo 401

Cenário: Rastreabilidade
  Dado um erro 500
  Então o requisicaoId da resposta permite localizar a linha de log correspondente
```

**DoD específico**
- [ ] Instrumentação por decorator; nenhum use case importa logger ou métrica.

---

### RV-132 — Deploy de API e web

**Épico:** E13 · **Depende de:** RV-002 · **Tamanho:** G · **Onda:** 1 — *promovido da Onda 3 na curadoria da v0.5.0*

**História**
> Como **mantenedor**, quero **publicar a plataforma com um comando**, para **que o grupo jogue de qualquer lugar**.

> **Por que subiu para a Onda 1.** A métrica de pronto do produto é "um grupo de 5 pessoas completa uma
> sessão de 3h". Hoje a plataforma só existe em `localhost:5173`: **os outros quatro não têm como
> chegar nela**. Enquanto isso durar, todo card da Onda 1 melhora uma sessão que ninguém consegue
> começar. Duas consequências práticas medidas no fecho da v0.5.0:
> **(a)** `RESEND_API_KEY` está vazia em `apps/api/.env`, então **todo convite cai no stdout da API** —
> quem não é o operador do processo nunca recebe o link;
> **(b)** o `ConviteDTO` ([dtos.ts](../../packages/shared/src/tipos/dtos.ts)) expõe `id`, `email`,
> `status` e `criadoEm`, e **não** o token, então nem por contorno o mestre copia o link do painel. O
> caminho de entrada no grupo depende inteiramente de email real.
> **Dependência reduzida:** o card dependia de RV-130 (observabilidade). Para publicar não é preciso o
> pacote inteiro — leve só `GET /api/pronto` do RV-130 junto, e deixe métricas e decorators de log para
> a Onda 3. RV-130 continua devendo o resto.

**Contexto técnico**
- A API é _stateful_ para sockets: se escalar para mais de uma instância, o Socket.IO precisa de adapter compartilhado. **Decisão inicial:** uma instância só, com o adapter documentado como pré-requisito de escala.
- Hoje o web usa proxy do Vite para `/api` e `/socket.io`; em produção é preciso `VITE_API_URL` ou proxy no mesmo domínio.

**Escopo**
- `apps/api/Dockerfile` (multi-stage, usuário não-root) e `.dockerignore`
- Build da API para JS (hoje roda com `tsx`) — adicione `tsc` emitindo para `dist/`
- `apps/web`: `VITE_API_URL` e `VITE_SOCKET_URL` com padrão para o comportamento atual
- `docker-compose.yml` para subir tudo local
- `docs/deploy.md`: variáveis, CORS, domínio do Resend, bucket do Storage
- Workflow de deploy no CI

**Critérios de aceite**
```gherkin
Cenário: Imagem sobe e responde
  Quando eu rodar o container com as variáveis corretas
  Então GET /api/saude responde 200 em menos de 10 segundos

Cenário: Web em produção fala com a API
  Dado o build do web com VITE_API_URL apontando para a API publicada
  Então login, chat e socket funcionam sem depender do proxy do Vite

Cenário: CORS restrito
  Dado ORIGEM_WEB configurada
  Quando outra origem chamar a API
  Então o navegador bloqueia a requisição

Cenário: Falta de variável derruba cedo
  Quando eu subir o container sem JWT_SEGREDO
  Então o processo encerra imediatamente com mensagem clara

Cenário: O convite chega de verdade
  Dado o ambiente publicado com RESEND_API_KEY e EMAIL_REMETENTE de um domínio verificado
  Quando o mestre convidar um endereço que não é o dele
  Então o email chega na caixa de entrada com o link apontando para o domínio publicado
  E o convidado aceita e entra na mesa sem que ninguém leia o log da API
```

**DoD específico**
- [ ] Nenhum segredo na imagem ou no repositório.
- [ ] Escala horizontal documentada (adapter Redis do Socket.IO) mesmo que não implementada.
- [ ] Um convite real entregue a um endereço de terceiro, com data e ambiente registrados — o caminho
      de entrada no grupo nunca foi exercitado fora do `ServicoEmailConsole`.
- [ ] `GET /api/pronto` respondendo (fatia mínima do RV-130 trazida junto).

---

### RV-133 — E2E do fluxo crítico

**Épico:** E13 · **Depende de:** RV-006, RV-132 · **Tamanho:** G · **Onda:** 3

**História**
> Como **mantenedor**, quero **um teste que percorre a jornada inteira**, para **ter certeza de que a plataforma funciona de ponta a ponta antes de cada release**.

**Contexto técnico**
- Rode contra `PERSISTENCIA=memoria` (RV-006) para não depender de Supabase no CI.

**Escopo**
- Playwright em `apps/web/e2e/`
- Cenário multiusuário com dois contextos de navegador (mestre e jogador)
- Job de CI separado, com vídeo/trace em caso de falha

**Critérios de aceite**
```gherkin
Cenário: Jornada completa mestre + jogador
  Dado dois navegadores abertos
  Quando o mestre registrar, criar uma mesa, criar uma cena e convidar o jogador
  E o jogador registrar com o email convidado e aceitar o convite
  E o mestre criar um token vinculado ao personagem do jogador
  E o jogador mover esse token
  Então o mestre vê o token na nova posição sem recarregar
  E uma rolagem "/r 1d20" do jogador aparece nos dois navegadores

Cenário: Autorização na prática
  Quando o jogador tentar criar uma cena pela interface
  Então a ação não está disponível
  E a chamada direta à API retorna 403

Cenário: Convite por email em teste
  Então o link de convite é obtido do ServicoEmail em modo console, sem enviar email real
```

**DoD específico**
- [ ] E2E roda em menos de 3 minutos e não depende de rede externa.

---

### RV-134 — Teste de carga do tempo real

**Épico:** E13 · **Depende de:** RV-133 · **Tamanho:** M · **Onda:** 3

**História**
> Como **operador**, quero **conhecer o limite de uma mesa**, para **saber quantos grupos a instância aguenta**.

**Escopo**
- Script com clientes `socket.io-client` simulando N mesas × 6 jogadores
- Carga: movimento de token, chat e rolagem em cadência realista
- `docs/carga.md` com resultados e gargalos

**Critérios de aceite**
```gherkin
Cenário: Meta de latência
  Dado 8 clientes na mesma mesa movendo tokens
  Então o p95 entre emitir e receber "token:atualizado" fica abaixo de 150 ms

Cenário: Múltiplas mesas
  Dado 20 mesas simultâneas com 6 clientes cada
  Então a API se mantém estável por 10 minutos, sem vazamento de memória

Cenário: Isolamento entre salas
  Então nenhum evento de uma mesa chega a clientes de outra
```

**DoD específico**
- [ ] Resultado registrado com data, versão e hardware.

---

### RV-131 — Backup e retenção

**Épico:** E13 · **Depende de:** RV-132 · **Tamanho:** P · **Onda:** 3

**História**
> Como **mestre**, quero **saber que minha campanha de 2 anos não some**, para **confiar a plataforma ao meu grupo**.

**Escopo**
- `docs/operacao.md`: política de backup do Supabase, teste de restauração, retenção de mensagens
- Rotina opcional de arquivamento de mensagens de mesas encerradas há mais de 1 ano
- Exportação da mesa em JSON (`GET /mesas/:mesaId/exportar`, só mestre)

**Critérios de aceite**
```gherkin
Cenário: Exportar campanha
  Quando eu exportar a mesa
  Então recebo um JSON com mesa, participantes, cenas, tokens, personagens e mensagens

Cenário: Só o mestre exporta
  Dado que sou jogador
  Então recebo 403

Cenário: Restauração testada
  Então o procedimento de restauração está documentado e foi executado ao menos uma vez, com data registrada
```

---

### RV-135 — LGPD: exclusão e portabilidade

**Épico:** E13 · **Depende de:** RV-131 · **Tamanho:** G · **Onda:** 3

**História**
> Como **usuário**, quero **exportar e excluir meus dados**, para **exercer meus direitos sobre as informações que forneci**.

**Contexto técnico**
- Conflito real a resolver: excluir um usuário não pode apagar o histórico das mesas dos outros. Solução: **anonimizar** (`mensagens.autor_id` já é `on delete set null`; `autor_nome` passa a "Usuário removido") e apagar dados pessoais.
- `mesas.mestre_id` é `on delete restrict`: exigir encerrar ou transferir as mesas antes.

**Escopo**
- `GET /auth/eu/dados` (exportação completa em JSON)
- `DELETE /auth/eu` com confirmação por senha
- `apps/api/src/aplicacao/contas/excluir-conta.ts` com a política de anonimização
- `docs/privacidade.md` e aviso na UI

**Critérios de aceite**
```gherkin
Cenário: Exportação completa
  Quando eu solicitar meus dados
  Então recebo JSON com conta, mesas, personagens e mensagens que escrevi

Cenário: Exclusão anonimiza o histórico alheio
  Quando eu excluir minha conta
  Então meus dados pessoais são apagados
  E minhas mensagens permanecem nas mesas como "Usuário removido"
  E meus personagens ficam sem dono, sem sumir das mesas

Cenário: Mestre com mesa ativa
  Dado que sou mestre de uma mesa não encerrada
  Quando eu tentar excluir a conta
  Então recebo 409 orientando transferir a mestrança ou encerrar a mesa

Cenário: Exclusão exige confirmação
  Quando eu enviar a senha errada
  Então a conta não é excluída
```

**Testes obrigatórios**
- Use case: após exclusão, nenhuma tabela retém email, hash de senha ou nome do usuário.
- Contrato: mestre com mesa ativa → 409.

---

### RV-136 — Cobertura automatizada dos adapters Supabase

**Épico:** E13 · **Depende de:** — · **Tamanho:** M · **Onda:** 2

**História**
> Como **mantenedor**, quero **testar os repositórios Supabase sem banco e sem rede**, para **que uma divergência entre o fake em memória e o adapter real apareça no CI, não na mesa de alguém**.

**Contexto técnico**
- Os fakes de RV-003 são **generosos por construção**: `FakeMesaRepository.salvar` regrava o agregado inteiro, então "remover participante" passa nele mesmo que o adapter real esqueça o `delete`. Foi exatamente esse o risco levantado no RV-021 — e a única forma de fechá-lo foi olhar as operações que saem para o PostgREST.
- O padrão já existe e funciona: [mesa-repository.supabase.test.ts](../../apps/api/src/infra/supabase/mesa-repository.supabase.test.ts) usa um `SupabaseClient` falso que registra tabela, verbo, linhas e filtros, e prova coisas que nenhum fake provaria (ordem `upsert` → `delete`, filtro `usuario_id=not.in.(...)`, convite revogado por upsert e não por delete).
- **Faltam três adapters e meio**: `cena-repository.supabase.ts`, `personagem-repository.supabase.ts`, `usuario-repository.supabase.ts` e o `salvar` de `mensagem-repository.supabase.ts` em [infra/supabase/](../../apps/api/src/infra/supabase/). Divergência concreta à espreita: `FakeCenaRepository.removerToken` apaga do `Map`, enquanto o adapter real depende do `delete` e do `on delete cascade` da migration.
- **Atualização da v0.5.0:** a **leitura** de mensagens ganhou teste
  ([mensagem-repository.supabase.test.ts](../../apps/api/src/infra/supabase/mensagem-repository.supabase.test.ts))
  porque a privacidade de sussurro e rolagem oculta em produção depende da string do `.or()`, e nenhum
  teste de rota a exercitava — o fake filtra com `mensagemVisivelPara`, que é fiel à **regra** e não
  prova a **consulta**. Foi medido: trocar o filtro por `[...TIPOS_MENSAGEM_PUBLICOS, 'sussurro']`
  deixa o teste do adapter vermelho e os **15** testes de `rotas-chat.test.ts` verdes. Use esse arquivo
  como molde para os demais.
- **Atualização da v0.6.0 — o adapter de personagens cresceu e ganhou meio teste.** O
  [mapper](../../apps/api/src/infra/supabase/personagem.mapper.test.ts) passou a ter teste próprio (é
  ele que prova que a ficha gravada antes da `0007` sobrevive), mas a **consulta** continua provada só
  por leitura, e agora ela tem mais superfície: `remover()` (um `delete().eq('id', ...)`), a coluna
  `dados` acrescentada à constante `COLUNAS` de todo `select`/`upsert` e o join de `usuarios(nome)`.
- **Divergência concreta nova, entregue pelo RV-093:** `tokens.personagem_id` é `on delete set null`
  desde a `0001`, e o `FakeCenaRepository` **não emula a FK** — depois de excluir a ficha ele mantém o
  `personagemId` morto no token. Hoje é inofensivo (nada lê `token.personagemId` sem cruzar com a
  lista de personagens), mas o primeiro código que inferir "tem ficha" de `personagemId !== null` vai
  divergir entre teste e produção. O barato é ensinar o fake a zerar o vínculo quando a ficha some, no
  mesmo lote deste card.
- **Peso novo no adapter de cenas:** a limpeza do [RV-047](04-tokens.md#rv-047--apagar-a-arte-do-token-do-storage-ao-excluir-token-ou-cena)
  depende de `listarTokensDaCena` devolver `imagem_caminho` **antes** da cascata. O `FakeCenaRepository`
  replica a cascata e por isso o experimento fica vermelho nele — mas se `COLUNAS_TOKEN` perder a
  coluna no adapter real, o sintoma é silencioso: o bucket volta a crescer e nada acusa.
- Nada mais no backlog cobre isso: RV-009 pega **coluna inexistente** (tipos), não comportamento; RV-133 (E2E) roda com `PERSISTENCIA=memoria` (RV-006), ou seja, **nem o E2E encosta nos adapters Supabase**.
- **Atualização da v0.9.0 — o molde melhorou e o alvo encolheu, mas o adapter de cenas ficou.**
  [combate-repository.supabase.test.ts](../../apps/api/src/infra/supabase/combate-repository.supabase.test.ts)
  nasceu com o padrão certo e é hoje o melhor molde: ele assere o **filtro exato** do `delete` de
  sincronização (`combate_id=eq.… ` + `token_id=not.in.("…")`), a ordem delete-antes-de-upsert, o combate sem
  ninguém apagando tudo sem filtro de token e `ativo = false` como upsert (nunca delete). Já
  `cena-repository.supabase.ts` **continua sem teste**, e agora carrega mais risco: `tokens.condicoes` entrou em
  `COLUNAS_TOKEN` e a ida e volta contra o Postgres real foi conferida por **script descartável** na entrega do
  RV-064, não por suíte — o `FakeCenaRepository` regrava o agregado inteiro e jamais exporia uma coluna
  esquecida no upsert. É o primeiro alvo deste card.
- **Atualização da v0.9.0 — o cenário de borda deste card contradiz a arquitetura, e é o card que está errado.**
  A [regra 07](../../.claude/rules/07-supabase.md), reescrita contra o código no RV-140, registra o desenho real:
  erro do supabase-js é **falha de infraestrutura** e vira exceção com contexto (`garantirSemErro` em
  `infra/supabase/cliente.ts`), enquanto conflito de negócio é detectado pelo domínio **antes** da escrita —
  deduzir regra de negócio de código de erro de driver acoplaria o domínio a mensagem de driver. O cenário
  "unique violation → `Result` de conflito" abaixo pede o contrário e foi corrigido. **Sobra uma janela real,
  medida e sem dono:** na corrida, o segundo `insert` estoura o `unique` e o cliente recebe **500 em vez de 409**
  — dois registros simultâneos com o mesmo email, e dois cliques simultâneos em "Iniciar combate" contra o
  índice único parcial `idx_combates_ativo_por_mesa` da `0012` (que também **não tem consumidor automatizado**:
  nenhum teste em disco afirma que ele existe). Decidir se essas corridas merecem tradução para 409 é decisão de
  produto; enquanto não for tomada, o comportamento é "erro genérico em PT-BR", não o 409 que a rota promete no
  caminho sequencial.
- **Armadilha:** não transforme isto em teste de banco. Nada de container Postgres no CI ([ci.yml](../../.github/workflows/ci.yml) não tem e não pode ter credencial). O duplo do cliente é o contrato: se ele precisar simular SQL, o teste está grande demais.

**Escopo**
- `apps/api/src/testes/fakes/cliente-supabase-falso.ts`: extrair o duplo já escrito no teste de mesas para uso comum
- `apps/api/src/infra/supabase/cena-repository.supabase.test.ts`, `mensagem-repository.supabase.test.ts`, `personagem-repository.supabase.test.ts`, `usuario-repository.supabase.test.ts`
- `apps/api/src/infra/supabase/mesa-repository.supabase.test.ts`: passar a usar o duplo compartilhado

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — a escrita arriscada de cada agregado é observada
  Dado o repositório de cenas com um token removido do agregado
  Quando eu salvar a cena
  Então o adapter emite o delete daquele token com o filtro correto
  E não regrava os tokens que continuaram na cena

Cenário: Borda — erro do supabase-js falha alto, com contexto da operação
  Dado que o cliente devolve erro ao salvar um usuário
  Quando o repositório tratar a resposta
  Então a falha é lançada com o contexto da operação, e não engolida nem convertida em regra de negócio
  E o conflito de negócio continua sendo detectado pelo domínio antes da escrita

Cenário: Fronteira — nenhum teste toca rede, banco ou credencial
  Dado um ambiente sem variáveis do Supabase
  Quando eu rodar "npm run test"
  Então toda a suíte de adapters passa offline
```

**Testes obrigatórios**
- Um `*.supabase.test.ts` por adapter cobrindo, no mínimo: colunas listadas explicitamente (nunca `select('*')`, conforme [07-supabase.md](../../.claude/rules/07-supabase.md)), tradução de erro do supabase-js para `ErroDominio` e a operação de escrita mais arriscada do agregado (sincronização de filhos ou remoção).
- Mapper: row → entidade → row preserva os campos (ida e volta), incluindo os que nasceram em migrations posteriores.

**DoD específico**
- [ ] Duplo do `SupabaseClient` num único arquivo reutilizável, não copiado por teste.
- [ ] Todo arquivo `*-repository.supabase.ts` tem teste vizinho.
- [ ] Nenhum teste exige rede, credencial, container ou banco.

---

### RV-137 — Limites de abuso no Socket.IO

**Épico:** E13 · **Depende de:** RV-004 · **Tamanho:** M · **Onda:** 2

**História**
> Como **operador**, quero **limitar handshakes e eventos por socket e por IP**, para **que o caminho de tempo real não seja a porta aberta que o endurecimento do HTTP fechou**.

**Contexto técnico**
- RV-004 protegeu **só o HTTP**: `@fastify/helmet` e `@fastify/rate-limit` são plugins do Fastify, e o Socket.IO é anexado a `app.server` em [main.ts](../../apps/api/src/main.ts) — o handshake e os eventos WS **não passam pelos hooks do Fastify**. Na prática, o limite de 300 req/min e o balde de 10/min do login não alcançam uma linha do tempo real.
- Hoje o abuso é barato: abrir handshakes em laço (cada um valida token) e emitir `mesa:entrar` repetidamente, evento que **consulta o repositório de mesas a cada chamada** ([gateway-jogo.ts](../../apps/api/src/apresentacao/ws/gateway-jogo.ts)).
- A superfície cresce com o backlog: RV-111 (digitação) e RV-113 (ping) pedem throttle **no cliente** — e um cliente hostil simplesmente não aplica. O limite precisa existir no servidor antes desses cards.
- **Decisão a registrar:** contadores **em memória**, no gateway, que já é a fachada única do tempo real ([04-design-patterns.md](../../.claude/rules/04-design-patterns.md)). Nada no banco, nada em Redis — quando houver mais de uma instância (RV-132), o limite passa a ser por instância, e isso deve ficar escrito.
- **Armadilha:** limite por IP precisa ser generoso (NAT, grupo jogando na mesma casa, várias abas), enquanto o limite por socket pode ser estrito. Invertê-los expulsa jogador legítimo.

**Escopo**
- `apps/api/src/apresentacao/ws/limites.ts`: contador por socket e por IP com janela deslizante
- `apps/api/src/apresentacao/ws/gateway-jogo.ts`: aplicar **antes** de qualquer repositório, no handshake e em cada evento
- `apps/api/src/config/env.ts` + `.env.example`: `WS_MAX_CONEXOES_POR_IP`, `WS_MAX_EVENTOS_JANELA`, `WS_JANELA`
- Desligável em teste, como `rateLimit: false` já faz no [harness](../../apps/api/src/testes/harness.ts)

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — uso legítimo nunca é barrado
  Dado um jogador que entra na mesa, troca de aba e reconecta algumas vezes
  Quando ele operar em cadência humana por uma sessão inteira
  Então nenhum evento dele é recusado

Cenário: Inundação de eventos é cortada
  Dado um socket que emite "mesa:entrar" acima do limite da janela
  Quando o limite estourar
  Então o ack devolve { ok: false } com mensagem em PT-BR sobre excesso de requisições
  E nenhum repositório é consultado nas chamadas recusadas
  E o socket é desconectado após reincidência

Cenário: Autorização — limite não substitui autenticação
  Dado um handshake sem token válido
  Quando o cliente tentar conectar
  Então a conexão é recusada como hoje, independentemente de haver cota disponível

Cenário: Borda — mesma casa, vários jogadores
  Dado 6 jogadores atrás do mesmo IP, cada um com uma aba
  Então todos conectam normalmente e ninguém é desconectado pelo limite de IP
```

**Testes obrigatórios**
- Gateway com socket falso: evento além do limite é recusado sem tocar em repositório; dentro do limite, segue o fluxo normal.
- Contagem por IP: N conexões legítimas do mesmo IP passam; a conexão acima do teto é recusada com mensagem em PT-BR.
- Harness: com os limites desligados, os contratos existentes continuam verdes.

**DoD específico**
- [ ] Estado dos limites só em memória — nenhuma escrita no banco por evento recusado.
- [ ] Limites desligáveis em teste, sem poluir os contratos dos outros cards.
- [ ] Comportamento sob múltiplas instâncias documentado (limite por instância) junto ao RV-132.

---

### RV-138 — Aplicar as migrations pendentes e provisionar o Storage

**Épico:** E13 · **Depende de:** RV-032, RV-041 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

> **Decisões tomadas na entrega.** As migrations `0002`, `0003` e `0004` foram aplicadas e os buckets
> `mapas` e `tokens` provisionados no projeto **`yewjuijqqenmckhxrnrc`**. Conferido pelo curador em
> 2026-08-09 com `npm run supabase:verificar -w @rolavinte/api`: 8 tabelas ✓ e 2 buckets ✓.
> **O registro do que foi aplicado virou ferramenta, não documento.** Em vez do
> `apps/api/supabase/README.md` que o Escopo previa — que desatualiza na migration seguinte —, a
> entrega criou dois scripts: `npm run supabase:sql` ([sql-de-instalacao.mjs](../../apps/api/scripts/sql-de-instalacao.mjs)),
> que concatena **os arquivos reais** de `supabase/migrations/` mais `configurar-storage.sql`, e
> `npm run supabase:verificar` ([verificar-supabase.mjs](../../apps/api/scripts/verificar-supabase.mjs)),
> que confere tabela a tabela **citando a migration que satisfaz cada verificação**, para que uma
> aplicação parcial seja diagnosticada em vez de adivinhada.
> **A partida recusa a chave publicável** com a explicação em PT-BR, porque com RLS em deny-all a API
> subiria feliz e devolveria todas as consultas vazias — falha silenciosa trocada por falha na largada.
> **⚠️ A ferramenta de verificação nasceu com uma lista escrita à mão** e por isso não conhece a
> `0005_chat.sql`, criada na mesma fase: o ambiente passa na verificação **e o chat inteiro falha**.
> Isso é [RV-139](#rv-139--o-verificador-de-ambiente-precisa-conhecer-toda-migration-do-repositório) —
> este card fechou o que prometeu, mas a promessa envelheceu em uma fase.

**História**
> Como **mantenedor**, quero **o banco e o Storage de um ambiente real batendo com o código entregue**, para **que cenas, mapas e artes de token funcionem fora dos testes com fake**.

**Contexto técnico**
- **Nada dos épicos E03 e E04 rodou contra Postgres.** Três migrations estão escritas e **nunca foram aplicadas em ambiente nenhum**: `0002_ciclo_de_vida_das_mesas.sql` (E02), `0003_cenas.sql` e `0004_tokens.sql` em [apps/api/supabase/migrations/](../../apps/api/supabase/migrations/).
- Os buckets `mapas` e `tokens` **não existem em lugar nenhum**, e [supabase-armazenamento-arquivos.ts](../../apps/api/src/infra/storage/supabase-armazenamento-arquivos.ts) (`upload` → `getPublicUrl` → `remove`) nunca falou com o Storage de verdade. É o trecho de maior risco de runtime das duas entregas.
- Os mappers ganharam **7 colunas novas** sem nenhuma rede: 5 em [cena.mapper.ts](../../apps/api/src/infra/supabase/cena.mapper.ts) (`imagem_fundo_url`, `imagem_fundo_caminho`, `tamanho_celula`, `grid_visivel`, `cor_grid`) e 2 no token (`imagem_url`, `imagem_caminho`). Enquanto [RV-009](00-fundacao.md) não existir, um nome de coluna errado **compila** e só quebra na mesa de alguém. `SupabaseCenaRepository.listarDaMesa` ainda ordena por `criado_em`, coluna que não está em `COLUNAS_CENA`.
- **Decisão já tomada e a honrar:** buckets **públicos para leitura**, porque a URL fica persistida em `cenas.imagem_fundo_url` e `tokens.imagem_url` (URL assinada expiraria com o registro já gravado). Escrita **exclusiva do backend com service role** — nenhuma policy de insert/update/delete para `anon` ou `authenticated`. A justificativa está escrita nas migrations `0003`/`0004`; este card só a executa.
- **Armadilha 1:** migration aplicada é **imutável**. Se um ambiente já tiver parte do schema, crie a próxima migration — não edite a `0003`/`0004` para "acertar".
- **Armadilha 2:** o nome do bucket entra na URL persistida. Renomear ou recriar bucket depois **quebra todo mapa e toda arte já salvos**; escolha o nome uma vez.
- **Armadilha 3:** este é o primeiro boot com credenciais reais desde o E02. Espere encontrar erro de coluna e de policy — o valor do card está justamente aí, e cada correção é migration nova, não remendo no mapper.

**Escopo**
- Aplicação de `0002`, `0003` e `0004` **em ordem** no SQL Editor do Supabase
- Criação dos buckets `mapas` e `tokens` com as policies (leitura pública, escrita só service role) — pelo SQL da migration ou pelo painel, registrando **qual é o caminho oficial**
- `apps/api/supabase/README.md` (ou a seção equivalente): registro do que foi aplicado, quando e em que ambiente
- `.env.example` e `README.md`: variáveis e pré-requisitos do Storage
- Migration nova para qualquer divergência encontrada

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — a mesa funciona ponta a ponta com banco real
  Dado um ambiente com as migrations 0002, 0003 e 0004 aplicadas e os buckets criados
  Quando o mestre criar duas cenas, subir um PNG de fundo, ativar a outra cena e subir a arte de um token
  Então tudo persiste entre recarregamentos da página
  E as URLs gravadas carregam a imagem no navegador

Cenário: Autorização — o Storage não aceita escrita de fora do backend
  Dado uma chave anon do projeto
  Quando eu tentar gravar ou apagar um arquivo nos buckets "mapas" ou "tokens"
  Então a operação é recusada pela policy
  E a leitura pública continua funcionando

Cenário: Borda — schema desatualizado falha de forma legível
  Dado um ambiente sem a migration 0003 aplicada
  Quando alguém abrir a cena
  Então a API responde 500 padronizado com requisicaoId (RV-005)
  E o log aponta a coluna ausente, sem exceção crua vazando ao cliente
```

**Testes obrigatórios**
- Este card **não tem teste automatizável no CI** — não há credencial de Supabase lá, e não pode haver ([ci.yml](../../.github/workflows/ci.yml)). A verificação é manual e a evidência (ambiente, data, saída de cada passo) fica registrada no PR.
- A suíte offline continua verde depois de qualquer migration corretiva: mapper alterado → `npm run test` verde sem rede.
- Divergência encontrada aqui vira caso de teste em [RV-136](#rv-136--cobertura-automatizada-dos-adapters-supabase) (adapters com cliente falso) ou em [RV-009](00-fundacao.md) (tipos gerados), conforme a natureza — o objetivo é que o mesmo erro não precise de banco real para reaparecer.

**DoD específico**
- [ ] Migrations `0002`, `0003` e `0004` aplicadas, com data e ambiente registrados; nenhuma migration aplicada foi editada.
- [ ] Buckets `mapas` e `tokens` existentes, com leitura pública e escrita só por service role, e o caminho de criação documentado.
- [ ] Um mapa e uma arte de token realmente enviados, visíveis após recarregar e removidos ao trocar o arquivo.
- [ ] Toda divergência encontrada virou migration nova e, quando possível, teste offline.

---

### RV-139 — O verificador de ambiente precisa conhecer toda migration do repositório

**Épico:** E13 · **Depende de:** RV-138 · **Tamanho:** P · **Onda:** 1

**História**
> Como **mantenedor**, quero **que `supabase:verificar` só diga "ambiente pronto" quando todas as migrations do repositório estiverem aplicadas**, para **não descobrir schema faltando pelo chat morrendo na cara de cinco pessoas**.

**Contexto técnico**
- **Defeito confirmado no fecho da v0.5.0, com o comando na mão.**
  `npm run supabase:verificar -w @rolavinte/api` contra `yewjuijqqenmckhxrnrc` imprime
  **"Ambiente pronto: schema e Storage conferem."**, e uma consulta direta a
  `mensagens.destinatario_id` no mesmo projeto responde
  `column mensagens.destinatario_id does not exist`. A migration
  [`0005_chat.sql`](../../apps/api/supabase/migrations/0005_chat.sql) **não está aplicada** e o
  verificador não sabe disso.
- **A consequência é maior do que "sussurro não funciona".**
  [mensagem-repository.supabase.ts](../../apps/api/src/infra/supabase/mensagem-repository.supabase.ts)
  lista `destinatario_id, destinatario_nome` na constante `COLUNAS` de **todo** `listarDaMesa`, e
  [mensagem.mapper.ts](../../apps/api/src/infra/supabase/mensagem.mapper.ts) grava as duas colunas em
  **todo** `insert`. Sem a `0005`, o histórico não abre e nenhuma mensagem é enviada: **o chat inteiro
  está fora do ar** contra o banco real, para fala comum inclusive. O `tipo` também precisa do CHECK
  novo — `sussurro` e `rolagem-oculta` são recusados pelo constraint da `0001`.
- **A fila cresceu para três migrations, e a mais nova amplia o estrago (curadoria da v0.6.0).** Além
  da `0005`, o repositório passou a ter a `0006_registro_de_migrations.sql` e a
  [`0007_fichas_por_sistema.sql`](../../apps/api/supabase/migrations/0007_fichas_por_sistema.sql), e
  **nenhuma das três foi aplicada** no projeto em uso. A `0007` acrescenta `personagens.dados`, que
  entra na constante `COLUNAS` de **todo** select e upsert de personagem: num banco sem ela, **abrir a
  aba de personagens de qualquer mesa quebra**, não só a ficha de sistema. Duas boas notícias medidas:
  o script já foi reescrito para **derivar do diretório** (último commit da v0.6.0), e a `0007` se
  registra em `migrations_aplicadas` — então o verificador a denuncia sozinho, sem ninguém editar
  lista nenhuma. O que falta aqui é **executar**: aplicar as três em ordem e registrar a saída.
- **São quatro, não três, e a quarta é a que impede um sistema inteiro de existir (curadoria da
  v0.7.0).** A [`0008_sistemas_check_pathfinder2e.sql`](../../apps/api/supabase/migrations/0008_sistemas_check_pathfinder2e.sql)
  recria o `check` de `mesas.sistema` incluindo `'pathfinder2e'`. Desde o RV-152 o valor está em
  `SISTEMAS_RPG`, e o select de criar mesa itera o enum: o dashboard **já oferece "Pathfinder 2e"** e,
  sem esta migration, escolhê-lo devolve erro de constraint no primeiro `INSERT` — o sintoma exato que
  o RV-096 nasceu para matar. **Este bullet existe porque a checklist escrita à mão logo abaixo diz
  "as três" e não pode ser seguida à risca**: é a mesma classe de falha (F1, lista à mão que
  desatualiza) que o próprio card diagnosticou no `VERIFICACOES`, reaparecendo dentro do card. Quem
  executar deve confiar no que `npm run supabase:verificar -w @rolavinte/api` deriva do diretório, não
  em nomes de arquivo escritos em prosa — aqui, no README do backlog ou em `sprints.md`. **Se ao pegar
  este card a saída do verificador listar mais arquivos do que os quatro nomeados, ela está certa e o
  texto está velho.**
- **A causa é a forma da guarda, não o esquecimento.** A lista `VERIFICACOES` em
  [verificar-supabase.mjs](../../apps/api/scripts/verificar-supabase.mjs) é escrita à mão, migration por
  migration, enquanto o irmão dele (`sql-de-instalacao.mjs`) **lê o diretório** e por isso não
  desatualiza. Uma guarda que precisa ser lembrada é a classe F1 da
  [taxonomia](../agentes/taxonomia-de-falhas.md): defesa que não defende. Corrigir só a lista deixa a
  próxima migration na mesma armadilha.
- **Decisão a registrar:** o verificador passa a **derivar do diretório**. Caminho mais simples que
  funciona: varrer `supabase/migrations/*.sql`, extrair os pares tabela→coluna dos `create table` e
  `add column if not exists`, e consultar `select('<colunas>').limit(0)` por tabela — mantendo o
  formato atual de saída, que cita a migration de cada verificação. Se a extração por parsing ficar
  frágil, a alternativa aceitável é manter a lista à mão **e** um teste offline que falhe quando
  existir um arquivo em `migrations/` sem nenhuma verificação que o cite. O que **não** é aceitável é
  a lista à mão sozinha: foi exatamente ela que falhou.
- **Armadilha 1:** `select(...).limit(0)` acusa coluna ausente, mas **não** acusa `check constraint`
  desatualizado — `mensagens.tipo` aceitando `sussurro` é o exemplo vivo. Uma verificação de constraint
  precisa de um `insert` de sonda em transação revertida ou de consulta ao catálogo; escolha uma e
  escreva o limite do que o script cobre na saída dele, para ninguém confundir "verde" com "tudo
  conferido".
- **Armadilha 2:** o script roda com `--env-file-if-exists=.env` e **service role**. Não o faça
  escrever nada fora de uma sonda explicitamente revertida, e nunca em tabela de produção sem `rollback`.
- **Armadilha 3:** aplicar a `0005` num projeto que já tem parte do schema é executar **só** aquele
  arquivo. Migration aplicada é imutável — divergência encontrada vira `0006`, não edição da `0005`.

**Escopo**
- Aplicação de **todas** as migrations pendentes que o verificador listar, **em ordem**, no ambiente
  `yewjuijqqenmckhxrnrc` (e em qualquer outro em uso). Na curadoria da v0.7.0 eram quatro:
  `0005_chat.sql`, `0006_registro_de_migrations.sql`, `0007_fichas_por_sistema.sql` e
  `0008_sistemas_check_pathfinder2e.sql` — confira a lista derivada do disco antes de começar, não esta
- `apps/api/scripts/verificar-supabase.mjs`: checklist derivada de `supabase/migrations/`
- `apps/api/scripts/*.test.mjs` ou `apps/api/src/testes/`: teste offline de que migration sem
  verificação correspondente derruba a suíte
- `README.md`: passo de verificação depois de cada migration nova

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — ambiente completo é aprovado
  Dado um projeto com todas as migrations do repositório aplicadas
  Quando eu rodar "npm run supabase:verificar -w @rolavinte/api"
  Então a saída lista uma verificação por migration, incluindo a mais recente
  E termina com sucesso

Cenário: Migration faltando é denunciada pelo nome
  Dado um projeto sem a migration 0005 aplicada
  Quando eu rodar o verificador
  Então ele falha nomeando "0005" e a coluna ausente
  E o processo sai com código diferente de zero

Cenário: Guarda que não pode ser esquecida
  Dado uma migration nova em supabase/migrations/ sem verificação correspondente
  Quando eu rodar "npm run test"
  Então a suíte falha apontando o arquivo de migration não coberto

Cenário: Borda — sem credencial, a falha é legível
  Dado um ambiente sem SUPABASE_URL
  Quando eu rodar o verificador
  Então recebo a orientação em PT-BR de preencher o .env, sem stack trace cru
```

**Testes obrigatórios**
- Offline, sem rede: migration sem verificação correspondente derruba `npm run test`. Prove que o teste
  sabe reprovar — crie um arquivo de migration temporário e veja o vermelho antes de confiar nele.
- A verificação contra o banco real continua manual; registre no PR o ambiente, a data e a saída.

**DoD específico**
- [ ] Todas as migrations pendentes aplicadas (quatro na curadoria da v0.7.0: `0005_chat.sql`,
      `0006_registro_de_migrations.sql`, `0007_fichas_por_sistema.sql` e
      `0008_sistemas_check_pathfinder2e.sql`), com chat funcionando ponta a ponta contra o banco real
      (fala, rolagem, sussurro entre duas contas e `/oculto` do mestre invisível ao jogador), a aba de
      personagens abrindo — a `0007` é pré-requisito de todo select de personagem, não só da ficha por
      sistema — **e uma mesa `pathfinder2e` criada de verdade**, que é o que prova a `0008` e o que
      nenhum teste desta suíte consegue provar, porque todos rodam com fakes.
- [ ] `npm run supabase:verificar -w @rolavinte/api` sem nenhuma pendência, com a saída colada no PR:
      é a lista derivada do diretório que vale, não a escrita neste card.
- [ ] A checklist do verificador não depende de alguém lembrar de editá-la.
- [ ] O que o script **não** cobre (check constraints, policies de Storage) está escrito na saída dele.

---

### RV-142 — Roteiro de fumaça contra o ambiente real, com ida e volta de cada campo

**Épico:** E13 · **Depende de:** RV-139 · **Tamanho:** M · **Onda:** 2

> Numeração fora da faixa do épico: `RV-130`…`RV-139` estão ocupados. O card é de operação, e o `**Épico:**`
> acima é o que vale.

**História**
> Como **mantenedor prestes a publicar uma versão**, quero **um roteiro executável que percorra o fluxo crítico contra o Supabase real e compare o que gravei com o que releio**, para **parar de descobrir defeito de costura só quando alguém abre o navegador**.

**Contexto técnico**
- **Este card existe por causa de um padrão medido em quatro sprints, não por gosto por testes.** Os três
  defeitos mais caros do projeto foram achados **fora da suíte**, com ela verde:
  [RV-159](15-pathfinder2e.md) (execução com Testing Library), [RV-098](09-fichas.md) (navegador contra o
  Supabase real, com 1.167 testes verdes) e [RV-160](15-pathfinder2e.md) (API em execução, com 1.475 verdes).
  Na v0.9.0 o mecanismo pagou de novo, agora dentro da verificação: a rolagem de iniciativa em combate encerrado
  gravava a mensagem no chat **antes** de recusar.
- **O que a suíte não alcança, e por que mais um teste unitário não resolve:** a **costura**. F3 (o fake regrava
  o agregado inteiro e nunca vê a coluna esquecida), F10 (migration em disco não é migration aplicada) e F12
  (campo exigido na escrita e ignorado na leitura, com cada metade testada sozinha). Os três só aparecem quando
  algo escreve e **relê** pelo caminho real.
- **O E2E do [RV-133](#rv-133--e2e-do-fluxo-crítico) não fecha esta classe, por desenho.** Ele roda com
  `PERSISTENCIA=memoria` (RV-006) para não depender de banco no CI — o próprio
  [RV-136](#rv-136--cobertura-automatizada-dos-adapters-supabase) já registra que "nem o E2E encosta nos adapters
  Supabase". E ele depende de [RV-132](#rv-132--deploy-de-api-e-web), que está uma sprint adiante. **Este card
  não depende de nenhum dos três** e roda hoje, com o projeto Supabase que já existe: é a diferença entre a
  defesa chegar agora e chegar em duas sprints.
- **O que já existe para reusar:** `npm run supabase:verificar -w @rolavinte/api` confere migrations aplicadas ×
  disco e os buckets — ele responde "o schema está lá", **não** "os dados atravessam". `apps/api/scripts/`
  hospeda os utilitários de migration e é onde o roteiro pertence.
- **Armadilha — o valor está no `then`, não no `when`.** Um roteiro que só chama rotas e confere status vira
  monitor de saúde. O que ele tem de fazer é **gravar informando um valor e reler pelo mesmo contrato**,
  comparando campo por campo, e **falhar nomeando o campo** que voltou diferente. Foi exatamente isso que
  ninguém tinha quando `atributos` e `dados.modificador*` conviviam com valores contraditórios na mesma linha.
- **Armadilha — não vire teste de carga nem suíte paralela.** É um roteiro só, curto, rodado à mão antes de
  publicar. Ele não entra no `npm run test` (exige credencial), não vai para o CI e não replica asserção que a
  suíte já faz offline.
- **Armadilha — dado de auditoria em base real é lixo que fica.** A v0.8.0 deixou 4 usuários, 7 mesas, 5
  personagens e 7 mensagens com prefixos de verificação, porque apagar linha em base real é decisão de quem
  opera. O roteiro deve marcar tudo o que cria com um prefixo único e **relatar ao fim o que criou**, com o SQL
  de limpeza pronto — sem apagar por conta própria.

**Escopo**
- `apps/api/scripts/fumaca-ambiente-real.mjs` — o roteiro, com prefixo por execução e relatório final
- `apps/api/package.json` — o script `fumaca` (invocado com `-w @rolavinte/api`)
- `README.md` — como rodar, e a advertência de que ele escreve em base real
- `.claude/agents/verificador.md` — o roteiro entra na lista de auditoria de quem verifica a sprint

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — o fluxo crítico atravessa
  Dado um .env apontando para o Supabase em uso
  Quando eu rodar o roteiro
  Então ele registra uma conta, cria mesa, cena, token, ficha e combate, rola dados e aplica dano
  E imprime, em PT-BR, o que criou e o SQL para apagar

Cenário: Ida e volta de campo informado
  Quando o roteiro gravar cada campo que o usuário informa (atributos, dados do sistema, condições, iniciativa, PV)
  E reler pelo mesmo contrato de leitura
  Então qualquer divergência falha nomeando o campo, o valor gravado e o valor relido

Cenário: Borda — migration em disco e não aplicada
  Dado um arquivo de migration que o banco não registra
  Então o roteiro para antes de escrever, dizendo qual falta e o comando para aplicá-la

Cenário: Borda — ambiente sem credencial
  Quando eu rodar sem SUPABASE_URL
  Então recebo a orientação em PT-BR, sem stack trace cru, e nada é criado
```

**Testes obrigatórios**
- O roteiro **é** a verificação; o que precisa de teste é a comparação de ida e volta, que deve ser função pura
  testável offline (recebe gravado e relido, devolve as divergências nomeadas).
- Experimento obrigatório de vermelho: remova um campo do `select` de um mapper e confirme que o roteiro
  **nomeia** o campo perdido. Sem esse experimento o roteiro não vale nada — é a lição da guarda de migration
  que passava verde por asserção vaga.

**DoD específico**
- [ ] Roda em menos de dois minutos e não exige navegador.
- [ ] A saída diz **qual ambiente** foi exercitado, a data e o prefixo usado — sem isso a evidência não é
      auditável.
- [ ] Nenhuma asserção duplica algo que a suíte offline já prova.
