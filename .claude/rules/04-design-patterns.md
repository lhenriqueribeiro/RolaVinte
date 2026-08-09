# Guardrail: Design Patterns — quando e como usar

Padrões são vocabulário, não ornamento. Use o padrão **mais simples que resolve**; nomeie a classe pelo papel de negócio, não pelo padrão (`SupabaseMesaRepository`, não `MesaRepositoryImpl`).

## Padrões canônicos deste projeto

| Padrão | Onde | Regra |
|---|---|---|
| **Repository** | 1 por agregado (`MesaRepository`, `CenaRepository`) | Interface em `application/ports`, métodos com semântica de domínio (`buscarPorConvite`), nunca CRUD genérico. |
| **Result (Railway)** | domínio + aplicação | `Result.ok/Result.fail` para toda falha esperada. Exceção = bug. |
| **Factory Method estático** | entidades e VOs | Construtor privado; criação por `Mesa.criar(...)` (valida) e `Mesa.reconstituir(...)` (hidrata do banco, não revalida invariantes históricas). |
| **Strategy** | motor de dados (modificadores `kh`, `kl`, explosão), sistemas de ficha | Novas variantes = nova estratégia registrada, sem tocar no parser. |
| **Observer / Pub-Sub** | eventos de domínio → `EventBus`; broadcast em tempo real → `PublicadorEventosMesa` | Efeitos colaterais (email, notificação socket) assinam eventos; use case não conhece os assinantes. |
| **Adapter** | toda a `infrastructure/` | Converte contratos externos (Supabase rows, Resend API) para/da linguagem do domínio. Mapeamento row↔entidade em `*.mapper.ts`. |
| **Facade** | `presentation/ws/GatewayJogo` | Fachada única do tempo real; sockets nunca tocam use cases diretamente sem passar por ela. |
| **Decorator** | preocupações transversais (log, métricas em ports) | Envolver a port, nunca poluir o use case. |
| **Specification** (opcional) | consultas de domínio complexas | Só quando a regra de seleção for reutilizada em ≥2 lugares. |

## Padrões proibidos / restritos

- **Singleton por import** (estado global módulo-nível) — proibido fora do composition root.
- **Service Locator** — proibido; sempre injeção por construtor.
- **Abstract Factory / Builder** — só com justificativa escrita no PR; na dúvida, factory method estático.
- **Generic Repository / Unit of Work genérico** — proibido (ver regra DDD).

## Heurística

1. Escreva o código direto.
2. Ao surgir a segunda variação de um comportamento, refatore para o padrão.
3. Nunca introduza um padrão "para o futuro".
