create table outside_view_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references ideas(id) on delete cascade,
  plan_text text not null,
  context_note text not null default '',
  reference_class_label text not null default '',
  dominant_pattern text not null default '',
  dominant_cause text not null default '',
  prevalence_bucket text not null default 'many'
    check (prevalence_bucket in ('most','many','some','few')),
  user_distinctions text not null default '',
  pushback_note text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outside_view_examples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references outside_view_sessions(id) on delete cascade,
  label text not null,
  outcome_note text not null,
  is_well_known boolean not null default true,
  ordinal int not null default 0,
  created_at timestamptz not null default now()
);

create table outside_view_checks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references outside_view_sessions(id) on delete cascade,
  check_text text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table outside_view_sessions enable row level security;
alter table outside_view_examples enable row level security;
alter table outside_view_checks enable row level security;

create policy "ov_session_owner" on outside_view_sessions
  for all using (auth.uid() = user_id);

create policy "ov_example_owner" on outside_view_examples
  for all using (
    session_id in (
      select id from outside_view_sessions where user_id = auth.uid()
    )
  );

create policy "ov_check_owner" on outside_view_checks
  for all using (
    session_id in (
      select id from outside_view_sessions where user_id = auth.uid()
    )
  );
