-- ============================================================================
-- 迁移 086：慢变量 · 知道这个之后呢（and then?）
-- signal_slow_thens：每个慢变量一周推一次 —— 拿代码算好的数字和走势，写两三条"如果这个势头继续"的链
--   （每条：对做生意意味着什么、去哪看是不是真的在走、什么情况下会断），
--   再标出这一周报告里哪几条新闻是它的表面、他的差距清单里哪几条靠它撑着（标题由代码核对）。
--   点了才推；同一周再点就是重新推。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_slow_thens (
  user_id     uuid not null references auth.users (id) on delete cascade,
  week_start  date not null,
  key         text not null,
  analysis    jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, week_start, key)
);

alter table signal_slow_thens enable row level security;

drop policy if exists "signal_slow_thens_owner" on signal_slow_thens;
create policy "signal_slow_thens_owner" on signal_slow_thens
  for all using (auth.uid() = user_id);
