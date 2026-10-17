-- ============================================================================
-- 迁移 083：差距的「一条讲透」
-- signal_gap_deep：差距清单里一条，攒在一页上的几样新东西 ——
--   there：「那边查一查」查到的事实（谁在做、做到多大、怎么收钱、哪年开始），每条附原文，代码核对过；
--   category：他点的这条属于时差图谱哪一类（看同类先例用）；
--   stance：他点的判断三下和补的那句（到周刊页还在；押进判断账本仍是第一次记"发了"的时候）。
-- 不打分、不下"值得做"的结论。幂等，可重复执行。
-- ============================================================================

create table if not exists signal_gap_deep (
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  there       jsonb,
  category    text,
  stance      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, signal_id, side)
);

alter table signal_gap_deep enable row level security;

drop policy if exists "signal_gap_deep_owner" on signal_gap_deep;
create policy "signal_gap_deep_owner" on signal_gap_deep
  for all using (auth.uid() = user_id);
