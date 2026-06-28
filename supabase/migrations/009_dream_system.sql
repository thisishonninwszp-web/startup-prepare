-- 梦想系统：分轮访谈、可选现状快照、不可覆盖的愿景版本。

do $$ begin
  create type dream_context as enum ('personal', 'business', 'cross');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dream_scale as enum ('small', 'big', 'grand');
exception when duplicate_object then null; end $$;

create table if not exists dream_cases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  title           text not null,
  context         dream_context not null,
  scale           dream_scale not null,
  initial_desire  text not null,
  messages        jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create table if not exists dream_sources (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references dream_cases (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('reality')),
  source_id   uuid not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  constraint dream_sources_case_source_uniq
    unique (case_id, source_type, source_id)
);

create table if not exists dream_versions (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references dream_cases (id) on delete cascade,
  previous_version_id uuid references dream_versions (id) on delete set null,
  version_no          integer not null check (version_no > 0),
  vision              jsonb not null,
  delta               jsonb,
  prompt_version      text not null,
  created_at          timestamptz not null default now(),
  constraint dream_versions_case_version_uniq unique (case_id, version_no)
);

create index if not exists idx_dream_cases_user_updated
  on dream_cases (user_id, updated_at desc) where archived_at is null;
create index if not exists idx_dream_sources_case
  on dream_sources (case_id, created_at);
create index if not exists idx_dream_versions_case
  on dream_versions (case_id, version_no desc);

alter table dream_cases enable row level security;
alter table dream_sources enable row level security;
alter table dream_versions enable row level security;

