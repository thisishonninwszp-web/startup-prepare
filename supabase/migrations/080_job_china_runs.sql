-- ============================================================================
-- 迁移 080：面试演示「御社の商売、中国ではどうなっている？」的记录
-- 每一次分三步跑（搜索词 → 中国的公司 → 日本这边），每步做完存进来，下一步从这里读上一步的结果。
-- status：planned（写好搜索词）→ companies（找到公司）→ done；一家都没找到 none_found；
--   中途失败 failed（失败的是哪一步，按 plan / companies / japan 哪几列是空的来认）。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists job_china_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  business    text not null,
  status      text not null default 'planned'
    check (status in ('planned', 'companies', 'done', 'none_found', 'failed')),
  plan        jsonb,
  companies   jsonb,
  japan       jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_job_china_runs_user on job_china_runs (user_id, created_at desc);

alter table job_china_runs enable row level security;
drop policy if exists "job_china_runs_owner" on job_china_runs;
create policy "job_china_runs_owner" on job_china_runs
  for all using (auth.uid() = user_id);
