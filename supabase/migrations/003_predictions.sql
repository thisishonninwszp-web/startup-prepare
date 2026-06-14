-- ============================================================================
-- 迁移 003：预测与对账（校准回路）
-- 让使用者进验证前写下带日期的可证伪预测，到期用现实对账——对抗事后偏见/过度自信。
-- 在 Supabase SQL Editor 整段执行一次即可。幂等，可重复执行。
-- ============================================================================

do $$ begin
  create type prediction_outcome as enum ('pending', 'hit', 'miss');
exception when duplicate_object then null; end $$;

create table if not exists predictions (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas (id) on delete cascade,
  text        text not null,
  due_at      timestamptz not null,
  made_at     timestamptz not null default now(),
  outcome     prediction_outcome not null default 'pending',
  resolved_at timestamptz,
  note        text
);

create index if not exists idx_predictions_idea on predictions (idea_id, made_at desc);
create index if not exists idx_predictions_due on predictions (outcome, due_at);

alter table predictions enable row level security;
