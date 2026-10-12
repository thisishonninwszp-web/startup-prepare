-- ============================================================================
-- 迁移 059：外部信号的"问题驱动" + 判断账本加标签
-- signal_questions：他自己要一直追的问题（"中国哪些做法会在五年内来日本"）。
--   research：AI 最近一轮查到的东西 { subQuestions, keyFactors, history, basedOnView }，
--   每次重查整体覆盖；证据的来源和原文摘录由代码核对过。不打分（原则 1）。
-- signal_question_views：他对这个问题的看法，一次一行，只增不改 ——
--   看法怎么一步步变过来的，本身就是要留下的东西。
-- signal_judgments.tags：账本标签（自由填写），按标签数次数，不算比率。
-- signal_judgments.question_id：从问题页押进账本的判断（这种没有对应的新闻，signal_id 为空）。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_questions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  question      text not null,
  criterion     text not null default '',      -- 怎么才算（"东京的普通人一年里至少用过一次"）
  research      jsonb,
  researched_at timestamptz,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create index if not exists idx_signal_questions_user
  on signal_questions (user_id, created_at desc);

alter table signal_questions enable row level security;

drop policy if exists "signal_questions_owner" on signal_questions;
create policy "signal_questions_owner" on signal_questions
  for all using (auth.uid() = user_id);

create table if not exists signal_question_views (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references signal_questions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  view        text not null,
  reason      text not null default '',        -- 为什么这么看 / 为什么改
  created_at  timestamptz not null default now()
);

create index if not exists idx_signal_question_views_question
  on signal_question_views (question_id, created_at desc);

alter table signal_question_views enable row level security;

drop policy if exists "signal_question_views_owner" on signal_question_views;
create policy "signal_question_views_owner" on signal_question_views
  for all using (auth.uid() = user_id);

alter table signal_judgments add column if not exists tags text[] not null default '{}';
alter table signal_judgments add column if not exists question_id uuid references signal_questions (id) on delete set null;

create index if not exists idx_signal_judgments_question
  on signal_judgments (question_id);
