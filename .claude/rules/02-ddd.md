# Guardrail: Domain-Driven Design

## Linguagem Ubíqua (PT-BR)

O domínio é modelado **em português**, refletindo o vocabulário dos usuários (jogadores de RPG). Código de domínio usa esses nomes; não traduza para inglês.

| Termo | Significado |
|---|---|
| **Mesa** | Uma campanha/sala de jogo (game table). Agregado raiz do contexto de jogo. |
| **Mestre** | Dono da mesa (GM). Único com poderes de administração. |
| **Jogador** | Participante de uma mesa. |
| **Convite** | Convite por email para entrar numa mesa. |
| **Personagem** | Ficha de personagem pertencente a um jogador dentro de uma mesa. |
| **Cena** | Um mapa/tabletop ativo da mesa (grid, fundo, tokens). |
| **Token** | Peça posicionável na cena, opcionalmente vinculada a um personagem. |
| **Rolagem** | Resultado da avaliação de uma expressão de dados (`2d20kh1+5`). |
| **Mensagem** | Entrada no chat da mesa (fala, sussurro ou rolagem). |

## Bounded Contexts (módulos do monolito)

```
contas        → identidade, registro, autenticação (Usuario)
mesas         → ciclo de vida de mesas, participação, convites
personagens   → fichas, atributos, perícias
jogo          → cena, tokens, chat, rolagens (tempo real)
```

- Contextos se comunicam por **ids e eventos de domínio**, nunca por referência direta a entidades de outro contexto.
- `jogo` referencia `personagemId`, não a entidade `Personagem`.

## Blocos táticos

- **Entidades**: identidade por id (`Usuario`, `Mesa`, `Personagem`). Estado privado, mutação apenas por métodos com nome de negócio (`mesa.convidar(...)`, não `mesa.setConvites(...)`).
- **Value Objects**: imutáveis, validam na criação e retornam `Result` (`Email`, `NomeMesa`, `ExpressaoDados`, `PosicaoGrid`).
- **Agregados**: `Mesa` é raiz de participação/convites; `Cena` é raiz dos tokens. Modificações atravessam a raiz.
- **Domain Services**: lógica que não pertence a uma entidade (`ServicoRolagemDados`).
- **Eventos de Domínio**: fatos no passado (`JogadorConvidado`, `RolagemRealizada`). Publicados pelo agregado, despachados pelo use case via `EventBus` port.
- **Repositórios**: um por agregado raiz, interface na aplicação (`MesaRepository`), implementação na infraestrutura.

## Invariantes — exemplos que o código DEVE proteger

- Uma mesa tem exatamente um mestre; o mestre não pode sair da própria mesa (pode encerrá-la).
- Só o mestre convida, remove jogadores, cria cenas e move tokens de terceiros.
- Um jogador só rola dados/envia mensagem em mesa da qual participa.
- Token vinculado a personagem só é movido pelo dono do personagem ou pelo mestre.
- Expressões de dados são validadas pelo VO `ExpressaoDados` antes de qualquer rolagem.

## Anti-padrões proibidos

- Modelo anêmico (entidade só com getters/setters + service com toda a lógica).
- Repositório genérico (`Repository<T>` com CRUD para tudo).
- Vazamento de tipos do Supabase (rows) para dentro do domínio — mapeie em `infrastructure/`.
