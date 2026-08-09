-- Provisionamento dos buckets de Storage (RV-138).
--
-- Não é uma migration: buckets vivem no schema `storage`, gerenciado pelo
-- Supabase, e não fazem parte do versionamento de schema da aplicação. Rode uma
-- vez por projeto (é idempotente).
--
-- Decisão de bucket PÚBLICO, registrada em
-- apps/api/src/infra/storage/supabase-armazenamento-arquivos.ts: a URL fica
-- persistida em `cenas.imagem_fundo_url` / `tokens.imagem_url`, e URL assinada
-- expira — o mapa apareceria quebrado depois de algumas horas.
--
-- Escrita continua exclusiva do backend, que usa a chave secreta e passa por
-- cima do RLS. O que o bucket público libera é apenas a LEITURA do arquivo por
-- quem tem a URL.
--
-- `file_size_limit` é defesa em profundidade: o limite que vale de verdade é o
-- `limits.fileSize` do @fastify/multipart, em apresentacao/http/rotas-jogo.ts.
-- Os 8 MB abaixo espelham TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES de @rolavinte/shared;
-- se aquele valor mudar, mude aqui junto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('mapas', 'mapas', true, 8388608, array['image/png', 'image/jpeg', 'image/webp']),
  ('tokens', 'tokens', true, 8388608, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
