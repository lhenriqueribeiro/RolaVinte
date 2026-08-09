-- RolaVinte — cenas: gestão, imagem de fundo e grid configurável (RV-030 … RV-033)
-- Aplicar no SQL Editor do Supabase, depois de 0002_ciclo_de_vida_das_mesas.sql.
-- As migrations 0001 e 0002 são imutáveis: tudo aqui é alteração incremental.

-- RV-032: imagem de fundo da cena.
-- Duas colunas de propósito: a URL é o que o cliente renderiza; o caminho é o
-- que permite apagar o arquivo anterior quando o mestre troca o mapa (a
-- extensão muda entre um upload e outro, então o caminho não é derivável da
-- URL de forma confiável). O caminho nunca sai no `CenaDTO`.
alter table cenas add column if not exists imagem_fundo_url text;
alter table cenas add column if not exists imagem_fundo_caminho text;

-- RV-033: o grid deixa de ser constante no front e vira propriedade da cena.
-- O default 44 é exatamente o `CELULA = 44` que estava no Tabletop.tsx, para que
-- as cenas já existentes continuem desenhando igual.
alter table cenas add column if not exists tamanho_celula integer not null default 44;
alter table cenas add column if not exists grid_visivel boolean not null default true;
alter table cenas add column if not exists cor_grid text not null default '#3a4a63';

alter table cenas drop constraint if exists cenas_tamanho_celula_check;
alter table cenas add constraint cenas_tamanho_celula_check
  check (tamanho_celula between 20 and 200);

-- RV-030: a listagem de cenas do mestre é ordenada por criação.
create index if not exists idx_cenas_mesa_criacao on cenas (mesa_id, criado_em);

-- ─────────────────────────────────────────────────────────────────────────────
-- RV-032 — bucket dos mapas.
--
-- Decisão consciente: bucket PÚBLICO para leitura. A alternativa (bucket privado
-- + URL assinada) foi descartada porque a URL fica persistida em
-- `cenas.imagem_fundo_url` e a assinatura expira — o mapa apareceria quebrado
-- horas depois. O conteúdo é um mapa de RPG (sem dado pessoal), o caminho é
-- imprevisível (UUID por arquivo) e a ESCRITA continua exclusiva do backend com
-- service role: não existe política de insert/update/delete para anon nem para
-- authenticated, e `storage.objects` já tem RLS habilitado pelo Supabase.
insert into storage.buckets (id, name, public)
values ('mapas', 'mapas', true)
on conflict (id) do update set public = true;
