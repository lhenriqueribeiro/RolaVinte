# Guardrail: Banco de Dados e Storage (Supabase)

## Papel do Supabase no projeto

- Supabase é **Postgres gerenciado + Storage**. O acesso é **exclusivamente pelo backend**, com service role, e o SDK aparece só nos adapters de `infra/` ([01-arquitetura.md](01-arquitetura.md)).
- O frontend **nunca** fala com o Supabase. Toda autorização é regra de domínio no monolito.
- RLS fica habilitada e **sem nenhuma política** nas tabelas — o que nega `anon` e `authenticated` por completo. É defesa em profundidade contra chave vazada, e nada mais.
- **Não trate RLS como a proteção de uma feature.** Service role a ignora, e é com ela que o backend fala. Quem protege dado restrito é o filtro no repositório mais a entrega direcionada, ambos cobertos por teste de contrato. Migration que mexe em dado privado deve dizer isso por escrito, para ninguém ler `enable row level security` como se fosse a defesa.

## Convenções de schema

- Tabelas e colunas em PT-BR `snake_case` (`mesas`, `mesa_jogadores`, `personagens`).
- Tabela de entidade: `id uuid primary key`, **gerado pela aplicação e não pelo banco**, e um `timestamptz not null default now()` registrando quando a linha nasceu. Tabela de relacionamento usa a chave composta natural (o par de ids), e tabela de infraestrutura usa a chave que fizer sentido para ela — o que não se negocia é a origem do id da entidade.
- FK sempre com `on delete` explícito e pensado: apagar mesa apaga cenas, tokens e mensagens; apagar ficha deixa o token na cena com `personagem_id` nulo. A cascata é decisão de domínio, não detalhe físico.
- Enum de domínio como `text` + `check constraint` — mais fácil de evoluir que enum nativo. **Todo `check` que espelha uma lista em TypeScript precisa de uma guarda comparando as duas**: acrescentar valor só no enum compila, passa no lint, passa na suíte com fakes e estoura no primeiro `insert` real (classe **F2** da [taxonomia](../../docs/agentes/taxonomia-de-falhas.md)).
- Índice para padrão de acesso **real**, na forma em que a consulta é feita (mesa + ordem + cursor, por exemplo). Índice em coluna que ninguém consulta é custo de escrita sem leitura.
- Coluna nova exigida na escrita tem de ser lida em algum lugar. Campo gravado e nunca lido é o sintoma clássico de duas verdades (**F12** da taxonomia).

## Migrations

- Arquivos em `apps/api/supabase/migrations/NNNN_descricao.sql`, aplicados em ordem, **imutáveis depois de aplicados**. Mudança de schema é sempre arquivo novo, nunca edição do anterior.
- **Toda migration termina se registrando** na tabela de migrations aplicadas. Isso é o que torna a verificação de ambiente **derivada** — arquivos em disco comparados com linhas na tabela — em vez de uma lista escrita à mão, que já respondeu "ambiente pronto" com o chat inteiro fora do ar (**F10** da taxonomia).
- Aplicar e conferir: `npm run supabase:migrar -w @rolavinte/api` e `npm run supabase:verificar -w @rolavinte/api`.
- Migration nova = mappers atualizados no mesmo passo. Coluna adicionada ao `insert` e esquecida no `select` é o defeito mais barato de evitar e o mais caro de descobrir.

## Repositórios e mappers

- Mapeamento row↔entidade em `*.mapper.ts`. O domínio nunca vê um row do Supabase.
- **Nunca `select('*')`** em código de produção: liste as colunas. É o que faz uma coluna faltando falhar alto, em vez de virar `undefined` silencioso.
- Erro do supabase-js é **falha de infraestrutura**, e por isso vira exceção com contexto da operação — não `Result`. Conflito de negócio (email repetido, convite já aceito) é detectado pelo domínio **antes** da escrita, e volta como `ErroDominio`. Deduzir regra de negócio a partir de código de erro do banco é acoplar domínio a mensagem de driver.
- Sem N+1: agregado carrega filhos com `in (...)`/join, não com laço de consulta.
- `salvar(agregado)` sincroniza o estado **inteiro** do agregado, inclusive remoções de filhos. Um `upsert` que só acrescenta faz o participante removido voltar na próxima leitura — e o fake em memória jamais mostra isso (**F3** da taxonomia). Comportamento que depende de *como* o adapter grava se testa no adapter.

## Storage

- Todo arquivo passa pela port `ArmazenamentoArquivos`. Rota e caso de uso não conhecem bucket nem SDK.
- **Buckets são públicos, por decisão consciente.** A alternativa era URL assinada, mas a URL fica persistida no registro e URL assinada expira — o mapa apareceria quebrado horas depois, ou exigiria reassinar a cada leitura. O conteúdo é arte de jogo, o caminho é imprevisível e a escrita continua exclusiva do backend.
- **O caminho é sempre gerado pela aplicação.** Nome de arquivo vindo do cliente é path traversal e sobrescrita de arte alheia.
- Persista o **caminho** além da URL: a extensão muda entre uploads, então não dá para derivar o caminho da URL na hora de apagar a arte anterior. O caminho não sai no DTO.
- **Apagou registro, apague o arquivo.** Cascata de FK não alcança o Storage, e o que sobra é arquivo órfão pagando cota para sempre (**F7** da taxonomia). Vale também para o que desaparece por cascata: quem apaga o pai é responsável pelos arquivos dos filhos.
- Buckets separados por finalidade quando cota e limpeza de um não devem afetar o outro — mesmo adapter, bucket diferente injetado no composition root.

## O que rejeitar em code review

- SDK do Supabase fora de `infra/`.
- `select('*')`, ou coluna no `insert` ausente do `select`.
- Migration editada depois de aplicada, ou que não se registra.
- Lista em SQL espelhando lista em TypeScript sem nada comparando as duas.
- RLS citada como proteção de feature.
- Upload com caminho derivado de nome do cliente, ou remoção de registro que deixa arquivo para trás.
