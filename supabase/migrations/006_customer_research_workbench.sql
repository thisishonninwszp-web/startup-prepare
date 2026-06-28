-- 顾客视点：跨课题证据库、研究批次、证据约束代理与模式报告。

do $$ begin
  create type customer_material_origin as enum ('web', 'interview', 'chat', 'review', 'url');
exception when duplicate_object then null; end $$;

do $$ begin
  create type customer_review_status as enum ('candidate', 'kept', 'excluded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type customer_emotion_basis as enum ('stated', 'inferred', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type customer_research_cadence as enum ('daily', 'weekly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type customer_proxy_mode as enum ('listen', 'idea_reaction');
exception when duplicate_object then null; end $$;

create table if not exists customer_cases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  idea_id            uuid references ideas (id) on delete set null,
  title              text not null,
  customer_hypothesis text not null,
  problem_context    text not null,
  markets            text[] not null default '{}',
  original_belief    text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);

create table if not exists customer_materials (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  origin         customer_material_origin not null,
  source         text not null,
  source_id      text,
  source_url     text,
  title          text,
  sanitized_text text not null,
  dedupe_key     text not null,
  language       text,
  market         text,
  created_at     timestamptz not null default now(),
  constraint customer_materials_user_dedupe_uniq unique (user_id, dedupe_key)
);

create table if not exists customer_case_materials (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references customer_cases (id) on delete cascade,
  material_id uuid not null references customer_materials (id) on delete cascade,
  status      customer_review_status not null default 'candidate',
  added_at    timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint customer_case_material_uniq unique (case_id, material_id)
);

create table if not exists customer_evidence_atoms (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  material_id   uuid not null references customer_materials (id) on delete cascade,
  quote         text not null,
  scene         text not null default '',
  behavior      text not null default '',
  alternative   text not null default '',
  tradeoff      text not null default '',
  emotion       text not null default '',
  emotion_basis customer_emotion_basis not null,
  prompt_version text not null,
  created_at    timestamptz not null default now()
);

create table if not exists customer_research_topics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  case_id      uuid not null references customer_cases (id) on delete cascade,
  query        text not null,
  translated_queries jsonb not null default '{}'::jsonb,
  markets      text[] not null default '{}',
  cadence      customer_research_cadence not null default 'weekly',
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  next_run_at  timestamptz not null,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists customer_research_runs (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references customer_cases (id) on delete cascade,
  evidence_ids  uuid[] not null default '{}',
  segments      jsonb not null,
  prompt_version text not null,
  created_at    timestamptz not null default now()
);

create table if not exists customer_proxy_versions (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references customer_cases (id) on delete cascade,
  research_run_id     uuid not null references customer_research_runs (id) on delete cascade,
  previous_version_id uuid references customer_proxy_versions (id) on delete set null,
  version_no          integer not null check (version_no > 0),
  selected_segment    jsonb not null,
  proxy               jsonb not null,
  delta               jsonb,
  is_provisional      boolean not null,
  created_at          timestamptz not null default now(),
  constraint customer_proxy_case_version_uniq unique (case_id, version_no)
);

create table if not exists customer_proxy_sessions (
  id            uuid primary key default gen_random_uuid(),
  proxy_version_id uuid not null references customer_proxy_versions (id) on delete cascade,
  mode          customer_proxy_mode not null,
  idea_id       uuid references ideas (id) on delete set null,
  idea_snapshot jsonb,
  messages      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint customer_proxy_session_idea_check
    check (
      (mode = 'listen' and idea_snapshot is null)
      or (mode = 'idea_reaction' and idea_snapshot is not null)
    )
);

create table if not exists customer_conclusions (
  id                 uuid primary key default gen_random_uuid(),
  proxy_version_id   uuid not null unique references customer_proxy_versions (id) on delete cascade,
  original_misunderstanding text not null,
  updated_understanding text not null,
  still_unknown      text not null,
  contact_person     text not null,
  one_question       text not null,
  created_at         timestamptz not null default now()
);

create table if not exists customer_pattern_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  filters      jsonb not null default '{}'::jsonb,
  report       jsonb not null,
  evidence_ids uuid[] not null default '{}',
  prompt_version text not null,
  created_at   timestamptz not null default now()
);

create table if not exists customer_opportunities (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references customer_pattern_reports (id) on delete cascade,
  ordinal        integer not null check (ordinal between 1 and 3),
  draft          jsonb not null,
  created_idea_id uuid references ideas (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint customer_opportunities_report_ordinal_uniq unique (report_id, ordinal)
);

create index if not exists idx_customer_cases_user_updated
  on customer_cases (user_id, updated_at desc) where archived_at is null;
create index if not exists idx_customer_materials_user_created
  on customer_materials (user_id, created_at desc);
create index if not exists idx_customer_materials_market
  on customer_materials (user_id, market);
create index if not exists idx_customer_case_materials_status
  on customer_case_materials (case_id, status, added_at desc);
create index if not exists idx_customer_evidence_material
  on customer_evidence_atoms (material_id, created_at desc);
create index if not exists idx_customer_topics_due
  on customer_research_topics (enabled, next_run_at);
create index if not exists idx_customer_runs_case
  on customer_research_runs (case_id, created_at desc);
create index if not exists idx_customer_proxy_case
  on customer_proxy_versions (case_id, version_no desc);
create index if not exists idx_customer_pattern_reports_user
  on customer_pattern_reports (user_id, created_at desc);

alter table customer_cases enable row level security;
alter table customer_materials enable row level security;
alter table customer_case_materials enable row level security;
alter table customer_evidence_atoms enable row level security;
alter table customer_research_topics enable row level security;
alter table customer_research_runs enable row level security;
alter table customer_proxy_versions enable row level security;
alter table customer_proxy_sessions enable row level security;
alter table customer_conclusions enable row level security;
alter table customer_pattern_reports enable row level security;
alter table customer_opportunities enable row level security;

create or replace function promote_customer_opportunity(
  p_opportunity_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_row customer_opportunities%rowtype;
  report_owner uuid;
  new_idea_id uuid;
begin
  select * into opportunity_row
  from customer_opportunities
  where id = p_opportunity_id
  for update;

  if opportunity_row.id is null then
    raise exception '候选机会不存在';
  end if;

  select user_id into report_owner
  from customer_pattern_reports
  where id = opportunity_row.report_id;
  if report_owner is distinct from p_user_id then
    raise exception '无权使用该候选机会';
  end if;

  if opportunity_row.created_idea_id is not null then
    return opportunity_row.created_idea_id;
  end if;

  insert into ideas (user_id, title, status, tags, hypothesis)
  values (
    p_user_id,
    opportunity_row.draft->>'direction',
    '观察',
    array['顾客研究'],
    jsonb_build_object(
      'pain', opportunity_row.draft->>'customer_progress',
      'alternative', opportunity_row.draft->>'current_alternative',
      'solution', opportunity_row.draft->>'direction',
      'riskiest_assumption', opportunity_row.draft->>'fatal_assumption'
    )
  )
  returning id into new_idea_id;

  update customer_opportunities
  set created_idea_id = new_idea_id
  where id = p_opportunity_id;

  return new_idea_id;
end;
$$;

revoke all on function promote_customer_opportunity(uuid, uuid) from public;
revoke all on function promote_customer_opportunity(uuid, uuid) from anon;
revoke all on function promote_customer_opportunity(uuid, uuid) from authenticated;
grant execute on function promote_customer_opportunity(uuid, uuid) to service_role;
