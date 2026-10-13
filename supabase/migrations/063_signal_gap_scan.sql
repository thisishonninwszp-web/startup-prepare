-- ============================================================================
-- 迁移 063：差距清单主动扫 + 每月重查
-- signal_briefs.kind 加 gaps：每天专门扫一轮中文媒体、美国媒体、中国 App 榜，
--   只挑讲产品、服务、生意做法的，问"日本有没有"并上网核实。以前只有被挑进报告精选的那几条才会问。
--   和报告存在同一张表里，差距清单照旧从存下的报告里挑。
-- signal_gap_rechecks：进清单满一个月的再查一次"日本现在有没有"，
--   查到"有了"就从清单里挪出来单列 —— 要么说明当初看对了，要么说明有人先走了一步。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money', 'digest', 'weekly', 'gaps'));
exception when duplicate_object then null; end $$;

create table if not exists signal_gap_rechecks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  signal_id     uuid not null,
  side          text not null check (side in ('japan', 'us', 'china')),
  checked_on    date not null,
  verdict       text not null check (verdict in ('still', 'arrived', 'unclear')),
  japan         text not null,
  source_check  jsonb,
  funded        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists signal_gap_rechecks_user_idx
  on signal_gap_rechecks (user_id, checked_on desc);

alter table signal_gap_rechecks enable row level security;

drop policy if exists "signal_gap_rechecks_owner" on signal_gap_rechecks;
create policy "signal_gap_rechecks_owner" on signal_gap_rechecks
  for all using (auth.uid() = user_id);
