-- RolaVinte — esquema inicial
-- Aplicar no SQL Editor do Supabase (ou via supabase db push).
-- Acesso exclusivo pelo backend (service role); RLS ligado como defesa em profundidade.

create table usuarios (
  id uuid primary key,
  nome text not null,
  email text not null unique,
  senha_hash text not null,
  criado_em timestamptz not null default now()
);

create table mesas (
  id uuid primary key,
  nome text not null,
  descricao text not null default '',
  sistema text not null default 'generico'
    check (sistema in ('dnd5e', 'tormenta20', 'ordem-paranormal', 'generico')),
  mestre_id uuid not null references usuarios (id) on delete restrict,
  criado_em timestamptz not null default now()
);

create table mesa_jogadores (
  mesa_id uuid not null references mesas (id) on delete cascade,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  papel text not null check (papel in ('mestre', 'jogador')),
  entrou_em timestamptz not null default now(),
  primary key (mesa_id, usuario_id)
);

create table convites (
  id uuid primary key,
  mesa_id uuid not null references mesas (id) on delete cascade,
  email text not null,
  token text not null unique,
  status text not null default 'pendente' check (status in ('pendente', 'aceito')),
  criado_em timestamptz not null default now()
);

create table personagens (
  id uuid primary key,
  mesa_id uuid not null references mesas (id) on delete cascade,
  dono_id uuid not null references usuarios (id) on delete cascade,
  nome text not null,
  classe text not null default '',
  nivel integer not null default 1 check (nivel between 1 and 20),
  pv_atual integer not null check (pv_atual >= 0),
  pv_max integer not null check (pv_max >= 1),
  atributos jsonb not null,
  anotacoes text not null default '',
  criado_em timestamptz not null default now()
);

create table cenas (
  id uuid primary key,
  mesa_id uuid not null references mesas (id) on delete cascade,
  nome text not null,
  largura_grid integer not null check (largura_grid between 5 and 100),
  altura_grid integer not null check (altura_grid between 5 and 100),
  cor_fundo text not null default '#1a2332',
  ativa boolean not null default false,
  criado_em timestamptz not null default now()
);

create table tokens (
  id uuid primary key,
  cena_id uuid not null references cenas (id) on delete cascade,
  nome text not null,
  cor text not null default '#e74c3c',
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  personagem_id uuid references personagens (id) on delete set null,
  criado_em timestamptz not null default now()
);

create table mensagens (
  id uuid primary key,
  mesa_id uuid not null references mesas (id) on delete cascade,
  autor_id uuid references usuarios (id) on delete set null,
  autor_nome text not null,
  tipo text not null check (tipo in ('fala', 'rolagem', 'sistema')),
  conteudo text not null,
  rolagem jsonb,
  motivo text,
  criado_em timestamptz not null default now()
);

-- Índices para os padrões de acesso reais
create index idx_mesa_jogadores_usuario on mesa_jogadores (usuario_id);
create index idx_convites_mesa on convites (mesa_id);
create index idx_personagens_mesa on personagens (mesa_id);
create index idx_cenas_mesa_ativa on cenas (mesa_id) where ativa;
create index idx_tokens_cena on tokens (cena_id);
create index idx_mensagens_mesa_data on mensagens (mesa_id, criado_em desc);

-- Defesa em profundidade: RLS ligado sem políticas = nega anon/authenticated.
-- O backend usa service role, que ignora RLS.
alter table usuarios enable row level security;
alter table mesas enable row level security;
alter table mesa_jogadores enable row level security;
alter table convites enable row level security;
alter table personagens enable row level security;
alter table cenas enable row level security;
alter table tokens enable row level security;
alter table mensagens enable row level security;
