-- ============================================================================
-- 迁移 001：让 ai_sessions 支持挂在 observation 上（捕捉阶段的 inquirer 追问）
-- 背景：捕捉阶段只有 observation 还没有 idea，原表 idea_id NOT NULL 无法承载。
-- 在 Supabase SQL Editor 整段执行一次即可。幂等，可重复执行。
-- ============================================================================

-- 1) idea_id 改为可空
alter table ai_sessions alter column idea_id drop not null;

-- 2) 增加 observation_id 外键
alter table ai_sessions
  add column if not exists observation_id uuid references observations (id) on delete cascade;

-- 3) 约束：idea_id / observation_id 必有其一且只有其一
do $$ begin
  alter table ai_sessions
    add constraint ai_sessions_parent_check
    check (num_nonnulls(idea_id, observation_id) = 1);
exception when duplicate_object then null; end $$;

-- 4) observation 维度的查询索引
create index if not exists idx_ai_sessions_observation
  on ai_sessions (observation_id, created_at desc);
