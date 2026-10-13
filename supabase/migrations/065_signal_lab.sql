-- ============================================================================
-- 迁移 065：挑法盲测
-- signal_lab_runs：同一批候选，用几种挑法各挑一遍（现在的、开思考、两轮读正文、更强的模型），
--   隐去是哪种给他看，他挑最想读的那一组，挑完揭晓。攒几次看哪种总被选中，再把每天的报告换成它。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_lab_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null,
  variants     jsonb not null,
  display      text[] not null,
  chosen       text,
  chosen_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists signal_lab_runs_user_idx on signal_lab_runs (user_id, created_at desc);

alter table signal_lab_runs enable row level security;

drop policy if exists "signal_lab_runs_owner" on signal_lab_runs;
create policy "signal_lab_runs_owner" on signal_lab_runs
  for all using (auth.uid() = user_id);
