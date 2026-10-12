-- ============================================================================
-- 迁移 062：判断错在哪一步、每节有没有用、周报
-- signal_judgments.miss_reason：看错时选的原因（info 信息不够 / reasoning 推理断了 /
--   timing 时间估错 / emotion 被情绪带了 / luck 纯属意外），只数次数，看自己总栽在哪类上。
-- signal_feedback：每天每一节"有用 / 没用"，攒两周看哪节该砍、该改。
-- signal_briefs.kind 加 weekly：每周一份，把一周的总览串起来。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_judgments add column if not exists miss_reason text
  check (miss_reason in ('info', 'reasoning', 'timing', 'emotion', 'luck'));

create table if not exists signal_feedback (
  user_id     uuid not null references auth.users (id) on delete cascade,
  brief_date  date not null,
  kind        text not null,
  useful      boolean not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, brief_date, kind)
);

alter table signal_feedback enable row level security;

drop policy if exists "signal_feedback_owner" on signal_feedback;
create policy "signal_feedback_owner" on signal_feedback
  for all using (auth.uid() = user_id);

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money', 'digest', 'weekly'));
exception when duplicate_object then null; end $$;
