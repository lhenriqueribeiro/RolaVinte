# ADR-0001: Topologia de publicação do RolaVinte

**Status:** Proposto
**Data:** 2026-11-01
**Decisor:** o humano no comando — este documento é recomendação, não decisão tomada
**Card relacionado:** [RV-132](../backlog/13-operacao.md) — Deploy de API e web

---

## Contexto

A v0.9.0 fechou a última lacuna de produto entre o repositório e uma mesa jogando: combate,
iniciativa por sistema, condições e dano estão entregues e verificados contra o Supabase real. A
curadoria e a verificação de fim de sprint chegaram à mesma conclusão por caminhos diferentes —
**o que falta não é funcionalidade, é publicação.** A plataforma só existe em `localhost`, e os
outros quatro jogadores não têm como chegar nela.

O RV-132 já existe e já prescreve uma solução (Dockerfile, `tsc` para `dist/`, `VITE_API_URL`,
compose, workflow de deploy). Este ADR existe porque **o card prescreve sem comparar**: ele assume
uma topologia — front e API em origens separadas — que o código atual contradiz em dois lugares, e
não registra o custo dessa escolha contra as alternativas. Decisão sem alternativa escrita é
preferência, e preferência apodrece sem deixar rastro de por quê.

### O que foi medido no código, hoje

Tudo abaixo foi conferido no repositório antes de escrever este documento.

**1. O front é de origem única, por construção.**

| Onde | O que diz |
|---|---|
| `apps/web/src/lib/api.ts` | `const BASE = '/api'` — caminho relativo |
| `apps/web/src/lib/socket.ts` | `io('/')` — origem relativa |
| `apps/web/src/` inteiro | **zero** ocorrências de `import.meta.env` |

Não existe nenhuma variável de ambiente no front. Ele não tem como apontar para outro host, e o
`VITE_API_URL` que o RV-132 cita no escopo **não existe** — é trabalho a fazer, não configuração a
preencher.

**2. A API é de origem separada, por declaração.** Em `apps/api/src/app.ts`, o helmet é registrado
com `default-src 'none'` sob o comentário "a API só devolve JSON: nada deve ser carregado a partir
dela", mais `crossOriginResourcePolicy` em `cross-origin` sob "o front vive em outra origem e
consome estes recursos via fetch com CORS" — e o CORS registrado com `origin: ORIGEM_WEB`.

**As duas metades do mesmo sistema afirmam topologias opostas, e nada compara as duas.** Em
desenvolvimento o proxy do Vite esconde a contradição: ele atende `/api` e `/socket.io` no mesmo
`localhost:5173`, então o front vive a origem única e a API é configurada para a separada sem que
nenhuma das duas descubra. Em produção **exatamente uma delas está errada**, e qual depende de uma
decisão que ninguém tomou ainda. É o padrão que o guardrail 10 nomeia: duas verdades sobre o mesmo
conceito, sem consumidor que quebre.

**3. A API não produz artefato publicável.**

- `apps/api` e `packages/shared` têm `build` igual a `tsc --noEmit` — type-check, zero emissão.
- `packages/shared/package.json` declara `"exports": { ".": "./src/index.ts" }`: um arquivo
  **TypeScript**. Não há `dist/`.
- `start` da API é `tsx ... src/main.ts`, e **`tsx` está em `devDependencies`**.

Consequência direta: instalar sem as dependências de desenvolvimento e rodar `start` **falha**. O
"Build de produção" verde no CI ([ci.yml](../../.github/workflows/ci.yml)) afirma que os tipos
fecham, não que exista algo para publicar — a limitação já estava registrada na nota da v0.9.0, e
aqui ela deixa de ser nota de rodapé e vira bloqueio.

**4. O socket não tem plano B de transporte.** `socket.ts` fixa `transports: ['websocket']`. Sem
fallback para polling, uma plataforma que não faça upgrade de WebSocket ponta a ponta **não
degrada: ela não funciona**. Isso elimina destinos serverless e de borda, e torna o upgrade um
critério de aceite, não um detalhe de configuração.

**5. Uma instância, e isso está decidido.** Não há adapter de Socket.IO — nenhum Redis, nenhum
`createAdapter` —, então broadcast não atravessa processos. O `@fastify/rate-limit` usa o
armazenamento padrão, em memória, logo o limite é por instância. O RV-132 já registra "uma
instância só" como decisão inicial; este ADR a mantém e acrescenta por que ela é barata: seis
pessoas por mesa não justificam estado compartilhado.

**6. Não existe healthcheck.** Nenhuma rota de saúde ou prontidão em `apresentacao/http/`. O
critério de aceite do próprio RV-132 — "responde 200 em menos de 10 segundos" — **não tem como
passar hoje**.

**7. A porta de entrada no grupo depende de email real.** `RESEND_API_KEY` vazia derruba o convite
no stdout, e o `ConviteDTO` não expõe o token — medido ao vivo na verificação da v0.9.0, quando foi
preciso ler o token no banco para um segundo jogador conseguir entrar.

### Forças

- **Escala real:** uma mesa, cinco jogadores, sessões de três horas. Não há requisito de CDN
  global, nem de escala horizontal, nem de disponibilidade de produção séria.
- **Custo de mudança importa mais que custo de execução.** Cada hora gasta em topologia é hora que
  não vira jogo.
- **O projeto pune afirmação sem consumidor.** Qualquer topologia escolhida precisa tornar
  verdadeiras as afirmações do código, ou corrigi-las no mesmo passo.

---

## Decisão

Três decisões, nesta ordem de dependência.

### D1 — Origem única: a API serve o SPA (Opção A)

Um processo, um domínio, um certificado. A API passa a servir os arquivos estáticos do build do
front com fallback de SPA, e continua servindo a própria API sob `/api` e `/socket.io`.

### D2 — O artefato é um bundle da API via esbuild, com `--packages=external`

Em vez de migrar `shared` e `api` para emissão `tsc` com `dist/` — que obriga a mexer no mapa de
`exports` do shared e a reverberar isso em Vite, Vitest e três `tsconfig` —, o build empacota o
**nosso** código (`apps/api/src` mais `packages/shared/src`) num arquivo só, deixando os pacotes de
`node_modules` externos. `tsx` deixa de ser necessário em produção.

### D3 — O convite ganha uma segunda porta: o link copiável pelo mestre

`ListarConvites`
([listar-convites.ts](../../apps/api/src/aplicacao/mesas/listar-convites.ts)) já é **privativo do
mestre** — recusa qualquer outro com "Apenas o mestre pode gerir os convites da mesa". Expor o
token **nesse** read model, e só nele, dá ao mestre o link para colar no grupo de mensagens. O
`ObterConvitePublico` continua sem o token, porque quem o chama já o tem na URL.

Email continua sendo o caminho bonito, mas deixa de ser o **único** caminho — e com isso sai do
caminho crítico da publicação.

---

## Opções consideradas

### Opção A — Origem única: a API serve o SPA ✅ recomendada

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Baixa** — um artefato, um domínio, um processo |
| Mudança no front | **Nenhuma** — `BASE='/api'` e `io('/')` já são o certo |
| Custo | 1 serviço |
| Escalabilidade | Limitada: front e API escalam juntos — irrelevante nesta escala |
| Familiaridade | Alta: é o que o desenvolvimento já exercita via proxy |

**Prós:** o cliente funciona sem tocar numa linha; CORS deixa de ter papel; o WebSocket é
same-origin, que é o caminho com menos coisa para dar errado; um único TLS; o `ORIGEM_WEB` do link
de convite passa a ser literalmente a URL pública.

**Contras:** o helmet precisa ser reescrito — `default-src 'none'` bloquearia **todo** script e CSS
do SPA, e o comentário "a API só devolve JSON" deixa de ser verdade e sai junto; o rate limit por
IP passa a contar também requisições de arquivo estático; colocar o SPA num CDN depois vira
trabalho de migração, não ajuste de configuração.

### Opção B — Origens separadas (o que o RV-132 assume)

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Alta** — duas unidades de deploy, CORS e WS cross-origin |
| Mudança no front | **Significativa** — criar toda a plumbing de env que não existe |
| Custo | 1 serviço + hospedagem estática |
| Escalabilidade | Boa, e sem uso previsto |
| Familiaridade | Média |

**Prós:** SPA em CDN, carregamento rápido de qualquer lugar; API escala sozinha; a configuração
atual de helmet e CORS **já está certa** para este mundo — nada a reescrever no backend.

**Contras:** exige introduzir `VITE_API_URL` e `VITE_SOCKET_URL` e refiar os dois módulos de `lib/`
que hoje são relativos; preflight de CORS, WebSocket cross-origin e `crossOriginResourcePolicy`
passam a ser três coisas que precisam estar certas ao mesmo tempo para a mesa funcionar; e dois
artefatos para versionar juntos — SPA e API fora de sincronia é uma classe de defeito nova num
projeto que já cataloga doze.

### Opção C — Origem única por reverse proxy à frente de dois serviços

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Média** — um componente a mais para operar |
| Mudança no front | Nenhuma |
| Custo | 1 serviço + estático + proxy |
| Escalabilidade | Boa |
| Familiaridade | Baixa — nada parecido existe no repositório hoje |

**Prós:** o melhor dos dois — cliente intocado **e** a API continua honestamente só-JSON, porque
quem serve o SPA é o proxy. O helmet permanece verdadeiro exatamente como está.

**Contras:** o proxy precisa fazer upgrade de WebSocket corretamente, que é justamente onde esse
tipo de componente falha em silêncio; paridade com o ambiente local exige compose; e o "grátis"
depende da plataforma — em alguns provedores o roteamento por caminho sai de graça, na maioria dos
PaaS não.

---

## Análise de trade-offs

**A decisão real é entre A e C; B é a mais cara pelo benefício que este produto não pede.** A
opção B paga o custo de criar configuração de ambiente no front, acertar CORS e WebSocket entre
origens e versionar dois artefatos — para ganhar CDN e escala independente, nenhum dos quais
aparece nos requisitos de uma mesa de seis pessoas. É a escolha certa para um produto com usuários
distribuídos; não é a escolha certa para o próximo sábado à noite.

Entre A e C, o que decide é **onde fica a desonestidade**. A opção C preserva a verdade do backend
("a API só devolve JSON") ao custo de um componente novo. A opção A torna essa frase falsa e exige
corrigi-la — mas a correção é de cerca de dez linhas de CSP, e, feita, o comentário volta a
descrever o processo. Trocar dez linhas honestas por um componente de infraestrutura a mais é um
mau negócio nesta escala, ainda mais quando o componente é justamente o que mais erra upgrade de
WebSocket e o nosso cliente **não tem fallback** se ele errar.

Sobre **D2**: a tentação é seguir o RV-132 e emitir com `tsc`. O problema não é a API — é o
`packages/shared`, cujo `exports` aponta para `./src/index.ts`. Mudá-lo para `dist/` significa
acertar condição de exportação para que Vite, Vitest e o typecheck dos três workspaces continuem
vendo o fonte em desenvolvimento e o compilado em produção. É um dia de trabalho com três chances
de quebrar a suíte, para resolver um problema que `--packages=external` dissolve: o bundler segue o
import, encontra o `.ts` e o empacota. O destino "shared compilado" continua disponível quando
houver razão para ele — publicar o pacote, por exemplo. Não há hoje.

Sobre **D3**: a objeção previsível é que expor um token de convite enfraquece o convite. Não neste
recorte — quem lê a lista é só o mestre, que é quem cria os convites e quem distribuiria o link de
qualquer jeito. O token continua de uso único, continua preso ao email convidado e continua
revogável. O que muda é que o mestre deixa de depender da caixa de entrada de terceiros, e a
publicação deixa de depender de domínio verificado no provedor de email.

---

## Consequências

**Fica mais fácil**

- Publicar: um artefato, um serviço, uma variável a mais (`ORIGEM_WEB` apontando para o domínio).
- Entrar na mesa: o mestre cola um link no grupo e os quatro entram, com ou sem email configurado.
- Rodar local igual à produção: o mesmo processo serve tudo, sem proxy de Vite no meio.

**Fica mais difícil**

- Colocar o SPA num CDN: vira migração para a opção B ou C, não ajuste de configuração.
- Escalar horizontalmente: continua exigindo adapter de Socket.IO **e** armazenamento compartilhado
  de rate limit. A decisão de uma instância fica de pé, agora com o preço escrito.

**Vai precisar ser revisto quando**

- Houver mais de uma mesa ativa simultânea com gente reclamando de latência → opção C mais CDN.
- O produto sair do círculo de conhecidos → domínio verificado volta ao caminho crítico, junto com
  um convite que não dependa do mestre colar link.

**Afirmações que esta decisão torna falsas, e que precisam ser corrigidas junto** — guardrail 10,
não existe "corrige depois":

- O comentário de `app.ts`: "A API só devolve JSON: nada deve ser carregado a partir dela."
- O comentário: "O front vive em outra origem e consome estes recursos via fetch com CORS."
- O escopo do RV-132, que prescreve `VITE_API_URL` e `VITE_SOCKET_URL` — eles deixam de ser
  necessários, e o card precisa dizer por quê, ou a próxima pessoa os implementa sem uso.

---

## Ações

1. [ ] **Decisão humana sobre A / B / C.** Nada abaixo começa antes disto.
2. [ ] Reescrever o RV-132 à luz da opção escolhida — hoje ele descreve a B sem dizer que escolheu.
3. [ ] Rotas de saúde (processo vivo) e de prontidão (Supabase alcançável), com teste de contrato.
   Sem isso o critério de aceite do próprio card não passa.
4. [ ] Build da API com esbuild, `--packages=external`, saída em `apps/api/dist`. Tirar `tsx` do
   caminho de produção e **provar** com uma instalação sem dependências de desenvolvimento.
5. [ ] Servir o build do front a partir da API, com fallback de SPA que **não** engole `/api` nem
   `/socket.io`, e CSP reescrita para permitir os próprios assets. Verificar contra o build real,
   não contra o dev server — é no build que o CSP morde.
6. [ ] Expor `token` em `ListarConvites` e na tela do mestre, com botão de copiar link. Teste de
   contrato provando que `ObterConvitePublico` **não** o expõe.
7. [ ] Dockerfile multi-stage com usuário não-root, e compose para subir local igual à produção.
8. [ ] `docs/deploy.md`: variáveis, domínio, bucket, e o que fazer quando o WebSocket não sobe.
9. [ ] Fumaça contra o ambiente publicado — é o RV-142, e é aqui que ele roda de verdade pela
   primeira vez.

**Pré-requisito de escala, documentado e não implementado:** passar de uma instância exige adapter
compartilhado de Socket.IO e rate limit fora da memória do processo. Enquanto isso não existir, o
número de instâncias é **um** — e isso é configuração a conferir no destino, não um padrão a
confiar.
