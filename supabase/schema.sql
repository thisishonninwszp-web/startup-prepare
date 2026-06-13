-- ============================================================================
-- IdeaOS 数据库 Schema
-- 在 Supabase 后台 → SQL Editor 里整段执行一次即可。可重复执行（幂等）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 枚举类型
-- ---------------------------------------------------------------------------

-- 想法状态：只有 5 个（CLAUDE.md 第 6 条，绝不加模糊中间态）
do $$ begin
  create type idea_status as enum ('观察', '假设', '验证中', 'MVP候选', '归档');
exception when duplicate_object then null; end $$;

-- 二元信号：has_pain / will_pay（CLAUDE.md 第 4 条，只有三态，不做多级分类）
do $$ begin
  create type signal_value as enum ('yes', 'no', 'unsure');
exception when duplicate_object then null; end $$;

-- AI 角色：第 2 阶段的追问者 + 第 4 阶段的 4 个质疑角色
do $$ begin
  create type ai_role as enum (
    'inquirer',     -- 追问者（把观察逼成假设）
    'investor',     -- 挑剔投资人
    'customer',     -- 目标客户
    'operator',     -- 冷酷运营者
    'competitor'    -- 竞品老板
  );
exception when duplicate_object then null; end $$;

-- 决策结论
do $$ begin
  create type decision_verdict as enum ('Go', 'Pivot', 'Kill', 'Hold');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 表
-- ---------------------------------------------------------------------------

-- 观察：最高频入口，捕捉原始素材
create table if not exists observations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  raw_text    text not null,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- 想法：从观察提升而来，承载假设与状态流转
create table if not exists ideas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  title             text,
  hypothesis        jsonb not null default '{}'::jsonb,
  status            idea_status not null default '观察',
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now()
);

-- 验证记录：每一次真实接触，只记两个二元信号 + 备注
create table if not exists validations (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references ideas (id) on delete cascade,
  has_pain      signal_value not null,
  will_pay      signal_value not null,
  note          text,
  contacted_at  timestamptz not null default now()
);

-- AI 对话会话：按角色保存对抗性追问的消息记录。
-- 捕捉阶段的 inquirer 追问挂在 observation 上；想法阶段的多角色质疑挂在 idea 上。
-- 二者必有其一（且只有其一）——见下方 check 约束。
create table if not exists ai_sessions (
  id              uuid primary key default gen_random_uuid(),
  idea_id         uuid references ideas (id) on delete cascade,
  observation_id  uuid references observations (id) on delete cascade,
  role            ai_role not null,
  messages        jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  constraint ai_sessions_parent_check
    check (num_nonnulls(idea_id, observation_id) = 1)
);

-- 决策：Go / Pivot / Kill / Hold，Kill 时记录"学到了什么"
create table if not exists decisions (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas (id) on delete cascade,
  verdict     decision_verdict not null,
  reason      text,
  learned     text,
  decided_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 索引（服务于常用查询与第 5 阶段的强制出口机制）
-- ---------------------------------------------------------------------------
create index if not exists idx_observations_user_created
  on observations (user_id, created_at desc);
create index if not exists idx_ideas_user_status
  on ideas (user_id, status);
create index if not exists idx_ideas_tags
  on ideas using gin (tags);
create index if not exists idx_ideas_last_activity
  on ideas (last_activity_at);
create index if not exists idx_validations_idea
  on validations (idea_id, contacted_at desc);
create index if not exists idx_ai_sessions_idea
  on ai_sessions (idea_id, created_at desc);
create index if not exists idx_ai_sessions_observation
  on ai_sessions (observation_id, created_at desc);
create index if not exists idx_decisions_idea
  on decisions (idea_id, decided_at desc);

-- ---------------------------------------------------------------------------
-- 行级安全（RLS）
-- 单用户阶段：开启 RLS（默认拒绝一切），由服务端 service role key 旁路访问。
-- 这正是 CLAUDE.md "RLS 先用 service role key 跑通" 的含义——
-- anon key 只用于浏览器端 Auth，不直接读写这些业务表。
-- 后续多用户阶段再补 owner = auth.uid() 的策略。
-- ---------------------------------------------------------------------------
alter table observations enable row level security;
alter table ideas        enable row level security;
alter table validations  enable row level security;
alter table ai_sessions  enable row level security;
alter table decisions    enable row level security;
