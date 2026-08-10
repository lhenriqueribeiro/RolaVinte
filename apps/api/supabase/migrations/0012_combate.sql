-- RolaVinte — combate: ordem de iniciativa, rodada e turno (RV-060 … RV-065)
-- Aplicar depois de 0011_condicoes.sql (`npm run supabase:migrar -w @rolavinte/api`).
-- As migrations anteriores são imutáveis: tudo aqui é criação nova.
--
-- NUMERAÇÃO: o orquestrador desta sprint atribuiu `0010` a este arquivo. `0010`
-- já estava ocupada pela `0010_avaliacao_mensagem` (Sprint 3) e a `0011` foi
-- tomada pelas condições de token (RV-064), executado em paralelo. Medido em
-- disco, o primeiro número livre era `0012`, e é este. O número é ordem de
-- aplicação, não identidade do card.
--
-- O QUE ESTA MIGRATION HABILITA:
-- o mestre inicia o combate com os tokens da cena, a mesa rola iniciativa, o
-- painel mostra a ordem e de quem é a vez, e passar o turno vira a rodada — sem
-- planilha ao lado.

create table if not exists combates (
  id uuid primary key,
  mesa_id uuid not null references mesas (id) on delete cascade,
  -- A cena é onde a luta acontece: apagar a cena apaga o combate dela, como já
  -- acontece com os tokens (0001). Um combate sobrevivendo à cena seria uma
  -- ordem de iniciativa apontando para peças que já não existem.
  cena_id uuid not null references cenas (id) on delete cascade,
  rodada integer not null default 1 check (rodada >= 1),
  -- Posição do turno na ordem canônica, que é do domínio (ver `combate.ts`).
  -- Sem teto no check de propósito: quem garante que o índice cabe na lista é o
  -- agregado, que reposiciona na reconstituição — e ele precisa poder ler o que
  -- estiver gravado, inclusive um índice que ficou grande porque a cascata de
  -- `token_id` abaixo apagou participantes pelas costas da aplicação.
  indice_turno integer not null default 0 check (indice_turno >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UM COMBATE ATIVO POR MESA — a invariante no banco, não só no caso de uso.
--
-- O `IniciarCombate` consulta `buscarAtivoDaMesa` e devolve 409 antes de gravar,
-- e é ele quem dá a mensagem em PT-BR ao mestre. Este índice é a segunda tranca,
-- para a corrida que a consulta não cobre: dois cliques quase simultâneos no
-- botão "Iniciar combate" fazem duas leituras verem "nenhum ativo" e as duas
-- escritas passarem. Com o índice, a segunda falha no banco.
--
-- Índice único PARCIAL (`where ativo`): o histórico precisa de vários combates
-- encerrados por mesa, então a unicidade só vale para o que está em curso.
create unique index if not exists idx_combates_ativo_por_mesa
  on combates (mesa_id)
  where ativo;

create table if not exists combate_participantes (
  combate_id uuid not null references combates (id) on delete cascade,
  -- `on delete cascade`: apagar o token tira a peça da ordem de iniciativa. A
  -- alternativa (`set null`) deixaria um lugar na ordem sem peça no mapa, e o
  -- `restrict` impediria o mestre de apagar um token no meio da luta — as duas
  -- piores que simplesmente sair do combate.
  token_id uuid not null references tokens (id) on delete cascade,
  -- Nome desnormalizado, como `mensagens.autor_nome` desde a 0001: o painel de
  -- iniciativa é o registro de quem entrou na luta, e renomear a peça no meio do
  -- combate não deve renomear a linha da ordem.
  nome text not null,
  -- NULL = ainda não rolou. Não é 0: um participante que tirou 0 e um que ainda
  -- não rolou são estados diferentes, e a ordem canônica os separa (quem não
  -- rolou vai para o fim, atrás de quem tirou negativo).
  iniciativa integer,
  -- O desempate estável. É o número de entrada no combate e nunca muda: sem ele,
  -- duas iniciativas iguais deixariam a ordem à mercê da ordem em que o Postgres
  -- devolveu as linhas, e o painel embaralharia entre dois GET.
  ordem_desempate integer not null,
  primary key (combate_id, token_id)
);

-- Unicidade do desempate DENTRO do combate: é o que faz a ordenação ser função
-- só dos dados. Dois participantes com o mesmo `ordem_desempate` e a mesma
-- iniciativa voltariam a empatar de verdade, e o comparador do domínio — que é
-- total justamente para nunca devolver 0 — deixaria de poder cumprir isso.
create unique index if not exists idx_combate_participantes_desempate
  on combate_participantes (combate_id, ordem_desempate);

-- Caminho de acesso real: carregar o agregado é "os participantes deste
-- combate", e o índice já os entrega na ordem canônica. `nulls last` casa com a
-- regra do domínio (quem não rolou vai para o fim); a ordenação definitiva
-- continua sendo do agregado, este índice só evita o sort no banco.
create index if not exists idx_combate_participantes_ordem
  on combate_participantes (combate_id, iniciativa desc nulls last, ordem_desempate);

-- Caminho de acesso do painel e do dashboard: o combate ativo de uma mesa.
create index if not exists idx_combates_mesa on combates (mesa_id, criado_em desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- NENHUMA COLUNA `ausente` — decisão registrada, e o card foi corrigido.
--
-- O escopo do RV-060 pedia `combate_participantes.ausente`. Ela não existe aqui
-- porque nenhum cenário de RV-060 a RV-065 a escreve ou a lê, e porque o fato
-- que ela representaria — "esta criatura está fora da luta" — passou a ter uma
-- casa nesta mesma sprint: `tokens.condicoes` (RV-064, migration `0011`), que é
-- onde o RV-065 grava `inconsciente` ao zerar o PV. Um booleano aqui seria a
-- segunda verdade do mesmo fato (F12 da taxonomia), com o agravante de que o
-- painel leria uma e o mapa a outra.
--
-- Se algum dia "atrasar o turno" ou "sair da ordem sem sair da luta" virar
-- funcionalidade, a coluna volta com dono, leitor e teste — não antes.

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS habilitada e sem política, como em toda tabela desde a 0001: nega anon e
-- authenticated. O backend fala com service role, que a ignora — quem autoriza
-- iniciar, passar turno e encerrar é o agregado `Mesa`
-- (`autorizarEscritaDoMestre`), com teste de contrato provando o 403.
alter table combates enable row level security;
alter table combate_participantes enable row level security;

insert into migrations_aplicadas (nome) values
  ('0012_combate')
on conflict (nome) do nothing;
