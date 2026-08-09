# Guardrail: SOLID

Aplicação prática dos princípios neste projeto — com o teste objetivo usado em review.

## S — Single Responsibility

- Um use case = uma intenção do usuário = uma classe (`CriarMesa`, `RolarDados`).
- Arquivo com mais de ~200 linhas ou classe com "e" na descrição da responsabilidade → dividir.
- Rotas apenas: validam entrada (Zod) → chamam use case → mapeiam saída. Zero lógica.

## O — Open/Closed

- Novos sistemas de RPG, novos tipos de mensagem de chat e novos modificadores de dados entram por **extensão** (novas estratégias/handlers registrados), não por `if/else` crescendo num switch central.
- Ponto de extensão canônico: `Map<tipo, Handler>` registrado no composition root.

## L — Liskov Substitution

- Implementações de uma port devem honrar o contrato completo (incluindo semântica de erro via `Result`). Um `FakeMesaRepository` de teste deve ser substituível pelo `SupabaseMesaRepository` sem mudar o use case.
- Proibido implementar port lançando `new Error("not implemented")` em método usado.

## I — Interface Segregation

- Ports pequenas e orientadas ao consumidor. `RolarDados` precisa de `PublicadorEventosMesa`, não de um `SocketServer` inteiro.
- Se um use case usa 1 de 6 métodos da interface, extraia uma port menor.

## D — Dependency Inversion

- Use cases dependem de **abstrações** (`interface` em `application/ports`), nunca de `SupabaseClient`, `Resend`, `Server` do socket.io.
- Direção: infraestrutura implementa; aplicação declara.

## Checklist de review

- [ ] Consigo testar este use case com fakes em memória, sem mock de framework?
- [ ] Adicionar um novo caso (novo tipo de dado/mensagem) exige editar código existente ou só adicionar?
- [ ] Alguma interface tem métodos que nenhum consumidor usa?
