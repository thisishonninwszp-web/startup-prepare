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

-- 预测对账结论（校准回路）
do $$ begin
  create type prediction_outcome as enum ('pending', 'hit', 'miss');
exception when duplicate_object then null; end $$;

-- 外部信号 staging 状态：待审 / 已提升 / 已忽略（独立爬虫子项目的落地流转）
do $$ begin
  create type external_signal_status as enum ('pending', 'promoted', 'dismissed');
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

-- 外部信号 staging：独立爬虫写入，主应用审阅后提升为 observation。
-- 刻意独立于 observations，避免机器噪音污染痛点雷达（CLAUDE.md 第 3 条）。
create table if not exists external_signals (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  source_id    text not null,
  url          text,
  title        text,
  raw_text     text not null,
  query        text,
  status       external_signal_status not null default 'pending',
  promoted_observation_id uuid references observations (id) on delete set null,
  fetched_at   timestamptz not null default now(),
  constraint external_signals_uniq unique (source, source_id)
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

-- 预测：进验证前写下的带日期可证伪预测，到期对账（校准回路）
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
create index if not exists idx_predictions_idea
  on predictions (idea_id, made_at desc);
create index if not exists idx_predictions_due
  on predictions (outcome, due_at);
create index if not exists idx_external_signals_status
  on external_signals (status, fetched_at desc);

-- ---------------------------------------------------------------------------
-- 现状认识系统：课题、手动引用来源、不可覆盖的地图版本
-- ---------------------------------------------------------------------------
do $$ begin
  create type reality_mode as enum ('specific', 'global');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reality_context as enum ('personal', 'business', 'cross');
exception when duplicate_object then null; end $$;

create table if not exists reality_cases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  mode              reality_mode not null,
  context           reality_context not null,
  title             text not null,
  initial_statement text not null,
  domains           text[] not null default '{}',
  messages          jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create table if not exists reality_case_sources (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references reality_cases (id) on delete cascade,
  observation_id  uuid references observations (id) on delete set null,
  idea_id         uuid references ideas (id) on delete set null,
  validation_id   uuid references validations (id) on delete set null,
  prediction_id   uuid references predictions (id) on delete set null,
  source_snapshot jsonb not null,
  added_at        timestamptz not null default now(),
  constraint reality_case_sources_parent_check
    check (num_nonnulls(observation_id, idea_id, validation_id, prediction_id) <= 1)
);

create table if not exists reality_versions (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references reality_cases (id) on delete cascade,
  previous_version_id uuid references reality_versions (id) on delete set null,
  version_no          integer not null check (version_no > 0),
  map                 jsonb not null,
  delta               jsonb,
  selected_path       jsonb,
  custom_action       text,
  selection_reason    text,
  review_due_at       timestamptz,
  created_at          timestamptz not null default now(),
  constraint reality_versions_case_number_uniq unique (case_id, version_no)
);

create index if not exists idx_reality_cases_user_updated
  on reality_cases (user_id, updated_at desc)
  where archived_at is null;
create index if not exists idx_reality_sources_case
  on reality_case_sources (case_id, added_at);
create index if not exists idx_reality_versions_case
  on reality_versions (case_id, version_no desc);
create index if not exists idx_reality_versions_due
  on reality_versions (review_due_at)
  where review_due_at is not null;

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
alter table predictions  enable row level security;
alter table external_signals enable row level security;
alter table reality_cases enable row level security;
alter table reality_case_sources enable row level security;
alter table reality_versions enable row level security;

-- ---------------------------------------------------------------------------
-- 顾客视点：跨课题证据库、研究批次、证据约束代理与模式报告
-- ---------------------------------------------------------------------------
do $$ begin
  create type customer_material_origin as enum ('web', 'interview', 'chat', 'review', 'url');
exception when duplicate_object then null; end $$;
do $$ begin
  create type customer_review_status as enum ('candidate', 'kept', 'excluded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type customer_emotion_basis as enum ('stated', 'inferred', 'unknown');
exception when duplicate_object then null; end $$;
do $$ begin
  create type customer_research_cadence as enum ('daily', 'weekly');
exception when duplicate_object then null; end $$;
do $$ begin
  create type customer_proxy_mode as enum ('listen', 'idea_reaction');
exception when duplicate_object then null; end $$;

create table if not exists customer_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idea_id uuid references ideas (id) on delete set null,
  title text not null,
  customer_hypothesis text not null,
  problem_context text not null,
  markets text[] not null default '{}',
  original_belief text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists customer_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  origin customer_material_origin not null,
  source text not null,
  source_id text,
  source_url text,
  title text,
  sanitized_text text not null,
  dedupe_key text not null,
  language text,
  market text,
  created_at timestamptz not null default now(),
  constraint customer_materials_user_dedupe_uniq unique (user_id, dedupe_key)
);
create table if not exists customer_case_materials (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references customer_cases (id) on delete cascade,
  material_id uuid not null references customer_materials (id) on delete cascade,
  status customer_review_status not null default 'candidate',
  added_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint customer_case_material_uniq unique (case_id, material_id)
);
create table if not exists customer_evidence_atoms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references customer_materials (id) on delete cascade,
  quote text not null,
  scene text not null default '',
  behavior text not null default '',
  alternative text not null default '',
  tradeoff text not null default '',
  emotion text not null default '',
  emotion_basis customer_emotion_basis not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);
create table if not exists customer_research_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  case_id uuid not null references customer_cases (id) on delete cascade,
  query text not null,
  translated_queries jsonb not null default '{}'::jsonb,
  markets text[] not null default '{}',
  cadence customer_research_cadence not null default 'weekly',
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists customer_research_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references customer_cases (id) on delete cascade,
  evidence_ids uuid[] not null default '{}',
  segments jsonb not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);
create table if not exists customer_proxy_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references customer_cases (id) on delete cascade,
  research_run_id uuid not null references customer_research_runs (id) on delete cascade,
  previous_version_id uuid references customer_proxy_versions (id) on delete set null,
  version_no integer not null check (version_no > 0),
  selected_segment jsonb not null,
  proxy jsonb not null,
  delta jsonb,
  is_provisional boolean not null,
  created_at timestamptz not null default now(),
  constraint customer_proxy_case_version_uniq unique (case_id, version_no)
);
create table if not exists customer_proxy_sessions (
  id uuid primary key default gen_random_uuid(),
  proxy_version_id uuid not null references customer_proxy_versions (id) on delete cascade,
  mode customer_proxy_mode not null,
  idea_id uuid references ideas (id) on delete set null,
  idea_snapshot jsonb,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_proxy_session_idea_check
    check ((mode = 'listen' and idea_snapshot is null) or (mode = 'idea_reaction' and idea_snapshot is not null))
);
create table if not exists customer_conclusions (
  id uuid primary key default gen_random_uuid(),
  proxy_version_id uuid not null unique references customer_proxy_versions (id) on delete cascade,
  original_misunderstanding text not null,
  updated_understanding text not null,
  still_unknown text not null,
  contact_person text not null,
  one_question text not null,
  created_at timestamptz not null default now()
);
create table if not exists customer_pattern_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  filters jsonb not null default '{}'::jsonb,
  report jsonb not null,
  evidence_ids uuid[] not null default '{}',
  prompt_version text not null,
  created_at timestamptz not null default now()
);
create table if not exists customer_opportunities (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references customer_pattern_reports (id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 3),
  draft jsonb not null,
  created_idea_id uuid references ideas (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_opportunities_report_ordinal_uniq unique (report_id, ordinal)
);

create index if not exists idx_customer_cases_user_updated on customer_cases (user_id, updated_at desc) where archived_at is null;
create index if not exists idx_customer_materials_user_created on customer_materials (user_id, created_at desc);
create index if not exists idx_customer_materials_market on customer_materials (user_id, market);
create index if not exists idx_customer_case_materials_status on customer_case_materials (case_id, status, added_at desc);
create index if not exists idx_customer_evidence_material on customer_evidence_atoms (material_id, created_at desc);
create index if not exists idx_customer_topics_due on customer_research_topics (enabled, next_run_at);
create index if not exists idx_customer_runs_case on customer_research_runs (case_id, created_at desc);
create index if not exists idx_customer_proxy_case on customer_proxy_versions (case_id, version_no desc);
create index if not exists idx_customer_pattern_reports_user on customer_pattern_reports (user_id, created_at desc);

alter table customer_cases enable row level security;
alter table customer_materials enable row level security;
alter table customer_case_materials enable row level security;
alter table customer_evidence_atoms enable row level security;
alter table customer_research_topics enable row level security;
alter table customer_research_runs enable row level security;
alter table customer_proxy_versions enable row level security;
alter table customer_proxy_sessions enable row level security;
alter table customer_conclusions enable row level security;
alter table customer_pattern_reports enable row level security;
alter table customer_opportunities enable row level security;

create or replace function promote_customer_opportunity(
  p_opportunity_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_row customer_opportunities%rowtype;
  report_owner uuid;
  new_idea_id uuid;
begin
  select * into opportunity_row from customer_opportunities
  where id = p_opportunity_id for update;
  if opportunity_row.id is null then raise exception '候选机会不存在'; end if;
  select user_id into report_owner from customer_pattern_reports
  where id = opportunity_row.report_id;
  if report_owner is distinct from p_user_id then
    raise exception '无权使用该候选机会';
  end if;
  if opportunity_row.created_idea_id is not null then
    return opportunity_row.created_idea_id;
  end if;
  insert into ideas (user_id, title, status, tags, hypothesis)
  values (
    p_user_id,
    opportunity_row.draft->>'direction',
    '观察',
    array['顾客研究'],
    jsonb_build_object(
      'pain', opportunity_row.draft->>'customer_progress',
      'alternative', opportunity_row.draft->>'current_alternative',
      'solution', opportunity_row.draft->>'direction',
      'riskiest_assumption', opportunity_row.draft->>'fatal_assumption'
    )
  ) returning id into new_idea_id;
  update customer_opportunities set created_idea_id = new_idea_id
  where id = p_opportunity_id;
  return new_idea_id;
end;
$$;

revoke all on function promote_customer_opportunity(uuid, uuid) from public;
revoke all on function promote_customer_opportunity(uuid, uuid) from anon;
revoke all on function promote_customer_opportunity(uuid, uuid) from authenticated;
grant execute on function promote_customer_opportunity(uuid, uuid) to service_role;
