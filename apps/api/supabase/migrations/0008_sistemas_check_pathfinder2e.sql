-- CHECK de `mesas.sistema` amarrado a SISTEMAS_RPG (RV-096).
--
-- POR QUE ESTA MIGRATION EXISTE:
-- a lista de sistemas de RPG vive em dois lugares que ninguém comparava --
-- `SISTEMAS_RPG` (packages/shared/src/schemas/mesas.ts) e a restrição de valor
-- da coluna `mesas.sistema`, declarada inline na 0001. Acrescentar um sistema
-- só no TypeScript compilava, passava no lint e passava na suíte inteira (que
-- roda com fakes) e estourava no primeiro INSERT contra o Postgres real.
-- Agora `apps/api/src/testes/check-de-sistemas.test.ts` lê este diretório,
-- extrai a restrição vigente e a compara com o enum: divergência em qualquer
-- direção deixa `npm run test` vermelho nomeando o valor.
--
-- POR QUE UMA MIGRATION NOVA E NÃO UMA EDIÇÃO DA 0001:
-- migration aplicada é imutável. A restrição da 0001 é de coluna, então o
-- Postgres a nomeou `mesas_sistema_check`; recriá-la com o mesmo nome mantém
-- um único constraint na tabela e deixa a 0001 intacta.
--
-- POR QUE `pathfinder2e` JÁ ENTRA AQUI, ANTES DE ESTAR NO ENUM:
-- o RV-152 acrescenta `'pathfinder2e'` a SISTEMAS_RPG nesta mesma sprint e não
-- tem número de migration reservado. Deixar o valor pronto no banco evita que
-- dois agentes concorrentes disputem o número da próxima migration. Enquanto o
-- enum não o declara, o valor consta de SISTEMAS_ANTECIPADOS_NO_CHECK no teste
-- acima -- e há um teste que fica vermelho no dia em que a reserva vencer, para
-- que ela não vire uma quinta lista permanente.
--
-- ATENÇÃO: valor aceito aqui e ausente do enum é inalcançável pela aplicação;
-- valor no enum e ausente daqui derruba o INSERT. Os dois casos são falha de
-- teste. Ao acrescentar um sistema, edite as duas pontas na mesma entrega.

alter table mesas
  drop constraint if exists mesas_sistema_check;

alter table mesas
  add constraint mesas_sistema_check
  check (sistema in ('dnd5e', 'tormenta20', 'ordem-paranormal', 'generico', 'pathfinder2e'));

insert into migrations_aplicadas (nome) values
  ('0008_sistemas_check_pathfinder2e')
on conflict (nome) do nothing;
