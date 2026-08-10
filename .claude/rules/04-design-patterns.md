# Guardrail: Design Patterns — quando e como usar

Padrões são vocabulário, não ornamento. Use o **mais simples que resolve** e nomeie a classe pelo papel de negócio, não pelo padrão (`SupabaseMesaRepository`, nunca `MesaRepositoryImpl`).

## Padrões canônicos deste projeto

| Padrão | Onde | Regra |
|---|---|---|
| **Repository** | um por agregado raiz | Interface em `aplicacao/ports`, implementação em `infra/`. Métodos com semântica de domínio (`buscarPorTokenConvite`), read models explícitos para tela. Nunca CRUD genérico. |
| **Result (Railway)** | domínio + aplicação | `Result<T>` é um valor: `ok(valor)` / `falha(ErroDominio...)`. Toda falha esperada volta assim; exceção fica para bug e estado impossível. |
| **Factory method estático** | entidades e VOs | Construtor privado. `criar(...)` valida invariantes e devolve `Result`; `reconstituir(...)` hidrata do banco sem revalidar história já persistida. |
| **Registro total (Strategy registrada)** | comportamento que varia por chave: sistema de RPG, comando de chat | `Record<Chave, Comportamento>` montado num único ponto — chave nova no enum **para de compilar** até ganhar dono. Um `Map` construído a partir desse `Record` é a mesma coisa; o que não vale é `Map` cru, que aceita chave faltando em silêncio. |
| **Observer / Pub-Sub** | eventos de domínio → port `EventBus`; broadcast em tempo real → port `PublicadorEventosMesa` | Efeito colateral (email, notificação) assina o evento; o caso de uso não conhece os assinantes e não falha se o assinante falhar. |
| **Adapter** | toda a `infra/` | Converte contrato externo (row do Supabase, API do Resend) para a linguagem do domínio. Mapeamento row↔entidade em `*.mapper.ts` — o domínio nunca vê um row. |
| **Facade** | `apresentacao/ws/GatewayJogo` | Fachada única do tempo real: autenticação de handshake, entrada na sala e validação de payload passam por ela. Nenhum socket alcança caso de uso por fora. |
| **Decorator** | preocupação transversal (log, métrica) sobre uma port | Envolva a port; não polua o caso de uso. |
| **Specification** (opcional) | consulta de domínio complexa | Só quando a regra de seleção for reusada em dois lugares ou mais. |

## Onde o padrão **não** está — e por que isso importa

O motor de dados é um **parser puro** com RNG injetável, não um registro de estratégias: modificador novo de rolagem hoje significa mexer no parser e nos seus testes. Não escreva código (nem card) assumindo que existe um ponto de extensão ali. Se um segundo modificador com regra própria aparecer, a hora de extrair o registro é essa — ver a heurística abaixo.

Este parágrafo é a forma correta de tratar um padrão ausente: dizer que não existe. Guardrail que promete estrutura inexistente faz o próximo agente escrever contra ela.

## Padrões proibidos / restritos

- **Singleton por import** (estado global de módulo) — proibido fora do composition root e do módulo de socket do front, onde a conexão única é a razão de existir do módulo.
- **Service Locator** — proibido. Sempre injeção por construtor.
- **Abstract Factory / Builder** — só com justificativa escrita na entrega; na dúvida, factory method estático.
- **Repositório genérico / Unit of Work genérico** — proibido ([02-ddd.md](02-ddd.md)).
- **`switch` por chave de variação** fora do registro correspondente — é a violação de Open/Closed que este projeto já pagou ([03-solid.md](03-solid.md)).

## Heurística

1. Escreva o código direto.
2. Quando a **segunda** variação do comportamento aparecer, refatore para o padrão.
3. Nunca introduza um padrão "para o futuro".
