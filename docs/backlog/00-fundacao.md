# E00 — Fundação técnica e qualidade

Sem estes cards, todo card posterior custa mais caro. Priorize RV-001 a RV-005 antes de qualquer feature.

---

### RV-001 — ESLint + Prettier + lint de arquitetura

**Épico:** E00 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **mantenedor**, quero **que violações de camada e estilo quebrem o build**, para **que os guardrails de `.claude/rules/` sejam mecânicos e não dependam de revisão humana**.

**Contexto técnico**
- Hoje não há linter. A regra de dependência ([01-arquitetura.md](../../.claude/rules/01-arquitetura.md)) é verificada só em review.
- Use `eslint` flat config na raiz + `eslint-plugin-boundaries` (ou `import/no-restricted-paths`) para as fronteiras.

**Escopo**
- `eslint.config.js` (raiz), `.prettierrc` (raiz)
- `package.json` (raiz): scripts `lint` e `format`; incluir `lint` no `check`
- devDependencies nos workspaces que precisarem

**Fronteiras a codificar**
| De | Não pode importar |
|---|---|
| `apps/api/src/dominio/**` | `aplicacao`, `infra`, `apresentacao`, `fastify`, `@supabase/*`, `resend`, `socket.io` |
| `apps/api/src/aplicacao/**` | `infra`, `apresentacao`, `fastify`, `@supabase/*`, `resend`, `socket.io` |
| `apps/api/src/infra/**` | `apresentacao` |
| `apps/api/src/apresentacao/**` | `infra` (exceto `main.ts`) |
| `apps/web/src/components/**` | `lib/socket` |

**Critérios de aceite**
```gherkin
Cenário: Import proibido derruba o lint
  Dado um arquivo em "apps/api/src/dominio/" que importa "@supabase/supabase-js"
  Quando eu rodar "npm run lint"
  Então o comando falha apontando a violação de fronteira

Cenário: Código atual está limpo
  Dado o repositório no estado atual
  Quando eu rodar "npm run lint"
  Então o comando termina com sucesso e sem avisos
```

**Testes obrigatórios**
- Fixture temporária com import proibido comprovando que a regra dispara (pode ser um teste manual documentado no PR).

**DoD específico**
- [ ] `npm run check` executa lint + typecheck.
- [ ] Zero erro e zero warning no código existente (ajuste o código, não a regra).

---

### RV-002 — Pipeline de CI

**Épico:** E00 · **Depende de:** RV-001 · **Tamanho:** P · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **mantenedor**, quero **que todo push rode check, testes e build**, para **que main nunca fique quebrada**.

**Escopo**
- `.github/workflows/ci.yml`

**Critérios de aceite**
```gherkin
Cenário: PR com typecheck quebrado é bloqueado
  Dado um pull request cujo "npm run check" falha
  Quando o CI executar
  Então o workflow falha e o PR fica marcado como não mergeável

Cenário: PR saudável passa em menos de 5 minutos
  Dado um pull request sem erros
  Quando o CI executar
  Então lint, typecheck, testes e build terminam com sucesso
```

**DoD específico**
- [ ] Node 22 e cache de `node_modules` configurados.
- [ ] Job roda em `push` e `pull_request`.
- [ ] Nenhum segredo real necessário para o CI passar (a API não sobe no CI).

---

### RV-003 — Harness de testes de contrato HTTP

**Épico:** E00 · **Depende de:** — · **Tamanho:** G · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **agente que implementa rotas**, quero **um harness que suba a API com adaptadores em memória**, para **testar rotas de ponta a ponta sem Supabase nem rede**.

**Contexto técnico**
- [09-testes-e-qualidade.md](../../.claude/rules/09-testes-e-qualidade.md) exige testes de contrato com `fastify.inject()`.
- Hoje o composition root ([main.ts](../../apps/api/src/main.ts)) instancia Supabase direto e chama `listen`. Extraia a montagem para `criarApp(deps)` testável; `main.ts` fica só com env + `listen`.

**Escopo**
- `apps/api/src/app.ts` (novo): `criarApp(dependencias): FastifyInstance`
- `apps/api/src/main.ts`: passa a compor infra real e chamar `criarApp`
- `apps/api/src/testes/fakes/*.ts`: fakes em memória de `UsuarioRepository`, `MesaRepository`, `PersonagemRepository`, `CenaRepository`, `MensagemRepository`, `ServicoEmail`, `PublicadorEventosMesa`
- `apps/api/src/testes/harness.ts`: `criarAppDeTeste()` devolvendo app + fakes + helper `autenticarComo(usuario)`
- `apps/api/src/apresentacao/http/rotas-auth.test.ts` e `rotas-mesas.test.ts` como prova

**Critérios de aceite**
```gherkin
Cenário: Fluxo de registro e login por inject
  Dado um app de teste com repositórios em memória
  Quando eu chamar POST /api/auth/registrar e depois POST /api/auth/login
  Então recebo 201 e 200 com um token JWT válido em cada resposta

Cenário: Rota protegida sem token
  Dado um app de teste
  Quando eu chamar GET /api/mesas sem header Authorization
  Então recebo 401 com corpo { "erro": "Autenticação necessária." }
```

**Testes obrigatórios**
- Contrato: registro duplicado → 409; login errado → 403; mesa de terceiro → 403; mesa inexistente → 404.
- Os fakes devem honrar o contrato das ports (substituíveis pelos adaptadores Supabase — princípio de Liskov).

**DoD específico**
- [ ] Nenhum teste do repositório precisa de variável de ambiente ou rede.
- [ ] `main.ts` reduzido a env + composição + `listen`.

---

### RV-004 — Endurecimento HTTP: rate limit, helmet e limites de payload

**Épico:** E00 · **Depende de:** RV-003 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **operador**, quero **limites de requisição e cabeçalhos de segurança**, para **que a API resista a abuso e varredura automatizada**.

**Escopo**
- `apps/api/src/app.ts`: registrar `@fastify/helmet`, `@fastify/rate-limit`
- `apps/api/src/config/env.ts`: `RATE_LIMIT_MAX`, `RATE_LIMIT_JANELA`
- `.env.example`

**Regras**
- Global: 300 req/min por IP.
- `/api/auth/login` e `/api/auth/registrar`: 10 req/min por IP.
- Body limit: 256 KB (upload de arquivo tem rota própria — ver RV-032).

**Critérios de aceite**
```gherkin
Cenário: Força bruta no login é barrada
  Dado que já fiz 10 tentativas de login em um minuto pelo mesmo IP
  Quando eu tentar a 11ª vez
  Então recebo 429 com mensagem em PT-BR e header Retry-After

Cenário: Cabeçalhos de segurança presentes
  Quando eu chamar GET /api/saude
  Então a resposta inclui os cabeçalhos de segurança do helmet
```

**Testes obrigatórios**
- Contrato: 11ª tentativa de login → 429; requisição acima do body limit → 413.

**DoD específico**
- [ ] Mensagem de 429 em PT-BR e no mesmo formato `{ erro }` das demais.
- [ ] Rate limit desativável em teste para não poluir os outros contratos.

---

### RV-005 — Erro global, request id e logs auditáveis

**Épico:** E00 · **Depende de:** RV-003 · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **operador**, quero **que exceções inesperadas virem 500 padronizado e rastreável**, para **investigar incidentes sem vazar detalhes ao cliente**.

**Contexto técnico**
- Hoje uma exceção de infra (ex.: `garantirSemErro` em [cliente.ts](../../apps/api/src/infra/supabase/cliente.ts)) sobe crua para o handler do Fastify.

**Escopo**
- `apps/api/src/apresentacao/http/erros.ts`: `setErrorHandler` central
- `apps/api/src/app.ts`: `genReqId`, `requestIdHeader`
- Ajuste do logger para redigir `authorization`, `senha`, `senha_hash`, `token`

**Critérios de aceite**
```gherkin
Cenário: Exceção inesperada não vaza detalhes
  Dado que o repositório lança uma exceção de infraestrutura
  Quando eu chamar a rota afetada
  Então recebo 500 com { "erro": "Erro interno. Tente novamente.", "requisicaoId": "<id>" }
  E o log do servidor contém o stack trace associado ao mesmo requisicaoId

Cenário: Segredo nunca aparece no log
  Quando eu fizer login com sucesso
  Então nenhuma linha de log contém a senha, o hash ou o token emitido
```

**Testes obrigatórios**
- Contrato: rota com repositório que lança → 500 com corpo padronizado e sem stack.
- Unitário do redator de logs.

---

### RV-006 — Modo offline: adaptadores em memória

**Épico:** E00 · **Depende de:** RV-003 · **Tamanho:** M · **Onda:** 3

**História**
> Como **desenvolvedor novo no projeto**, quero **rodar a plataforma sem criar um projeto Supabase**, para **avaliar e contribuir em minutos**.

**Contexto técnico**
- Hoje `carregarEnv` exige `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` e mata o processo sem eles ([env.ts](../../apps/api/src/config/env.ts)).
- Reaproveite os fakes de RV-003 promovendo-os a `apps/api/src/infra/memoria/`.

**Escopo**
- `apps/api/src/infra/memoria/*.ts`
- `apps/api/src/config/env.ts`: `PERSISTENCIA=supabase|memoria` (padrão `supabase`); Supabase só obrigatório quando `PERSISTENCIA=supabase`
- `main.ts`: seleção do conjunto de repositórios
- `README.md`: seção "Rodar sem Supabase"

**Critérios de aceite**
```gherkin
Cenário: Subir sem credenciais
  Dado um .env com PERSISTENCIA=memoria e JWT_SEGREDO preenchido
  Quando eu rodar "npm run dev"
  Então a API sobe e o fluxo registrar → criar mesa → rolar dados funciona
  E o log avisa que os dados são voláteis

Cenário: Produção continua exigindo banco
  Dado PERSISTENCIA=supabase sem SUPABASE_URL
  Quando eu rodar a API
  Então o processo encerra com mensagem de configuração inválida
```

**DoD específico**
- [ ] Nenhuma referência a `infra/memoria` fora do composition root.
- [ ] Dados semeados opcionais (mesa de exemplo) atrás de flag.

---

### RV-007 — Fluxo de migrations documentado e verificável

**Épico:** E00 · **Depende de:** — · **Tamanho:** P · **Onda:** 3

**História**
> Como **mantenedor**, quero **um caminho único e verificável para aplicar migrations**, para **que ambientes não divirjam silenciosamente**.

**Escopo**
- `apps/api/supabase/README.md`: ordem, imutabilidade, uso do Supabase CLI
- `apps/api/scripts/verificar-migrations.ts`: valida numeração sequencial e nomes
- `package.json` da api: script `migrations:verificar` incluído no `check`

**Critérios de aceite**
```gherkin
Cenário: Numeração duplicada é detectada
  Dado dois arquivos "0002_a.sql" e "0002_b.sql"
  Quando eu rodar "npm run migrations:verificar"
  Então o comando falha indicando a duplicidade

Cenário: Migration aplicada foi alterada
  Dado que o hash registrado de "0001_esquema_inicial.sql" mudou
  Quando eu rodar a verificação
  Então o comando falha lembrando que migrations aplicadas são imutáveis
```

**DoD específico**
- [ ] Arquivo de hashes versionado (`supabase/migrations/.hashes.json`).

---

### RV-008 — Suíte de testes do front (Vitest + Testing Library)

**Épico:** E00 · **Depende de:** — · **Tamanho:** M · **Onda:** 1 · **Status:** ✅ Concluído

**História**
> Como **mantenedor**, quero **que o workspace do web tenha runner de testes e cobertura mínima**, para **que `npm run test` pare de ficar verde ignorando o front inteiro**.

**Contexto técnico**
- [apps/web/package.json](../../apps/web/package.json) não declara script `test` nem a dependência `vitest`. A raiz roda `npm run test --workspaces --if-present` ([package.json](../../package.json)), então o front é **pulado em silêncio** — os testes verdes de hoje são só `@rolavinte/shared` e `@rolavinte/api`. O mesmo vale no CI ([ci.yml](../../.github/workflows/ci.yml)): o passo de testes passa sem exercitar uma linha do web.
- [CLAUDE.md](../../CLAUDE.md) e [09-testes-e-qualidade.md](../../.claude/rules/09-testes-e-qualidade.md) afirmam que o runner é Vitest **em todos os workspaces**: a documentação promete o que não existe.
- Cards já escritos dependem deste: RV-112 pede "simular `disconnect`/`connect` e verificar reentrada + invalidações" e RV-011 pede "teste do hook garantindo `desconectarSocket` e `clear` chamados". Hoje não há onde esses testes rodarem.
- Este card **não** é E2E — RV-133 cobre Playwright com navegador real. Aqui é unitário/integração de componente, sem servidor e sem rede.
- Armadilhas conhecidas:
  - [lib/socket.ts](../../apps/web/src/lib/socket.ts) abre conexão real (`io('/')`) na primeira chamada de `obterSocket()`. O setup precisa mockar `socket.io-client` por padrão; sem isso a suíte tenta websocket e trava.
  - [store-sessao.ts](../../apps/web/src/features/auth/store-sessao.ts) usa `persist` em `localStorage` (chave `rolavinte-sessao`) — limpe entre testes ou um teste contamina o outro.
  - [lib/api.ts](../../apps/web/src/lib/api.ts) usa o `fetch` global e chama `sair()` no 401 — use `vi.stubGlobal('fetch', ...)`, nunca rede real.
  - Alinhe a major do Vitest à usada em [apps/api/package.json](../../apps/api/package.json) para não manter duas versões no lockfile.

**Escopo**
- `apps/web/package.json`: devDependencies (`vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`) e scripts `test` / `test:watch`
- `apps/web/vite.config.ts`: bloco `test` (`environment: 'jsdom'`, `setupFiles`)
- `apps/web/src/testes/setup.ts`: matchers do jest-dom, limpeza de `localStorage` e mock padrão de `socket.io-client`
- `apps/web/src/testes/utilitarios.tsx`: `renderizarComProvedores()` (QueryClient com `retry: false` + roteador em memória)
- Testes de prova: `src/lib/api.test.ts`, `src/features/auth/store-sessao.test.ts`, `src/features/jogo/use-socket-mesa.test.ts`
- `package-lock.json` regenerado no mesmo commit

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — a suíte do front roda pela raiz
  Dado o repositório com o workspace do web configurado
  Quando eu rodar "npm run test" na raiz
  Então a saída inclui os testes de @rolavinte/web, além de shared e api

Cenário: Front quebrado derruba o CI
  Dado um teste do front falhando
  Quando o workflow de CI executar
  Então o passo de testes falha, em vez de terminar verde por omissão

Cenário: Autorização — 401 encerra a sessão no cliente
  Dado um token guardado na sessão persistida
  Quando "requisitar" receber 401 da API
  Então a sessão é limpa e um ErroApi 401 "Sessão expirada. Entre novamente." é lançado

Cenário: Borda — nenhum teste abre socket ou rede
  Dado que nenhum servidor está no ar
  Quando eu rodar a suíte do web
  Então nenhuma conexão websocket ou HTTP real é tentada
  E a suíte termina sem travar por timeout
```

**Testes obrigatórios**
- `lib/api.test.ts`: header `Authorization` presente com token e ausente sem token; 401 limpa a sessão; corpo `{ erro }` vira a mensagem do `ErroApi`; 204 devolve `undefined`.
- `features/auth/store-sessao.test.ts`: `entrar`/`sair` e persistência em `localStorage`.
- `features/jogo/use-socket-mesa.test.ts`: com socket falso, o `connect` reemite `mesa:entrar` e invalida exatamente `['mensagens', mesaId]` e `['cena', mesaId]`; `mensagem:nova` duplicada não duplica no cache; a desmontagem remove todos os listeners registrados.

**DoD específico**
- [ ] `npm run test` na raiz executa os três workspaces — nenhum pulado por `--if-present`.
- [ ] Nenhum teste do front depende de rede, de servidor ou de credencial.
- [ ] `package-lock.json` atualizado no mesmo commit (o CI usa `npm ci` e falha com lockfile dessincronizado).

---

### RV-009 — Tipos gerados do banco no cliente Supabase

**Épico:** E00 · **Depende de:** RV-001 · **Tamanho:** M · **Onda:** 1

**História**
> Como **mantenedor**, quero **que o compilador conheça o schema do banco**, para **que uma coluna renomeada quebre o `check` em vez de quebrar a mesa de alguém em produção**.

**Contexto técnico**
- [cliente.ts](../../apps/api/src/infra/supabase/cliente.ts) chama `createClient` sem o parâmetro genérico `Database`, então `ClienteSupabase = ReturnType<typeof createClient>` e todo `data` devolvido é `any`.
- A única tipagem da fronteira com o banco são asserções manuais nos repositórios (`data as RowMesa` em [mesa-repository.supabase.ts](../../apps/api/src/infra/supabase/mesa-repository.supabase.ts), e dois pontos com `as unknown as`). Consequência prática: `select` de coluna inexistente e mapper desatualizado **compilam** — só quebram em runtime.
- Isso já cobrou preço: RV-001 precisou **desligar** `@typescript-eslint/no-unnecessary-type-assertion` (justificativa em comentário no `eslint.config.js`), porque com `data: any` a regra classifica essas asserções como desnecessárias e o autofix apagaria justamente a tipagem da fronteira.
- O custo cresce com o backlog: RV-010, RV-013, RV-014 e os épicos de cenas, tokens e combate adicionam migrations e colunas novas.
- **Decisão a registrar:** os tipos são um arquivo **versionado**, gerado offline a partir das migrations (`supabase gen types typescript`). Nada é baixado em runtime nem no CI — [ci.yml](../../.github/workflows/ci.yml) não tem credencial de Supabase e não pode passar a ter.
- **Armadilha:** o tipo `Database` é infraestrutura e **não pode vazar** para `dominio/` ou `aplicacao/` ([01-arquitetura.md](../../.claude/rules/01-arquitetura.md), [07-supabase.md](../../.claude/rules/07-supabase.md)). Os mappers continuam convertendo row↔entidade; o domínio nunca vê um row.

**Escopo**
- `apps/api/src/infra/supabase/database.types.ts` (gerado e versionado)
- `apps/api/src/infra/supabase/cliente.ts`: `createClient<Database>(...)`
- `*.mapper.ts`: `RowMesa`, `RowConvite`, `RowCena`, `RowToken`, `RowMensagem`, `RowUsuario` passam a derivar do tipo gerado em vez de serem redigitados à mão
- Repositórios: remover as asserções que se tornarem redundantes
- `apps/api/package.json`: script `tipos:banco` com o comando de geração documentado
- `eslint.config.js`: religar `@typescript-eslint/no-unnecessary-type-assertion` e remover o comentário de exceção
- `apps/api/supabase/README.md` (ou o card RV-007): regerar os tipos faz parte do fluxo de toda migration nova

**Critérios de aceite**
```gherkin
Cenário: Caminho feliz — schema divergente quebra o build
  Dado uma migration que renomeia a coluna "mesas.nome" para "mesas.titulo"
  E os tipos do banco regerados
  Quando eu rodar "npm run check"
  Então o comando falha apontando o mapper que ainda usa "nome"

Cenário: Borda — coluna inexistente não compila
  Dado um repositório que faz select de uma coluna ausente na tabela
  Quando eu rodar "npm run check"
  Então o comando falha antes de qualquer chamada ao banco

Cenário: Fronteira — tipos do banco não vazam da infraestrutura
  Dado um arquivo em "apps/api/src/aplicacao/" que importa "database.types"
  Quando eu rodar "npm run lint"
  Então o comando falha apontando a violação de fronteira

Cenário: Regra de lint restaurada
  Dado o repositório com os tipos gerados
  Quando eu rodar "npm run lint" com "no-unnecessary-type-assertion" ativa
  Então o comando termina sem erro e sem aviso
```

**Testes obrigatórios**
- Fronteira: caso novo em [fronteiras-arquitetura.test.ts](../../apps/api/src/testes/fronteiras-arquitetura.test.ts) provando que `aplicacao/` e `dominio/` não podem importar `database.types`.
- Contrato: a suíte existente (`rotas-auth`, `rotas-mesas`, harness com fakes) continua verde — a mudança é de tipos, não de comportamento.

**DoD específico**
- [ ] `database.types.ts` versionado e coerente com **todas** as migrations aplicadas.
- [ ] `@typescript-eslint/no-unnecessary-type-assertion` ativa, sem exceção.
- [ ] Nenhum `as unknown as` em `apps/api/src/infra/supabase/`.
- [ ] Geração dos tipos não exige rede nem credencial no CI.
