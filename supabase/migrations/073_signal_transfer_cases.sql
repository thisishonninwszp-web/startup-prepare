-- ============================================================================
-- 迁移 073：时差图谱
-- signal_transfer_cases：一样东西在中国 / 美国先有，什么时候到了日本（或没到）、结果怎样、谁带进来的。
--   时光机经营的前提是同一类东西有一个大致的时间差；攒起来，回答"两年内日本会不会出现"时就有同类的基准，
--   不用全凭感觉。每一件都上网查过：那边什么时候有、日本什么时候有（或明确写着没有）、在日本的结果，
--   三样都要有逐字对得上的原文（sources），缺一样就不收。时间差（lag_months）由代码按两边的日子算。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_transfer_cases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  thing         text not null,
  category      text not null check (category in ('payment', 'mobility', 'commerce', 'food', 'content', 'work', 'hardware', 'other')),
  origin        text not null check (origin in ('china', 'us')),
  origin_event  text not null,
  origin_date   text not null,
  japan_event   text,
  japan_date    text,
  outcome       text not null check (outcome in ('widespread', 'partial', 'niche', 'exited', 'blocked', 'absent')),
  carrier       text not null check (carrier in ('local', 'us', 'china', 'other', 'none')),
  lag_months    integer,
  sources       jsonb not null,
  found_via     text not null check (found_via in ('seed', 'research', 'recheck')),
  created_at    timestamptz not null default now(),
  constraint signal_transfer_cases_uniq unique (user_id, thing)
);

alter table signal_transfer_cases enable row level security;

drop policy if exists "signal_transfer_cases_owner" on signal_transfer_cases;
create policy "signal_transfer_cases_owner" on signal_transfer_cases
  for all using (auth.uid() = user_id);
