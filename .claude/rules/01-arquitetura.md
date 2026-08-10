# Guardrail: Arquitetura Geral (Clean Architecture + Monolito Modular)

## Visão

O RolaVinte é um **monolito modular** com fronteiras estritas entre camadas, organizado em monorepo npm workspaces:

```
apps/api        → Backend Node (Fastify) — Clean Architecture + DDD
apps/web        → Frontend React — feature-sliced
packages/shared → Contratos compartilhados (schemas Zod, tipos, motor de dados)
```

## A Regra de Dependência (inviolável)

As dependências apontam **sempre para dentro**. Camadas externas conhecem as internas; o inverso é proibido. Os diretórios têm nome em PT-BR, como o resto do domínio ([02-ddd.md](02-ddd.md)) — não existe `domain/` nem `application/` neste repositório:

```
apresentacao → aplicacao → dominio
infra (implementa ports) → aplicacao → dominio
```

| Camada | Pode importar de | NUNCA importa de |
|---|---|---|
| `dominio/` | `dominio/`, `@rolavinte/shared` | aplicacao, infra, apresentacao, config, frameworks e SDKs |
| `aplicacao/` | `dominio/`, `@rolavinte/shared` | infra, apresentacao, config, frameworks e SDKs |
| `infra/` | `aplicacao/ports`, `dominio/`, SDKs do provedor | apresentacao |
| `apresentacao/` | `aplicacao/`, `dominio/` (tipos), `@rolavinte/shared` | infra |

**Quem quebra quando isso for desrespeitado** — porque regra sem consumidor é comentário ([10-verificabilidade.md](10-verificabilidade.md)): `no-restricted-imports` por diretório em [eslint.config.js](../../eslint.config.js), e [fronteiras-arquitetura.test.ts](../../apps/api/src/testes/fronteiras-arquitetura.test.ts), que grava um arquivo com import proibido em cada fronteira, roda o ESLint de verdade e exige a acusação. Fronteira nova só está protegida depois de ter um caso lá.

## Composition Root

- A montagem de dependências acontece **somente** nos composition roots. Hoje são dois: `main.ts` (produção, infra real) e o harness da suíte de contrato (`testes/harness.ts`, fakes em memória).
- Dois roots são uma decisão, não um acidente: é o que permite subir a API em teste sem banco, rede nem `process.env`. O preço é que eles precisam montar **o mesmo grafo** — dependência que entra em um e não no outro faz o teste de contrato medir um sistema que não existe.
- A montagem HTTP é dividida em duas funções reusadas pelos dois roots (`criarServidorHttp` e `registrarRotas`); o porquê está em [05-backend.md](05-backend.md).
- Casos de uso recebem dependências por **injeção de construtor**, sempre a port, nunca a classe concreta.
- **Teste objetivo em review:** procure `new` de adapter de infraestrutura, ou criação de cliente de provedor, fora dos composition roots. Achou? É violação, mesmo compilando.

## Ports & Adapters

- Todo acesso ao mundo externo passa por uma **port** (interface TypeScript) declarada em `aplicacao/ports/`: banco, email, relógio, geração de id, broadcast em tempo real e **armazenamento de arquivos**. Recurso externo novo nasce como port; não existe "só esta vez".
- O adapter concreto vive em `infra/` e é o **único** lugar onde o SDK do provedor aparece. `@supabase/*`, `resend`, `fastify` e `socket.io` fora de `infra/`/`apresentacao/` são barrados pelo lint.
- Upload de arquivo é o caso que mais tenta a exceção, e não tem: ele passa pela port `ArmazenamentoArquivos`, a rota nunca fala com o Storage do provedor, e o caminho do arquivo é gerado pela aplicação ([07-supabase.md](07-supabase.md)).
- **Teste objetivo em review:** este caso de uso é exercitável com fakes em memória, sem subir nada? Se não, falta port ou o adapter vazou para dentro.

## Erros

- Domínio e aplicação devolvem `Result<T, ErroDominio>` — nunca lançam exceção para controle de fluxo. Exceção é bug ou estado impossível.
- A tradução de `ErroDominio` para status HTTP acontece num **único** lugar (`apresentacao/http/erros.ts`), junto com o handler global. Rota com `try/catch` próprio é sinal de que alguém está traduzindo erro pela segunda vez.
- Mensagem de erro que chega ao cliente é em PT-BR e não revela causa de infraestrutura.

## O que rejeitar em code review

- Import de framework ou SDK em `dominio/` ou `aplicacao/`.
- Nome de camada em inglês (`domain/`, `application/`, `infrastructure/`, `presentation/`) em código ou em documento novo.
- Lógica de negócio em rota, handler de socket ou componente React.
- Acesso a banco, email ou armazenamento fora de `infra/`.
- Adapter de infraestrutura instanciado fora de um composition root.
- Falha esperada lançada como exceção em vez de devolvida como `Result`.
- Caso de uso chamando outro caso de uso por atalho de infraestrutura (componha por ports ou eventos).
