-- Ficha por sistema de RPG (RV-091).
--
-- A ficha deixa de ser uma estrutura única e fixa. As colunas comuns a todo
-- sistema (nome, classe, nivel, pv_atual, pv_max, atributos, anotacoes)
-- continuam como estão; tudo o que é próprio do sistema passa a viver em
-- `dados`, validado pelo `schemaFicha` da definição em
-- packages/shared/src/sistemas/.
--
-- POR QUE `default '{}'` E `not null`:
-- já existem personagens gravados. Com o default, toda linha antiga passa a ter
-- `dados = {}` — que é exatamente o valor válido da ficha genérica, o sistema
-- da maioria das mesas hoje. Nenhum backfill, nenhuma conversão, nenhuma perda:
-- o teste `personagem-formato-antigo.test.ts` prova que uma ficha no formato
-- anterior carrega, salva e volta idêntica.
--
-- POR QUE NÃO HÁ COLUNA `sistema` AQUI:
-- o sistema pertence à `Mesa` (`mesas.sistema`). Copiá-lo para cá criaria duas
-- verdades que divergem no dia em que o mestre editar a mesa. O `PersonagemDTO`
-- carrega `sistema`, mas derivado da mesa na leitura — não desta tabela.

alter table personagens
  add column if not exists dados jsonb not null default '{}'::jsonb;

-- A coluna guarda um objeto JSON, nunca um array, número ou string solta: o
-- schema do sistema pressupõe um objeto, e um `[]` gravado por engano faria
-- toda leitura daquela ficha estourar no mapper.
alter table personagens
  drop constraint if exists personagens_dados_objeto;

alter table personagens
  add constraint personagens_dados_objeto
  check (jsonb_typeof(dados) = 'object');

insert into migrations_aplicadas (nome) values
  ('0007_fichas_por_sistema')
on conflict (nome) do nothing;
