# Guardrail: Domain-Driven Design

## Linguagem Ubíqua (PT-BR)

O domínio é modelado **em português**, refletindo o vocabulário dos usuários (jogadores de RPG). Código de domínio usa esses nomes; não traduza para inglês.

| Termo | Significado |
|---|---|
| **Mesa** | Uma campanha/sala de jogo (game table). Agregado raiz do contexto de mesas. |
| **Mestre** | Dono da mesa (GM). Único com poderes de administração. |
| **Jogador** | Participante de uma mesa. |
| **Convite** | Convite por email para entrar numa mesa. |
| **Personagem** | Ficha de personagem pertencente a um jogador dentro de uma mesa. |
| **Cena** | Um mapa/tabletop da mesa (grid, fundo, tokens). Uma por vez está ativa. |
| **Token** | Peça posicionável na cena, opcionalmente vinculada a um personagem. |
| **Rolagem** | Resultado da avaliação de uma expressão de dados (`2d20kh1+5`). |
| **Mensagem** | Entrada no chat da mesa (fala, sussurro ou rolagem). |
| **Combate** | A luta em curso numa mesa: a ordem de iniciativa, a rodada e de quem é a vez. Agregado raiz. |
| **Iniciativa** | O número que ordena os participantes do combate. Quem informa é o sistema de RPG, não o cliente. |
| **Rodada** | Uma volta completa na ordem de iniciativa. |
| **Turno** | A vez de um participante dentro da rodada. |
| **Condição** | Estado marcado numa peça (`inconsciente`, `enfraquecido`). Pertence ao token, não à ficha. |

## Bounded Contexts (módulos do monolito)

```
contas        → identidade, registro, autenticação (Usuario)
mesas         → ciclo de vida de mesas, participação, convites
personagens   → fichas, atributos, perícias
jogo          → cena, tokens, chat, rolagens (tempo real)
```

- Cada contexto aparece com o mesmo nome nas três camadas da api (`dominio/`, `aplicacao/`, e nas rotas de `apresentacao/http`).
- Contextos se comunicam por **ids e eventos de domínio**, nunca por referência direta a entidades de outro contexto: `jogo` referencia `personagemId`, não a entidade `Personagem`.
- O **sistema de RPG** pertence à `Mesa`, não ao personagem. Quem completa um DTO com o sistema é o caso de uso, que já carregou a mesa para autorizar.

## Blocos táticos

- **Entidades**: identidade por id (`Usuario`, `Mesa`, `Personagem`, `Cena`, `Token`, `Mensagem`). Estado privado, mutação apenas por métodos com nome de negócio (`mesa.convidar(...)`, nunca `mesa.setConvites(...)`).
- **Value Objects**: imutáveis, validam na criação e devolvem `Result` (`Email`, `ExpressaoDados`). VO é a forma certa quando o valor tem regra própria e circula entre agregados. Quando a regra pertence a um agregado só, ela vive num **único método privado** dele, compartilhado por `criar` e `atualizar`. O que a regra proíbe, nos dois casos, é a **segunda cópia** da mesma validação.
- **Agregados**: `Mesa` é raiz de participação e convites; `Cena` é raiz dos tokens; `Combate` é raiz da ordem de iniciativa, da rodada e do turno. Escrita em filho atravessa a raiz e é persistida pelo repositório da raiz. Raiz nova entra nesta linha **e** na tabela de linguagem ubíqua acima — agregado que só existe no código é vocabulário que o próximo agente vai reinventar com outro nome.
- **Factory methods**: `criar(...)` valida invariantes; `reconstituir(...)` hidrata do banco sem revalidar história já persistida. Construtor privado.
- **Domain Services**: lógica que não pertence a uma entidade (`ServicoRolagemDados`, com RNG injetado).
- **Eventos de Domínio**: fato no passado, nome `contexto.fato-ocorrido` (`mesas.jogador-convidado`). O agregado registra, o caso de uso despacha pela port `EventBus`, o assinante é montado no composition root — o caso de uso não conhece quem escuta.
- **Repositórios**: um por agregado raiz, interface em `aplicacao/ports`, implementação em `infra/`. Métodos com semântica de domínio e read models explícitos para tela (o DTO de listagem não é a entidade).

## Guardas do agregado — reuse, nunca reimplemente

`Mesa` expõe duas portas de entrada para escrita, e cada uma cobre **duas** condições de uma vez: participação **e** mesa ainda aberta.

| Guarda | Quando |
|---|---|
| `mesa.autorizarEscritaDeParticipante(usuarioId)` | qualquer escrita de quem joga na mesa — chat, rolagem, ficha, token próprio |
| `mesa.autorizarEscritaDoMestre(usuarioId, mensagemNegada)` | escrita privativa do mestre — cenas, convites, remoção, token de terceiro |

`ehMestre(...)` e `ehParticipante(...)` são **consultas**, não autorização. Usá-las cruas numa escrita reintroduz um furo que este projeto já pagou: com a mesa encerrada ainda dava para criar ficha e editar pontos de vida, enquanto a interface prometia "somente leitura para todo mundo" (classe **F5** da [taxonomia](../../docs/agentes/taxonomia-de-falhas.md)).

**Teste objetivo em review:** todo caso de uso que **escreve** chama uma das duas guardas. Se ele chama `ehParticipante`/`ehMestre` direto, pergunte o que acontece com a mesa encerrada — e exija o teste de contrato provando o `409`.

## Invariantes — o que o código DEVE proteger

- Uma mesa tem exatamente um mestre, que é sempre participante; ele não sai da própria mesa (encerra).
- Só o mestre convida, revoga convite, remove jogador, edita a mesa, encerra, cria cenas e mexe em token de terceiro.
- Mesa encerrada é somente leitura para escrita de jogo — com uma exceção deliberada: **sair** continua permitido, senão arquivar a campanha prenderia o jogador a ela para sempre.
- Convite é de uso único, aceito só pelo email convidado, nunca depois de revogado, e reenvio para o mesmo email tem cooldown.
- Um jogador só rola dados ou envia mensagem em mesa da qual participa.
- Token vinculado a personagem só é movido pelo dono do personagem ou pelo mestre.
- Expressão de dados é validada pelo VO `ExpressaoDados` antes de qualquer rolagem.
- Dado que o usuário não pode ver não sai do caso de uso — filtro no cliente não é privacidade (**F4** da taxonomia).

## Anti-padrões proibidos

- Modelo anêmico (entidade só com getters/setters + service com toda a lógica).
- Repositório genérico (`Repository<T>` com CRUD para tudo).
- Vazamento de row do Supabase para dentro do domínio — mapeie em `infra/` ([07-supabase.md](07-supabase.md)).
- Invariante checada na rota ou no componente em vez do agregado.
- Mesma regra de formato validada em dois lugares.
