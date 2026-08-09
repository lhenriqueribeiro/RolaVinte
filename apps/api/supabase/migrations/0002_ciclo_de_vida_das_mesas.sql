-- RolaVinte — ciclo de vida das mesas (RV-020 … RV-024)
-- Aplicar no SQL Editor do Supabase, depois de 0001_esquema_inicial.sql.
-- A migration 0001 já foi aplicada e é imutável: tudo aqui é alteração incremental.

-- RV-020: convite revogado ganha status próprio. O convite não é apagado —
-- o histórico de quem foi chamado para a mesa fica preservado.
alter table convites drop constraint if exists convites_status_check;
alter table convites add constraint convites_status_check
  check (status in ('pendente', 'aceito', 'revogado'));

-- RV-023: encerrar/arquivar mesa é soft delete. `encerrada_em` nulo = mesa ativa.
-- Exclusão definitiva fica para o card de LGPD (RV-135).
alter table mesas add column if not exists encerrada_em timestamptz;

-- O dashboard separa ativas de encerradas; o índice parcial cobre a lista principal.
create index if not exists idx_mesas_ativas on mesas (id) where encerrada_em is null;
