-- Explicit reading choices belong to the viewer, including when the report is shared.
create table if not exists signal_reading_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 250),
  signal_id uuid not null references external_signals(id) on delete cascade,
  event_label text check (char_length(event_label) <= 200),
  preference text not null check (preference in ('follow', 'mute')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_key)
);
create index if not exists signal_reading_preferences_user_idx
  on signal_reading_preferences(user_id, updated_at desc);
alter table signal_reading_preferences enable row level security;
drop policy if exists "signal_reading_preferences_owner" on signal_reading_preferences;
create policy "signal_reading_preferences_owner" on signal_reading_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
