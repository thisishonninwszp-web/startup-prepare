-- Decision Workbench: object registry, object links, framework use history, and result learning.
-- The app reads existing module tables dynamically, so these tables are additive.

create table if not exists public.decision_objects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  object_type        text not null check (
    object_type in (
      'reality_case',
      'idea',
      'customer_case',
      'dream_case',
      'dream_branch',
      'retro_period',
      'company_profile',
      'reasoning_session',
      'decision_closure'
    )
  ),
  object_id          uuid not null,
  title              text not null,
  primary_module     text not null,
  status             text not null default 'active' check (status in ('active', 'closed', 'archived')),
  current_closure_id uuid references public.decision_closures (id) on delete set null,
  last_activity_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (user_id, object_type, object_id)
);

create table if not exists public.decision_object_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  from_object_type   text not null,
  from_object_id     uuid not null,
  to_object_type     text not null,
  to_object_id       uuid not null,
  link_type          text not null default 'related',
  created_at         timestamptz not null default now(),
  unique (user_id, from_object_type, from_object_id, to_object_type, to_object_id, link_type)
);

create table if not exists public.decision_object_framework_uses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  object_type        text not null,
  object_id          uuid not null,
  framework_id       text not null,
  source_href        text,
  output_href        text,
  created_at         timestamptz not null default now()
);

create table if not exists public.decision_object_learnings (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null,
  object_type          text not null,
  object_id            uuid not null,
  closure_id           uuid references public.decision_closures (id) on delete set null,
  original_judgment    text not null,
  actual_result        text not null,
  gap_reason           text not null check (
    gap_reason in ('judgment', 'execution', 'environment_change', 'luck', 'unknown')
  ),
  updated_rule         text,
  created_at           timestamptz not null default now()
);

create index if not exists decision_objects_user_status_activity
  on public.decision_objects (user_id, status, last_activity_at desc);

create index if not exists decision_object_links_from_idx
  on public.decision_object_links (user_id, from_object_type, from_object_id);

create index if not exists decision_object_framework_uses_object_idx
  on public.decision_object_framework_uses (user_id, object_type, object_id, created_at desc);

create index if not exists decision_object_learnings_object_idx
  on public.decision_object_learnings (user_id, object_type, object_id, created_at desc);

alter table public.decision_objects enable row level security;
alter table public.decision_object_links enable row level security;
alter table public.decision_object_framework_uses enable row level security;
alter table public.decision_object_learnings enable row level security;

revoke all on table public.decision_objects from anon, authenticated;
revoke all on table public.decision_object_links from anon, authenticated;
revoke all on table public.decision_object_framework_uses from anon, authenticated;
revoke all on table public.decision_object_learnings from anon, authenticated;
