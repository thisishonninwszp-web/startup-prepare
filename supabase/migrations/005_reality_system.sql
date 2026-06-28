-- 现状认识：诊断式访谈、来源快照、不可覆盖的地图版本。

do $$ begin
  create type reality_mode as enum ('specific', 'global');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reality_context as enum ('personal', 'business', 'cross');
exception when duplicate_object then null; end $$;

create table if not exists reality_cases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  mode              reality_mode not null,
  context           reality_context not null,
  title             text not null,
  initial_statement text not null,
  domains           text[] not null default '{}',
  messages          jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create table if not exists reality_case_sources (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references reality_cases (id) on delete cascade,
  observation_id  uuid references observations (id) on delete set null,
  idea_id         uuid references ideas (id) on delete set null,
  validation_id   uuid references validations (id) on delete set null,
  prediction_id   uuid references predictions (id) on delete set null,
  source_snapshot jsonb not null,
  added_at        timestamptz not null default now(),
  constraint reality_case_sources_parent_check
    check (num_nonnulls(observation_id, idea_id, validation_id, prediction_id) <= 1)
);

create table if not exists reality_versions (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references reality_cases (id) on delete cascade,
  previous_version_id uuid references reality_versions (id) on delete set null,
  version_no       integer not null check (version_no > 0),
  map              jsonb not null,
  delta            jsonb,
  selected_path    jsonb,
  custom_action    text,
  selection_reason text,
  review_due_at    timestamptz,
  created_at       timestamptz not null default now(),
  constraint reality_versions_case_number_uniq unique (case_id, version_no)
);

create index if not exists idx_reality_cases_user_updated
  on reality_cases (user_id, updated_at desc)
  where archived_at is null;
create index if not exists idx_reality_sources_case
  on reality_case_sources (case_id, added_at);
create index if not exists idx_reality_versions_case
  on reality_versions (case_id, version_no desc);
create index if not exists idx_reality_versions_due
  on reality_versions (review_due_at)
  where review_due_at is not null;

alter table reality_cases enable row level security;
alter table reality_case_sources enable row level security;
alter table reality_versions enable row level security;
