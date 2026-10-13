-- ============================================================================
-- 迁移 066：历史题
-- signal_drills：过去真实发生过、结果早已揭晓的事，把他放回当时，只给当时知道的信息，猜"会不会"，答完马上揭晓。
--   真实的判断要等几个月才对账，反馈太慢；历史题当场就有反馈。
--   答案上网核实过、原文由代码逐字核对（basis），没核实到出处的题不出。对错由代码比，不用自己判。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_drills (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  topic          text,
  setup          text not null,
  question       text not null,
  deadline       date not null,
  answer         boolean not null,
  what_happened  text not null,
  why_similar    text,
  source_check   jsonb not null,
  guess          boolean,
  confidence     integer,
  reasoning      text,
  answered_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists signal_drills_user_idx on signal_drills (user_id, created_at desc);

alter table signal_drills enable row level security;

drop policy if exists "signal_drills_owner" on signal_drills;
create policy "signal_drills_owner" on signal_drills
  for all using (auth.uid() = user_id);
