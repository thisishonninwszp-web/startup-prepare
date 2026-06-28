-- Idea 价值设计图：来源选择、Central Question、不可覆盖概念版本与派生层。

do $$ begin
  create type concept_status as enum ('provisional', 'confirmed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type concept_story_type as enum ('insight', 'vision', 'integrated');
exception when duplicate_object then null; end $$;

alter table reframing_sessions
  add column if not exists central_question_candidates jsonb,
  add column if not exists selected_question_type text,
  add column if not exists selected_question text,
  add column if not exists selected_question_at timestamptz;

create table if not exists idea_company_facts (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  fact        text not null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists concept_workspaces (
  id                        uuid primary key default gen_random_uuid(),
  idea_id                   uuid not null unique references ideas (id) on delete cascade,
  user_id                   uuid not null references auth.users (id) on delete cascade,
  customer_proxy_version_id uuid references customer_proxy_versions (id) on delete set null,
  dream_version_id          uuid references dream_versions (id) on delete set null,
  reframing_session_id      uuid references reframing_sessions (id) on delete set null,
  fermi_estimate_id         uuid references fermi_estimates (id) on delete set null,
  bayesian_belief_id        uuid references bayesian_beliefs (id) on delete set null,
  question_candidates       jsonb,
  central_question_type     text,
  central_question          text,
  story_type                concept_story_type not null default 'insight',
  draft                     jsonb,
  draft_sources             jsonb not null default '[]'::jsonb,
  updated_at                timestamptz not null default now(),
  created_at                timestamptz not null default now()
);

create table if not exists concept_versions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references concept_workspaces (id) on delete cascade,
  idea_id             uuid not null references ideas (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  previous_version_id uuid references concept_versions (id) on delete set null,
  version_no          integer not null check (version_no > 0),
  status              concept_status not null,
  story_type          concept_story_type not null,
  central_question    jsonb not null,
  insight_story       jsonb,
  vision_story        jsonb,
  benefit_chain       jsonb not null,
  candidates          jsonb not null,
  selected_concept    jsonb not null,
  evidence_gaps       jsonb not null default '[]'::jsonb,
  personal_resonance  boolean,
  delta               jsonb,
  prompt_version      text not null,
  created_at          timestamptz not null default now(),
  confirmed_at        timestamptz,
  constraint concept_versions_workspace_version_uniq
    unique (workspace_id, version_no)
);

create table if not exists concept_version_sources (
  id                 uuid primary key default gen_random_uuid(),
  concept_version_id uuid not null references concept_versions (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  source_type        text not null,
  source_id          uuid not null,
  snapshot           jsonb not null,
  created_at         timestamptz not null default now(),
  constraint concept_version_sources_uniq
    unique (concept_version_id, source_type, source_id)
);

create table if not exists concept_comprehension_tests (
  id                 uuid primary key default gen_random_uuid(),
  concept_version_id uuid not null references concept_versions (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  repeated_words     text not null,
  captured_core      boolean not null,
  created_at         timestamptz not null default now()
);

create table if not exists concept_derivative_versions (
  id                 uuid primary key default gen_random_uuid(),
  concept_version_id uuid not null references concept_versions (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  version_no         integer not null check (version_no > 0),
  landing_page       jsonb not null,
  action_values      jsonb not null,
  prompt_version     text not null,
  created_at         timestamptz not null default now(),
  constraint concept_derivatives_version_uniq
    unique (concept_version_id, version_no)
);

create index if not exists idx_company_facts_idea
  on idea_company_facts (idea_id, created_at) where archived_at is null;
create index if not exists idx_concept_workspaces_user
  on concept_workspaces (user_id, updated_at desc);
create index if not exists idx_concept_versions_idea
  on concept_versions (idea_id, version_no desc);
create index if not exists idx_concept_sources_version
  on concept_version_sources (concept_version_id, source_type);
create index if not exists idx_concept_comprehension_version
  on concept_comprehension_tests (concept_version_id, created_at desc);
create index if not exists idx_concept_derivatives_concept
  on concept_derivative_versions (concept_version_id, version_no desc);

alter table idea_company_facts enable row level security;
alter table concept_workspaces enable row level security;
alter table concept_versions enable row level security;
alter table concept_version_sources enable row level security;
alter table concept_comprehension_tests enable row level security;
alter table concept_derivative_versions enable row level security;

create or replace function create_concept_version(
  p_workspace_id uuid,
  p_user_id uuid,
  p_payload jsonb,
  p_sources jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row concept_workspaces%rowtype;
  previous_row concept_versions%rowtype;
  new_version_id uuid;
  source jsonb;
begin
  select * into workspace_row
  from concept_workspaces
  where id = p_workspace_id
  for update;
  if workspace_row.id is null or workspace_row.user_id is distinct from p_user_id then
    raise exception '无权创建该产品概念版本';
  end if;
  select * into previous_row
  from concept_versions
  where workspace_id = p_workspace_id
  order by version_no desc
  limit 1;
  insert into concept_versions (
    workspace_id, idea_id, user_id, previous_version_id, version_no,
    status, story_type, central_question, insight_story, vision_story,
    benefit_chain, candidates, selected_concept, evidence_gaps,
    personal_resonance, delta, prompt_version
  ) values (
    p_workspace_id,
    workspace_row.idea_id,
    p_user_id,
    previous_row.id,
    coalesce(previous_row.version_no, 0) + 1,
    'provisional',
    (p_payload->>'story_type')::concept_story_type,
    p_payload->'central_question',
    p_payload->'insight_story',
    p_payload->'vision_story',
    p_payload->'benefit_chain',
    p_payload->'candidates',
    p_payload->'selected_concept',
    p_payload->'evidence_gaps',
    (p_payload->>'personal_resonance')::boolean,
    p_payload->'delta',
    p_payload->>'prompt_version'
  ) returning id into new_version_id;
  for source in select * from jsonb_array_elements(p_sources)
  loop
    insert into concept_version_sources (
      concept_version_id, user_id, source_type, source_id, snapshot
    ) values (
      new_version_id,
      p_user_id,
      source->>'source_type',
      (source->>'source_id')::uuid,
      source->'snapshot'
    );
  end loop;
  return new_version_id;
end;
$$;

create or replace function confirm_concept_version(
  p_concept_version_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  version_row concept_versions%rowtype;
  material_count integer;
  conclusion_count integer;
  company_fact_count integer;
begin
  select * into version_row
  from concept_versions
  where id = p_concept_version_id
  for update;

  if version_row.id is null or version_row.user_id is distinct from p_user_id then
    raise exception '无权确认该产品概念';
  end if;
  if version_row.status = 'confirmed' then
    return version_row.id;
  end if;
  if coalesce(trim(version_row.central_question->>'question'), '') = '' then
    raise exception '缺少Central Question';
  end if;

  select count(distinct source_id) into material_count
  from concept_version_sources
  where concept_version_id = p_concept_version_id
    and user_id = p_user_id
    and source_type = 'customer_material';

  select count(*) into conclusion_count
  from concept_version_sources
  where concept_version_id = p_concept_version_id
    and user_id = p_user_id
    and source_type = 'customer_conclusion';

  select count(distinct source_id) into company_fact_count
  from concept_version_sources
  where concept_version_id = p_concept_version_id
    and user_id = p_user_id
    and source_type = 'company_fact';

  if material_count < 3 then
    raise exception '至少需要3份独立顾客材料';
  end if;
  if conclusion_count < 1 then
    raise exception '至少需要一份顾客研究结论';
  end if;
  if company_fact_count < 1 then
    raise exception '至少需要一条公司事实';
  end if;

  update concept_versions
  set status = 'confirmed', confirmed_at = now()
  where id = p_concept_version_id;

  return p_concept_version_id;
end;
$$;

revoke all on function confirm_concept_version(uuid, uuid) from public;
revoke all on function confirm_concept_version(uuid, uuid) from anon;
revoke all on function confirm_concept_version(uuid, uuid) from authenticated;
grant execute on function confirm_concept_version(uuid, uuid) to service_role;
revoke all on function create_concept_version(uuid, uuid, jsonb, jsonb) from public;
revoke all on function create_concept_version(uuid, uuid, jsonb, jsonb) from anon;
revoke all on function create_concept_version(uuid, uuid, jsonb, jsonb) from authenticated;
grant execute on function create_concept_version(uuid, uuid, jsonb, jsonb) to service_role;
