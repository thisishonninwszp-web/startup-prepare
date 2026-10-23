-- 098：回想、一起练、存储读数（经用户同意，2026-10-23）
--
-- 1. recall_reviews：他标过、记成观察、写过判断的新闻，按间隔重复来「考」他 —— 先想当时为什么在意、后来怎样了，再看答案，
--    按记得 / 模糊 / 忘了排下一次（记得的越隔越久，忘了的过一周再问）。存下来不等于记得住，主动回想才记得住。
-- 2. signal_prefs.share_scores：和一起用的人互相看预测分数（两边都打开才看得到，默认谁都只看得到自己的）。
-- 3. storage_report()：数据库实际多大、哪几张表最大（免费版上限 500MB），不再靠估算。只有服务端能调。

create table if not exists recall_reviews (
  user_id        uuid not null references auth.users (id) on delete cascade,
  signal_id      uuid not null references external_signals (id) on delete cascade,
  interval_days  integer not null default 7,
  due_on         date not null,
  reviews        integer not null default 0,
  last_result    text check (last_result in ('remembered', 'vague', 'forgot')),
  last_at        timestamptz,
  created_at     timestamptz not null default now(),
  primary key (user_id, signal_id)
);
create index if not exists recall_reviews_due_idx on recall_reviews (user_id, due_on);
alter table recall_reviews enable row level security;
drop policy if exists "recall_reviews_owner" on recall_reviews;
create policy "recall_reviews_owner" on recall_reviews for all using (auth.uid() = user_id);

create table if not exists signal_prefs (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  share_scores  boolean not null default false,
  updated_at    timestamptz not null default now()
);
alter table signal_prefs enable row level security;
drop policy if exists "signal_prefs_owner" on signal_prefs;
create policy "signal_prefs_owner" on signal_prefs for all using (auth.uid() = user_id);

create or replace function storage_report()
returns table (name text, bytes bigint)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select 'database'::text, pg_database_size(current_database())
  union all
  (select c.relname::text, pg_total_relation_size(c.oid)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by 2 desc
   limit 15);
$$;
revoke execute on function storage_report() from public, anon, authenticated;
grant execute on function storage_report() to service_role;
