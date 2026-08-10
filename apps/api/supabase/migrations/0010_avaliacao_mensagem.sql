-- Grau de sucesso junto da mensagem do chat (RV-154).
-- Aplicar no SQL Editor do Supabase, depois de
-- 0009_consolidar_atributos_pathfinder2e.sql.
-- As migrations anteriores são imutáveis: tudo aqui é alteração incremental.
--
-- O QUE ESTA MIGRATION HABILITA:
-- rolar "1d20+11 cd 18" numa mesa de Pathfinder 2e e o chat dizer "Sucesso
-- crítico" para todo mundo, sem ninguém conferir na mão se 28 contra CD 18 foi
-- crítico. O grau é apurado pelo sistema da mesa (`DefinicaoSistema.avaliarRolagem`)
-- e gravado com a mensagem.
--
-- POR QUE UMA COLUNA NOVA, E NÃO UM CAMPO DENTRO DE `rolagem`:
-- `mensagens.rolagem` é o espelho exato de `ResultadoRolagem`, o que o motor de
-- dados produz — e o motor é agnóstico de sistema: ele não sabe o que é uma CD e
-- não vai passar a saber (DoD do RV-154). Aninhar a avaliação ali faria o
-- espelho deixar de ser espelho, e o próximo a serializar um resultado de
-- rolagem gravaria um objeto com um campo que o motor não conhece.
--
-- POR QUE NULLABLE, SEM `not null` E SEM DEFAULT:
-- `null` é o estado da esmagadora maioria das mensagens, agora e sempre —
-- rolagem livre ("/r 1d20") não tem CD e portanto não tem grau, e fala e
-- sussurro nunca terão. Todas as mensagens já gravadas ficam com `null`, que a
-- aplicação lê como "sem CD informada" e o chat renderiza sem selo. Um default
-- aqui inventaria uma CD para o passado.

alter table mensagens add column if not exists avaliacao jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- Coerência no próprio banco: só rolagem tem avaliação.
--
-- Uma `fala` com grau de sucesso é estado impossível — o agregado `Mensagem` só
-- aceita `avaliacao` nas duas fábricas de rolagem, e este check é a segunda
-- tranca, no lugar onde nenhum caminho de escrita futuro escapa. É o mesmo
-- raciocínio do `mensagens_destinatario_check` da `0005`.
--
-- Os nomes de tipo têm de bater LETRA POR LETRA com o union `TipoMensagem` de
-- `packages/shared/src/tipos/dtos.ts`, como já vale para o check de `tipo`.
--
-- `avaliacao is null` primeiro: é o que faz TODA linha existente passar sem
-- reescrita nenhuma, incluindo as falas gravadas desde a 0001.
alter table mensagens drop constraint if exists mensagens_avaliacao_check;
alter table mensagens
  add constraint mensagens_avaliacao_check
  check (avaliacao is null or tipo in ('rolagem', 'rolagem-oculta'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Nenhum índice: `avaliacao` é lida junto da mensagem e nunca é critério de
-- busca — o histórico é filtrado por mesa, visibilidade e cursor (`0005`,
-- RV-073). Índice em coluna que ninguém consulta é custo de escrita sem leitura.
--
-- Nenhuma política de RLS nova: `mensagens` já tem row level security habilitada
-- e sem política desde a `0001` (nega anon e authenticated), e o backend fala com
-- service role. Quem protege a rolagem oculta é o filtro do repositório mais a
-- entrega direcionada por socket — a avaliação viaja dentro da mensagem e herda
-- exatamente a mesma visibilidade.

insert into migrations_aplicadas (nome) values
  ('0010_avaliacao_mensagem')
on conflict (nome) do nothing;
