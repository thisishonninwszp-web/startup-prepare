-- 阅读终点由用户主动决定；展开不等于读完。快照用于识别结束后报告新增的条目。
create table if not exists public.signal_reading_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null,
  signal_ids uuid[] not null check (cardinality(signal_ids) between 1 and 200),
  stopped_at timestamptz not null default now(),
  primary key (user_id, report_date)
);
alter table public.signal_reading_sessions enable row level security;
drop policy if exists "signal_reading_sessions_owner" on public.signal_reading_sessions;
create policy "signal_reading_sessions_owner" on public.signal_reading_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
