-- RolaVinte — chat: sussurro e rolagem oculta (RV-070, RV-071, RV-074)
-- Aplicar no SQL Editor do Supabase, depois de 0004_tokens.sql.
-- As migrations anteriores são imutáveis: tudo aqui é alteração incremental.

-- ─────────────────────────────────────────────────────────────────────────────
-- RV-070 — destinatário do sussurro.
--
-- `destinatario_nome` é denormalizado de propósito, exatamente como `autor_nome`
-- já era desde a 0001: o histórico do chat é um registro do que aconteceu
-- naquele instante, e o rótulo "sussurro para <nome>" não deve mudar (nem
-- sumir) porque a pessoa trocou de nome ou saiu da mesa depois.
--
-- `on delete set null` no id acompanha a política de `autor_id`: apagar a conta
-- não apaga a conversa da mesa. O nome sobrevive à conta, o vínculo não.
alter table mensagens
  add column if not exists destinatario_id uuid references usuarios (id) on delete set null;
alter table mensagens add column if not exists destinatario_nome text;

-- ─────────────────────────────────────────────────────────────────────────────
-- RV-070 / RV-071 — dois tipos novos de mensagem.
--
-- O check da 0001 foi escrito inline (`tipo text not null check (...)`), então o
-- Postgres o nomeou `mensagens_tipo_check`. Ele precisa cair e voltar: não há
-- "alter constraint" para mudar a expressão de um check.
--
-- Os nomes têm de bater LETRA POR LETRA com o union `TipoMensagem` de
-- `packages/shared/src/tipos/dtos.ts` e com as chaves de `RESTRICAO_POR_TIPO` em
-- `chat/visibilidade.ts` — é essa string que a consulta de histórico usa para
-- decidir o que é público.
alter table mensagens drop constraint if exists mensagens_tipo_check;
alter table mensagens
  add constraint mensagens_tipo_check
  check (tipo in ('fala', 'rolagem', 'sistema', 'sussurro', 'rolagem-oculta'));

-- Coerência do sussurro no próprio banco: só sussurro tem destinatário, e todo
-- sussurro tem um. Sem isto, uma mensagem `fala` com `destinatario_id`
-- preenchido passaria pelo filtro de visibilidade de terceiro sem ser restrita —
-- e um `sussurro` sem destinatário ficaria visível só ao autor, virando uma
-- rolagem oculta silenciosa.
alter table mensagens drop constraint if exists mensagens_destinatario_check;
alter table mensagens
  add constraint mensagens_destinatario_check
  check (
    (tipo = 'sussurro' and destinatario_id is not null and destinatario_nome is not null)
    or (tipo <> 'sussurro' and destinatario_id is null and destinatario_nome is null)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Índice do histórico.
--
-- `idx_mensagens_mesa_data (mesa_id, criado_em desc)` da 0001 continua sendo o
-- caminho principal. O filtro de visibilidade acrescentou `destinatario_id` ao
-- `or`, e as linhas com destinatário são uma minoria — índice parcial, para não
-- pagar por milhares de `null`.
create index if not exists idx_mensagens_destinatario
  on mensagens (destinatario_id)
  where destinatario_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Nada de RLS novo: `mensagens` já tem row level security habilitada e sem
-- política desde a 0001 (nega anon e authenticated). O sussurro NÃO é protegido
-- por RLS — o backend fala com service role, que a ignora. Quem garante a
-- privacidade é o filtro do repositório mais a entrega direcionada por socket,
-- ambos cobertos por teste de contrato. Registrado aqui para que ninguém leia o
-- `enable row level security` da 0001 como se fosse a defesa deste card.
