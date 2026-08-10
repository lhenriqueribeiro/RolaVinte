-- Condições e estados no token (RV-064).
-- Aplicar no SQL Editor do Supabase, depois de 0010_avaliacao_mensagem.sql,
-- ou por `npm run supabase:migrar -w @rolavinte/api`.
-- As migrations anteriores são imutáveis: tudo aqui é alteração incremental.
--
-- O QUE ESTA MIGRATION HABILITA:
-- o mestre marca "envenenado", "caído" ou "atordoado" numa peça e a mesa inteira
-- passa a ver o marcador — com rótulo textual, não só ícone — sem ninguém
-- anotar num papel ao lado. É também onde o RV-065 vai gravar o "inconsciente"
-- de quem chega a 0 PV.

-- ─────────────────────────────────────────────────────────────────────────────
-- A coluna.
--
-- `text[]` e não uma tabela `token_condicoes`: a lista é curta (a peça tem duas
-- ou três condições), é lida SEMPRE junto do token e nunca é critério de busca.
-- Uma tabela filha custaria um segundo select — ou um join — em toda leitura de
-- cena, para modelar um conjunto que já cabe na linha.
--
-- `not null default '{}'` faz toda linha existente nascer com a lista vazia, e
-- é o que garante que o mapper nunca leia `null`: "sem condição" tem uma única
-- representação no banco, e não duas (`null` e `{}`) que a aplicação teria de
-- tratar como sinônimos.
alter table tokens add column if not exists condicoes text[] not null default '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE NÃO EXISTE UM `check` ENUMERANDO AS CONDIÇÕES AQUI.
--
-- Seria a mesma lista em duas linguagens. O projeto já pagou por isso: o `check`
-- de `mesas.sistema` era uma segunda lista de sistemas de RPG, e uma mesa de
-- sistema novo era recusada só em runtime, contra o banco real (RV-096). A
-- correção de lá foi uma guarda que lê o SQL e compara com o enum nas duas
-- direções — trabalho que só existe porque a segunda lista existe.
--
-- Aqui a lista tem uma casa só: o catálogo `CONDICOES` de
-- `packages/shared/src/schemas/jogo.ts`. Quem recusa chave desconhecida é o
-- `condicaoSchema` na borda HTTP (400) e o agregado `Token`, que valida de novo
-- porque a proteção não pode morar só na forma de quem chama. E a leitura é
-- tolerante de propósito: `Token.reconstituir` descarta chave que não está mais
-- no catálogo, então tirar uma condição de circulação não deixa peça ilegível.
--
-- Se algum dia uma condição precisar de integridade referencial de verdade
-- (histórico, efeito mecânico, tradução por sistema), o caminho é uma tabela
-- `condicoes` semeada A PARTIR do catálogo por migration gerada — não um `check`
-- copiado à mão.

-- ─────────────────────────────────────────────────────────────────────────────
-- Nenhum índice: `condicoes` nunca aparece em `where`. Os tokens são buscados
-- por `id` ou por `cena_id`, e as condições viajam junto na linha. Índice GIN em
-- coluna que ninguém consulta é custo de escrita sem leitura.
--
-- Nenhuma política de RLS nova: `tokens` já tem row level security habilitada e
-- sem política desde a 0001 (nega anon e authenticated), e o backend fala com
-- service role. Quem autoriza marcar condição é o agregado `Mesa`
-- (`autorizarEscritaDoMestre`), como em toda escrita de propriedade do token.

insert into migrations_aplicadas (nome) values
  ('0011_condicoes')
on conflict (nome) do nothing;
