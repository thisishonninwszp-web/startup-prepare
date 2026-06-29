-- Preserve immutable reality-version provenance for reasoning tools.

create table if not exists reasoning_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reality_version_id uuid not null references reality_versions (id) on delete cascade,
  bayesian_belief_id uuid references bayesian_beliefs (id) on delete cascade,
  fermi_estimate_id uuid references fermi_estimates (id) on delete cascade,
  reframing_session_id uuid references reframing_sessions (id) on delete cascade,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint reasoning_sources_one_target check (
    num_nonnulls(bayesian_belief_id, fermi_estimate_id, reframing_session_id) = 1
  )
);

create unique index if not exists reasoning_sources_bayesian_uniq
  on reasoning_sources (bayesian_belief_id)
  where bayesian_belief_id is not null;
create unique index if not exists reasoning_sources_fermi_uniq
  on reasoning_sources (fermi_estimate_id)
  where fermi_estimate_id is not null;
create unique index if not exists reasoning_sources_reframing_uniq
  on reasoning_sources (reframing_session_id)
  where reframing_session_id is not null;
create index if not exists reasoning_sources_reality_version_idx
  on reasoning_sources (reality_version_id);

alter table reasoning_sources enable row level security;
