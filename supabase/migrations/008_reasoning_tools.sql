-- 推理工具：贝叶斯信念追踪 + 费米估算 + 认知重构

-- ── 贝叶斯信念追踪 ────────────────────────────────────────────────────────────

create table if not exists bayesian_beliefs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  idea_id         uuid references ideas (id) on delete set null,
  question        text not null,
  prior           numeric(5,4) not null check (prior >= 0 and prior <= 1),
  prior_rationale text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create table if not exists bayesian_updates (
  id                   uuid primary key default gen_random_uuid(),
  belief_id            uuid not null references bayesian_beliefs (id) on delete cascade,
  evidence_text        text not null,
  evidence_type        text not null default 'observation',
  likelihood_if_true   numeric(5,4) not null
    check (likelihood_if_true > 0 and likelihood_if_true <= 1),
  likelihood_if_false  numeric(5,4) not null
    check (likelihood_if_false > 0 and likelihood_if_false <= 1),
  posterior            numeric(5,4) not null check (posterior >= 0 and posterior <= 1),
  prior_at_time        numeric(5,4) not null check (prior_at_time >= 0 and prior_at_time <= 1),
  ai_explanation       text not null default '',
  recorded_at          timestamptz not null default now()
);

create index if not exists idx_bayesian_beliefs_user
  on bayesian_beliefs (user_id, updated_at desc)
  where archived_at is null;

create index if not exists idx_bayesian_beliefs_idea
  on bayesian_beliefs (idea_id, updated_at desc);

create index if not exists idx_bayesian_updates_belief
  on bayesian_updates (belief_id, recorded_at asc);

alter table bayesian_beliefs enable row level security;
alter table bayesian_updates enable row level security;

-- ── 费米估算 ──────────────────────────────────────────────────────────────────

create table if not exists fermi_estimates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  idea_id     uuid references ideas (id) on delete set null,
  question    text not null,
  category    text not null default 'market',
  final_low   numeric,
  final_high  numeric,
  unit        text not null default '',
  ai_teaching text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists fermi_components (
  id          uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references fermi_estimates (id) on delete cascade,
  ordinal     integer not null check (ordinal >= 1),
  label       text not null,
  rationale   text not null default '',
  low         numeric not null,
  high        numeric not null,
  user_note   text not null default '',
  sensitivity text not null default '',
  constraint fermi_components_estimate_ordinal_uniq unique (estimate_id, ordinal)
);

create index if not exists idx_fermi_estimates_user
  on fermi_estimates (user_id, updated_at desc)
  where archived_at is null;

create index if not exists idx_fermi_estimates_idea
  on fermi_estimates (idea_id, updated_at desc);

create index if not exists idx_fermi_components_estimate
  on fermi_components (estimate_id, ordinal asc);

alter table fermi_estimates enable row level security;
alter table fermi_components enable row level security;

-- ── 认知重构 ──────────────────────────────────────────────────────────────────

create table if not exists reframing_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  idea_id      uuid references ideas (id) on delete set null,
  topic_text   text not null,
  context_note text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists reframing_frames (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references reframing_sessions (id) on delete cascade,
  frame_type  text not null,
  title       text not null,
  description text not null,
  is_marked   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_reframing_sessions_user
  on reframing_sessions (user_id, created_at desc);

create index if not exists idx_reframing_sessions_idea
  on reframing_sessions (idea_id, created_at desc);

create index if not exists idx_reframing_frames_session
  on reframing_frames (session_id, created_at asc);

alter table reframing_sessions enable row level security;
alter table reframing_frames enable row level security;
