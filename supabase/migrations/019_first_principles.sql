create table first_principles_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references ideas(id) on delete cascade,
  original_claim text not null,
  context_note text not null default '',
  restated_belief text not null default '',
  bedrock_summary text not null default '',
  weakest_links jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table first_principles_nodes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references first_principles_sessions(id) on delete cascade,
  claim text not null,
  basis_type text not null check (basis_type in (
    'bedrock','data_backed','personal_experience',
    'industry_consensus','media_narrative','pure_assumption'
  )),
  basis_note text not null,
  challenge text not null,
  depth int not null check (depth between 1 and 3),
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table first_principles_sessions enable row level security;
alter table first_principles_nodes enable row level security;

create policy "fp_session_owner" on first_principles_sessions
  for all using (auth.uid() = user_id);

create policy "fp_node_owner" on first_principles_nodes
  for all using (
    session_id in (
      select id from first_principles_sessions where user_id = auth.uid()
    )
  );
