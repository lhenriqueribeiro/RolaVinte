# Guardrail: Backend (apps/api)

## Stack

- **Runtime**: Node.js ≥ 22, ESM (`"type": "module"`), TypeScript estrito.
- **HTTP**: Fastify 5. **Tempo real**: Socket.IO 4. **Validação**: Zod, com os schemas vindos de `@rolavinte/shared`.
- **Auth**: JWT próprio (access token) + hash de senha com bcrypt. Segredos por env.
- **Banco**: Supabase (Postgres) com `SERVICE_ROLE` — o backend é a única fronteira com o banco, e RLS não substitui autorização de domínio ([07-supabase.md](07-supabase.md)).
- **Email**: Resend atrás da port `ServicoEmail` ([08-email.md](08-email.md)).
- **Arquivos**: Supabase Storage atrás da port `ArmazenamentoArquivos`.

## Estrutura obrigatória

O que cada diretório de `apps/api/src/` responde — nomes de classe ficam de fora de propósito, porque essa lista envelhece a cada card:

| Diretório | Responsabilidade |
|---|---|
| `config/` | env tipado e validado com Zod. **Único** lugar do sistema que lê `process.env`. |
| `dominio/compartilhado/` | blocos base: entidade, `Result`, `ErroDominio`, evento de domínio. |
| `dominio/<contexto>/` | entidades, VOs, eventos e serviços de domínio do contexto. |
| `aplicacao/ports/` | interfaces de tudo que é externo: repositórios num arquivo, o resto (email, token, senha, relógio, id, armazenamento, event bus, publicador de eventos) noutro. |
| `aplicacao/<contexto>/` | casos de uso — uma classe por intenção, método `executar()`. |
| `infra/<recurso>/` | adapters das ports, um diretório por recurso externo (banco, email, auth, ids/relógio, eventos, storage). Mappers row↔entidade junto do repositório. |
| `apresentacao/http/` | rotas Fastify, autenticação, tradução central de erro, endurecimento de log. |
| `apresentacao/ws/` | gateway Socket.IO e publicador de broadcast. |
| `testes/` | harness de contrato e fakes em memória de **todas** as ports. |
| `app.ts` | `criarServidorHttp()` e `registrarRotas()` — montagem HTTP testável. |
| `main.ts` | composition root de produção: env, infra real, socket, `listen`. |

**Por que a montagem HTTP não vive no `main.ts`:** o publicador de eventos depende do `io`, que depende do `app.server`, e os casos de uso dependem do publicador — um `criarApp(deps)` único cai em ciclo. `criarServidorHttp` levanta o Fastify sem nenhuma dependência de negócio; `registrarRotas` recebe os casos de uso já montados. É isso que permite a suíte de contrato subir a API sem Supabase, sem Socket.IO e sem `process.env` ([01-arquitetura.md](01-arquitetura.md)).

## Regras de rota

- Toda rota: schema Zod na entrada → caso de uso → mapa central de erro. Sem `try/catch` ad hoc por rota.
- Caso de uso devolve `Result`; a conversão é única: `validacao→400`, `nao-autorizado→403`, `nao-encontrado→404`, `conflito→409`. Mensagem que chega ao cliente é em PT-BR e não revela infraestrutura.
- Autorização é do domínio, não da rota: a rota autentica e identifica o solicitante; quem decide se ele pode é o agregado ou o caso de uso ([02-ddd.md](02-ddd.md)).
- Upload passa pela port de armazenamento e **o caminho do arquivo é gerado pela aplicação** — nome vindo do cliente é vetor de path traversal e de sobrescrita.
- Log estruturado do Fastify. Nunca logar senha, hash, token nem corpo de email: a redação de campo sensível é centralizada no endurecimento de log de `apresentacao/http/`, e campo sensível novo entra **lá**, não num `delete` espalhado pelo caminho.
- Config de segurança só conta se você puder apontar a linha que a lê (classe **F1** da [taxonomia](../../docs/agentes/taxonomia-de-falhas.md)).
- IDs: UUID gerado pela aplicação (port `GeradorId`), não pelo banco — entidade nasce completa. Relógio também é port; `new Date()` dentro de domínio ou caso de uso impede teste determinístico.

## Tempo real

- **Comando vai por REST; o socket entrega fatos.** O cliente não muda estado emitindo evento — ele chama a API, e a sala recebe o broadcast. Isso mantém autorização e validação num caminho só.
- Um socket entra na sala `mesa:{id}` **somente** após autenticação no handshake e verificação de participação. A sala pessoal por mesa (destino de sussurro e rolagem oculta) entra no mesmo instante e sai junto — não existe caminho para receber mensagem privada de mesa da qual não se participa.
- Payload que chega do cliente é `unknown` e **continua** passando por Zod. Os genéricos do Socket.IO descrevem o que um cliente bem-comportado envia, não o que chegou pelo fio. Tipo não substitui validação.
- Entrega restrita nunca é filtrada no cliente: se o dado não pode ser visto, ele não sai do servidor ([02-ddd.md](02-ddd.md)).

### Criar um evento novo — os quatro passos, na ordem

O contrato dos eventos vive em [eventos-ws.ts](../../packages/shared/src/tipos/eventos-ws.ts) e é **aplicado nos dois lados**. Nasceu de um evento órfão que atravessou `check`, `lint`, `test` e `build` sem ruído (classe **F2** da taxonomia), então a sequência não é sugestão:

1. Declare o evento e o formato do payload no contrato do shared.
2. Registre o nome no `Record<NomeEvento, true>` do mesmo arquivo — ele é a ponte tipo→valor e **para de compilar** até isso acontecer.
3. Dê a ele um ouvinte no front, com `off` na limpeza; o teste de cobertura de ouvintes fica vermelho nomeando o evento até existir ([06-frontend.md](06-frontend.md)).
4. Para publicar, acrescente o método à port de broadcast usando o tipo de payload derivado do contrato (nunca redigitado) e implemente nas **duas** pontas: adapter real e fake de teste.

Renomear ou remover campo de payload quebra os dois lados de uma vez — é o efeito desejado. **Acrescentar** campo quebra só o publicador, e está certo: quem lê um subconjunto continua válido. Não conclua que a proteção falhou ao testar com campo novo.

## Migrations

- SQL versionado em `supabase/migrations/NNNN_descricao.sql`, aplicado em ordem, **imutável depois de aplicado**. Mudou o schema? Arquivo novo.
- **Toda migration termina se registrando** na tabela de migrations aplicadas. É o que permite a verificação do ambiente ser **derivada** (arquivos em disco × linhas na tabela) em vez de uma lista escrita à mão — a lista à mão já respondeu "ambiente pronto" com o chat inteiro fora do ar (**F10** da taxonomia).
- Aplicar e conferir com `npm run supabase:migrar -w @rolavinte/api` e `npm run supabase:verificar -w @rolavinte/api`. "Está implementado" e "está aplicado no banco" são estados diferentes; diga qual você verificou.
- Schema em PT-BR `snake_case`; convenções de coluna, índice e enum em [07-supabase.md](07-supabase.md).

## O que rejeitar em code review

- Regra de negócio em rota ou em handler de socket.
- `process.env` fora de `config/`.
- Payload de socket usado sem passar por Zod.
- Evento novo sem os quatro passos completos.
- Caminho de arquivo de upload derivado de nome enviado pelo cliente.
- Migration que não se registra, ou verificação de ambiente com lista fixa.
- Dependência nova montada só num dos composition roots.
