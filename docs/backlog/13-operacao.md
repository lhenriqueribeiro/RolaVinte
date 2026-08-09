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

**Épico:** E13 · **Depende de:** RV-002, RV-130 · **Tamanho:** G · **Onda:** 3

**História**
> Como **mantenedor**, quero **publicar a plataforma com um comando**, para **que o grupo jogue de qualquer lugar**.

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
```

**DoD específico**
- [ ] Nenhum segredo na imagem ou no repositório.
- [ ] Escala horizontal documentada (adapter Redis do Socket.IO) mesmo que não implementada.

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
- **Os outros quatro adapters continuam sem nenhum teste**: `cena-repository.supabase.ts`, `mensagem-repository.supabase.ts`, `personagem-repository.supabase.ts` e `usuario-repository.supabase.ts` em [infra/supabase/](../../apps/api/src/infra/supabase/). Divergência concreta à espreita: `FakeCenaRepository.removerToken` apaga do `Map`, enquanto o adapter real depende do `delete` e do `on delete cascade` da migration.
- Nada mais no backlog cobre isso: RV-009 pega **coluna inexistente** (tipos), não comportamento; RV-133 (E2E) roda com `PERSISTENCIA=memoria` (RV-006), ou seja, **nem o E2E encosta nos adapters Supabase**.
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

Cenário: Borda — erro do supabase-js vira ErroDominio
  Dado que o cliente devolve violação de unicidade ao salvar um usuário
  Quando o repositório tratar a resposta
  Então o resultado é um Result de falha do tipo "conflito", sem exceção vazando

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

**Épico:** E13 · **Depende de:** RV-032, RV-041 · **Tamanho:** M · **Onda:** 1

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
