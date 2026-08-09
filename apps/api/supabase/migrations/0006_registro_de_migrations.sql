-- Registro de migrations aplicadas.
--
-- Nasce de um defeito real: `npm run supabase:verificar` conferia uma LISTA
-- FIXA de tabelas e colunas, escrita à mão. Quando a 0005 chegou, o verificador
-- não sabia que ela existia e respondeu "Ambiente pronto" com o chat inteiro
-- fora do ar contra o banco real — `mensagens.destinatario_id` entra na lista de
-- colunas de todo SELECT e todo INSERT de mensagem.
--
-- A correção estrutural é esta tabela: o verificador passa a comparar os
-- ARQUIVOS em supabase/migrations/ com as LINHAS aqui. Migration nova sem linha
-- correspondente é denunciada sozinha, sem ninguém precisar lembrar de
-- atualizar o verificador.
--
-- REGRA PARA TODA MIGRATION DAQUI EM DIANTE: termine o arquivo registrando-se,
-- exatamente como as últimas linhas abaixo fazem.

create table if not exists migrations_aplicadas (
  nome text primary key,
  aplicada_em timestamptz not null default now()
);

alter table migrations_aplicadas enable row level security;

-- Retroativo: as anteriores foram aplicadas antes desta tabela existir.
-- `on conflict do nothing` mantém o arquivo repetível num banco parcialmente
-- preparado, sem sobrescrever a data real de quem já estava registrado.
insert into migrations_aplicadas (nome) values
  ('0001_esquema_inicial'),
  ('0002_ciclo_de_vida_das_mesas'),
  ('0003_cenas'),
  ('0004_tokens'),
  ('0005_chat'),
  ('0006_registro_de_migrations')
on conflict (nome) do nothing;
