-- 触达规划画布：用户主动思考四维框架，AI 扮演挑战者

create table if not exists outreach_canvases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  use_case      text not null check (use_case in (
                  'startup', 'job', 'product', 'self', 'persuasion', 'other')),
  scenario      text not null default '',
  source_id     uuid,
  source_type   text check (source_type in ('idea', 'company')),
  person_notes  text not null default '',
  place_notes   text not null default '',
  time_notes    text not null default '',
  message_draft text not null default '',
  ai_challenges jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_outreach_canvases_user
  on outreach_canvases (user_id, updated_at desc);

alter table outreach_canvases enable row level security;

create policy "canvas_owner" on outreach_canvases
  for all using (auth.uid() = user_id);
