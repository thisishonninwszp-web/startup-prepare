-- ============================================================================
-- 迁移 055：读新闻练判断 —— 先写自己的判断，再看 AI 的，到期对账
-- predictions 加第四种来源 'signal'：和想法、复盘、自我的预测同表同尺，能横向比校准。
-- signal_judgments：一次判断的上下文（读的是哪条新闻、回答的是什么问题、AI 怎么挑刺）。
--   新闻条目两周后会被清掉，所以标题和链接在这里另存一份；signal_id 只是顺手的关联。
-- signal_briefs.practice：每份新闻报告里 AI 挑出的"今天的练习题"。
-- 幂等，可重复执行。
-- ============================================================================

alter table predictions drop constraint if exists predictions_source_type_check;
alter table predictions drop constraint if exists predictions_source_ref_check;

do $$ begin
  alter table predictions add constraint predictions_source_type_check
    check (source_type in ('idea', 'retro', 'self', 'signal'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table predictions add constraint predictions_source_ref_check check (
    (source_type = 'idea'  and idea_id is not null and period_id is null)
    or (source_type = 'retro' and period_id is not null and idea_id is null)
    or (source_type in ('self', 'signal') and idea_id is null and period_id is null)
  );
exception when duplicate_object then null; end $$;

create table if not exists signal_judgments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  signal_id     uuid references external_signals (id) on delete set null,
  prediction_id uuid not null references predictions (id) on delete cascade,
  news_title    text not null,
  news_url      text,
  question      text not null,             -- 回答的是哪个问题（练习题，或详情页的通用问题）
  judgment      text not null,             -- 用户写下的判断（与 predictions.text 相同，冗余便于展示）
  feedback      jsonb,                     -- AI 的挑刺：{ missed, sharpen, counter }
  created_at    timestamptz not null default now()
);

create index if not exists idx_signal_judgments_user
  on signal_judgments (user_id, created_at desc);
create index if not exists idx_signal_judgments_signal
  on signal_judgments (signal_id);

alter table signal_judgments enable row level security;

drop policy if exists "signal_judgments_owner" on signal_judgments;
create policy "signal_judgments_owner" on signal_judgments
  for all using (auth.uid() = user_id);

alter table signal_briefs add column if not exists practice jsonb;   -- { signal_id, question, check_how }
