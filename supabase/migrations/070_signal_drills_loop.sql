-- ============================================================================
-- 迁移 070：历史题接回今天、对理由有裁判、猜错问错在哪、记出题通过率
-- topic_signal_id / topic_question_id：这道题像的是哪条新闻 / 哪个在追的问题；
-- today_question：揭晓后"今天那件事会不会也这样"的那个问题，押下去就是一条真实判断，进判断账本。
-- reason_judge：他标完"理由对上没有"之后，裁判（Jev）独立判的结果。只提名、不改他标的，摆出来对照。
-- miss_reason：猜错时选的"错在哪一步"，和判断账本同一套五类，合在一起数。
-- signal_drill_batches：每批出了几道、搜到资料几道、通过几道 —— 通过的一直很少，就是过滤太严。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_drills add column if not exists topic_signal_id uuid;
alter table signal_drills add column if not exists topic_question_id uuid;
alter table signal_drills add column if not exists today_question text;
alter table signal_drills add column if not exists reason_judge boolean;
alter table signal_drills add column if not exists miss_reason text
  check (miss_reason in ('info', 'reasoning', 'timing', 'emotion', 'luck'));

create table if not exists signal_drill_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  drafted     integer not null,
  searched    integer not null,
  passed      integer not null,
  created_at  timestamptz not null default now()
);

create index if not exists signal_drill_batches_user_idx on signal_drill_batches (user_id, created_at desc);

alter table signal_drill_batches enable row level security;

drop policy if exists "signal_drill_batches_owner" on signal_drill_batches;
create policy "signal_drill_batches_owner" on signal_drill_batches
  for all using (auth.uid() = user_id);
