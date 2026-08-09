-- RolaVinte — tokens: edição de propriedades e arte (RV-040, RV-041, RV-042)
-- Aplicar no SQL Editor do Supabase, depois de 0003_cenas.sql.
-- As migrations anteriores são imutáveis: tudo aqui é alteração incremental.

-- RV-041: arte do token.
-- Duas colunas pela mesma razão da cena: a URL é o que o cliente renderiza, e o
-- caminho é o que permite apagar o arquivo anterior quando o mestre troca a arte
-- (a extensão muda entre uploads, então o caminho não é derivável da URL de
-- forma confiável). O caminho nunca sai no `TokenDTO`.
--
-- Ambas nullable e sem default: token sem arte é o caso normal, e o desenho cai
-- no fallback de cor de fundo + iniciais do nome.
alter table tokens add column if not exists imagem_url text;
alter table tokens add column if not exists imagem_caminho text;

-- RV-042 NÃO adiciona coluna nenhuma aqui, de propósito.
-- A barra de vida do token lê `personagens.pv_atual` / `personagens.pv_max`
-- através de `tokens.personagem_id`, que já existe desde a 0001. Copiar o PV
-- para esta tabela criaria duas fontes de verdade que divergiriam no primeiro
-- dano aplicado pela ficha; o cliente cruza os dois conjuntos que já carrega e
-- o evento `personagem:atualizado` mantém a barra viva em tempo real.

-- ─────────────────────────────────────────────────────────────────────────────
-- RV-041 — bucket das artes de token.
--
-- Mesma decisão consciente do bucket `mapas` da 0003: PÚBLICO para leitura,
-- porque a URL fica persistida em `tokens.imagem_url` e uma URL assinada
-- expiraria, deixando a peça sem arte horas depois. O conteúdo é arte de
-- personagem/monstro (sem dado pessoal), o caminho é imprevisível
-- (`tokens/{tokenId}/{uuid}.{ext}`) e a ESCRITA continua exclusiva do backend
-- com service role: não existe política de insert/update/delete para anon nem
-- para authenticated, e `storage.objects` já tem RLS habilitado pelo Supabase.
--
-- Bucket separado do `mapas` para que cota, limpeza e eventual troca de política
-- de um não arrastem o outro.
insert into storage.buckets (id, name, public)
values ('tokens', 'tokens', true)
on conflict (id) do update set public = true;
