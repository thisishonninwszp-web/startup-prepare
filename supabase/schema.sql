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

-- ---------------------------------------------------------------------------
-- 日／周／月复盘闭环
-- ---------------------------------------------------------------------------

do $$ begin
  create type reflection_status as enum ('draft', 'confirmed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reflection_time_basis as enum ('explicit', 'approximate');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reflection_block_origin as enum ('ai', 'user');
exception when duplicate_object then null; end $$;
do $$ begin
  create type retro_period_type as enum ('weekly', 'monthly');
exception when duplicate_object then null; end $$;
do $$ begin
  create type retro_period_status as enum ('draft', 'interview', 'completed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type judgment_rule_status as enum ('active', 'revised', 'retired');
exception when duplicate_object then null; end $$;

create table if not exists reflection_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Tokyo',
  review_weekday integer not null default 0 check (review_weekday between 0 and 6),
  categories jsonb not null default '[]'::jsonb,
  gray_keywords text[] not null default '{}',
  private_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reflection_date date not null,
  sanitized_journal text not null default '',
  ambiguities jsonb not null default '[]'::jsonb,
  fact_observation text not null default '',
  status reflection_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint daily_reflections_user_date_uniq unique (user_id, reflection_date)
);

create table if not exists daily_time_blocks (
  id uuid primary key default gen_random_uuid(),
  reflection_id uuid not null references daily_reflections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  start_slot integer not null check (start_slot between 0 and 47),
  end_slot integer not null check (end_slot between 1 and 48 and end_slot > start_slot),
  event text not null,
  category_key text not null,
  time_basis reflection_time_basis not null,
  secondary_note text,
  origin reflection_block_origin not null,
  created_at timestamptz not null default now()
);

create table if not exists retro_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_type retro_period_type not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status retro_period_status not null default 'draft',
  draft jsonb,
  messages jsonb not null default '[]'::jsonb,
  final jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint retro_periods_user_range_uniq unique (user_id, period_type, period_start, period_end)
);

create table if not exists retro_sources (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references retro_periods (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null,
  source_id text not null,
  label text not null,
  snapshot jsonb not null,
  included boolean not null default true,
  created_at timestamptz not null default now(),
  constraint retro_sources_period_source_uniq unique (period_id, source_type, source_id)
);

create table if not exists judgment_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_period_id uuid not null references retro_periods (id) on delete restrict,
  replaces_rule_id uuid references judgment_rules (id) on delete set null,
  text text not null,
  status judgment_rule_status not null default 'active',
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create table if not exists retro_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_id uuid not null unique references retro_periods (id) on delete cascade,
  text text not null,
  due_at timestamptz,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists retro_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_id uuid not null unique references retro_periods (id) on delete cascade,
  text text not null,
  due_at timestamptz not null,
  outcome prediction_outcome not null default 'pending',
  resolved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_reflections_user_date on daily_reflections (user_id, reflection_date desc);
create index if not exists idx_daily_time_blocks_reflection on daily_time_blocks (reflection_id, start_slot);
create index if not exists idx_retro_periods_user_start on retro_periods (user_id, period_type, period_start desc);
create index if not exists idx_retro_sources_period on retro_sources (period_id, included);
create index if not exists idx_judgment_rules_user_status on judgment_rules (user_id, status, created_at desc);
create index if not exists idx_retro_predictions_due on retro_predictions (user_id, outcome, due_at);

alter table reflection_settings enable row level security;
alter table daily_reflections enable row level security;
alter table daily_time_blocks enable row level security;
alter table retro_periods enable row level security;
alter table retro_sources enable row level security;
alter table judgment_rules enable row level security;
alter table retro_commitments enable row level security;
alter table retro_predictions enable row level security;

create or replace function save_daily_timeline(
  p_user_id uuid, p_reflection_date date, p_sanitized_journal text,
  p_ambiguities jsonb, p_blocks jsonb, p_fact_observation text, p_confirm boolean
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_reflection_id uuid;
  block jsonb;
begin
  insert into daily_reflections (
    user_id, reflection_date, sanitized_journal, ambiguities,
    fact_observation, status, confirmed_at, updated_at
  ) values (
    p_user_id, p_reflection_date, p_sanitized_journal, p_ambiguities,
    p_fact_observation,
    case when p_confirm then 'confirmed'::reflection_status else 'draft'::reflection_status end,
    case when p_confirm then now() else null end, now()
  )
  on conflict (user_id, reflection_date) do update set
    sanitized_journal = excluded.sanitized_journal,
    ambiguities = excluded.ambiguities,
    fact_observation = excluded.fact_observation,
    status = excluded.status,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning id into v_reflection_id;
  delete from daily_time_blocks
    where daily_time_blocks.reflection_id = v_reflection_id;
  for block in select * from jsonb_array_elements(p_blocks)
  loop
    insert into daily_time_blocks (
      reflection_id, user_id, start_slot, end_slot, event,
      category_key, time_basis, secondary_note, origin
    ) values (
      v_reflection_id, p_user_id, (block->>'start_slot')::integer,
      (block->>'end_slot')::integer, block->>'event', block->>'category_key',
      (block->>'time_basis')::reflection_time_basis,
      nullif(block->>'secondary_note', ''),
      case when p_confirm then 'user'::reflection_block_origin else 'ai'::reflection_block_origin end
    );
  end loop;
  return v_reflection_id;
end;
$$;

create or replace function complete_weekly_retrospective(
  p_period_id uuid, p_user_id uuid, p_final jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  period_row retro_periods%rowtype;
  rule_id uuid;
  user_timezone text;
begin
  select * into period_row from retro_periods where id = p_period_id for update;
  if period_row.id is null or period_row.user_id is distinct from p_user_id then
    raise exception '无权完成该周复盘';
  end if;
  if period_row.period_type <> 'weekly' then raise exception '复盘类型不是weekly'; end if;
  if period_row.status = 'completed' then
    select id into rule_id from judgment_rules where source_period_id = p_period_id limit 1;
    return rule_id;
  end if;
  if coalesce(trim(p_final->>'rule'), '') = ''
    or coalesce(trim(p_final->>'commitment'), '') = ''
    or coalesce(trim(p_final->'prediction'->>'text'), '') = ''
    or coalesce(trim(p_final->'prediction'->>'due_date'), '') = '' then
    raise exception '周复盘缺少规则、行动或预测';
  end if;
  insert into judgment_rules (user_id, source_period_id, text)
    values (p_user_id, p_period_id, p_final->>'rule') returning id into rule_id;
  select coalesce(timezone, 'Asia/Tokyo') into user_timezone
    from reflection_settings where user_id = p_user_id;
  user_timezone := coalesce(user_timezone, 'Asia/Tokyo');
  insert into retro_commitments (user_id, period_id, text, due_at)
    values (p_user_id, p_period_id, p_final->>'commitment',
      ((p_final->'prediction'->>'due_date')::date + time '23:59:59') at time zone user_timezone);
  insert into retro_predictions (user_id, period_id, text, due_at)
    values (p_user_id, p_period_id, p_final->'prediction'->>'text',
      ((p_final->'prediction'->>'due_date')::date + time '23:59:59') at time zone user_timezone);
  update retro_periods set status = 'completed', final = p_final,
    completed_at = now(), updated_at = now() where id = p_period_id;
  return rule_id;
end;
$$;

create or replace function complete_monthly_retrospective(
  p_period_id uuid, p_user_id uuid, p_final jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  period_row retro_periods%rowtype;
  old_rule judgment_rules%rowtype;
  result_rule_id uuid;
  action text;
begin
  select * into period_row from retro_periods where id = p_period_id for update;
  if period_row.id is null or period_row.user_id is distinct from p_user_id then
    raise exception '无权完成该月复盘';
  end if;
  if period_row.period_type <> 'monthly' then raise exception '复盘类型不是monthly'; end if;
  if period_row.status = 'completed' then return null; end if;
  action := p_final->'rule_decision'->>'action';
  select * into old_rule from judgment_rules
    where id = nullif(p_final->'rule_decision'->>'rule_id', '')::uuid
      and user_id = p_user_id for update;
  if old_rule.id is null then raise exception '月复盘必须选择自己的判断规则'; end if;
  if action = 'keep' then
    result_rule_id := old_rule.id;
  elsif action = 'retire' then
    update judgment_rules set status = 'retired', retired_at = now() where id = old_rule.id;
    result_rule_id := old_rule.id;
  elsif action = 'revise' then
    update judgment_rules set status = 'revised', retired_at = now() where id = old_rule.id;
    insert into judgment_rules (user_id, source_period_id, replaces_rule_id, text)
      values (p_user_id, p_period_id, old_rule.id,
        p_final->'rule_decision'->>'text') returning id into result_rule_id;
  else
    raise exception '无效的规则操作';
  end if;
  update retro_periods set status = 'completed', final = p_final,
    completed_at = now(), updated_at = now() where id = p_period_id;
  return result_rule_id;
end;
$$;

revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from public;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from anon;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_weekly_retrospective(uuid, uuid, jsonb) to service_role;
revoke all on function complete_monthly_retrospective(uuid, uuid, jsonb) from public;
revoke all on function complete_monthly_retrospective(uuid, uuid, jsonb) from anon;
revoke all on function complete_monthly_retrospective(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_monthly_retrospective(uuid, uuid, jsonb) to service_role;
revoke all on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) from public;
revoke all on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) from anon;
revoke all on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) from authenticated;
grant execute on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 梦想系统
-- ---------------------------------------------------------------------------

do $$ begin
  create type dream_context as enum ('personal', 'business', 'cross');
exception when duplicate_object then null; end $$;
do $$ begin
  create type dream_scale as enum ('small', 'big', 'grand');
exception when duplicate_object then null; end $$;

create table if not exists dream_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  context dream_context not null,
  scale dream_scale not null,
  initial_desire text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists dream_sources (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references dream_cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('reality')),
  source_id uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint dream_sources_case_source_uniq unique (case_id, source_type, source_id)
);
create table if not exists dream_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references dream_cases (id) on delete cascade,
  previous_version_id uuid references dream_versions (id) on delete set null,
  version_no integer not null check (version_no > 0),
  vision jsonb not null,
  delta jsonb,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  constraint dream_versions_case_version_uniq unique (case_id, version_no)
);
create index if not exists idx_dream_cases_user_updated on dream_cases (user_id, updated_at desc) where archived_at is null;
create index if not exists idx_dream_sources_case on dream_sources (case_id, created_at);
create index if not exists idx_dream_versions_case on dream_versions (case_id, version_no desc);
alter table dream_cases enable row level security;
alter table dream_sources enable row level security;
alter table dream_versions enable row level security;

-- ---------------------------------------------------------------------------
-- Idea 价值设计图
-- ---------------------------------------------------------------------------

do $$ begin
  create type concept_status as enum ('provisional', 'confirmed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type concept_story_type as enum ('insight', 'vision', 'integrated');
exception when duplicate_object then null; end $$;

alter table reframing_sessions
  add column if not exists central_question_candidates jsonb,
  add column if not exists selected_question_type text,
  add column if not exists selected_question text,
  add column if not exists selected_question_at timestamptz;

create table if not exists idea_company_facts (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  fact text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists concept_workspaces (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_proxy_version_id uuid references customer_proxy_versions (id) on delete set null,
  dream_version_id uuid references dream_versions (id) on delete set null,
  reframing_session_id uuid references reframing_sessions (id) on delete set null,
  fermi_estimate_id uuid references fermi_estimates (id) on delete set null,
  bayesian_belief_id uuid references bayesian_beliefs (id) on delete set null,
  question_candidates jsonb,
  central_question_type text,
  central_question text,
  story_type concept_story_type not null default 'insight',
  draft jsonb,
  draft_sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists concept_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references concept_workspaces (id) on delete cascade,
  idea_id uuid not null references ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  previous_version_id uuid references concept_versions (id) on delete set null,
  version_no integer not null check (version_no > 0),
  status concept_status not null,
  story_type concept_story_type not null,
  central_question jsonb not null,
  insight_story jsonb,
  vision_story jsonb,
  benefit_chain jsonb not null,
  candidates jsonb not null,
  selected_concept jsonb not null,
  evidence_gaps jsonb not null default '[]'::jsonb,
  personal_resonance boolean,
  delta jsonb,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint concept_versions_workspace_version_uniq unique (workspace_id, version_no)
);
create table if not exists concept_version_sources (
  id uuid primary key default gen_random_uuid(),
  concept_version_id uuid not null references concept_versions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint concept_version_sources_uniq unique (concept_version_id, source_type, source_id)
);
create table if not exists concept_comprehension_tests (
  id uuid primary key default gen_random_uuid(),
  concept_version_id uuid not null references concept_versions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  repeated_words text not null,
  captured_core boolean not null,
  created_at timestamptz not null default now()
);
create table if not exists concept_derivative_versions (
  id uuid primary key default gen_random_uuid(),
  concept_version_id uuid not null references concept_versions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version_no integer not null check (version_no > 0),
  landing_page jsonb not null,
  action_values jsonb not null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  constraint concept_derivatives_version_uniq unique (concept_version_id, version_no)
);
create index if not exists idx_company_facts_idea on idea_company_facts (idea_id, created_at) where archived_at is null;
create index if not exists idx_concept_workspaces_user on concept_workspaces (user_id, updated_at desc);
create index if not exists idx_concept_versions_idea on concept_versions (idea_id, version_no desc);
create index if not exists idx_concept_sources_version on concept_version_sources (concept_version_id, source_type);
create index if not exists idx_concept_comprehension_version on concept_comprehension_tests (concept_version_id, created_at desc);
create index if not exists idx_concept_derivatives_concept on concept_derivative_versions (concept_version_id, version_no desc);
alter table idea_company_facts enable row level security;
alter table concept_workspaces enable row level security;
alter table concept_versions enable row level security;
alter table concept_version_sources enable row level security;
alter table concept_comprehension_tests enable row level security;
alter table concept_derivative_versions enable row level security;

create or replace function create_concept_version(
  p_workspace_id uuid, p_user_id uuid, p_payload jsonb, p_sources jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  workspace_row concept_workspaces%rowtype;
  previous_row concept_versions%rowtype;
  new_version_id uuid;
  source jsonb;
begin
  select * into workspace_row from concept_workspaces where id = p_workspace_id for update;
  if workspace_row.id is null or workspace_row.user_id is distinct from p_user_id then
    raise exception '无权创建该产品概念版本';
  end if;
  select * into previous_row from concept_versions where workspace_id = p_workspace_id
    order by version_no desc limit 1;
  insert into concept_versions (
    workspace_id, idea_id, user_id, previous_version_id, version_no,
    status, story_type, central_question, insight_story, vision_story,
    benefit_chain, candidates, selected_concept, evidence_gaps,
    personal_resonance, delta, prompt_version
  ) values (
    p_workspace_id, workspace_row.idea_id, p_user_id, previous_row.id,
    coalesce(previous_row.version_no, 0) + 1, 'provisional',
    (p_payload->>'story_type')::concept_story_type,
    p_payload->'central_question', p_payload->'insight_story',
    p_payload->'vision_story', p_payload->'benefit_chain',
    p_payload->'candidates', p_payload->'selected_concept',
    p_payload->'evidence_gaps', (p_payload->>'personal_resonance')::boolean,
    p_payload->'delta', p_payload->>'prompt_version'
  ) returning id into new_version_id;
  for source in select * from jsonb_array_elements(p_sources)
  loop
    insert into concept_version_sources (
      concept_version_id, user_id, source_type, source_id, snapshot
    ) values (
      new_version_id, p_user_id, source->>'source_type',
      (source->>'source_id')::uuid, source->'snapshot'
    );
  end loop;
  return new_version_id;
end;
$$;

create or replace function confirm_concept_version(
  p_concept_version_id uuid, p_user_id uuid
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  version_row concept_versions%rowtype;
  material_count integer;
  conclusion_count integer;
  company_fact_count integer;
begin
  select * into version_row from concept_versions where id = p_concept_version_id for update;
  if version_row.id is null or version_row.user_id is distinct from p_user_id then
    raise exception '无权确认该产品概念';
  end if;
  if version_row.status = 'confirmed' then return version_row.id; end if;
  if coalesce(trim(version_row.central_question->>'question'), '') = '' then
    raise exception '缺少Central Question';
  end if;
  select count(distinct source_id) into material_count from concept_version_sources
    where concept_version_id = p_concept_version_id and user_id = p_user_id
      and source_type = 'customer_material';
  select count(*) into conclusion_count from concept_version_sources
    where concept_version_id = p_concept_version_id and user_id = p_user_id
      and source_type = 'customer_conclusion';
  select count(distinct source_id) into company_fact_count from concept_version_sources
    where concept_version_id = p_concept_version_id and user_id = p_user_id
      and source_type = 'company_fact';
  if material_count < 3 then raise exception '至少需要3份独立顾客材料'; end if;
  if conclusion_count < 1 then raise exception '至少需要一份顾客研究结论'; end if;
  if company_fact_count < 1 then raise exception '至少需要一条公司事实'; end if;
  update concept_versions set status = 'confirmed', confirmed_at = now()
    where id = p_concept_version_id;
  return p_concept_version_id;
end;
$$;
revoke all on function confirm_concept_version(uuid, uuid) from public;
revoke all on function confirm_concept_version(uuid, uuid) from anon;
revoke all on function confirm_concept_version(uuid, uuid) from authenticated;
grant execute on function confirm_concept_version(uuid, uuid) to service_role;
revoke all on function create_concept_version(uuid, uuid, jsonb, jsonb) from public;
revoke all on function create_concept_version(uuid, uuid, jsonb, jsonb) from anon;
revoke all on function create_concept_version(uuid, uuid, jsonb, jsonb) from authenticated;
grant execute on function create_concept_version(uuid, uuid, jsonb, jsonb) to service_role;

-- =============================================================
-- from migrations/011_dream_branch_canvas.sql
-- =============================================================

-- 梦想分支、单题访谈、实时画布与版本来源快照。

create table if not exists dream_branches (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references dream_cases (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  parent_branch_id  uuid references dream_branches (id) on delete set null,
  name              text not null,
  fork_question     text not null default '',
  tradeoff          text not null default '',
  phase             text not null default 'memory_bridge',
  current_question  text not null default '最近一次让你觉得轻松、投入或羡慕的真实片段，发生了什么？',
  is_focused        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  constraint dream_branch_phase_check check (
    phase in (
      'memory_bridge', 'future_day', 'people', 'inner_state',
      'meaning', 'non_negotiables', 'fork_point'
    )
  )
);

create table if not exists dream_branch_messages (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references dream_branches (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  idempotency_key  text,
  created_at       timestamptz not null default now()
);

create table if not exists dream_branch_canvases (
  branch_id           uuid primary key references dream_branches (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  revision            integer not null default 0 check (revision >= 0),
  content             jsonb not null,
  unknown_dimensions  text[] not null default '{}',
  updated_at          timestamptz not null default now()
);

create table if not exists dream_canvas_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references dream_branches (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  dimension           text not null,
  canvas_item_id      text not null,
  text                text not null,
  source_message_ids  uuid[] not null,
  source_ids          text[] not null default '{}',
  status              text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint dream_canvas_suggestion_item_uniq
    unique (branch_id, canvas_item_id)
);

create table if not exists dream_branch_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references dream_cases (id) on delete cascade,
  source_branch_id    uuid not null references dream_branches (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  label               text not null,
  fork_question       text not null,
  tradeoff            text not null,
  source_message_ids  uuid[] not null,
  status              text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_branch_id   uuid references dream_branches (id) on delete set null,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create table if not exists dream_version_sources (
  id                uuid primary key default gen_random_uuid(),
  dream_version_id  uuid not null references dream_versions (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  source_scope      text not null check (source_scope in ('case', 'branch')),
  source_type       text not null,
  source_id         uuid not null,
  snapshot          jsonb not null,
  created_at        timestamptz not null default now(),
  constraint dream_version_sources_uniq
    unique (dream_version_id, source_scope, source_type, source_id)
);

alter table dream_versions
  add column if not exists branch_id uuid references dream_branches (id) on delete cascade,
  add column if not exists canvas_snapshot jsonb;

alter table dream_sources
  add column if not exists branch_id uuid references dream_branches (id) on delete cascade;

alter table dream_sources
  drop constraint if exists dream_sources_case_source_uniq;

create unique index if not exists idx_dream_sources_case_unique
  on dream_sources (case_id, source_type, source_id)
  where branch_id is null;
create unique index if not exists idx_dream_sources_branch_unique
  on dream_sources (branch_id, source_type, source_id)
  where branch_id is not null;
create unique index if not exists idx_dream_focused_branch
  on dream_branches (case_id)
  where is_focused and archived_at is null;
create unique index if not exists idx_dream_message_idempotency
  on dream_branch_messages (branch_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_dream_branches_case
  on dream_branches (case_id, created_at) where archived_at is null;
create index if not exists idx_dream_messages_branch
  on dream_branch_messages (branch_id, created_at);
create index if not exists idx_dream_canvas_suggestions_branch
  on dream_canvas_suggestions (branch_id, status, created_at);
create index if not exists idx_dream_branch_suggestions_case
  on dream_branch_suggestions (case_id, status, created_at);

alter table dream_branches enable row level security;
alter table dream_branch_messages enable row level security;
alter table dream_branch_canvases enable row level security;
alter table dream_canvas_suggestions enable row level security;
alter table dream_branch_suggestions enable row level security;
alter table dream_version_sources enable row level security;

create or replace function dream_empty_canvas() returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'memory_fragments', '[]'::jsonb,
    'scene_title', '[]'::jsonb,
    'horizon', '[]'::jsonb,
    'location', '[]'::jsonb,
    'people', '[]'::jsonb,
    'sensory_details', '[]'::jsonb,
    'actions', '[]'::jsonb,
    'inner_state', '[]'::jsonb,
    'desired_changes', '[]'::jsonb,
    'past_roots', '[]'::jsonb,
    'non_negotiables', '[]'::jsonb,
    'costs', '[]'::jsonb,
    'assumptions', '[]'::jsonb,
    'reality_signals', '[]'::jsonb,
    'conflicts', '[]'::jsonb
  );
$$;

create or replace function dream_legacy_items(p_value jsonb) returns jsonb
language plpgsql volatile
as $$
declare
  result jsonb := '[]'::jsonb;
  item jsonb;
  text_value text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return result;
  end if;
  if jsonb_typeof(p_value) = 'array' then
    for item in select * from jsonb_array_elements(p_value)
    loop
      text_value := item #>> '{}';
      if text_value <> '' then
        result := result || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text,
          'text', text_value,
          'origin', 'legacy',
          'status', 'confirmed',
          'source_message_ids', '[]'::jsonb
        ));
      end if;
    end loop;
  else
    text_value := p_value #>> '{}';
    if text_value <> '' then
      result := jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', text_value,
        'origin', 'legacy',
        'status', 'confirmed',
        'source_message_ids', '[]'::jsonb
      ));
    end if;
  end if;
  return result;
end;
$$;

insert into dream_branches (
  case_id, user_id, name, phase, current_question, is_focused, created_at, updated_at
)
select
  c.id, c.user_id, '原始路径', 'memory_bridge',
  '最近一次让你觉得轻松、投入或羡慕的真实片段，发生了什么？',
  true, c.created_at, c.updated_at
from dream_cases c
where not exists (
  select 1 from dream_branches b where b.case_id = c.id
);

insert into dream_branch_messages (
  branch_id, user_id, role, content, idempotency_key, created_at
)
select
  b.id,
  c.user_id,
  case when message.value->>'role' = 'assistant' then 'assistant' else 'user' end,
  message.value->>'content',
  'legacy-' || message.ordinality,
  c.created_at + (message.ordinality || ' milliseconds')::interval
from dream_cases c
join dream_branches b
  on b.case_id = c.id and b.parent_branch_id is null
cross join lateral jsonb_array_elements(c.messages)
  with ordinality as message(value, ordinality)
where coalesce(message.value->>'content', '') <> ''
on conflict do nothing;

update dream_versions v
set branch_id = b.id
from dream_branches b
where b.case_id = v.case_id
  and b.parent_branch_id is null
  and v.branch_id is null;

insert into dream_branch_canvases (
  branch_id, user_id, revision, content, unknown_dimensions, updated_at
)
select
  b.id,
  b.user_id,
  0,
  case
    when latest.vision is null then dream_empty_canvas()
    else jsonb_build_object(
      'memory_fragments', '[]'::jsonb,
      'scene_title', dream_legacy_items(latest.vision->'scene'->'title'),
      'horizon', dream_legacy_items(latest.vision->'scene'->'horizon'),
      'location', dream_legacy_items(latest.vision->'scene'->'location'),
      'people', dream_legacy_items(latest.vision->'scene'->'people'),
      'sensory_details', dream_legacy_items(latest.vision->'scene'->'sensory_details'),
      'actions', dream_legacy_items(latest.vision->'scene'->'actions'),
      'inner_state', dream_legacy_items(latest.vision->'scene'->'inner_state'),
      'desired_changes', dream_legacy_items(latest.vision->'desired_changes'),
      'past_roots', dream_legacy_items(latest.vision->'past_roots'),
      'non_negotiables', dream_legacy_items(latest.vision->'non_negotiables'),
      'costs', dream_legacy_items(latest.vision->'costs'),
      'assumptions', dream_legacy_items(latest.vision->'assumptions'),
      'reality_signals', dream_legacy_items(latest.vision->'reality_signals'),
      'conflicts', dream_legacy_items(latest.vision->'conflicts')
    )
  end,
  '{}'::text[],
  b.updated_at
from dream_branches b
left join lateral (
  select v.vision
  from dream_versions v
  where v.branch_id = b.id
  order by v.version_no desc
  limit 1
) latest on true
where not exists (
  select 1 from dream_branch_canvases canvas where canvas.branch_id = b.id
);

insert into dream_version_sources (
  dream_version_id, user_id, source_scope, source_type, source_id, snapshot
)
select
  version.id, source.user_id, 'case', source.source_type, source.source_id, source.snapshot
from dream_versions version
join dream_sources source
  on source.case_id = version.case_id and source.branch_id is null
on conflict do nothing;

alter table dream_versions
  alter column branch_id set not null;

alter table dream_versions
  drop constraint if exists dream_versions_case_version_uniq;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dream_versions_branch_version_uniq'
      and conrelid = 'dream_versions'::regclass
  ) then
    alter table dream_versions
      add constraint dream_versions_branch_version_uniq
        unique (branch_id, version_no);
  end if;
end $$;

create or replace function enforce_dream_branch_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_count integer;
begin
  select count(*) into active_count
  from dream_branches
  where case_id = new.case_id and archived_at is null;
  if active_count >= 5 then
    raise exception '同一梦想最多保留5个活跃分支';
  end if;
  return new;
end;
$$;

drop trigger if exists dream_branch_limit_trigger on dream_branches;
create trigger dream_branch_limit_trigger
before insert on dream_branches
for each row execute function enforce_dream_branch_limit();

create or replace function set_focused_dream_branch(
  p_case_id uuid,
  p_branch_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dream_cases
    where id = p_case_id and user_id = p_user_id
  ) or not exists (
    select 1 from dream_branches
    where id = p_branch_id
      and case_id = p_case_id
      and user_id = p_user_id
      and archived_at is null
  ) then
    raise exception '无权切换该梦想分支';
  end if;
  perform 1 from dream_cases where id = p_case_id for update;
  update dream_branches
  set is_focused = false, updated_at = now()
  where case_id = p_case_id
    and user_id = p_user_id
    and archived_at is null
    and is_focused;
  update dream_branches
  set is_focused = true, updated_at = now()
  where id = p_branch_id and user_id = p_user_id;
  return p_branch_id;
end;
$$;

revoke all on function set_focused_dream_branch(uuid, uuid, uuid) from public;
revoke all on function set_focused_dream_branch(uuid, uuid, uuid) from anon;
revoke all on function set_focused_dream_branch(uuid, uuid, uuid) from authenticated;
grant execute on function set_focused_dream_branch(uuid, uuid, uuid) to service_role;

create or replace function dream_confirmed_canvas(p_content jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(
    jsonb_object_agg(
      dimension,
      (
        select coalesce(jsonb_agg(item), '[]'::jsonb)
        from jsonb_array_elements(items) as entries(item)
        where item->>'status' = 'confirmed'
      )
    ),
    dream_empty_canvas()
  )
  from jsonb_each(p_content) as dimensions(dimension, items);
$$;

create or replace function accept_dream_branch_suggestion(
  p_suggestion_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_row dream_branch_suggestions%rowtype;
  source_canvas dream_branch_canvases%rowtype;
  new_branch_id uuid;
begin
  select * into suggestion_row
  from dream_branch_suggestions
  where id = p_suggestion_id
  for update;
  if suggestion_row.id is null
    or suggestion_row.user_id is distinct from p_user_id
    or suggestion_row.status <> 'pending' then
    raise exception '无权创建该梦想分支';
  end if;
  if not exists (
    select 1 from dream_branches
    where id = suggestion_row.source_branch_id
      and case_id = suggestion_row.case_id
      and user_id = p_user_id
      and archived_at is null
  ) then
    raise exception '来源分支不存在或已经归档';
  end if;
  perform 1 from dream_cases
  where id = suggestion_row.case_id and user_id = p_user_id
  for update;
  select * into source_canvas
  from dream_branch_canvases
  where branch_id = suggestion_row.source_branch_id;

  insert into dream_branches (
    case_id, user_id, parent_branch_id, name, fork_question, tradeoff,
    phase, current_question, is_focused
  ) values (
    suggestion_row.case_id,
    p_user_id,
    suggestion_row.source_branch_id,
    suggestion_row.label,
    suggestion_row.fork_question,
    suggestion_row.tradeoff,
    'fork_point',
    suggestion_row.fork_question,
    false
  ) returning id into new_branch_id;

  insert into dream_branch_canvases (
    branch_id, user_id, revision, content, unknown_dimensions
  ) values (
    new_branch_id,
    p_user_id,
    0,
    dream_confirmed_canvas(
      coalesce(source_canvas.content, dream_empty_canvas())
    ),
    coalesce(source_canvas.unknown_dimensions, '{}'::text[])
  );

  update dream_branch_suggestions
  set status = 'accepted',
      created_branch_id = new_branch_id,
      resolved_at = now()
  where id = p_suggestion_id;
  return new_branch_id;
end;
$$;

create or replace function archive_dream_branch(
  p_branch_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_row dream_branches%rowtype;
  replacement_id uuid;
  active_count integer;
begin
  select * into branch_row
  from dream_branches
  where id = p_branch_id
  for update;
  if branch_row.id is null
    or branch_row.user_id is distinct from p_user_id
    or branch_row.archived_at is not null then
    raise exception '无权归档该梦想分支';
  end if;
  select count(*) into active_count
  from dream_branches
  where case_id = branch_row.case_id and archived_at is null;
  if active_count <= 1 then
    raise exception '至少保留一个活跃梦想分支';
  end if;
  update dream_branches
  set archived_at = now(), is_focused = false, updated_at = now()
  where id = p_branch_id;
  if branch_row.is_focused then
    select id into replacement_id
    from dream_branches
    where case_id = branch_row.case_id and archived_at is null
    order by created_at
    limit 1;
    update dream_branches
    set is_focused = true, updated_at = now()
    where id = replacement_id;
  end if;
  return p_branch_id;
end;
$$;

revoke all on function accept_dream_branch_suggestion(uuid, uuid) from public;
revoke all on function accept_dream_branch_suggestion(uuid, uuid) from anon;
revoke all on function accept_dream_branch_suggestion(uuid, uuid) from authenticated;
grant execute on function accept_dream_branch_suggestion(uuid, uuid) to service_role;
revoke all on function archive_dream_branch(uuid, uuid) from public;
revoke all on function archive_dream_branch(uuid, uuid) from anon;
revoke all on function archive_dream_branch(uuid, uuid) from authenticated;
grant execute on function archive_dream_branch(uuid, uuid) to service_role;

create or replace function create_dream_case_with_branch(
  p_user_id uuid,
  p_title text,
  p_context dream_context,
  p_scale dream_scale,
  p_initial_desire text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_case_id uuid;
  new_branch_id uuid;
begin
  insert into dream_cases (
    user_id, title, context, scale, initial_desire, messages
  ) values (
    p_user_id, p_title, p_context, p_scale, p_initial_desire, '[]'::jsonb
  ) returning id into new_case_id;
  insert into dream_branches (
    case_id, user_id, name, phase, current_question, is_focused
  ) values (
    new_case_id,
    p_user_id,
    '原始路径',
    'memory_bridge',
    '最近一次让你觉得轻松、投入或羡慕的真实片段，发生了什么？',
    true
  ) returning id into new_branch_id;
  insert into dream_branch_canvases (
    branch_id, user_id, revision, content
  ) values (
    new_branch_id, p_user_id, 0, dream_empty_canvas()
  );
  insert into dream_branch_messages (
    branch_id, user_id, role, content, idempotency_key
  ) values (
    new_branch_id, p_user_id, 'user', p_initial_desire, 'initial-desire'
  );
  return new_case_id;
end;
$$;

revoke all on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) from public;
revoke all on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) from anon;
revoke all on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) from authenticated;
grant execute on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) to service_role;

create or replace function apply_dream_turn(
  p_branch_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_content jsonb,
  p_unknown_dimensions text[],
  p_phase text,
  p_question text,
  p_inferences jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  canvas_row dream_branch_canvases%rowtype;
  inference jsonb;
begin
  select * into canvas_row
  from dream_branch_canvases
  where branch_id = p_branch_id
  for update;
  if canvas_row.branch_id is null
    or canvas_row.user_id is distinct from p_user_id then
    raise exception '无权更新该梦想画布';
  end if;
  if canvas_row.revision <> p_expected_revision then
    raise exception '画布已经更新，请基于最新版本重试';
  end if;
  update dream_branch_canvases
  set content = p_content,
      unknown_dimensions = p_unknown_dimensions,
      revision = revision + 1,
      updated_at = now()
  where branch_id = p_branch_id;
  update dream_branches
  set phase = p_phase,
      current_question = p_question,
      updated_at = now()
  where id = p_branch_id and user_id = p_user_id;
  insert into dream_branch_messages (
    branch_id, user_id, role, content
  ) values (
    p_branch_id, p_user_id, 'assistant', p_question
  );
  for inference in select * from jsonb_array_elements(p_inferences)
  loop
    insert into dream_canvas_suggestions (
      branch_id, user_id, dimension, canvas_item_id, text,
      source_message_ids, source_ids, status
    ) values (
      p_branch_id,
      p_user_id,
      inference->>'dimension',
      inference->>'canvas_item_id',
      inference->>'text',
      array(
        select value::uuid
        from jsonb_array_elements_text(inference->'source_message_ids')
      ),
      array(
        select value
        from jsonb_array_elements_text(inference->'source_ids')
      ),
      'pending'
    )
    on conflict (branch_id, canvas_item_id) do nothing;
  end loop;
  return p_expected_revision + 1;
end;
$$;

revoke all on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) from public;
revoke all on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) from anon;
revoke all on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) from authenticated;
grant execute on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) to service_role;

create or replace function create_dream_branch_version(
  p_case_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_vision jsonb,
  p_canvas_snapshot jsonb,
  p_delta jsonb,
  p_prompt_version text,
  p_sources jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_row dream_branches%rowtype;
  previous_row dream_versions%rowtype;
  new_version_id uuid;
  source jsonb;
begin
  select * into branch_row
  from dream_branches
  where id = p_branch_id
  for update;
  if branch_row.id is null
    or branch_row.case_id is distinct from p_case_id
    or branch_row.user_id is distinct from p_user_id
    or branch_row.archived_at is not null then
    raise exception '无权创建该梦想版本';
  end if;
  select * into previous_row
  from dream_versions
  where branch_id = p_branch_id
  order by version_no desc
  limit 1;
  insert into dream_versions (
    case_id, branch_id, previous_version_id, version_no, vision,
    canvas_snapshot, delta, prompt_version
  ) values (
    p_case_id,
    p_branch_id,
    previous_row.id,
    coalesce(previous_row.version_no, 0) + 1,
    p_vision,
    p_canvas_snapshot,
    p_delta,
    p_prompt_version
  ) returning id into new_version_id;
  for source in select * from jsonb_array_elements(p_sources)
  loop
    insert into dream_version_sources (
      dream_version_id, user_id, source_scope, source_type, source_id, snapshot
    ) values (
      new_version_id,
      p_user_id,
      source->>'source_scope',
      source->>'source_type',
      (source->>'source_id')::uuid,
      source->'snapshot'
    );
  end loop;
  update dream_cases set updated_at = now()
  where id = p_case_id and user_id = p_user_id;
  return new_version_id;
end;
$$;

revoke all on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) from public;
revoke all on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) from anon;
revoke all on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) from authenticated;
grant execute on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) to service_role;

create or replace function resolve_dream_canvas_suggestion(
  p_suggestion_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_content jsonb,
  p_resolution text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_row dream_canvas_suggestions%rowtype;
  canvas_row dream_branch_canvases%rowtype;
begin
  if p_resolution not in ('accepted', 'rejected') then
    raise exception '画布建议处理方式无效';
  end if;
  select * into suggestion_row
  from dream_canvas_suggestions
  where id = p_suggestion_id
  for update;
  if suggestion_row.id is null
    or suggestion_row.branch_id is distinct from p_branch_id
    or suggestion_row.user_id is distinct from p_user_id
    or suggestion_row.status <> 'pending' then
    raise exception '画布建议不存在或已经处理';
  end if;
  select * into canvas_row
  from dream_branch_canvases
  where branch_id = p_branch_id
  for update;
  if canvas_row.user_id is distinct from p_user_id
    or canvas_row.revision <> p_expected_revision then
    raise exception '画布已经更新，请刷新后重试';
  end if;
  update dream_branch_canvases
  set content = p_content,
      revision = revision + 1,
      updated_at = now()
  where branch_id = p_branch_id;
  update dream_canvas_suggestions
  set status = p_resolution, resolved_at = now()
  where id = p_suggestion_id;
  return p_expected_revision + 1;
end;
$$;

revoke all on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) from public;
revoke all on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) from anon;
revoke all on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) from authenticated;
grant execute on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) to service_role;

-- =============================================================
-- from migrations/012_reality_reasoning_bridge.sql
-- =============================================================

-- Preserve immutable reality-version provenance for reasoning tools.

create table if not exists reasoning_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reality_version_id uuid not null references reality_versions (id) on delete cascade,
  bayesian_belief_id uuid references bayesian_beliefs (id) on delete cascade,
  fermi_estimate_id uuid references fermi_estimates (id) on delete cascade,
  reframing_session_id uuid references reframing_sessions (id) on delete cascade,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint reasoning_sources_one_target check (
    num_nonnulls(bayesian_belief_id, fermi_estimate_id, reframing_session_id) = 1
  )
);

create unique index if not exists reasoning_sources_bayesian_uniq
  on reasoning_sources (bayesian_belief_id)
  where bayesian_belief_id is not null;
create unique index if not exists reasoning_sources_fermi_uniq
  on reasoning_sources (fermi_estimate_id)
  where fermi_estimate_id is not null;
create unique index if not exists reasoning_sources_reframing_uniq
  on reasoning_sources (reframing_session_id)
  where reframing_session_id is not null;
create index if not exists reasoning_sources_reality_version_idx
  on reasoning_sources (reality_version_id);

alter table reasoning_sources enable row level security;

-- =============================================================
-- from migrations/013_reality_closure.sql
-- =============================================================

-- Reality closure: one current next move per reality case, with immutable
-- decision snapshots and append-only lifecycle events.

create table if not exists reality_closures (
  id                           uuid primary key default gen_random_uuid(),
  user_id                      uuid not null references auth.users (id) on delete cascade,
  case_id                      uuid not null references reality_cases (id) on delete cascade,
  source_version_id            uuid not null references reality_versions (id) on delete restrict,
  replaces_closure_id          uuid references reality_closures (id) on delete restrict,
  mode                         text not null check (mode in ('act', 'verify', 'wait')),
  decision                     text not null check (length(trim(decision)) > 0),
  critical_unknown             text not null check (length(trim(critical_unknown)) > 0),
  next_action                  text not null check (length(trim(next_action)) > 0),
  completion_criterion         text not null check (length(trim(completion_criterion)) > 0),
  expected_feedback            text not null check (length(trim(expected_feedback)) > 0),
  due_on                       date not null,
  rejected_alternative_reason  text not null check (length(trim(rejected_alternative_reason)) > 0),
  direction_change_reason      text,
  wait_signal                  text,
  basis_refs                   jsonb not null check (
    jsonb_typeof(basis_refs) = 'array' and jsonb_array_length(basis_refs) > 0
  ),
  source_snapshot              jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  source_fingerprint           text not null check (length(source_fingerprint) = 64),
  status                       text not null default 'active'
    check (status in ('active', 'completed', 'not_completed', 'replaced')),
  created_at                   timestamptz not null default now(),
  closed_at                    timestamptz,
  check (mode <> 'wait' or length(trim(coalesce(wait_signal, ''))) > 0)
);

create table if not exists reality_closure_events (
  id                  uuid primary key default gen_random_uuid(),
  closure_id          uuid not null references reality_closures (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  event_type          text not null
    check (event_type in ('completed', 'not_completed', 'replaced', 'reconfirmed')),
  reality_version_id  uuid references reality_versions (id) on delete restrict,
  note                text not null check (length(trim(note)) > 0),
  created_at          timestamptz not null default now()
);

create unique index if not exists reality_closures_one_active_per_case
  on reality_closures (case_id)
  where status = 'active';

create index if not exists reality_closures_user_case_created
  on reality_closures (user_id, case_id, created_at desc);

create index if not exists reality_closure_events_closure_created
  on reality_closure_events (closure_id, created_at);

alter table reality_closures enable row level security;
alter table reality_closure_events enable row level security;

create or replace function save_reality_closure(
  p_user_id uuid,
  p_case_id uuid,
  p_source_version_id uuid,
  p_payload jsonb,
  p_source_snapshot jsonb,
  p_source_fingerprint text,
  p_replaces_closure_id uuid default null,
  p_replace_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case reality_cases%rowtype;
  v_version reality_versions%rowtype;
  v_active_id uuid;
  v_closure_id uuid;
  v_due_on date;
begin
  select * into v_case
  from reality_cases
  where id = p_case_id and user_id = p_user_id
  for update;
  if v_case.id is null then
    raise exception '无权收束该现状课题';
  end if;

  select * into v_version
  from reality_versions
  where id = p_source_version_id and case_id = p_case_id;
  if v_version.id is null then
    raise exception '现状版本不属于该课题';
  end if;

  if p_payload->>'mode' not in ('act', 'verify', 'wait')
    or coalesce(trim(p_payload->>'decision'), '') = ''
    or coalesce(trim(p_payload->>'critical_unknown'), '') = ''
    or coalesce(trim(p_payload->>'next_action'), '') = ''
    or coalesce(trim(p_payload->>'completion_criterion'), '') = ''
    or coalesce(trim(p_payload->>'expected_feedback'), '') = ''
    or coalesce(trim(p_payload->>'rejected_alternative_reason'), '') = ''
    or jsonb_typeof(p_payload->'basis_refs') is distinct from 'array'
    or jsonb_array_length(p_payload->'basis_refs') = 0 then
    raise exception '收束内容不完整';
  end if;
  if p_payload->>'mode' = 'wait'
    and coalesce(trim(p_payload->>'wait_signal'), '') = '' then
    raise exception '暂缓必须记录重新判断信号';
  end if;
  begin
    v_due_on := (p_payload->>'due_on')::date;
  exception when others then
    raise exception '截止日期无效';
  end;
  if v_due_on <= current_date then
    raise exception '截止日期必须晚于今天';
  end if;
  if length(p_source_fingerprint) <> 64
    or jsonb_typeof(p_source_snapshot) is distinct from 'object' then
    raise exception '来源快照无效';
  end if;

  select id into v_active_id
  from reality_closures
  where case_id = p_case_id and status = 'active'
  limit 1
  for update;

  if v_active_id is not null then
    if p_replaces_closure_id is distinct from v_active_id
      or coalesce(trim(p_replace_reason), '') = '' then
      raise exception '该课题已有当前下一步，替代时必须记录原因';
    end if;
    update reality_closures
    set status = 'replaced', closed_at = now()
    where id = v_active_id;
    insert into reality_closure_events (
      closure_id, user_id, event_type, reality_version_id, note
    ) values (
      v_active_id, p_user_id, 'replaced', p_source_version_id, trim(p_replace_reason)
    );
  elsif p_replaces_closure_id is not null then
    raise exception '要替代的当前下一步不存在';
  end if;

  insert into reality_closures (
    user_id,
    case_id,
    source_version_id,
    replaces_closure_id,
    mode,
    decision,
    critical_unknown,
    next_action,
    completion_criterion,
    expected_feedback,
    due_on,
    rejected_alternative_reason,
    direction_change_reason,
    wait_signal,
    basis_refs,
    source_snapshot,
    source_fingerprint
  ) values (
    p_user_id,
    p_case_id,
    p_source_version_id,
    p_replaces_closure_id,
    p_payload->>'mode',
    trim(p_payload->>'decision'),
    trim(p_payload->>'critical_unknown'),
    trim(p_payload->>'next_action'),
    trim(p_payload->>'completion_criterion'),
    trim(p_payload->>'expected_feedback'),
    v_due_on,
    trim(p_payload->>'rejected_alternative_reason'),
    nullif(trim(p_payload->>'direction_change_reason'), ''),
    nullif(trim(p_payload->>'wait_signal'), ''),
    p_payload->'basis_refs',
    p_source_snapshot,
    p_source_fingerprint
  )
  returning id into v_closure_id;

  return v_closure_id;
end;
$$;

create or replace function resolve_reality_closure(
  p_closure_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closure reality_closures%rowtype;
begin
  select * into v_closure
  from reality_closures
  where id = p_closure_id
  for update;
  if v_closure.id is null
    or v_closure.user_id is distinct from p_user_id
    or v_closure.status <> 'active' then
    raise exception '当前下一步不存在或无权操作';
  end if;
  if p_outcome not in ('completed', 'not_completed')
    or coalesce(trim(p_note), '') = '' then
    raise exception '必须记录实际发生了什么';
  end if;

  update reality_closures
  set status = p_outcome, closed_at = now()
  where id = p_closure_id;

  insert into reality_closure_events (
    closure_id, user_id, event_type, reality_version_id, note
  ) values (
    p_closure_id, p_user_id, p_outcome, v_closure.source_version_id, trim(p_note)
  );
end;
$$;

create or replace function reconfirm_reality_closure(
  p_closure_id uuid,
  p_user_id uuid,
  p_reality_version_id uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closure reality_closures%rowtype;
  v_version reality_versions%rowtype;
begin
  select * into v_closure
  from reality_closures
  where id = p_closure_id
  for update;
  if v_closure.id is null
    or v_closure.user_id is distinct from p_user_id
    or v_closure.status <> 'active' then
    raise exception '当前下一步不存在或无权操作';
  end if;

  select * into v_version
  from reality_versions
  where id = p_reality_version_id and case_id = v_closure.case_id;
  if v_version.id is null or coalesce(trim(p_note), '') = '' then
    raise exception '重新确认必须引用当前课题版本并记录理由';
  end if;

  insert into reality_closure_events (
    closure_id, user_id, event_type, reality_version_id, note
  ) values (
    p_closure_id, p_user_id, 'reconfirmed', p_reality_version_id, trim(p_note)
  );
end;
$$;

revoke all on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) from public;
revoke all on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) from anon;
revoke all on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) from authenticated;
grant execute on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) to service_role;

revoke all on function resolve_reality_closure(uuid, uuid, text, text) from public;
revoke all on function resolve_reality_closure(uuid, uuid, text, text) from anon;
revoke all on function resolve_reality_closure(uuid, uuid, text, text) from authenticated;
grant execute on function resolve_reality_closure(uuid, uuid, text, text) to service_role;

revoke all on function reconfirm_reality_closure(uuid, uuid, uuid, text) from public;
revoke all on function reconfirm_reality_closure(uuid, uuid, uuid, text) from anon;
revoke all on function reconfirm_reality_closure(uuid, uuid, uuid, text) from authenticated;
grant execute on function reconfirm_reality_closure(uuid, uuid, uuid, text) to service_role;

-- =============================================================
-- from migrations/014_reality_focused_inquiry.sql
-- =============================================================

-- Bounded, map-item-anchored inquiry sessions.

alter table reality_versions
  add column if not exists focus_session_ids uuid[] not null default '{}';

create table if not exists reality_focus_sessions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  case_id                  uuid not null references reality_cases (id) on delete cascade,
  version_id               uuid not null references reality_versions (id) on delete restrict,
  anchor_type              text not null check (anchor_type in (
    'topic',
    'emotion',
    'fact',
    'interpretation',
    'unknown',
    'constraint_fixed',
    'constraint_influenceable',
    'constraint_actionable',
    'contradiction',
    'path'
  )),
  anchor_index             integer not null check (anchor_index >= 0),
  anchor_snapshot          jsonb not null check (jsonb_typeof(anchor_snapshot) = 'object'),
  status                   text not null default 'open'
    check (status in ('open', 'completed', 'safety_stopped')),
  summary                  jsonb,
  include_in_closure       boolean not null default false,
  include_in_next_version  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  completed_at             timestamptz,
  check (status <> 'completed' or jsonb_typeof(summary) = 'object'),
  check (
    status = 'completed'
    or (include_in_closure = false and include_in_next_version = false)
  )
);

create table if not exists reality_focus_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references reality_focus_sessions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'safety')),
  turn_no     integer not null check (turn_no between 1 and 3),
  client_key  text,
  content     jsonb not null check (jsonb_typeof(content) = 'object'),
  created_at  timestamptz not null default now(),
  check (
    (role = 'user' and client_key is not null and length(trim(client_key)) > 0)
    or (role <> 'user' and client_key is null)
  )
);

create unique index if not exists reality_focus_messages_role_turn_uniq
  on reality_focus_messages (session_id, role, turn_no);

create unique index if not exists reality_focus_messages_client_key_uniq
  on reality_focus_messages (session_id, client_key)
  where client_key is not null;

create index if not exists reality_focus_sessions_case_created
  on reality_focus_sessions (user_id, case_id, created_at desc);

create index if not exists reality_focus_sessions_next_version
  on reality_focus_sessions (user_id, case_id, include_in_next_version)
  where status = 'completed' and include_in_next_version = true;

create index if not exists reality_focus_messages_session_created
  on reality_focus_messages (session_id, turn_no, created_at);

alter table reality_focus_sessions enable row level security;
alter table reality_focus_messages enable row level security;

create or replace function reserve_reality_focus_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_question text,
  p_client_key text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session reality_focus_sessions%rowtype;
  v_existing_turn integer;
  v_turn integer;
  v_pending boolean;
begin
  select * into v_session
  from reality_focus_sessions
  where id = p_session_id
  for update;

  if v_session.id is null or v_session.user_id is distinct from p_user_id then
    raise exception '无权访问该聚焦探索';
  end if;

  select turn_no into v_existing_turn
  from reality_focus_messages
  where session_id = p_session_id
    and role = 'user'
    and client_key = p_client_key;
  if v_existing_turn is not null then
    return v_existing_turn;
  end if;

  if v_session.status <> 'open' then
    raise exception '该聚焦探索已经结束';
  end if;
  if coalesce(length(trim(p_question)), 0) = 0
    or length(trim(p_question)) > 2000
    or coalesce(length(trim(p_client_key)), 0) = 0 then
    raise exception '问题或幂等键无效';
  end if;

  select exists (
    select 1
    from reality_focus_messages u
    where u.session_id = p_session_id
      and u.role = 'user'
      and not exists (
        select 1
        from reality_focus_messages a
        where a.session_id = p_session_id
          and a.turn_no = u.turn_no
          and a.role in ('assistant', 'safety')
      )
  ) into v_pending;
  if v_pending then
    raise exception '上一轮AI回答尚未完成，请先重试';
  end if;

  select coalesce(max(turn_no), 0) + 1 into v_turn
  from reality_focus_messages
  where session_id = p_session_id
    and role = 'user';
  if v_turn > 3 then
    raise exception '聚焦探索最多三轮';
  end if;

  insert into reality_focus_messages (
    session_id, user_id, role, turn_no, client_key, content
  ) values (
    p_session_id,
    p_user_id,
    'user',
    v_turn,
    trim(p_client_key),
    jsonb_build_object('text', trim(p_question))
  );

  update reality_focus_sessions
  set updated_at = now()
  where id = p_session_id;

  return v_turn;
end;
$$;

create or replace function complete_reality_focus_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_turn_no integer,
  p_payload jsonb,
  p_is_final boolean,
  p_summary jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session reality_focus_sessions%rowtype;
  v_has_user boolean;
  v_has_answer boolean;
  v_should_finish boolean;
begin
  select * into v_session
  from reality_focus_sessions
  where id = p_session_id
  for update;
  if v_session.id is null or v_session.user_id is distinct from p_user_id then
    raise exception '无权访问该聚焦探索';
  end if;

  select exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id and role = 'user' and turn_no = p_turn_no
  ) into v_has_user;
  if not v_has_user then
    raise exception '该轮用户问题不存在';
  end if;

  select exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id
      and role in ('assistant', 'safety')
      and turn_no = p_turn_no
  ) into v_has_answer;
  if v_has_answer then
    return;
  end if;
  if v_session.status <> 'open' then
    raise exception '该聚焦探索已经结束';
  end if;

  v_should_finish := p_is_final or p_turn_no = 3;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or (v_should_finish and jsonb_typeof(p_summary) is distinct from 'object') then
    raise exception 'AI回答或摘要格式无效';
  end if;

  insert into reality_focus_messages (
    session_id, user_id, role, turn_no, content
  ) values (
    p_session_id, p_user_id, 'assistant', p_turn_no, p_payload
  );

  update reality_focus_sessions
  set status = case when v_should_finish then 'completed' else status end,
      summary = case when v_should_finish then p_summary else summary end,
      completed_at = case when v_should_finish then now() else completed_at end,
      updated_at = now()
  where id = p_session_id;
end;
$$;

create or replace function stop_reality_focus_for_safety(
  p_session_id uuid,
  p_user_id uuid,
  p_turn_no integer,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session reality_focus_sessions%rowtype;
begin
  select * into v_session
  from reality_focus_sessions
  where id = p_session_id
  for update;
  if v_session.id is null or v_session.user_id is distinct from p_user_id then
    raise exception '无权访问该聚焦探索';
  end if;
  if not exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id and role = 'user' and turn_no = p_turn_no
  ) then
    raise exception '该轮用户问题不存在';
  end if;
  if exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id
      and role in ('assistant', 'safety')
      and turn_no = p_turn_no
  ) then
    return;
  end if;

  insert into reality_focus_messages (
    session_id, user_id, role, turn_no, content
  ) values (
    p_session_id, p_user_id, 'safety', p_turn_no, p_payload
  );

  update reality_focus_sessions
  set status = 'safety_stopped',
      include_in_closure = false,
      include_in_next_version = false,
      completed_at = now(),
      updated_at = now()
  where id = p_session_id;
end;
$$;

-- Serializes version creation per case so a completed exploration can be
-- consumed by at most one later map, even when two requests finish together.
create or replace function insert_reality_version_with_focus(
  p_user_id uuid,
  p_case_id uuid,
  p_previous_version_id uuid,
  p_map jsonb,
  p_delta jsonb,
  p_focus_session_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id uuid;
  v_latest_id uuid;
  v_latest_no integer;
  v_version_id uuid;
  v_requested_count integer;
  v_unique_count integer;
  v_valid_count integer;
begin
  select id into v_case_id
  from reality_cases
  where id = p_case_id and user_id = p_user_id
  for update;
  if v_case_id is null then
    raise exception '现状课题不存在或无权访问';
  end if;

  select id, version_no into v_latest_id, v_latest_no
  from reality_versions
  where case_id = p_case_id
  order by version_no desc
  limit 1;
  if v_latest_id is distinct from p_previous_version_id then
    raise exception '现状地图已产生新版本，请重试';
  end if;

  select count(*), count(distinct item)
  into v_requested_count, v_unique_count
  from unnest(coalesce(p_focus_session_ids, '{}'::uuid[])) as item;
  if v_requested_count <> v_unique_count then
    raise exception '聚焦探索引用重复';
  end if;

  select count(*) into v_valid_count
  from reality_focus_sessions
  where id = any(coalesce(p_focus_session_ids, '{}'::uuid[]))
    and user_id = p_user_id
    and case_id = p_case_id
    and status = 'completed'
    and include_in_next_version = true;
  if v_valid_count <> v_requested_count then
    raise exception '聚焦探索引用无效或无权访问';
  end if;

  if exists (
    select 1
    from reality_versions
    where case_id = p_case_id
      and focus_session_ids && coalesce(p_focus_session_ids, '{}'::uuid[])
  ) then
    raise exception '聚焦探索已被其他版本引用，请重试';
  end if;

  insert into reality_versions (
    case_id,
    previous_version_id,
    version_no,
    map,
    delta,
    focus_session_ids
  ) values (
    p_case_id,
    v_latest_id,
    coalesce(v_latest_no, 0) + 1,
    p_map,
    p_delta,
    coalesce(p_focus_session_ids, '{}'::uuid[])
  )
  returning id into v_version_id;

  return v_version_id;
end;
$$;

revoke all on function reserve_reality_focus_turn(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function reserve_reality_focus_turn(uuid, uuid, text, text) to service_role;

revoke all on function complete_reality_focus_turn(uuid, uuid, integer, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function complete_reality_focus_turn(uuid, uuid, integer, jsonb, boolean, jsonb) to service_role;

revoke all on function stop_reality_focus_for_safety(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function stop_reality_focus_for_safety(uuid, uuid, integer, jsonb) to service_role;

revoke all on function insert_reality_version_with_focus(uuid, uuid, uuid, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function insert_reality_version_with_focus(uuid, uuid, uuid, jsonb, jsonb, uuid[]) to service_role;

-- =============================================================
-- from migrations/015_ai_reliability.sql
-- =============================================================

-- AI reliability diagnostics.
-- Stores encrypted request/response payloads for short-term debugging only.

create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  request_id text not null unique,
  operation text not null,
  module text not null default 'unknown',
  entity_type text,
  entity_id uuid,
  prompt_version text not null default 'v1',
  model text not null,
  output_mode text not null check (output_mode in ('text', 'json')),
  timeout_ms integer not null,
  status text not null check (status in ('running', 'success', 'failed')),
  error_code text,
  error_message text,
  duration_ms integer,
  encrypted_request_payload text,
  request_metadata_only boolean not null default false,
  expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_call_attempts (
  id uuid primary key default gen_random_uuid(),
  ai_call_id uuid not null references public.ai_calls(id) on delete cascade,
  attempt_no integer not null check (attempt_no in (1, 2)),
  purpose text not null check (purpose in ('primary', 'repair')),
  status text not null check (status in ('success', 'failed')),
  duration_ms integer,
  encrypted_response_payload text,
  response_metadata_only boolean not null default false,
  validation_errors text[],
  created_at timestamptz not null default now(),
  unique (ai_call_id, attempt_no)
);

create index if not exists ai_calls_user_created_idx
  on public.ai_calls(user_id, created_at desc);

create index if not exists ai_calls_expires_idx
  on public.ai_calls(expires_at);

alter table public.ai_calls enable row level security;
alter table public.ai_call_attempts enable row level security;

drop policy if exists "Users can read own AI calls" on public.ai_calls;
create policy "Users can read own AI calls"
  on public.ai_calls for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own AI calls" on public.ai_calls;
create policy "Users can delete own AI calls"
  on public.ai_calls for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own AI call attempts" on public.ai_call_attempts;
create policy "Users can read own AI call attempts"
  on public.ai_call_attempts for select
  using (
    exists (
      select 1
      from public.ai_calls c
      where c.id = ai_call_attempts.ai_call_id
        and c.user_id = auth.uid()
    )
  );

create or replace function public.purge_expired_ai_calls()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.ai_calls
  where expires_at < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- =============================================================
-- from migrations/016_knowledge_base.sql
-- =============================================================

-- 知识库 + 公司档案

-- ── 知识卡片 ─────────────────────────────────────────────────────────────────

create table if not exists knowledge_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  card_type   text not null
    check (card_type in ('market', 'customer', 'judgment', 'domain')),
  tags        text[] not null default '{}',
  source_type text not null default 'manual'
    check (source_type in ('manual', 'extracted')),
  source_ref  uuid,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_knowledge_cards_user
  on knowledge_cards (user_id, created_at desc)
  where archived_at is null;

alter table knowledge_cards enable row level security;

create policy "knowledge_cards_owner" on knowledge_cards
  for all using (auth.uid() = user_id);

-- ── 公司档案 ──────────────────────────────────────────────────────────────────

create table if not exists companies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  company_type text not null
    check (company_type in ('prospect', 'customer', 'both')),
  ceo_notes    text not null default '',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_companies_user
  on companies (user_id, updated_at desc)
  where archived_at is null;

alter table companies enable row level security;

create policy "companies_owner" on companies
  for all using (auth.uid() = user_id);

-- ── 公司大事记 ────────────────────────────────────────────────────────────────

create table if not exists company_events (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies (id) on delete cascade,
  year           int,
  description    text not null,
  related_party  text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_company_events_company
  on company_events (company_id, year asc nulls last);

alter table company_events enable row level security;

create policy "company_events_owner" on company_events
  for all using (
    exists (
      select 1 from companies c
      where c.id = company_events.company_id and c.user_id = auth.uid()
    )
  );

-- ── 公司想法/备注 ─────────────────────────────────────────────────────────────

create table if not exists company_notes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  content    text not null,
  idea_id    uuid references ideas (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_notes_company
  on company_notes (company_id, created_at desc);

alter table company_notes enable row level security;

create policy "company_notes_owner" on company_notes
  for all using (
    exists (
      select 1 from companies c
      where c.id = company_notes.company_id and c.user_id = auth.uid()
    )
  );

-- =============================================================
-- from migrations/017_outreach_strategies.sql
-- =============================================================

-- 触达策略：合并假设/客户代理/知识卡片生成可操作的 Go-to-Market 计划

create table if not exists outreach_strategies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  idea_id     uuid references ideas (id) on delete cascade,
  company_id  uuid references companies (id) on delete cascade,
  use_case    text not null check (use_case in ('idea_validation', 'job_search')),
  strategy    jsonb not null,
  created_at  timestamptz not null default now(),
  constraint outreach_has_target check (idea_id is not null or company_id is not null)
);

create index if not exists idx_outreach_strategies_idea
  on outreach_strategies (idea_id, created_at desc);

create index if not exists idx_outreach_strategies_company
  on outreach_strategies (company_id, created_at desc);

alter table outreach_strategies enable row level security;

create policy "outreach_owner" on outreach_strategies
  for all using (auth.uid() = user_id);

-- =============================================================
-- from migrations/018_outreach_canvas.sql
-- =============================================================

-- 触达规划画布：用户主动思考四维框架，AI 扮演挑战者

create table if not exists outreach_canvases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  use_case      text not null check (use_case in (
                  'startup', 'job', 'product', 'self', 'persuasion', 'other')),
  scenario      text not null default '',
  source_id     uuid,
  source_type   text check (source_type in ('idea', 'company')),
  person_notes  text not null default '',
  place_notes   text not null default '',
  time_notes    text not null default '',
  message_draft text not null default '',
  ai_challenges jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_outreach_canvases_user
  on outreach_canvases (user_id, updated_at desc);

alter table outreach_canvases enable row level security;

create policy "canvas_owner" on outreach_canvases
  for all using (auth.uid() = user_id);

-- =============================================================
-- from migrations/019_first_principles.sql
-- =============================================================

create table first_principles_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references ideas(id) on delete cascade,
  original_claim text not null,
  context_note text not null default '',
  restated_belief text not null default '',
  bedrock_summary text not null default '',
  weakest_links jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table first_principles_nodes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references first_principles_sessions(id) on delete cascade,
  claim text not null,
  basis_type text not null check (basis_type in (
    'bedrock','data_backed','personal_experience',
    'industry_consensus','media_narrative','pure_assumption'
  )),
  basis_note text not null,
  challenge text not null,
  depth int not null check (depth between 1 and 3),
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table first_principles_sessions enable row level security;
alter table first_principles_nodes enable row level security;

create policy "fp_session_owner" on first_principles_sessions
  for all using (auth.uid() = user_id);

create policy "fp_node_owner" on first_principles_nodes
  for all using (
    session_id in (
      select id from first_principles_sessions where user_id = auth.uid()
    )
  );

-- =============================================================
-- from migrations/020_outside_view.sql
-- =============================================================

create table outside_view_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references ideas(id) on delete cascade,
  plan_text text not null,
  context_note text not null default '',
  reference_class_label text not null default '',
  dominant_pattern text not null default '',
  dominant_cause text not null default '',
  prevalence_bucket text not null default 'many'
    check (prevalence_bucket in ('most','many','some','few')),
  user_distinctions text not null default '',
  pushback_note text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outside_view_examples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references outside_view_sessions(id) on delete cascade,
  label text not null,
  outcome_note text not null,
  is_well_known boolean not null default true,
  ordinal int not null default 0,
  created_at timestamptz not null default now()
);

create table outside_view_checks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references outside_view_sessions(id) on delete cascade,
  check_text text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table outside_view_sessions enable row level security;
alter table outside_view_examples enable row level security;
alter table outside_view_checks enable row level security;

create policy "ov_session_owner" on outside_view_sessions
  for all using (auth.uid() = user_id);

create policy "ov_example_owner" on outside_view_examples
  for all using (
    session_id in (
      select id from outside_view_sessions where user_id = auth.uid()
    )
  );

create policy "ov_check_owner" on outside_view_checks
  for all using (
    session_id in (
      select id from outside_view_sessions where user_id = auth.uid()
    )
  );

-- =============================================================
-- from migrations/021_advisory_council.sql
-- =============================================================

create table council_personas (
  key text primary key,
  display_name text not null,
  is_builtin boolean not null default true,
  grounding_note text not null,
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint council_persona_custom_needs_owner
    check (is_builtin or owner_user_id is not null)
);

create table council_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references ideas(id) on delete cascade,
  title text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table council_session_personas (
  session_id uuid not null references council_sessions(id) on delete cascade,
  persona_key text not null references council_personas(key) on delete restrict,
  turns_since_last_spoke int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (session_id, persona_key)
);

create table council_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references council_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','persona')),
  persona_key text references council_personas(key),
  grounded_reference text not null default '',
  content text not null,
  sharpest_question text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint council_message_persona_role_check check (
    (role = 'user' and persona_key is null) or (role = 'persona' and persona_key is not null)
  )
);

create unique index idx_council_message_idempotency
  on council_messages (session_id, idempotency_key) where idempotency_key is not null;
create index idx_council_messages_session on council_messages (session_id, created_at);
create index idx_council_sessions_user on council_sessions (user_id, updated_at desc);

alter table council_personas enable row level security;
alter table council_sessions enable row level security;
alter table council_session_personas enable row level security;
alter table council_messages enable row level security;

create policy "council_persona_read_builtin_or_own" on council_personas
  for select using (is_builtin or owner_user_id = auth.uid());

create policy "council_persona_owner_write" on council_personas
  for insert with check (not is_builtin and owner_user_id = auth.uid());

create policy "council_persona_owner_update" on council_personas
  for update using (not is_builtin and owner_user_id = auth.uid());

create policy "council_persona_owner_delete" on council_personas
  for delete using (not is_builtin and owner_user_id = auth.uid());

create policy "council_session_owner" on council_sessions
  for all using (auth.uid() = user_id);

create policy "council_session_persona_owner" on council_session_personas
  for all using (
    session_id in (select id from council_sessions where user_id = auth.uid())
  );

create policy "council_message_owner" on council_messages
  for all using (auth.uid() = user_id);

insert into council_personas (key, display_name, is_builtin, grounding_note) values
  ('sunzi', '孙子', true,
   '《孙子兵法》：知己知彼，百战不殆；五事（道天地将法）——先判断根本条件是否具备，再谈具体打法；未战先算胜负，重视先胜后战而非边打边看。'),
  ('mao', '毛泽东', true,
   '实事求是；没有调查就没有发言权；矛盾论——抓主要矛盾和矛盾的主要方面，不要在次要问题上纠缠；群众路线——真实情况在一线，不在会议室。'),
  ('gates', '比尔·盖茨', true,
   '软件/平台护城河思维——先想清楚什么会形成难以复制的壁垒；"你最不满意的客户是你最大的学习来源"，重视负面反馈胜过正面反馈；长期主义的技术判断。'),
  ('munger', '查理·芒格', true,
   '多元思维模型——单一学科视角容易被误导；反过来想（逆向思维）——先想清楚怎样会失败，再避免那样做；能力圈原则——诚实划清自己真正懂的范围。'),
  ('drucker', '彼得·德鲁克', true,
   '"企业的目的是创造顾客"，而不是利润本身；管理者五个自问——我们的顾客是谁、顾客认为的价值是什么、我们的成果是什么、我们的计划是什么；重视成果而非活动量。'),
  ('christensen', '克莱顿·克里斯坦森', true,
   '颠覆式创新理论——新进入者常常从被忽视的低端或非消费市场切入；Jobs-to-be-Done框架——顾客"雇用"产品来完成一件具体任务，要问清楚那件任务是什么，而不是问顾客想要什么功能。'),
  ('graham', '保罗·格雷厄姆', true,
   'Make Something People Want——先确认真的有人需要，再谈规模；"先做不可规模化的事"——早期阶段应该亲自、笨拙地手动服务好第一批用户，而不是急于自动化。'),
  ('taleb', '纳西姆·塔勒布', true,
   '反脆弱——关注在不确定性中会变得更强还是更弱，而不是只关注平均情形；黑天鹅——警惕依赖"历史上没发生过"作为不会发生的证据；非对称风险（skin in the game）——问清楚谁在真正承担下行代价。');

-- =============================================================
-- from migrations/022_internal_business_plan.sql
-- =============================================================

-- Internal business plan imports.
-- Raw workbooks never enter Storage; only user-confirmed, redacted JSON chunks do.

do $$
begin
  if to_regclass('public.reality_case_sources') is null then
    raise exception
      '022_internal_business_plan requires 005_reality_system first';
  end if;
end
$$;

create table if not exists own_company_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists business_plan_imports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  profile_id          uuid not null references own_company_profiles (id) on delete cascade,
  version_no          integer not null check (version_no > 0),
  status              text not null check (
    status in (
      'uploading',
      'extracting',
      'awaiting_confirmation',
      'completed',
      'failed'
    )
  ),
  file_name           text not null,
  file_size           integer not null check (file_size between 1 and 10485760),
  workbook_hash       text not null,
  visible_sheet_count integer not null check (visible_sheet_count > 0),
  chunk_count         integer not null check (chunk_count > 0),
  previous_import_id  uuid references business_plan_imports (id) on delete set null,
  error_code          text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  unique (profile_id, version_no),
  unique (user_id, workbook_hash)
);

create table if not exists business_plan_chunks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  import_id         uuid not null references business_plan_imports (id) on delete cascade,
  sheet_name        text not null,
  cell_range        text not null,
  ordinal           integer not null check (ordinal >= 0),
  storage_path      text not null unique,
  content_hash      text not null,
  row_count         integer not null check (row_count > 0),
  column_count      integer not null check (column_count > 0),
  compressed_size integer not null check (compressed_size between 1 and 2097152),
  extraction_status text not null default 'pending' check (
    extraction_status in ('pending', 'processing', 'completed', 'failed')
  ),
  error_code        text,
  created_at        timestamptz not null default now(),
  unique (import_id, ordinal)
);

-- Keep the migration safe to rerun if an earlier draft created the table.
alter table business_plan_chunks
  add column if not exists compressed_size integer not null default 1;
alter table business_plan_chunks
  alter column compressed_size drop default;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.business_plan_chunks'::regclass
      and conname = 'business_plan_chunks_compressed_size_check'
  ) then
    alter table business_plan_chunks
      add constraint business_plan_chunks_compressed_size_check
      check (compressed_size between 1 and 2097152);
  end if;
end
$$;

create table if not exists business_plan_supplier_aliases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name_hmac  text not null,
  alias      text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name_hmac),
  unique (user_id, alias)
);

create table if not exists business_plan_extractions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  import_id   uuid not null references business_plan_imports (id) on delete cascade,
  chunk_id    uuid not null unique references business_plan_chunks (id) on delete cascade,
  facts       jsonb not null default '[]'::jsonb,
  plans       jsonb not null default '[]'::jsonb,
  forecasts   jsonb not null default '[]'::jsonb,
  cost_items  jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  risks       jsonb not null default '[]'::jsonb,
  unknowns    jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists business_plan_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  import_id             uuid not null unique references business_plan_imports (id) on delete cascade,
  summary               jsonb not null,
  strategy              jsonb not null,
  financial_outlook     jsonb not null,
  cost_structure        jsonb not null,
  selling_general_admin jsonb not null,
  assumptions           jsonb not null,
  risks                 jsonb not null,
  unknowns              jsonb not null,
  source_refs           jsonb not null,
  delta                 jsonb,
  created_at            timestamptz not null default now()
);

create table if not exists business_plan_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  import_id   uuid not null references business_plan_imports (id) on delete cascade,
  question    text not null check (char_length(question) between 1 and 2000),
  answer      jsonb not null,
  source_refs jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_business_plan_imports_profile
  on business_plan_imports (profile_id, version_no desc);
create index if not exists idx_business_plan_imports_user_status
  on business_plan_imports (user_id, status, created_at desc);
create index if not exists idx_business_plan_chunks_import
  on business_plan_chunks (import_id, ordinal);
create index if not exists idx_business_plan_chunks_pending
  on business_plan_chunks (import_id, extraction_status, ordinal);
create index if not exists idx_business_plan_extractions_import
  on business_plan_extractions (import_id);
create index if not exists idx_business_plan_questions_import
  on business_plan_questions (import_id, created_at desc);

alter table own_company_profiles enable row level security;
alter table business_plan_imports enable row level security;
alter table business_plan_chunks enable row level security;
alter table business_plan_supplier_aliases enable row level security;
alter table business_plan_extractions enable row level security;
alter table business_plan_snapshots enable row level security;
alter table business_plan_questions enable row level security;

drop policy if exists "own_company_profiles_owner" on own_company_profiles;
create policy "own_company_profiles_owner"
  on own_company_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_imports_owner" on business_plan_imports;
create policy "business_plan_imports_owner"
  on business_plan_imports for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_chunks_owner" on business_plan_chunks;
create policy "business_plan_chunks_owner"
  on business_plan_chunks for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_supplier_aliases_owner"
  on business_plan_supplier_aliases;
create policy "business_plan_supplier_aliases_owner"
  on business_plan_supplier_aliases for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_extractions_owner"
  on business_plan_extractions;
create policy "business_plan_extractions_owner"
  on business_plan_extractions for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_snapshots_owner"
  on business_plan_snapshots;
create policy "business_plan_snapshots_owner"
  on business_plan_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_questions_owner"
  on business_plan_questions;
create policy "business_plan_questions_owner"
  on business_plan_questions for select
  using (auth.uid() = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'internal-business-plans',
  'internal-business-plans',
  false,
  2097152,
  array['application/json', 'application/gzip']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "internal_business_plans_select_own"
  on storage.objects;
create policy "internal_business_plans_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "internal_business_plans_insert_own"
  on storage.objects;
create policy "internal_business_plans_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "internal_business_plans_update_own"
  on storage.objects;
create policy "internal_business_plans_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "internal_business_plans_delete_own"
  on storage.objects;
create policy "internal_business_plans_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

alter table reality_case_sources
  add column if not exists business_plan_snapshot_id uuid
    references business_plan_snapshots (id) on delete set null;

alter table reality_case_sources
  drop constraint if exists reality_case_sources_parent_check;

alter table reality_case_sources
  add constraint reality_case_sources_parent_check
  check (
    num_nonnulls(
      observation_id,
      idea_id,
      validation_id,
      prediction_id,
      business_plan_snapshot_id
    ) <= 1
  );

create index if not exists idx_reality_sources_business_plan
  on reality_case_sources (business_plan_snapshot_id)
  where business_plan_snapshot_id is not null;

-- =============================================================
-- from migrations/023_discipline_personas.sql
-- =============================================================

-- 学科方法论顾问：新增8位各学科领域大拿，并给人物库加分组字段。
-- 只收录有明确公开出处的原则；出处存疑的流传语录一律不收
-- （如戴明那句"In God we trust; all others must bring data"出处有争议，未收录）。

alter table council_personas
  add column if not exists category text not null default '自定义';

update council_personas set category = '商业与战略'
  where is_builtin and category = '自定义';

insert into council_personas (key, display_name, is_builtin, category, grounding_note) values
  ('feynman', '理查德·费曼', true, '学科方法论',
'物理学家费曼公开记录的核心方法论：
- "第一原则是你绝不能欺骗自己——而你自己恰恰是最容易被骗的人"（1974年加州理工毕业演讲《草包族科学》）。
- 草包族科学（cargo cult science）：形式上像科学（有数据、有术语、有流程），但缺少那种"把可能推翻自己结论的信息全部主动摆出来"的诚实。
- "凡是我不能创造的，我就不理解"（What I cannot create, I do not understand，他黑板上的遗言）——能从零推导/重建出来才算真懂。
- 知道一个东西的名字和知道这个东西本身是两回事（来自他父亲的教导）——会说术语不等于理解机制。
- "科学是对专家无知的信仰"（1966年演讲《什么是科学》）——权威说的也要能被检验。
- "不管你的理论多漂亮，不管你多聪明——只要和实验不符，它就是错的"（其物理学讲义）。
- 用最简单的语言向外行解释清楚，是检验自己是否真懂的方法。'),

  ('kahneman', '丹尼尔·卡尼曼', true, '学科方法论',
'诺贝尔经济学奖得主卡尼曼（《思考，快与慢》《噪声》）的核心方法论：
- 系统1与系统2：直觉快速但充满系统性偏差，遇到重要判断要刻意切换到慢思考。
- WYSIATI（所见即全部）：人会基于手头有限的信息编出连贯的故事，并对故事的完整性毫无察觉——先问"我没看到什么"。
- 规划谬误与外部视角：人对自己的项目系统性乐观；解药是参照类别预测——先看同类项目的实际基率，再谈自己的特殊性。
- 损失厌恶与前景理论：损失带来的痛苦约是同等收益快乐的两倍，这扭曲几乎所有决策。
- 锚定效应：先出现的数字会拖拽后续所有估计，即使明知它无关。
- 事前验尸（premortem，他推崇的Gary Klein方法）：假设一年后项目已经失败了，每人写下失败的原因——在决策前把反对意见合法化。
- 峰终定律：人对体验的记忆由峰值和结尾决定，而不是平均值。
- 噪声：同一问题不同人（甚至同一人不同时间）的判断差异巨大，且组织对此毫无察觉——重要判断需要独立多次评估再汇总。'),

  ('popper', '卡尔·波普尔', true, '学科方法论',
'科学哲学家波普尔（《猜想与反驳》《科学发现的逻辑》）的核心方法论：
- 可证伪性：一个理论是否科学，看它是否明确说出了"什么情况发生就算我错了"——不能被任何观察推翻的理论没有经验内容。
- 猜想与反驳：知识的增长方式是大胆猜想+严格反驳，而不是从数据里归纳出真理。
- 归纳问题：再多的白天鹅也证明不了"所有天鹅都是白的"，一只黑天鹅就能推翻它——证实和证伪是不对称的。
- 寻找证实太容易了：几乎任何理论都能找到"支持案例"，有价值的检验是那些真有风险推翻理论的检验。
- 渐进式工程 vs 乌托邦式工程：大规模一次性重构不可检验也不可纠错，小步修改+快速反馈才能从错误中学习。
- "我可能错，你可能对，通过共同努力，我们可以更接近真理"——理性讨论的前提。
- 真正该问的不是"这个想法有多少证据支持"，而是"我做过什么认真的尝试去推翻它"。'),

  ('meadows', '德内拉·梅多斯', true, '学科方法论',
'系统科学家梅多斯（《系统之美/Thinking in Systems》、增长的极限主要作者）的核心方法论：
- 系统行为由结构决定：反复出现的问题几乎从不是"人的问题"，而是结构的问题——换人不换结构，问题会复发。
- 存量与流量：看清什么是存量（积累的东西）、什么是流入流出，存量的变化永远滞后于流量的变化。
- 反馈回路：增强回路让事物指数增长/崩塌，调节回路把系统拉回目标——找出主导回路，就能预判系统行为。
- 延迟：反馈有延迟的系统必然震荡（招聘、库存、产能都是），对延迟信号做即时反应会放大震荡。
- 杠杆点有层级：调参数（预算、人数）是最弱的干预；改信息流、改规则更强；改系统目标和范式最强——大多数人在最弱的杠杆上用力。
- 目标侵蚀：绩效变差时人会悄悄下调目标（"现状也还行"），形成温水煮青蛙的漂移。
- 系统的真实目的要从它的行为推断，而不是听它宣称的目标。
- 政策阻力：多方各自拉锯时系统会卡死在没人满意的状态，解法不是更用力拉，而是重新对齐各方目标。'),

  ('hayek', '弗里德里希·哈耶克', true, '学科方法论',
'诺贝尔经济学奖得主哈耶克的核心方法论：
- 知识在社会中的运用（1945）：决策所需的知识分散在无数个体的头脑里，且大量是"特定时间和地点的知识"，任何中央计划者都无法聚合——所以要问：这个决定该由掌握一线知识的人做，还是由离信息最远的人做？
- 价格是信息信号：价格压缩了无数人的局部知识，愿不愿意真金白银付钱，比任何调研问卷都诚实。
- 自发秩序：很多有效的秩序（语言、市场、惯例）不是设计出来的，是演化出来的——不要把"没人设计"误认为"没有秩序"。
- 知识的僭妄（1974年诺贝尔演讲）：社会科学最大的危险是假装知道自己无法知道的东西，用精确的数字包装根本测不准的判断。
- 竞争是发现程序：谁的方案更好，事先谁也不知道，只有让方案在真实环境中竞争才能"发现"答案——所以答案不是想出来的，是试出来的。
- 理性的自负：越复杂的系统，越不可能被单个头脑完整理解和规划。'),

  ('darwin', '查尔斯·达尔文', true, '学科方法论',
'达尔文（《物种起源》、自传）的核心方法论：
- 变异+选择+遗传：进化是一个算法——产生足够多的变体，让环境淘汰，保留并复制胜出者；没有变异量就没有进化。
- 黄金法则（他自传中自述）：一旦遇到与自己理论相矛盾的事实，立刻记下来——因为他发现不利的事实比有利的事实从记忆里溜走得快得多。
- 渐变的力量：微小的优势经过足够多代的积累会产生质变，不要轻视每一代只有百分之几的改进。
- 适应是相对于环境的：没有"绝对最优"的物种，只有更适应当前生态位的物种——环境一变，昨天的优势就是今天的包袱。
- 先大量收集事实，再形成理论：他为一个论点收集了二十多年证据（藤壶研究八年）才出版——结论的分量来自证据的分量。
- 生态位思维：正面竞争不是唯一出路，找到没有被占据的生态位本身就是生存策略。'),

  ('deming', '爱德华兹·戴明', true, '学科方法论',
'质量管理之父戴明（《转危为安/Out of the Crisis》）的核心方法论：
- 94%的问题属于系统，只有6%属于个人（他的原话是绝大多数问题源于系统）——追究个人之前先检查流程和结构。
- 理解变异：区分共同原因（系统固有的正常波动）和特殊原因（真实的异常信号）——对正常波动做出反应（tampering）只会让系统更糟；这次数据比上次好/差，多数时候什么都说明不了。
- PDSA循环（Plan-Do-Study-Act）：小规模试验→研究结果→再决定推广还是调整，而不是一次性全面铺开。
- 深邃知识系统：理解系统、理解变异、知识理论（预测才算知识）、心理学——四者缺一不可。
- 驱除恐惧：在有恐惧的组织里，上报的数据必然是假的——人会先保护自己再报告真相。
- 质量是设计进去的，不是检验出来的：靠事后检查来保证质量，成本最高且最不可靠。
- 目标口号无用：只喊目标不改系统，等于要求员工做到系统做不到的事。'),

  ('aurelius', '马可·奥勒留', true, '学科方法论',
'罗马皇帝、斯多葛哲学家马可·奥勒留（《沉思录》）的核心方法论：
- 控制二分：把注意力严格区分为"取决于我的"（我的判断、选择、行动）和"不取决于我的"（结果、他人、外部事件）——把情绪和精力只投在前者上。
- 障碍即道路："行动的障碍会推进行动，挡路的东西会成为路"（《沉思录》5.20）——阻碍本身包含着新的行动材料。
- 伤害你的是你对事情的判断，不是事情本身："如果你因外物痛苦，痛苦不是来自外物，而是来自你对它的估价——而你有权随时撤销这个估价"（8.47）。
- 负面预演：清晨先预想今天会遇到的阻碍和难缠的人（2.1）——预先想过的困难失去大半杀伤力。
- 从高处俯瞰（view from above）：把当下的烦恼放到更长的时间和更大的空间里看，检验它是否还值得这份情绪。
- 只做眼前这一步：像罗马人那样，专注地、不敷衍地做好手头这一件事，仿佛它是最后一件。
- 每天检省：行动是否符合自己的原则，而不是是否得到了想要的结果。')
on conflict (key) do nothing;

-- =============================================================
-- from migrations/024_persona_grounding_v2.sql
-- =============================================================

-- 扩充8位内置顾问的方法论依据：从一两句话扩成核对过的原则清单，
-- 缩小 AI 自由发挥的空间。只收录有明确出处、被广泛记录的原则。

update council_personas set grounding_note =
'《孙子兵法》核心方法论：
- 五事七计（道、天、地、将、法）：开战前先比较双方基本面，庙算多者胜——先判断根本条件是否具备，再谈具体打法。
- 知己知彼，百战不殆；不知彼而知己，一胜一负；不知彼不知己，每战必殆——对对手和环境的无知是最大的风险来源。
- 先胜而后求战：胜兵先胜而后求战，败兵先战而后求胜——先创造赢的条件再行动，而不是先行动再想办法赢。
- 不战而屈人之兵，善之善者也；上兵伐谋，其次伐交，其次伐兵，其下攻城——正面消耗战是最差的选择。
- 避实击虚，以正合、以奇胜——攻击对手薄弱处，不在对手最强的地方硬碰。
- 智者之虑，必杂于利害——判断任何事必须同时权衡利与害两面，只看到利的分析是不完整的。
- 兵闻拙速，未睹巧之久也——久拖不决的消耗极其危险，快速的笨办法胜过缓慢的巧办法。
- 用间：先知者不可取于鬼神，必取于人——真实情报只能来自真实的人，不能靠猜测和推演。'
where key = 'sunzi' and is_builtin;

update council_personas set grounding_note =
'毛泽东公开著作中的核心方法论：
- 实事求是：从实际出发研究事物的内部联系，而不是从定义、书本、愿望出发。
- 没有调查，就没有发言权（《反对本本主义》）——不做实地调查就下结论，是最常见的错误来源。
- 《矛盾论》：抓主要矛盾和矛盾的主要方面——事情千头万绪时，找到那个决定其他一切的核心矛盾；具体问题具体分析，反对一刀切。
- 《实践论》：实践是检验真理的标准；认识从实践中来，还要回到实践中去检验。
- 《论持久战》：既反对速胜论也反对失败论，靠的是对双方力量对比及其阶段性变化的具体分析，而不是情绪。
- 集中优势兵力，各个歼灭敌人；不打无准备之仗，不打无把握之仗——资源劣势方更不能分散力量。
- 农村包围城市：在强敌力量薄弱的地方建立根据地，积蓄力量，而不是在敌人最强的地方决战。
- 群众路线：从群众中来，到群众中去——真实情况和真正的智慧在一线，不在会议室。
- 战略上藐视敌人，战术上重视敌人——方向上有信心，每一步具体执行上高度谨慎。'
where key = 'mao' and is_builtin;

update council_personas set grounding_note =
'比尔·盖茨公开记录的核心方法论：
- 平台与生态思维：让大量第三方在你的平台上赚钱，平台才有真正的护城河（Windows/Office生态的核心逻辑）——先想清楚什么会形成难以复制的壁垒。
- "你最不满意的客户是你最大的学习来源"（《未来时速》）——负面反馈的信息量远大于正面反馈，要主动追着抱怨走。
- "我们总是高估未来两年内的变化，而低估未来十年的变化"——判断时间尺度错了，正确的方向也会做成错误的生意。
- 软件的边际成本趋近于零——真正的规模效应来自一次开发、无限复制，判断一门生意先看它的成本结构。
- Think Week：定期完全抽离日常运营，用整块时间深度阅读和思考——重大判断不能在日常琐碎中做出。
- Content is King（1996年文章）：平台价值最终由其上的内容/应用决定。
- 顶尖人才的非线性价值："一个优秀的车床操作员工资是普通人的几倍，而一个优秀的软件工程师的价值是普通工程师的一万倍"。'
where key = 'gates' and is_builtin;

update council_personas set grounding_note =
'查理·芒格公开记录的核心方法论：
- 多元思维模型（lattice of mental models）：只用单一学科的视角看问题必然被误导——"手里拿着锤子的人，看什么都像钉子"。
- 逆向思维：Invert, always invert——"我只想知道我将来会死在哪里，这样我就永远不去那儿"；先想清楚怎样必然失败，然后避开。
- 能力圈：清楚划定自己真正懂的范围，并诚实地待在里面——知道自己不知道什么，比聪明更重要。
- 人类误判心理学（25种心理倾向）：激励引起的偏见（"别问理发师你需不需要理发"）、社会认同、承诺与一致性倾向、避免怀疑倾向、过度乐观等——判断前先检查自己正在被哪种倾向影响。
- Lollapalooza效应：多种心理倾向朝同一方向共同作用时，会产生极端的非线性结果。
- 检查清单：重大决策必须过一遍清单，靠天赋和感觉必然遗漏。
- "如果你不能比对方更有力地反驳你自己的观点，你就没资格持有这个观点。"
- 耐心与低频决策：机会不常有，绝大部分时间应该什么都不做，等待明显的好机会（fat pitch）再重仓行动。'
where key = 'munger' and is_builtin;

update council_personas set grounding_note =
'彼得·德鲁克公开著作中的核心方法论：
- "企业的目的只有一个有效的定义：创造顾客"——利润是结果和约束条件，不是目的。
- 企业只有两个基本职能：营销和创新，其余都是成本。
- 经典五问：我们的使命是什么？我们的顾客是谁？顾客重视的是什么（顾客认为的价值）？我们追求的成果是什么？我们的计划是什么？——大多数组织答不出第二、三问。
- 顾客买的从来不是产品本身，而是产品满足的需求——顾客认为的价值，几乎从不等于生产者以为的价值。
- 效率与效果之分：Doing things right ≠ doing the right things——没有什么比高效地做根本不该做的事更无用。
- 系统性放弃（systematic abandonment）：定期问"如果我们现在还没做这件事，以今天所知，我们还会开始做吗？"——答案是否，就该停掉，无论沉没成本多大。
- 衡量成果而非活动量：忙碌不等于产出，要问的是"我们的成果是什么"。
- 知识工作者的自我管理：发挥长处而不是弥补短板，把人放在能产出成果的位置上。'
where key = 'drucker' and is_builtin;

update council_personas set grounding_note =
'克莱顿·克里斯坦森公开著作中的核心方法论：
- 颠覆式创新（《创新者的窘境》）：颠覆者从低端市场或"非消费"人群切入，产品在主流指标上更差、但在新维度（更便宜/更方便/更简单）上更好，然后逐步向上侵蚀主流市场。
- 延续性创新与破坏性创新的区分：在位企业几乎总能赢下延续性竞争，却系统性地输掉破坏性竞争。
- 好管理恰恰是失败的原因：认真听最好的客户的话、把资源投给回报率最高的项目——这些"正确"决策会让企业系统性忽视低端和新市场。
- Jobs to be Done：顾客不是"购买"产品，而是"雇用"产品来完成一项具体任务——奶昔案例：不要问顾客的年龄性别，要问"他雇这杯奶昔来干什么活"。
- 资源-流程-价值观（RPV）框架：组织的能力同时定义了组织的无能——现有流程和价值观决定了它做不了什么。
- 应对破坏性威胁要设独立小组织：在主组织内部做破坏性业务几乎必然失败。
- 边际思维的陷阱（《你要如何衡量你的人生》）：100%的坚持比98%的坚持更容易——"就这一次"的边际成本分析会把人引向全成本的灾难。'
where key = 'christensen' and is_builtin;

update council_personas set grounding_note =
'保罗·格雷厄姆（Y Combinator 创始人）公开 essays 中的核心方法论：
- Make something people want（YC 的座右铭）：先确认真的有人需要，再谈其他一切。
- Do things that don''t scale：早期就该亲自、笨拙、一个一个地手动招募和过度服务用户（Airbnb 案例），过早追求自动化和规模是常见死因。
- 最好的创业想法是有机的（organic）：来自创始人自己的真实需求——"为什么聪明人会有这个问题却没人解决"。
- Startup = Growth：创业公司的定义就是追求快速增长的公司，增长率是衡量一切的核心指标；没有增长引擎的生意不是 startup。
- Ramen profitable：尽早达到"拉面盈利"（能覆盖创始人基本生活），就拿回了主动权，不再被融资节奏绑架。
- Default alive or default dead：按当前增长率和烧钱速度，公司默认是活的还是死的？大多数创始人没算过这笔账。
- 做少数人非常爱的产品，好过做多数人觉得还行的产品——爱的强度比用户数量更能预示未来。
- Schlep blindness：人们会本能地看不见那些麻烦、繁琐的事里藏着的巨大机会——最好的机会常常被"这事太麻烦"的直觉屏蔽了。'
where key = 'graham' and is_builtin;

update council_personas set grounding_note =
'纳西姆·塔勒布公开著作（《黑天鹅》《反脆弱》《非对称风险》）中的核心方法论：
- 反脆弱：脆弱的东西厌恶波动，反脆弱的东西从波动、压力、无序中受益——先问你的处境在冲击下会变强还是变弱。
- 杠铃策略：极度保守 + 小仓位极度激进的组合，避免"中等风险"的中间地带——中间地带的风险最容易被低估。
- 黑天鹅：影响巨大的极端事件无法被预测——绝不能用"历史上没发生过"来证明"不会发生"。
- 火鸡问题：被喂了1000天的火鸡，在感恩节前一天对未来的信心达到顶峰——平稳的历史数据恰恰在最危险的时刻给人最强的错误安全感。
- Skin in the game（非对称风险）：警惕一切不承担下行后果的建议者——"不要问医生你该做什么，要问他如果处在你的位置他会做什么"。
- 遍历性（ergodicity）：集合概率不等于时间概率——一次爆仓就出局的游戏里，长期期望值再高也没有意义；先保证生存。
- Via negativa：通过去除而非添加来改进——知道什么是错的，比知道什么是对的更可靠、更持久。
- 林迪效应：已经存在很久的东西，预期还会存在很久——新东西的存活率被系统性高估。
- 绿色木材谬误：赚钱的交易员未必懂理论，懂理论的教授未必赚钱——不要把"能解释"当成"能做对"。'
where key = 'taleb' and is_builtin;

-- =============================================================
-- from migrations/025_idea_exit_criteria.sql
-- =============================================================

-- 退出条件预承诺：想法进入"验证中"之前，先白纸黑字写下"出现什么情况就杀掉"。
-- Go/Kill 决策时强制逐条对照（triggered yes/no），对抗事后合理化（宪法第2/7条）。
-- 只允许二元标记，不允许打分（宪法第1条）。

create table if not exists idea_exit_criteria (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  criterion   text not null,
  triggered   text not null default 'unreviewed'
    check (triggered in ('unreviewed', 'yes', 'no')),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_idea_exit_criteria_idea
  on idea_exit_criteria (idea_id, created_at);

alter table idea_exit_criteria enable row level security;

create policy "exit_criteria_owner" on idea_exit_criteria
  for all using (auth.uid() = user_id);

-- =============================================================
-- from migrations/026_unify_predictions.sql
-- =============================================================

-- 合并两套预测对账系统：predictions（挂 idea）和 retro_predictions（挂周复盘）
-- 结构几乎相同，服务同一个校准回路目的。统一进 predictions 表，
-- 用 source_type 区分来源，idea_id / period_id 互斥。
-- 生产库两张表当前均为空，本迁移直接结构变更，不做数据搬迁风险评估。

alter table predictions
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists period_id uuid references retro_periods (id) on delete cascade,
  add column if not exists source_type text not null default 'idea'
    check (source_type in ('idea', 'retro'));

-- 回填 idea 来源行的 user_id（历史数据保护；当前生产库为空表，此步是幂等安全网）。
update predictions p
set user_id = i.user_id
from ideas i
where p.idea_id = i.id and p.user_id is null;

-- 迁移遗留的 retro_predictions 数据（若存在）。
insert into predictions (id, user_id, period_id, source_type, text, due_at, made_at, outcome, resolved_at, note)
select id, user_id, period_id, 'retro', text, due_at, created_at, outcome, resolved_at, note
from retro_predictions
on conflict (id) do nothing;

alter table predictions alter column idea_id drop not null;
alter table predictions alter column user_id set not null;

do $$ begin
  alter table predictions add constraint predictions_source_ref_check check (
    (source_type = 'idea' and idea_id is not null and period_id is null)
    or (source_type = 'retro' and period_id is not null and idea_id is null)
  );
exception when duplicate_object then null; end $$;

create unique index if not exists idx_predictions_period_uniq
  on predictions (period_id) where source_type = 'retro';
create index if not exists idx_predictions_user_source
  on predictions (user_id, source_type, outcome, due_at);

drop table if exists retro_predictions;

-- complete_weekly_retrospective 原本写入 retro_predictions，改写入统一后的 predictions。
create or replace function complete_weekly_retrospective(
  p_period_id uuid,
  p_user_id uuid,
  p_final jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row retro_periods%rowtype;
  rule_id uuid;
  user_timezone text;
begin
  select * into period_row
  from retro_periods
  where id = p_period_id
  for update;

  if period_row.id is null or period_row.user_id is distinct from p_user_id then
    raise exception '无权完成该周复盘';
  end if;
  if period_row.period_type <> 'weekly' then
    raise exception '复盘类型不是weekly';
  end if;
  if period_row.status = 'completed' then
    select id into rule_id from judgment_rules where source_period_id = p_period_id limit 1;
    return rule_id;
  end if;
  if coalesce(trim(p_final->>'rule'), '') = ''
    or coalesce(trim(p_final->>'commitment'), '') = ''
    or coalesce(trim(p_final->'prediction'->>'text'), '') = ''
    or coalesce(trim(p_final->'prediction'->>'due_date'), '') = '' then
    raise exception '周复盘缺少规则、行动或预测';
  end if;

  insert into judgment_rules (user_id, source_period_id, text)
  values (p_user_id, p_period_id, p_final->>'rule')
  returning id into rule_id;

  select coalesce(timezone, 'Asia/Tokyo') into user_timezone
  from reflection_settings where user_id = p_user_id;
  user_timezone := coalesce(user_timezone, 'Asia/Tokyo');

  insert into retro_commitments (user_id, period_id, text, due_at)
  values (
    p_user_id,
    p_period_id,
    p_final->>'commitment',
    ((p_final->'prediction'->>'due_date')::date + time '23:59:59') at time zone user_timezone
  );

  insert into predictions (user_id, period_id, source_type, text, due_at)
  values (
    p_user_id,
    p_period_id,
    'retro',
    p_final->'prediction'->>'text',
    ((p_final->'prediction'->>'due_date')::date + time '23:59:59') at time zone user_timezone
  );

  update retro_periods
  set status = 'completed',
      final = p_final,
      completed_at = now(),
      updated_at = now()
  where id = p_period_id;

  return rule_id;
end;
$$;

revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from public;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from anon;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_weekly_retrospective(uuid, uuid, jsonb) to service_role;

-- =============================================================
-- from migrations/030_company_knowledge_base.sql
-- =============================================================

-- 公司知识库：跟已有的 /knowledge（市场事实/顾客规律/判断历史/领域知识，服务决策）
-- 和 /companies（求职目标/客户公司档案）都不同——这是"我们自己公司"的知识沉淀，
-- 分两种存：自由格式笔记（团队信息、产品文档、会议纪要等）+ 结构化的公司事实清单
-- （类似已有的 idea_company_facts，但不挂在某个想法下，是公司层面的事实）。

create table company_kb_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table company_kb_facts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  fact        text not null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index idx_company_kb_notes_user on company_kb_notes (user_id, updated_at desc);
create index idx_company_kb_facts_user
  on company_kb_facts (user_id, created_at desc) where archived_at is null;

alter table company_kb_notes enable row level security;
alter table company_kb_facts enable row level security;

create policy "company_kb_notes_owner" on company_kb_notes
  for all using (auth.uid() = user_id);

create policy "company_kb_facts_owner" on company_kb_facts
  for all using (auth.uid() = user_id);

-- =============================================================
-- from migrations/029_reality_materials.sql
-- =============================================================

-- Reality Materials: unified real-world input, three-province review, six-department routing.

create table if not exists public.reality_materials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  source_type     text not null check (
    source_type in ('text', 'url', 'file', 'customer_quote', 'business_fragment', 'emotion_fragment')
  ),
  title           text,
  input_text      text,
  sanitized_text  text,
  source_url      text,
  file_name       text,
  file_type       text,
  file_size       integer,
  status          text not null default 'captured' check (
    status in ('captured', 'extracted', 'drafted', 'reviewed', 'confirmed', 'parked', 'rejected', 'summary_only', 'deleted', 'failed')
  ),
  redactions      text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.reality_material_extractions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  material_id     uuid not null references public.reality_materials (id) on delete cascade,
  extracted_text  text not null,
  extraction_meta jsonb not null default '{}'::jsonb,
  visible_sheets  jsonb not null default '[]'::jsonb,
  unreadable      jsonb not null default '[]'::jsonb,
  is_truncated    boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (material_id)
);

create table if not exists public.reality_material_drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.reality_materials (id) on delete cascade,
  draft       jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.reality_material_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.reality_materials (id) on delete cascade,
  review      jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.reality_material_departments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.reality_materials (id) on delete cascade,
  department  text not null check (
    department in ('customer', 'company', 'market', 'judgment', 'action', 'self')
  ),
  created_at  timestamptz not null default now(),
  unique (material_id, department)
);

create table if not exists public.reality_material_routes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  material_id        uuid not null references public.reality_materials (id) on delete cascade,
  target             text not null check (
    target in ('reality', 'customer_view', 'company_kb', 'idea', 'retrospective', 'reasoning', 'decision_closure')
  ),
  target_object_type text,
  target_object_id   uuid,
  reason             text not null,
  output_expectation text not null,
  source_snapshot    jsonb not null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_reality_materials_user_status
  on public.reality_materials (user_id, status, updated_at desc);
create index if not exists idx_reality_material_routes_material
  on public.reality_material_routes (user_id, material_id, created_at desc);
create index if not exists idx_reality_material_departments_user
  on public.reality_material_departments (user_id, department, created_at desc);

alter table public.reality_materials enable row level security;
alter table public.reality_material_extractions enable row level security;
alter table public.reality_material_drafts enable row level security;
alter table public.reality_material_reviews enable row level security;
alter table public.reality_material_routes enable row level security;
alter table public.reality_material_departments enable row level security;

revoke all on table public.reality_materials from anon, authenticated;
revoke all on table public.reality_material_extractions from anon, authenticated;
revoke all on table public.reality_material_drafts from anon, authenticated;
revoke all on table public.reality_material_reviews from anon, authenticated;
revoke all on table public.reality_material_routes from anon, authenticated;
revoke all on table public.reality_material_departments from anon, authenticated;

-- from migrations/027_decision_closures.sql
-- Generic decision closures: a C-compatible system exit for analysis modules.
-- v1 writes new closures without migrating existing module-specific closures.

create table if not exists decision_closures (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  object_type           text not null check (
    object_type in (
      'reality_case',
      'idea',
      'customer_case',
      'dream_case',
      'dream_branch',
      'retro_period',
      'company_profile',
      'reasoning_session'
    )
  ),
  object_id             uuid not null,
  origin_module         text not null,
  title                 text not null,
  current_judgment      text not null,
  critical_unknowns     jsonb not null,
  options               jsonb not null,
  selected_next_step    text not null,
  completion_criterion  text not null,
  expected_feedback     text not null,
  due_on                date not null,
  basis_refs            text[] not null,
  status                text not null default 'active' check (
    status in ('active', 'completed', 'not_completed', 'replaced', 'archived')
  ),
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (
    jsonb_typeof(critical_unknowns) = 'array'
    and jsonb_array_length(critical_unknowns) between 1 and 3
  ),
  check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 3
  ),
  check (cardinality(basis_refs) >= 1)
);

create table if not exists decision_closure_sources (
  id                 uuid primary key default gen_random_uuid(),
  closure_id         uuid not null references decision_closures (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  source_type        text not null,
  source_id          uuid not null,
  source_version_id  uuid,
  snapshot           jsonb not null,
  basis_refs         text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table if not exists decision_closure_events (
  id          uuid primary key default gen_random_uuid(),
  closure_id  uuid not null references decision_closures (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_type  text not null check (
    event_type in ('created', 'completed', 'not_completed', 'replaced', 'archived')
  ),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create unique index if not exists decision_closures_one_active_per_object
  on decision_closures (user_id, object_type, object_id)
  where status = 'active';

create index if not exists decision_closures_user_due
  on decision_closures (user_id, status, due_on, created_at desc);

create index if not exists decision_closure_sources_closure
  on decision_closure_sources (closure_id);

create index if not exists decision_closure_events_closure
  on decision_closure_events (closure_id, created_at);

alter table decision_closures enable row level security;
alter table decision_closure_sources enable row level security;
alter table decision_closure_events enable row level security;

revoke all on table public.decision_closures from anon, authenticated;
revoke all on table public.decision_closure_sources from anon, authenticated;
revoke all on table public.decision_closure_events from anon, authenticated;

create or replace function save_decision_closure(
  p_user_id uuid,
  p_object_type text,
  p_object_id uuid,
  p_origin_module text,
  p_title text,
  p_payload jsonb,
  p_sources jsonb,
  p_replaces_closure_id uuid default null,
  p_replace_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_active_id uuid;
  v_closure_id uuid;
  v_source jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  if p_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_object_type not in (
    'reality_case',
    'idea',
    'customer_case',
    'dream_case',
    'dream_branch',
    'retro_period',
    'company_profile',
    'reasoning_session'
  ) then
    raise exception 'invalid closure object type';
  end if;

  if coalesce(trim(p_title), '') = ''
    or coalesce(trim(p_origin_module), '') = ''
    or coalesce(trim(p_payload->>'current_judgment'), '') = ''
    or coalesce(trim(p_payload->>'selected_next_step'), '') = ''
    or coalesce(trim(p_payload->>'completion_criterion'), '') = ''
    or coalesce(trim(p_payload->>'expected_feedback'), '') = ''
    or coalesce(trim(p_payload->>'due_on'), '') = '' then
    raise exception 'incomplete closure payload';
  end if;

  if jsonb_typeof(p_payload->'critical_unknowns') <> 'array'
    or jsonb_array_length(p_payload->'critical_unknowns') not between 1 and 3
    or jsonb_typeof(p_payload->'options') <> 'array'
    or jsonb_array_length(p_payload->'options') not between 2 and 3
    or jsonb_typeof(p_payload->'basis_refs') <> 'array'
    or jsonb_array_length(p_payload->'basis_refs') < 1 then
    raise exception 'invalid closure structure';
  end if;

  if p_sources is null
    or jsonb_typeof(p_sources) <> 'array'
    or jsonb_array_length(p_sources) < 1 then
    raise exception 'closure sources are required';
  end if;

  select id into v_active_id
  from public.decision_closures
  where user_id = p_user_id
    and object_type = p_object_type
    and object_id = p_object_id
    and status = 'active'
  for update;

  if v_active_id is not null then
    if p_replaces_closure_id is distinct from v_active_id
      or coalesce(trim(p_replace_reason), '') = '' then
      raise exception 'active closure replacement requires a reason';
    end if;

    update public.decision_closures
    set status = 'replaced',
        closed_at = now(),
        updated_at = now()
    where id = v_active_id;

    insert into public.decision_closure_events (closure_id, user_id, event_type, note)
    values (v_active_id, p_user_id, 'replaced', trim(p_replace_reason));
  elsif p_replaces_closure_id is not null then
    raise exception 'closure to replace does not exist';
  end if;

  insert into public.decision_closures (
    user_id,
    object_type,
    object_id,
    origin_module,
    title,
    current_judgment,
    critical_unknowns,
    options,
    selected_next_step,
    completion_criterion,
    expected_feedback,
    due_on,
    basis_refs
  )
  values (
    p_user_id,
    p_object_type,
    p_object_id,
    trim(p_origin_module),
    trim(p_title),
    trim(p_payload->>'current_judgment'),
    p_payload->'critical_unknowns',
    p_payload->'options',
    trim(p_payload->>'selected_next_step'),
    trim(p_payload->>'completion_criterion'),
    trim(p_payload->>'expected_feedback'),
    (p_payload->>'due_on')::date,
    array(select jsonb_array_elements_text(p_payload->'basis_refs'))
  )
  returning id into v_closure_id;

  for v_source in select * from jsonb_array_elements(p_sources)
  loop
    insert into public.decision_closure_sources (
      closure_id,
      user_id,
      source_type,
      source_id,
      source_version_id,
      snapshot,
      basis_refs
    )
    values (
      v_closure_id,
      p_user_id,
      v_source->>'source_type',
      (v_source->>'source_id')::uuid,
      nullif(v_source->>'source_version_id', '')::uuid,
      v_source->'snapshot',
      array(select jsonb_array_elements_text(coalesce(v_source->'basis_refs', '[]'::jsonb)))
    );
  end loop;

  insert into public.decision_closure_events (closure_id, user_id, event_type, note)
  values (v_closure_id, p_user_id, 'created', '');

  return v_closure_id;
end;
$function$;

create or replace function resolve_decision_closure(
  p_closure_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_closure public.decision_closures%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select * into v_closure
  from public.decision_closures
  where id = p_closure_id
  for update;

  if v_closure.id is null
    or v_closure.user_id is distinct from p_user_id
    or v_closure.status <> 'active' then
    raise exception 'active closure not found or access denied';
  end if;

  if p_outcome not in ('completed', 'not_completed') then
    raise exception 'invalid closure outcome';
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'closure result note is required';
  end if;

  update public.decision_closures
  set status = p_outcome,
      closed_at = now(),
      updated_at = now()
  where id = p_closure_id;

  insert into public.decision_closure_events (closure_id, user_id, event_type, note)
  values (p_closure_id, p_user_id, p_outcome, trim(p_note));
end;
$function$;

revoke all on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) from public;
revoke all on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) from anon;
revoke all on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) from authenticated;
grant execute on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) to service_role;

revoke all on function resolve_decision_closure(uuid, uuid, text, text) from public;
revoke all on function resolve_decision_closure(uuid, uuid, text, text) from anon;
revoke all on function resolve_decision_closure(uuid, uuid, text, text) from authenticated;
grant execute on function resolve_decision_closure(uuid, uuid, text, text) to service_role;

-- from migrations/028_decision_workbench.sql
-- Decision Workbench: object registry, object links, framework use history, and result learning.
-- The app reads existing module tables dynamically, so these tables are additive.

create table if not exists public.decision_objects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  object_type        text not null check (
    object_type in (
      'reality_case',
      'idea',
      'customer_case',
      'dream_case',
      'dream_branch',
      'retro_period',
      'company_profile',
      'reasoning_session',
      'decision_closure'
    )
  ),
  object_id          uuid not null,
  title              text not null,
  primary_module     text not null,
  status             text not null default 'active' check (status in ('active', 'closed', 'archived')),
  current_closure_id uuid references public.decision_closures (id) on delete set null,
  last_activity_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (user_id, object_type, object_id)
);

create table if not exists public.decision_object_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  from_object_type   text not null,
  from_object_id     uuid not null,
  to_object_type     text not null,
  to_object_id       uuid not null,
  link_type          text not null default 'related',
  created_at         timestamptz not null default now(),
  unique (user_id, from_object_type, from_object_id, to_object_type, to_object_id, link_type)
);

create table if not exists public.decision_object_framework_uses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  object_type        text not null,
  object_id          uuid not null,
  framework_id       text not null,
  source_href        text,
  output_href        text,
  created_at         timestamptz not null default now()
);

create table if not exists public.decision_object_learnings (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null,
  object_type          text not null,
  object_id            uuid not null,
  closure_id           uuid references public.decision_closures (id) on delete set null,
  original_judgment    text not null,
  actual_result        text not null,
  gap_reason           text not null check (
    gap_reason in ('judgment', 'execution', 'environment_change', 'luck', 'unknown')
  ),
  updated_rule         text,
  created_at           timestamptz not null default now()
);

create index if not exists decision_objects_user_status_activity
  on public.decision_objects (user_id, status, last_activity_at desc);

create index if not exists decision_object_links_from_idx
  on public.decision_object_links (user_id, from_object_type, from_object_id);

create index if not exists decision_object_framework_uses_object_idx
  on public.decision_object_framework_uses (user_id, object_type, object_id, created_at desc);

create index if not exists decision_object_learnings_object_idx
  on public.decision_object_learnings (user_id, object_type, object_id, created_at desc);

alter table public.decision_objects enable row level security;
alter table public.decision_object_links enable row level security;
alter table public.decision_object_framework_uses enable row level security;
alter table public.decision_object_learnings enable row level security;

revoke all on table public.decision_objects from anon, authenticated;
revoke all on table public.decision_object_links from anon, authenticated;
revoke all on table public.decision_object_framework_uses from anon, authenticated;
revoke all on table public.decision_object_learnings from anon, authenticated;

-- =============================================================
-- from migrations/031_decoy_sessions.sql
-- =============================================================

-- 假方案（decoy）：思维陪练。AI 生成埋了 2-4 处错漏的"看似正确"方案，用户找茬 →
-- 揭底对照 → 用户写下自己的方案（主产物）→ AI 一次性对抗质疑 → 可选扩写定稿。
-- plan / reveal / own_plan_critique 的 JSON 结构见 app/(app)/decoy/types.ts。

create table if not exists decoy_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  idea_id           uuid references ideas (id) on delete set null,
  problem           text not null,
  plan              jsonb not null,          -- { sections: [...], planted_flaws: [...] }
  challenges        text,                    -- 用户质疑原文
  reveal            jsonb,                   -- { caught: [...], missed: [...], bonus: [...] }
  own_plan          text,                    -- 用户自己的方案（主产物，可修订覆盖）
  own_plan_critique jsonb,                   -- AI 对 own_plan 的一次性对抗质疑
  final_plan        text,                    -- AI 基于 own_plan 扩写的完整方案（可选）
  learned           text,                    -- 用户亲笔的一句总结（可空）
  status            text not null default 'drafted'
                    check (status in ('drafted', 'challenged', 'revealed',
                                      'drafting_own', 'concluded')),
  created_at        timestamptz not null default now(),
  revealed_at       timestamptz,
  concluded_at      timestamptz
);

create index if not exists idx_decoy_sessions_user
  on decoy_sessions (user_id, created_at desc);

alter table decoy_sessions enable row level security;

create policy "decoy_sessions_owner" on decoy_sessions
  for all using (auth.uid() = user_id);

-- =============================================================
-- from migrations/032_battle_sessions.sql
-- =============================================================

-- 心魔（battle）：AI 用用户口吻护盘一个用户想信的主张（暗中使用 decoy 的 18 类谬误），
-- 用户多回合进攻拆穿；词穷/收兵后强制复盘三栏，主产物是用户亲笔的 final_position。
-- messages / recap 的 JSON 结构见 app/(app)/battle/types.ts。

create table if not exists battle_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  idea_id        uuid references ideas (id) on delete set null,
  claim          text not null,           -- 用户想信的主张
  messages       jsonb not null default '[]'::jsonb,
  -- [{ role: 'user' | 'demon', content, fallacies?: [{type, quote}], out_of_excuses? }]
  recap          jsonb,                   -- { caught: [...], missed: [...], bonus: [...] }
  final_position text,                    -- 亲笔：现在还信吗/改成什么样（主产物）
  learned        text,                    -- 亲笔一句总结（可空）
  status         text not null default 'active'
                 check (status in ('active', 'concluded')),
  created_at     timestamptz not null default now(),
  concluded_at   timestamptz
);

create index if not exists idx_battle_sessions_user
  on battle_sessions (user_id, created_at desc);

alter table battle_sessions enable row level security;

create policy "battle_sessions_owner" on battle_sessions
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 033_self_model.sql
-- ---------------------------------------------------------------------------

-- 自我模块（/self）第一阶段：押注与假设台账。
--
-- 目的：把"我是什么样的人"从不可证伪的形容词，降级为可证伪的条件命题。
-- 三条不可违背的约定：
--   1) 一切数值必须有分母。假设的强度 = 触发率（self_windows 的 hit / 总窗口），
--      不是评分。只记录"你做了什么"而不记录"符合条件但你没那么做"，分母就没了。
--   2) AI 只有提名权，没有授予权。档位升降规则写在 lib/domains/self-model/tiers.ts，
--      AI 不输出任何数字。
--   3) 自述（"我觉得我很有野心"）不是证据，进 self_declarations 单独存放，不进推理。
--
-- 预测不新建表：扩 predictions 的 source_type，复用 026 已统一的到期/命中逻辑，
-- 这样"对想法的预测"和"对自己的预测"能放在同一把尺子上比校准。

-- ---------------------------------------------------------------------------
-- 1. 自述：Declared Self。单独存放，永不进入推理。
-- ---------------------------------------------------------------------------
create table if not exists self_declarations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  text       text not null,
  stated_on  date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_self_declarations_user
  on self_declarations (user_id, stated_on desc);

-- ---------------------------------------------------------------------------
-- 2. 假设台账
-- ---------------------------------------------------------------------------
create table if not exists self_hypotheses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  code         text not null,                       -- H-001，永不复用
  kind         text not null default 'context_behavior'
               check (kind in (
                 'trait', 'state', 'context_behavior',
                 'skill', 'preference', 'value', 'motivation'
               )),
  -- statement 必须含"在什么条件下"，默认归入 context_behavior：
  -- 大多数被误标为 trait 的东西，真实身份是"在 X 条件下会 Y"。
  statement    text not null,
  scope_note   text,                                -- 已知适用/不适用范围
  tier         text not null default 'hunch'
               check (tier in (
                 'hunch',        -- 猜想：只能当问题
                 'working',      -- 工作假设：可以押注
                 'load_bearing', -- 可承重：能进人生决策
                 'refuted',      -- 已推翻（保留，不删）
                 'archived'      -- 12 个月无新证据自动归档
               )),
  -- [{ label, explanation, distinguishing_test }]
  -- 只列替代解释不够，必须写出"什么观察能区分它们"。
  alternative_explanations jsonb not null default '[]'::jsonb,
  first_observed  date not null default current_date,
  last_evidence_on date,
  refuted_at      timestamptz,
  refuted_reason  text,
  replaces_id     uuid references self_hypotheses (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint self_hypotheses_code_uniq unique (user_id, code),
  constraint self_hypotheses_refuted_reason_check check (
    refuted_at is null or coalesce(trim(refuted_reason), '') <> ''
  )
);

create index if not exists idx_self_hypotheses_user
  on self_hypotheses (user_id, tier, last_evidence_on desc nulls last);

-- ---------------------------------------------------------------------------
-- 3. 触发窗口 ★ 全模块命脉
--    每一次"符合触发条件的情境"都要记一行，不管行为有没有发生。
--    outcome='miss' 的行不是失败记录，是分母。
-- ---------------------------------------------------------------------------
create table if not exists self_windows (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  hypothesis_id uuid not null references self_hypotheses (id) on delete cascade,
  occurred_on   date not null default current_date,
  situation     text not null,                      -- 白描：当时符合条件的情境
  -- 情境归类标签（例："对上级" / "公司内部项目" / "自学"）。
  -- trait 级结论要求跨 ≥3 个不同 context_key —— 只在一类情境里重复出现的，
  -- 是"在 X 条件下的行为"，不是特质。
  context_key   text not null,
  outcome       text not null check (outcome in ('hit', 'miss')),
  cost_paid     text,                               -- 放弃了什么（区分 preference 与 value）
  third_party   text,                               -- 别人的原话（盲点的唯一来源）
  -- E1 事后回忆 / E2 有代价 / E3 有第三方或文档佐证 / E4 系统自动统计
  -- E5（事前预测被检验）不在本表，走 predictions。
  grade         text not null default 'E1'
                check (grade in ('E1', 'E2', 'E3', 'E4')),
  source_ref    jsonb,                              -- 关联 material / decision / validation
  created_at    timestamptz not null default now()
);

create index if not exists idx_self_windows_hypothesis
  on self_windows (hypothesis_id, occurred_on desc);
create index if not exists idx_self_windows_user
  on self_windows (user_id, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 4. predictions 接入 self（E5 级证据的唯一来源）
--    source_type='self' 时 idea_id 与 period_id 都为空，可选挂 hypothesis_id。
-- ---------------------------------------------------------------------------
alter table predictions
  drop constraint if exists predictions_source_ref_check;
alter table predictions
  drop constraint if exists predictions_source_type_check;

alter table predictions
  add column if not exists hypothesis_id uuid
    references self_hypotheses (id) on delete set null,
  -- 押注时的把握度，由用户自己填。不是 AI 给的分，也不是对人格的评分：
  -- 它的唯一用途是和实际命中率对账，算出你的校准偏移。
  add column if not exists confidence smallint
    check (confidence between 0 and 100);

do $$ begin
  alter table predictions add constraint predictions_source_type_check
    check (source_type in ('idea', 'retro', 'self'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table predictions add constraint predictions_source_ref_check check (
    (source_type = 'idea'  and idea_id is not null and period_id is null)
    or (source_type = 'retro' and period_id is not null and idea_id is null)
    or (source_type = 'self'  and idea_id is null and period_id is null)
  );
exception when duplicate_object then null; end $$;

create index if not exists idx_predictions_hypothesis
  on predictions (hypothesis_id, due_at) where source_type = 'self';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table self_declarations enable row level security;
alter table self_hypotheses   enable row level security;
alter table self_windows      enable row level security;

drop policy if exists "self_declarations_owner" on self_declarations;
create policy "self_declarations_owner" on self_declarations
  for all using (auth.uid() = user_id);

drop policy if exists "self_hypotheses_owner" on self_hypotheses;
create policy "self_hypotheses_owner" on self_hypotheses
  for all using (auth.uid() = user_id);

drop policy if exists "self_windows_owner" on self_windows;
create policy "self_windows_owner" on self_windows
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 034_self_body_logs.sql
-- ---------------------------------------------------------------------------

-- 自我面板的身体组。
--
-- 加它不是"顺便做个健身功能"。原因有两条，都和这个模块的方法论直接相关：
--   1) 目前关于用户的全部证据都长在"工作"这一类情境里，而 self_hypotheses
--      要升到 trait 需要跨 ≥3 类 context_key。身体是第二类真实情境。
--   2) 这是唯一一处叙述无法参与的数据。杠铃举不起来就是举不起来，
--      不存在"我觉得我其实挺强的"。
--
-- 一条记录 = 一组，或一次有氧。刻意不做训练计划、不做动作库、不做打卡奖励：
-- 记录必须在 20 秒内完成，否则两周后就没人记了（宪法原则 3 的同一条理由）。

create table if not exists self_body_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  logged_on    date not null default current_date,
  kind         text not null check (kind in ('lift', 'cardio')),
  -- lift: 深蹲 / 卧推 / 硬拉…；cardio: 跑步 / 骑行 / 游泳…
  movement     text not null,
  weight_kg    numeric(6, 2),
  reps         smallint check (reps is null or reps > 0),
  sets         smallint check (sets is null or sets > 0),
  distance_km  numeric(6, 2),
  duration_min numeric(6, 1),
  note         text,
  created_at   timestamptz not null default now(),
  -- 力量记录必须能算出估算 1RM，否则它进不了"力"这项的分子。
  constraint self_body_logs_shape_check check (
    (kind = 'lift' and weight_kg is not null and reps is not null)
    or (kind = 'cardio' and (duration_min is not null or distance_km is not null))
  )
);

create index if not exists idx_self_body_logs_user
  on self_body_logs (user_id, logged_on desc);

alter table self_body_logs enable row level security;

drop policy if exists "self_body_logs_owner" on self_body_logs;
create policy "self_body_logs_owner" on self_body_logs
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 035_self_collection_ports.sql
-- ---------------------------------------------------------------------------

-- 补齐四个还没有采集口的方向，让「身体 / 人际 / 自己」三个域真的能亮起来。
--
-- 面板上有八个子属性一直标着「尚未采集」，怪物清单也一直在指它们 ——
-- 指得出来却做不了，是设计缺口。这个迁移把入口补上。
--
-- 三张表都刻意做得极小。采集口的成败只看一件事：一次记录能不能在 20 秒内完成。
-- 超过 20 秒的，两周之后就没人记了（宪法原则 3 同一条理由）。

-- ---------------------------------------------------------------------------
-- 1. 每日：只记睡了几小时。
--    「续航 / 睡眠债」这一项换算成"达到 7 小时的天数占比"，
--    而不是平均时长 —— 平均值会把"五天四小时 + 两天十二小时"洗成健康。
-- ---------------------------------------------------------------------------
create table if not exists self_daily (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  logged_on   date not null default current_date,
  sleep_hours numeric(4, 2) not null check (sleep_hours >= 0 and sleep_hours <= 24),
  created_at  timestamptz not null default now(),
  constraint self_daily_one_per_day unique (user_id, logged_on)
);

create index if not exists idx_self_daily_user
  on self_daily (user_id, logged_on desc);

-- ---------------------------------------------------------------------------
-- 2. 与他人的一次互动。三种，共用一张表：
--    exposure  把没做完的东西给某人看了     → 人望 / 敢给人看
--    new_face  第一次接触的人               → 机缘 / 认识新人
--    proposal  提了一个建议，以及它的下场   → 人望 / 说话有人听
--
--    proposal 的 outcome 必须填，哪怕是 pending：
--    只记"我提了"不记"有没有被采纳"，采纳率就没有分母。
-- ---------------------------------------------------------------------------
create table if not exists self_encounters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null default current_date,
  kind       text not null check (kind in ('exposure', 'new_face', 'proposal')),
  counterpart text not null,              -- 对方是谁（一个称呼就够）
  detail     text,                        -- 给他看了什么 / 提了什么
  outcome    text check (outcome in ('accepted', 'rejected', 'pending')),
  created_at timestamptz not null default now(),
  constraint self_encounters_proposal_outcome check (
    kind <> 'proposal' or outcome is not null
  )
);

create index if not exists idx_self_encounters_user
  on self_encounters (user_id, kind, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 3. 底牌快照：跑道 / 能叫来的人 / 每周属于自己的时间。
--    一个月填一次。这三个数决定你能打几级本，而大多数人从来没写下来过。
--    保留历史行，不做 upsert —— 跑道的变化曲线本身就是信息。
-- ---------------------------------------------------------------------------
create table if not exists self_resources (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  recorded_on       date not null default current_date,
  runway_months     numeric(5, 1) not null check (runway_months >= 0),
  allies            smallint not null check (allies >= 0),
  weekly_free_hours numeric(4, 1) not null check (weekly_free_hours >= 0),
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_self_resources_user
  on self_resources (user_id, recorded_on desc);

-- ---------------------------------------------------------------------------
-- 4. 触发窗口上的一个勾：这次是不是撞上了意料之外的收获。
--    「机缘 / 捡到的意外」的分子。
-- ---------------------------------------------------------------------------
alter table self_windows
  add column if not exists serendipity boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table self_daily      enable row level security;
alter table self_encounters enable row level security;
alter table self_resources  enable row level security;

drop policy if exists "self_daily_owner" on self_daily;
create policy "self_daily_owner" on self_daily
  for all using (auth.uid() = user_id);

drop policy if exists "self_encounters_owner" on self_encounters;
create policy "self_encounters_owner" on self_encounters
  for all using (auth.uid() = user_id);

drop policy if exists "self_resources_owner" on self_resources;
create policy "self_resources_owner" on self_resources
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 036_self_traits.sql
-- ---------------------------------------------------------------------------

-- 特性层：挂在子属性上的带符号修正。
--
-- 这一层最重要的一条：**品级是算出来的，不是评出来的。**
-- 一条特性的修正如果有正有负、且落在不同主属性上，它自动是「暗金 · 双刃」；
-- 全正是资产，全负是负债，属于某个套装的是套装。
-- 规则在 lib/domains/self-model/traits.ts，AI 只能提名特性，不能授予品级。
--
-- 防通胀靠两件事，都不靠自觉：
--   1) 互斥光谱 —— 同一根光谱上只能有一条在持有中（下面的唯一索引）。
--      稀缺来自互斥，不来自配额喊话。
--   2) 品级配额 —— 史诗 ≤2 / 传说 ≤1 / 暗金 ≤2，在 TS 里结算时执行。
--
-- 传说级（不可交易）的门槛单独说：必须填 refused_offer ——
-- 你得举出一次为它推掉的具体好处。说不出那次拒绝的，只是没被考验过的漂亮话。

create table if not exists self_traits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- 光谱名（例："收敛" / "接触" / "更新"）。同一根光谱同时只能持有一条。
  spectrum_key  text not null,
  name          text not null,
  -- 挂载的修正：[{ sub: "wis.contact", sign: "plus" | "minus", note: "…" }]
  -- sub 必须是 panel.ts 里存在的子属性 key，写入前由 server action 校验。
  modifiers     jsonb not null default '[]'::jsonb,
  -- 反噬条件 / 装备条件：双刃特性必填，否则它只是一句夸奖。
  backfire      text,
  equip_note    text,
  -- 套装标记。同 set_key 的特性凑齐才解锁效果。
  set_key       text,
  set_effect    text,
  -- 传说级门槛：你曾经为它推掉的一个具体好处。
  refused_offer text,
  -- 关联的假设（证据从那边借）。
  hypothesis_id uuid references self_hypotheses (id) on delete set null,
  status        text not null default 'held'
                check (status in ('held', 'faded')),
  first_held_on date not null default current_date,
  faded_at      timestamptz,
  created_at    timestamptz not null default now()
);

-- 互斥光谱：同一用户、同一根光谱，持有中的特性只能有一条。
create unique index if not exists idx_self_traits_spectrum_uniq
  on self_traits (user_id, spectrum_key)
  where status = 'held';

create index if not exists idx_self_traits_user
  on self_traits (user_id, status, first_held_on desc);

alter table self_traits enable row level security;

drop policy if exists "self_traits_owner" on self_traits;
create policy "self_traits_owner" on self_traits
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 037_self_skills_feats.sql
-- ---------------------------------------------------------------------------

-- 技能与专长。
--
-- 技能的成长规则来自 CoC：**只有实际用过并且有结果，才打一个勾**。
-- 所以这里有两张表：技能的当前值，和每一次打勾的流水。
-- 只存当前值不存流水，就没法回答"这 60 分是怎么涨上来的"——
-- 和这个模块其它地方一样，没有分母的数字不算数。
--
-- 专长来自 D&D：有前置、花专长点、给具体效果。
-- 定义（45 项技能 / 12 个专长及其前置树）写在
-- lib/domains/self-model/skills.ts，不进数据库：它们是静态规则，
-- 放代码里才能被 TypeScript 和单元测试守住，也才轮不到 AI 去改。

create table if not exists self_skills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  skill_key  text not null,
  value      smallint not null default 0 check (value between 0 and 100),
  -- 🔥 0–2：没人要求你也会做的程度。只影响成长速度，不直接进数值。
  passion    smallint not null default 0 check (passion between 0 and 2),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint self_skills_one_per_key unique (user_id, skill_key)
);

create index if not exists idx_self_skills_user
  on self_skills (user_id, value desc);

-- 打勾流水：一次"用过并且有结果"。note 写清楚用在哪，否则勾就是空的。
create table if not exists self_skill_ticks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  skill_key   text not null,
  occurred_on date not null default current_date,
  note        text not null,
  -- 关联到产生它的东西（触发窗口 / 预测 / 训练 / 互动）。
  ref         jsonb,
  -- 结算后置为该次结算的时间，之后不再参与成长。
  settled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_self_skill_ticks_user
  on self_skill_ticks (user_id, skill_key, occurred_on desc);
create index if not exists idx_self_skill_ticks_open
  on self_skill_ticks (user_id, skill_key) where settled_at is null;

create table if not exists self_feats (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  feat_key text not null,
  taken_on date not null default current_date,
  constraint self_feats_one_per_key unique (user_id, feat_key)
);

alter table self_skills      enable row level security;
alter table self_skill_ticks enable row level security;
alter table self_feats       enable row level security;

drop policy if exists "self_skills_owner" on self_skills;
create policy "self_skills_owner" on self_skills
  for all using (auth.uid() = user_id);

drop policy if exists "self_skill_ticks_owner" on self_skill_ticks;
create policy "self_skill_ticks_owner" on self_skill_ticks
  for all using (auth.uid() = user_id);

drop policy if exists "self_feats_owner" on self_feats;
create policy "self_feats_owner" on self_feats
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 038_self_trait_library.sql
-- ---------------------------------------------------------------------------

-- 特性的来源标记。
--
-- 库里的 52 条（26 根光谱 × 两端）由代码扫描授予与褪色，定义在
-- lib/domains/self-model/trait-library.ts。这里只需要在 self_traits 上
-- 记住"这条是库里的哪一条"，扫描才能认出自己发过的东西。
--
-- 手写的特性仍然允许，但标 custom：没经过库定义审查的东西，
-- 不该和有明确授予条件的平起平坐（品级上限在 TS 里压一档）。

alter table self_traits
  add column if not exists source text not null default 'custom'
    check (source in ('library', 'custom')),
  add column if not exists library_key text;

create unique index if not exists idx_self_traits_library_uniq
  on self_traits (user_id, library_key)
  where library_key is not null and status = 'held';


-- ---------------------------------------------------------------------------
-- 039_self_events.sql
-- ---------------------------------------------------------------------------

-- 事件流。
--
-- 在这之前，/self 上的一切都是**当前状态**：特性是现在持有的，等级是现在算出来的，
-- 称号是现在满足条件的。所以变化发生的那一刻不可见 —— 你永远看不到
-- "三天前解锁了封顶匠"，只能看到"现在有封顶匠"。
--
-- 没有事件就没有那一下"叮"。再多内容也补不上这个。
--
-- dedupe_key 让一次性的事件只记一次：称号解锁、转职。
-- 反复发生的（技能上涨、特性褪色又重来）留空，它们本来就该出现多次。

create table if not exists self_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind        text not null check (kind in (
                'trait_granted', 'trait_faded',
                'skill_up', 'skill_rust',
                'feat_taken',
                'title_earned', 'build_changed',
                'hypothesis_refuted', 'tier_changed'
              )),
  title       text not null,
  detail      text,
  ref         jsonb,
  dedupe_key  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_self_events_dedupe
  on self_events (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_self_events_user
  on self_events (user_id, occurred_at desc);

alter table self_events enable row level security;

drop policy if exists "self_events_owner" on self_events;
create policy "self_events_owner" on self_events
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 040_self_quest_sightings.sql
-- ---------------------------------------------------------------------------

-- 怪物点名。
--
-- 在这之前，怪是每次访问现算出来的：打了没打都不留痕。
-- 所以一只 BOSS 可以在你面前站五周，而系统一无所知。
--
-- 逃跑本身就是证据，而且是最硬的那一种 —— 它不需要你承认，
-- 记录会自己说话。一周只记一次（week_key 唯一索引），
-- 所以刷新页面不会把"出现周数"刷高。
--
-- 没有"被击败"这一列：怪不再出现，就是被解决了。
-- 硬要记一个 killed_at，等于要求人在做完事之后再回来点一下按钮，
-- 那一步一定会被跳过，然后这张表就开始说谎。

create table if not exists self_quest_sightings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  quest_id   text not null,
  -- ISO 周，例 2026-W35。一周之内反复打开只算一次。
  week_key   text not null,
  tier       text not null check (tier in ('trash', 'elite', 'boss')),
  name       text not null,
  seen_on    date not null default current_date,
  created_at timestamptz not null default now(),
  constraint self_quest_sightings_once_a_week
    unique (user_id, quest_id, week_key)
);

create index if not exists idx_self_quest_sightings_user
  on self_quest_sightings (user_id, quest_id);

alter table self_quest_sightings enable row level security;

drop policy if exists "self_quest_sightings_owner" on self_quest_sightings;
create policy "self_quest_sightings_owner" on self_quest_sightings
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 041_self_deeds.sql
-- ---------------------------------------------------------------------------

-- 事迹与参照类。
--
-- /self 到现在有统计（属性）和模式（特性），没有**事件**。
-- 但一个人也是他做过的那些具体的事，而且更要紧的是：
-- 没有历史，就没有参照类；没有参照类，"未来预想"永远只能靠想象。
--
-- 这张表的唯一存在理由是**基准率**：
--   你自发启动 9 件事 · 做完 4 · 有人用 1 · 中位 3.5 个月
--   → 下一条路径的先验
-- 所以字段是围绕"一条基准率需要什么"设计的，不是围绕"怎么写好看"。
-- 一条事迹如果进不了任何参照类，它就不该记在这里。
--
-- occurred_on 允许粗到月：补录 2018 年的事时，日期精确不到天，
-- 而卡在这一步会让整件事做不下去。

create table if not exists self_deeds (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  occurred_on   date not null,
  title         text not null,
  what_happened text,
  -- 付出/放弃了什么。区分 preference 与 value 的唯一标准。
  cost          text,
  -- 参照类：同类事情放一起才算得出基准率。
  class_key     text not null,
  domain        text not null default 'work'
                check (domain in ('work', 'body', 'people', 'self')),
  outcome       text not null default 'ongoing'
                check (outcome in ('done', 'abandoned', 'ongoing')),
  -- 有没有人真的用了 / 接受了。null = 不适用（比如纯私人的事）。
  adopted       boolean,
  duration_days integer check (duration_days is null or duration_days >= 0),
  source        text not null default 'manual'
                check (source in ('manual', 'auto')),
  ref           jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_self_deeds_user
  on self_deeds (user_id, occurred_on desc);
create index if not exists idx_self_deeds_class
  on self_deeds (user_id, class_key);

alter table self_deeds enable row level security;

drop policy if exists "self_deeds_owner" on self_deeds;
create policy "self_deeds_owner" on self_deeds
  for all using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 042_trait_catalog.sql
-- ---------------------------------------------------------------------------

-- 特性目录：把特性库从代码搬进数据库。
--
-- 之前 80 条写在 lib/domains/self-model/trait-library.ts 里。要加到 300 条，
-- 那个文件会变成三千行，而且每加一批都得改代码、跑测试、发一次版。
--
-- 搬进表之后：判定逻辑仍然在代码里（纯函数、可测试、AI 碰不到），
-- 只是**规则从表里读**。之后加到 300、500 都只是灌数据。
--
-- 品级由条件难度自动定，不由人一条条指定：
--   1 个条件         普通 / 魔法
--   2 个条件         稀有
--   3 个条件         史诗
--   4 个条件或含极值  传说
-- 条件越多越难同时成立，所以稀有度就是"这几件事同时发生的概率"——
-- 这比拍脑袋分档诚实得多。

create table if not exists trait_catalog (
  key         text primary key,
  name        text not null,
  gloss       text not null,
  family      text not null
              check (family in ('dial', 'combo', 'absence', 'tempo', 'ratio')),
  -- 拨杆才有：它绑在哪根光谱上（互斥用）。组合类为 null。
  spectrum_key text,
  pole        text check (pole in ('negative', 'positive')),
  -- 条件全部为 AND：[{ "sub": "wil.closure", "op": "gte", "value": 15 }]
  conditions  jsonb not null,
  -- 挂到哪些子属性：[{ "sub": "...", "sign": "plus"|"minus", "note": "..." }]
  modifiers   jsonb not null default '[]'::jsonb,
  backfire    text,
  equip_note  text,
  set_key     text,
  -- 由条件难度算出来的品级，写在这里只是为了排序和展示；
  -- 真正的品级仍然由 traits.ts 从修正结构 + 证据强度结算。
  rarity_hint text not null default 'common',
  -- ⚠️ 集齐不是奖励，是提醒
  alarm       boolean not null default false,
  neutral     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_trait_catalog_family
  on trait_catalog (family, rarity_hint);

-- 目录是共享的定义，不是某个人的数据：任何登录用户都能读，但只有
-- service role 能写（灌数据走迁移，不走应用）。
alter table trait_catalog enable row level security;

drop policy if exists "trait_catalog_read" on trait_catalog;
create policy "trait_catalog_read" on trait_catalog
  for select using (auth.uid() is not null);

-- 第一批：从 lib/domains/self-model/trait-library.ts 导出的 80 条。
-- 生成方式见提交记录；之后新增直接往这张表灌，不用改代码。
insert into trait_catalog
  (key, name, gloss, family, spectrum_key, pole, conditions, modifiers,
   backfire, equip_note, set_key, rarity_hint, alarm, neutral)
values
  ('开工-', '湿柴', '总要先预热三小时', 'dial', '开工', 'negative', '[{"sub":"dex.ignition","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.ignition","sign":"minus","note":"点不着"}]'::jsonb, null, null, null, 'common', false, false),
  ('开工+', '火折子', '想到就动手', 'dial', '开工', 'positive', '[{"sub":"dex.ignition","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.ignition","sign":"plus","note":"一擦就着"},{"sub":"wis.contact","sign":"minus","note":"快到来不及先问一句"}]'::jsonb, '需求靠自己认定时，动手越快错得越远', '在需求已经明确的活上是纯资产', null, 'common', false, false),
  ('迭代-', '一炉定型', '指望一次成器', 'dial', '迭代', 'negative', '[{"sub":"dex.iteration","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.iteration","sign":"minus","note":"只出一版"}]'::jsonb, null, null, null, 'common', false, false),
  ('迭代+', '千锤手', '改到对为止', 'dial', '迭代', 'positive', '[{"sub":"dex.iteration","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.iteration","sign":"plus","note":"反复回炉"}]'::jsonb, null, null, null, 'common', false, false),
  ('战线-', '独锋', '一次只打一处', 'dial', '战线', 'negative', '[{"sub":"dex.parallel","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.parallel","sign":"minus","note":"同时只开一件"}]'::jsonb, null, null, null, 'common', false, true),
  ('战线+', '多头蛇', '同时开好几件', 'dial', '战线', 'positive', '[{"sub":"dex.parallel","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.parallel","sign":"plus","note":"并行度高"},{"sub":"wil.span","sign":"minus","note":"每件都熬不到底"}]'::jsonb, '并行数超过 3 时，每件的最长跨度都被砍短', '在探索期是资产，进交付期是负债', null, 'common', false, true),
  ('校准-', '摇骰子', '把握度全凭感觉', 'dial', '校准', 'negative', '[{"sub":"int.calibration","op":"lte","value":6}]'::jsonb, '[{"sub":"int.calibration","sign":"minus","note":"命中率低"}]'::jsonb, null, null, null, 'common', false, false),
  ('校准+', '测风者', '说八成就是八成', 'dial', '校准', 'positive', '[{"sub":"int.calibration","op":"gte","value":15}]'::jsonb, '[{"sub":"int.calibration","sign":"plus","note":"押得准"}]'::jsonb, null, null, null, 'common', false, false),
  ('复错-', '鬼打墙', '绕回同一个坑', 'dial', '复错', 'negative', '[{"sub":"int.repeat","op":"lte","value":6}]'::jsonb, '[{"sub":"int.repeat","sign":"minus","note":"学到了在重复"}]'::jsonb, null, null, null, 'common', false, false),
  ('复错+', '刻碑人', '学一次就刻死', 'dial', '复错', 'positive', '[{"sub":"int.repeat","op":"gte","value":15}]'::jsonb, '[{"sub":"int.repeat","sign":"plus","note":"不重复犯"}]'::jsonb, null, null, null, 'common', false, false),
  ('学用-', '藏经阁', '存了一屋子没翻过', 'dial', '学用', 'negative', '[{"sub":"int.transfer","op":"lte","value":6}]'::jsonb, '[{"sub":"int.transfer","sign":"minus","note":"学了不用"}]'::jsonb, null, null, null, 'common', false, false),
  ('学用+', '野路子', '边做边补', 'dial', '学用', 'positive', '[{"sub":"int.transfer","op":"gte","value":15}]'::jsonb, '[{"sub":"int.transfer","sign":"plus","note":"学完就用上"}]'::jsonb, null, null, null, 'common', false, false),
  ('接触-', '塔中人', '关在塔里做东西', 'dial', '接触', 'negative', '[{"sub":"wis.contact","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.contact","sign":"minus","note":"很少问真人"},{"sub":"dex.iteration","sign":"plus","note":"不等回复所以转得快"}]'::jsonb, '需求 100% 自我认定时，转得越快离得越远', '在需求已知的活上，独处产出确实更高', null, 'common', false, false),
  ('接触+', '游商', '到处问、到处换', 'dial', '接触', 'positive', '[{"sub":"wis.contact","op":"gte","value":15}]'::jsonb, '[{"sub":"wis.contact","sign":"plus","note":"接触密度高"}]'::jsonb, null, null, null, 'common', false, false),
  ('诚实-', '喜鹊', '只报喜', 'dial', '诚实', 'negative', '[{"sub":"wis.candor","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.candor","sign":"minus","note":"不利证据记得少"}]'::jsonb, null, null, null, 'common', false, false),
  ('诚实+', '验尸官', '敢看难看的那一面', 'dial', '诚实', 'positive', '[{"sub":"wis.candor","op":"gte","value":15}]'::jsonb, '[{"sub":"wis.candor","sign":"plus","note":"对己不利的照记"}]'::jsonb, null, null, null, 'common', false, false),
  ('纳谏-', '铁头盔', '听不进去', 'dial', '纳谏', 'negative', '[{"sub":"wis.persuadable","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.persuadable","sign":"minus","note":"被反驳也不改"},{"sub":"wil.restraint","sign":"plus","note":"不容易被带跑"}]'::jsonb, '反驳来自比你懂的人时，这顶头盔是纯亏', null, null, 'common', false, true),
  ('纳谏+', '风向旗', '谁说都听', 'dial', '纳谏', 'positive', '[{"sub":"wis.persuadable","op":"gte","value":15}]'::jsonb, '[{"sub":"wis.persuadable","sign":"plus","note":"改得快"},{"sub":"wil.restraint","sign":"minus","note":"容易被带着开新坑"}]'::jsonb, '没有自己的判断时，改得快只是被最后一个说话的人牵着走', null, null, 'common', false, true),
  ('收敛-', '半座桥', '起了头没收尾', 'dial', '收敛', 'negative', '[{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.closure","sign":"minus","note":"走到结论的少"},{"sub":"dex.iteration","sign":"plus","note":"不恋战，转得快"}]'::jsonb, '需要交付的环境里是纯负债', '在纯探索期，不恋战确实省时间', null, 'common', false, false),
  ('收敛+', '封顶匠', '起的头都封了顶', 'dial', '收敛', 'positive', '[{"sub":"wil.closure","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.closure","sign":"plus","note":"都走到 Go/Kill"}]'::jsonb, null, null, null, 'common', false, false),
  ('熬功-', '篝火客', '只坐一夜就走', 'dial', '熬功', 'negative', '[{"sub":"wil.span","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"minus","note":"跨度短"}]'::jsonb, null, null, null, 'common', false, false),
  ('熬功+', '掘井人', '下去就不上来', 'dial', '熬功', 'positive', '[{"sub":"wil.span","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"单主题投入极长"},{"sub":"lck.newcontext","sign":"minus","note":"一直待在同一口井里"}]'::jsonb, '井挖到一半发现没水时，沉没成本最难放手', '在方向已验证过的事上是纯资产', null, 'common', false, false),
  ('克制-', '捡石头', '见亮的就捡', 'dial', '克制', 'negative', '[{"sub":"wil.restraint","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.restraint","sign":"minus","note":"新坑开得勤"}]'::jsonb, null, null, null, 'common', false, false),
  ('克制+', '压舱石', '按得住手', 'dial', '克制', 'positive', '[{"sub":"wil.restraint","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.restraint","sign":"plus","note":"很少开新坑"}]'::jsonb, null, null, null, 'common', false, false),
  ('采纳-', '空谷回音', '喊完只有回声', 'dial', '采纳', 'negative', '[{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.adoption","sign":"minus","note":"提议少被接受"}]'::jsonb, null, null, null, 'common', false, false),
  ('采纳+', '铜锣手', '一敲全场都听见', 'dial', '采纳', 'positive', '[{"sub":"cha.adoption","op":"gte","value":15}]'::jsonb, '[{"sub":"cha.adoption","sign":"plus","note":"提议多被接受"}]'::jsonb, null, null, null, 'common', false, false),
  ('曝光-', '地窖', '做完了也不给人看', 'dial', '曝光', 'negative', '[{"sub":"cha.exposure","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.exposure","sign":"minus","note":"半成品不外露"}]'::jsonb, null, null, null, 'common', false, false),
  ('曝光+', '摆摊人', '没做完就摆出来', 'dial', '曝光', 'positive', '[{"sub":"cha.exposure","op":"gte","value":15}]'::jsonb, '[{"sub":"cha.exposure","sign":"plus","note":"早早给人看"}]'::jsonb, null, null, null, 'common', false, false),
  ('承诺-', '赊账', '总说回头再说', 'dial', '承诺', 'negative', '[{"sub":"cha.commitment","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.commitment","sign":"minus","note":"兑现率低"}]'::jsonb, null, null, null, 'common', false, false),
  ('承诺+', '押印', '说了就盖章', 'dial', '承诺', 'positive', '[{"sub":"cha.commitment","op":"gte","value":15}]'::jsonb, '[{"sub":"cha.commitment","sign":"plus","note":"承诺都兑现"}]'::jsonb, null, null, null, 'common', false, false),
  ('力量-', '木剑', '还在用练习剑', 'dial', '力量', 'negative', '[{"sub":"str.absolute","op":"lte","value":6}]'::jsonb, '[{"sub":"str.absolute","sign":"minus","note":"力量没长"}]'::jsonb, null, null, null, 'common', false, false),
  ('力量+', '扛石人', '一直在加片', 'dial', '力量', 'positive', '[{"sub":"str.absolute","op":"gte","value":15}]'::jsonb, '[{"sub":"str.absolute","sign":"plus","note":"力量在涨"}]'::jsonb, null, null, null, 'common', false, false),
  ('训练量-', '一炷香', '进去一会儿就走', 'dial', '训练量', 'negative', '[{"sub":"str.volume","op":"lte","value":6}]'::jsonb, '[{"sub":"str.volume","sign":"minus","note":"容量小"}]'::jsonb, null, null, null, 'common', false, false),
  ('训练量+', '铁砧', '扛得住量', 'dial', '训练量', 'positive', '[{"sub":"str.volume","op":"gte","value":15}]'::jsonb, '[{"sub":"str.volume","sign":"plus","note":"周吨位高"}]'::jsonb, null, null, null, 'common', false, false),
  ('有氧-', '一里路', '跑一里就喘', 'dial', '有氧', 'negative', '[{"sub":"con.aerobic","op":"lte","value":6}]'::jsonb, '[{"sub":"con.aerobic","sign":"minus","note":"有氧少"}]'::jsonb, null, null, null, 'common', false, false),
  ('有氧+', '驿马', '跑起来不停', 'dial', '有氧', 'positive', '[{"sub":"con.aerobic","op":"gte","value":15}]'::jsonb, '[{"sub":"con.aerobic","sign":"plus","note":"有氧足"}]'::jsonb, null, null, null, 'common', false, false),
  ('出勤-', '荒场', '练武场空着', 'dial', '出勤', 'negative', '[{"sub":"con.regular","op":"lte","value":6}]'::jsonb, '[{"sub":"con.regular","sign":"minus","note":"去得少"}]'::jsonb, null, null, null, 'common', false, false),
  ('出勤+', '日课僧', '风雨无阻', 'dial', '出勤', 'positive', '[{"sub":"con.regular","op":"gte","value":15}]'::jsonb, '[{"sub":"con.regular","sign":"plus","note":"出勤稳"}]'::jsonb, null, null, null, 'common', false, false),
  ('睡眠-', '夜枭', '睡够七小时的夜很少', 'dial', '睡眠', 'negative', '[{"sub":"con.sleep","op":"lte","value":6}]'::jsonb, '[{"sub":"con.sleep","sign":"minus","note":"睡眠债高"}]'::jsonb, null, null, null, 'common', false, false),
  ('睡眠+', '晨钟', '睡得够也睡得准', 'dial', '睡眠', 'positive', '[{"sub":"con.sleep","op":"gte","value":15}]'::jsonb, '[{"sub":"con.sleep","sign":"plus","note":"睡眠稳"}]'::jsonb, null, null, null, 'common', false, false),
  ('结识-', '常客', '永远同一张桌', 'dial', '结识', 'negative', '[{"sub":"lck.newfaces","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newfaces","sign":"minus","note":"新面孔少"}]'::jsonb, null, null, null, 'common', false, false),
  ('结识+', '串门', '见谁聊谁', 'dial', '结识', 'positive', '[{"sub":"lck.newfaces","op":"gte","value":15}]'::jsonb, '[{"sub":"lck.newfaces","sign":"plus","note":"新面孔多"}]'::jsonb, null, null, null, 'common', false, false),
  ('场子-', '旧地图', '只玩打熟的那几张图', 'dial', '场子', 'negative', '[{"sub":"lck.newcontext","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newcontext","sign":"minus","note":"情境少"}]'::jsonb, null, null, null, 'common', false, false),
  ('场子+', '探路人', '一直在开图', 'dial', '场子', 'positive', '[{"sub":"lck.newcontext","op":"gte","value":15}]'::jsonb, '[{"sub":"lck.newcontext","sign":"plus","note":"情境多"}]'::jsonb, null, null, null, 'common', false, false),
  ('意外-', '无风带', '什么都不会撞上来', 'dial', '意外', 'negative', '[{"sub":"lck.serendipity","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.serendipity","sign":"minus","note":"意外收获少"}]'::jsonb, null, null, null, 'common', false, false),
  ('意外+', '拾获者', '总能捡到东西', 'dial', '意外', 'positive', '[{"sub":"lck.serendipity","op":"gte","value":15}]'::jsonb, '[{"sub":"lck.serendipity","sign":"plus","note":"意外收获多"}]'::jsonb, null, null, null, 'common', false, false),
  ('余裕-', '空仓', '粮仓见底', 'dial', '余裕', 'negative', '[{"sub":"res.runway","op":"lte","value":6}]'::jsonb, '[{"sub":"res.runway","sign":"minus","note":"跑道短"}]'::jsonb, null, null, null, 'common', false, false),
  ('余裕+', '粮草官', '粮草充足', 'dial', '余裕', 'positive', '[{"sub":"res.runway","op":"gte","value":15}]'::jsonb, '[{"sub":"res.runway","sign":"plus","note":"跑道长"}]'::jsonb, null, null, null, 'common', false, false),
  ('援军-', '独狼', '没人可叫', 'dial', '援军', 'negative', '[{"sub":"res.allies","op":"lte","value":6}]'::jsonb, '[{"sub":"res.allies","sign":"minus","note":"可动员的人少"}]'::jsonb, null, null, null, 'common', false, false),
  ('援军+', '持号角', '吹了会有人来', 'dial', '援军', 'positive', '[{"sub":"res.allies","op":"gte","value":15}]'::jsonb, '[{"sub":"res.allies","sign":"plus","note":"可动员的人多"}]'::jsonb, null, null, null, 'common', false, false),
  ('时间-', '无自留地', '一周没几个钟头是自己的', 'dial', '时间', 'negative', '[{"sub":"res.time","op":"lte","value":6}]'::jsonb, '[{"sub":"res.time","sign":"minus","note":"可支配时间少"}]'::jsonb, null, null, null, 'common', false, false),
  ('时间+', '闲庭', '有整块属于自己的时间', 'dial', '时间', 'positive', '[{"sub":"res.time","op":"gte","value":15}]'::jsonb, '[{"sub":"res.time","sign":"plus","note":"可支配时间多"}]'::jsonb, null, null, null, 'common', false, false),
  ('识破-', '照单全收', '埋好的坑都踩了', 'dial', '识破', 'negative', '[{"sub":"int.decoy","op":"lte","value":6}]'::jsonb, '[{"sub":"int.decoy","sign":"minus","note":"识破率低"}]'::jsonb, null, null, null, 'common', false, false),
  ('识破+', '挑刺的眼', '一眼看出哪里不对', 'dial', '识破', 'positive', '[{"sub":"int.decoy","op":"gte","value":15}]'::jsonb, '[{"sub":"int.decoy","sign":"plus","note":"识破率高"}]'::jsonb, null, null, null, 'common', false, false),
  ('对账-', '翻篇', '事前写的条件事后不看', 'dial', '对账', 'negative', '[{"sub":"wil.precommit","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.precommit","sign":"minus","note":"很少回头对照"}]'::jsonb, null, null, null, 'common', false, false),
  ('对账+', '照单核对', '写下的条件逐条兑现', 'dial', '对账', 'positive', '[{"sub":"wil.precommit","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.precommit","sign":"plus","note":"都回头对照过"}]'::jsonb, null, null, null, 'common', false, false),
  ('灰色-', '雾里的钟点', '一周有大段说不清去哪了', 'dial', '灰色', 'negative', '[{"sub":"res.gray","op":"lte","value":6}]'::jsonb, '[{"sub":"res.gray","sign":"minus","note":"灰色时间多"}]'::jsonb, null, null, null, 'common', false, false),
  ('灰色+', '账目清楚', '时间去哪了说得出来', 'dial', '灰色', 'positive', '[{"sub":"res.gray","op":"gte","value":15}]'::jsonb, '[{"sub":"res.gray","sign":"plus","note":"灰色时间少"}]'::jsonb, null, null, null, 'common', false, false),
  ('combo.cellar', '地窖酿酒师', '埋头酿得很深，没人尝过', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"wis.contact","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"深度"},{"sub":"cha.exposure","sign":"minus","note":"无人品尝"}]'::jsonb, '酿到一半发现没人喝时，最难放手', null, null, 'rare', false, false),
  ('combo.fivewells', '同时挖五口井', '每口都按 180 天的方式挖', 'combo', null, null, '[{"sub":"dex.parallel","op":"gte","value":15},{"sub":"wil.span","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.parallel","sign":"plus","note":"并行"},{"sub":"wil.closure","sign":"minus","note":"全是半成品"}]'::jsonb, '并行数超过 3 时，每口井都挖不到水', null, null, 'rare', true, false),
  ('combo.lightnocook', '起灶不掌勺', '点火极快，收尾没有', 'combo', null, null, '[{"sub":"dex.ignition","op":"gte","value":15},{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.ignition","sign":"plus","note":"起手快"},{"sub":"wil.closure","sign":"minus","note":"收不了尾"}]'::jsonb, '需要交付的环境里，点得越快亏得越多', null, null, 'rare', true, false),
  ('combo.clearvoiceless', '看得清喊不动', '判断准，推不动人', 'combo', null, null, '[{"sub":"wis.candor","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.candor","sign":"plus","note":"看得清"},{"sub":"cha.adoption","sign":"minus","note":"没人动"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.loudwrong', '嗓门大过准头', '说服力强，但估不准 —— 最危险的一种', 'combo', null, null, '[{"sub":"cha.adoption","op":"gte","value":15},{"sub":"int.calibration","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.adoption","sign":"plus","note":"推得动"},{"sub":"int.calibration","sign":"minus","note":"押不准"}]'::jsonb, '别人照你说的做了，而你算错了', null, null, 'rare', true, false),
  ('combo.millstone', '空转的磨盘', '一直在转，没磨出面', 'combo', null, null, '[{"sub":"dex.iteration","op":"gte","value":15},{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.iteration","sign":"plus","note":"转得快"},{"sub":"wil.closure","sign":"minus","note":"没出成品"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.emptygranary', '守着空粮仓', '很能忍，但仓里没粮', 'combo', null, null, '[{"sub":"wil.restraint","op":"gte","value":15},{"sub":"res.runway","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.restraint","sign":"plus","note":"按得住"},{"sub":"res.runway","sign":"minus","note":"跑道短"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.onearmed', '独臂铁匠', '全靠自己一双手', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"res.allies","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"自己扛"},{"sub":"res.allies","sign":"minus","note":"没人可叫"}]'::jsonb, '一病就全停', null, null, 'rare', false, false),
  ('combo.nightlamp', '夜里的灯', '进度是熬出来的', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"con.sleep","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"熬得住"},{"sub":"con.sleep","sign":"minus","note":"睡眠债"}]'::jsonb, '债总要还，而且是连本带利', null, null, 'rare', true, false),
  ('combo.allplans', '满手计划', '开得多，结的少', 'combo', null, null, '[{"sub":"dex.parallel","op":"gte","value":15},{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.parallel","sign":"plus","note":"并行"},{"sub":"wil.closure","sign":"minus","note":"收敛低"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.knocknodoor', '走遍全城不敲门', '认识很多人，没人替你办事', 'combo', null, null, '[{"sub":"lck.newfaces","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newfaces","sign":"plus","note":"面孔多"},{"sub":"cha.adoption","sign":"minus","note":"没人动"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.hoardnomarch', '屯粮不出兵', '粮草足，就是不发兵', 'combo', null, null, '[{"sub":"res.runway","op":"gte","value":15},{"sub":"dex.ignition","op":"lte","value":6}]'::jsonb, '[{"sub":"res.runway","sign":"plus","note":"余裕"},{"sub":"dex.ignition","sign":"minus","note":"不动手"}]'::jsonb, '跑道最长的时候不动，等短了更不敢动', null, null, 'rare', false, false),
  ('combo.seesnocount', '会看不会算', '敢看坏消息，但估不准', 'combo', null, null, '[{"sub":"wis.candor","op":"gte","value":15},{"sub":"int.calibration","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.candor","sign":"plus","note":"敢看"},{"sub":"int.calibration","sign":"minus","note":"算不准"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.emptyhammer', '铁砧上的空锤', '练得很多，力气没长', 'combo', null, null, '[{"sub":"str.volume","op":"gte","value":15},{"sub":"str.absolute","op":"lte","value":6}]'::jsonb, '[{"sub":"str.volume","sign":"plus","note":"量够"},{"sub":"str.absolute","sign":"minus","note":"没进步"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.nomap', '跑得快没带地图', '动手极快，场子只有那几个', 'combo', null, null, '[{"sub":"dex.ignition","op":"gte","value":15},{"sub":"lck.newcontext","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.ignition","sign":"plus","note":"起手快"},{"sub":"lck.newcontext","sign":"minus","note":"情境少"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.debtor', '债主的常客', '认识越多，欠得越多', 'combo', null, null, '[{"sub":"lck.newfaces","op":"gte","value":15},{"sub":"cha.commitment","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newfaces","sign":"plus","note":"面孔多"},{"sub":"cha.commitment","sign":"minus","note":"兑现低"}]'::jsonb, '圈子越大，欠账被看见得越快', null, null, 'rare', true, false),
  ('combo.wellbooks', '井底的藏书', '读了很多，用在同一口井里', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"int.transfer","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"钻得深"},{"sub":"int.transfer","sign":"minus","note":"学了不用"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.unheardbell', '无人应答的钟', '一直在敲，没人来', 'combo', null, null, '[{"sub":"cha.exposure","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.exposure","sign":"plus","note":"敢给人看"},{"sub":"cha.adoption","sign":"minus","note":"没人接"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.veteranmap', '熟地图上的老兵', '在同一张图上打了很久', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"lck.newcontext","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"耐得住"},{"sub":"lck.newcontext","sign":"minus","note":"没换过场子"}]'::jsonb, '这张图打完之后，没有第二张', null, null, 'rare', false, false),
  ('combo.scavenger', '拾荒者的仓库', '什么都捡，什么都不用', 'combo', null, null, '[{"sub":"wil.restraint","op":"lte","value":6},{"sub":"int.transfer","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.restraint","sign":"minus","note":"见亮就捡"},{"sub":"int.transfer","sign":"minus","note":"捡了不用"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.rightunheard', '铁口无人听', '算得准，没人听', 'combo', null, null, '[{"sub":"int.calibration","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"int.calibration","sign":"plus","note":"押得准"},{"sub":"cha.adoption","sign":"minus","note":"推不动"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.deafsmith', '闭耳的铁匠', '手艺在长，反话进不来', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"wis.persuadable","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"沉得住"},{"sub":"wis.persuadable","sign":"minus","note":"听不进"}]'::jsonb, '方向错的时候，越沉得住亏得越大', null, null, 'rare', true, false)
on conflict (key) do update set
  name = excluded.name,
  gloss = excluded.gloss,
  conditions = excluded.conditions,
  modifiers = excluded.modifiers,
  backfire = excluded.backfire,
  rarity_hint = excluded.rarity_hint,
  alarm = excluded.alarm;


-- ---------------------------------------------------------------------------
-- 043_trait_catalog_batch2.sql
-- ---------------------------------------------------------------------------

-- 第二批特性：101 条两条件组合。
--
-- 每条只回答一件事：**哪两件事同时成立**。单看每一项都不算什么，
-- 合起来才有话说 —— 「做得动」不稀奇，「做得动 + 不问人」才是闷头造。
--
-- 修正由条件自动推出（gte→加，lte→减），不另外手写：
-- 那样才不会出现"名字说的和条件算的不是一回事"。
-- 品级统一标 rare（两个条件），真正的品级仍由 traits.ts 从修正结构
-- 和证据强度结算。

insert into trait_catalog
  (key, name, gloss, family, spectrum_key, pole, conditions, modifiers,
   backfire, equip_note, set_key, rarity_hint, alarm, neutral)
values
  ('c.cellar2', '闷头造', '做得动，就是不问人', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "wis.contact", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.fastblind', '蒙眼冲刺', '起手极快，问都没问', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 15}, {"sub": "wis.contact", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.shipnoone', '无人认领', '做完了，没人在等', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 15}, {"sub": "cha.adoption", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.loudempty', '空锣', '敢给人看，但没人接', 'combo', null, null, '[{"sub": "cha.exposure", "op": "gte", "value": 15}, {"sub": "cha.adoption", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.exposure", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.quietgood', '深巷酒', '东西做得完，就是不外露', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.trypitch', '只顾说', '提得多，做完的少', 'combo', null, null, '[{"sub": "cha.exposure", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.exposure", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.surefast', '拍脑袋快手', '动得快，押不准', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 15}, {"sub": "int.calibration", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.sureloud', '自信喊话', '推得动，算不准', 'combo', null, null, '[{"sub": "cha.adoption", "op": "gte", "value": 15}, {"sub": "int.calibration", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.rightslow', '算得准动得慢', '押得准，就是不动手', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 15}, {"sub": "dex.ignition", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "dex.ignition", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.rightalone', '准而无人', '判断准，没人听', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 15}, {"sub": "cha.adoption", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.blindloop', '闭眼绕圈', '老犯同一个错，还押不准', 'combo', null, null, '[{"sub": "int.repeat", "op": "lte", "value": 6}, {"sub": "int.calibration", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.repeat", "sign": "minus", "note": ""}, {"sub": "int.calibration", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.sharpeye', '眼毒', '看得穿套路，也押得准', 'combo', null, null, '[{"sub": "int.decoy", "op": "gte", "value": 15}, {"sub": "int.calibration", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "int.decoy", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.trap', '照单全收', '识不破，也不敢记坏消息', 'combo', null, null, '[{"sub": "int.decoy", "op": "lte", "value": 6}, {"sub": "wis.candor", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.decoy", "sign": "minus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.seeandsay', '敢看敢说', '记坏消息，也敢给人看', 'combo', null, null, '[{"sub": "wis.candor", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wis.candor", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.seealone', '自己知道', '看得见问题，不说出去', 'combo', null, null, '[{"sub": "wis.candor", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wis.candor", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.sugarfast', '报喜快手', '动得快，只记好消息', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 15}, {"sub": "wis.candor", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.deafproud', '既不听也不认', '听不进反话，也不记不利证据', 'combo', null, null, '[{"sub": "wis.persuadable", "op": "lte", "value": 6}, {"sub": "wis.candor", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wis.persuadable", "sign": "minus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.opengate', '门开着', '听得进，也敢看难看的', 'combo', null, null, '[{"sub": "wis.persuadable", "op": "gte", "value": 15}, {"sub": "wis.candor", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wis.persuadable", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.debtwide', '欠得广', '认识很多人，欠着很多账', 'combo', null, null, '[{"sub": "lck.newfaces", "op": "gte", "value": 15}, {"sub": "cha.commitment", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "lck.newfaces", "sign": "plus", "note": ""}, {"sub": "cha.commitment", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.keepnarrow', '小圈可靠', '圈子不大，说到做到', 'combo', null, null, '[{"sub": "cha.commitment", "op": "gte", "value": 15}, {"sub": "lck.newfaces", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.commitment", "sign": "plus", "note": ""}, {"sub": "lck.newfaces", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.aloneword', '独行守诺', '没人可叫，但自己说到做到', 'combo', null, null, '[{"sub": "cha.commitment", "op": "gte", "value": 15}, {"sub": "res.allies", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.commitment", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.hornempty', '号角无人', '有号角，吹了没人来', 'combo', null, null, '[{"sub": "res.allies", "op": "lte", "value": 6}, {"sub": "cha.adoption", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.allies", "sign": "minus", "note": ""}, {"sub": "cha.adoption", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.armyofone', '一人一军', '没人可叫，全靠自己扛', 'combo', null, null, '[{"sub": "res.allies", "op": "lte", "value": 6}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "res.allies", "sign": "minus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.deepnarrow', '一口井到底', '钻得深，场子只有一个', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "lck.newcontext", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "lck.newcontext", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.deepbroke', '熬到粮尽', '熬得住，粮仓快空了', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "res.runway", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "res.runway", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.shortwide', '浅尝百味', '什么都碰，什么都不深', 'combo', null, null, '[{"sub": "wil.span", "op": "lte", "value": 6}, {"sub": "lck.newcontext", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wil.span", "sign": "minus", "note": ""}, {"sub": "lck.newcontext", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.spreadthin', '摊得太薄', '开得多，熬不住', 'combo', null, null, '[{"sub": "dex.parallel", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.holdfast', '咬住不放', '熬得住，也收得了尾', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.dropall', '半途成瘾', '开得多，收得少', 'combo', null, null, '[{"sub": "dex.parallel", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.itchbroke', '手痒又缺粮', '见亮就捡，仓里没粮', 'combo', null, null, '[{"sub": "wil.restraint", "op": "lte", "value": 6}, {"sub": "res.runway", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.restraint", "sign": "minus", "note": ""}, {"sub": "res.runway", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.holdrich', '按得住的富户', '有余粮，也按得住手', 'combo', null, null, '[{"sub": "wil.restraint", "op": "gte", "value": 15}, {"sub": "res.runway", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wil.restraint", "sign": "plus", "note": ""}, {"sub": "res.runway", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.itchdeep', '边挖边捡', '挖得深，还老想开新坑', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "wil.restraint", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wil.restraint", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.discipline', '自律闭环', '按得住手，也照单核对', 'combo', null, null, '[{"sub": "wil.restraint", "op": "gte", "value": 15}, {"sub": "wil.precommit", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wil.restraint", "sign": "plus", "note": ""}, {"sub": "wil.precommit", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.forgetown', '自己说的自己忘', '写了条件，事后不看', 'combo', null, null, '[{"sub": "wil.precommit", "op": "lte", "value": 6}, {"sub": "int.repeat", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.precommit", "sign": "minus", "note": ""}, {"sub": "int.repeat", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.ironmind', '铁人脑', '练得住，也熬得住', 'combo', null, null, '[{"sub": "con.regular", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "con.regular", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.burnbody', '透支型', '熬得久，睡得差', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "con.sleep", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "con.sleep", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.wellrest', '睡够的清醒', '睡得稳，押得准', 'combo', null, null, '[{"sub": "con.sleep", "op": "gte", "value": 15}, {"sub": "int.calibration", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "con.sleep", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.paperfast', '纸片快手', '动得快，身体空', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 15}, {"sub": "con.regular", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "con.regular", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.gymnowork', '只练不产', '练得勤，收敛率低', 'combo', null, null, '[{"sub": "con.regular", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "con.regular", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.strongsteady', '力量与出勤', '既加片，也不缺勤', 'combo', null, null, '[{"sub": "str.absolute", "op": "gte", "value": 15}, {"sub": "con.regular", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "str.absolute", "sign": "plus", "note": ""}, {"sub": "con.regular", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.volumenogain', '白练', '量够，力气没长', 'combo', null, null, '[{"sub": "str.volume", "op": "gte", "value": 15}, {"sub": "str.absolute", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "str.volume", "sign": "plus", "note": ""}, {"sub": "str.absolute", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.cardiodesk', '跑得动坐不住', '有氧足，专注短', 'combo', null, null, '[{"sub": "con.aerobic", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "con.aerobic", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.owlmiss', '夜里犯错', '睡得少，老栽同一个坑', 'combo', null, null, '[{"sub": "con.sleep", "op": "lte", "value": 6}, {"sub": "int.repeat", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "con.sleep", "sign": "minus", "note": ""}, {"sub": "int.repeat", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.owlalone', '夜里独行', '熬夜，也不见人', 'combo', null, null, '[{"sub": "con.sleep", "op": "lte", "value": 6}, {"sub": "wis.contact", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "con.sleep", "sign": "minus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.restedbold', '睡够敢开口', '睡得稳，敢给人看', 'combo', null, null, '[{"sub": "con.sleep", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "con.sleep", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.foggyday', '雾里一天', '灰色时间多，自己的时间少', 'combo', null, null, '[{"sub": "res.gray", "op": "lte", "value": 6}, {"sub": "res.time", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.gray", "sign": "minus", "note": ""}, {"sub": "res.time", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.cleartime', '账目清楚的余裕', '时间说得清，也留得出', 'combo', null, null, '[{"sub": "res.gray", "op": "gte", "value": 15}, {"sub": "res.time", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "res.gray", "sign": "plus", "note": ""}, {"sub": "res.time", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.busybroke', '又忙又穷', '没有自己的时间，粮仓也空', 'combo', null, null, '[{"sub": "res.time", "op": "lte", "value": 6}, {"sub": "res.runway", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.time", "sign": "minus", "note": ""}, {"sub": "res.runway", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.freeidle', '有闲不动', '时间有的是，就是不动手', 'combo', null, null, '[{"sub": "res.time", "op": "gte", "value": 15}, {"sub": "dex.ignition", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.time", "sign": "plus", "note": ""}, {"sub": "dex.ignition", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.richnotime', '有钱没空', '跑道长，时间不是自己的', 'combo', null, null, '[{"sub": "res.runway", "op": "gte", "value": 15}, {"sub": "res.time", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.runway", "sign": "plus", "note": ""}, {"sub": "res.time", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.oldmapdeep', '老地图上的老兵', '只在熟场子里，挖得很深', 'combo', null, null, '[{"sub": "lck.newcontext", "op": "lte", "value": 6}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "minus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.newmapshallow', '到处开图', '场子换得勤，都不深', 'combo', null, null, '[{"sub": "lck.newcontext", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.luckyopen', '撞见好事', '常进新场子，也常捡到东西', 'combo', null, null, '[{"sub": "lck.newcontext", "op": "gte", "value": 15}, {"sub": "lck.serendipity", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "lck.serendipity", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.nowindnoface', '无风带里的独行', '不撞好事，也不认识新人', 'combo', null, null, '[{"sub": "lck.serendipity", "op": "lte", "value": 6}, {"sub": "lck.newfaces", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "lck.serendipity", "sign": "minus", "note": ""}, {"sub": "lck.newfaces", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.facesnoluck', '人多事少', '认识很多人，没撞上什么', 'combo', null, null, '[{"sub": "lck.newfaces", "op": "gte", "value": 15}, {"sub": "lck.serendipity", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "lck.newfaces", "sign": "plus", "note": ""}, {"sub": "lck.serendipity", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.hoardslow', '囤而不动', '学了不用，也不动手', 'combo', null, null, '[{"sub": "int.transfer", "op": "lte", "value": 6}, {"sub": "dex.ignition", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.transfer", "sign": "minus", "note": ""}, {"sub": "dex.ignition", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.learnfast', '现学现干', '学完就用，动得也快', 'combo', null, null, '[{"sub": "int.transfer", "op": "gte", "value": 15}, {"sub": "dex.ignition", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "int.transfer", "sign": "plus", "note": ""}, {"sub": "dex.ignition", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.hoardloop', '囤着重复', '学了不用，坑照踩', 'combo', null, null, '[{"sub": "int.transfer", "op": "lte", "value": 6}, {"sub": "int.repeat", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.transfer", "sign": "minus", "note": ""}, {"sub": "int.repeat", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.applyclose', '学以致用到底', '学完用上，还收得了尾', 'combo', null, null, '[{"sub": "int.transfer", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "int.transfer", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.spinclose', '转得快也收得住', '反复回炉，最后封顶', 'combo', null, null, '[{"sub": "dex.iteration", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "dex.iteration", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.spinopen', '永远在改', '一直回炉，从不封顶', 'combo', null, null, '[{"sub": "dex.iteration", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.iteration", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.onepassblind', '一版定生死', '只出一版，也不问人', 'combo', null, null, '[{"sub": "dex.iteration", "op": "lte", "value": 6}, {"sub": "wis.contact", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.iteration", "sign": "minus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.iterateask', '边改边问', '回炉勤，也常问真人', 'combo', null, null, '[{"sub": "dex.iteration", "op": "gte", "value": 15}, {"sub": "wis.contact", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "dex.iteration", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.talkadopt', '问得多也推得动', '常问真人，提议也被接受', 'combo', null, null, '[{"sub": "wis.contact", "op": "gte", "value": 15}, {"sub": "cha.adoption", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wis.contact", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.talknoadopt', '问了白问', '常问，但提议没人接', 'combo', null, null, '[{"sub": "wis.contact", "op": "gte", "value": 15}, {"sub": "cha.adoption", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wis.contact", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.silentadopt', '闷声办成', '很少问人，提议倒被接受', 'combo', null, null, '[{"sub": "wis.contact", "op": "lte", "value": 6}, {"sub": "cha.adoption", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.helmetdeep', '钢盔深井', '听不进反话，还一路挖到底', 'combo', null, null, '[{"sub": "wis.persuadable", "op": "lte", "value": 6}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wis.persuadable", "sign": "minus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.flagshallow', '风一吹就换', '谁说都听，什么都不深', 'combo', null, null, '[{"sub": "wis.persuadable", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wis.persuadable", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.helmetalone', '闭耳独行', '听不进，也没人可叫', 'combo', null, null, '[{"sub": "wis.persuadable", "op": "lte", "value": 6}, {"sub": "res.allies", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wis.persuadable", "sign": "minus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.precommitclose', '说到做到的收尾', '写了条件，也真收了尾', 'combo', null, null, '[{"sub": "wil.precommit", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wil.precommit", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.precommitblind', '写了不看', '定了退出条件，从不回头对', 'combo', null, null, '[{"sub": "wil.precommit", "op": "lte", "value": 6}, {"sub": "wis.candor", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.precommit", "sign": "minus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.showearly', '早早摆出来', '没做完就给人看，也熬得住', 'combo', null, null, '[{"sub": "cha.exposure", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "cha.exposure", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.hidedeep', '地窖里的长工', '埋头很久，一次没露过', 'combo', null, null, '[{"sub": "cha.exposure", "op": "lte", "value": 6}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "cha.exposure", "sign": "minus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.heardkept', '说得动也做得到', '提议被接受，承诺也兑现', 'combo', null, null, '[{"sub": "cha.adoption", "op": "gte", "value": 15}, {"sub": "cha.commitment", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "cha.commitment", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.heardbroke', '说得动做不到', '推得动别人，自己欠着账', 'combo', null, null, '[{"sub": "cha.adoption", "op": "gte", "value": 15}, {"sub": "cha.commitment", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "cha.commitment", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.samepit', '老坑常客', '同一个坑，还老在同一个场子', 'combo', null, null, '[{"sub": "int.repeat", "op": "lte", "value": 6}, {"sub": "lck.newcontext", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.repeat", "sign": "minus", "note": ""}, {"sub": "lck.newcontext", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.learnclose', '一次就够的收尾', '不重复犯，也收得了尾', 'combo', null, null, '[{"sub": "int.repeat", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "int.repeat", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.pooralone', '又穷又独', '粮仓空，也没人可叫', 'combo', null, null, '[{"sub": "res.runway", "op": "lte", "value": 6}, {"sub": "res.allies", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.richalone', '富而无援', '有余粮，但没人可叫', 'combo', null, null, '[{"sub": "res.runway", "op": "gte", "value": 15}, {"sub": "res.allies", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.runway", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.poorbutfriends', '穷但有人', '粮仓空，人还在', 'combo', null, null, '[{"sub": "res.runway", "op": "lte", "value": 6}, {"sub": "res.allies", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": ""}, {"sub": "res.allies", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.parallelblind', '多线闭门', '同时开好几件，都不问人', 'combo', null, null, '[{"sub": "dex.parallel", "op": "gte", "value": 15}, {"sub": "wis.contact", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.parallelrest', '多线还睡得着', '开得多，也睡得稳', 'combo', null, null, '[{"sub": "dex.parallel", "op": "gte", "value": 15}, {"sub": "con.sleep", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "con.sleep", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.singlefast', '单线快手', '一次只做一件，动得快', 'combo', null, null, '[{"sub": "dex.parallel", "op": "lte", "value": 6}, {"sub": "dex.ignition", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "dex.parallel", "sign": "minus", "note": ""}, {"sub": "dex.ignition", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.trainfree', '有闲能练', '时间是自己的，也真去练', 'combo', null, null, '[{"sub": "res.time", "op": "gte", "value": 15}, {"sub": "con.regular", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "res.time", "sign": "plus", "note": ""}, {"sub": "con.regular", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.notimenogym', '没空没练', '时间不是自己的，也不去练', 'combo', null, null, '[{"sub": "res.time", "op": "lte", "value": 6}, {"sub": "con.regular", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.time", "sign": "minus", "note": ""}, {"sub": "con.regular", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.luckopen', '运气敲门', '常撞好事，也敢给人看', 'combo', null, null, '[{"sub": "lck.serendipity", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "lck.serendipity", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.luckwasted', '撞见了没接住', '撞上好事，收敛率却低', 'combo', null, null, '[{"sub": "lck.serendipity", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "lck.serendipity", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.honestcalib', '敢看也算得准', '记不利证据，押注也准', 'combo', null, null, '[{"sub": "wis.candor", "op": "gte", "value": 15}, {"sub": "int.calibration", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wis.candor", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.rosywrong', '报喜又押偏', '只记好消息，押也押不准', 'combo', null, null, '[{"sub": "wis.candor", "op": "lte", "value": 6}, {"sub": "int.calibration", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wis.candor", "sign": "minus", "note": ""}, {"sub": "int.calibration", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.strongclose', '举得起也收得了', '力气在涨，事也收得了尾', 'combo', null, null, '[{"sub": "str.absolute", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "str.absolute", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.strongalone', '壮而独', '力气在涨，人却不见', 'combo', null, null, '[{"sub": "str.absolute", "op": "gte", "value": 15}, {"sub": "wis.contact", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "str.absolute", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.disciplinedbody', '作息成型', '出勤稳，睡得也够', 'combo', null, null, '[{"sub": "con.regular", "op": "gte", "value": 15}, {"sub": "con.sleep", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "con.regular", "sign": "plus", "note": ""}, {"sub": "con.sleep", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.grindbody', '硬撑的日课', '天天练，睡不够', 'combo', null, null, '[{"sub": "con.regular", "op": "gte", "value": 15}, {"sub": "con.sleep", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "con.regular", "sign": "plus", "note": ""}, {"sub": "con.sleep", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.learnshow', '边学边晒', '学完就用，也敢给人看', 'combo', null, null, '[{"sub": "int.transfer", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "int.transfer", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.learnhide', '偷偷变强', '学完用上，从不外露', 'combo', null, null, '[{"sub": "int.transfer", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.transfer", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.freedeep', '有整块时间的深水', '时间是自己的，也挖得深', 'combo', null, null, '[{"sub": "res.time", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "res.time", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.choppeddeep', '碎时间里挖井', '时间被切碎，还硬挖', 'combo', null, null, '[{"sub": "res.time", "op": "lte", "value": 6}, {"sub": "wil.span", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "res.time", "sign": "minus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.homeonly', '只在主场说得上话', '提议被接受，但场子只有一个', 'combo', null, null, '[{"sub": "cha.adoption", "op": "gte", "value": 15}, {"sub": "lck.newcontext", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "lck.newcontext", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.candorlearn', '敢看才不重复', '记不利证据，坑也不再踩', 'combo', null, null, '[{"sub": "wis.candor", "op": "gte", "value": 15}, {"sub": "int.repeat", "op": "gte", "value": 15}]'::jsonb, '[{"sub": "wis.candor", "sign": "plus", "note": ""}, {"sub": "int.repeat", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.foggyparallel', '忙得说不清', '开得多，时间去哪说不清', 'combo', null, null, '[{"sub": "dex.parallel", "op": "gte", "value": 15}, {"sub": "res.gray", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "res.gray", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.overbooked', '答应太多', '承诺兑现低，自己的时间也没了', 'combo', null, null, '[{"sub": "cha.commitment", "op": "lte", "value": 6}, {"sub": "res.time", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.commitment", "sign": "minus", "note": ""}, {"sub": "res.time", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false)
on conflict (key) do update set
  name = excluded.name,
  gloss = excluded.gloss,
  conditions = excluded.conditions,
  modifiers = excluded.modifiers;


-- ---------------------------------------------------------------------------
-- 044_skill_nodes.sql
-- ---------------------------------------------------------------------------

-- 技能节点：把 0–100 的数值换成一颗颗点亮的节点。
--
-- 数值是错的：这些数字不参与任何判定，也没有分母 —— 「谈判 55」
-- 既不能算，也说不清 55 是什么意思。真正要回答的问题只有一个：
-- **这项手艺我到底会不会用**。
--
-- 所以改成 RPG 的做法：每项技能拆成三个节点（定义在
-- lib/domains/self-model/skills.ts 的 milestones 里，每个都带一句
-- 能判真假的现实标准），点亮一个节点必须写下**证据**：
-- 什么时候、用它做成了什么。
--
-- 写不出那一句就点不亮 —— 这跟打勾那条规矩是同一条：
-- 看教程不算，读书不算，想明白了不算。

create table if not exists self_skill_nodes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- 形如 negotiating:1 —— 技能 key + 第几档
  node_key    text not null,
  skill_key   text not null,
  tier        smallint not null check (tier between 1 and 3),
  -- 证据：什么时候、用它做成了什么。没有它这个节点不该亮。
  proof       text not null,
  unlocked_on date not null default current_date,
  created_at  timestamptz not null default now(),
  constraint self_skill_nodes_once unique (user_id, node_key)
);

create index if not exists idx_self_skill_nodes_user
  on self_skill_nodes (user_id, skill_key, tier);

alter table self_skill_nodes enable row level security;

drop policy if exists "self_skill_nodes_owner" on self_skill_nodes;
create policy "self_skill_nodes_owner" on self_skill_nodes
  for all using (auth.uid() = user_id);

-- 045_skill_stages.sql
create table if not exists self_skill_stages (
  user_id    uuid not null references auth.users (id) on delete cascade,
  skill_key  text not null,
  tier       smallint not null check (tier between 1 and 4),
  stage_name text not null,
  standard   text not null,
  nodes      jsonb not null default '[]'::jsonb,
  source     text not null default 'ai_nominated',
  created_at timestamptz not null default now(),
  primary key (user_id, skill_key, tier)
);

alter table self_skill_stages enable row level security;

drop policy if exists "self_skill_stages_owner" on self_skill_stages;
create policy "self_skill_stages_owner" on self_skill_stages
  for all using (auth.uid() = user_id);

alter table self_skill_nodes
  drop constraint if exists self_skill_nodes_tier_check;
alter table self_skill_nodes
  add constraint self_skill_nodes_tier_check check (tier between 1 and 4);

-- 046_custom_skills.sql
create table if not exists self_custom_skills (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  name       text not null,
  gloss      text not null,
  skill_group text not null,
  main       text not null,
  layer      text not null,
  requires   jsonb not null default '[]'::jsonb,
  milestones jsonb not null default '[]'::jsonb,
  because    text,
  source     text not null default 'ai_nominated',
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table self_custom_skills enable row level security;

drop policy if exists "self_custom_skills_owner" on self_custom_skills;
create policy "self_custom_skills_owner" on self_custom_skills
  for all using (auth.uid() = user_id);

-- 047_trait_catalog_batch3.sql
-- 第三批特性：缺席、起步，以及"一个人在公司里独自推进"这件事的各种形状。
--
-- 和前两批的根本差别：这一批第一次能在**库里几乎没有数据**的时候说话。
-- 因为 dark 看的是样本数，不是分数 ——
-- 「从来没有记过一次真实接触」和「接触这一格分很低」是两句完全不同的话。
-- 前者说的是"还没开始"，后者说的是"试过而且不行"。
-- 用同一个 lte 表达这两件事，就是拿沉默冒充证据。
--
-- thin 是它的邻居：动过，但只动过一两次就停了。
-- 三天热度是一种真实的特性，而且它只在样本数上看得见。
--
-- 缺席类的品级压得很低（magic/rare）：刚开始用的时候满盘皆黑，
-- 那时候发一堆传说出来，传说就不值钱了。

insert into trait_catalog
  (key, name, gloss, family, spectrum_key, pole, conditions, modifiers,
   backfire, equip_note, set_key, rarity_hint, alarm, neutral)
values
  ('a.nocontact', '隔岸', '还没有一次真实接触被记下来', 'absence', null, null, '[{"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.nobet', '空押', '一条已经结算的预测都没有', 'absence', null, null, '[{"sub": "int.calibration", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.calibration", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.noexit', '无退路', '从没有事前写下过退出条件', 'absence', null, null, '[{"sub": "wil.precommit", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.precommit", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '没有事前条件，事后总能给自己找到理由', null, null, 'magic', false, false),
  ('a.noally', '独木', '还没有记下任何一个能开口求援的人', 'absence', null, null, '[{"sub": "res.allies", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.allies", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.noshow', '闭门', '还没有一次把东西拿给外人看', 'absence', null, null, '[{"sub": "cha.exposure", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "cha.exposure", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.nobadnews', '无镜', '还没有记下过一句对自己不利的反馈', 'absence', null, null, '[{"sub": "wis.candor", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.candor", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '只留好消息的账本，翻起来永远是顺的', null, null, 'magic', false, false),
  ('a.nostop', '不熄火', '还没有一次主动喊停的记录', 'absence', null, null, '[{"sub": "wil.restraint", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.restraint", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.nobody', '白纸身', '身体那一栏整个还是空的', 'absence', null, null, '[{"sub": "str.absolute", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "str.absolute", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, true),
  ('a.nosleep', '无更漏', '还没有记过一夜睡眠', 'absence', null, null, '[{"sub": "con.sleep", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "con.sleep", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, true),
  ('a.nogray', '非黑即白', '还没有记录过一次灰度地带的判断', 'absence', null, null, '[{"sub": "res.gray", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.gray", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.noface', '熟人局', '这段时间没有认识过一个新的人', 'absence', null, null, '[{"sub": "lck.newfaces", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.newfaces", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.noscene', '一室', '还没有进过一个新的场合', 'absence', null, null, '[{"sub": "lck.newcontext", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.nofinish', '未收口', '还没有一件事被记成收了尾', 'absence', null, null, '[{"sub": "wil.closure", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.closure", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.nopromise', '空口', '还没有一条对别人的承诺被记下来', 'absence', null, null, '[{"sub": "cha.commitment", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "cha.commitment", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.notransfer', '书生气', '学到的东西还没有一次被用在真事上', 'absence', null, null, '[{"sub": "int.transfer", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.transfer", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '读过不等于会，中间隔着一次真的用', null, null, 'magic', false, false),
  ('a.noadopt', '无人采纳', '还没有一条提案被记成被采纳', 'absence', null, null, '[{"sub": "cha.adoption", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.norepeat', '无复', '还没有记过一次同类错误 —— 也可能只是没在记', 'absence', null, null, '[{"sub": "int.repeat", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.repeat", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, true),
  ('a.notime', '无余', '还没有记过自己一周还剩多少自由时间', 'absence', null, null, '[{"sub": "res.time", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.time", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, true),
  ('a.norunway', '不看表', '还没有算过自己的跑道还有几个月', 'absence', null, null, '[{"sub": "res.runway", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.nolucky', '无风', '还没有记下过一次意外的好事', 'absence', null, null, '[{"sub": "lck.serendipity", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.serendipity", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, true),
  ('a.ghost', '幽灵账', '既没有真实接触，也没有对外露出', 'absence', null, null, '[{"sub": "wis.contact", "op": "dark", "value": 0}, {"sub": "cha.exposure", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.exposure", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.blindfast', '闭眼快手', '没有押过注，也没有写过退出条件', 'absence', null, null, '[{"sub": "int.calibration", "op": "dark", "value": 0}, {"sub": "wil.precommit", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.calibration", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "wil.precommit", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '两样都没有的时候，快只是快', null, null, 'magic', false, false),
  ('a.alonequiet', '无声独行', '既没有可求援的人，也没有认识新的人', 'absence', null, null, '[{"sub": "res.allies", "op": "dark", "value": 0}, {"sub": "lck.newfaces", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.allies", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "lck.newfaces", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.nomirror', '无回声', '既没有记过坏消息，也没有一条被采纳', 'absence', null, null, '[{"sub": "wis.candor", "op": "dark", "value": 0}, {"sub": "cha.adoption", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.candor", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.paperbody', '只剩脑子', '身体和睡眠两栏都还是空的', 'absence', null, null, '[{"sub": "str.absolute", "op": "dark", "value": 0}, {"sub": "con.sleep", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "str.absolute", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "con.sleep", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.samewalls', '同一间屋', '没进过新场合，也没认识新的人', 'absence', null, null, '[{"sub": "lck.newcontext", "op": "dark", "value": 0}, {"sub": "lck.newfaces", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "lck.newfaces", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.openloop', '全是开口', '既没有收过尾，也没有喊过停', 'absence', null, null, '[{"sub": "wil.closure", "op": "dark", "value": 0}, {"sub": "wil.restraint", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.closure", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "wil.restraint", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '开着的事只会越来越多', null, null, 'magic', false, false),
  ('a.bookonly', '全在纸上', '学的东西没用过，也没有做过验证', 'absence', null, null, '[{"sub": "int.transfer", "op": "dark", "value": 0}, {"sub": "int.calibration", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.transfer", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "int.calibration", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.noledger', '空账本', '没记跑道，也没记一周剩多少时间', 'absence', null, null, '[{"sub": "res.runway", "op": "dark", "value": 0}, {"sub": "res.time", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "res.time", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'magic', false, false),
  ('a.silentwork', '闷罐', '没接触、没露出、也没采纳', 'absence', null, null, '[{"sub": "wis.contact", "op": "dark", "value": 0}, {"sub": "cha.exposure", "op": "dark", "value": 0}, {"sub": "cha.adoption", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.exposure", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '做得再多，外面也不知道发生过', null, null, 'rare', false, false),
  ('a.nocompass', '没有罗盘', '没押注、没退出条件、也没复盘同类错误', 'absence', null, null, '[{"sub": "int.calibration", "op": "dark", "value": 0}, {"sub": "wil.precommit", "op": "dark", "value": 0}, {"sub": "int.repeat", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.calibration", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "wil.precommit", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "int.repeat", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('a.noothers', '无人称', '没有可求援的人、没有新面孔、也没有承诺', 'absence', null, null, '[{"sub": "res.allies", "op": "dark", "value": 0}, {"sub": "lck.newfaces", "op": "dark", "value": 0}, {"sub": "cha.commitment", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.allies", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "lck.newfaces", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.commitment", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('a.nofield', '不出门', '没进新场合、没接触、也没有意外的好事', 'absence', null, null, '[{"sub": "lck.newcontext", "op": "dark", "value": 0}, {"sub": "wis.contact", "op": "dark", "value": 0}, {"sub": "lck.serendipity", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "lck.serendipity", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '运气是出门次数的函数', null, null, 'rare', false, false),
  ('a.nomaint', '无保养', '身体、睡眠、恢复三栏都空着', 'absence', null, null, '[{"sub": "str.absolute", "op": "dark", "value": 0}, {"sub": "con.sleep", "op": "dark", "value": 0}, {"sub": "con.regular", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "str.absolute", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "con.sleep", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "con.regular", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('a.blankslate', '崭新', '这张卡上几乎每一格都还是黑的', 'absence', null, null, '[{"sub": "wis.contact", "op": "dark", "value": 0}, {"sub": "int.calibration", "op": "dark", "value": 0}, {"sub": "cha.exposure", "op": "dark", "value": 0}, {"sub": "res.allies", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "int.calibration", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.exposure", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "res.allies", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, true),
  ('t.onceonly', '一次性', '接触过，就一两次，然后停了', 'tempo', null, null, '[{"sub": "wis.contact", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, false),
  ('t.onebet', '试水押注', '押过一两条，还没形成对账的习惯', 'tempo', null, null, '[{"sub": "int.calibration", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "int.calibration", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, false),
  ('t.oneshow', '露过一面', '对外露出过一两次就收回去了', 'tempo', null, null, '[{"sub": "cha.exposure", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "cha.exposure", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, false),
  ('t.onelift', '三天热度', '练过一两次，没接上', 'tempo', null, null, '[{"sub": "str.absolute", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "str.absolute", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, false),
  ('t.onenight', '记过两夜', '睡眠只记了一两条', 'tempo', null, null, '[{"sub": "con.sleep", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "con.sleep", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, true),
  ('t.onestop', '刹过一次', '主动喊停过一次，还没成为习惯', 'tempo', null, null, '[{"sub": "wil.restraint", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "wil.restraint", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, true),
  ('t.oneface', '见过一面', '只认识了一两个新的人', 'tempo', null, null, '[{"sub": "lck.newfaces", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "lck.newfaces", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, false),
  ('t.onepromise', '一诺', '只记过一两条对别人的承诺', 'tempo', null, null, '[{"sub": "cha.commitment", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "cha.commitment", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'magic', false, true),
  ('t.startstop', '起手即停', '接触和露出都只发生过一两次', 'tempo', null, null, '[{"sub": "wis.contact", "op": "thin", "value": 2}, {"sub": "cha.exposure", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "只发生过一两次"}, {"sub": "cha.exposure", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, '开头最容易，接着做才难', null, null, 'rare', false, false),
  ('t.warmup', '热身中', '身体和睡眠都刚开了个头', 'tempo', null, null, '[{"sub": "str.absolute", "op": "thin", "value": 3}, {"sub": "con.sleep", "op": "thin", "value": 3}]'::jsonb, '[{"sub": "str.absolute", "sign": "minus", "note": "只发生过一两次"}, {"sub": "con.sleep", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'rare', false, true),
  ('t.firstledger', '刚立账', '押注和退出条件都刚开始记', 'tempo', null, null, '[{"sub": "int.calibration", "op": "thin", "value": 2}, {"sub": "wil.precommit", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "int.calibration", "sign": "minus", "note": "只发生过一两次"}, {"sub": "wil.precommit", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'rare', false, true),
  ('t.toedip', '试探期', '新场合和新面孔各只碰过一两次', 'tempo', null, null, '[{"sub": "lck.newcontext", "op": "thin", "value": 2}, {"sub": "lck.newfaces", "op": "thin", "value": 2}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "minus", "note": "只发生过一两次"}, {"sub": "lck.newfaces", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.solowheel', '独轮车', '推得动事，身边没有一个能一起干的人', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "res.allies", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '一个人能走多快，取决于他能扛多久', null, null, 'rare', false, false),
  ('c.lostintrans', '翻译损耗', '结论被采纳了，但没人问过你是怎么得出来的', 'combo', null, null, '[{"sub": "cha.adoption", "op": "gte", "value": 14}, {"sub": "wis.candor", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": ""}]'::jsonb, '被采纳不等于被理解，下次换个人就不算数了', null, null, 'rare', false, false),
  ('c.basement', '地下室', '起手极快，做出来的东西没出过门', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 14}, {"sub": "cha.exposure", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.selfbrief', '自带需求', '做了很多，一次都没问过有没有人要', 'combo', null, null, '[{"sub": "dex.iteration", "op": "gte", "value": 14}, {"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.iteration", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '自己给自己下的单，永远不会被拒绝', null, null, 'rare', false, false),
  ('c.nightschool', '夜校生', '学得进去，还没在真事上用过', 'combo', null, null, '[{"sub": "int.transfer", "op": "lte", "value": 6}, {"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.transfer", "sign": "minus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.nohandoff', '交不出去', '事情都收得了尾，身边没有人能接', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "res.allies", "op": "lte", "value": 4}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}]'::jsonb, '所有事都只有你会，是一种负债', null, null, 'rare', false, false),
  ('c.idleweekend', '空转', '时间有的是，一次都没拿去露出', 'combo', null, null, '[{"sub": "res.time", "op": "gte", "value": 14}, {"sub": "cha.exposure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.time", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.copilot', '副驾', '迭代极快，还没有一条自己的判断被对过账', 'combo', null, null, '[{"sub": "dex.iteration", "op": "gte", "value": 14}, {"sub": "int.calibration", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.iteration", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '手快是工具给的，判断准不是', null, null, 'rare', false, false),
  ('c.parallelblind', '多线盲飞', '同时开好几摊，一条退出条件都没有', 'combo', null, null, '[{"sub": "dex.parallel", "op": "gte", "value": 14}, {"sub": "wil.precommit", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wil.precommit", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.quietcalib', '自校准', '押得准，但从没给人看过', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 14}, {"sub": "cha.exposure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.readyunused', '备而不用', '时间和跑道都有，就是没往外走一步', 'combo', null, null, '[{"sub": "res.time", "op": "gte", "value": 12}, {"sub": "lck.newcontext", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "res.time", "sign": "plus", "note": ""}, {"sub": "lck.newcontext", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.newgrad', '新人局', '还没有被采纳过，也还没被人当面挑过错', 'combo', null, null, '[{"sub": "cha.adoption", "op": "dark", "value": 0}, {"sub": "wis.candor", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "wis.candor", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '没人挑错的时候，成长最慢', null, null, 'magic', false, false),
  ('c.foreignroom', '异乡会议', '在场合里，但接触和采纳都还没发生', 'combo', null, null, '[{"sub": "lck.newcontext", "op": "gte", "value": 12}, {"sub": "cha.adoption", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.deepsolo', '深潜', '单件事扛得久，中间没跟任何人对过', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 14}, {"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.noonewaits', '无人等', '收得了尾，但没有一条承诺是对别人的', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "cha.commitment", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "cha.commitment", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '没人等的东西，晚一周也没关系 —— 于是永远晚一周', null, null, 'rare', false, false),
  ('c.tooltrap', '工具瘾', '迭代快、并行多，接触一次都没有', 'combo', null, null, '[{"sub": "dex.iteration", "op": "gte", "value": 14}, {"sub": "dex.parallel", "op": "gte", "value": 12}, {"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.iteration", "sign": "plus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '换工具比换问题容易得多', null, null, 'epic', false, false),
  ('c.selftaught', '自学成家', '学得会、用得上，但还没人验过', 'combo', null, null, '[{"sub": "int.transfer", "op": "gte", "value": 14}, {"sub": "cha.adoption", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.transfer", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.silentgood', '哑火好手', '做得完、押得准，就是不外露', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "int.calibration", "op": "gte", "value": 12}, {"sub": "cha.exposure", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('c.oneway', '单程票', '敢开新场合，没有一条退出条件', 'combo', null, null, '[{"sub": "lck.newcontext", "op": "gte", "value": 12}, {"sub": "wil.precommit", "op": "lte", "value": 4}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "wil.precommit", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.burnquiet', '闷烧', '扛得久、不喊停，身体那栏是空的', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 14}, {"sub": "wil.restraint", "op": "lte", "value": 5}, {"sub": "str.absolute", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wil.restraint", "sign": "minus", "note": ""}, {"sub": "str.absolute", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '身体是最后一个通知你的人', null, null, 'epic', false, false),
  ('c.nightowl', '夜行', '扛得久，睡眠这栏一片空白', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 14}, {"sub": "con.sleep", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "con.sleep", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.papertiger', '纸面完备', '退出条件写得齐，一次真实接触都没有', 'combo', null, null, '[{"sub": "wil.precommit", "op": "gte", "value": 12}, {"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.precommit", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '纸上的严谨最便宜', null, null, 'rare', false, false),
  ('c.echoroom', '回音室', '接触过，但只在熟人里', 'combo', null, null, '[{"sub": "wis.contact", "op": "gte", "value": 12}, {"sub": "lck.newfaces", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.contact", "sign": "plus", "note": ""}, {"sub": "lck.newfaces", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.hoarder', '囤积', '学得多、记得多，用出去的一次都没有', 'combo', null, null, '[{"sub": "int.transfer", "op": "dark", "value": 0}, {"sub": "res.time", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "int.transfer", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "res.time", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.softlanding', '软着陆', '跑道很长，所以什么都不急', 'combo', null, null, '[{"sub": "res.runway", "op": "gte", "value": 15}, {"sub": "dex.ignition", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "res.runway", "sign": "plus", "note": ""}, {"sub": "dex.ignition", "sign": "minus", "note": ""}]'::jsonb, '钱多的时候，最容易慢下来', null, null, 'rare', false, false),
  ('c.shortfuse', '短引信', '跑道很短，还在开新摊子', 'combo', null, null, '[{"sub": "res.runway", "op": "lte", "value": 4}, {"sub": "dex.parallel", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.blindluck', '顺风顺水', '有过意外的好事，但没记过一次坏消息', 'combo', null, null, '[{"sub": "lck.serendipity", "op": "gte", "value": 12}, {"sub": "wis.candor", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.serendipity", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '只记好运的账本，看起来像天赋', null, null, 'rare', false, false),
  ('c.grayblind', '非此即彼', '判断果断，灰度地带一次都没记过', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 12}, {"sub": "res.gray", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "res.gray", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.overheard', '旁听席', '在新场合里，但一次都没开口', 'combo', null, null, '[{"sub": "lck.newcontext", "op": "gte", "value": 12}, {"sub": "cha.exposure", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'rare', false, false),
  ('c.proofless', '无凭', '东西做完了，能证明的记录一条都没有', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "wis.candor", "op": "dark", "value": 0}, {"sub": "cha.adoption", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.lonebuilder', '孤舟', '做得完、扛得久、身边没有人', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "wil.span", "op": "gte", "value": 14}, {"sub": "res.allies", "op": "lte", "value": 4}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}]'::jsonb, '能扛不是问题，扛到没人知道才是', null, null, 'epic', false, false),
  ('e.quietmaster', '深巷', '做得完、押得准、从不外露', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 15}, {"sub": "int.calibration", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "lte", "value": 5}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.machinehand', '机械臂', '起手快、并行多、迭代猛，没有一次接触', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 14}, {"sub": "dex.parallel", "op": "gte", "value": 14}, {"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '产出会一直增加，直到你发现没人要', null, null, 'epic', false, false),
  ('e.mirrorless', '无面镜', '被采纳过、没记过坏消息、也没被当面挑过错', 'combo', null, null, '[{"sub": "cha.adoption", "op": "gte", "value": 12}, {"sub": "wis.candor", "op": "lte", "value": 5}, {"sub": "wis.persuadable", "op": "lte", "value": 5}]'::jsonb, '[{"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": ""}, {"sub": "wis.persuadable", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.bookwall', '书墙', '学得多、时间多、用出去的一次都没有', 'combo', null, null, '[{"sub": "int.transfer", "op": "lte", "value": 5}, {"sub": "res.time", "op": "gte", "value": 14}, {"sub": "lck.newcontext", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "int.transfer", "sign": "minus", "note": ""}, {"sub": "res.time", "sign": "plus", "note": ""}, {"sub": "lck.newcontext", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.ironback', '铁背', '扛得久、不喊停、睡眠也不记', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "wil.restraint", "op": "lte", "value": 5}, {"sub": "con.sleep", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wil.restraint", "sign": "minus", "note": ""}, {"sub": "con.sleep", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '这一组合在体检报告上通常会先被发现', null, null, 'epic', false, false),
  ('e.trueaim', '定星', '押得准、记坏消息、也改得动', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 15}, {"sub": "wis.candor", "op": "gte", "value": 14}, {"sub": "int.repeat", "op": "gte", "value": 14}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}, {"sub": "int.repeat", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.opendoor', '常开的门', '新面孔、新场合、还有人愿意找你', 'combo', null, null, '[{"sub": "lck.newfaces", "op": "gte", "value": 14}, {"sub": "lck.newcontext", "op": "gte", "value": 14}, {"sub": "res.allies", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "lck.newfaces", "sign": "plus", "note": ""}, {"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.fullstack', '整条链', '做得出、送得出、还有人用', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "cha.exposure", "op": "gte", "value": 14}, {"sub": "cha.adoption", "op": "gte", "value": 14}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.slowsure', '慢准狠', '起手慢、押得准、收得了尾', 'combo', null, null, '[{"sub": "dex.ignition", "op": "lte", "value": 6}, {"sub": "int.calibration", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 14}]'::jsonb, '[{"sub": "dex.ignition", "sign": "minus", "note": ""}, {"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.hollowfast', '空心快', '快、并行、但一件都没收尾', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 15}, {"sub": "dex.parallel", "op": "gte", "value": 14}, {"sub": "wil.closure", "op": "lte", "value": 5}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.thickskin', '厚脸皮', '露出多、被挑错也不缩、还改得动', 'combo', null, null, '[{"sub": "cha.exposure", "op": "gte", "value": 14}, {"sub": "wis.persuadable", "op": "gte", "value": 14}, {"sub": "int.repeat", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "cha.exposure", "sign": "plus", "note": ""}, {"sub": "wis.persuadable", "sign": "plus", "note": ""}, {"sub": "int.repeat", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.paperplan', '纸上谈兵', '退出条件写得齐、灰度也记、就是没接触过人', 'combo', null, null, '[{"sub": "wil.precommit", "op": "gte", "value": 14}, {"sub": "res.gray", "op": "gte", "value": 12}, {"sub": "wis.contact", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.precommit", "sign": "plus", "note": ""}, {"sub": "res.gray", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.burnout', '过载', '并行多、扛得久、身体这栏空着', 'combo', null, null, '[{"sub": "dex.parallel", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "con.regular", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "con.regular", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '同时开的摊子数，是崩溃的最好预测变量', null, null, 'epic', false, false),
  ('e.trusted', '被托付', '承诺兑现、有人可求援、还被采纳', 'combo', null, null, '[{"sub": "cha.commitment", "op": "gte", "value": 14}, {"sub": "res.allies", "op": "gte", "value": 12}, {"sub": "cha.adoption", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "cha.commitment", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.selfcheck', '自带刹车', '扛得久、喊得停、还回得来', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 14}, {"sub": "wil.restraint", "op": "gte", "value": 14}, {"sub": "con.regular", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wil.restraint", "sign": "plus", "note": ""}, {"sub": "con.regular", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.groundtruth', '脚上有泥', '接触多、新面孔多、坏消息也记', 'combo', null, null, '[{"sub": "wis.contact", "op": "gte", "value": 14}, {"sub": "lck.newfaces", "op": "gte", "value": 12}, {"sub": "wis.candor", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "wis.contact", "sign": "plus", "note": ""}, {"sub": "lck.newfaces", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.silentledger', '暗账', '押注多、灰度多、一次都没给人看', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 14}, {"sub": "res.gray", "op": "gte", "value": 12}, {"sub": "cha.exposure", "op": "lte", "value": 5}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "res.gray", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.thinice', '薄冰', '跑道短、并行多、没有退出条件', 'combo', null, null, '[{"sub": "res.runway", "op": "lte", "value": 4}, {"sub": "dex.parallel", "op": "gte", "value": 12}, {"sub": "wil.precommit", "op": "lte", "value": 4}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wil.precommit", "sign": "minus", "note": ""}]'::jsonb, '这三条同时成立的时候，运气是唯一的变量', null, null, 'epic', false, false),
  ('e.craftsman', '手上功夫', '迭代快、收得了尾、东西有人用', 'combo', null, null, '[{"sub": "dex.iteration", "op": "gte", "value": 14}, {"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "cha.adoption", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "dex.iteration", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.antenna', '长天线', '新场合、意外的好事、还接得住', 'combo', null, null, '[{"sub": "lck.newcontext", "op": "gte", "value": 14}, {"sub": "lck.serendipity", "op": "gte", "value": 12}, {"sub": "wis.contact", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "lck.serendipity", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.gatekeeper', '把关人', '识得破套路、记坏消息、也不轻易被说服', 'combo', null, null, '[{"sub": "int.decoy", "op": "gte", "value": 14}, {"sub": "wis.candor", "op": "gte", "value": 14}, {"sub": "wis.persuadable", "op": "lte", "value": 6}]'::jsonb, '[{"sub": "int.decoy", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}, {"sub": "wis.persuadable", "sign": "minus", "note": ""}]'::jsonb, '把关和固执之间只隔着一条证据', null, null, 'epic', false, false),
  ('e.students', '学徒期', '学得进、用得上、还敢拿出去', 'combo', null, null, '[{"sub": "int.transfer", "op": "gte", "value": 14}, {"sub": "cha.exposure", "op": "gte", "value": 12}, {"sub": "wis.persuadable", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "int.transfer", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "plus", "note": ""}, {"sub": "wis.persuadable", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.brokenclock', '停摆的钟', '老犯同一个错、押不准、也不记坏消息', 'combo', null, null, '[{"sub": "int.repeat", "op": "lte", "value": 5}, {"sub": "int.calibration", "op": "lte", "value": 5}, {"sub": "wis.candor", "op": "lte", "value": 5}]'::jsonb, '[{"sub": "int.repeat", "sign": "minus", "note": ""}, {"sub": "int.calibration", "sign": "minus", "note": ""}, {"sub": "wis.candor", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.overweight', '负重跑', '跑道短、时间少、还在扛长线', 'combo', null, null, '[{"sub": "res.runway", "op": "lte", "value": 5}, {"sub": "res.time", "op": "lte", "value": 5}, {"sub": "wil.span", "op": "gte", "value": 14}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": ""}, {"sub": "res.time", "sign": "minus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.lightfoot', '轻装', '跑道长、时间多、还认识新的人', 'combo', null, null, '[{"sub": "res.runway", "op": "gte", "value": 14}, {"sub": "res.time", "op": "gte", "value": 14}, {"sub": "lck.newfaces", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "res.runway", "sign": "plus", "note": ""}, {"sub": "res.time", "sign": "plus", "note": ""}, {"sub": "lck.newfaces", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.provenhand', '有据可查', '做得完、有人采纳、坏消息也留着', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 14}, {"sub": "cha.adoption", "op": "gte", "value": 14}, {"sub": "wis.candor", "op": "gte", "value": 14}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'epic', false, false),
  ('e.quietcompany', '自成一队', '一个人扛完、收得了尾、也没找过人', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "wil.closure", "op": "gte", "value": 15}, {"sub": "res.allies", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'epic', false, false),
  ('l.ghostship', '无人船', '做得完、扛得久、没人知道、也没人能接', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "lte", "value": 5}, {"sub": "res.allies", "op": "lte", "value": 3}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "minus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}]'::jsonb, '这艘船开得很好，问题是它开去哪没人知道', null, null, 'legend', false, false),
  ('l.closedloop', '闭环', '押得准、记坏消息、改得动、还被采纳', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 15}, {"sub": "wis.candor", "op": "gte", "value": 14}, {"sub": "int.repeat", "op": "gte", "value": 14}, {"sub": "cha.adoption", "op": "gte", "value": 14}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}, {"sub": "int.repeat", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.fieldwork', '泥腿子', '接触多、新面孔、新场合、坏消息全记', 'combo', null, null, '[{"sub": "wis.contact", "op": "gte", "value": 15}, {"sub": "lck.newfaces", "op": "gte", "value": 14}, {"sub": "lck.newcontext", "op": "gte", "value": 14}, {"sub": "wis.candor", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "wis.contact", "sign": "plus", "note": ""}, {"sub": "lck.newfaces", "sign": "plus", "note": ""}, {"sub": "lck.newcontext", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.machineonly', '只剩机器', '快、并行、迭代猛，接触和采纳都是空的', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 15}, {"sub": "dex.parallel", "op": "gte", "value": 14}, {"sub": "wis.contact", "op": "dark", "value": 0}, {"sub": "cha.adoption", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.adoption", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '产出曲线很好看，另外两条是平的', null, null, 'legend', false, false),
  ('l.ironbody', '铁打的', '力量、耐力、规律、睡眠四栏都亮', 'combo', null, null, '[{"sub": "str.absolute", "op": "gte", "value": 14}, {"sub": "con.aerobic", "op": "gte", "value": 12}, {"sub": "con.regular", "op": "gte", "value": 14}, {"sub": "con.sleep", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "str.absolute", "sign": "plus", "note": ""}, {"sub": "con.aerobic", "sign": "plus", "note": ""}, {"sub": "con.regular", "sign": "plus", "note": ""}, {"sub": "con.sleep", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.hollow', '空壳', '跑道短、没人、没时间、也没有退出条件', 'combo', null, null, '[{"sub": "res.runway", "op": "lte", "value": 4}, {"sub": "res.allies", "op": "lte", "value": 3}, {"sub": "res.time", "op": "lte", "value": 4}, {"sub": "wil.precommit", "op": "lte", "value": 3}]'::jsonb, '[{"sub": "res.runway", "sign": "minus", "note": ""}, {"sub": "res.allies", "sign": "minus", "note": ""}, {"sub": "res.time", "sign": "minus", "note": ""}, {"sub": "wil.precommit", "sign": "minus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.compass', '全罗盘', '押注、退出条件、复盘、灰度四样都在', 'combo', null, null, '[{"sub": "int.calibration", "op": "gte", "value": 14}, {"sub": "wil.precommit", "op": "gte", "value": 14}, {"sub": "int.repeat", "op": "gte", "value": 14}, {"sub": "res.gray", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "int.calibration", "sign": "plus", "note": ""}, {"sub": "wil.precommit", "sign": "plus", "note": ""}, {"sub": "int.repeat", "sign": "plus", "note": ""}, {"sub": "res.gray", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.publicwork', '摆在台面上', '做得完、拿得出、有人用、也认账', 'combo', null, null, '[{"sub": "wil.closure", "op": "gte", "value": 15}, {"sub": "cha.exposure", "op": "gte", "value": 15}, {"sub": "cha.adoption", "op": "gte", "value": 14}, {"sub": "wis.candor", "op": "gte", "value": 14}]'::jsonb, '[{"sub": "wil.closure", "sign": "plus", "note": ""}, {"sub": "cha.exposure", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "wis.candor", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.solitary', '深居', '四格全黑：不接触、不露出、无人、不出门', 'combo', null, null, '[{"sub": "wis.contact", "op": "dark", "value": 0}, {"sub": "cha.exposure", "op": "dark", "value": 0}, {"sub": "res.allies", "op": "dark", "value": 0}, {"sub": "lck.newcontext", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "cha.exposure", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "res.allies", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "lck.newcontext", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, '这不是性格，是这四格里一件事都还没发生', null, null, 'rare', false, false),
  ('l.overclock', '超频', '快、并行、扛得久、不喊停', 'combo', null, null, '[{"sub": "dex.ignition", "op": "gte", "value": 15}, {"sub": "dex.parallel", "op": "gte", "value": 15}, {"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "wil.restraint", "op": "lte", "value": 4}]'::jsonb, '[{"sub": "dex.ignition", "sign": "plus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "wil.restraint", "sign": "minus", "note": ""}]'::jsonb, '这四条同时成立的人，通常在事后才发现自己停不下来', null, null, 'legend', false, false),
  ('l.grownup', '长成的人', '被托付、能求援、扛得住批评、也改得动', 'combo', null, null, '[{"sub": "cha.commitment", "op": "gte", "value": 14}, {"sub": "res.allies", "op": "gte", "value": 14}, {"sub": "wis.persuadable", "op": "gte", "value": 14}, {"sub": "int.repeat", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "cha.commitment", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "plus", "note": ""}, {"sub": "wis.persuadable", "sign": "plus", "note": ""}, {"sub": "int.repeat", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.blindrunner', '蒙眼长跑', '扛得久、并行多、没押注、也不记坏消息', 'combo', null, null, '[{"sub": "wil.span", "op": "gte", "value": 15}, {"sub": "dex.parallel", "op": "gte", "value": 12}, {"sub": "int.calibration", "op": "dark", "value": 0}, {"sub": "wis.candor", "op": "dark", "value": 0}]'::jsonb, '[{"sub": "wil.span", "sign": "plus", "note": ""}, {"sub": "dex.parallel", "sign": "plus", "note": ""}, {"sub": "int.calibration", "sign": "minus", "note": "这一格还没有任何记录"}, {"sub": "wis.candor", "sign": "minus", "note": "这一格还没有任何记录"}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.rainmaker', '引风的人', '新面孔、意外之喜、被采纳、还有人可托付', 'combo', null, null, '[{"sub": "lck.newfaces", "op": "gte", "value": 14}, {"sub": "lck.serendipity", "op": "gte", "value": 14}, {"sub": "cha.adoption", "op": "gte", "value": 14}, {"sub": "res.allies", "op": "gte", "value": 12}]'::jsonb, '[{"sub": "lck.newfaces", "sign": "plus", "note": ""}, {"sub": "lck.serendipity", "sign": "plus", "note": ""}, {"sub": "cha.adoption", "sign": "plus", "note": ""}, {"sub": "res.allies", "sign": "plus", "note": ""}]'::jsonb, null, null, null, 'legend', false, false),
  ('l.firstlight', '初亮', '四格刚从零变成一：开始接触、开始露出、开始押注、开始记账', 'tempo', null, null, '[{"sub": "wis.contact", "op": "thin", "value": 3}, {"sub": "cha.exposure", "op": "thin", "value": 3}, {"sub": "int.calibration", "op": "thin", "value": 3}, {"sub": "wis.candor", "op": "thin", "value": 3}]'::jsonb, '[{"sub": "wis.contact", "sign": "minus", "note": "只发生过一两次"}, {"sub": "cha.exposure", "sign": "minus", "note": "只发生过一两次"}, {"sub": "int.calibration", "sign": "minus", "note": "只发生过一两次"}, {"sub": "wis.candor", "sign": "minus", "note": "只发生过一两次"}]'::jsonb, null, null, null, 'legend', false, true)
on conflict (key) do nothing;

-- 048_drop_feats.sql
drop table if exists self_feats;
drop table if exists self_skill_ticks;
drop table if exists self_skills;

-- 049_self_window_skips.sql
create table if not exists self_window_skips (
  user_id     uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('validation', 'decision', 'commitment')),
  source_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, source_type, source_id)
);

alter table self_window_skips enable row level security;

drop policy if exists "self_window_skips_owner" on self_window_skips;
create policy "self_window_skips_owner" on self_window_skips
  for all using (auth.uid() = user_id);

-- 050_self_events_dossier_kinds.sql
alter table self_events drop constraint if exists self_events_kind_check;
alter table self_events add constraint self_events_kind_check check (kind in (
  'trait_granted', 'trait_faded',
  'skill_up', 'skill_rust',
  'feat_taken',
  'title_earned', 'build_changed',
  'hypothesis_refuted', 'tier_changed',
  'label_formed', 'divide_found', 'label_flipped'
));

-- 051_self_portraits.sql
-- 写法画像：Jev 读你写的字，给出四个维度的档位分布。
--
-- 量的是「你怎么讲自己」，不是「你做了什么」—— 同一件事换个口气写，数字就会动。
-- 所以每份画像都把当时读的原文一起存下来（sources），点得开；
-- 它不进任何台账推理（档位、特性、技能都不读这张表）。
--
-- 每生成一次存一份，能看三个月前和现在的写法差在哪。

create table if not exists self_portraits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  model         text not null,
  answers       jsonb not null,               -- { [axis]: { score, confidence, probabilities, evidence } }
  sources       jsonb not null,               -- [{ kind, date, text }]：这次实际读了的原文
  source_counts jsonb not null,               -- { retro, observation, declaration, learned }
  chars         integer not null check (chars >= 0),
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

create index if not exists idx_self_portraits_user
  on self_portraits (user_id, created_at desc);

alter table self_portraits enable row level security;

drop policy if exists "self_portraits_owner" on self_portraits;
create policy "self_portraits_owner" on self_portraits
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 052：外部信号复活（/signals 每日新闻）—— 按新闻发布时间排序
-- ============================================================================

alter table external_signals add column if not exists published_at timestamptz;

create index if not exists idx_external_signals_published
  on external_signals (status, published_at desc nulls last);

-- ============================================================================
-- 053：外部信号的每日精选 + 读新闻用的"关于你"
-- ============================================================================
create table if not exists signal_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  context    text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists signal_briefs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  brief_date date not null,
  kind       text not null check (kind in ('news', 'tools')),
  items      jsonb not null,               -- [{ signal_id, title, url, source, headline, background, for_you }]
  created_at timestamptz not null default now(),
  constraint signal_briefs_uniq unique (user_id, brief_date, kind)
);

alter table signal_profiles enable row level security;
alter table signal_briefs enable row level security;

drop policy if exists "signal_profiles_owner" on signal_profiles;
create policy "signal_profiles_owner" on signal_profiles
  for all using (auth.uid() = user_id);

drop policy if exists "signal_briefs_owner" on signal_briefs;
create policy "signal_briefs_owner" on signal_briefs
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 054：外部信号的每日报告 + 单条详情
-- ============================================================================

alter table signal_briefs add column if not exists overview text;

alter table external_signals add column if not exists analysis jsonb;
alter table external_signals add column if not exists excerpt text;
alter table external_signals add column if not exists analyzed_at timestamptz;

-- ============================================================================
-- 055：读新闻练判断 —— 先写自己的判断，再看 AI 的，到期对账
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

-- ============================================================================
-- 056：外部信号 —— 历史上类似的事 + 现场 + 已经定了的未来
-- ============================================================================

alter table external_signals add column if not exists history jsonb;

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar'));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 057：读新闻时 AI 知道的"你"——从自述里抽处境事实（带出处），缓存在 signal_profiles
-- ============================================================================

alter table signal_profiles add column if not exists facts jsonb;          -- [{ fact, quote }]
alter table signal_profiles add column if not exists facts_from timestamptz;

-- ============================================================================
-- 058：外部信号的"往下推"（多层推论，三档可能性，不存百分比）
-- ============================================================================

alter table external_signals add column if not exists inference jsonb;

-- ============================================================================
-- 059：外部信号的"问题驱动"（signal_questions / signal_question_views）+ 判断账本标签
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

-- ============================================================================
-- 060：外部信号报告加第五节"谁在掏钱"（signal_briefs.kind 加 money）
-- ============================================================================

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money'));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 061：每日报告加"今日总览"（signal_briefs.kind 加 digest）
-- ============================================================================

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money', 'digest'));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 062：判断错在哪一步（miss_reason）、每节有没有用（signal_feedback）、周报（kind 加 weekly）
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

-- ============================================================================
-- 063：差距清单主动扫（kind 加 gaps）、每月重查（signal_gap_rechecks）
-- ============================================================================

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money', 'digest', 'weekly', 'gaps'));
exception when duplicate_object then null; end $$;

create table if not exists signal_gap_rechecks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  signal_id     uuid not null,
  side          text not null check (side in ('japan', 'us', 'china')),
  checked_on    date not null,
  verdict       text not null check (verdict in ('still', 'arrived', 'unclear')),
  japan         text not null,
  source_check  jsonb,
  funded        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists signal_gap_rechecks_user_idx
  on signal_gap_rechecks (user_id, checked_on desc);

alter table signal_gap_rechecks enable row level security;

drop policy if exists "signal_gap_rechecks_owner" on signal_gap_rechecks;
create policy "signal_gap_rechecks_owner" on signal_gap_rechecks
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 064：到期对账先上网查证据（signal_judgments.outcome_evidence）
-- ============================================================================

alter table signal_judgments add column if not exists outcome_evidence jsonb;

-- ============================================================================
-- 065：挑法盲测（signal_lab_runs）
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

-- ============================================================================
-- 066：历史题（signal_drills）
-- ============================================================================

create table if not exists signal_drills (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  topic          text,
  setup          text not null,
  question       text not null,
  deadline       date not null,
  answer         boolean not null,
  what_happened  text not null,
  why_similar    text,
  source_check   jsonb not null,
  guess          boolean,
  confidence     integer,
  reasoning      text,
  answered_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists signal_drills_user_idx on signal_drills (user_id, created_at desc);

alter table signal_drills enable row level security;

drop policy if exists "signal_drills_owner" on signal_drills;
create policy "signal_drills_owner" on signal_drills
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 067：差距清单 —— 能不能搬过来（signal_gap_transfers）
-- ============================================================================

create table if not exists signal_gap_transfers (
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  analysis    jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, signal_id, side)
);

alter table signal_gap_transfers enable row level security;

drop policy if exists "signal_gap_transfers_owner" on signal_gap_transfers;
create policy "signal_gap_transfers_owner" on signal_gap_transfers
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 068：历史题出得更公平（signal_drills.as_of / criterion / flag）
-- ============================================================================

alter table signal_drills add column if not exists as_of text;
alter table signal_drills add column if not exists criterion text;
alter table signal_drills add column if not exists flag text;

-- ============================================================================
-- 069：历史题对理由（signal_drills.decided_by / decided_basis / reason_match）
-- ============================================================================

alter table signal_drills add column if not exists decided_by text;
alter table signal_drills add column if not exists decided_basis jsonb;
alter table signal_drills add column if not exists reason_match boolean;

-- ============================================================================
-- 070：历史题接回今天、对理由有裁判、猜错问错在哪、记出题通过率
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

-- ============================================================================
-- 071：周刊（signal_issues）
-- ============================================================================

create table if not exists signal_issues (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  week_start  date not null,
  content     jsonb not null,
  drafts      jsonb,
  published   jsonb not null default '[]'::jsonb,
  responses   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint signal_issues_uniq unique (user_id, week_start)
);

alter table signal_issues enable row level security;

drop policy if exists "signal_issues_owner" on signal_issues;
create policy "signal_issues_owner" on signal_issues
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 072：公开对账页（signal_public_records）
-- ============================================================================

create table if not exists signal_public_records (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

alter table signal_public_records enable row level security;

drop policy if exists "signal_public_records_owner" on signal_public_records;
create policy "signal_public_records_owner" on signal_public_records
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 073：时差图谱（signal_transfer_cases）
-- ============================================================================

create table if not exists signal_transfer_cases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  thing         text not null,
  category      text not null check (category in ('payment', 'mobility', 'commerce', 'food', 'content', 'work', 'hardware', 'other')),
  origin        text not null check (origin in ('china', 'us')),
  origin_event  text not null,
  origin_date   text not null,
  japan_event   text,
  japan_date    text,
  outcome       text not null check (outcome in ('widespread', 'partial', 'niche', 'exited', 'blocked', 'absent')),
  carrier       text not null check (carrier in ('local', 'us', 'china', 'other', 'none')),
  lag_months    integer,
  sources       jsonb not null,
  found_via     text not null check (found_via in ('seed', 'research', 'recheck')),
  created_at    timestamptz not null default now(),
  constraint signal_transfer_cases_uniq unique (user_id, thing)
);

alter table signal_transfer_cases enable row level security;

drop policy if exists "signal_transfer_cases_owner" on signal_transfer_cases;
create policy "signal_transfer_cases_owner" on signal_transfer_cases
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 074：时差图谱请裁判（signal_transfer_cases.judge_status / judge_note）
-- ============================================================================

alter table signal_transfer_cases add column if not exists judge_status text
  check (judge_status in ('passed', 'failed', 'unavailable'));
alter table signal_transfer_cases add column if not exists judge_note text;

-- ============================================================================
-- 075：差距清单 · 这边有人在为这个头疼吗（signal_gap_voices）
-- ============================================================================

create table if not exists signal_gap_voices (
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  analysis    jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, signal_id, side)
);

alter table signal_gap_voices enable row level security;

drop policy if exists "signal_gap_voices_owner" on signal_gap_voices;
create policy "signal_gap_voices_owner" on signal_gap_voices
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 076：假门测试（signal_fake_doors / signal_fake_door_signups / signal_fake_door_view）
-- ============================================================================

create table if not exists signal_fake_doors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  token       text not null unique,
  lang        text not null check (lang in ('ja', 'zh')),
  content     jsonb not null,
  views       integer not null default 0,
  open        boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint signal_fake_doors_uniq unique (user_id, signal_id, side)
);

alter table signal_fake_doors enable row level security;

drop policy if exists "signal_fake_doors_owner" on signal_fake_doors;
create policy "signal_fake_doors_owner" on signal_fake_doors
  for all using (auth.uid() = user_id);

create table if not exists signal_fake_door_signups (
  id              uuid primary key default gen_random_uuid(),
  door_id         uuid not null references signal_fake_doors (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  email           text not null,
  note            text,
  cancel_token    text not null unique,
  observation_id  uuid,
  created_at      timestamptz not null default now()
);

create unique index if not exists signal_fake_door_signups_email_uniq
  on signal_fake_door_signups (door_id, lower(email));
create index if not exists signal_fake_door_signups_door_idx
  on signal_fake_door_signups (door_id, created_at desc);

alter table signal_fake_door_signups enable row level security;

drop policy if exists "signal_fake_door_signups_owner" on signal_fake_door_signups;
create policy "signal_fake_door_signups_owner" on signal_fake_door_signups
  for all using (auth.uid() = user_id);

create or replace function signal_fake_door_view(p_token text) returns void
  language sql
as $$
  update signal_fake_doors set views = views + 1 where token = p_token and open;
$$;

revoke execute on function signal_fake_door_view(text) from public, anon, authenticated;
grant execute on function signal_fake_door_view(text) to service_role;

-- ============================================================================
-- 077：周刊本身的假门（signal_fake_doors.kind = 'issue'）
-- ============================================================================

alter table signal_fake_doors add column if not exists kind text not null default 'gap';

alter table signal_fake_doors drop constraint if exists signal_fake_doors_kind_check;
alter table signal_fake_doors add constraint signal_fake_doors_kind_check check (kind in ('gap', 'issue'));

alter table signal_fake_doors alter column signal_id drop not null;
alter table signal_fake_doors alter column side drop not null;

-- 差距的那种必须挂在一条上；周刊的那种不挂
alter table signal_fake_doors drop constraint if exists signal_fake_doors_shape;
alter table signal_fake_doors add constraint signal_fake_doors_shape check (
  (kind = 'gap' and signal_id is not null and side is not null)
  or (kind = 'issue' and signal_id is null and side is null)
);

create unique index if not exists signal_fake_doors_issue_uniq
  on signal_fake_doors (user_id, lang) where kind = 'issue';

-- ============================================================================
-- 迁移 078：求职（/jobs，经用户明确裁决新增的一级模块，2026-10）
-- job_profiles：条件（四类、地点、现年收、期望下限、在留资格）和个人信息。
--   personal 里是姓名、联系方式、住址，永远不发给 AI，只在打印简历时由代码填进去。
--   last_search_on：今天搜过没有（每天第一次打开 /jobs 时搜）。
-- career_entries：底稿。一段经历一条；raw_text 是他的原话，draft_ja 是 AI 整理的日文；
--   confirmed_at 为空的不算数（对照和改简历只用确认过的）。
-- job_postings：岗位。picked_at 为空的是每天搜到、他还没点"要这个"的候选，14 天后清掉。
--   facts 存抽出来的字段（每条条件都带招聘页原话），match 存跟底稿的对照。
--   同一家公司 + 同一个职位名（dedupe_key）或同一个网址，算同一个岗位。
-- job_resumes：某个岗位的一版简历，每句带出处（底稿的 id）；他改过的段存在 sections 的 user_text 里。
-- job_applications：一次投递，一个岗位最多一条。events 记每次状态变化的日期；
--   "没回音"不存，由代码按 21 天算。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists job_profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  categories     text[] not null default '{data,consulting,planning,chinese}',
  locations      text[] not null default '{大阪}',
  salary_now     integer,
  salary_floor   integer,
  visa           text not null default 'gijinkoku' check (visa in ('gijinkoku', 'none')),
  personal       jsonb not null default '{}'::jsonb,
  last_search_on date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table job_profiles enable row level security;
drop policy if exists "job_profiles_owner" on job_profiles;
create policy "job_profiles_owner" on job_profiles
  for all using (auth.uid() = user_id);

create table if not exists career_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  topic        text not null check (topic in ('education', 'work', 'project', 'language', 'license')),
  org          text not null default '',
  period       text not null default '',
  raw_text     text not null,
  draft_ja     text,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_career_entries_user on career_entries (user_id, created_at);
alter table career_entries enable row level security;
drop policy if exists "career_entries_owner" on career_entries;
create policy "career_entries_owner" on career_entries
  for all using (auth.uid() = user_id);

create table if not exists job_postings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  company_id   uuid references companies (id) on delete set null,
  company_name text not null,
  title        text not null,
  url          text,
  dedupe_key   text not null,
  source       text not null check (source in ('share', 'search', 'manual', 'email')),
  material_id  uuid references reality_materials (id) on delete set null,
  body         text not null,
  facts        jsonb not null,
  category     text not null check (category in ('data', 'consulting', 'planning', 'chinese', 'none')),
  match        jsonb,
  picked_at    timestamptz,
  found_on     date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint job_postings_key_uniq unique (user_id, dedupe_key)
);

create unique index if not exists job_postings_url_uniq on job_postings (user_id, url) where url is not null;
create index if not exists idx_job_postings_user on job_postings (user_id, found_on desc);
alter table job_postings enable row level security;
drop policy if exists "job_postings_owner" on job_postings;
create policy "job_postings_owner" on job_postings
  for all using (auth.uid() = user_id);

create table if not exists job_resumes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  posting_id uuid not null references job_postings (id) on delete cascade,
  version    integer not null,
  sections   jsonb not null,
  probes     jsonb not null default '[]'::jsonb,
  dropped    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint job_resumes_version_uniq unique (posting_id, version)
);

alter table job_resumes enable row level security;
drop policy if exists "job_resumes_owner" on job_resumes;
create policy "job_resumes_owner" on job_resumes
  for all using (auth.uid() = user_id);

create table if not exists job_applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  posting_id     uuid not null references job_postings (id) on delete cascade,
  resume_id      uuid references job_resumes (id) on delete set null,
  channel        text not null check (channel in ('site', 'board', 'agent', 'email')),
  status         text not null default 'applied'
    check (status in ('applied', 'replied', 'interview', 'rejected', 'withdrawn')),
  events         jsonb not null default '[]'::jsonb,
  offered_salary integer,
  applied_on     date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint job_applications_posting_uniq unique (posting_id)
);

alter table job_applications enable row level security;
drop policy if exists "job_applications_owner" on job_applications;
create policy "job_applications_owner" on job_applications
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 迁移 079：官网填表助手
-- job_postings.fill_status：他在岗位页点「去填表」→ requested；他电脑上的填表助手（npm run jobs:helper）
--   取走 → filling；填好、停在页面上等他自己点「応募する」→ waiting；看到提交成功的页面 → done（同时记一条投递）；
--   没填成、他关掉页面没提交、两小时没动静 → failed，原因写在 fill_note。
-- 个人信息新加的几格（郵便番号、希望年収、入社可能時期、在留期限）存在 job_profiles.personal 里，不用改表。
-- 要先跑 078。幂等，可重复执行。
-- ============================================================================

alter table job_postings add column if not exists fill_status text
  check (fill_status in ('requested', 'filling', 'waiting', 'done', 'failed'));
alter table job_postings add column if not exists fill_requested_at timestamptz;
alter table job_postings add column if not exists fill_note text;

create index if not exists idx_job_postings_fill on job_postings (fill_status, fill_requested_at)
  where fill_status is not null;

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

-- ============================================================================
-- 迁移 081：「这家可能会问的 case」—— 在岗位页按这家公司出一道ケース面接的题
-- status：asked（出好题）→ answered（交了结构、追问已生成）→ reviewed（答完追问、复盘已生成）。
-- stuck_step：他自己点的"卡在哪一步"（AI 只提名，存在 review.suggested_step）。不打分。
-- 要先跑 078。幂等，可重复执行。
-- ============================================================================

create table if not exists job_case_drills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  posting_id   uuid not null references job_postings (id) on delete cascade,
  status       text not null default 'asked'
    check (status in ('asked', 'answered', 'reviewed')),
  question     jsonb not null,
  answer       text,
  answered_at  timestamptz,
  followups    jsonb,
  review       jsonb,
  stuck_step   text check (stuck_step in ('define', 'split', 'numbers', 'prioritize', 'conclude')),
  started_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_job_case_drills_user on job_case_drills (user_id, created_at desc);
create index if not exists idx_job_case_drills_posting on job_case_drills (posting_id);

alter table job_case_drills enable row level security;
drop policy if exists "job_case_drills_owner" on job_case_drills;
create policy "job_case_drills_owner" on job_case_drills
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 迁移 082：官报決算公告（外部信号的一手数据第一步）
-- kanpo_notices：每天官报里的会社決算公告，全部存；公开数据，不分用户（单用户阶段只用 service role 读写）。
--   字段由规则从原文截出，金额按单位换成日元；四样（公司名、单位、资产合计、当期纯损益）都抽到才算 complete。
-- kanpo_fetch_days：哪天抓过（几页、几条、几条没抽全）。
-- kanpo_watch：他的「在日本的中国公司」名单；case_id 是从时差图谱加进来时那一件的 id。
-- 要先跑 073（signal_transfer_cases）。幂等，可重复执行。
-- ============================================================================

create table if not exists kanpo_notices (
  id                uuid primary key default gen_random_uuid(),
  notice_key        text not null unique,
  issue_date        date not null,
  issue             text not null,
  page              int not null,
  pdf_url           text not null,
  company_name      text,
  company_key       text,
  address           text,
  period            text,
  fiscal_end        text,
  unit              text,
  total_assets      bigint,
  net_assets        bigint,
  retained_earnings bigint,
  net_income        bigint,
  complete          boolean not null default false,
  raw_text          text not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_kanpo_notices_company on kanpo_notices (company_key);
create index if not exists idx_kanpo_notices_date on kanpo_notices (issue_date desc);
alter table kanpo_notices enable row level security;

create table if not exists kanpo_fetch_days (
  issue_date  date primary key,
  pages       int not null,
  notices     int not null,
  incomplete  int not null,
  fetched_at  timestamptz not null default now()
);
alter table kanpo_fetch_days enable row level security;

create table if not exists kanpo_watch (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name_zh     text not null,
  aliases     text[] not null,
  rejected    text[] not null default '{}',
  note        text not null default '',
  case_id     uuid references signal_transfer_cases (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table kanpo_watch enable row level security;
drop policy if exists "kanpo_watch_owner" on kanpo_watch;
create policy "kanpo_watch_owner" on kanpo_watch
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 迁移 083：差距的「一条讲透」
-- signal_gap_deep：差距清单里一条，攒在一页上的几样新东西 ——
--   there：「那边查一查」查到的事实（谁在做、做到多大、怎么收钱、哪年开始），每条附原文，代码核对过；
--   category：他点的这条属于时差图谱哪一类（看同类先例用）；
--   stance：他点的判断三下和补的那句（到周刊页还在；押进判断账本仍是第一次记"发了"的时候）。
-- 不打分、不下"值得做"的结论。幂等，可重复执行。
-- ============================================================================

create table if not exists signal_gap_deep (
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  there       jsonb,
  category    text,
  stance      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, signal_id, side)
);

alter table signal_gap_deep enable row level security;

drop policy if exists "signal_gap_deep_owner" on signal_gap_deep;
create policy "signal_gap_deep_owner" on signal_gap_deep
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 迁移 084：「这家为什么现在招」—— 岗位页上查这家公司的公开资料，推测招聘背景
-- 一个岗位一行（重查就覆盖）。facts 是查到的事（每条原话由代码核对过），
-- needs 是 AI 推测的深层需求（每条至少引一件查到的事，标明是推测）。
-- picked：他认同的那一条（needs 里的下标）；改職務経歴書时按它挑经历、排顺序。不打分。
-- 要先跑 078。幂等，可重复执行。
-- ============================================================================

create table if not exists job_hiring_contexts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  posting_id  uuid not null references job_postings (id) on delete cascade,
  queries     text[] not null default '{}',
  sources     jsonb not null default '[]'::jsonb,
  facts       jsonb not null default '[]'::jsonb,
  needs       jsonb not null default '[]'::jsonb,
  picked      integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint job_hiring_contexts_posting_uniq unique (user_id, posting_id)
);

alter table job_hiring_contexts enable row level security;
drop policy if exists "job_hiring_contexts_owner" on job_hiring_contexts;
create policy "job_hiring_contexts_owner" on job_hiring_contexts
  for all using (auth.uid() = user_id);

-- 迁移 085：外部信号的 AI 示意图
-- signal_images：差距清单里一条（一条讲透页、周刊挑条时）点「出一张配图」出的图，一张一行；同一条可以重出，旧的留着。
--   图本身存在 Storage 的 signal-images bucket（不公开，页面用服务器签的临时链接显示）。
--   图下面固定标「AI 生成的示意图」；模型不一定全听"不要文字"，他看过才拿去用。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_images (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  side          text not null check (side in ('japan', 'us', 'china')),
  signal_id     uuid not null,
  storage_path  text not null,
  prompt        text not null,
  model         text not null,
  created_at    timestamptz not null default now()
);

create index if not exists signal_images_lookup on signal_images (user_id, side, signal_id, created_at desc);

alter table signal_images enable row level security;

drop policy if exists "signal_images_owner" on signal_images;
create policy "signal_images_owner" on signal_images
  for all using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signal-images', 'signal-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================================
-- 086：慢变量 · 知道这个之后呢（signal_slow_thens）
-- ============================================================================

create table if not exists signal_slow_thens (
  user_id     uuid not null references auth.users (id) on delete cascade,
  week_start  date not null,
  key         text not null,
  analysis    jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, week_start, key)
);

alter table signal_slow_thens enable row level security;

drop policy if exists "signal_slow_thens_owner" on signal_slow_thens;
create policy "signal_slow_thens_owner" on signal_slow_thens
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 087：假门登记的人联系过没有（signal_fake_door_signups.contacted_at）
-- ============================================================================

alter table signal_fake_door_signups add column if not exists contacted_at timestamptz;

-- ============================================================================
-- 088：想法的信息缺口 · 是不是你的机会（founder_facts / idea_info_gaps / idea_fits）
-- ============================================================================

create table if not exists founder_facts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  text        text not null,
  updated_at  timestamptz not null default now()
);

alter table founder_facts enable row level security;
drop policy if exists "founder_facts_owner" on founder_facts;
create policy "founder_facts_owner" on founder_facts
  for all using (auth.uid() = user_id);

create table if not exists idea_info_gaps (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  question    text not null,
  matters     text not null,
  disconfirm  text not null,
  routes      jsonb not null,
  due_on      date not null,
  status      text not null default 'open' check (status in ('open', 'got', 'none')),
  evidence    jsonb not null default '[]'::jsonb,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idea_info_gaps_idea_idx on idea_info_gaps (idea_id, created_at);
create index if not exists idea_info_gaps_user_idx on idea_info_gaps (user_id, status, due_on);

alter table idea_info_gaps enable row level security;
drop policy if exists "idea_info_gaps_owner" on idea_info_gaps;
create policy "idea_info_gaps_owner" on idea_info_gaps
  for all using (auth.uid() = user_id);

create table if not exists idea_fits (
  idea_id     uuid primary key references ideas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  analysis    jsonb not null,
  created_at  timestamptz not null default now()
);

alter table idea_fits enable row level security;
drop policy if exists "idea_fits_owner" on idea_fits;
create policy "idea_fits_owner" on idea_fits
  for all using (auth.uid() = user_id);

-- ============================================================================
-- 089：周刊每一篇的数据（signal_issues.metrics）
-- ============================================================================

alter table signal_issues add column if not exists metrics jsonb not null default '[]'::jsonb;

-- 090：月报（signal_briefs.kind = monthly，brief_date 是那个月的一号；items 是几条线（数组，和周报一样），
--      meta 存连起来的是哪几周 { weeks: ["2026-10-05", …] }）
alter table signal_briefs add column if not exists meta jsonb;
alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money', 'digest', 'weekly', 'gaps', 'monthly'));
exception when duplicate_object then null; end $$;

-- 091：外部信号重构 —— 记忆层 + 预测账本（经用户同意，2026-10-22）
--
-- 记忆层：抓到的每一条新闻（external_signals，一条都不删）都算一个"意思的指纹"（768 维向量），
--   能按意思搜、能找"这件事以前"；他点过的标记（重要 / 跟我有关 / 存疑）是以后回想的钩子。
-- 预测账本：统一的题目（预测市场的题 / 数据题 / 生意题），各方的概率（AI 三种思路和它们的中间值、他、市场），
--   到期对账（市场题按平台结果自动对，生意题程序查证据、他点确认）。概率只用于对世界事件的预测（原则 1 例外四）。

create extension if not exists vector with schema extensions;

-- ── 记忆层 ──────────────────────────────────────────────────────────────────
alter table external_signals add column if not exists embedding extensions.vector(768);
alter table external_signals add column if not exists embedded_at timestamptz;

create index if not exists external_signals_embedding_idx
  on external_signals using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists external_signals_unembedded_idx
  on external_signals (fetched_at desc) where embedding is null;

-- 按意思找：余弦相似度最高的几条，可以限定抓到的时间段（after 含、before 不含）
create or replace function match_external_signals(
  query_embedding extensions.vector(768),
  match_count int default 20,
  after timestamptz default null,
  before timestamptz default null
)
returns table (id uuid, source text, url text, title text, snippet text, fetched_at timestamptz, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select s.id, s.source, s.url, s.title, left(s.raw_text, 400) as snippet, s.fetched_at,
         1 - (s.embedding <=> query_embedding) as similarity
  from external_signals s
  where s.embedding is not null
    and (after is null or s.fetched_at >= after)
    and (before is null or s.fetched_at < before)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

create table if not exists signal_marks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  signal_id  uuid not null references external_signals (id) on delete cascade,
  mark       text not null check (mark in ('important', 'mine', 'doubt')),
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, signal_id)
);
create index if not exists signal_marks_recent_idx on signal_marks (user_id, created_at desc);
alter table signal_marks enable row level security;
drop policy if exists "signal_marks_owner" on signal_marks;
create policy "signal_marks_owner" on signal_marks for all using (auth.uid() = user_id);

-- ── 预测账本 ────────────────────────────────────────────────────────────────
create table if not exists forecast_questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('market', 'data', 'business')),
  title           text not null,            -- 中文题目（会不会……）
  original_title  text,                     -- 市场题的原文
  criteria        text not null,            -- 怎么才算「会」
  resolve_on      date not null,            -- 到这天对账
  category        text,
  source          jsonb not null default '{}'::jsonb,
  -- market：{ platform: manifold|polymarket, id, url }；business：{ signal_id, headline }；data：{ series, op, threshold }
  context         text,                     -- 出题时的背景（原话）
  status          text not null default 'open' check (status in ('open', 'resolved', 'void')),
  outcome         boolean,
  resolved_at     timestamptz,
  resolution_note text,
  resolution_url  text,
  -- 生意题到期时程序查到的证据和建议的结论，等他点确认（{ suggested: yes|no|unclear, evidence: [...] }）
  pending         jsonb,
  -- 他在押之前先看了 AI 和市场的答案：看了就不能再押（免得被带偏，账本才干净）
  revealed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists forecast_questions_market_uniq
  on forecast_questions (user_id, (source->>'platform'), (source->>'id')) where kind = 'market';
create index if not exists forecast_questions_open_idx on forecast_questions (user_id, status, resolve_on);
alter table forecast_questions enable row level security;
drop policy if exists "forecast_questions_owner" on forecast_questions;
create policy "forecast_questions_owner" on forecast_questions for all using (auth.uid() = user_id);

create table if not exists forecasts (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references forecast_questions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  source      text not null check (source in ('ai_outside', 'ai_inside', 'ai_devil', 'ai', 'me', 'market')),
  probability numeric not null check (probability > 0 and probability < 1),
  reason      text,
  made_at     timestamptz not null default now(),
  constraint forecasts_uniq unique (question_id, source)
);
create index if not exists forecasts_user_idx on forecasts (user_id, source);
alter table forecasts enable row level security;
drop policy if exists "forecasts_owner" on forecasts;
create policy "forecasts_owner" on forecasts for all using (auth.uid() = user_id);

-- 092：给朋友用（经用户同意，2026-10-22）
-- 预测题共用：题目、AI 和市场的概率只在主账号下存一份；每个人自己的判断（source = me）各存各的，
--   所以唯一键加上 user_id；「先看了答案、这道不能再判断」也改成每人一份（forecast_reveals）。
-- 新闻的「记成观察 / 只是知道了」每人一份：主账号照旧记在 external_signals.status 上，
--   别的账号记在 signal_user_states（不会把主账号的列表弄乱）。

alter table forecasts drop constraint if exists forecasts_uniq;
do $$ begin
  alter table forecasts add constraint forecasts_uniq unique (question_id, user_id, source);
exception when duplicate_object then null; end $$;

create table if not exists forecast_reveals (
  question_id uuid not null references forecast_questions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (question_id, user_id)
);
insert into forecast_reveals (question_id, user_id, revealed_at)
  select id, user_id, revealed_at from forecast_questions where revealed_at is not null
  on conflict do nothing;
alter table forecast_reveals enable row level security;
drop policy if exists "forecast_reveals_owner" on forecast_reveals;
create policy "forecast_reveals_owner" on forecast_reveals for all using (auth.uid() = user_id);

create table if not exists signal_user_states (
  user_id        uuid not null references auth.users (id) on delete cascade,
  signal_id      uuid not null references external_signals (id) on delete cascade,
  status         text not null check (status in ('promoted', 'dismissed')),
  observation_id uuid references observations (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (user_id, signal_id)
);
alter table signal_user_states enable row level security;
drop policy if exists "signal_user_states_owner" on signal_user_states;
create policy "signal_user_states_owner" on signal_user_states for all using (auth.uid() = user_id);

-- ============================================================================
-- 093：外部信号重构第三步 ——「今天」一页（经用户同意，2026-10-22）
--
-- 1. 限定时间段的按意思找改成「先按时间筛、再逐条算」。原来的写法让 hnsw 索引先取最相近的几十条、再筛时间，
--    时间段一窄（比如「这条之后的」「今天抓到的」）就几乎什么都剩不下 —— 存档越大越明显。
--    时间段里不超过两万条就逐条算（几百毫秒以内），更宽的照旧走索引（宽了筛完还剩得多）。
-- 2. story_updates：他在跟的那几条（标过的、记成观察的、写过判断的），之后抓到的、意思够近的消息。
--    「今天」一页和早上的邮件用它列「你在跟的事，有新消息」。

create index if not exists external_signals_fetched_idx on external_signals (fetched_at desc);

create or replace function match_external_signals(
  query_embedding extensions.vector(768),
  match_count int default 20,
  after timestamptz default null,
  before timestamptz default null
)
returns table (id uuid, source text, url text, title text, snippet text, fetched_at timestamptz, similarity float)
language plpgsql stable
set search_path = public, extensions
as $$
declare
  n bigint;
begin
  if after is not null or before is not null then
    select count(*) into n from external_signals s
    where (after is null or s.fetched_at >= after) and (before is null or s.fetched_at < before);
  end if;
  if n is not null and n <= 20000 then
    return query
      with w as materialized (
        select s.id, s.source, s.url, s.title, s.raw_text, s.fetched_at, s.embedding
        from external_signals s
        where s.embedding is not null
          and (after is null or s.fetched_at >= after)
          and (before is null or s.fetched_at < before)
      )
      select w.id, w.source, w.url, w.title, left(w.raw_text, 400), w.fetched_at, (1 - (w.embedding <=> query_embedding))::float
      from w
      order by w.embedding <=> query_embedding
      limit match_count;
  else
    return query
      select s.id, s.source, s.url, s.title, left(s.raw_text, 400), s.fetched_at, (1 - (s.embedding <=> query_embedding))::float
      from external_signals s
      where s.embedding is not null
        and (after is null or s.fetched_at >= after)
        and (before is null or s.fetched_at < before)
      order by s.embedding <=> query_embedding
      limit match_count;
  end if;
end;
$$;

-- 他在跟的那几条（followed）各自之后（since 以后抓到、也晚于那一条）意思够近的消息，每条最多 per_story 个，最像的在前。
create or replace function story_updates(
  followed uuid[],
  since timestamptz,
  min_similarity float default 0.72,
  per_story int default 3
)
returns table (followed_id uuid, id uuid, source text, url text, title text, fetched_at timestamptz, similarity float)
language sql stable
set search_path = public, extensions
as $$
  with f as materialized (
    select e.id, e.fetched_at, e.embedding
    from external_signals e
    where e.id = any (followed) and e.embedding is not null
  ),
  w as materialized (
    select s.id, s.source, s.url, s.title, s.fetched_at, s.embedding
    from external_signals s
    where s.embedding is not null and s.fetched_at >= since
  ),
  pairs as (
    select f.id as followed_id, w.id, w.source, w.url, w.title, w.fetched_at,
           (1 - (w.embedding <=> f.embedding))::float as similarity
    from f join w on w.id <> f.id and w.fetched_at > f.fetched_at
  ),
  ranked as (
    select p.*, row_number() over (partition by p.followed_id order by p.similarity desc) as rn
    from pairs p
    where p.similarity >= min_similarity
  )
  select r.followed_id, r.id, r.source, r.url, r.title, r.fetched_at, r.similarity
  from ranked r
  where r.rn <= per_story
  order by r.similarity desc;
$$;

-- ============================================================================
-- 094：预测第一轮 —— 历史回测 + 校准练习（经用户同意，2026-10-22；原则 1 例外四：只用于对世界事件的预测）
--
-- 为什么：线上的题一天进几道、几个月后才对账，攒到能校准要半年以上。项目用的 AI（Gemini 2.5 Flash）知识停在 2025 年 1 月，
-- 2025 年 3 月以后开、现在已经结算的预测市场题，它不知道答案 —— 选那段时间里的某一天当「今天」，只给它那天以前的新闻（GDELT），
-- 它当时会说几成、那天市场说几成、后来实际怎样，几天就能攒几百道，AI 准不准、偏向哪边马上看得出来，也能学校准。
-- 同一批题给他练：先写「这类事一般几成」，再写这件事几成，马上揭晓（记得结果的不计分）。

create table if not exists forecast_history (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('manifold', 'polymarket')),
  market_id     text not null,
  url           text,
  token         text,                          -- Polymarket「会」那一边的代号（查那天的价格用）
  original_title text not null,
  description   text,
  created_on    date not null,                 -- 市场开的那天
  as_of         date not null,                 -- 当成「今天」的那天（开盘后、结算前）
  resolve_on    date not null,                 -- 结算的那天
  outcome       boolean not null,              -- 结果：会 / 不会（作废的不收）
  depth         numeric not null default 0,    -- 多少人在押（Manifold 人数 / Polymarket 成交额）
  priority      int not null default 0,        -- 先做哪些（跟日本、中国、经济、科技有关的在前）
  status        text not null default 'pending' check (status in ('pending', 'ready', 'skipped')),
  skip_reason   text,
  title         text,                          -- 中文题目
  criteria      text,                          -- 怎么才算「会」
  category      text,
  market_prob   numeric,                       -- 那天市场给的几成
  news          jsonb,                         -- 那天以前 30 天的新闻标题（GDELT），AI 和他看到的一样
  ai            jsonb,                         -- {outside:{p,reason}, inside:{…}, devil:{…}, median}
  created_at    timestamptz not null default now(),
  prepared_at   timestamptz,
  constraint forecast_history_uniq unique (platform, market_id)
);

create index if not exists forecast_history_todo_idx on forecast_history (status, priority desc, depth desc);
-- 题目是公开的世界上的事，大家共用；只有服务端读写
alter table forecast_history enable row level security;

create table if not exists forecast_history_answers (
  question_id uuid not null references forecast_history (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  base_rate   numeric,                         -- 先写的「这一类事一般几成会发生」
  probability numeric,                         -- 他的判断；knew 时为空
  knew        boolean not null default false,  -- 他记得结果：不计分
  answered_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create index if not exists forecast_history_answers_user_idx on forecast_history_answers (user_id, answered_at desc);
alter table forecast_history_answers enable row level security;
drop policy if exists "forecast_history_answers_owner" on forecast_history_answers;
create policy "forecast_history_answers_owner" on forecast_history_answers for all using (auth.uid() = user_id);

-- ============================================================================
-- 095：预测第二轮 —— 先猜自己实验的结果（经用户同意，2026-10-22；原则 1 例外四的延伸）
--
-- 为什么：创业者最要练的判断是「陌生人会怎么做」。假门开出去、周刊发出去之前，先猜一下结果，过一两周系统自己对账 ——
-- 反馈快，而且每一道都跟他的决定有关。
-- 规矩同例外四：题目和门槛由代码出（门槛取他过去同类实验的中位数，没有历史用默认），他只点几成；
-- 只数次数（几个人留邮箱、看了几次），不算转化率；分数由代码算；不挂到想法上、不给想法打分。

create table if not exists experiment_forecasts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('door_signups', 'door_views', 'issue_views')),
  target_id   uuid not null,                    -- 假门（signal_fake_doors.id）或周刊（signal_issues.id）
  platform    text not null default '',         -- 周刊：哪个平台；假门为空
  question    text not null,                    -- 代码写的题目
  threshold   integer not null,                 -- 至少多少才算「会」
  baseline    integer not null default 0,       -- 猜的时候已经有多少（之后新增的才算）
  start_at    timestamptz not null default now(),
  due_on      date not null,
  probability numeric not null,                 -- 他点的几成
  status      text not null default 'open' check (status in ('open', 'resolved', 'void')),
  observed    integer,                          -- 到期时实际多少
  outcome     boolean,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 同一个假门 / 同一期同一个平台，同时只有一道没对账的
create unique index if not exists experiment_forecasts_open_uniq on experiment_forecasts (user_id, kind, target_id, platform) where status = 'open';
create index if not exists experiment_forecasts_user_idx on experiment_forecasts (user_id, status, due_on);

alter table experiment_forecasts enable row level security;
drop policy if exists "experiment_forecasts_owner" on experiment_forecasts;
create policy "experiment_forecasts_owner" on experiment_forecasts for all using (auth.uid() = user_id);

-- ============================================================================
-- 096：预测第三轮 —— 领先指标 + 「会不会来日本」的题（经用户同意，2026-10-22）
--
-- 1. app_watch：上过中国 App Store 免费榜的 App，每天查它在日本 App Store 上架了没有、支不支持日语。
--    中国公司要进日本，几个月前就会留下痕迹：加日语、在日本上架。看行为，不看说法。
-- 2. forecast_questions 多一种题：arrival（到日本题）—— 差距清单里「那边有、日本还没有」的东西，到某天会不会在日本出现；
--    出题时附上时差图谱里同一类东西的历史（几件、几年内到了日本），当基准率。到期程序查证据、他确认，同生意题。

alter table forecast_questions drop constraint if exists forecast_questions_kind_check;
alter table forecast_questions add constraint forecast_questions_kind_check check (kind in ('market', 'data', 'business', 'arrival'));

create table if not exists app_watch (
  app_id      text primary key,              -- App Store 的 id（中国区、日本区同一个）
  name        text not null,
  developer   text,
  url         text,
  first_seen  date not null,                 -- 第一次在中国免费榜上见到
  checked_on  date,                          -- 最近一次查日本 App Store
  in_jp       boolean,                       -- 日本 App Store 上有没有
  has_ja      boolean,                       -- 支不支持日语
  jp_since    date,                          -- 看着它在日本上架的那天（第一次查就已经在的为空）
  ja_since    date,                          -- 看着它加了日语的那天（第一次查就已经有的为空）
  created_at  timestamptz not null default now()
);

alter table app_watch enable row level security;

-- ============================================================================
-- 097：预测第四轮 —— 日本政策的「流水线」（经用户同意，2026-10-22）
--
-- 日本的规则有很固定的流程：征求意见（パブコメ）→ 公布 → 施行。各部委从征求意见到公布、从公布到施行一般隔多久，
-- 可以从历史直接数出来 —— 一个简单的统计就比任何人的意见准。
-- 1. policy_items：e-Gov 意见征集（每天抓「正在征求意见」和「结果公示」两个订阅），标出跟他有关的（标题里有他关心的词）。
--    结果公示里有「案の公示日」「受付締切日」「命令等の公布日」：攒下来就是「截止 → 公布」的基准。
-- 2. policy_law_lags：几十部跟他的方向有关的法律（入管法、劳动、护理、民宿、支付、运输……）历次修改的公布日、施行日（e-Gov 法令 API）。
-- 3. 政策题（forecast_questions.kind = policy）：正在征求意见、跟他有关的那几件，「会不会在某天之前公布」——
--    门槛日取历史上「截止 → 公布」的中位数，到期由代码对账（看结果公示的公布日）；统计基准当成一方（forecasts.source = base）一起记分。

create table if not exists policy_items (
  id               text primary key,               -- e-Gov 案件番号
  title            text not null,
  ministry         text,
  category         text,
  notice_date      date,                           -- 案の公示日
  deadline         date,                           -- 受付締切日
  result_date      date,                           -- 結果の公示日
  promulgate_date  date,                           -- 命令等の公布日（结果页上叫「対象が定められた日」）
  comments         integer,                        -- 提出意見数
  url              text,
  relevant         boolean not null default false, -- 标题里有他关心的词
  first_seen       date not null default current_date,
  updated_at       timestamptz not null default now()
);
create index if not exists policy_items_open_idx on policy_items (relevant, deadline) where result_date is null;
alter table policy_items enable row level security;

create table if not exists policy_law_lags (
  law_id           text not null,
  law_title        text not null,
  law_type         text,
  amendment_title  text not null default '',
  promulgate_date  date not null,
  enforce_date     date not null,
  fetched_on       date not null default current_date,
  primary key (law_id, amendment_title, promulgate_date, enforce_date)
);
alter table policy_law_lags enable row level security;

alter table forecast_questions drop constraint if exists forecast_questions_kind_check;
alter table forecast_questions add constraint forecast_questions_kind_check check (kind in ('market', 'data', 'business', 'arrival', 'policy'));
alter table forecasts drop constraint if exists forecasts_source_check;
alter table forecasts add constraint forecasts_source_check check (source in ('ai_outside', 'ai_inside', 'ai_devil', 'ai', 'me', 'market', 'base'));

-- ============================================================================
-- 098：回想、一起练、存储读数（经用户同意，2026-10-23）
--
-- 1. recall_reviews：他标过、记成观察、写过判断的新闻，按间隔重复来「考」他 —— 先想当时为什么在意、后来怎样了，再看答案，
--    按记得 / 模糊 / 忘了排下一次（记得的越隔越久，忘了的过一周再问）。存下来不等于记得住，主动回想才记得住。
-- 2. signal_prefs.share_scores：和一起用的人互相看预测分数（两边都打开才看得到，默认谁都只看得到自己的）。
-- 3. storage_report()：数据库实际多大、哪几张表最大（免费版上限 500MB），不再靠估算。只有服务端能调。

create table if not exists recall_reviews (
  user_id        uuid not null references auth.users (id) on delete cascade,
  signal_id      uuid not null references external_signals (id) on delete cascade,
  interval_days  integer not null default 7,
  due_on         date not null,
  reviews        integer not null default 0,
  last_result    text check (last_result in ('remembered', 'vague', 'forgot')),
  last_at        timestamptz,
  created_at     timestamptz not null default now(),
  primary key (user_id, signal_id)
);
create index if not exists recall_reviews_due_idx on recall_reviews (user_id, due_on);
alter table recall_reviews enable row level security;
drop policy if exists "recall_reviews_owner" on recall_reviews;
create policy "recall_reviews_owner" on recall_reviews for all using (auth.uid() = user_id);

create table if not exists signal_prefs (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  share_scores  boolean not null default false,
  updated_at    timestamptz not null default now()
);
alter table signal_prefs enable row level security;
drop policy if exists "signal_prefs_owner" on signal_prefs;
create policy "signal_prefs_owner" on signal_prefs for all using (auth.uid() = user_id);

create or replace function storage_report()
returns table (name text, bytes bigint)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select 'database'::text, pg_database_size(current_database())
  union all
  (select c.relname::text, pg_total_relation_size(c.oid)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by 2 desc
   limit 15);
$$;
revoke execute on function storage_report() from public, anon, authenticated;
grant execute on function storage_report() to service_role;

-- 099：AI 先判、他点行不行（经用户明确裁决，2026-10-23）。
-- forecasts.mode（只有 source = 'me' 的行有）：blind 先判（看不到 AI）、agree 点了「行」、override 改了一档。
-- signal_judgments.mode 同义；ai_draft 是那道练习题 AI 先判的原样（三种思路和中间值），改判时挑刺要看。
-- mode 为空 = 迁移以前记的，一律当先判（那时看不到 AI）。先判题不加列：代码按「东京时间每周最早进账本的那道」认。

alter table forecasts add column if not exists mode text;
do $$ begin
  alter table forecasts add constraint forecasts_mode_check check (mode in ('blind', 'agree', 'override'));
exception when duplicate_object then null; end $$;

alter table signal_judgments add column if not exists mode text;
do $$ begin
  alter table signal_judgments add constraint signal_judgments_mode_check check (mode in ('blind', 'agree', 'override'));
exception when duplicate_object then null; end $$;

alter table signal_judgments add column if not exists ai_draft jsonb;

-- 100：他点开了哪几条新闻（经用户同意，2026-10-23；被动记录，他什么都不用点）。
-- 报告里展开一条、打开新闻详情页、从邮件里点进来，都记一次；同一条一天只记一次（数的是「点开过几天」）。
-- 用处：点开过两天以上的算「在跟的事」（接后来的消息，不进回想）；信息源体检里每个源数「点开过几条」。
-- 只是记下来，不进任何台账的推理，不打分。

create table if not exists signal_opens (
  user_id    uuid not null references auth.users (id) on delete cascade,
  signal_id  uuid not null references external_signals (id) on delete cascade,
  opened_on  date not null,                       -- 东京日期
  via        text not null check (via in ('report', 'detail', 'email', 'list')),
  first_at   timestamptz not null default now(),
  primary key (user_id, signal_id, opened_on)
);
create index if not exists signal_opens_user_idx on signal_opens (user_id, opened_on desc);

alter table signal_opens enable row level security;
drop policy if exists "signal_opens_owner" on signal_opens;
create policy "signal_opens_owner" on signal_opens for all using (auth.uid() = user_id);

-- ============================================================================
-- 101：预测题的「从这几样想起」（经用户同意，2026-10-24）。
-- 光让他点几成、不给思路，等于纯猜：后台先把每道等他判断的题拆好 —— 由哪几个因素决定、每个怎么起作用（两个方向的条件句）、
-- 现在怎样（上网查，原文由代码核对）、去哪看；不写方向、不写可能性数字（先判题也照样摆）。
-- 和每日练习的拆解卡同一个形状（lib/domains/signals/breakdown-shared.ts 的 Breakdown）；没拆过是 null。

alter table forecast_questions add column if not exists breakdown jsonb;

-- ============================================================================
-- Synced migration: 102_signal_reading_preferences.sql
-- ============================================================================
-- Explicit reading choices belong to the viewer, including when the report is shared.
create table if not exists signal_reading_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 250),
  signal_id uuid not null references external_signals(id) on delete cascade,
  event_label text check (char_length(event_label) <= 200),
  preference text not null check (preference in ('follow', 'mute')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_key)
);
create index if not exists signal_reading_preferences_user_idx
  on signal_reading_preferences(user_id, updated_at desc);
alter table signal_reading_preferences enable row level security;
drop policy if exists "signal_reading_preferences_owner" on signal_reading_preferences;
create policy "signal_reading_preferences_owner" on signal_reading_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ============================================================================
-- Synced migration: 103_signal_judgment_updates.sql
-- ============================================================================
-- A later view is a new entry. The original prediction remains the basis for reconciliation.
create table if not exists signal_judgment_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  judgment_id uuid not null references signal_judgments (id) on delete cascade,
  judgment text not null check (char_length(btrim(judgment)) between 4 and 500),
  reason text not null check (char_length(btrim(reason)) between 4 and 1000),
  source_url text check (source_url is null or (char_length(source_url) <= 2000 and source_url ~ '^https?://[^[:space:]]+$')),
  created_at timestamptz not null default now()
);

create index if not exists signal_judgment_updates_history_idx
  on signal_judgment_updates (user_id, judgment_id, created_at, id);

alter table signal_judgment_updates enable row level security;
drop policy if exists signal_judgment_updates_read on signal_judgment_updates;
create policy signal_judgment_updates_read on signal_judgment_updates for select
  using (auth.uid() = user_id);
drop policy if exists signal_judgment_updates_append on signal_judgment_updates;
create policy signal_judgment_updates_append on signal_judgment_updates for insert
  with check (auth.uid() = user_id and exists (
    select 1 from signal_judgments j where j.id = judgment_id and j.user_id = auth.uid()
  ));

-- Also enforce ownership when the server uses its service role and bypasses RLS.
create or replace function check_signal_judgment_update_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from signal_judgments j where j.id = new.judgment_id and j.user_id = new.user_id) then
    raise exception 'Judgment update owner does not match the original judgment';
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists signal_judgment_update_owner on signal_judgment_updates;
create trigger signal_judgment_update_owner before insert on signal_judgment_updates
  for each row execute function check_signal_judgment_update_owner();

create or replace function preserve_signal_judgment_update() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Permit cascades when an account or the parent record is removed.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Judgment history is append-only';
end;
$$;
drop trigger if exists signal_judgment_update_immutable on signal_judgment_updates;
create trigger signal_judgment_update_immutable before update or delete on signal_judgment_updates
  for each row execute function preserve_signal_judgment_update();

revoke update, delete on signal_judgment_updates from anon, authenticated;


-- ============================================================================
-- Synced migration: 104_signal_reading_sessions.sql
-- ============================================================================
-- 阅读终点由用户主动决定；展开不等于读完。快照用于识别结束后报告新增的条目。
create table if not exists public.signal_reading_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null,
  signal_ids uuid[] not null check (cardinality(signal_ids) between 1 and 200),
  stopped_at timestamptz not null default now(),
  primary key (user_id, report_date)
);
alter table public.signal_reading_sessions enable row level security;
drop policy if exists "signal_reading_sessions_owner" on public.signal_reading_sessions;
create policy "signal_reading_sessions_owner" on public.signal_reading_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ============================================================================
-- Synced migration: 105_signal_event_dossiers.sql
-- ============================================================================
-- Private, explicitly curated event dossiers. No AI, scores, or automatic membership.
create table public.signal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  scope_note text check (length(scope_note) <= 1000),
  revision bigint not null default 0 check (revision >= 0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(user_id,id), unique(user_id,client_request_id)
);
create index signal_events_page on public.signal_events(user_id,created_at desc,id desc);

create table public.signal_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null references public.external_signals(id) on delete restrict,
  title text not null check(length(btrim(title)) between 1 and 1000),
  source_name text not null check(length(btrim(source_name)) between 1 and 200),
  source_url text check(source_url is null or (length(source_url) <= 4096 and source_url ~* '^https?://[^/[:space:]]+' and source_url !~* '^https?://[^/]*@')),
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  source_fetched_at timestamptz,
  capture_scope text not null check(capture_scope in ('summary','excerpt','body')),
  captured_text text not null check(length(btrim(captured_text)) between 1 and 100000),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  unique(user_id,id,signal_id), unique(user_id,signal_id,payload_hash)
);
create table public.signal_event_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  signal_id uuid not null references public.external_signals(id) on delete restrict,
  snapshot_id uuid,
  action text not null check(action in ('include','exclude')),
  revision bigint not null check(revision > 0),
  client_request_id uuid not null,
  note text check(length(note) <= 1000),
  occurred_from text, occurred_to text, occurred_precision text, occurred_quote text,
  created_at timestamptz not null default now(),
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
  foreign key(user_id,snapshot_id,signal_id) references public.signal_source_snapshots(user_id,id,signal_id) on delete restrict,
  unique(event_id,revision), unique(user_id,client_request_id),
  check(action<>'include' or snapshot_id is not null),
  check ((occurred_from is null and occurred_to is null and occurred_precision is null and occurred_quote is null) or
    (occurred_from is not null and occurred_precision in ('day','month','year') and length(btrim(occurred_quote)) between 1 and 4000))
);
create index signal_event_members_latest on public.signal_event_memberships(user_id,event_id,signal_id,revision desc);

alter table public.signal_events enable row level security;
alter table public.signal_source_snapshots enable row level security;
alter table public.signal_event_memberships enable row level security;
create policy event_owner_read on public.signal_events for select to authenticated using(auth.uid()=user_id);
create policy snapshot_owner_read on public.signal_source_snapshots for select to authenticated using(auth.uid()=user_id);
create policy membership_owner_read on public.signal_event_memberships for select to authenticated using(auth.uid()=user_id);
revoke all on public.signal_events,public.signal_source_snapshots,public.signal_event_memberships from anon,authenticated;
grant select on public.signal_events,public.signal_source_snapshots,public.signal_event_memberships to authenticated;
grant all on public.signal_events,public.signal_source_snapshots,public.signal_event_memberships to service_role;

-- Date precision remains text: a month/year never masquerades as an exact day.
create function public.signal_occurrence_date(value text, p_precision text) returns date
language plpgsql immutable set search_path=public,pg_temp as $$
declare normalized text; result date;
begin
  if value is null then return null; end if;
  if p_precision='day' and value ~ '^\d{4}-\d{2}-\d{2}$' then normalized:=value;
  elsif p_precision='month' and value ~ '^\d{4}-\d{2}$' then normalized:=value||'-01';
  elsif p_precision='year' and value ~ '^\d{4}$' then normalized:=value||'-01-01';
  else raise exception 'invalid occurrence precision'; end if;
  result:=normalized::date;
  if to_char(result,'YYYY-MM-DD')<>normalized then raise exception 'invalid occurrence date'; end if;
  return result;
end $$;

create function public.signal_event_guard_owner(p_user_id uuid) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_user_id is null or (coalesce(auth.role(),'')<>'service_role' and auth.uid() is distinct from p_user_id) then
    raise exception 'event owner required' using errcode='42501';
  end if;
end $$;

create function public.signal_snapshot_immutable() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.captured_at:=clock_timestamp(); return new; end if;
  if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  raise exception 'source snapshots are immutable';
end $$;
create trigger source_snapshot_immutable before insert or update or delete on public.signal_source_snapshots for each row execute function public.signal_snapshot_immutable();

create function public.signal_membership_immutable() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare text_copy text; from_date date; to_date date;
begin
  if tg_op='DELETE' and (not exists(select 1 from auth.users where id=old.user_id) or not exists(select 1 from public.signal_events where id=old.event_id and user_id=old.user_id)) then return old; end if;
  if tg_op<>'INSERT' then raise exception 'membership history is append only'; end if;
  if new.occurred_from is not null then
    from_date:=public.signal_occurrence_date(new.occurred_from,new.occurred_precision);
    to_date:=public.signal_occurrence_date(new.occurred_to,new.occurred_precision);
    if to_date<from_date then raise exception 'occurrence interval reversed'; end if;
    select captured_text into text_copy from public.signal_source_snapshots where id=new.snapshot_id and user_id=new.user_id and signal_id=new.signal_id;
    if text_copy is null or new.occurred_quote is null or position(new.occurred_quote in text_copy)=0 then raise exception 'occurrence quote absent from snapshot'; end if;
  end if;
  return new;
end $$;
create trigger membership_immutable before insert or update or delete on public.signal_event_memberships for each row execute function public.signal_membership_immutable();

create function public.create_signal_event(p_user_id uuid,p_title text,p_scope_note text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare row public.signal_events;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_request_id is null or p_title is null or length(btrim(p_title)) not between 1 and 120 or length(p_scope_note)>1000 then raise exception 'invalid event input'; end if;
  -- Unique insertion serializes concurrent retries, then compare the original payload.
  insert into public.signal_events(user_id,title,scope_note,client_request_id)
    values(p_user_id,btrim(p_title),nullif(btrim(p_scope_note),''),p_request_id)
    on conflict(user_id,client_request_id) do nothing;
  select * into row from public.signal_events where user_id=p_user_id and client_request_id=p_request_id for update;
  if row.title is distinct from btrim(p_title) or row.scope_note is distinct from nullif(btrim(p_scope_note),'') then raise exception 'request payload conflict' using errcode='23505'; end if;
  return jsonb_build_object('id',row.id,'revision',row.revision);
end $$;

create function public.revise_signal_event_member(p_user_id uuid,p_event_id uuid,p_signal_id uuid,p_snapshot_id uuid,p_action text,p_request_id uuid,p_note text default null,p_occurred_from text default null,p_occurred_to text default null,p_occurred_precision text default null,p_occurred_quote text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare event_row public.signal_events; old_row public.signal_event_memberships; snapshot uuid; new_revision bigint;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_event_id is null or p_signal_id is null or p_request_id is null or p_action is null or p_action not in ('include','exclude') or length(p_note)>1000 then raise exception 'invalid member input'; end if;
  select * into event_row from public.signal_events where id=p_event_id and user_id=p_user_id for update;
  if not found or event_row.archived_at is not null then raise exception 'event unavailable' using errcode='42501'; end if;
  select * into old_row from public.signal_event_memberships where user_id=p_user_id and client_request_id=p_request_id;
  if found then
    if old_row.event_id is distinct from p_event_id or old_row.signal_id is distinct from p_signal_id or old_row.action is distinct from p_action or
      (p_snapshot_id is not null and old_row.snapshot_id is distinct from p_snapshot_id) or old_row.note is distinct from nullif(btrim(p_note),'') or
      old_row.occurred_from is distinct from p_occurred_from or old_row.occurred_to is distinct from p_occurred_to or old_row.occurred_precision is distinct from p_occurred_precision or old_row.occurred_quote is distinct from p_occurred_quote then raise exception 'request payload conflict' using errcode='23505'; end if;
    return jsonb_build_object('revision',old_row.revision);
  end if;
  if p_action='exclude' then
    if p_snapshot_id is not null or p_occurred_from is not null or p_occurred_to is not null or p_occurred_precision is not null or p_occurred_quote is not null then raise exception 'exclude cannot supply source or dates'; end if;
    select * into old_row from public.signal_event_memberships where user_id=p_user_id and event_id=p_event_id and signal_id=p_signal_id order by revision desc limit 1;
    snapshot:=old_row.snapshot_id;
  else
    snapshot:=p_snapshot_id;
    if snapshot is null or not exists(select 1 from public.signal_source_snapshots where user_id=p_user_id and id=snapshot and signal_id=p_signal_id) then raise exception 'source snapshot unavailable' using errcode='42501'; end if;
  end if;
  update public.signal_events set revision=revision+1 where id=p_event_id returning revision into new_revision;
  insert into public.signal_event_memberships(user_id,event_id,signal_id,snapshot_id,action,revision,client_request_id,note,occurred_from,occurred_to,occurred_precision,occurred_quote)
    values(p_user_id,p_event_id,p_signal_id,snapshot,p_action,new_revision,p_request_id,nullif(btrim(p_note),''),p_occurred_from,p_occurred_to,p_occurred_precision,p_occurred_quote);
  return jsonb_build_object('revision',new_revision);
end $$;

create function public.list_signal_events(p_user_id uuid,p_search text default '',p_cursor text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; cursor_data jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_limit is null or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'invalid page input'; end if;
  cursor_data:=p_cursor::jsonb;
  with selected as (
    select id,title,scope_note,revision,created_at,archived_at from public.signal_events
    where user_id=p_user_id and archived_at is null and (coalesce(p_search,'')='' or title ilike '%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%')
      and (p_cursor is null or (created_at,id)<((cursor_data->>'at')::timestamptz,(cursor_data->>'id')::uuid))
    order by created_at desc,id desc limit p_limit+1
  ), page as (select * from selected order by created_at desc,id desc limit p_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from selected)>p_limit then (select jsonb_build_object('at',created_at,'id',id)::text from page order by created_at,id limit 1) else null end) into result;
  return result;
end $$;

create function public.signal_event_timeline(p_user_id uuid,p_event_id uuid,p_mode text default 'published',p_cursor text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; cursor_data jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_mode is null or p_mode not in ('published','occurred','captured') or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid timeline input'; end if;
  if not exists(select 1 from public.signal_events where user_id=p_user_id and id=p_event_id) then raise exception 'event unavailable' using errcode='42501'; end if;
  cursor_data:=p_cursor::jsonb;
  if p_cursor is not null and cursor_data->>'mode' is distinct from p_mode then raise exception 'cursor mode mismatch'; end if;
  with latest as (
    select distinct on (m.signal_id) m.* from public.signal_event_memberships m
    where m.user_id=p_user_id and m.event_id=p_event_id order by m.signal_id,m.revision desc
  ), entries as (
    select m.signal_id,s.id as snapshot_id,s.title,s.source_name,s.source_url,s.published_at,s.captured_at,s.source_fetched_at,s.captured_text,s.capture_scope,
      m.occurred_from,m.occurred_to,m.occurred_precision,m.occurred_quote,m.note,m.revision,
      (select min(o.first_at) from public.signal_opens o where o.user_id=p_user_id and o.signal_id=m.signal_id) as first_open,
      case p_mode when 'published' then s.published_at when 'captured' then s.captured_at else public.signal_occurrence_date(m.occurred_from,m.occurred_precision)::timestamp at time zone 'UTC' end as time_key
    from latest m join public.signal_source_snapshots s on (s.user_id,s.id,s.signal_id)=(m.user_id,m.snapshot_id,m.signal_id)
    where m.action='include'
  ), selected as (
    select * from entries where p_cursor is null or
      (case when cursor_data->>'at' is null then time_key is null and snapshot_id<(cursor_data->>'id')::uuid
        else time_key is null or (time_key,snapshot_id)<((cursor_data->>'at')::timestamptz,(cursor_data->>'id')::uuid) end)
    order by time_key desc nulls last,snapshot_id desc limit p_limit+1
  ), page as (select * from selected order by time_key desc nulls last,snapshot_id desc limit p_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'signalId',signal_id,'snapshotId',snapshot_id,'title',title,'sourceName',source_name,'sourceUrl',source_url,
    'publishedAt',published_at,'capturedAt',captured_at,'sourceFetchedAt',source_fetched_at,'capturedText',captured_text,'captureScope',capture_scope,
    'occurred',case when occurred_from is null then null else jsonb_build_object('from',occurred_from,'to',occurred_to,'precision',occurred_precision,'quote',occurred_quote) end,
    'firstRecordedOpenAt',first_open,'note',note,'revision',revision) order by time_key desc nulls last,snapshot_id desc) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from selected)>p_limit then (select jsonb_build_object('mode',p_mode,'at',time_key,'id',snapshot_id)::text from page order by time_key asc nulls first,snapshot_id asc limit 1) else null end) into result;
  return result;
end $$;

create function public.suggest_signal_event_members(p_user_id uuid,p_event_id uuid,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare event_title text; result jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid candidate limit'; end if;
  select title into event_title from public.signal_events where user_id=p_user_id and id=p_event_id;
  if not found then raise exception 'event unavailable' using errcode='42501'; end if;
  -- Any prior explicit exclusion remains excluded from suggestions. Inclusion always requires a command.
  select coalesce(jsonb_agg(to_jsonb(candidate)),'[]'::jsonb) into result from (
    select s.id,coalesce(s.title,'无标题') as title,s.source,s.url,s.fetched_at from public.external_signals s
    where (to_tsvector('simple',coalesce(s.title,'')) @@ plainto_tsquery('simple',event_title)
      or (select count(distinct substring(event_title from n for 2)) from generate_series(1,length(event_title)-1) n
        where substring(event_title from n for 2) ~ '^[一-龥ぁ-んァ-ヶ]{2}$'
          and position(substring(event_title from n for 2) in coalesce(s.title,''))>0)>=2)
      and s.source not like 'github%'
      and not exists(select 1 from public.signal_event_memberships m where m.user_id=p_user_id and m.event_id=p_event_id and m.signal_id=s.id)
    order by s.fetched_at desc,s.id desc limit p_limit
  ) candidate;
  return result;
end $$;

create function public.signal_event_links(p_user_id uuid,p_signal_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_signal_ids is null or cardinality(p_signal_ids)>200 then raise exception 'invalid signal batch'; end if;
  with latest as (
    select distinct on (m.event_id,m.signal_id) m.event_id,m.signal_id,m.action
    from public.signal_event_memberships m where m.user_id=p_user_id and m.signal_id=any(p_signal_ids)
    order by m.event_id,m.signal_id,m.revision desc
  ), grouped as (
    select m.signal_id,jsonb_agg(jsonb_build_object('id',e.id,'title',e.title) order by e.created_at desc,e.id desc) as links
    from latest m join public.signal_events e on e.id=m.event_id and e.user_id=p_user_id
    where m.action='include' and e.archived_at is null group by m.signal_id
  ) select coalesce(jsonb_object_agg(signal_id::text,links),'{}'::jsonb) into result from grouped;
  return result;
end $$;

revoke all on function public.signal_occurrence_date(text,text),public.signal_event_guard_owner(uuid),public.signal_snapshot_immutable(),public.signal_membership_immutable() from public,anon,authenticated;
revoke all on function public.create_signal_event(uuid,text,text,uuid),public.revise_signal_event_member(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text),public.list_signal_events(uuid,text,text,integer),public.signal_event_timeline(uuid,uuid,text,text,integer),public.suggest_signal_event_members(uuid,uuid,integer) from public,anon;
grant execute on function public.create_signal_event(uuid,text,text,uuid),public.revise_signal_event_member(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text),public.list_signal_events(uuid,text,text,integer),public.signal_event_timeline(uuid,uuid,text,text,integer),public.suggest_signal_event_members(uuid,uuid,integer) to authenticated,service_role;
revoke all on function public.signal_event_links(uuid,uuid[]) from public,anon;
grant execute on function public.signal_event_links(uuid,uuid[]) to authenticated,service_role;


-- ============================================================================
-- Synced migration: 106_signal_event_research.sql
-- ============================================================================
-- Typed append-only research journal: preserves each user's evolving evidence and views.
create table public.signal_event_research_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  kind text not null check (kind in ('note','unknown','unknown_answer','explanation','explanation_evidence','expectation','expectation_resolution','perspective','source_link','dossier','connection','window','window_check','understanding')),
  subject_id uuid,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=65000),
  client_request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id,user_id,event_id), unique(user_id,client_request_id),
  foreign key (user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
  foreign key (subject_id,user_id,event_id) references public.signal_event_research_entries(id,user_id,event_id)
);
create index event_research_history on public.signal_event_research_entries(user_id,event_id,created_at,id);
alter table public.signal_event_research_entries enable row level security;
create policy event_research_owner on public.signal_event_research_entries for select to authenticated using(auth.uid()=user_id);
revoke all on public.signal_event_research_entries from public,anon,authenticated;
grant select on public.signal_event_research_entries to authenticated;
grant select,insert on public.signal_event_research_entries to service_role;

create function public.preserve_event_research() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); return new; end if;
  if tg_op='DELETE' and (not exists(select 1 from auth.users where id=old.user_id) or not exists(select 1 from public.signal_events where id=old.event_id)) then return old; end if;
  raise exception 'event research is append only';
end $$;
create trigger event_research_immutable before insert or update or delete on public.signal_event_research_entries for each row execute function public.preserve_event_research();

create function public.append_signal_event_research(p_user_id uuid,p_event_id uuid,p_kind text,p_subject_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.signal_event_research_entries; parent public.signal_event_research_entries; result public.signal_event_research_entries; ref jsonb; target uuid; allowed_event uuid; proof text; from_id uuid; to_id uuid;
begin
  perform public.signal_event_guard_owner(p_user_id);
  perform 1 from public.signal_events where id=p_event_id and user_id=p_user_id and archived_at is null for update;
  if not found then raise exception 'event owner required' using errcode='42501'; end if;
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65000 then raise exception 'invalid research payload'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where lower(k) ~ 'score|rating|confidence|percentage') then raise exception 'research does not accept scores'; end if;
  if p_kind in ('window_check','dossier','understanding') and coalesce(auth.role(),'')<>'service_role' then raise exception 'server generated research only' using errcode='42501'; end if;
  if p_kind in ('note','unknown_answer','explanation','explanation_evidence','expectation','expectation_resolution','perspective','connection') and nullif(btrim(p_payload->>'text'),'') is null then raise exception 'research text required'; end if;
  if p_kind='unknown' and (nullif(btrim(p_payload->>'question'),'') is null or nullif(btrim(p_payload->>'criterion'),'') is null) then raise exception 'unknown requires question and criterion'; end if;
  if p_kind='unknown_answer' and (p_payload->>'status' is null or p_payload->>'status' not in ('open','answered','closed')) then raise exception 'unknown status required'; end if;
  if p_kind='explanation' and (nullif(btrim(p_payload->>'assumptions'),'') is null or nullif(btrim(p_payload->>'distinguish'),'') is null) then raise exception 'explanation needs assumptions and distinguishing observation'; end if;
  if p_kind='explanation_evidence' and (p_payload->>'direction' is null or p_payload->>'direction' not in ('supports','contradicts','context') or jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0) then raise exception 'explanation needs evidence'; end if;
  if p_kind='expectation' then
    if p_payload->>'dueAt' is null or p_payload->>'dueAt' !~ '^\d{4}-\d{2}-\d{2}$' or nullif(btrim(p_payload->>'criterion'),'') is null then raise exception 'expectation requires date and criterion'; end if;
    perform (p_payload->>'dueAt')::date;
  end if;
  if p_kind='perspective' and (p_payload->>'role' is null or p_payload->>'role' not in ('customer','employee','operator','supplier') or nullif(btrim(p_payload->>'questions'),'') is null or jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0) then raise exception 'perspective requires source evidence and questions'; end if;
  if p_kind='window' and (p_payload->>'url' is null or p_payload->>'url' !~ '^https?://' or p_payload->>'cadence' is null or p_payload->>'cadence' not in ('manual','weekly','monthly') or jsonb_typeof(p_payload->'field') is distinct from 'string') then raise exception 'invalid observation window'; end if;
  if p_kind='window_check' then
    if p_payload->>'status' is null or p_payload->>'status' not in ('success','failed') or p_payload->>'url' is null or p_payload->>'url' !~ '^https?://' or p_payload->>'checkedAt' is null then raise exception 'invalid observation check'; end if;
    perform (p_payload->>'checkedAt')::timestamptz;
    if p_payload->>'status'='failed' and (nullif(btrim(p_payload->>'error'),'') is null or p_payload ?| array['value','excerpt','hash']) then raise exception 'failed check cannot contain success facts'; end if;
    if p_payload->>'status'='success' and (p_payload->>'hash' is null or p_payload->>'hash' !~ '^[a-f0-9]{64}$' or nullif(btrim(p_payload->>'excerpt'),'') is null) then raise exception 'successful check needs captured text'; end if;
  end if;
  if p_kind in ('dossier','understanding') then
    if p_payload->>'inputHash' is null or p_payload->>'inputHash' !~ '^[a-f0-9]{64}$' or p_payload->>'task' is null or jsonb_typeof(p_payload->'sections') is distinct from 'array' or jsonb_array_length(p_payload->'sections') not between 1 and 12 then raise exception 'generated draft requires provenance'; end if;
    for ref in select value from jsonb_array_elements(p_payload->'sections') loop
      if nullif(btrim(ref->>'heading'),'') is null or nullif(btrim(ref->>'text'),'') is null or jsonb_typeof(ref->'refs') is distinct from 'array' then raise exception 'invalid generated section'; end if;
      if jsonb_array_length(ref->'refs')=0 and jsonb_array_length(coalesce(ref->'noteRefs','[]'::jsonb))=0 and concat(ref->>'heading',ref->>'text') !~ '未知|待核实|需要核实|需要问|尚不清楚' then raise exception 'generated claim requires evidence'; end if;
      if exists(select 1 from jsonb_array_elements(ref->'refs') r where not coalesce(p_payload->'refs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'section citation missing from validated refs'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(ref->'noteRefs','[]'::jsonb)) r where not coalesce(p_payload->'noteRefs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'section note citation missing'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(ref->'proposal'->'payload'->'refs','[]'::jsonb)) r where not coalesce(p_payload->'refs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'proposal source citation missing'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(ref->'proposal'->'payload'->'noteRefs','[]'::jsonb)) r where not coalesce(p_payload->'noteRefs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'proposal note citation missing'; end if;
    end loop;
    if jsonb_typeof(coalesce(p_payload->'selectedSnapshotIds','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'selectedSnapshotIds','[]'::jsonb))>12 or jsonb_typeof(coalesce(p_payload->'selectedNoteIds','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'selectedNoteIds','[]'::jsonb))>10 then raise exception 'invalid selected input scope'; end if;
    for ref in select value from jsonb_array_elements(coalesce(p_payload->'noteRefs','[]'::jsonb)) loop
      if not coalesce(p_payload->'selectedNoteIds','[]'::jsonb) @> jsonb_build_array(ref->>'recordId') then raise exception 'unselected private note' using errcode='42501'; end if;
    end loop;
    if p_payload->>'targetEventId' is not null then
      allowed_event:=(p_payload->>'targetEventId')::uuid;
      if allowed_event=p_event_id or not exists(select 1 from public.signal_events where id=allowed_event and user_id=p_user_id) then raise exception 'draft target unavailable' using errcode='42501'; end if;
    end if;
  end if;
  if jsonb_typeof(coalesce(p_payload->'noteRefs','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'noteRefs','[]'::jsonb))>24 then raise exception 'invalid private note refs'; end if;
  for ref in select value from jsonb_array_elements(coalesce(p_payload->'noteRefs','[]'::jsonb)) loop
    if nullif(btrim(ref->>'quote'),'') is null or length(ref->>'quote')>1000 or not exists(select 1 from public.signal_event_research_entries r where r.id=(ref->>'recordId')::uuid and r.user_id=p_user_id and r.event_id=p_event_id and r.kind in ('note','explanation') and position(ref->>'quote' in r.payload->>'text')>0) then raise exception 'unavailable private note or quote mismatch' using errcode='42501'; end if;
  end loop;
  select * into previous from public.signal_event_research_entries where user_id=p_user_id and client_request_id=p_request_id;
  if found then
    if previous.event_id is distinct from p_event_id or previous.kind is distinct from p_kind or previous.subject_id is distinct from p_subject_id or previous.payload is distinct from p_payload then raise exception 'request payload conflict' using errcode='23505'; end if;
    return to_jsonb(previous);
  end if;
  if p_subject_id is not null then
    select * into parent from public.signal_event_research_entries where id=p_subject_id and event_id=p_event_id and user_id=p_user_id;
    if not found then raise exception 'research parent unavailable' using errcode='42501'; end if;
    if p_kind in ('note','explanation','source_link') and parent.kind is distinct from p_kind then raise exception 'research revision type mismatch'; end if;
  end if;
  if (p_kind='unknown_answer' and parent.kind is distinct from 'unknown') or (p_kind='explanation_evidence' and parent.kind is distinct from 'explanation') or (p_kind='expectation_resolution' and parent.kind is distinct from 'expectation') or (p_kind='window_check' and parent.kind is distinct from 'window') then raise exception 'research parent type mismatch'; end if;
  if p_kind='expectation_resolution' then
    if p_payload->>'result' is null or p_payload->>'result' not in ('happened','not_happened','unknown') or nullif(btrim(p_payload->>'text'),'') is null then raise exception 'invalid resolution'; end if;
    if p_payload->>'result'='not_happened' and clock_timestamp()<((parent.payload->>'dueAt')||'T23:59:59+09:00')::timestamptz then raise exception 'expectation deadline has not passed'; end if;
    if p_payload->>'result'<>'unknown' and jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0 then raise exception 'resolution needs source evidence'; end if;
  end if;
  if p_kind='unknown_answer' and p_payload->>'status'='answered' and jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0 then raise exception 'answer needs source evidence'; end if;
  if p_kind='connection' then
    allowed_event:=(p_payload->>'targetEventId')::uuid;
    if allowed_event=p_event_id or not exists(select 1 from public.signal_events where id=allowed_event and user_id=p_user_id) then raise exception 'connection target unavailable' using errcode='42501'; end if;
    if nullif(btrim(p_payload->>'assumption'),'') is null or nullif(btrim(p_payload->>'counter'),'') is null or nullif(btrim(p_payload->>'alternative'),'') is null then raise exception 'connection requires assumptions and alternatives'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'refs','[]'::jsonb)) r join public.signal_event_memberships m on m.snapshot_id=(r->>'snapshotId')::uuid where m.user_id=p_user_id and m.event_id=p_event_id and m.action='include') or not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'refs','[]'::jsonb)) r join public.signal_event_memberships m on m.snapshot_id=(r->>'snapshotId')::uuid where m.user_id=p_user_id and m.event_id=allowed_event and m.action='include') then raise exception 'connection needs sources from both events'; end if;
  end if;
  if jsonb_typeof(coalesce(p_payload->'refs','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))>24 then raise exception 'invalid source refs'; end if;
  for ref in select value from jsonb_array_elements(coalesce(p_payload->'refs','[]'::jsonb)) loop
    target:=(ref->>'snapshotId')::uuid; proof:=ref->>'quote';
    if p_kind in ('dossier','understanding') and not coalesce(p_payload->'selectedSnapshotIds','[]'::jsonb) @> jsonb_build_array(target::text) then raise exception 'unselected source in generated draft'; end if;
    if nullif(btrim(proof),'') is null or length(proof)>2000 or not exists (
      select 1 from public.signal_source_snapshots s where s.id=target and s.user_id=p_user_id and position(proof in s.captured_text)>0
      and exists(select 1 from public.signal_event_memberships m where m.user_id=p_user_id and m.snapshot_id=s.id and m.action='include' and (m.event_id=p_event_id or m.event_id=allowed_event))
    ) then raise exception 'source quote unavailable' using errcode='42501'; end if;
  end loop;
  if p_kind='source_link' then
    from_id:=(p_payload->>'fromSnapshotId')::uuid; to_id:=(p_payload->>'toSnapshotId')::uuid;
    if from_id is null or to_id is null or from_id=to_id or p_payload->>'relation' is null or p_payload->>'relation' not in ('cites','reprints') or not exists(select 1 from jsonb_array_elements(p_payload->'refs') r where r->>'snapshotId'=from_id::text) then raise exception 'source relation needs explicit proof'; end if;
    if exists(select 1 from unnest(array[from_id,to_id]) s(id) where not exists(select 1 from public.signal_event_memberships m where m.user_id=p_user_id and m.event_id=p_event_id and m.snapshot_id=s.id and m.action='include')) then raise exception 'source relation owner mismatch'; end if;
    if coalesce((p_payload->>'active')::boolean,true) and exists(
      with recursive latest as (
        select distinct on(payload->>'fromSnapshotId',payload->>'toSnapshotId') payload,created_at,id from public.signal_event_research_entries
        where user_id=p_user_id and event_id=p_event_id and kind='source_link' order by payload->>'fromSnapshotId',payload->>'toSnapshotId',created_at desc,id desc
      ), edges as (select payload->>'fromSnapshotId' as a,payload->>'toSnapshotId' as b from latest where coalesce((payload->>'active')::boolean,true)),
      reach(id) as (select to_id::text union select edges.b from edges join reach on edges.a=reach.id)
      select 1 from reach where id=from_id::text
    ) then raise exception 'source lineage cycle'; end if;
  end if;
  insert into public.signal_event_research_entries(user_id,event_id,kind,subject_id,payload,client_request_id) values(p_user_id,p_event_id,p_kind,p_subject_id,p_payload,p_request_id) returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid),public.preserve_event_research() from public,anon;
grant execute on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) to authenticated,service_role;

-- Short leases prevent duplicate paid generations for the same explicit input.
create table public.signal_event_ai_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  status text not null check(status in ('running','done','failed')),
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,event_id,input_hash),
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade
);
alter table public.signal_event_ai_jobs enable row level security;
revoke all on public.signal_event_ai_jobs from public,anon,authenticated;
grant select,insert,update on public.signal_event_ai_jobs to service_role;
create function public.claim_signal_event_ai_job(p_user_id uuid,p_event_id uuid,p_input_hash text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed boolean;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if coalesce(auth.role(),'')<>'service_role' or not exists(select 1 from public.signal_events where id=p_event_id and user_id=p_user_id) then raise exception 'server owned generation required' using errcode='42501'; end if;
  if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid input hash'; end if;
  insert into public.signal_event_ai_jobs(user_id,event_id,input_hash,status,lease_until) values(p_user_id,p_event_id,p_input_hash,'running',clock_timestamp()+interval '180 seconds')
  on conflict(user_id,event_id,input_hash) do update set status='running',lease_until=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp()
  where signal_event_ai_jobs.status<>'running' or signal_event_ai_jobs.lease_until<=clock_timestamp() returning true into claimed;
  if coalesce(claimed,false)=false then raise exception 'same event analysis is already running'; end if;
  return true;
end $$;
revoke all on function public.claim_signal_event_ai_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_signal_event_ai_job(uuid,uuid,text) to service_role;


-- ============================================================================
-- Synced migration: 107_signal_event_replay.sql
-- ============================================================================
-- Replay packets never have a reader SELECT policy: future material stays server-side.
create table public.signal_event_replays (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null, cutoff timestamptz not null, mode text not null check(mode in ('archived','recovered')),
 request_id uuid not null, revealed integer not null default 0 check(revealed>=0), guess text, guess_request uuid,
 created_at timestamptz not null default now(),
 foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
 unique(user_id,request_id), unique(user_id,id), check(guess is null or length(btrim(guess)) between 1 and 4000)
);
create table public.signal_event_replay_packets (
 session_id uuid not null references public.signal_event_replays(id) on delete cascade,
 step integer not null check(step>=0), materials jsonb not null, primary key(session_id,step)
);
create table public.signal_event_replay_advances (
 session_id uuid not null references public.signal_event_replays(id) on delete cascade,
 request_id uuid not null, step integer not null, primary key(session_id,request_id)
);
alter table public.signal_event_replays enable row level security;
alter table public.signal_event_replay_packets enable row level security;
alter table public.signal_event_replay_advances enable row level security;
revoke all on public.signal_event_replays, public.signal_event_replay_packets,public.signal_event_replay_advances from public,anon,authenticated;
grant all on public.signal_event_replays,public.signal_event_replay_packets,public.signal_event_replay_advances to service_role;

create function public.read_signal_event_replay(p_user_id uuid,p_event_id uuid,p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays; materials jsonb;
begin
 perform public.signal_event_guard_owner(p_user_id);
 select * into r from public.signal_event_replays where id=p_session_id and user_id=p_user_id and event_id=p_event_id;
 if not found then raise exception 'replay unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(item order by p.step,n),'[]'::jsonb) into materials
 from public.signal_event_replay_packets p cross join lateral jsonb_array_elements(p.materials) with ordinality x(item,n)
 where p.session_id=r.id and p.step<=r.revealed;
 return jsonb_build_object('id',r.id,'cutoff',r.cutoff,'mode',r.mode,'guess',r.guess,'revealed',r.revealed,'materials',materials,
 'complete',r.guess is not null
   and exists(select 1 from public.signal_event_replay_advances where session_id=r.id)
   and not exists(select 1 from public.signal_event_replay_packets where session_id=r.id and step=r.revealed+1));
end $$;

create function public.create_signal_event_replay(p_user_id uuid,p_event_id uuid,p_cutoff timestamptz,p_mode text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays;
begin
 perform public.signal_event_guard_owner(p_user_id);
 if p_cutoff is null or not isfinite(p_cutoff) or p_cutoff>clock_timestamp() or p_mode is null or p_mode not in ('archived','recovered') or p_request_id is null then raise exception 'invalid replay input'; end if;
 -- Lock the owned event so concurrent membership revisions cannot split the freeze.
 perform 1 from public.signal_events where id=p_event_id and user_id=p_user_id for update;
 if not found then raise exception 'event unavailable' using errcode='42501'; end if;
 select * into r from public.signal_event_replays where user_id=p_user_id and request_id=p_request_id;
 if found then
  if r.event_id is distinct from p_event_id or r.cutoff is distinct from p_cutoff or r.mode is distinct from p_mode then raise exception 'request payload conflict'; end if;
  return jsonb_build_object('id',r.id);
 end if;
 insert into public.signal_event_replays(user_id,event_id,cutoff,mode,request_id) values(p_user_id,p_event_id,p_cutoff,p_mode,p_request_id) returning * into r;
 -- Archived uses the actual membership log and source capture clock. Recovered deliberately
 -- uses today's curated set and publication dates; every such item is labelled hindsight.
 with latest as (
  select distinct on(signal_id) * from public.signal_event_memberships where user_id=p_user_id and event_id=p_event_id order by signal_id,revision desc
 ), candidates as (
  select m.*,s.title,s.source_name,s.source_url,s.published_at,s.captured_at,s.captured_text,
    case when p_mode='archived' then case when m.action='exclude' then m.created_at else greatest(m.created_at,s.captured_at,coalesce(s.published_at,m.created_at)) end else s.published_at end as available_at
  from public.signal_event_memberships m left join public.signal_source_snapshots s on s.user_id=m.user_id and s.id=m.snapshot_id and s.signal_id=m.signal_id
  where m.user_id=p_user_id and m.event_id=p_event_id and
   (p_mode='archived' or (m.id in(select id from latest where action='include') and s.published_at is not null))
 ), initial_state as (
  select distinct on(signal_id) * from candidates where available_at<=p_cutoff order by signal_id,revision desc
 ), material as (
  select *,jsonb_build_object('title',case when action='include' then title else '移出事件档案' end,
   'text',case when action='include' then captured_text else '' end,'source',case when action='include' then source_name else '' end,
   'url',case when action='include' then source_url else null end,'publishedAt',case when action='include' then published_at else null end,'capturedAt',case when action='include' then captured_at else null end,
   'retrospective',p_mode='recovered','action',action,'availableAt',available_at) as payload from candidates
 ), future as (
  select row_number() over(order by available_at,revision)::integer as step,payload from material where available_at>p_cutoff
 )
 insert into public.signal_event_replay_packets(session_id,step,materials)
 select r.id,0,coalesce((select jsonb_agg(m.payload order by m.available_at,m.revision) from material m join initial_state i on i.id=m.id where i.action='include'),'[]'::jsonb)
 union all select r.id,step,jsonb_build_array(payload) from future;
 return jsonb_build_object('id',r.id);
end $$;

create function public.guess_signal_event_replay(p_user_id uuid,p_event_id uuid,p_session_id uuid,p_guess text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays;
begin
 perform public.signal_event_guard_owner(p_user_id);
 if p_guess is null or length(btrim(p_guess)) not between 1 and 4000 or p_request_id is null then raise exception 'invalid replay guess'; end if;
 select * into r from public.signal_event_replays where id=p_session_id and user_id=p_user_id and event_id=p_event_id for update;
 if not found then raise exception 'replay unavailable' using errcode='42501'; end if;
 if r.guess is not null then
  if r.guess_request is distinct from p_request_id or r.guess is distinct from btrim(p_guess) then raise exception 'practice guess is immutable'; end if;
 else
  update public.signal_event_replays set guess=btrim(p_guess),guess_request=p_request_id where id=r.id;
 end if;
 return public.read_signal_event_replay(p_user_id,p_event_id,p_session_id);
end $$;

create function public.advance_signal_event_replay(p_user_id uuid,p_event_id uuid,p_session_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays;
begin
 perform public.signal_event_guard_owner(p_user_id);
 if p_request_id is null then raise exception 'request required'; end if;
 select * into r from public.signal_event_replays where id=p_session_id and user_id=p_user_id and event_id=p_event_id for update;
 if not found then raise exception 'replay unavailable' using errcode='42501'; end if;
 if r.guess is null then raise exception 'record a practice guess first'; end if;
 if not exists(select 1 from public.signal_event_replay_advances where session_id=r.id and request_id=p_request_id) then
  if exists(select 1 from public.signal_event_replay_packets where session_id=r.id and step=r.revealed+1) then
   update public.signal_event_replays set revealed=revealed+1 where id=r.id;
  end if;
  insert into public.signal_event_replay_advances(session_id,request_id,step) select r.id,p_request_id,revealed from public.signal_event_replays where id=r.id;
 end if;
 return public.read_signal_event_replay(p_user_id,p_event_id,p_session_id);
end $$;
revoke all on function public.create_signal_event_replay(uuid,uuid,timestamptz,text,uuid),public.read_signal_event_replay(uuid,uuid,uuid),public.guess_signal_event_replay(uuid,uuid,uuid,text,uuid),public.advance_signal_event_replay(uuid,uuid,uuid,uuid) from public,anon,authenticated;
-- Only the authenticated server action may invoke these. Ownership remains explicit even with service role.
grant execute on function public.create_signal_event_replay(uuid,uuid,timestamptz,text,uuid),public.read_signal_event_replay(uuid,uuid,uuid),public.guess_signal_event_replay(uuid,uuid,uuid,text,uuid),public.advance_signal_event_replay(uuid,uuid,uuid,uuid) to service_role;

create function public.signal_replay_immutable() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='signal_event_replays' then
  if new.user_id is distinct from old.user_id or new.event_id is distinct from old.event_id or new.cutoff is distinct from old.cutoff or new.mode is distinct from old.mode or new.request_id is distinct from old.request_id or new.created_at is distinct from old.created_at or
   (old.guess is not null and (new.guess is distinct from old.guess or new.guess_request is distinct from old.guess_request)) then
   raise exception 'replay session and practice guess are immutable';
  end if;
  return new;
 end if;
 if tg_op='DELETE' and not exists(select 1 from public.signal_event_replays where id=old.session_id) then return old; end if;
 raise exception 'replay packets and advance receipts are immutable';
end $$;
create trigger replay_session_immutable before update on public.signal_event_replays for each row execute function public.signal_replay_immutable();
create trigger replay_packet_immutable before update or delete on public.signal_event_replay_packets for each row execute function public.signal_replay_immutable();
create trigger replay_receipt_immutable before update or delete on public.signal_event_replay_advances for each row execute function public.signal_replay_immutable();
revoke all on function public.signal_replay_immutable() from public,anon,authenticated;


-- ============================================================================
-- Synced migration: 108_decision_observations.sql
-- ============================================================================
-- Manual observation history. No validation/status/activity writes or external calls.
begin;
create unique index if not exists idea_info_gaps_owner_idea_id on public.idea_info_gaps(id,user_id,idea_id);
create table public.decision_observation_tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 object_type text not null default 'idea' check(object_type='idea'), object_id uuid not null references public.ideas(id),
 gap_id uuid, created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(gap_id,user_id,object_id) references public.idea_info_gaps(id,user_id,idea_id) on delete restrict
);
create table public.decision_observation_versions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,task_id uuid not null,
 revision integer not null check(revision>0),config jsonb not null,decision_snapshot jsonb not null,gap_snapshot jsonb,
 client_request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default now(),
 unique(task_id,revision),unique(user_id,client_request_id),unique(id,task_id,user_id),
 foreign key(task_id,user_id) references public.decision_observation_tasks(id,user_id) on delete restrict
);
create table public.decision_observation_runs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,task_id uuid not null,task_version_id uuid not null,
 payload jsonb not null,snapshots jsonb not null,client_request_id uuid not null,created_at timestamptz not null default now(),
 unique(user_id,client_request_id),foreign key(task_version_id,task_id,user_id) references public.decision_observation_versions(id,task_id,user_id) on delete restrict
);
create table public.decision_observation_gap_refs (
 user_id uuid not null,gap_id uuid not null references public.idea_info_gaps(id) on delete restrict,
 run_id uuid not null references public.decision_observation_runs(id) on delete restrict,
 request_id uuid not null,primary key(user_id,request_id)
);
create function public.observation_owner(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_user_id is null or (coalesce(auth.role(),'')<>'service_role' and auth.uid() is distinct from p_user_id) then raise exception 'observation owner required' using errcode='42501';end if;
end $$;
create function public.validate_observation_config(c jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
declare k text;item jsonb;
begin
 if jsonb_typeof(c) is distinct from 'object' or c->>'mode' is distinct from 'manual' or length(c::text)>60000 then raise exception 'invalid observation config';end if;
 foreach k in array array['question','decisionToChange','stopCondition','region','language','timeRange'] loop
 if jsonb_typeof(c->k) is distinct from 'string' or length(c->>k)>2000 or (k in ('question','decisionToChange','stopCondition') and length(trim(c->>k))=0) then raise exception 'invalid config text %',k;end if;
 end loop;
 foreach k in array array['sources','fixedPhrases','exploratoryPhrases','seeds'] loop
 if jsonb_typeof(c->k) is distinct from 'array' then raise exception 'invalid config array %',k;end if;
 if jsonb_array_length(c->k)>100 then raise exception 'config array too long';end if;
 for item in select value from jsonb_array_elements(c->k) loop
 if k='seeds' then
 if jsonb_typeof(item) is distinct from 'object' or length(trim(coalesce(item->>'text','')))=0 or length(item->>'text')>2000 or coalesce(item->>'origin','') not in ('user','source','ai') then raise exception 'invalid seed';end if;
 else
 if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}'))=0 or length(item#>>'{}')>2000 then raise exception 'invalid config phrase';end if;
 end if;
 end loop;
 end loop;
 if jsonb_typeof(c->'filters') is distinct from 'object' or (c->'resources' is distinct from 'null'::jsonb and jsonb_typeof(c->'resources') is distinct from 'object') then raise exception 'invalid config resources';end if;
 if jsonb_typeof(c->'resources')='object' and exists(select 1 from jsonb_each(c->'resources') where jsonb_typeof(value)<>'boolean') then raise exception 'invalid resource flag';end if;
end $$;
create function public.observation_history_guard() returns trigger language plpgsql as $$
begin
 if tg_op<>'INSERT' or current_setting('ideaos.observation_write',true) is distinct from 'allowed' then raise exception 'immutable observation history; use RPC';end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['decision_observation_tasks','decision_observation_versions','decision_observation_runs','decision_observation_gap_refs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy observation_read on public.%I for select to authenticated using(auth.uid()=user_id)',t);
 execute format('grant select on public.%I to authenticated,service_role',t);
 execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 execute format('create trigger observation_immutable before insert or update or delete on public.%I for each row execute function public.observation_history_guard()',t);
 end loop;
end $$;
create function public.save_decision_observation_version(p_user_id uuid,p_task_id uuid,p_object_id uuid,p_gap_id uuid,p_config jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.decision_observation_tasks; old public.decision_observation_versions; v_id uuid; rev integer; snap jsonb; gap jsonb; req jsonb;
begin
 perform public.observation_owner(p_user_id);
 if p_request_id is null then raise exception 'request required';end if;
 perform public.validate_observation_config(p_config);
 req=jsonb_build_object('taskId',p_task_id,'objectId',p_object_id,'gapId',p_gap_id,'config',p_config);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,0));
 select * into old from public.decision_observation_versions where user_id=p_user_id and client_request_id=p_request_id;
 if found then
 if old.request_payload<>req then raise exception 'request payload conflict';end if;
 return jsonb_build_object('id',old.id,'taskId',old.task_id,'revision',old.revision);end if;
 perform set_config('ideaos.observation_write','allowed',true);
 if p_task_id is null then
 if not exists(select 1 from public.ideas where id=p_object_id and user_id=p_user_id) then raise exception 'idea unavailable';end if;
 insert into public.decision_observation_tasks(user_id,object_id,gap_id) values(p_user_id,p_object_id,p_gap_id) returning * into t;
 else
 select * into t from public.decision_observation_tasks where id=p_task_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.ideas where id=t.object_id and user_id=p_user_id) then raise exception 'task unavailable';end if;
 end if;
 select to_jsonb(i) into snap from public.ideas i where id=t.object_id and user_id=p_user_id;
 snap=jsonb_build_object('idea',snap,'currentClosure',(select to_jsonb(c) from public.decision_closures c where c.object_type='idea' and c.object_id=t.object_id and c.user_id=p_user_id and c.status='active' order by c.created_at desc limit 1));
 if t.gap_id is not null then select to_jsonb(g) into gap from public.idea_info_gaps g where id=t.gap_id and user_id=p_user_id and idea_id=t.object_id;end if;
 select coalesce(max(revision),0)+1 into rev from public.decision_observation_versions where task_id=t.id;
 insert into public.decision_observation_versions(user_id,task_id,revision,config,decision_snapshot,gap_snapshot,client_request_id,request_payload)
 values(p_user_id,t.id,rev,p_config,snap,gap,p_request_id,req) returning id into v_id;
 perform set_config('ideaos.observation_write','',true);
 return jsonb_build_object('id',v_id,'taskId',t.id,'revision',rev);
end $$;
create function public.save_decision_observation_run(p_user_id uuid,p_task_id uuid,p_version_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.decision_observation_runs;r jsonb; snaps jsonb='[]';rid uuid;k text;bound_config jsonb;
begin
 perform public.observation_owner(p_user_id);
 select v.config into bound_config from public.decision_observation_versions v join public.decision_observation_tasks t on t.id=v.task_id join public.ideas i on i.id=t.object_id where v.id=p_version_id and v.task_id=p_task_id and v.user_id=p_user_id and i.user_id=p_user_id;
 if p_request_id is null or not found then raise exception 'version unavailable';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'records') is distinct from 'array' then raise exception 'invalid run payload';end if;
 if p_payload->>'parserVersion'='search-csv-v1' then
 if p_payload->>'status' is distinct from 'success'
 or length(trim(coalesce(bound_config->>'region','')))=0
 or length(trim(coalesce(bound_config->>'language','')))=0
 or length(trim(coalesce(bound_config->>'timeRange','')))=0
 or p_payload#>'{requestConditions,region}' is distinct from bound_config->'region'
 or p_payload#>'{requestConditions,language}' is distinct from bound_config->'language'
 or p_payload#>'{requestConditions,timeframe}' is distinct from bound_config->'timeRange'
 then raise exception 'search import context must match immutable task version';end if;
 end if;
 if jsonb_array_length(p_payload->'records')>500 or length(p_payload::text)>2000000
 or coalesce(p_payload->>'status','') not in ('success','partial','failed','unavailable')
 or coalesce(p_payload->>'resultState','') not in ('observed','zero','suppressed','unknown','failed') then raise exception 'invalid run payload';end if;
 if p_payload->>'status' in ('failed','unavailable') and (jsonb_array_length(p_payload->'records')>0 or p_payload->>'resultState'<>'failed') then raise exception 'failure is not zero';end if;
 if p_payload->>'resultState'='failed' and p_payload->>'status' not in ('failed','unavailable') then raise exception 'invalid failed status';end if;
 if p_payload->>'resultState'='zero' and jsonb_array_length(p_payload->'records')>0 then raise exception 'invalid zero result';end if;
 if p_payload->>'resultState'='observed' and jsonb_array_length(p_payload->'records')=0 then raise exception 'empty result must be explicit zero or unknown';end if;
 if (p_payload->>'costMinor' is null)<>(p_payload->>'currency' is null) or (p_payload->>'costMinor' is not null and (jsonb_typeof(p_payload->'costMinor')<>'number' or (p_payload->>'costMinor')::numeric<0 or trunc((p_payload->>'costMinor')::numeric)<>(p_payload->>'costMinor')::numeric or p_payload->>'currency' !~ '^[A-Z]{3}$')) then raise exception 'invalid cost';end if;
 foreach k in array array['parserVersion','returnedScope','dataPeriod','error','rawSnapshot','startedAt'] loop
 if p_payload->>k is not null and jsonb_typeof(p_payload->k)<>'string' then raise exception 'invalid run text %',k;end if;
 if k<>'rawSnapshot' and length(p_payload->>k)>2000 then raise exception 'run text too long';end if;
 end loop;
 if length(p_payload->>'rawSnapshot')>500000 or (p_payload ? 'truncated' and jsonb_typeof(p_payload->'truncated')<>'boolean') then raise exception 'invalid capture bounds';end if;
 foreach k in array array['requestConditions','providerMetadata','pagination','providerUsage'] loop
 if p_payload->>k is not null and jsonb_typeof(p_payload->k)<>'object' then raise exception 'invalid run metadata';end if;
 end loop;
 for r in select value from jsonb_array_elements(p_payload->'records') loop
 if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'text') is distinct from 'string' or length(trim(coalesce(r->>'text','')))=0 or length(r->>'text')>30000 or jsonb_typeof(r->'title') is distinct from 'string' or length(trim(coalesce(r->>'title','')))=0 or length(r->>'title')>2000 or coalesce(r->>'origin','') not in ('manual','public','synthetic','ai_seed') then raise exception 'invalid observation record';end if;
 if r->>'origin'='public' and coalesce(r->>'sourceUrl','') !~ '^https?://' then raise exception 'public source required';end if;
 if r->>'sourceUrl' is not null and (jsonb_typeof(r->'sourceUrl')<>'string' or r->>'sourceUrl' !~ '^https?://' or length(r->>'sourceUrl')>2000) then raise exception 'invalid source URL';end if;
 foreach k in array array['metric','unit','time','region','publishedAt'] loop
 if r->>k is not null and (jsonb_typeof(r->k)<>'string' or length(r->>k)>2000) then raise exception 'invalid record text %',k;end if;
 end loop;
 foreach k in array array['data','providerMetadata'] loop
 if r->>k is not null and jsonb_typeof(r->k)<>'object' then raise exception 'invalid record metadata';end if;
 end loop;
 if r->'value'<>'null'::jsonb and jsonb_typeof(r->'value')<>'number' then raise exception 'invalid observed number';end if;
 snaps=snaps||jsonb_build_array(jsonb_build_object('text',r->>'text','sourceUrl',r->>'sourceUrl','publishedAt',r->>'publishedAt','origin',r->>'origin','captureScope','user-provided-excerpt','capturedAt',now(),'hash',encode(sha256(convert_to(r::text,'UTF8')),'hex')));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,1));
 select * into old from public.decision_observation_runs where user_id=p_user_id and client_request_id=p_request_id;
 if found then if old.task_id<>p_task_id or old.task_version_id<>p_version_id or old.payload<>p_payload then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old.id);end if;
 if p_payload->>'retryOf' is not null and not exists(select 1 from public.decision_observation_runs where id=(p_payload->>'retryOf')::uuid and user_id=p_user_id and task_id=p_task_id) then raise exception 'retry unavailable';end if;
 perform set_config('ideaos.observation_write','allowed',true);
 insert into public.decision_observation_runs(user_id,task_id,task_version_id,payload,snapshots,client_request_id)values(p_user_id,p_task_id,p_version_id,p_payload,snaps,p_request_id)returning id into rid;
 perform set_config('ideaos.observation_write','',true);
 return jsonb_build_object('id',rid);
end $$;
create function public.attach_observation_gap_ref(p_user_id uuid,p_gap_id uuid,p_run_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.idea_info_gaps; old public.decision_observation_gap_refs; already_attached boolean;
begin
 perform public.observation_owner(p_user_id);
 if p_request_id is null then raise exception 'request required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,2));
 select * into old from public.decision_observation_gap_refs where user_id=p_user_id and request_id=p_request_id;
 if found then if old.gap_id<>p_gap_id or old.run_id<>p_run_id then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old.run_id);end if;
 select * into g from public.idea_info_gaps where id=p_gap_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.decision_observation_runs r join public.decision_observation_tasks t on t.id=r.task_id join public.ideas i on i.id=t.object_id where r.id=p_run_id and r.user_id=p_user_id and t.object_id=g.idea_id and i.user_id=p_user_id) then raise exception 'gap or run unavailable';end if;
 perform set_config('ideaos.observation_write','allowed',true);
 select exists(select 1 from public.decision_observation_gap_refs where gap_id=p_gap_id and run_id=p_run_id) into already_attached;
 insert into public.decision_observation_gap_refs(user_id,gap_id,run_id,request_id)values(p_user_id,p_gap_id,p_run_id,p_request_id);
 if not already_attached then update public.idea_info_gaps set evidence=coalesce(evidence,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'title','人工观察记录','observation_run_id',p_run_id,'note','公开材料或人工摘录；痛点和付费仍须真实验证')) where id=p_gap_id and user_id=p_user_id;end if;
 perform set_config('ideaos.observation_write','',true);
 return jsonb_build_object('id',p_run_id);
end $$;
revoke all on function public.observation_owner(uuid) from public;
revoke all on function public.observation_history_guard() from public;
revoke all on function public.validate_observation_config(jsonb) from public;
revoke all on function public.save_decision_observation_version(uuid,uuid,uuid,uuid,jsonb,uuid) from public;
revoke all on function public.save_decision_observation_run(uuid,uuid,uuid,uuid,jsonb) from public;
revoke all on function public.attach_observation_gap_ref(uuid,uuid,uuid,uuid) from public;
grant execute on function public.save_decision_observation_version(uuid,uuid,uuid,uuid,jsonb,uuid),public.save_decision_observation_run(uuid,uuid,uuid,uuid,jsonb),public.attach_observation_gap_ref(uuid,uuid,uuid,uuid) to authenticated,service_role;
commit;


-- ============================================================================
-- Synced migration: 109_idea_experiments.sql
-- ============================================================================
-- P1A independent of event dossiers: tests never write real-contact validations.
begin;
create unique index if not exists ideas_owner_id_experiment_uq on public.ideas(user_id,id);
create unique index if not exists gaps_owner_idea_id_experiment_uq on public.idea_info_gaps(user_id,idea_id,id);
create table public.idea_experiments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), idea_id uuid not null, gap_id uuid,
 series_id uuid not null, revision integer not null check(revision>0), objective text not null check(objective in ('premise','workflow','delivery','demand')),
 route text not null check(route in ('public_check','task_reconstruction','prototype_test','opt_in_trial','direct_contact','deferred_contact')),
 access_context jsonb not null, question text not null check(length(question) between 1 and 2000), hypothesis_snapshot jsonb, gap_snapshot jsonb,
 input_plan jsonb not null, steps jsonb not null, pass_criterion text not null check(length(pass_criterion) between 1 and 3000), fail_criterion text not null check(length(fail_criterion) between 1 and 3000), limits text not null check(length(limits) between 1 and 3000),
 time_budget_minutes numeric check(time_budget_minutes>=0), cost_budget_minor bigint check(cost_budget_minor>=0), currency text,
 deferred_questions jsonb not null, recheck_on date, client_request_id uuid not null, request_payload jsonb not null, created_at timestamptz not null default now(),
 unique(user_id,series_id,revision), unique(user_id,client_request_id), unique(user_id,idea_id,id),
 foreign key(user_id,idea_id) references public.ideas(user_id,id) on delete restrict,
 foreign key(user_id,idea_id,gap_id) references public.idea_info_gaps(user_id,idea_id,id) on delete restrict,
 check((cost_budget_minor is null and currency is null) or (cost_budget_minor is not null and currency is not null and currency ~ '^[A-Z]{3}$')),
 check(jsonb_typeof(access_context)='object' and jsonb_typeof(input_plan)='object' and jsonb_typeof(steps)='array' and jsonb_array_length(steps)>0 and jsonb_typeof(deferred_questions)='array')
);
create table public.idea_experiment_cases (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,idea_id uuid not null,experiment_id uuid not null,input_origin text not null check(input_origin in ('public','owned','synthetic')),
 input_text text not null check(length(input_text) between 1 and 30000),source_snapshot jsonb,expected_output text not null check(length(expected_output) between 1 and 10000),client_request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default now(),
 unique(user_id,client_request_id),unique(user_id,idea_id,experiment_id,id),
 foreign key(user_id,idea_id,experiment_id) references public.idea_experiments(user_id,idea_id,id) on delete restrict,
 check((input_origin='synthetic' and source_snapshot is null) or (input_origin<>'synthetic' and jsonb_typeof(source_snapshot)='object'))
);
create table public.idea_experiment_runs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,idea_id uuid not null,experiment_id uuid not null,case_manifest jsonb not null,criteria_snapshot jsonb not null,supersedes_run_id uuid,
 started_at timestamptz not null default now(),finished_at timestamptz,status text not null default 'running' check(status in ('running','completed','failed','cancelled')),
 actual_minutes numeric check(actual_minutes>=0),actual_cost_minor bigint check(actual_cost_minor>=0),currency text,output_artifact jsonb,
 client_request_id uuid not null,request_payload jsonb not null,completion_request_id uuid,completion_payload jsonb,
 unique(user_id,client_request_id),unique(user_id,completion_request_id),unique(user_id,idea_id,id),
 foreign key(user_id,idea_id,experiment_id) references public.idea_experiments(user_id,idea_id,id) on delete restrict,
 foreign key(user_id,idea_id,supersedes_run_id) references public.idea_experiment_runs(user_id,idea_id,id) on delete restrict,
 check(jsonb_typeof(case_manifest)='array'),check((status='running' and finished_at is null) or (status<>'running' and finished_at is not null)),
 check((actual_cost_minor is null and currency is null) or (actual_cost_minor is not null and currency is not null and currency ~ '^[A-Z]{3}$'))
);
create table public.idea_experiment_results (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,idea_id uuid not null,run_id uuid not null,case_id uuid not null,experiment_id uuid not null,
 execution_context text not null check(execution_context in ('self_run','ai_simulation','external_feedback')),outcome text not null check(outcome in ('pass','fail','unresolved')),
 actual_output jsonb not null,manual_intervention text not null,notes text not null,client_request_id uuid not null,created_at timestamptz not null default now(),
 unique(user_id,run_id,case_id),foreign key(user_id,idea_id,run_id) references public.idea_experiment_runs(user_id,idea_id,id) on delete restrict,
 foreign key(user_id,idea_id,experiment_id,case_id) references public.idea_experiment_cases(user_id,idea_id,experiment_id,id) on delete restrict
);
create function public.experiment_owner(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_user_id is null or (coalesce(auth.role(),'')<>'service_role' and auth.uid() is distinct from p_user_id) then raise exception 'experiment owner required' using errcode='42501';end if;
end$$;
create function public.experiment_immutable() returns trigger language plpgsql as $$begin raise exception 'experiment history immutable';end$$;
create trigger experiment_version_immutable before update or delete on public.idea_experiments for each row execute function public.experiment_immutable();
create trigger experiment_case_immutable before update or delete on public.idea_experiment_cases for each row execute function public.experiment_immutable();
create trigger experiment_result_immutable before update or delete on public.idea_experiment_results for each row execute function public.experiment_immutable();
create function public.experiment_run_guard() returns trigger language plpgsql as $$begin
 if TG_OP='DELETE' then raise exception 'experiment history immutable';end if;
 if old.status<>'running' or new.status='running' or (to_jsonb(new)-array['status','finished_at','actual_minutes','actual_cost_minor','currency','output_artifact','completion_request_id','completion_payload']) is distinct from (to_jsonb(old)-array['status','finished_at','actual_minutes','actual_cost_minor','currency','output_artifact','completion_request_id','completion_payload']) then raise exception 'invalid experiment transition';end if;return new;
end$$;
create trigger experiment_run_immutable before update or delete on public.idea_experiment_runs for each row execute function public.experiment_run_guard();
create function public.experiment_text(p_value text,p_max integer,p_required boolean default true) returns void language plpgsql as $$begin if (p_required and coalesce(length(btrim(p_value)),0)=0) or length(p_value)>p_max then raise exception 'invalid experiment text';end if;end$$;
create function public.experiment_artifact(p_user_id uuid,p_artifact jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare found_id uuid;begin
 if p_artifact is null or p_artifact='null'::jsonb then return;end if;
 if jsonb_typeof(p_artifact)<>'object' then raise exception 'invalid artifact';end if;
 perform experiment_text(p_artifact->>'url',4000,false);
 if p_artifact->>'url' is not null and p_artifact->>'url' !~ '^https?://' then raise exception 'invalid artifact URL';end if;
 if p_artifact->>'material_id' is not null then
 execute 'select id from public.reality_materials where id=$1 and user_id=$2' into found_id using (p_artifact->>'material_id')::uuid,p_user_id;
 if found_id is null then raise exception 'material unavailable';end if;end if;
 perform experiment_text(p_artifact->>'description',3000);
end$$;
create function public.save_idea_experiment_version(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare old_row idea_experiments; idea_row ideas; gap_row idea_info_gaps; new_id uuid; series uuid; rev integer; a jsonb; route text; s jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 select * into old_row from idea_experiments where user_id=p_user_id and client_request_id=(p_input->>'requestId')::uuid;
 if found then if old_row.request_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old_row.id);end if;
 select * into idea_row from ideas where id=(p_input->>'ideaId')::uuid and user_id=p_user_id for update;if not found then raise exception 'idea unavailable';end if;
 if nullif(p_input->>'gapId','') is not null then select * into gap_row from idea_info_gaps where id=(p_input->>'gapId')::uuid and user_id=p_user_id and idea_id=idea_row.id for update;if not found then raise exception 'gap unavailable';end if;end if;
 series=coalesce((p_input->>'seriesId')::uuid,gen_random_uuid());
 if p_input->>'seriesId' is not null and not exists(select 1 from idea_experiments where user_id=p_user_id and idea_id=idea_row.id and series_id=series) then raise exception 'series unavailable';end if;
 select coalesce(max(revision),0)+1 into rev from idea_experiments where user_id=p_user_id and series_id=series;
 a=p_input->'accessContext';route=p_input->>'route';
 if a is null or jsonb_typeof(a)<>'object' or jsonb_typeof(a->'publicSources') is distinct from 'boolean' or jsonb_typeof(a->'canRunPrototype') is distinct from 'boolean' or jsonb_typeof(a->'canPublishExample') is distinct from 'boolean' or jsonb_typeof(a->'canContactPeople') is distinct from 'boolean' then raise exception 'invalid access context';end if;
 if not (case route when 'public_check' then (a->>'publicSources')::boolean when 'task_reconstruction' then (a->>'publicSources')::boolean when 'prototype_test' then (a->>'canRunPrototype')::boolean when 'opt_in_trial' then (a->>'canPublishExample')::boolean when 'direct_contact' then (a->>'canContactPeople')::boolean when 'deferred_contact' then not (a->>'canContactPeople')::boolean else false end) then raise exception 'route unavailable';end if;
 perform experiment_text(p_input->>'question',2000);perform experiment_text(p_input->>'passCriterion',3000);perform experiment_text(p_input->>'failCriterion',3000);perform experiment_text(p_input->>'limits',3000);perform experiment_text(p_input->'inputPlan'->>'scope',5000);
 if jsonb_typeof(p_input->'steps') is distinct from 'array' or jsonb_array_length(p_input->'steps') not between 1 and 30 or jsonb_typeof(p_input->'deferredQuestions') is distinct from 'array' or jsonb_array_length(p_input->'deferredQuestions')>30 then raise exception 'invalid steps/questions';end if;
 for s in select value from jsonb_array_elements(p_input->'steps') loop if jsonb_typeof(s)<>'string' then raise exception 'invalid step';end if;perform experiment_text(s#>>'{}',2000);end loop;
 if route='task_reconstruction' then if jsonb_typeof(p_input->'inputPlan'->'refs') is distinct from 'array' then raise exception 'task references required';end if;foreach route in array array['role','trigger','inputs','steps','current_alternative','obstacles','unknowns'] loop perform experiment_text(p_input->'inputPlan'->>route,5000);end loop;end if;
 insert into idea_experiments(user_id,idea_id,gap_id,series_id,revision,objective,route,access_context,question,hypothesis_snapshot,gap_snapshot,input_plan,steps,pass_criterion,fail_criterion,limits,time_budget_minutes,cost_budget_minor,currency,deferred_questions,recheck_on,client_request_id,request_payload)
 values(p_user_id,idea_row.id,gap_row.id,series,rev,p_input->>'objective',p_input->>'route',a,p_input->>'question',to_jsonb(idea_row)->'hypothesis',case when gap_row.id is not null then to_jsonb(gap_row) else null end,p_input->'inputPlan',p_input->'steps',p_input->>'passCriterion',p_input->>'failCriterion',p_input->>'limits',(p_input->>'timeBudgetMinutes')::numeric,(p_input->>'costBudgetMinor')::bigint,p_input->>'currency',p_input->'deferredQuestions',(p_input->>'recheckOn')::date,(p_input->>'requestId')::uuid,p_input) returning id into new_id;
 return jsonb_build_object('id',new_id);end$$;
create function public.append_idea_experiment_case(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare e idea_experiments;c idea_experiment_cases;s jsonb;new_id uuid; saved_source text; material_url text; material_kind text; source_record jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 if jsonb_typeof(p_input->'sourceSnapshot')='object' then p_input=jsonb_set(p_input,'{sourceSnapshot}',(p_input->'sourceSnapshot')-'hash'-'captured_at');end if;
 select * into c from idea_experiment_cases where user_id=p_user_id and client_request_id=(p_input->>'requestId')::uuid;if found then if c.request_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',c.id);end if;
 select * into e from idea_experiments where id=(p_input->>'experimentId')::uuid and user_id=p_user_id for update;if not found then raise exception 'experiment unavailable';end if;
 if (select count(*) from idea_experiment_cases where user_id=p_user_id and experiment_id=e.id)>=200 then raise exception 'sample limit reached; create a new version';end if;
 if e.route in ('public_check','task_reconstruction') and p_input->>'inputOrigin'='synthetic' then raise exception 'material-backed route requires public or authorized owned source';end if;
 perform experiment_text(p_input->>'inputText',30000);perform experiment_text(p_input->>'expectedOutput',10000);s=nullif(p_input->'sourceSnapshot','null'::jsonb);if s is not null then s=s||jsonb_build_object('captured_at',now());end if;
 if p_input->>'inputOrigin'='synthetic' then if s is not null then raise exception 'synthetic source forbidden';end if;
 else if s is null or jsonb_typeof(s)<>'object' then raise exception 'source snapshot required';end if;
 perform experiment_text(s->>'source_type',200);perform experiment_text(s->>'excerpt',30000,false);perform experiment_text(s->>'capture_scope',2000);if (s->>'captured_at')::timestamptz is null or jsonb_typeof(s->'truncated') is distinct from 'boolean' or jsonb_typeof(s->'missing_text') is distinct from 'boolean' then raise exception 'invalid snapshot metadata';end if;
 if p_input->>'inputOrigin'='public' and p_input->>'inputText' is distinct from s->>'excerpt' then raise exception 'public input must equal captured excerpt';end if;
 if p_input->>'inputOrigin'='public' then perform experiment_text(s->>'publisher',1000);perform experiment_text(s->>'excerpt',30000);if coalesce(s->>'url',s->>'source_id') is null or (s->>'missing_text')::boolean then raise exception 'public source/excerpt required';end if;end if;
 if p_input->>'inputOrigin'='owned' and coalesce((s->>'authorized')::boolean,false)=false then raise exception 'owned source permission required';end if;
 if s->>'url' is not null and s->>'url' !~ '^https?://' then raise exception 'invalid source URL';end if;
 if s->>'source_type'='material' then
 select sanitized_text,source_url,source_type into saved_source,material_url,material_kind from public.reality_materials where id=(s->>'source_id')::uuid and user_id=p_user_id;
 if not found then raise exception 'material unavailable';end if;
 if p_input->>'inputOrigin'='public' and (material_kind<>'url' or material_url is distinct from s->>'url') then raise exception 'public material source mismatch';end if;
 if length(coalesce(s->>'excerpt',''))>0 and position(s->>'excerpt' in coalesce(saved_source,''))=0 then raise exception 'material quote absent';end if;
 end if;
 if s->>'source_type'='observation_run' then
 execute 'select item from public.decision_observation_runs r cross join lateral jsonb_array_elements(r.payload->''records'') item where r.id=$1 and r.user_id=$2 and item->>''origin''=$3 and item->>''sourceUrl'' is not distinct from $4 and position($5 in item->>''text'')>0 limit 1'
 into source_record using (s->>'source_id')::uuid,p_user_id,case when p_input->>'inputOrigin'='public' then 'public' else 'manual' end,s->>'url',s->>'excerpt';
 if source_record is null then raise exception 'observation source origin/url/quote mismatch';end if;
 s=s||jsonb_build_object('publisher',coalesce(substring(source_record->>'sourceUrl' from '^https?://([^/]+)'),'用户授权的原始记录'));
 end if; s=s||jsonb_build_object('captured_at',now());
 s=s||jsonb_build_object('hash',encode(sha256(convert_to((s-'hash')::text,'UTF8')),'hex'));
 end if;
 insert into idea_experiment_cases(user_id,idea_id,experiment_id,input_origin,input_text,source_snapshot,expected_output,client_request_id,request_payload) values(p_user_id,e.idea_id,e.id,p_input->>'inputOrigin',p_input->>'inputText',s,p_input->>'expectedOutput',(p_input->>'requestId')::uuid,p_input) returning id into new_id;return jsonb_build_object('id',new_id);end$$;
create function public.start_idea_experiment_run(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare e idea_experiments;r idea_experiment_runs;manifest jsonb;new_id uuid;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 select * into r from idea_experiment_runs where user_id=p_user_id and client_request_id=(p_input->>'requestId')::uuid;if found then if r.request_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',r.id);end if;
 select * into e from idea_experiments where id=(p_input->>'experimentId')::uuid and user_id=p_user_id for update;if not found then raise exception 'experiment unavailable';end if;
 if p_input->>'supersedesRunId' is not null and not exists(select 1 from idea_experiment_runs where id=(p_input->>'supersedesRunId')::uuid and user_id=p_user_id and idea_id=e.idea_id and status<>'running') then raise exception 'prior final run unavailable';end if;
 select coalesce(jsonb_agg(id order by created_at,id),'[]'::jsonb) into manifest from idea_experiment_cases where user_id=p_user_id and experiment_id=e.id;
 if jsonb_array_length(manifest)=0 and e.route<>'deferred_contact' then raise exception 'samples required';end if;
 if jsonb_array_length(manifest)>200 then raise exception 'too many samples';end if;
 insert into idea_experiment_runs(user_id,idea_id,experiment_id,case_manifest,criteria_snapshot,supersedes_run_id,client_request_id,request_payload) values(p_user_id,e.idea_id,e.id,manifest,jsonb_build_object('pass',e.pass_criterion,'fail',e.fail_criterion,'limits',e.limits),(p_input->>'supersedesRunId')::uuid,(p_input->>'requestId')::uuid,p_input) returning id into new_id;return jsonb_build_object('id',new_id);end$$;
create function public.complete_idea_experiment_run(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r idea_experiment_runs;old_run idea_experiment_runs;item jsonb;got jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 select * into old_run from idea_experiment_runs where user_id=p_user_id and completion_request_id=(p_input->>'requestId')::uuid;if found then if old_run.completion_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old_run.id);end if;
 select * into r from idea_experiment_runs where id=(p_input->>'runId')::uuid and user_id=p_user_id for update;if not found then raise exception 'run unavailable';end if;if r.status<>'running' then raise exception 'run already final';end if;
 if jsonb_typeof(p_input->'results') is distinct from 'array' then raise exception 'results required';end if;
 select coalesce(jsonb_agg(v order by v),'[]'::jsonb) into got from (select value->>'caseId' v from jsonb_array_elements(p_input->'results')) q;
 if got<>(select coalesce(jsonb_agg(value#>>'{}' order by value#>>'{}'),'[]'::jsonb) from jsonb_array_elements(r.case_manifest)) then raise exception 'case manifest mismatch';end if;
 perform experiment_artifact(p_user_id,nullif(p_input->'outputArtifact','null'::jsonb));
 for item in select value from jsonb_array_elements(p_input->'results') loop
 perform experiment_text(item->'actualOutput'->>'text',30000);perform experiment_text(item->>'manualIntervention',10000,false);perform experiment_text(item->>'notes',10000,false);perform experiment_artifact(p_user_id,nullif(item->'actualOutput'->'artifact','null'::jsonb));
 if item->>'executionContext'='external_feedback' then perform experiment_text(item->>'notes',10000);end if;
 insert into idea_experiment_results(user_id,idea_id,run_id,case_id,experiment_id,execution_context,outcome,actual_output,manual_intervention,notes,client_request_id) values(p_user_id,r.idea_id,r.id,(item->>'caseId')::uuid,r.experiment_id,item->>'executionContext',item->>'outcome',item->'actualOutput',item->>'manualIntervention',item->>'notes',(p_input->>'requestId')::uuid);
 end loop;
 update idea_experiment_runs set status=p_input->>'status',finished_at=now(),actual_minutes=(p_input->>'actualMinutes')::numeric,actual_cost_minor=(p_input->>'actualCostMinor')::bigint,currency=p_input->>'currency',output_artifact=nullif(p_input->'outputArtifact','null'::jsonb),completion_request_id=(p_input->>'requestId')::uuid,completion_payload=p_input where id=r.id;
 return jsonb_build_object('id',r.id);end$$;
create function public.attach_experiment_gap_ref(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare g idea_info_gaps;r idea_experiment_runs;existing jsonb;new_item jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));select * into g from idea_info_gaps where id=(p_input->>'gapId')::uuid and user_id=p_user_id for update;if not found then raise exception 'gap unavailable';end if;
 select item.value into existing from idea_info_gaps gg cross join lateral jsonb_array_elements(gg.evidence) item where gg.user_id=p_user_id and item.value->>'request_id'=p_input->>'requestId';if found then if existing->'request_payload'<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',g.id);end if;
 select * into r from idea_experiment_runs where id=(p_input->>'runId')::uuid and user_id=p_user_id and idea_id=g.idea_id;if not found or r.status='running' then raise exception 'finished run unavailable';end if;perform experiment_text(p_input->>'note',3000,false);
 new_item=jsonb_build_object('at',now(),'title','原型/公开资料核对（需求仍未知）','note',p_input->>'note','experiment_id',r.experiment_id,'experiment_run_id',r.id,'request_id',p_input->>'requestId','request_payload',p_input);
 update idea_info_gaps set evidence=evidence||jsonb_build_array(new_item),updated_at=now() where id=g.id;return jsonb_build_object('id',g.id);end$$;
-- Existing evidence callers retain their lock semantics; only append becomes atomic.
create function public.append_idea_gap_evidence(p_user_id uuid,p_gap_id uuid,p_item jsonb,p_request_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare g idea_info_gaps;old_item jsonb;begin
 perform experiment_owner(p_user_id);if p_request_id is null or p_item is null or jsonb_typeof(p_item)<>'object' then raise exception 'invalid evidence request';end if;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));select * into g from idea_info_gaps where id=p_gap_id and user_id=p_user_id for update;if not found then raise exception 'gap unavailable';end if;
 select item.value into old_item from idea_info_gaps gg cross join lateral jsonb_array_elements(gg.evidence) item where gg.user_id=p_user_id and item.value->>'request_id'=p_request_id::text;if found then if old_item->'request_payload'<>jsonb_build_object('gap_id',p_gap_id,'item',p_item) then raise exception 'request payload conflict';end if;return;end if;
 if p_item ? 'experiment_id' or p_item ? 'experiment_run_id' or p_item ? 'observation_run_id' then raise exception 'use experiment attach RPC';end if;
 perform experiment_text(p_item->>'title',3000);
 update idea_info_gaps set evidence=evidence||jsonb_build_array(p_item||jsonb_build_object('at',now(),'request_id',p_request_id,'request_payload',jsonb_build_object('gap_id',p_gap_id,'item',p_item))),updated_at=now() where id=g.id;
end$$;
do $$declare t text;f text;begin
 foreach t in array array['idea_experiments','idea_experiment_cases','idea_experiment_runs','idea_experiment_results'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy experiment_owner_read on public.%I for select using (auth.uid()=user_id)',t);
 execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('experiment_owner','experiment_artifact','save_idea_experiment_version','append_idea_experiment_case','start_idea_experiment_run','complete_idea_experiment_run','attach_experiment_gap_ref','append_idea_gap_evidence') loop execute 'revoke all on function '||f||' from public,anon,authenticated';execute 'grant execute on function '||f||' to service_role';end loop;
end$$;
commit;













-- ============================================================================
-- Synced migration: 110_company_observations.sql
-- ============================================================================
begin;
create table public.company_observation_entries (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),company_id uuid not null references public.companies(id) on delete restrict,
 revision integer not null check(revision>0),
 kind text not null check(kind in ('identity','activity','snapshot','review')),payload jsonb not null,
 request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default clock_timestamp(),content_hash text not null,
 unique(user_id,request_id),unique(company_id,revision)
);
create index company_observation_history on public.company_observation_entries(user_id,company_id,created_at desc,id desc);
create index company_observation_identity_history on public.company_observation_entries(user_id,company_id,revision desc) where kind='identity';
alter table public.company_observation_entries enable row level security;
create policy company_observation_owner on public.company_observation_entries for select using(auth.uid()=user_id);
grant select on public.company_observation_entries to authenticated,service_role;
revoke insert,update,delete on public.company_observation_entries from anon,authenticated,service_role;
create function public.company_observation_guard() returns trigger language plpgsql as $$begin
 if tg_op<>'INSERT' or current_setting('ideaos.company_write',true) is distinct from 'allowed' then raise exception 'immutable company history; use RPC';end if;return new;end$$;
create trigger company_observation_immutable before insert or update or delete on public.company_observation_entries for each row execute function public.company_observation_guard();
create function public.validate_company_source(s jsonb) returns void language plpgsql as $$begin
 if jsonb_typeof(s) is distinct from 'object' or coalesce(s->>'kind','') not in ('manual_import','official_response','web_capture','saved_job') or length(coalesce(s->>'rawText','')) not between 1 and 100000 or length(coalesce(s->>'quote','')) not between 1 and 20000 or position(s->>'quote' in s->>'rawText')=0 then raise exception 'invalid source quote';end if;
 if s ? 'requestProof' and (jsonb_typeof(s->'requestProof') is distinct from 'string' or coalesce(s->>'requestProof','') !~ '^[a-f0-9]{64}$') then raise exception 'invalid request proof';end if;
 if length(trim(coalesce(s->>'scope','')))=0 or length(s->>'scope')>2000 or (s->>'url' is not null and (s->>'url' !~ '^https?://' or s->>'url' ~ '^https?://[^/[:space:]]*@' or s->>'url' ~ '[[:cntrl:]]' or length(s->>'url')>8000)) then raise exception 'invalid source scope/url';end if;
end$$;
create function public.company_job_preview_hash(j public.job_postings) returns text language sql immutable set search_path=public,pg_temp as $$
 select encode(sha256(convert_to(string_agg(case when value is null then '-1:' else octet_length(convert_to(value,'UTF8'))::text||':'||value end,'' order by ordinal),'UTF8')),'hex')
 from unnest(array[j.id::text,j.company_id::text,j.company_name,j.title,j.body,j.url,j.found_on::text]) with ordinality as fields(value,ordinal)
$$;
create function public.save_company_observation(p_user_id uuid,p_company_id uuid,p_request_id uuid,p_kind text,p_payload jsonb,p_expected_identity_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.company_observation_entries;latest public.company_observation_entries;other_row record;result_id uuid;stored jsonb;req jsonb;job public.job_postings;idea public.ideas;v text;
begin
 if p_user_id is null then raise exception 'company owner required' using errcode='42501';end if;
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 if p_request_id is null or p_company_id is null or p_kind not in ('identity','activity','snapshot','review','job') or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>150000 then raise exception 'invalid company input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,110));
 req=jsonb_build_object('companyId',p_company_id,'kind',p_kind,'payload',p_payload,'expectedIdentityId',p_expected_identity_id);
 select * into old from company_observation_entries where user_id=p_user_id and request_id=p_request_id;
 if found then if old.request_payload is distinct from req then raise exception 'request conflict';end if;return jsonb_build_object('id',old.id);end if;
 perform 1 from companies where id=p_company_id and user_id=p_user_id for update;if not found then raise exception 'company unavailable';end if;
 stored=p_payload;
 if p_kind='identity' then
 select * into latest from company_observation_entries where user_id=p_user_id and company_id=p_company_id and kind='identity' order by revision desc limit 1;
 if latest.id is distinct from p_expected_identity_id then raise exception 'stale identity';end if;
 if coalesce(p_payload->>'action','') not in ('confirm','clear') then raise exception 'invalid identity action';end if;
 if p_payload->>'action'='confirm' then
 if coalesce(p_payload#>>'{identity,corporateNumber}','') !~ '^[0-9]{13}$' or length(trim(coalesce(p_payload#>>'{identity,legalName}','')))=0 or length(trim(coalesce(p_payload#>>'{identity,address}','')))=0 then raise exception 'invalid identity';end if;
 perform validate_company_source(p_payload#>'{identity,source}');
 for other_row in select distinct on(company_id) company_id,payload from company_observation_entries where user_id=p_user_id and kind='identity' and company_id<>p_company_id order by company_id,revision desc loop
 if other_row.payload->>'action'='confirm' and other_row.payload#>>'{identity,corporateNumber}'=p_payload#>>'{identity,corporateNumber}' then raise exception 'corporate number already bound';end if;end loop;
 end if;
 elsif p_kind='review' then
 perform 1 from company_observation_entries where id=(p_payload->>'sourceEntryId')::uuid and company_id=p_company_id and user_id=p_user_id and kind<>'review';if not found then raise exception 'entry unavailable';end if;
 select * into idea from ideas where id=(p_payload->>'ideaId')::uuid and user_id=p_user_id;if not found then raise exception 'idea unavailable';end if;
 if length(trim(coalesce(p_payload->>'assumption','')))=0 or length(trim(coalesce(p_payload->>'unknown','')))=0 then raise exception 'review assumption and unknown required';end if;
 stored=stored||jsonb_build_object('ideaSnapshot',jsonb_build_object('id',idea.id,'title',idea.title));
 elsif p_kind='job' then
 select * into job from job_postings where id=(p_payload->>'jobId')::uuid and user_id=p_user_id for share;if not found or (job.company_id is not null and job.company_id<>p_company_id) then raise exception 'job unavailable';end if;
 if job.company_id is null and coalesce(p_payload->>'confirmCandidate','false')<>'true' then raise exception 'candidate confirmation required';end if;
 if p_payload->>'previewHash' is distinct from company_job_preview_hash(job) then raise exception 'job changed; reload preview';end if;
 stored=jsonb_build_object('type','recruitment','stage','announcement','title',job.title,'occurredOn',job.found_on,'dateUnknown',job.found_on is null,'source',jsonb_build_object('kind','saved_job','url',job.url,'rawText',left(job.body,100000),'quote',left(job.body,20000),'scope',format('one saved job posting; body captured %s of %s characters%s; quote %s of %s captured characters%s',least(length(job.body),100000),length(job.body),case when length(job.body)>100000 then ' (clipped)' else '' end,least(length(job.body),20000),least(length(job.body),100000),case when length(job.body)>20000 then ' (clipped)' else '' end)),'details',jsonb_build_object('jobSnapshot',jsonb_build_object('id',job.id,'company_id',job.company_id,'company_name',job.company_name,'title',job.title,'url',job.url,'found_on',job.found_on,'facts',job.facts),'originalBodyHash',encode(sha256(convert_to(job.body,'UTF8')),'hex'),'capturedBodyHash',encode(sha256(convert_to(left(job.body,100000),'UTF8')),'hex'),'originalBodyLength',length(job.body),'capturedBodyLength',least(length(job.body),100000),'bodyTruncated',length(job.body)>100000,'quoteTruncated',length(job.body)>20000,'candidateConfirmed',job.company_id is null));
 perform validate_company_source(stored->'source');
 else
 if coalesce(stored->>'type','') not in ('manual','procurement','subsidy','recruitment','price','feature','disclosure') or coalesce(stored->>'stage','') not in ('announcement','action','result') or length(trim(coalesce(stored->>'title','')))=0 then raise exception 'invalid activity';end if;
 perform validate_company_source(stored->'source');
 if p_kind='activity' and (stored#>>'{source,kind}'='official_response' or stored->'details' ? 'corporateNumber') then
 select * into latest from company_observation_entries where user_id=p_user_id and company_id=p_company_id and kind='identity' order by revision desc limit 1;
 if latest.id is null or latest.payload->>'action'<>'confirm' or latest.id::text is distinct from stored#>>'{details,identityEntryId}' or latest.payload#>>'{identity,corporateNumber}' is distinct from stored#>>'{details,corporateNumber}' then raise exception 'company identity changed; reload official data';end if;
 end if;
 if jsonb_typeof(stored->'dateUnknown') is distinct from 'boolean' or (stored->>'dateUnknown')::boolean is distinct from (stored->>'occurredOn' is null) then raise exception 'unknown date declaration required';end if;
 if stored->>'occurredOn' is not null then v=(stored->>'occurredOn')::date::text;if v<>stored->>'occurredOn' then raise exception 'invalid activity date';end if;end if;
 if jsonb_typeof(stored->'details') is distinct from 'object' then raise exception 'invalid details';end if;
 end if;
 perform set_config('ideaos.company_write','allowed',true);
 insert into company_observation_entries(user_id,company_id,kind,payload,request_id,request_payload,content_hash,revision) values(p_user_id,p_company_id,case when p_kind='job' then 'activity' else p_kind end,stored,p_request_id,req,encode(sha256(convert_to(stored::text,'UTF8')),'hex'),(select coalesce(max(revision),0)+1 from company_observation_entries where company_id=p_company_id)) returning id into result_id;
 perform set_config('ideaos.company_write','',true);
 return jsonb_build_object('id',result_id);
end$$;
revoke all on function public.save_company_observation(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_company_observation(uuid,uuid,uuid,text,jsonb,uuid) to service_role;
commit;









-- ============================================================================
-- Synced migration: 111_feedback_learning.sql
-- ============================================================================
begin;
create table public.decision_feedback (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),idea_id uuid not null references public.ideas(id),
 revision integer not null check(revision>0),request_id uuid not null,request_payload jsonb not null,
 source_kind text not null check(source_kind in ('validation','manual_contact','no_reply')),
 validation_id uuid references public.validations(id),outreach_canvas_id uuid references public.outreach_canvases(id),
 source_note text,source_has_pain text check(source_has_pain in ('yes','no','unsure')),source_will_pay text check(source_will_pay in ('yes','no','unsure')),
 contacted_at timestamptz,verbatim boolean not null default false,role_context text not null,interpretation text not null,created_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id),unique(user_id,revision),unique(id,user_id),
 check((source_kind='validation' and validation_id is not null and not verbatim) or (source_kind<>'validation' and validation_id is null and source_has_pain is null and source_will_pay is null)),
 check(source_kind<>'no_reply' or not verbatim)
);
create table public.decision_feedback_links (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),feedback_id uuid not null,target_idea_id uuid not null references public.ideas(id),
 revision integer not null check(revision>0),request_id uuid not null,request_payload jsonb not null,action text not null check(action in ('confirm','retract')),
 expected_link_id uuid references public.decision_feedback_links(id),assumption text not null,scope text not null,limits text not null,unknown text not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(feedback_id,user_id) references public.decision_feedback(id,user_id),unique(user_id,request_id),unique(user_id,revision)
);
create index feedback_anchor on public.decision_feedback(user_id,idea_id,revision desc);
create index feedback_link_pair on public.decision_feedback_links(user_id,feedback_id,target_idea_id,revision desc);
create index feedback_link_incoming on public.decision_feedback_links(user_id,target_idea_id,revision desc);
alter table public.decision_feedback enable row level security;
alter table public.decision_feedback_links enable row level security;
create policy feedback_owner on public.decision_feedback for select using(auth.uid()=user_id);
create policy feedback_link_owner on public.decision_feedback_links for select using(auth.uid()=user_id);
grant select on public.decision_feedback,public.decision_feedback_links to authenticated,service_role;
revoke insert,update,delete on public.decision_feedback,public.decision_feedback_links from anon,authenticated,service_role;
create function public.feedback_immutable_guard() returns trigger language plpgsql as $$begin
 if tg_op<>'INSERT' or current_setting('ideaos.feedback_write',true) is distinct from 'allowed' then raise exception 'immutable feedback; use RPC';end if;return new;end$$;
create trigger feedback_immutable before insert or update or delete on public.decision_feedback for each row execute function public.feedback_immutable_guard();
create trigger feedback_link_immutable before insert or update or delete on public.decision_feedback_links for each row execute function public.feedback_immutable_guard();
create function public.save_decision_feedback(p_user_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old decision_feedback;v public.validations;c public.outreach_canvases;new_id uuid;source text;note_text text;contact_time timestamptz;field text;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'service owner required' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>50000 then raise exception 'invalid feedback';end if;
 for field in select jsonb_object_keys(p_payload) loop if field not in ('ideaId','requestId','sourceKind','validationId','outreachCanvasId','sourceNote','contactedAt','verbatim','roleContext','interpretation') then raise exception 'unsupported feedback field';end if;end loop;
 if p_payload->>'requestId' is null or p_payload->>'ideaId' is null then raise exception 'feedback identity required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,111));
 select * into old from decision_feedback where user_id=p_user_id and request_id=(p_payload->>'requestId')::uuid;
 if found then if old.request_payload is distinct from p_payload then raise exception 'request conflict';end if;return jsonb_build_object('id',old.id);end if;
 perform 1 from ideas where id=(p_payload->>'ideaId')::uuid and user_id=p_user_id for share;if not found then raise exception 'idea unavailable';end if;
 source=p_payload->>'sourceKind';
 if source is null or source not in ('validation','manual_contact','no_reply') then raise exception 'invalid source kind';end if;
 foreach field in array array['roleContext','interpretation'] loop if jsonb_typeof(p_payload->field) is distinct from 'string' or length(trim(p_payload->>field)) not between 1 and 4000 then raise exception 'feedback context required';end if;end loop;
 if p_payload ? 'verbatim' and jsonb_typeof(p_payload->'verbatim') is distinct from 'boolean' then raise exception 'invalid verbatim';end if;
 if p_payload->>'outreachCanvasId' is not null then
 select * into c from outreach_canvases where id=(p_payload->>'outreachCanvasId')::uuid and user_id=p_user_id for share;
 if not found or (c.source_id is not null and (c.source_type is distinct from 'idea' or c.source_id<>(p_payload->>'ideaId')::uuid)) then raise exception 'canvas unavailable for idea';end if;end if;
 if source='validation' then
 if p_payload ? 'sourceNote' or p_payload ? 'contactedAt' or coalesce((p_payload->>'verbatim')::boolean,false) then raise exception 'validation snapshot is server owned';end if;
 select * into v from validations where id=(p_payload->>'validationId')::uuid and idea_id=(p_payload->>'ideaId')::uuid for share;if not found then raise exception 'validation unavailable';end if;
 note_text=v.note;contact_time=v.contacted_at;
 else
 if p_payload->>'validationId' is not null then raise exception 'manual source cannot copy signals';end if;
 if p_payload ? 'sourceNote' and jsonb_typeof(p_payload->'sourceNote') not in ('string','null') then raise exception 'invalid source note';end if;
 note_text=p_payload->>'sourceNote';if length(note_text)>20000 then raise exception 'note too long';end if;
 if coalesce((p_payload->>'verbatim')::boolean,false) and length(trim(coalesce(note_text,'')))=0 then raise exception 'verbatim quote requires source text';end if;
 contact_time=(p_payload->>'contactedAt')::timestamptz;
 if source='no_reply' and coalesce((p_payload->>'verbatim')::boolean,false) then raise exception 'no reply has no quote';end if;
 end if;
 perform set_config('ideaos.feedback_write','allowed',true);
 insert into decision_feedback(user_id,idea_id,revision,request_id,request_payload,source_kind,validation_id,outreach_canvas_id,source_note,source_has_pain,source_will_pay,contacted_at,verbatim,role_context,interpretation)
 values(p_user_id,(p_payload->>'ideaId')::uuid,(select coalesce(max(revision),0)+1 from decision_feedback where user_id=p_user_id),(p_payload->>'requestId')::uuid,p_payload,source,v.id,c.id,note_text,v.has_pain::text,v.will_pay::text,contact_time,coalesce((p_payload->>'verbatim')::boolean,false),trim(p_payload->>'roleContext'),trim(p_payload->>'interpretation')) returning id into new_id;
 perform set_config('ideaos.feedback_write','',true);return jsonb_build_object('id',new_id);
end$$;
create function public.save_decision_feedback_link(p_user_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old decision_feedback_links;latest decision_feedback_links;f decision_feedback;new_id uuid;field text;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'service owner required' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>30000 then raise exception 'invalid feedback link';end if;
 for field in select jsonb_object_keys(p_payload) loop if field not in ('feedbackId','targetIdeaId','requestId','expectedLinkId','action','assumption','scope','limits','unknown') then raise exception 'unsupported link field';end if;end loop;
 if p_payload->>'requestId' is null or p_payload->>'feedbackId' is null or p_payload->>'targetIdeaId' is null or not(p_payload ? 'expectedLinkId') then raise exception 'link identity required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,111));
 select * into old from decision_feedback_links where user_id=p_user_id and request_id=(p_payload->>'requestId')::uuid;
 if found then if old.request_payload is distinct from p_payload then raise exception 'request conflict';end if;return jsonb_build_object('id',old.id);end if;
 select * into f from decision_feedback where id=(p_payload->>'feedbackId')::uuid and user_id=p_user_id for share;if not found then raise exception 'feedback unavailable';end if;
 perform 1 from ideas where id=(p_payload->>'targetIdeaId')::uuid and user_id=p_user_id for share;if not found or f.idea_id=(p_payload->>'targetIdeaId')::uuid then raise exception 'target idea unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||f.id::text||(p_payload->>'targetIdeaId')::uuid::text,113));
 select * into latest from decision_feedback_links where user_id=p_user_id and feedback_id=f.id and target_idea_id=(p_payload->>'targetIdeaId')::uuid order by revision desc limit 1;
 if latest.id is distinct from (p_payload->>'expectedLinkId')::uuid then raise exception 'stale feedback link';end if;
 if coalesce(p_payload->>'action','') not in ('confirm','retract') or (p_payload->>'action'='retract' and (latest.id is null or latest.action<>'confirm')) then raise exception 'invalid link action';end if;
 foreach field in array array['assumption','scope','limits','unknown'] loop
 if jsonb_typeof(p_payload->field) is distinct from 'string' or length(p_payload->>field)>4000 or (p_payload->>'action'='confirm' and length(trim(p_payload->>field))=0) then raise exception 'link scope required';end if;end loop;
 perform set_config('ideaos.feedback_write','allowed',true);
 insert into decision_feedback_links(user_id,feedback_id,target_idea_id,revision,request_id,request_payload,action,expected_link_id,assumption,scope,limits,unknown)
 values(p_user_id,f.id,(p_payload->>'targetIdeaId')::uuid,(select coalesce(max(revision),0)+1 from decision_feedback_links where user_id=p_user_id),(p_payload->>'requestId')::uuid,p_payload,p_payload->>'action',latest.id,p_payload->>'assumption',p_payload->>'scope',p_payload->>'limits',p_payload->>'unknown') returning id into new_id;
 perform set_config('ideaos.feedback_write','',true);return jsonb_build_object('id',new_id);
end$$;
revoke all on function public.save_decision_feedback(uuid,jsonb),public.save_decision_feedback_link(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_decision_feedback(uuid,jsonb),public.save_decision_feedback_link(uuid,jsonb) to service_role;
create function public.list_decision_feedback(p_user_id uuid,p_idea_id uuid default null,p_before integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'service owner required' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'invalid feedback cursor';end if;
 if p_idea_id is not null then perform 1 from ideas where id=p_idea_id and user_id=p_user_id;if not found then raise exception 'idea unavailable';end if;end if;
 with latest as (select distinct on(feedback_id,target_idea_id) * from decision_feedback_links where user_id=p_user_id order by feedback_id,target_idea_id,revision desc),
 rows as (select f.* from decision_feedback f where f.user_id=p_user_id and (p_before is null or f.revision<p_before) and (p_idea_id is null or f.idea_id=p_idea_id or exists(select 1 from latest l where l.feedback_id=f.id and l.target_idea_id=p_idea_id and l.action='confirm')) order by f.revision desc limit 31),
 page as(select * from rows order by revision desc limit 30)
 select jsonb_build_object('status','ready','items',coalesce((select jsonb_agg(to_jsonb(p) order by revision desc) from page p),'[]'::jsonb),'links',coalesce((select jsonb_agg(to_jsonb(l) order by revision desc) from latest l where l.feedback_id in(select id from page)),'[]'::jsonb),'nextBefore',case when (select count(*) from rows)>30 then (select min(revision) from page) else null end) into result;
 return result;
end$$;
revoke all on function public.list_decision_feedback(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_decision_feedback(uuid,uuid,integer) to service_role;
commit;


-- ============================================================================
-- Synced migration: 112_idea_reconsideration.sql
-- ============================================================================
-- Manual archived condition history; no automatic decision or real-contact side effects.
begin;
create unique index if not exists ideas_reconsideration_owner on public.ideas(id,user_id);
create table public.idea_reconsideration_entries(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),idea_id uuid not null,
 revision integer generated always as identity unique,kind text not null check(kind in ('condition','retract','evaluation','cue','ack')),
 condition_version_id uuid,expected_version_id uuid,cue_id uuid,evaluation_id uuid,
 learned text,change_required text,criterion text,scope text,decision_snapshot jsonb,
 outcome text check(outcome in ('met','not_met','unknown')),coverage text,source_snapshot jsonb,
 request_id uuid,request_payload jsonb,created_at timestamptz not null default clock_timestamp(),
 unique(id,user_id,idea_id),unique(user_id,request_id),
 foreign key(idea_id,user_id) references public.ideas(id,user_id) on delete restrict,
 foreign key(condition_version_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(expected_version_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(cue_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(evaluation_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict
);
create table public.idea_reconsideration_requests(
 user_id uuid not null references auth.users(id),request_id uuid not null,idea_id uuid not null,entry_id uuid not null,cue_id uuid,
 request_payload jsonb not null,result jsonb not null,primary key(user_id,request_id),
 foreign key(entry_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(cue_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict
);
alter table public.idea_reconsideration_requests enable row level security;
create policy reconsideration_request_owner on public.idea_reconsideration_requests for select to authenticated using(auth.uid()=user_id);
grant select on public.idea_reconsideration_requests to authenticated,service_role;
revoke insert,update,delete on public.idea_reconsideration_requests from anon,authenticated,service_role;
create unique index reconsideration_one_cue on public.idea_reconsideration_entries(condition_version_id) where kind='cue';
create unique index reconsideration_one_ack on public.idea_reconsideration_entries(cue_id) where kind='ack';
create index reconsideration_history on public.idea_reconsideration_entries(user_id,idea_id,revision desc);
alter table public.idea_reconsideration_entries enable row level security;
create policy reconsideration_owner on public.idea_reconsideration_entries for select to authenticated using(auth.uid()=user_id);
grant select on public.idea_reconsideration_entries to authenticated,service_role;
revoke insert,update,delete on public.idea_reconsideration_entries from anon,authenticated,service_role;
create function public.reconsideration_history_guard() returns trigger language plpgsql as $$begin
 if tg_op<>'INSERT' or current_setting('ideaos.reconsideration_write',true) is distinct from 'allowed' then raise exception 'immutable reconsideration history';end if;return new;end$$;
create trigger reconsideration_immutable before insert or update or delete on public.idea_reconsideration_entries for each row execute function public.reconsideration_history_guard();
create trigger reconsideration_request_immutable before insert or update or delete on public.idea_reconsideration_requests for each row execute function public.reconsideration_history_guard();
create function public.save_idea_reconsideration(p_user_id uuid,p_idea_id uuid,p_request_id uuid,p_kind text,p_expected_version_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old idea_reconsideration_requests;latest idea_reconsideration_entries;receipt idea_reconsideration_entries;req jsonb;result_id uuid;cue uuid;source jsonb;raw_source jsonb;record_source jsonb;decision jsonb;quote text;k text;idx integer;
begin
 if p_user_id is null then raise exception 'reconsideration owner required' using errcode='42501';end if;
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 if p_idea_id is null or p_request_id is null or p_kind is null or p_kind not in ('condition','retract','evaluation','ack') or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>180000 then raise exception 'invalid reconsideration input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,112));
 req=jsonb_build_object('ideaId',p_idea_id,'kind',p_kind,'expectedVersionId',p_expected_version_id,'payload',p_payload);
 select * into old from idea_reconsideration_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if old.request_payload is distinct from req then raise exception 'request conflict';end if;
 return old.result;end if;
 perform 1 from ideas where id=p_idea_id and user_id=p_user_id for update;if not found then raise exception 'idea unavailable';end if;
 if not exists(select 1 from ideas where id=p_idea_id and user_id=p_user_id and status::text='归档') then raise exception 'archived idea required';end if;
 select * into latest from idea_reconsideration_entries where user_id=p_user_id and idea_id=p_idea_id and kind in ('condition','retract') order by revision desc limit 1;
 if latest.id is distinct from p_expected_version_id then raise exception 'stale condition version';end if;
 if p_kind<>'condition' and (latest.id is null or latest.kind<>'condition') then raise exception 'active condition required';end if;
 if p_kind='condition' then
 foreach k in array array['learned','changeRequired','criterion','scope'] loop
 if jsonb_typeof(p_payload->k) is distinct from 'string' or length(trim(p_payload->>k)) not between 1 and 4000 then raise exception 'condition text required %',k;end if;end loop;
 if p_payload->>'decisionId' is not null then
 select jsonb_build_object('id',d.id,'learned',d.learned,'verdict',d.verdict) into decision from decisions d where d.id=(p_payload->>'decisionId')::uuid and d.idea_id=p_idea_id and lower(d.verdict::text)='kill';
 if decision is null then raise exception 'Kill learning unavailable';end if;end if;
 elsif p_kind='evaluation' then
 if coalesce(p_payload->>'outcome','') not in ('met','not_met','unknown') or length(trim(coalesce(p_payload->>'coverage',''))) not between 1 and 4000 then raise exception 'evaluation outcome and coverage required';end if;
 raw_source=p_payload->'source';quote=raw_source->>'quote';
 if jsonb_typeof(raw_source) is distinct from 'object' or jsonb_typeof(raw_source->'quote') is distinct from 'string' or length(trim(quote)) not between 1 and 20000 then raise exception 'source quote required';end if;
 if raw_source->>'kind'='manual' then
 if jsonb_typeof(raw_source->'rawText') is distinct from 'string' or length(raw_source->>'rawText') not between 1 and 100000 or coalesce(raw_source->>'url','') !~ '^https?://' or raw_source->>'url' ~ '^https?://[^/[:space:]]*@' or raw_source->>'url' ~ '[[:cntrl:][:space:]]' or length(raw_source->>'url')>8000 then raise exception 'manual source URL and material required';end if;
 source=jsonb_build_object('kind','manual','origin','user_provided','url',raw_source->>'url','rawText',raw_source->>'rawText','quote',quote);
 elsif raw_source->>'kind'='observation_run' then
 if to_regclass('public.decision_observation_runs') is null then raise exception 'observation source unavailable: migration 108 required';end if;
 if coalesce(raw_source->>'recordIndex','') !~ '^[0-9]{1,3}$' then raise exception 'invalid record index';end if;idx=(raw_source->>'recordIndex')::integer;if idx>499 then raise exception 'invalid record index';end if;
 execute 'select payload from public.decision_observation_runs where id=$1 and user_id=$2' into record_source using (raw_source->>'runId')::uuid,p_user_id;
 if record_source is null then raise exception 'observation source unavailable';end if;
 record_source=record_source->'records'->idx;if record_source is null then raise exception 'observation record unavailable';end if;
 if coalesce(record_source->>'origin','') not in ('manual','public','synthetic','ai_seed') then raise exception 'observation origin unavailable';end if;
 if p_payload->>'outcome'='met' and record_source->>'origin' in ('synthetic','ai_seed') then raise exception 'synthetic/AI material cannot meet real condition';end if;
 if record_source->>'origin'='public' and coalesce(record_source->>'sourceUrl','') !~ '^https?://' then raise exception 'public record URL required';end if;
 source=jsonb_build_object('kind','observation_run','runId',raw_source->>'runId','recordIndex',idx,'origin',record_source->>'origin','url',record_source->>'sourceUrl','rawText',record_source->>'text','quote',quote,'title',record_source->>'title');
 elsif raw_source->>'kind'='company_entry' then
 if to_regclass('public.company_observation_entries') is null then raise exception 'company source unavailable: migration 110 required';end if;
 execute 'select payload->''source'' from public.company_observation_entries where id=$1 and user_id=$2 and kind in (''activity'',''snapshot'')' into record_source using (raw_source->>'entryId')::uuid,p_user_id;
 if record_source is null or coalesce(record_source->>'kind','') not in ('manual_import','official_response','web_capture','saved_job') then raise exception 'company source unavailable';end if;
 source=jsonb_build_object('kind','company_entry','entryId',raw_source->>'entryId','origin',record_source->>'kind','url',record_source->>'url','rawText',record_source->>'rawText','quote',quote,'scope',record_source->>'scope');
 else raise exception 'invalid material source';end if;
 if length(coalesce(source->>'rawText','')) not between 1 and 100000 or position(quote in source->>'rawText')=0 then raise exception 'quote not found in actual material text';end if;
 elsif p_kind='ack' then
 select id into cue from idea_reconsideration_entries where id=(p_payload->>'cueId')::uuid and user_id=p_user_id and idea_id=p_idea_id and condition_version_id=latest.id and kind='cue';if cue is null then raise exception 'cue unavailable';end if;
 select * into receipt from idea_reconsideration_entries where kind='ack' and cue_id=cue;
 if found then
 perform set_config('ideaos.reconsideration_write','allowed',true);
 insert into idea_reconsideration_requests(user_id,request_id,idea_id,entry_id,cue_id,request_payload,result) values(p_user_id,p_request_id,p_idea_id,receipt.id,cue,req,jsonb_build_object('id',receipt.id,'cueId',cue));
 perform set_config('ideaos.reconsideration_write','',true);
 return jsonb_build_object('id',receipt.id,'cueId',cue);end if;
 end if;
 perform set_config('ideaos.reconsideration_write','allowed',true);
 insert into idea_reconsideration_entries(user_id,idea_id,kind,condition_version_id,expected_version_id,cue_id,learned,change_required,criterion,scope,decision_snapshot,outcome,coverage,source_snapshot,request_id,request_payload)
 values(p_user_id,p_idea_id,p_kind,case when p_kind='condition' then null else latest.id end,p_expected_version_id,cue,case when p_kind='condition' then p_payload->>'learned' end,case when p_kind='condition' then p_payload->>'changeRequired' end,case when p_kind='condition' then p_payload->>'criterion' end,case when p_kind='condition' then p_payload->>'scope' end,decision,case when p_kind='evaluation' then p_payload->>'outcome' end,case when p_kind='evaluation' then p_payload->>'coverage' end,source,p_request_id,req) returning id into result_id;
 if p_kind='evaluation' then
 select id into cue from idea_reconsideration_entries where condition_version_id=latest.id and kind='cue';
 if p_payload->>'outcome'='met' and cue is null then
 insert into idea_reconsideration_entries(user_id,idea_id,kind,condition_version_id,evaluation_id) values(p_user_id,p_idea_id,'cue',latest.id,result_id) returning id into cue;
 end if;end if;
 insert into idea_reconsideration_requests(user_id,request_id,idea_id,entry_id,cue_id,request_payload,result) values(p_user_id,p_request_id,p_idea_id,result_id,cue,req,jsonb_build_object('id',result_id,'cueId',cue));
 perform set_config('ideaos.reconsideration_write','',true);
 return jsonb_build_object('id',result_id,'cueId',cue);
end$$;
create function public.list_idea_reconsideration_cues(p_user_id uuid,p_before_revision integer default null) returns setof public.idea_reconsideration_entries language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_user_id is null then raise exception 'reconsideration owner required' using errcode='42501';end if;
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 return query select c.* from idea_reconsideration_entries c join ideas i on i.id=c.idea_id and i.user_id=c.user_id
 where c.user_id=p_user_id and c.kind='cue' and i.status::text='归档' and (p_before_revision is null or c.revision<p_before_revision)
 and c.condition_version_id=(select v.id from idea_reconsideration_entries v where v.idea_id=c.idea_id and v.user_id=p_user_id and v.kind in ('condition','retract') order by v.revision desc limit 1)
 and (select e.outcome from idea_reconsideration_entries e where e.kind='evaluation' and e.user_id=p_user_id and e.condition_version_id=c.condition_version_id order by e.revision desc limit 1)='met'
 and not exists(select 1 from idea_reconsideration_entries a where a.kind='ack' and a.cue_id=c.id and a.user_id=p_user_id)
 order by c.revision desc limit 21;
end$$;
revoke all on function public.save_idea_reconsideration(uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.list_idea_reconsideration_cues(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_idea_reconsideration(uuid,uuid,uuid,text,uuid,jsonb) to service_role;
grant execute on function public.list_idea_reconsideration_cues(uuid,integer) to service_role;
commit;



-- ============================================================================
-- Synced migration: 113_feedback_task_adjustments.sql
-- ============================================================================
-- Confirmed feedback may propose a new manual task version. No validation/activity writes.
begin;
create table public.feedback_task_proposals (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 revision bigint generated always as identity unique,
 feedback_id uuid not null references public.decision_feedback(id),task_id uuid not null,
 base_version_id uuid not null,source_link_id uuid references public.decision_feedback_links(id),
 before_config jsonb not null,next_config jsonb not null,reason text not null,
 request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id),unique(id,user_id),
 foreign key(base_version_id,task_id,user_id) references public.decision_observation_versions(id,task_id,user_id)
);
create table public.feedback_task_applications (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,
 proposal_id uuid not null unique,task_id uuid not null,new_task_version_id uuid not null,
 request_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id),foreign key(proposal_id,user_id) references public.feedback_task_proposals(id,user_id),
 foreign key(new_task_version_id,task_id,user_id) references public.decision_observation_versions(id,task_id,user_id)
);
create table public.feedback_task_requests (
 user_id uuid not null,request_id uuid not null,proposal_id uuid not null,
 application_id uuid not null references public.feedback_task_applications(id),
 primary key(user_id,request_id),foreign key(proposal_id,user_id) references public.feedback_task_proposals(id,user_id)
);
create function public.feedback_task_guard() returns trigger language plpgsql as $$
begin
 if tg_op<>'INSERT' or current_setting('ideaos.feedback_task_write',true) is distinct from 'allowed' then raise exception 'immutable feedback task history';end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['feedback_task_proposals','feedback_task_applications','feedback_task_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy feedback_task_read on public.%I for select to authenticated using(auth.uid()=user_id)',t);
 execute format('grant select on public.%I to authenticated,service_role',t);
 execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 execute format('create trigger immutable_feedback_task before insert or update or delete on public.%I for each row execute function public.feedback_task_guard()',t);
 end loop;
end $$;
create function public.save_feedback_task_proposal(p_user_id uuid,p_feedback_id uuid,p_task_id uuid,p_base_version_id uuid,p_next_config jsonb,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.feedback_task_proposals;t public.decision_observation_tasks;v public.decision_observation_versions;f public.decision_feedback;l public.decision_feedback_links;req jsonb;rid uuid;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'feedback task owner required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'request required';end if;
 perform public.validate_observation_config(p_next_config);
 if p_reason is null or length(trim(p_reason))=0 or length(p_reason)>4000 then raise exception 'adjustment reason required';end if;
 req=jsonb_build_object('feedbackId',p_feedback_id,'taskId',p_task_id,'baseVersionId',p_base_version_id,'nextConfig',p_next_config,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,113));
 select * into old from public.feedback_task_proposals where user_id=p_user_id and request_id=p_request_id;
 if found then
 if old.request_payload<>req then raise exception 'request payload conflict';end if;
 return jsonb_build_object('id',old.id);end if;
 select * into t from public.decision_observation_tasks where id=p_task_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.ideas where id=t.object_id and user_id=p_user_id) then raise exception 'task unavailable';end if;
 select * into v from public.decision_observation_versions where task_id=t.id and user_id=p_user_id order by revision desc limit 1;
 if v.id is distinct from p_base_version_id then raise exception '观察配置已变化，请重新读取并预览';end if;
 if v.config=p_next_config then raise exception '配置没有变化';end if;
 select * into f from public.decision_feedback where id=p_feedback_id and user_id=p_user_id;
 if not found or not exists(select 1 from public.ideas where id=f.idea_id and user_id=p_user_id) then raise exception 'feedback unavailable';end if;
 if f.idea_id<>t.object_id then
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_feedback_id::text||t.object_id::text,113));
 select * into l from public.decision_feedback_links where user_id=p_user_id and feedback_id=f.id and target_idea_id=t.object_id order by revision desc limit 1;
 if not found or l.action<>'confirm' then raise exception '反馈适用关系已撤回或未确认';end if;
 end if;
 perform set_config('ideaos.feedback_task_write','allowed',true);
 insert into public.feedback_task_proposals(user_id,feedback_id,task_id,base_version_id,source_link_id,before_config,next_config,reason,request_id,request_payload)
 values(p_user_id,f.id,t.id,v.id,l.id,v.config,p_next_config,p_reason,p_request_id,req) returning id into rid;
 perform set_config('ideaos.feedback_task_write','',true);
 return jsonb_build_object('id',rid);
end $$;
create function public.apply_feedback_task_proposal(p_user_id uuid,p_proposal_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.feedback_task_applications;receipt public.feedback_task_requests;p public.feedback_task_proposals;t public.decision_observation_tasks;v_id uuid;f public.decision_feedback;l public.decision_feedback_links;result jsonb;rid uuid;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'feedback task owner required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'request required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,113));
 select * into receipt from public.feedback_task_requests where user_id=p_user_id and request_id=p_request_id;
 if found then
 if receipt.proposal_id is distinct from p_proposal_id then raise exception 'request payload conflict';end if;
 select * into old from public.feedback_task_applications where id=receipt.application_id and user_id=p_user_id;
 return jsonb_build_object('id',old.id,'versionId',old.new_task_version_id);end if;
 select * into p from public.feedback_task_proposals where id=p_proposal_id and user_id=p_user_id for update;
 if not found then raise exception 'proposal unavailable';end if;
 select * into old from public.feedback_task_applications where proposal_id=p.id and user_id=p_user_id;
 if found then
 perform set_config('ideaos.feedback_task_write','allowed',true);
 insert into public.feedback_task_requests(user_id,request_id,proposal_id,application_id) values(p_user_id,p_request_id,p.id,old.id);
 perform set_config('ideaos.feedback_task_write','',true);
 return jsonb_build_object('id',old.id,'versionId',old.new_task_version_id);end if;
 select * into t from public.decision_observation_tasks where id=p.task_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.ideas where id=t.object_id and user_id=p_user_id) then raise exception 'task unavailable';end if;
 select id into v_id from public.decision_observation_versions where task_id=t.id and user_id=p_user_id order by revision desc limit 1;
 if v_id is distinct from p.base_version_id then raise exception '观察配置已变化，请重新读取并预览';end if;
 select * into f from public.decision_feedback where id=p.feedback_id and user_id=p_user_id;
 if not found or not exists(select 1 from public.ideas where id=f.idea_id and user_id=p_user_id) then raise exception 'feedback unavailable';end if;
 if f.idea_id<>t.object_id then
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||f.id::text||t.object_id::text,113));
 select * into l from public.decision_feedback_links where user_id=p_user_id and feedback_id=f.id and target_idea_id=t.object_id order by revision desc limit 1;
 if not found or l.action<>'confirm' or l.id is distinct from p.source_link_id then raise exception '反馈适用关系已变化，请重新确认';end if;
 end if;
 result=public.save_decision_observation_version(p_user_id,t.id,null,null,p.next_config,p_request_id);
 perform set_config('ideaos.feedback_task_write','allowed',true);
 insert into public.feedback_task_applications(user_id,proposal_id,task_id,new_task_version_id,request_id)
 values(p_user_id,p.id,t.id,(result->>'id')::uuid,p_request_id) returning id into rid;
 insert into public.feedback_task_requests(user_id,request_id,proposal_id,application_id) values(p_user_id,p_request_id,p.id,rid);
 perform set_config('ideaos.feedback_task_write','',true);
 return jsonb_build_object('id',rid,'versionId',result->>'id');
end $$;
revoke all on function public.save_feedback_task_proposal(uuid,uuid,uuid,uuid,jsonb,text,uuid), public.apply_feedback_task_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_feedback_task_proposal(uuid,uuid,uuid,uuid,jsonb,text,uuid), public.apply_feedback_task_proposal(uuid,uuid,uuid) to service_role;
commit;


-- ============================================================================
-- Synced migration: 114_reasoning_quality.sql
-- ============================================================================
begin;
-- Manual reasoning journal and immutable source-correction notices. No AI or idea writes.
create table public.event_reasoning_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null, revision bigint not null check(revision between 1 and 9007199254740991),
  kind text not null check(kind in ('claim','increment','denominator','comparability','disagreement','mechanism','applicability','review','correction','ack')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=65000),
  created_at timestamptz not null default clock_timestamp(),
  unique(id,user_id,event_id),unique(event_id,revision),
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade
);
create table public.event_reasoning_impacts (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,event_id uuid not null,
  revision bigint generated always as identity check(revision<=9007199254740991),correction_id uuid not null,
  subject_kind text not null check(subject_kind in ('reasoning','research')),subject_id uuid not null,
  old_conclusion jsonb not null,created_at timestamptz not null default clock_timestamp(),
  foreign key(correction_id,user_id,event_id) references public.event_reasoning_entries(id,user_id,event_id) on delete cascade,
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
  unique(correction_id,subject_kind,subject_id),unique(id,user_id,event_id)
);
create table public.event_reasoning_requests (
  user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,event_id uuid not null,
  kind text not null,payload jsonb not null,expected_revision bigint not null,entry_id uuid not null,
  primary key(user_id,request_id),foreign key(entry_id,user_id,event_id) references public.event_reasoning_entries(id,user_id,event_id) on delete cascade
);
create index event_reasoning_history on public.event_reasoning_entries(user_id,event_id,revision);
create index event_reasoning_impact_history on public.event_reasoning_impacts(user_id,event_id,revision);
create function public.preserve_event_reasoning() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' and (not exists(select 1 from auth.users where id=old.user_id) or not exists(select 1 from public.signal_events where id=old.event_id and user_id=old.user_id)) then return old;end if;
  raise exception 'reasoning history is immutable';
end $$;
create trigger reasoning_entries_immutable before update or delete on public.event_reasoning_entries for each row execute function public.preserve_event_reasoning();
create trigger reasoning_impacts_immutable before update or delete on public.event_reasoning_impacts for each row execute function public.preserve_event_reasoning();
create trigger reasoning_requests_immutable before update or delete on public.event_reasoning_requests for each row execute function public.preserve_event_reasoning();
alter table public.event_reasoning_entries enable row level security;
alter table public.event_reasoning_impacts enable row level security;
alter table public.event_reasoning_requests enable row level security;
create policy reasoning_entry_owner on public.event_reasoning_entries for select to authenticated using(auth.uid()=user_id);
create policy reasoning_impact_owner on public.event_reasoning_impacts for select to authenticated using(auth.uid()=user_id);
revoke all on public.event_reasoning_entries,public.event_reasoning_impacts,public.event_reasoning_requests from public,anon,authenticated,service_role;
grant select on public.event_reasoning_entries,public.event_reasoning_impacts to authenticated,service_role;

create function public.guard_event_reasoning(p_user_id uuid,p_event_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'reasoning service owner required' using errcode='42501';end if;
  if not exists(select 1 from public.signal_events where id=p_event_id and user_id=p_user_id) then raise exception 'event owner required' using errcode='42501';end if;
end $$;
create function public.validate_event_reasoning_ref(p_user_id uuid,p_event_id uuid,p_ref jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if jsonb_typeof(p_ref) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_ref) k where k not in ('snapshotId','quote')) or jsonb_typeof(p_ref->'quote') is distinct from 'string' or length(btrim(p_ref->>'quote')) not between 1 and 2000 then raise exception 'invalid source ref';end if;
  if not exists(select 1 from public.signal_source_snapshots s join public.signal_event_memberships m on m.snapshot_id=s.id and m.user_id=s.user_id where s.id=(p_ref->>'snapshotId')::uuid and s.user_id=p_user_id and m.event_id=p_event_id and m.action='include' and position(p_ref->>'quote' in s.captured_text)>0) then raise exception 'source membership or exact quote unavailable' using errcode='42501';end if;
end $$;
create function public.validate_event_reasoning_payload(p_user_id uuid,p_event_id uuid,p_kind text,p jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed text[];required text[];k text;r jsonb;link jsonb;pair jsonb;sid uuid;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>65000 then raise exception 'invalid reasoning payload';end if;
  case p_kind
    when 'claim' then allowed:=array[]::text[];required:=array[]::text[];
    when 'increment' then allowed:=array['baseline','addition','increment','independence','independenceBasis'];required:=array['increment','independenceBasis'];
    when 'denominator' then allowed:=array['sample','population','denominator','omittedGroups'];required:=allowed;
    when 'comparability' then allowed:=array['dimensions','verdict','reason'];required:=array['reason'];
    when 'disagreement' then allowed:=array['left','right','cause','checkQuestion'];required:=array['checkQuestion'];
    when 'mechanism' then allowed:=array['links'];required:=array[]::text[];
    when 'applicability' then allowed:=array['conditions','invalidators','followUp'];required:=allowed;
    when 'review' then allowed:=array[]::text[];required:=array[]::text[];
    when 'correction' then allowed:=array['oldSnapshotId','newSnapshotId'];required:=array[]::text[];
    when 'ack' then allowed:=array['impactId'];required:=array[]::text[];
    else raise exception 'invalid reasoning kind';
  end case;
  if exists(select 1 from jsonb_object_keys(p) key where not key=any(allowed||array['text','refs','claimIds'])) then raise exception 'unsupported reasoning field';end if;
  foreach k in array required||array['text'] loop
    if jsonb_typeof(p->k) is distinct from 'string' or length(btrim(p->>k)) not between 1 and 4000 then raise exception 'required reasoning text: %',k;end if;
  end loop;
  if jsonb_typeof(p->'refs') is distinct from 'array' or jsonb_array_length(p->'refs')>24 or jsonb_typeof(p->'claimIds') is distinct from 'array' or jsonb_array_length(p->'claimIds')>24 then raise exception 'invalid reasoning refs or dependencies';end if;
  for r in select value from jsonb_array_elements(p->'refs') loop perform public.validate_event_reasoning_ref(p_user_id,p_event_id,r);end loop;
  for r in select value from jsonb_array_elements(p->'claimIds') loop
    if jsonb_typeof(r)<>'string' or not exists(select 1 from public.event_reasoning_entries e where e.id=(r#>>'{}')::uuid and e.user_id=p_user_id and e.kind not in ('correction','ack')) then raise exception 'reasoning dependency unavailable' using errcode='42501';end if;
  end loop;
  if p_kind in ('claim','increment','denominator','comparability','disagreement','applicability') and jsonb_array_length(p->'refs')+jsonb_array_length(p->'claimIds')=0 then raise exception 'source or dependency required';end if;
  if p_kind='increment' then
    if p->>'independence' is null or p->>'independence' not in ('independent','shared','unknown') then raise exception 'source independence basis required';end if;
    foreach k in array array['baseline','addition'] loop
      perform public.validate_event_reasoning_ref(p_user_id,p_event_id,p->k);
      if not (p->'refs') @> jsonb_build_array(p->k) then raise exception 'increment citation missing from refs';end if;
    end loop;
    if p->'baseline'->>'snapshotId'=p->'addition'->>'snapshotId' then raise exception 'distinct baseline and new snapshot required';end if;
  end if;
  if p_kind='comparability' then
    if jsonb_typeof(p->'dimensions') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p->'dimensions') key where key not in ('definition','unit','period','geography','priceBasis','quantityBasis')) then raise exception 'invalid dimensions';end if;
    if p->>'verdict' is null or p->>'verdict' not in ('comparable','not_comparable') then raise exception 'comparability verdict required';end if;
    foreach k in array array['definition','unit','period','geography','priceBasis','quantityBasis'] loop
      pair:=p->'dimensions'->k;
      if jsonb_typeof(pair) is distinct from 'object' or exists(select 1 from jsonb_object_keys(pair) key where key not in ('left','right')) or jsonb_typeof(pair->'left') is distinct from 'string' or jsonb_typeof(pair->'right') is distinct from 'string' or length(btrim(pair->>'left')) not between 1 and 4000 or length(btrim(pair->>'right')) not between 1 and 4000 then raise exception 'dimension missing; explicitly retain unknown';end if;
      if p->>'verdict'='comparable' and (btrim(pair->>'left')<>btrim(pair->>'right') or (pair->>'left')~*'未知|不明|unknown|unsure' or (pair->>'right')~*'未知|不明|unknown|unsure') then raise exception 'unknown or different dimension is not comparable';end if;
    end loop;
  end if;
  if p_kind='disagreement' then
    if p->>'cause' is null or p->>'cause' not in ('fact','definition','time','mechanism','value') then raise exception 'disagreement cause required';end if;
    foreach k in array array['left','right'] loop perform public.validate_event_reasoning_ref(p_user_id,p_event_id,p->k);if not (p->'refs')@>jsonb_build_array(p->k) then raise exception 'disagreement citation missing';end if;end loop;
  end if;
  if p_kind='mechanism' then
    if jsonb_typeof(p->'links') is distinct from 'array' or jsonb_array_length(p->'links') not between 1 and 12 then raise exception 'mechanism links required';end if;
    for link in select value from jsonb_array_elements(p->'links') loop
      if jsonb_typeof(link) is distinct from 'object' or exists(select 1 from jsonb_object_keys(link) key where key not in ('text','refs','counterexample','unknown')) or jsonb_typeof(link->'text') is distinct from 'string' or length(btrim(link->>'text')) not between 1 and 4000 or jsonb_typeof(link->'refs') is distinct from 'array' or jsonb_array_length(link->'refs')>24 or jsonb_typeof(link->'counterexample') is distinct from 'string' or jsonb_typeof(link->'unknown') is distinct from 'string' or length(link->>'counterexample')>4000 or length(link->>'unknown')>4000 then raise exception 'invalid mechanism link';end if;
      if jsonb_array_length(link->'refs')=0 and btrim(link->>'counterexample')='' and btrim(link->>'unknown')='' then raise exception 'each link needs evidence counterexample or unknown';end if;
      for r in select value from jsonb_array_elements(link->'refs') loop if not (p->'refs')@>jsonb_build_array(r) then raise exception 'mechanism citation missing';end if;end loop;
    end loop;
  end if;
  if p_kind='review' and jsonb_array_length(p->'claimIds')=0 then raise exception 'review requires original claim';end if;
  if p_kind='correction' then
    if p->>'oldSnapshotId' is null or p->>'newSnapshotId' is null or p->>'oldSnapshotId'=p->>'newSnapshotId' or jsonb_array_length(p->'claimIds')<>0 then raise exception 'correction requires distinct old and new sources';end if;
    foreach k in array array['oldSnapshotId','newSnapshotId'] loop sid:=(p->>k)::uuid;if not exists(select 1 from jsonb_array_elements(p->'refs') v where (v->>'snapshotId')::uuid=sid) then raise exception 'correction needs exact old and new quotes';end if;end loop;
  end if;
  if p_kind='ack' then
    if jsonb_array_length(p->'refs')<>0 or jsonb_array_length(p->'claimIds')<>0 or not exists(select 1 from public.event_reasoning_impacts i where i.id=(p->>'impactId')::uuid and i.user_id=p_user_id and (i.event_id=p_event_id or i.old_conclusion->>'event_id'=p_event_id::text)) then raise exception 'correction impact unavailable' using errcode='42501';end if;
  end if;
end $$;

-- Only typed provenance fields participate. Text containing JSON/UUIDs never creates a dependency.
create function public.refresh_event_reasoning_impacts(p_user_id uuid,p_event_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.event_reasoning_entries;old_id text;
begin
  for c in select * from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and kind='correction' order by revision loop
    old_id:=c.payload->>'oldSnapshotId';
    with recursive affected as (
      select e.id from public.event_reasoning_entries e where e.user_id=p_user_id and e.kind not in ('correction','ack') and exists(select 1 from jsonb_array_elements(e.payload->'refs') r where r->>'snapshotId'=old_id)
      union
      select e.id from public.event_reasoning_entries e join affected a on (e.payload->'claimIds')@>jsonb_build_array(a.id::text) where e.user_id=p_user_id and e.kind not in ('correction','ack')
    ) insert into public.event_reasoning_impacts(user_id,event_id,correction_id,subject_kind,subject_id,old_conclusion)
      select p_user_id,p_event_id,c.id,'reasoning',e.id,to_jsonb(e) from affected a join public.event_reasoning_entries e on e.id=a.id on conflict(correction_id,subject_kind,subject_id) do nothing;
    with recursive affected as (
      select r.id from public.signal_event_research_entries r where r.user_id=p_user_id and (
        exists(select 1 from jsonb_array_elements(coalesce(r.payload->'refs','[]')) ref where ref->>'snapshotId'=old_id)
        or coalesce(r.payload->'selectedSnapshotIds','[]')@>jsonb_build_array(old_id)
        or (r.kind='source_link' and old_id in (r.payload->>'fromSnapshotId',r.payload->>'toSnapshotId'))
      )
      union
      select r.id from public.signal_event_research_entries r join affected a on r.subject_id=a.id or coalesce(r.payload->'selectedNoteIds','[]')@>jsonb_build_array(a.id::text) or exists(select 1 from jsonb_array_elements(coalesce(r.payload->'noteRefs','[]')) n where n->>'recordId'=a.id::text) where r.user_id=p_user_id
    ) insert into public.event_reasoning_impacts(user_id,event_id,correction_id,subject_kind,subject_id,old_conclusion)
      select p_user_id,p_event_id,c.id,'research',r.id,to_jsonb(r) from affected a join public.signal_event_research_entries r on r.id=a.id on conflict(correction_id,subject_kind,subject_id) do nothing;
  end loop;
end $$;
create function public.research_reasoning_correction_notice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.signal_events where id=new.event_id and user_id=new.user_id for update;
  perform public.refresh_event_reasoning_impacts(new.user_id,e.event_id) from (select distinct event_id from public.event_reasoning_entries where user_id=new.user_id and kind='correction') e;return new;
end $$;
create trigger research_correction_notice after insert on public.signal_event_research_entries for each row execute function public.research_reasoning_correction_notice();

-- Serialize old research RPCs before their existing event lock, keeping all 106 validation intact.
alter function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) rename to append_signal_event_research_before_reasoning;
revoke all on function public.append_signal_event_research_before_reasoning(uuid,uuid,text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.append_signal_event_research(p_user_id uuid,p_event_id uuid,p_kind text,p_subject_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.signal_event_guard_owner(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,114));
  return public.append_signal_event_research_before_reasoning(p_user_id,p_event_id,p_kind,p_subject_id,p_payload,p_request_id);
end $$;
revoke all on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) to service_role;
create function public.lock_research_reasoning_owner() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,114));return new;end $$;
create trigger research_reasoning_owner_lock before insert on public.signal_event_research_entries for each row execute function public.lock_research_reasoning_owner();

create function public.append_event_reasoning(p_user_id uuid,p_event_id uuid,p_kind text,p_payload jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.event_reasoning_requests;result public.event_reasoning_entries;current_revision bigint;
begin
  perform public.guard_event_reasoning(p_user_id,p_event_id);
  if p_request_id is null or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991 then raise exception 'invalid request or revision';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,114));
  perform 1 from public.signal_events where user_id=p_user_id and id=p_event_id and archived_at is null for update;
  if not found then raise exception 'event owner required' using errcode='42501';end if;
  select * into prior from public.event_reasoning_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.event_id is distinct from p_event_id or prior.kind is distinct from p_kind or prior.payload is distinct from p_payload or prior.expected_revision is distinct from p_expected_revision then raise exception 'reasoning request conflict' using errcode='23505';end if;
    select * into result from public.event_reasoning_entries where id=prior.entry_id;return to_jsonb(result);
  end if;
  perform public.validate_event_reasoning_payload(p_user_id,p_event_id,p_kind,p_payload);
  if p_kind='ack' then
    select * into result from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and kind='ack' and payload->>'impactId'=p_payload->>'impactId' order by revision limit 1;
    if found then
      insert into public.event_reasoning_requests values(p_user_id,p_request_id,p_event_id,p_kind,p_payload,p_expected_revision,result.id);return to_jsonb(result);
    end if;
  end if;
  select coalesce(max(revision),0) into current_revision from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id;
  if current_revision<>p_expected_revision then raise exception 'stale reasoning revision; reload history';end if;
  insert into public.event_reasoning_entries(user_id,event_id,revision,kind,payload) values(p_user_id,p_event_id,current_revision+1,p_kind,p_payload) returning * into result;
  insert into public.event_reasoning_requests values(p_user_id,p_request_id,p_event_id,p_kind,p_payload,p_expected_revision,result.id);
  if p_kind<>'ack' then perform public.refresh_event_reasoning_impacts(p_user_id,e.event_id) from (select distinct event_id from public.event_reasoning_entries where user_id=p_user_id and kind='correction') e;end if;
  return to_jsonb(result);
end $$;
create function public.list_event_reasoning(p_user_id uuid,p_event_id uuid,p_after_revision bigint default 0,p_after_impact_revision bigint default 0,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entries jsonb;impacts jsonb;next_revision bigint;next_impact bigint;current_revision bigint;
begin
  perform public.guard_event_reasoning(p_user_id,p_event_id);
  perform pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,114));
  if p_after_revision is null or p_after_impact_revision is null or p_after_revision not between 0 and 9007199254740991 or p_after_impact_revision not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid reasoning cursor or page size';end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by revision),'[]'),max(revision) into entries,next_revision from (select * from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and revision>p_after_revision order by revision limit p_limit) e;
  if not exists(select 1 from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and revision>next_revision) then next_revision:=null;end if;
  select coalesce(max(revision),0) into current_revision from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id;
  select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('correction',(select to_jsonb(c) from public.event_reasoning_entries c where c.id=i.correction_id and c.user_id=p_user_id),'acknowledged',exists(select 1 from public.event_reasoning_entries a where a.user_id=p_user_id and a.kind='ack' and a.payload->>'impactId'=i.id::text)) order by revision),'[]'),max(revision) into impacts,next_impact from (select * from public.event_reasoning_impacts where user_id=p_user_id and (event_id=p_event_id or old_conclusion->>'event_id'=p_event_id::text) and revision>p_after_impact_revision order by revision limit p_limit) i;
  if not exists(select 1 from public.event_reasoning_impacts where user_id=p_user_id and (event_id=p_event_id or old_conclusion->>'event_id'=p_event_id::text) and revision>next_impact) then next_impact:=null;end if;
  return jsonb_build_object('available',true,'entries',entries,'currentRevision',current_revision,'nextRevision',next_revision,'impacts',impacts,'nextImpactRevision',next_impact);
end $$;
revoke all on function public.guard_event_reasoning(uuid,uuid),public.validate_event_reasoning_ref(uuid,uuid,jsonb),public.validate_event_reasoning_payload(uuid,uuid,text,jsonb),public.refresh_event_reasoning_impacts(uuid,uuid),public.research_reasoning_correction_notice(),public.lock_research_reasoning_owner(),public.preserve_event_reasoning() from public,anon,authenticated,service_role;
revoke all on function public.append_event_reasoning(uuid,uuid,text,jsonb,uuid,bigint),public.list_event_reasoning(uuid,uuid,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.append_event_reasoning(uuid,uuid,text,jsonb,uuid,bigint),public.list_event_reasoning(uuid,uuid,bigint,bigint,integer) to service_role;

commit;




-- ============================================================================
-- Synced migration: 115_reading_attention.sql
-- ============================================================================
begin;
-- Manual event-scoped attention history; never filters feeds or changes idea state.
create table public.reading_attention_entries (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null, kind text not null check(kind in ('contract','contract_exit','register','review','blind_start','blind_judge','blind_exit','blind_reveal')),
 version_id uuid references public.reading_attention_entries(id), payload jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade
);
create index reading_attention_page on public.reading_attention_entries(user_id,event_id,revision);
create unique index reading_attention_registration on public.reading_attention_entries(version_id,(payload->>'snapshotId')) where kind='register';
create table public.reading_attention_requests (
 user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 input jsonb not null, entry_id uuid not null references public.reading_attention_entries(id), primary key(user_id,request_id)
);
alter table public.reading_attention_entries enable row level security;
alter table public.reading_attention_requests enable row level security;
-- All access through service-only RPCs; raw storage contains frozen titles.
revoke all on public.reading_attention_entries,public.reading_attention_requests from public,anon,authenticated,service_role;
create function public.reading_attention_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'reading attention history is immutable'; end $$;
create trigger reading_attention_immutable before update or delete on public.reading_attention_entries for each row execute function public.reading_attention_immutable();
create trigger reading_attention_request_immutable before update or delete on public.reading_attention_requests for each row execute function public.reading_attention_immutable();
create function public.reading_attention_owner(p_user_id uuid,p_event_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' or not exists(select 1 from signal_events where id=p_event_id and user_id=p_user_id) then raise exception 'reading attention owner required' using errcode='42501'; end if;
end $$;
create function public.reading_attention_dto(r public.reading_attention_entries) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'revision',r.revision::text,'event_id',r.event_id,'version_id',r.version_id,'kind',r.kind,'payload',case when r.kind='register' then r.payload-'privateTitle' when r.kind='blind_start' then r.payload-'privateTitle' else r.payload end,'created_at',r.created_at)
$$;
create function public.save_reading_attention(p_user_id uuid,p_event_id uuid,p_kind text,p_version_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reading_attention_entries; prior reading_attention_requests; latest reading_attention_entries; target reading_attention_entries; snap signal_source_snapshots; n integer; rule integer; body jsonb; request jsonb;
begin
 perform reading_attention_owner(p_user_id,p_event_id);
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid reading attention input'; end if;
 -- User lock protects request identities across events; event lock serializes ordinals and state transitions.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,115));
 perform 1 from signal_events where id=p_event_id and user_id=p_user_id for update;
 request:=jsonb_build_object('eventId',p_event_id,'kind',p_kind,'versionId',p_version_id,'payload',p_payload);
 select * into prior from reading_attention_requests where user_id=p_user_id and request_id=p_request_id;
 if found then
  if prior.input<>request then raise exception 'request payload conflict'; end if;
  select * into r from reading_attention_entries where id=prior.entry_id; return reading_attention_dto(r);
 end if;
 select * into latest from reading_attention_entries where event_id=p_event_id and user_id=p_user_id and kind in ('contract','contract_exit') order by revision desc limit 1;
 body:=p_payload;
 if p_kind in ('contract','contract_exit') then
  if p_version_id is distinct from latest.id then raise exception 'contract changed; reload'; end if;
  if p_kind='contract' then
   if not (p_payload ?& array['triggers','counterevidence','everyNth']) or (p_payload-array['triggers','counterevidence','everyNth'])<>'{}'::jsonb or jsonb_typeof(p_payload->'triggers')<>'string' or jsonb_typeof(p_payload->'counterevidence')<>'string' or length(btrim(p_payload->>'triggers')) not between 1 and 4000 or length(btrim(p_payload->>'counterevidence')) not between 1 and 4000 or coalesce(p_payload->>'everyNth','')!~'^[0-9]{1,4}$' or (p_payload->>'everyNth')::integer not between 1 and 1000 then raise exception 'invalid contract'; end if;
  elsif p_payload<>'{}'::jsonb or latest.kind is distinct from 'contract' then raise exception 'no active contract'; end if;
 elsif p_kind='register' then
  if latest.kind is distinct from 'contract' or p_version_id is distinct from latest.id then raise exception 'contract changed; reload'; end if;
  if not(p_payload ?& array['snapshotId','choice']) or (p_payload-array['snapshotId','choice','contractMatch','matchReason'])<>'{}'::jsonb or coalesce(p_payload->>'choice','') not in ('seen','open','skip','pending') then raise exception 'explicit user choice required'; end if;
  if coalesce(p_payload->>'contractMatch','unknown') not in ('matched','not_matched','unknown') or (p_payload ? 'matchReason' and (jsonb_typeof(p_payload->'matchReason')<>'string' or length(p_payload->>'matchReason')>4000)) then raise exception 'invalid manual match'; end if;
  select * into snap from signal_source_snapshots s where s.id=(p_payload->>'snapshotId')::uuid and s.user_id=p_user_id and exists(select 1 from signal_event_memberships m where m.user_id=p_user_id and m.event_id=p_event_id and m.snapshot_id=s.id and m.action='include');
  if not found then raise exception 'source unavailable' using errcode='42501'; end if;
  select * into r from reading_attention_entries where event_id=p_event_id and version_id=p_version_id and kind='register' and payload->>'snapshotId'=snap.id::text;
  if found then insert into reading_attention_requests values(p_user_id,p_request_id,request,r.id); return reading_attention_dto(r); end if;
  select count(*)::integer+1 into n from reading_attention_entries where version_id=p_version_id and kind='register'; rule:=(latest.payload->>'everyNth')::integer;
  body:=jsonb_build_object('contractMatch','unknown')||p_payload||jsonb_build_object('ordinal',n,'sampled',(n-1)%rule=0,'rule',latest.payload,'snapshot',jsonb_build_object('snapshotId',snap.id,'body',snap.captured_text,'sourceUrl',snap.source_url,'capturedAt',snap.captured_at,'captureScope',snap.capture_scope),'privateTitle',snap.title);
 elsif p_kind in ('review','blind_start') then
  if not(p_payload ? 'registrationId') or (p_payload - case when p_kind='review' then array['registrationId','note'] else array['registrationId'] end)<>'{}'::jsonb then raise exception 'invalid registration reference'; end if;
  select * into target from reading_attention_entries where id=(p_payload->>'registrationId')::uuid and user_id=p_user_id and event_id=p_event_id and kind='register';
  if not found then raise exception 'registration unavailable' using errcode='42501'; end if;
  p_version_id:=target.version_id;
  if p_kind='review' then
   if jsonb_typeof(p_payload->'note') is distinct from 'string' or length(btrim(p_payload->>'note')) not between 1 and 4000 then raise exception 'review note required'; end if;
  else
   select * into r from reading_attention_entries where event_id=p_event_id and kind='blind_start' and payload->>'registrationId'=target.id::text;
   if found then insert into reading_attention_requests values(p_user_id,p_request_id,request,r.id); return reading_attention_dto(r); end if;
   if target.payload->>'sampled'<>'true' then raise exception 'blind reading requires fixed sample'; end if;
   body:=jsonb_build_object('registrationId',target.id,'body',target.payload->'snapshot'->'body','sourceUrl',target.payload->'snapshot'->'sourceUrl','privateTitle',target.payload->'privateTitle');
  end if;
 elsif p_kind in ('blind_judge','blind_reveal','blind_exit') then
  if not(p_payload ? 'sessionId') or (p_payload - case when p_kind='blind_judge' then array['sessionId','judgment'] else array['sessionId'] end)<>'{}'::jsonb then raise exception 'invalid session reference'; end if;
  select * into target from reading_attention_entries where id=(p_payload->>'sessionId')::uuid and user_id=p_user_id and event_id=p_event_id and kind='blind_start';
  if not found then raise exception 'blind session unavailable' using errcode='42501'; end if;
  p_version_id:=target.version_id;
  if exists(select 1 from reading_attention_entries where event_id=p_event_id and kind in ('blind_reveal','blind_exit') and payload->>'sessionId'=target.id::text) then raise exception 'blind session closed'; end if;
  if p_kind='blind_judge' then
   if jsonb_typeof(p_payload->'judgment') is distinct from 'string' or length(btrim(p_payload->>'judgment')) not between 1 and 4000 then raise exception 'judgment required'; end if;
   if exists(select 1 from reading_attention_entries where event_id=p_event_id and kind='blind_judge' and payload->>'sessionId'=target.id::text) then raise exception 'judgment already frozen'; end if;
  else
   if p_kind='blind_reveal' and not exists(select 1 from reading_attention_entries where event_id=p_event_id and kind='blind_judge' and payload->>'sessionId'=target.id::text) then raise exception 'judgment required before reveal'; end if;
   body:=p_payload||jsonb_build_object('title',target.payload->'privateTitle','body',target.payload->'body','sourceUrl',target.payload->'sourceUrl');
  end if;
 else raise exception 'invalid attention kind'; end if;
 insert into reading_attention_entries(user_id,event_id,kind,version_id,payload) values(p_user_id,p_event_id,p_kind,p_version_id,body) returning * into r;
 insert into reading_attention_requests values(p_user_id,p_request_id,request,r.id);
 return reading_attention_dto(r);
end $$;
create function public.page_reading_attention(p_user_id uuid,p_event_id uuid,p_after bigint default null,p_samples_only boolean default false,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb; cursor text;
begin
 perform reading_attention_owner(p_user_id,p_event_id);
 if p_limit is null or p_limit not between 1 and 100 or (p_after is not null and p_after<1) then raise exception 'invalid attention page'; end if;
 select coalesce(jsonb_agg(reading_attention_dto(t) order by t.revision),'[]'::jsonb),max(t.revision)::text into rows,cursor from (select * from reading_attention_entries where user_id=p_user_id and event_id=p_event_id and (p_after is null or revision>p_after) and (not p_samples_only or (kind='register' and payload->>'sampled'='true')) order by revision limit p_limit) t;
 return jsonb_build_object('available',true,'entries',rows,'nextCursor',case when jsonb_array_length(rows)=p_limit then cursor else null end);
end $$;
revoke all on function public.reading_attention_owner(uuid,uuid),public.reading_attention_dto(public.reading_attention_entries),public.save_reading_attention(uuid,uuid,text,uuid,jsonb,uuid),public.page_reading_attention(uuid,uuid,bigint,boolean,integer) from public,anon,authenticated;
grant execute on function public.save_reading_attention(uuid,uuid,text,uuid,jsonb,uuid),public.page_reading_attention(uuid,uuid,bigint,boolean,integer) to service_role;


commit;



-- ============================================================================
-- Synced migration: 116_statistical_denominators.sql
-- ============================================================================
begin;
create table public.statistical_source_configs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 table_id text not null check(table_id='0004006264'),filters jsonb not null,metadata jsonb not null,metadata_hash text not null,
 preview_hash text not null,approval_state text not null check(approval_state in ('approved','needs_review','deleted')),
 approved_at timestamptz not null default clock_timestamp(),deleted_at timestamptz,unique(user_id,id)
);
create table public.statistical_snapshots (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,config_id uuid not null,payload jsonb not null,
 metadata_hash text not null,request_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,config_id) references public.statistical_source_configs(user_id,id) on delete cascade,
 unique(user_id,request_id)
);
create table public.statistical_idea_links (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,config_id uuid not null,
 idea_id uuid references public.ideas(id) on delete set null,scope text,unknown_note text,created_at timestamptz not null default clock_timestamp(),deleted_at timestamptz,
 foreign key(user_id,config_id) references public.statistical_source_configs(user_id,id) on delete cascade
);
create table public.statistical_requests(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,operation text not null,input_hash text not null,result_id uuid not null,approval_semantic_hash text check(approval_semantic_hash is null or approval_semantic_hash ~ '^[a-f0-9]{64}$'),primary key(user_id,request_id));
create index statistical_source_page on public.statistical_source_configs(user_id,approved_at desc,id desc);
create index statistical_snapshot_page on public.statistical_snapshots(user_id,config_id,created_at desc);
alter table public.statistical_source_configs enable row level security;alter table public.statistical_snapshots enable row level security;alter table public.statistical_idea_links enable row level security;alter table public.statistical_requests enable row level security;
-- Private owner data is exposed only by service-guarded RPCs, never direct client writes.
revoke all on public.statistical_source_configs,public.statistical_snapshots,public.statistical_idea_links,public.statistical_requests from public,anon,authenticated,service_role;
create function public.statistics_owner(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin if p_user_id is null or coalesce(auth.role(),'')<>'service_role' or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'statistics owner required' using errcode='42501';end if;end $$;
create function public.statistics_input_hash(p_value jsonb) returns text language sql immutable set search_path=public,pg_temp as $$select encode(sha256(convert_to(p_value::text,'UTF8')),'hex')$$;
create function public.statistics_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin if tg_op='DELETE' and current_setting('app.statistics_privacy_delete',true)='yes' then return old;end if;raise exception 'statistical revision is immutable';end $$;
create trigger statistical_snapshot_immutable before update or delete on public.statistical_snapshots for each row execute function public.statistics_immutable();
create function public.get_statistical_request(p_user_id uuid,p_request_id uuid,p_operation text,p_config_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r statistical_requests;begin perform statistics_owner(p_user_id);select * into r from statistical_requests where user_id=p_user_id and request_id=p_request_id;if not found then return null;end if;if r.operation<>p_operation or (p_config_id is not null and not exists(select 1 from statistical_snapshots where id=r.result_id and user_id=p_user_id and config_id=p_config_id)) then raise exception 'request payload conflict';end if;return jsonb_build_object('id',r.result_id);end $$;
-- A committed approval can be acknowledged before another network attempt. Its semantic
-- digest survives privacy deletion without retaining filters or private association text.
create function public.get_statistical_approval_request(p_user_id uuid,p_request_id uuid,p_filters jsonb,p_metadata_hash text,p_preview_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r statistical_requests;h text;begin
 perform statistics_owner(p_user_id);if p_request_id is null or p_filters is null or jsonb_typeof(p_filters)<>'object' or coalesce(p_metadata_hash,'')!~'^[a-f0-9]{64}$' or coalesce(p_preview_hash,'')!~'^[a-f0-9]{64}$' then raise exception 'invalid approval request identity';end if;
 select * into r from statistical_requests where user_id=p_user_id and request_id=p_request_id;if not found then return null;end if;
 h:=statistics_input_hash(jsonb_build_object('filters',p_filters,'metadataHash',p_metadata_hash,'previewHash',p_preview_hash));
 if r.operation<>'approve' or r.approval_semantic_hash is distinct from h then raise exception 'request payload conflict';end if;
 return jsonb_build_object('id',r.result_id);end $$;
create function public.persist_statistical_snapshot_internal(p_user_id uuid,p_config_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;r statistical_requests;s statistical_snapshots;h text;begin
 perform statistics_owner(p_user_id);select * into c from statistical_source_configs where id=p_config_id and user_id=p_user_id for update;if not found then raise exception 'statistics source owner required' using errcode='42501';end if;
 if c.approval_state<>'approved' then raise exception 'statistical source not approved';end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2000000 then raise exception 'invalid statistical payload';end if;
 if p_payload->>'tableId' is distinct from c.table_id or p_payload->>'metadataHash' is distinct from c.metadata_hash or p_payload->'filters' is distinct from c.filters or p_payload->>'sourceType' is distinct from 'live' or jsonb_typeof(p_payload->'cells') is distinct from 'array' or jsonb_array_length(p_payload->'cells')>1 then raise exception 'source configuration mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,116));h:=statistics_input_hash(jsonb_build_object('configId',p_config_id,'payload',p_payload));select * into r from statistical_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if r.operation<>'snapshot' or r.input_hash<>h then raise exception 'request payload conflict';end if;return jsonb_build_object('id',r.result_id);end if;
 insert into statistical_snapshots(user_id,config_id,payload,metadata_hash,request_id) values(p_user_id,p_config_id,p_payload,c.metadata_hash,p_request_id) returning * into s;
 insert into statistical_requests(user_id,request_id,operation,input_hash,result_id) values(p_user_id,p_request_id,'snapshot',h,s.id);return jsonb_build_object('id',s.id);end $$;
create function public.approve_statistical_source(p_user_id uuid,p_filters jsonb,p_metadata jsonb,p_payload jsonb,p_preview_hash text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;r statistical_requests;h text;d jsonb;begin
 perform statistics_owner(p_user_id);if p_request_id is null or p_filters is null or jsonb_typeof(p_filters)<>'object' or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid approved statistical source';end if;
 if p_metadata->>'tableId' is distinct from '0004006264' or p_payload->>'tableId' is distinct from '0004006264' or coalesce(p_metadata->>'metadataHash','')!~'^[a-f0-9]{64}$' or p_payload->>'metadataHash' is distinct from p_metadata->>'metadataHash' or p_payload->'filters' is distinct from p_filters or p_payload->>'sourceType' is distinct from 'live' or coalesce(p_preview_hash,'')!~'^[a-f0-9]{64}$' or jsonb_typeof(p_metadata->'dimensions') is distinct from 'array' or jsonb_array_length(p_metadata->'dimensions')<>6 or (select count(*) from jsonb_object_keys(p_filters))<>6 or octet_length(p_metadata::text)>1000000 or octet_length(p_payload::text)>2000000 then raise exception 'invalid approved statistical source';end if;
 for d in select value from jsonb_array_elements(p_metadata->'dimensions') loop if not(p_filters ? (d->>'id')) or jsonb_typeof(p_filters->(d->>'id')) is distinct from 'string' or not exists(select 1 from jsonb_array_elements(d->'categories') k where k->>'code'=p_filters->>(d->>'id')) then raise exception 'unknown statistical category';end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,116));h:=statistics_input_hash(jsonb_build_object('filters',p_filters,'metadataHash',p_metadata->>'metadataHash','previewHash',p_preview_hash,'cells',p_payload->'cells','scope',p_payload->'scope'));select * into r from statistical_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if r.operation<>'approve' or r.input_hash<>h then raise exception 'request payload conflict';end if;return jsonb_build_object('id',r.result_id);end if;
 insert into statistical_source_configs(user_id,table_id,filters,metadata,metadata_hash,preview_hash,approval_state) values(p_user_id,'0004006264',p_filters,p_metadata,p_metadata->>'metadataHash',p_preview_hash,'approved') returning * into c;
 insert into statistical_snapshots(user_id,config_id,payload,metadata_hash,request_id) values(p_user_id,c.id,p_payload,c.metadata_hash,p_request_id);
 insert into statistical_requests(user_id,request_id,operation,input_hash,result_id,approval_semantic_hash) values(p_user_id,p_request_id,'approve',h,c.id,statistics_input_hash(jsonb_build_object('filters',p_filters,'metadataHash',p_metadata->>'metadataHash','previewHash',p_preview_hash)));return jsonb_build_object('id',c.id);end $$;
create function public.load_approved_statistical_source(p_user_id uuid,p_config_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;begin perform statistics_owner(p_user_id);select * into c from statistical_source_configs where id=p_config_id and user_id=p_user_id;if not found then raise exception 'statistics source owner required' using errcode='42501';end if;if c.approval_state<>'approved' then raise exception 'statistical source not approved';end if;return to_jsonb(c);end $$;
create function public.invalidate_statistical_config(p_user_id uuid,p_config_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;begin perform statistics_owner(p_user_id);select * into c from statistical_source_configs where id=p_config_id and user_id=p_user_id for update;if not found then raise exception 'statistics source owner required' using errcode='42501';end if;if c.approval_state='approved' then update statistical_source_configs set approval_state='needs_review' where id=c.id;end if;return jsonb_build_object('id',c.id);end $$;
create function public.link_statistical_idea(p_user_id uuid,p_config_id uuid,p_idea_id uuid,p_scope text,p_unknown text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;r statistical_requests;h text;result_id uuid;begin
 perform statistics_owner(p_user_id);select * into c from statistical_source_configs where id=p_config_id and user_id=p_user_id for update;if not found or c.approval_state='deleted' or not exists(select 1 from ideas where id=p_idea_id and user_id=p_user_id) then raise exception 'statistics or idea owner required' using errcode='42501';end if;
 if p_request_id is null or p_scope is null or p_unknown is null or length(btrim(p_scope)) not between 1 and 2000 or length(btrim(p_unknown)) not between 1 and 2000 then raise exception 'scope and unknown required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,116));h:=statistics_input_hash(jsonb_build_object('configId',p_config_id,'ideaId',p_idea_id,'scope',p_scope,'unknown',p_unknown));select * into r from statistical_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if r.operation<>'link' or r.input_hash<>h then raise exception 'request payload conflict';end if;return jsonb_build_object('id',r.result_id);end if;
 insert into statistical_idea_links(user_id,config_id,idea_id,scope,unknown_note) values(p_user_id,p_config_id,p_idea_id,btrim(p_scope),btrim(p_unknown)) returning id into result_id;insert into statistical_requests(user_id,request_id,operation,input_hash,result_id) values(p_user_id,p_request_id,'link',h,result_id);return jsonb_build_object('id',result_id);end $$;
create function public.delete_statistical_source(p_user_id uuid,p_config_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;r statistical_requests;h text;begin
 perform statistics_owner(p_user_id);select * into c from statistical_source_configs where id=p_config_id and user_id=p_user_id for update;if not found then raise exception 'statistics source owner required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'request identity required';end if;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,116));h:=statistics_input_hash(jsonb_build_object('configId',p_config_id));select * into r from statistical_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if r.operation<>'delete' or r.input_hash<>h then raise exception 'request payload conflict';end if;return jsonb_build_object('id',r.result_id);end if;
 perform set_config('app.statistics_privacy_delete','yes',true);delete from statistical_snapshots where user_id=p_user_id and config_id=p_config_id;perform set_config('app.statistics_privacy_delete','no',true);
 update statistical_idea_links set idea_id=null,scope=null,unknown_note=null,deleted_at=coalesce(deleted_at,clock_timestamp()) where user_id=p_user_id and config_id=p_config_id;
 update statistical_source_configs set approval_state='deleted',filters='{}',metadata='{}',metadata_hash='',preview_hash='',deleted_at=coalesce(deleted_at,clock_timestamp()) where id=p_config_id;
 insert into statistical_requests(user_id,request_id,operation,input_hash,result_id) values(p_user_id,p_request_id,'delete',h,p_config_id);return jsonb_build_object('id',p_config_id);end $$;
create function public.load_statistical_snapshot(p_user_id uuid,p_snapshot_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s statistical_snapshots;begin perform statistics_owner(p_user_id);select * into s from statistical_snapshots where id=p_snapshot_id and user_id=p_user_id;if not found then raise exception 'statistics snapshot owner required' using errcode='42501';end if;return to_jsonb(s);end $$;
revoke all on function public.load_statistical_snapshot(uuid,uuid) from public,anon,authenticated;grant execute on function public.load_statistical_snapshot(uuid,uuid) to service_role;
create function public.page_statistical_sources(p_user_id uuid,p_before uuid default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb;ids uuid[];next_id uuid;begin perform statistics_owner(p_user_id);if p_limit not between 1 and 30 then raise exception 'invalid page limit';end if;
 if p_before is not null and not exists(select 1 from statistical_source_configs where id=p_before and user_id=p_user_id) then raise exception 'statistics cursor owner required' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by approved_at desc,id desc),'[]'),array_agg(id order by approved_at desc,id desc) into rows,ids from (select * from statistical_source_configs c where user_id=p_user_id and (p_before is null or (approved_at,id)<(select approved_at,id from statistical_source_configs where id=p_before and user_id=p_user_id)) order by approved_at desc,id desc limit p_limit)c;
 if array_length(ids,1)=p_limit then next_id:=ids[p_limit];end if;
 return jsonb_build_object('status','ready','configs',rows,'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id desc) from (select * from statistical_snapshots where user_id=p_user_id and config_id=any(ids) order by created_at desc,id desc limit 300)s),'[]'),'links',coalesce((select jsonb_agg((to_jsonb(l)-'unknown_note')||jsonb_build_object('unknown',unknown_note) order by created_at desc,id desc) from (select * from statistical_idea_links where user_id=p_user_id and config_id=any(ids) order by created_at desc,id desc limit 300)l),'[]'),'nextCursor',next_id);end $$;
revoke all on function public.statistics_owner(uuid),public.statistics_input_hash(jsonb),public.statistics_immutable(),public.get_statistical_request(uuid,uuid,text,uuid),public.get_statistical_approval_request(uuid,uuid,jsonb,text,text),public.persist_statistical_snapshot_internal(uuid,uuid,jsonb,uuid),public.approve_statistical_source(uuid,jsonb,jsonb,jsonb,text,uuid),public.load_approved_statistical_source(uuid,uuid),public.invalidate_statistical_config(uuid,uuid),public.link_statistical_idea(uuid,uuid,uuid,text,text,uuid),public.delete_statistical_source(uuid,uuid,uuid),public.page_statistical_sources(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_statistical_request(uuid,uuid,text,uuid),public.get_statistical_approval_request(uuid,uuid,jsonb,text,text),public.persist_statistical_snapshot_internal(uuid,uuid,jsonb,uuid),public.approve_statistical_source(uuid,jsonb,jsonb,jsonb,text,uuid),public.load_approved_statistical_source(uuid,uuid),public.invalidate_statistical_config(uuid,uuid),public.link_statistical_idea(uuid,uuid,uuid,text,text,uuid),public.delete_statistical_source(uuid,uuid,uuid),public.page_statistical_sources(uuid,uuid,integer) to service_role;
commit;


-- ============================================================================
-- Synced migration: 117_product_events.sql
-- ============================================================================
begin;
-- Voluntary server-to-server prototype events; default-off application entrypoints.
create table public.product_event_sources(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),prototype_url text,notice_url text,notice_version text,event_kinds text[],
 retention_days integer not null check(retention_days between 1 and 30),active boolean not null default false,confirmed_at timestamptz,deleted_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(id,user_id)
);
create table public.product_event_tokens(token_hash text primary key check(token_hash~'^[a-f0-9]{64}$'),source_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,issued_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,foreign key(source_id,user_id) references public.product_event_sources(id,user_id) on delete cascade);
create unique index product_event_one_active_token on public.product_event_tokens(source_id) where revoked_at is null;
create table public.product_events(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,source_id uuid not null,revision bigint generated always as identity check(revision<=9007199254740991),
 external_id uuid,subject_hash text check(subject_hash is null or subject_hash~'^[a-f0-9]{64}$'),kind text,attributes jsonb,occurred_at timestamptz,captured_at timestamptz default clock_timestamp(),payload_digest text,deleted_at timestamptz,
 foreign key(source_id,user_id) references public.product_event_sources(id,user_id) on delete cascade,unique(id,user_id),unique(source_id,external_id),
 check((deleted_at is null and external_id is not null and kind in ('query','no_result','task_completed','return_visit','inquiry','payment') and attributes is not null and occurred_at is not null and captured_at is not null and payload_digest is not null) or (deleted_at is not null and external_id is null and subject_hash is null and kind is null and attributes is null and occurred_at is null and captured_at is null and payload_digest is null))
);
create index product_event_history on public.product_events(user_id,revision);
create index product_event_rate_window on public.product_events(source_id,captured_at) where deleted_at is null;
create table public.product_event_links(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,event_id uuid not null,idea_id uuid not null references public.ideas(id) on delete cascade,scope text,unknown text,created_at timestamptz not null default clock_timestamp(),foreign key(event_id,user_id) references public.product_events(id,user_id) on delete cascade,unique(event_id,idea_id)
);
create table public.product_event_receipts(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,removed_count integer not null check(removed_count>=0),reason text not null check(reason in ('retention','source_deleted')),created_at timestamptz not null default clock_timestamp());
create table public.product_event_requests(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,digest text not null,source_id uuid,link_id uuid,receipt_id uuid,primary key(user_id,request_id));
alter table public.product_event_sources enable row level security;alter table public.product_event_tokens enable row level security;alter table public.product_events enable row level security;alter table public.product_event_links enable row level security;alter table public.product_event_receipts enable row level security;alter table public.product_event_requests enable row level security;
create policy product_source_owner on public.product_event_sources for select to authenticated using(auth.uid()=user_id);
create policy product_event_owner on public.product_events for select to authenticated using(auth.uid()=user_id and (deleted_at is not null or captured_at>clock_timestamp()-make_interval(days=>(select s.retention_days from public.product_event_sources s where s.id=source_id and s.user_id=auth.uid()))));
create policy product_link_owner on public.product_event_links for select to authenticated using(auth.uid()=user_id and exists(select 1 from public.product_events e where e.id=event_id));
create policy product_receipt_owner on public.product_event_receipts for select to authenticated using(auth.uid()=user_id);
revoke all on public.product_event_sources,public.product_event_tokens,public.product_events,public.product_event_links,public.product_event_receipts,public.product_event_requests from public,anon,authenticated,service_role;
grant select on public.product_event_sources,public.product_events,public.product_event_links,public.product_event_receipts to authenticated,service_role;
create function public.product_event_service() returns void language plpgsql stable security definer set search_path=public,pg_temp as $$begin if coalesce(auth.role(),'')<>'service_role' then raise exception 'product event service required' using errcode='42501';end if;end $$;
create function public.product_event_owner(p_user_id uuid) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$begin perform public.product_event_service();if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'owner required' using errcode='42501';end if;end $$;
create function public.preserve_product_event_history() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old;end if;
 if tg_table_name='product_events' then
  if tg_op='UPDATE' and old.deleted_at is null and new.deleted_at is not null and new.external_id is null and new.subject_hash is null and new.kind is null and new.attributes is null and new.occurred_at is null and new.captured_at is null and new.payload_digest is null and (to_jsonb(new)-array['external_id','subject_hash','kind','attributes','occurred_at','captured_at','payload_digest','deleted_at'])=(to_jsonb(old)-array['external_id','subject_hash','kind','attributes','occurred_at','captured_at','payload_digest','deleted_at']) then return new;end if;
 elsif tg_table_name='product_event_links' then
  if tg_op='UPDATE' and new.scope is null and new.unknown is null and (to_jsonb(new)-array['scope','unknown'])=(to_jsonb(old)-array['scope','unknown']) then return new;end if;
  if tg_op='DELETE' and not exists(select 1 from public.ideas where id=old.idea_id) then return old;end if;
 end if;
 raise exception 'product event history immutable except privacy erasure';
end $$;
create trigger product_event_immutable before update or delete on public.product_events for each row execute function public.preserve_product_event_history();
create trigger product_link_immutable before update or delete on public.product_event_links for each row execute function public.preserve_product_event_history();
create trigger product_receipt_immutable before update or delete on public.product_event_receipts for each row execute function public.preserve_product_event_history();
create trigger product_request_immutable before update or delete on public.product_event_requests for each row execute function public.preserve_product_event_history();
create function public.erase_product_event_rows(p_user_id uuid,p_source_id uuid,p_expired_only boolean,p_limit integer) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected uuid[];removed integer;
begin
 select array_agg(id) into affected from (select e.id from public.product_events e join public.product_event_sources s on s.id=e.source_id where e.user_id=p_user_id and (p_source_id is null or e.source_id=p_source_id) and e.deleted_at is null and (not p_expired_only or e.captured_at<=clock_timestamp()-make_interval(days=>s.retention_days)) order by e.revision limit p_limit) q;
 removed:=coalesce(array_length(affected,1),0);if removed=0 then return 0;end if;
 update public.product_event_links set scope=null,unknown=null where user_id=p_user_id and event_id=any(affected);
 update public.product_events set external_id=null,subject_hash=null,kind=null,attributes=null,occurred_at=null,captured_at=null,payload_digest=null,deleted_at=clock_timestamp() where user_id=p_user_id and id=any(affected);
 return removed;
end $$;
create function public.validate_product_event(p jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare a jsonb;k text;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>8192 or exists(select 1 from jsonb_object_keys(p) key where key not in ('externalId','kind','occurredAt','noticeVersion','attributes','subjectHash')) then raise exception 'unsupported product event body';end if;
 if p->>'externalId' is null or p->>'externalId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or p->>'occurredAt' is null or p->>'occurredAt'!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' or p->>'noticeVersion' is null or p->>'noticeVersion'!~'^[A-Za-z0-9._-]{1,32}$' then raise exception 'invalid event identity or time';end if;
 perform (p->>'occurredAt')::timestamptz;
 if p?'subjectHash' and (jsonb_typeof(p->'subjectHash')<>'string' or p->>'subjectHash'!~'^[a-f0-9]{64}$') then raise exception 'anonymous one-way subject hash required';end if;
 a:=p->'attributes';k:=p->>'kind';if jsonb_typeof(a) is distinct from 'object' then raise exception 'invalid event attributes';end if;
 case k
 when 'query' then if (select count(*) from jsonb_object_keys(a))<>1 or jsonb_typeof(a->'resultCount') is distinct from 'number' or a->>'resultCount'!~'^\d+$' or (a->>'resultCount')::numeric not between 0 and 1000000 then raise exception 'invalid query attributes';end if;
 when 'no_result' then if a<>'{}'::jsonb then raise exception 'invalid no_result attributes';end if;
 when 'task_completed' then if (select count(*) from jsonb_object_keys(a))<>1 or a->>'durationBucket' is null or a->>'durationBucket' not in ('under_minute','one_to_five_minutes','over_five_minutes','unknown') then raise exception 'invalid task attributes';end if;
 when 'return_visit' then if (select count(*) from jsonb_object_keys(a))<>1 or a->>'interval' is null or a->>'interval' not in ('day','week','month','unknown') then raise exception 'invalid return attributes';end if;
 when 'inquiry' then if (select count(*) from jsonb_object_keys(a))<>1 or a->>'channel' is null or a->>'channel' not in ('form','email','other') then raise exception 'invalid inquiry attributes';end if;
 when 'payment' then if exists(select 1 from jsonb_object_keys(a) key where key not in ('amountMinor','currency','kind')) or jsonb_typeof(a->'amountMinor') is distinct from 'number' or a->>'amountMinor'!~'^\d+$' or (a->>'amountMinor')::numeric not between 0 and 1000000000 or a->>'currency' is null or a->>'currency' not in ('JPY','USD','EUR') or a->>'kind' is null or a->>'kind' not in ('one_time','recurring') then raise exception 'invalid payment attributes';end if;
 else raise exception 'event kind not allowed';end case;
end $$;
create function public.mutate_product_event_source(p_user_id uuid,p jsonb,p_token_hash text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.product_event_requests;s public.product_event_sources;c jsonb;action text;digest text;removed integer:=0;receipt public.product_event_receipts;token_issued boolean:=false;k text;
begin
 perform public.product_event_owner(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,117));
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>12000 or p->>'requestId' is null or exists(select 1 from jsonb_object_keys(p) key where key not in ('action','requestId','sourceId','expectedRevision','config','confirmPrototype')) then raise exception 'unsupported source command';end if;
 digest:=encode(sha256(convert_to(p::text,'UTF8')),'hex');select * into prior from public.product_event_requests where user_id=p_user_id and request_id=(p->>'requestId')::uuid;
 if found then if prior.digest<>digest then raise exception 'request conflict' using errcode='23505';end if;select * into s from public.product_event_sources where id=prior.source_id and user_id=p_user_id;select * into receipt from public.product_event_receipts where id=prior.receipt_id and user_id=p_user_id;return jsonb_build_object('source',case when s.id is null then null else to_jsonb(s)-'user_id' end,'receipt',case when receipt.id is null then null else to_jsonb(receipt)-'user_id' end,'tokenIssued',false,'replayed',true);end if;
 action:=p->>'action';
 if action='create' then
  if p?'sourceId' or p?'expectedRevision' or p?'confirmPrototype' then raise exception 'create draft first';end if;
  c:=p->'config';if jsonb_typeof(c) is distinct from 'object' or exists(select 1 from jsonb_object_keys(c) key where key not in ('prototypeUrl','noticeUrl','noticeVersion','eventKinds','retentionDays')) then raise exception 'invalid source config';end if;
  foreach k in array array['prototypeUrl','noticeUrl'] loop if jsonb_typeof(c->k) is distinct from 'string' or length(c->>k)>2048 or (c->>k)!~*'^https://([a-z0-9-]+\.)+[a-z]{2,}(/[^?#[:space:]]*)?$' then raise exception 'HTTPS prototype and notice URL required';end if;end loop;
  if c->>'noticeVersion' is null or c->>'noticeVersion'!~'^[A-Za-z0-9._-]{1,32}$' or jsonb_typeof(c->'eventKinds') is distinct from 'array' or jsonb_array_length(c->'eventKinds') not between 1 and 6 or exists(select 1 from jsonb_array_elements_text(c->'eventKinds') v where v not in ('query','no_result','task_completed','return_visit','inquiry','payment')) or (select count(distinct v) from jsonb_array_elements_text(c->'eventKinds') v)<>jsonb_array_length(c->'eventKinds') or jsonb_typeof(c->'retentionDays') is distinct from 'number' or c->>'retentionDays'!~'^\d+$' or (c->>'retentionDays')::numeric not between 1 and 30 then raise exception 'invalid event definitions or retention cap';end if;
  insert into public.product_event_sources(user_id,prototype_url,notice_url,notice_version,event_kinds,retention_days) values(p_user_id,c->>'prototypeUrl',c->>'noticeUrl',c->>'noticeVersion',array(select jsonb_array_elements_text(c->'eventKinds')),(c->>'retentionDays')::int) returning * into s;
 elsif action='purge' then
  if p?'sourceId' or p?'expectedRevision' or p?'config' or p?'confirmPrototype' then raise exception 'invalid retention purge';end if;
  removed:=public.erase_product_event_rows(p_user_id,null,true,2147483647);insert into public.product_event_receipts(user_id,removed_count,reason) values(p_user_id,removed,'retention') returning * into receipt;
 elsif action in ('activate','pause','rotate','revoke','delete') then
  if p?'config' or p->>'sourceId' is null or p->>'expectedRevision' is null or p->>'expectedRevision'!~'^\d+$' then raise exception 'source and revision required';end if;
  select * into s from public.product_event_sources where id=(p->>'sourceId')::uuid and user_id=p_user_id for update;if not found then raise exception 'source owner required' using errcode='42501';end if;
  if s.deleted_at is not null then raise exception 'source deleted';end if;if s.revision<>(p->>'expectedRevision')::bigint then raise exception 'stale source revision';end if;
  if action='activate' and p->'confirmPrototype' is distinct from 'true'::jsonb then raise exception 'actual prototype and notice confirmation required';end if;
  if action<>'activate' and p?'confirmPrototype' then raise exception 'unexpected confirmation';end if;
  if action in ('activate','rotate') then
   if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'server token hash required';end if;
   if action='rotate' and (not s.active or s.confirmed_at is null) then raise exception 'activate confirmed prototype first';end if;
   update public.product_event_tokens set revoked_at=clock_timestamp() where source_id=s.id and revoked_at is null;
   insert into public.product_event_tokens(token_hash,source_id,user_id) values(p_token_hash,s.id,p_user_id);token_issued:=true;
  end if;
  if action in ('pause','revoke','delete') then update public.product_event_tokens set revoked_at=clock_timestamp() where source_id=s.id and revoked_at is null;end if;
  if action='delete' then
   removed:=public.erase_product_event_rows(p_user_id,s.id,false,2147483647);delete from public.product_event_tokens where source_id=s.id;
   insert into public.product_event_receipts(user_id,removed_count,reason) values(p_user_id,removed,'source_deleted') returning * into receipt;
   update public.product_event_sources set prototype_url=null,notice_url=null,notice_version=null,event_kinds=null,active=false,confirmed_at=null,deleted_at=clock_timestamp(),revision=revision+1 where id=s.id returning * into s;
  else update public.product_event_sources set active=case when action='activate' then true when action in ('pause','revoke') then false else active end,confirmed_at=case when action='activate' then clock_timestamp() else confirmed_at end,revision=revision+1 where id=s.id returning * into s;end if;
 else raise exception 'unsupported source action';end if;
 insert into public.product_event_requests(user_id,request_id,digest,source_id,receipt_id) values(p_user_id,(p->>'requestId')::uuid,digest,s.id,receipt.id);
 return jsonb_build_object('source',case when s.id is null then null else to_jsonb(s)-'user_id' end,'receipt',case when receipt.id is null then null else to_jsonb(receipt)-'user_id' end,'tokenIssued',token_issued,'replayed',false);
end $$;
create function public.ingest_product_event(p_token_hash text,p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid;s public.product_event_sources;e public.product_events;digest text;removed integer;
begin
 perform public.product_event_service();perform public.validate_product_event(p);
 select user_id into owner_id from public.product_event_tokens where token_hash=p_token_hash and revoked_at is null;if not found then raise exception 'prototype token unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,117));
 select src.* into s from public.product_event_sources src join public.product_event_tokens t on t.source_id=src.id and t.user_id=src.user_id where t.token_hash=p_token_hash and t.revoked_at is null and src.active and src.confirmed_at is not null and src.deleted_at is null for update of src;
 if not found then raise exception 'prototype not active or token revoked' using errcode='42501';end if;
 if p->>'noticeVersion'<>s.notice_version then raise exception 'notice version mismatch';end if;if not (p->>'kind')=any(s.event_kinds) then raise exception 'event kind outside confirmed definitions';end if;
 if (p->>'occurredAt')::timestamptz>clock_timestamp() or (p->>'occurredAt')::timestamptz<=clock_timestamp()-make_interval(days=>s.retention_days) then raise exception 'event time outside retention window';end if;
 digest:=encode(sha256(convert_to(p::text,'UTF8')),'hex');select * into e from public.product_events where source_id=s.id and external_id=(p->>'externalId')::uuid;
 if found then if e.payload_digest<>digest then raise exception 'external event request conflict' using errcode='23505';end if;return jsonb_build_object('id',e.id,'capturedAt',e.captured_at,'replayed',true);end if;
 if (select count(*) from public.product_events where source_id=s.id and captured_at>clock_timestamp()-interval '1 minute')>=60 or (select count(*) from public.product_events where source_id=s.id and captured_at>clock_timestamp()-interval '1 day')>=5000 then raise exception 'prototype event rate limit' using errcode='54000';end if;
 removed:=public.erase_product_event_rows(owner_id,s.id,true,500);if removed>0 then insert into public.product_event_receipts(user_id,removed_count,reason) values(owner_id,removed,'retention');end if;
 insert into public.product_events(user_id,source_id,external_id,subject_hash,kind,attributes,occurred_at,payload_digest) values(owner_id,s.id,(p->>'externalId')::uuid,p->>'subjectHash',p->>'kind',p->'attributes',(p->>'occurredAt')::timestamptz,digest) returning * into e;
 return jsonb_build_object('id',e.id,'capturedAt',e.captured_at,'replayed',false);
end $$;
create function public.link_product_event(p_user_id uuid,p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.product_event_requests;e public.product_events;l public.product_event_links;digest text;
begin
 perform public.product_event_owner(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,117));
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) key where key not in ('requestId','eventId','ideaId','scope','unknown')) or p->>'requestId' is null or p->>'eventId' is null or p->>'ideaId' is null or jsonb_typeof(p->'scope') is distinct from 'string' or length(btrim(p->>'scope')) not between 1 and 2000 or jsonb_typeof(p->'unknown') is distinct from 'string' or length(btrim(p->>'unknown')) not between 1 and 2000 then raise exception 'explicit idea scope and unknown required';end if;
 digest:=encode(sha256(convert_to(p::text,'UTF8')),'hex');select * into prior from public.product_event_requests where user_id=p_user_id and request_id=(p->>'requestId')::uuid;if found then if prior.digest<>digest then raise exception 'request conflict' using errcode='23505';end if;select * into l from public.product_event_links where id=prior.link_id and user_id=p_user_id;return to_jsonb(l)-'user_id';end if;
 select e0.* into e from public.product_events e0 join public.product_event_sources s on s.id=e0.source_id where e0.id=(p->>'eventId')::uuid and e0.user_id=p_user_id and e0.deleted_at is null and e0.captured_at>clock_timestamp()-make_interval(days=>s.retention_days);
 if not found or not exists(select 1 from public.ideas where id=(p->>'ideaId')::uuid and user_id=p_user_id) then raise exception 'event or idea owner required' using errcode='42501';end if;
 select * into l from public.product_event_links where event_id=e.id and idea_id=(p->>'ideaId')::uuid;
 if found then if l.scope is distinct from p->>'scope' or l.unknown is distinct from p->>'unknown' then raise exception 'idea link already exists with different scope' using errcode='23505';end if;
 else insert into public.product_event_links(user_id,event_id,idea_id,scope,unknown) values(p_user_id,e.id,(p->>'ideaId')::uuid,p->>'scope',p->>'unknown') returning * into l;end if;
 insert into public.product_event_requests(user_id,request_id,digest,link_id) values(p_user_id,(p->>'requestId')::uuid,digest,l.id);return to_jsonb(l)-'user_id';
end $$;
create function public.list_product_events(p_user_id uuid,p_after_revision bigint default 0,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare events jsonb;sources jsonb;links jsonb;receipts jsonb;next_revision bigint;removed integer;
begin
 perform public.product_event_owner(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,117));
 if p_after_revision is null or p_after_revision not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid product event cursor';end if;
 removed:=public.erase_product_event_rows(p_user_id,null,true,500);if removed>0 then insert into public.product_event_receipts(user_id,removed_count,reason) values(p_user_id,removed,'retention');end if;
 select coalesce(jsonb_agg(to_jsonb(s)-'user_id' order by created_at,id),'[]') into sources from public.product_event_sources s where user_id=p_user_id;
 select coalesce(jsonb_agg(to_jsonb(e)-array['user_id','external_id','subject_hash','payload_digest'] order by revision),'[]'),max(revision) into events,next_revision from (select e.* from public.product_events e join public.product_event_sources s on s.id=e.source_id where e.user_id=p_user_id and e.revision>p_after_revision and (e.deleted_at is not null or e.captured_at>clock_timestamp()-make_interval(days=>s.retention_days)) order by e.revision limit p_limit) e;
 if not exists(select 1 from public.product_events where user_id=p_user_id and revision>next_revision) then next_revision:=null;end if;
 select coalesce(jsonb_agg(case when e.deleted_at is not null or e.captured_at<=clock_timestamp()-make_interval(days=>s.retention_days) then (to_jsonb(l)-array['user_id','scope','unknown'])||jsonb_build_object('scope',null,'unknown',null,'event',(to_jsonb(e)-array['user_id','external_id','subject_hash','payload_digest','kind','attributes','occurred_at','captured_at'])||jsonb_build_object('kind',null,'attributes',null,'occurred_at',null,'captured_at',null,'deleted_at',coalesce(e.deleted_at,clock_timestamp()))) else (to_jsonb(l)-'user_id')||jsonb_build_object('event',to_jsonb(e)-array['user_id','external_id','subject_hash','payload_digest']) end order by l.created_at,l.id),'[]') into links from public.product_event_links l join public.product_events e on e.id=l.event_id join public.product_event_sources s on s.id=e.source_id where l.user_id=p_user_id;
 select coalesce(jsonb_agg(to_jsonb(r)-'user_id' order by created_at,id),'[]') into receipts from public.product_event_receipts r where user_id=p_user_id;
 return jsonb_build_object('available',true,'sources',sources,'events',events,'links',links,'receipts',receipts,'nextRevision',next_revision);
end $$;
create function public.purge_expired_product_events(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid;removed integer;total integer:=0;
begin
 perform public.product_event_service();if p_limit is null or p_limit not between 1 and 5000 then raise exception 'invalid retention batch';end if;
 for owner_id in select distinct e.user_id from public.product_events e join public.product_event_sources s on s.id=e.source_id where e.deleted_at is null and e.captured_at<=clock_timestamp()-make_interval(days=>s.retention_days) order by e.user_id loop
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,117));removed:=public.erase_product_event_rows(owner_id,null,true,p_limit-total);if removed>0 then insert into public.product_event_receipts(user_id,removed_count,reason) values(owner_id,removed,'retention');end if;total:=total+removed;exit when total>=p_limit;
 end loop;return jsonb_build_object('erased',total);
end $$;
revoke all on function public.product_event_service(),public.product_event_owner(uuid),public.preserve_product_event_history(),public.erase_product_event_rows(uuid,uuid,boolean,integer),public.validate_product_event(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.mutate_product_event_source(uuid,jsonb,text),public.ingest_product_event(text,jsonb),public.link_product_event(uuid,jsonb),public.list_product_events(uuid,bigint,integer),public.purge_expired_product_events(integer) from public,anon,authenticated;
grant execute on function public.mutate_product_event_source(uuid,jsonb,text),public.ingest_product_event(text,jsonb),public.link_product_event(uuid,jsonb),public.list_product_events(uuid,bigint,integer),public.purge_expired_product_events(integer) to service_role;
commit;



-- ============================================================================
-- Synced migration: 118_observation_scheduling.sql
-- ============================================================================
begin;
-- Budgeted manual opt-in schedules for approved immutable e-Stat configurations only.
create table public.observation_schedules (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),config_id uuid not null references public.statistical_source_configs(id),
 source_binding jsonb not null,revision bigint not null default 1,enabled boolean not null,
 interval_minutes integer not null check(interval_minutes between 60 and 43200),daily_budget integer not null check(daily_budget between 1 and 10000),max_attempts integer not null check(max_attempts between 1 and 5),
 failures integer not null default 0,health text not null default 'ready' check(health in ('ready','running','paused','blocked','failed')),
 last_error text,next_run_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(user_id,id)
);
create table public.observation_schedule_budgets (
 schedule_id uuid not null references public.observation_schedules(id),budget_day date not null,charged integer not null default 0 check(charged>=0),primary key(schedule_id,budget_day)
);
create table public.observation_schedule_runs (
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,schedule_id uuid not null references public.observation_schedules(id),user_id uuid not null references auth.users(id),config_id uuid not null,
 schedule_revision bigint not null,source_binding jsonb not null,settings jsonb not null,
 token uuid not null default gen_random_uuid(),status text not null check(status in ('running','completed','failed','cancelled','expired')),
 lease_until timestamptz not null,budget_day date not null,reserved integer not null default 2 check(reserved=2),requests_attempted integer not null default 0 check(requests_attempted between 0 and 2),
 error text,snapshot_id uuid,created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,result jsonb
);
create unique index observation_schedule_one_worker on public.observation_schedule_runs(schedule_id) where status='running';
create index observation_schedule_run_page on public.observation_schedule_runs(user_id,sequence desc);
create table public.observation_schedule_requests(user_id uuid not null references auth.users(id),request_id uuid not null,input jsonb not null,result jsonb not null,primary key(user_id,request_id));
alter table public.observation_schedules enable row level security;
alter table public.observation_schedule_budgets enable row level security;
alter table public.observation_schedule_runs enable row level security;
alter table public.observation_schedule_requests enable row level security;
revoke all on public.observation_schedules,public.observation_schedule_budgets,public.observation_schedule_runs,public.observation_schedule_requests from public,anon,authenticated,service_role;
create function public.observation_schedule_service(p_user_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin if coalesce(auth.role(),'')<>'service_role' then raise exception 'schedule service required' using errcode='42501'; end if;end $$;
create function public.observation_schedule_binding(p_user_id uuid,p_config_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;begin
 select * into c from statistical_source_configs where id=p_config_id and user_id=p_user_id for update;
 if not found or c.approval_state<>'approved' or c.deleted_at is not null or c.approved_at is null or c.table_id<>'0004006264' then raise exception 'approved source unavailable' using errcode='42501';end if;
 return jsonb_build_object('tableId',c.table_id,'filters',c.filters,'metadataHash',c.metadata_hash,'approvedAt',c.approved_at);
end $$;
create function public.observation_schedule_dto(s public.observation_schedules) returns jsonb language sql immutable as $$select to_jsonb(s)||jsonb_build_object('revision',s.revision::text)$$;
create function public.save_observation_schedule(p_user_id uuid,p_schedule_id uuid,p_expected_revision bigint,p_config jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules; prior observation_schedule_requests; r observation_schedule_runs; binding jsonb; input jsonb; v_result jsonb; v_config_id uuid;
begin
 perform observation_schedule_service();if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'schedule owner required' using errcode='42501';end if;
 if p_request_id is null or p_config is null or jsonb_typeof(p_config)<>'object' or not(p_config ?& array['configId','enabled','intervalMinutes','dailyBudget','maxAttempts']) or (p_config-array['configId','enabled','intervalMinutes','dailyBudget','maxAttempts'])<>'{}'::jsonb or jsonb_typeof(p_config->'enabled')<>'boolean' or coalesce(p_config->>'intervalMinutes','')!~'^[0-9]{1,5}$' or (p_config->>'intervalMinutes')::integer not between 60 and 43200 or coalesce(p_config->>'dailyBudget','')!~'^[0-9]{1,5}$' or (p_config->>'dailyBudget')::integer not between 1 and 10000 or coalesce(p_config->>'maxAttempts','')!~'^[1-5]$' then raise exception 'invalid schedule config';end if;
 v_config_id:=(p_config->>'configId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,118));
 input:=jsonb_build_object('scheduleId',p_schedule_id,'expectedRevision',p_expected_revision,'config',p_config);
 select * into prior from observation_schedule_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if prior.input<>input then raise exception 'request payload conflict';end if;return prior.result;end if;
 if p_schedule_id is null then
  if p_expected_revision is not null then raise exception 'unexpected schedule revision';end if;
  binding:=observation_schedule_binding(p_user_id,v_config_id);
  insert into observation_schedules(user_id,config_id,source_binding,enabled,interval_minutes,daily_budget,max_attempts,health) values(p_user_id,v_config_id,binding,(p_config->>'enabled')::boolean,(p_config->>'intervalMinutes')::integer,(p_config->>'dailyBudget')::integer,(p_config->>'maxAttempts')::integer,case when (p_config->>'enabled')::boolean then 'ready' else 'paused' end) returning * into s;
 else
  select * into s from observation_schedules where id=p_schedule_id and user_id=p_user_id for update;
  if not found then raise exception 'schedule owner required' using errcode='42501';end if;
  if p_expected_revision is distinct from s.revision then raise exception 'schedule revision changed';end if;
  -- Pausing always remains possible even when the source has been invalidated/deleted.
  if not (p_config->>'enabled')::boolean and v_config_id=s.config_id then binding:=s.source_binding;else binding:=observation_schedule_binding(p_user_id,v_config_id);end if;
  for r in select * from observation_schedule_runs where schedule_id=s.id and status='running' for update loop
   if r.lease_until<=clock_timestamp() then
    update observation_schedule_runs set status='expired',error='lease_expired_conservative_charge',finished_at=clock_timestamp() where id=r.id;
   else
    update observation_schedule_budgets set charged=charged-(r.reserved-r.requests_attempted) where schedule_id=s.id and budget_day=r.budget_day;
    update observation_schedule_runs set status='cancelled',error='schedule_changed',finished_at=clock_timestamp() where id=r.id;
   end if;
  end loop;
  update observation_schedules set config_id=v_config_id,source_binding=binding,revision=revision+1,enabled=(p_config->>'enabled')::boolean,interval_minutes=(p_config->>'intervalMinutes')::integer,daily_budget=(p_config->>'dailyBudget')::integer,max_attempts=(p_config->>'maxAttempts')::integer,failures=0,health=case when (p_config->>'enabled')::boolean then 'ready' else 'paused' end,last_error=null,next_run_at=clock_timestamp(),updated_at=clock_timestamp() where id=s.id returning * into s;
 end if;
 v_result:=observation_schedule_dto(s);insert into observation_schedule_requests values(p_user_id,p_request_id,input,v_result);return v_result;
end $$;
create function public.claim_observation_schedule(p_user_id uuid default null,p_schedule_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules;r observation_schedule_runs;b observation_schedule_budgets;binding jsonb;today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
 perform observation_schedule_service();
 if (p_user_id is null)<>(p_schedule_id is null) then raise exception 'schedule owner required' using errcode='42501';end if;
 if p_schedule_id is not null and not exists(select 1 from observation_schedules where id=p_schedule_id and user_id=p_user_id) then raise exception 'schedule owner required' using errcode='42501';end if;
 select * into s from observation_schedules where (p_schedule_id is null or (id=p_schedule_id and user_id=p_user_id)) and enabled and health<>'failed' and (next_run_at<=clock_timestamp() or exists(select 1 from observation_schedule_runs active_run where active_run.schedule_id=observation_schedules.id and active_run.status='running' and active_run.lease_until<=clock_timestamp())) order by next_run_at,id for update skip locked limit 1;
 if not found then return null;end if;
 select * into r from observation_schedule_runs where schedule_id=s.id and status='running' for update;
 if found then
  if r.lease_until>clock_timestamp() then return null;end if;
  -- Expiry keeps the entire reservation charged: a crashed worker may have sent requests.
  update observation_schedule_runs set status='expired',error='lease_expired_conservative_charge',finished_at=clock_timestamp() where id=r.id;
  update observation_schedules set failures=failures+1,health=case when failures+1>=max_attempts then 'failed' else 'ready' end,last_error='lease_expired_conservative_charge',next_run_at=clock_timestamp()+make_interval(mins=>least(60,power(2,failures)::integer)) where id=s.id;
  return null;
 end if;
 begin binding:=observation_schedule_binding(s.user_id,s.config_id);exception when sqlstate '42501' then update observation_schedules set health='blocked',last_error='source_unavailable',next_run_at=clock_timestamp()+interval '1 hour' where id=s.id;return null;end;
 if binding<>s.source_binding then update observation_schedules set health='blocked',last_error='source_changed_reconfirm',next_run_at=clock_timestamp()+interval '1 hour' where id=s.id;return null;end if;
 insert into observation_schedule_budgets values(s.id,today,0) on conflict do nothing;select * into b from observation_schedule_budgets where schedule_id=s.id and budget_day=today for update;
 if b.charged+2>s.daily_budget then update observation_schedules set health='blocked',last_error='daily_request_budget_exhausted',next_run_at=((today+1)::timestamp at time zone 'Asia/Tokyo') where id=s.id;return null;end if;
 update observation_schedule_budgets set charged=charged+2 where schedule_id=s.id and budget_day=today;
 insert into observation_schedule_runs(schedule_id,user_id,config_id,schedule_revision,source_binding,settings,status,lease_until,budget_day) values(s.id,s.user_id,s.config_id,s.revision,s.source_binding,jsonb_build_object('intervalMinutes',s.interval_minutes,'dailyBudget',s.daily_budget,'maxAttempts',s.max_attempts),'running',clock_timestamp()+interval '2 minutes',today) returning * into r;
 update observation_schedules set health='running',last_error=null,next_run_at=clock_timestamp()+make_interval(mins=>s.interval_minutes) where id=s.id;
 return to_jsonb(r)||jsonb_build_object('sequence',r.sequence::text,'schedule_revision',r.schedule_revision::text);
end $$;
create function public.begin_observation_request(p_run_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules;r observation_schedule_runs;binding jsonb;
begin
 perform observation_schedule_service();
 select * into r from observation_schedule_runs where id=p_run_id;if not found then raise exception 'worker lease unavailable' using errcode='42501';end if;
 select * into s from observation_schedules where id=r.schedule_id for update;select * into r from observation_schedule_runs where id=p_run_id for update;
 if r.token is distinct from p_token or r.status<>'running' or r.lease_until<=clock_timestamp() or not s.enabled or s.revision<>r.schedule_revision or r.budget_day<>(clock_timestamp() at time zone 'Asia/Tokyo')::date then raise exception 'worker lease expired or disabled' using errcode='42501';end if;
 binding:=observation_schedule_binding(s.user_id,s.config_id);if binding<>r.source_binding then raise exception 'source changed' using errcode='42501';end if;
 if r.requests_attempted>=r.reserved then raise exception 'request allowance exhausted';end if;
 update observation_schedule_runs set requests_attempted=requests_attempted+1 where id=r.id;
 return jsonb_build_object('authorized',true,'requestNumber',r.requests_attempted+1);
end $$;
create function public.finish_observation_run(p_run_id uuid,p_token uuid,p_success boolean,p_payload jsonb,p_error text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules;r observation_schedule_runs;binding jsonb;saved jsonb;v_result jsonb;
begin
 perform observation_schedule_service();select * into r from observation_schedule_runs where id=p_run_id;
 if not found then raise exception 'worker lease unavailable' using errcode='42501';end if;
 select * into s from observation_schedules where id=r.schedule_id for update;select * into r from observation_schedule_runs where id=p_run_id for update;
 if r.token is distinct from p_token then raise exception 'worker lease unavailable' using errcode='42501';end if;
 if r.status in ('completed','failed') then return r.result;end if;
 if r.status<>'running' or r.lease_until<=clock_timestamp() or not s.enabled or s.revision<>r.schedule_revision then raise exception 'worker lease expired or disabled' using errcode='42501';end if;
 if p_success is null then raise exception 'completion result required';end if;
 if p_success then
  binding:=observation_schedule_binding(s.user_id,s.config_id);if binding<>r.source_binding then raise exception 'source changed' using errcode='42501';end if;
  if r.requests_attempted<>2 or p_payload is null or p_payload->>'sourceType' is distinct from 'live' then raise exception 'provider request sequence incomplete';end if;
  -- This call remains in the transaction that holds schedule and approved source locks.
  saved:=persist_statistical_snapshot_internal(s.user_id,s.config_id,p_payload,r.id);
 end if;
 update observation_schedule_budgets set charged=charged-(r.reserved-r.requests_attempted) where schedule_id=s.id and budget_day=r.budget_day;
 v_result:=jsonb_build_object('runId',r.id,'status',case when p_success then 'completed' else 'failed' end,'snapshotId',saved->>'id','requestsAttempted',r.requests_attempted);
 update observation_schedule_runs set status=case when p_success then 'completed' else 'failed' end,snapshot_id=(saved->>'id')::uuid,error=case when p_success then null else left(coalesce(p_error,'provider_failed'),500) end,finished_at=clock_timestamp(),result=v_result where id=r.id;
 update observation_schedules set failures=case when p_success then 0 else failures+1 end,health=case when not p_success and failures+1>=max_attempts then 'failed' else 'ready' end,last_error=case when p_success then null else left(coalesce(p_error,'provider_failed'),500) end,next_run_at=clock_timestamp()+make_interval(mins=>case when p_success then interval_minutes else least(60,power(2,failures)::integer) end),updated_at=clock_timestamp() where id=s.id;
 return v_result;
end $$;
create function public.page_observation_scheduling(p_user_id uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare runs jsonb;cursor text;schedules jsonb;sources jsonb;budgets jsonb;
begin
 perform observation_schedule_service();if p_user_id is null then raise exception 'schedule owner required' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'invalid scheduling page';end if;
 select coalesce(jsonb_agg(observation_schedule_dto(s) order by created_at,id),'[]'::jsonb) into schedules from observation_schedules s where user_id=p_user_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'table_id',table_id,'approved_at',approved_at,'filters',filters) order by approved_at desc,id),'[]'::jsonb) into sources from statistical_source_configs where user_id=p_user_id and approval_state='approved' and deleted_at is null and table_id='0004006264';
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('sequence',r.sequence::text,'schedule_revision',r.schedule_revision::text) order by sequence desc),'[]'::jsonb),min(sequence)::text into runs,cursor from (select * from observation_schedule_runs where user_id=p_user_id and (p_before is null or sequence<p_before) order by sequence desc limit 50) r;
 select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) into budgets from observation_schedule_budgets b where schedule_id in(select id from observation_schedules where user_id=p_user_id) and budget_day=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
 return jsonb_build_object('available',true,'schedules',schedules,'sources',sources,'runs',runs,'budgets',budgets,'nextCursor',case when jsonb_array_length(runs)=50 then cursor else null end);
end $$;
revoke all on function public.observation_schedule_service(uuid),public.observation_schedule_binding(uuid,uuid),public.observation_schedule_dto(public.observation_schedules),public.save_observation_schedule(uuid,uuid,bigint,jsonb,uuid),public.claim_observation_schedule(uuid,uuid),public.begin_observation_request(uuid,uuid),public.finish_observation_run(uuid,uuid,boolean,jsonb,text),public.page_observation_scheduling(uuid,bigint) from public,anon,authenticated;
grant execute on function public.save_observation_schedule(uuid,uuid,bigint,jsonb,uuid),public.claim_observation_schedule(uuid,uuid),public.begin_observation_request(uuid,uuid),public.finish_observation_run(uuid,uuid,boolean,jsonb,text),public.page_observation_scheduling(uuid,bigint) to service_role;
commit;




-- ============================================================================
-- Synced migration: 119_business_teardown_foundation.sql
-- ============================================================================
begin;
create table public.business_merchants (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),platform text not null check(platform in ('rakuten','xiaohongshu')),
 platform_shop_id text not null check(length(platform_shop_id) between 1 and 200),name text not null,source_url text not null,
 identity_scope text not null check(identity_scope in ('platform_shop_id','user_supplied_unverified')),created_at timestamptz not null default clock_timestamp(),
 unique(user_id,id),unique(user_id,platform,platform_shop_id)
);
create table public.business_material_snapshots (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),merchant_id uuid not null,
 platform text not null check(platform in ('rakuten','xiaohongshu')),item_id text,origin text not null check(origin in ('official_api','public_excerpt','manual_excerpt')),
 source_url text not null,captured_at timestamptz not null default clock_timestamp(),published_at timestamptz,
 capture_scope text not null check(capture_scope in ('api_fields','excerpt','manual_transcription')),captured_text text,
 quantities jsonb not null check(jsonb_typeof(quantities)='array'),structured jsonb not null check(jsonb_typeof(structured)='object'),coverage text not null check(length(trim(coverage))>0),content_hash text not null,
 unique(user_id,id),unique(user_id,id,merchant_id),foreign key(user_id,merchant_id) references business_merchants(user_id,id)
);
create table public.business_daily_cases (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),local_date date not null,timezone text not null default 'Asia/Tokyo' check(timezone='Asia/Tokyo'),merchant_id uuid not null,
 state text not null default 'preparing' check(state in ('preparing','ready','unavailable')),published_revision_id uuid,failure_reason text,revision integer not null default 1 check(revision>0),selection_reason text not null,
 created_at timestamptz not null default clock_timestamp(),unique(user_id,id),unique(user_id,local_date),unique(user_id,merchant_id),foreign key(user_id,merchant_id) references business_merchants(user_id,id)
);
create table public.business_case_members (
 user_id uuid not null,case_id uuid not null,snapshot_id uuid not null,merchant_id uuid not null,role text not null check(role in ('primary','product','comparison')),selection_reason text not null,
 added_at timestamptz not null default clock_timestamp(),primary key(case_id,snapshot_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id),foreign key(user_id,snapshot_id,merchant_id) references business_material_snapshots(user_id,id,merchant_id)
);
create unique index business_case_one_primary on business_case_members(case_id) where role='primary';
create table public.business_case_requests (
 user_id uuid not null references auth.users(id),request_id uuid not null,operation text not null,user_input_hash text not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(user_id,request_id)
);
create table public.business_case_preparations (
 user_id uuid not null references auth.users(id),request_id uuid not null,operation text not null check(operation='primary'),user_input_hash text not null,case_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),primary key(user_id,request_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id)
);
create function public.business_today() returns date language sql stable set search_path=public,pg_temp as $$select (statement_timestamp() at time zone 'Asia/Tokyo')::date$$;
create function public.business_service(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if coalesce(auth.role(),'')<>'service_role' or p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'business owner/service required' using errcode='42501';end if;
end $$;
create function public.business_case_dto(c business_daily_cases) returns jsonb language sql immutable as $$select jsonb_build_object('id',c.id,'localDate',c.local_date,'timezone',c.timezone,'merchantId',c.merchant_id,'state',c.state,'publishedRevisionId',c.published_revision_id,'failureReason',c.failure_reason,'revision',c.revision,'selectionReason',c.selection_reason)$$;
create function public.business_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin raise exception 'business historical material is immutable';end $$;
create trigger business_snapshot_immutable before update or delete on business_material_snapshots for each row execute function business_immutable();
create trigger business_member_immutable before update or delete on business_case_members for each row execute function business_immutable();
create function public.business_merchant_identity_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' then raise exception 'business merchant is immutable';end if;
 if new.id<>old.id or new.user_id<>old.user_id or new.platform<>old.platform or new.platform_shop_id<>old.platform_shop_id or exists(select 1 from business_material_snapshots where merchant_id=old.id) then raise exception 'business merchant identity/history is immutable';end if;return new;
end $$;
create trigger business_merchant_immutable before update or delete on business_merchants for each row execute function business_merchant_identity_immutable();
create function public.business_case_identity_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.user_id<>old.user_id or new.local_date<>old.local_date or new.merchant_id<>old.merchant_id or new.timezone<>old.timezone or new.selection_reason<>old.selection_reason then raise exception 'business daily identity is immutable';end if;return new;
end $$;
create function public.business_prepare_case(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;m business_merchants;prep business_case_preparations;r business_case_requests;mi jsonb;v_request uuid;v_hash text;v_needs boolean;
begin
 perform business_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>10000 then raise exception 'invalid preparation input';end if;
 v_request:=(p_input->>'requestId')::uuid;v_hash:=p_input->>'userInputHash';mi:=p_input->'merchant';
 if v_request is null or coalesce(v_hash,'')='' or coalesce(mi->>'platform','') not in ('rakuten','xiaohongshu') or coalesce(mi->>'platformShopId','')='' or coalesce(p_input->>'selectionReason','')='' then raise exception 'invalid preparation identity';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into r from business_case_requests where user_id=p_user_id and request_id=v_request;
 if found then if r.operation<>'primary' or r.user_input_hash<>v_hash then raise exception 'business request payload conflict';end if;return jsonb_build_object('dailyCase',r.result,'needsMaterial',false);end if;
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=v_request;
 if found then
  if prep.operation<>'primary' or prep.user_input_hash<>v_hash then raise exception 'business request payload conflict';end if;
  select * into c from business_daily_cases where user_id=p_user_id and id=prep.case_id for update;
 else
  select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() for update;
  if not found then
   select * into m from business_merchants where user_id=p_user_id and platform=mi->>'platform' and platform_shop_id=mi->>'platformShopId';
   if not found then insert into business_merchants(user_id,platform,platform_shop_id,name,source_url,identity_scope) values(p_user_id,mi->>'platform',mi->>'platformShopId',mi->>'name',mi->>'sourceUrl','user_supplied_unverified') returning * into m;end if;
   insert into business_daily_cases(user_id,local_date,merchant_id,selection_reason) values(p_user_id,business_today(),m.id,p_input->>'selectionReason') returning * into c;
  end if;
  insert into business_case_preparations(user_id,request_id,operation,user_input_hash,case_id) values(p_user_id,v_request,'primary',v_hash,c.id);
 end if;
 select * into m from business_merchants where id=c.merchant_id and user_id=p_user_id;
 v_needs:=m.platform=mi->>'platform' and m.platform_shop_id=mi->>'platformShopId' and not exists(select 1 from business_case_members where case_id=c.id and role='primary');
 return jsonb_build_object('dailyCase',business_case_dto(c),'needsMaterial',v_needs);
end $$;
create function public.business_fail_preparation(p_user_id uuid,p_request_id uuid,p_user_input_hash text) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare prep business_case_preparations;begin
 perform business_service(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=p_request_id;
 if not found or prep.user_input_hash is distinct from p_user_input_hash then raise exception 'business preparation conflict';end if;
 update business_daily_cases c set state='unavailable',failure_reason='官方来源暂不可用，请重试或补充该店公开摘录。' where c.user_id=p_user_id and c.id=prep.case_id and not exists(select 1 from business_case_members where case_id=c.id and role='primary');
end $$;
create trigger business_case_identity_immutable before update on business_daily_cases for each row execute function business_case_identity_immutable();
create function public.business_request_receipt(p_user_id uuid,p_request_id uuid,p_operation text,p_user_input_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r business_case_requests;prep business_case_preparations;begin
 perform business_service(p_user_id);select * into r from business_case_requests where user_id=p_user_id and request_id=p_request_id;
 if not found then
  select * into prep from business_case_preparations where user_id=p_user_id and request_id=p_request_id;
  if found and (prep.operation is distinct from p_operation or prep.user_input_hash is distinct from p_user_input_hash) then raise exception 'business request payload conflict';end if;return null;
 end if;
 if r.operation is distinct from p_operation or r.user_input_hash is distinct from p_user_input_hash then raise exception 'business request payload conflict';end if;return r.result;
end $$;
create function public.business_load_today(p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c business_daily_cases;begin
 perform business_service(p_user_id);select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today();if not found then return null;end if;return business_case_dto(c);
end $$;
create function public.business_validate_quantities(p_quantities jsonb) returns void language plpgsql set search_path=public,pg_temp as $$declare q jsonb;begin
 if jsonb_typeof(p_quantities) is distinct from 'array' or jsonb_array_length(p_quantities)>100 then raise exception 'invalid business quantities';end if;
 if (select count(*) from jsonb_array_elements(p_quantities))<>(select count(distinct value->>'id') from jsonb_array_elements(p_quantities)) then raise exception 'quantity identity conflict';end if;
 for q in select value from jsonb_array_elements(p_quantities) loop
  if jsonb_typeof(q) is distinct from 'object' or coalesce(q->>'id','')='' or coalesce(q->>'raw','')='' or coalesce(q->>'sampleScope','')='' or
   coalesce(q->>'metric','') not in ('pack_contents','units_per_order','displayed_sales','review_count','repeat_mention') or
   coalesce(q->>'relation','') not in ('eq','gte','unknown') or coalesce(q->>'unit','') not in ('pieces','packs','orders','buyers','mentions','unknown') or
   coalesce(q->>'attribution','') not in ('platform','merchant','review_excerpt','user_supplied') or jsonb_typeof(q->'period') is distinct from 'object' or
   not(q ? 'value') or (q->>'relation'='unknown' and q->'value'<>'null'::jsonb) or (q->>'relation'<>'unknown' and jsonb_typeof(q->'value') is distinct from 'number') then raise exception 'invalid business quantity observation';end if;
  if jsonb_typeof(q->'value')='number' and (q->>'value')::numeric<0 then raise exception 'negative business quantity';end if;
 end loop;
end $$;
create function public.business_save_case_material(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;m business_merchants;r business_case_requests;prep business_case_preparations;s jsonb;mi jsonb;v_snapshot uuid;v_result jsonb;v_request uuid;v_operation text;v_role text;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>100000 then raise exception 'invalid business input';end if;
 v_request:=(p_input->>'requestId')::uuid;v_operation:=p_input->>'operation';
 if v_request is null or v_operation not in ('primary','attach') or coalesce(p_input->>'userInputHash','')='' then raise exception 'invalid business request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into r from business_case_requests where user_id=p_user_id and request_id=v_request;
 if found then if r.input is distinct from p_input then raise exception 'business request payload conflict';end if;return r.result;end if;
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=v_request;
 if found and (v_operation<>'primary' or prep.user_input_hash is distinct from p_input->>'userInputHash') then raise exception 'business request payload conflict';end if;
 if v_operation='primary' then
  if prep.case_id is not null then select * into c from business_daily_cases where user_id=p_user_id and id=prep.case_id for update;
  else select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() for update;end if;
  if found and (exists(select 1 from business_case_members where case_id=c.id and role='primary') or not exists(select 1 from business_merchants where id=c.merchant_id and platform=p_input->'merchant'->>'platform' and platform_shop_id=p_input->'merchant'->>'platformShopId')) then v_result:=business_case_dto(c);insert into business_case_requests values(p_user_id,v_request,v_operation,p_input->>'userInputHash',p_input,v_result,clock_timestamp());return v_result;end if;
  v_role:='primary';
 else
  select * into c from business_daily_cases where id=(p_input->>'caseId')::uuid and user_id=p_user_id for update;
  if not found then raise exception 'business case owner required' using errcode='42501';end if;
  if c.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'business case revision conflict';end if;
  v_role:=p_input->>'role';if v_role not in ('product','comparison') then raise exception 'invalid member role';end if;
 end if;
 mi:=p_input->'merchant';s:=p_input->'snapshot';
 if coalesce(mi->>'platform','') not in ('rakuten','xiaohongshu') or coalesce(mi->>'platformShopId','')='' or coalesce(mi->>'name','')='' or mi->>'platform' is distinct from s->>'platform' or coalesce(p_input->>'selectionReason','')='' then raise exception 'invalid merchant material';end if;
 if coalesce(s->>'coverage','')='' or jsonb_typeof(s->'quantities') is distinct from 'array' or jsonb_typeof(s->'structured') is distinct from 'object' then raise exception 'invalid source coverage';end if;
 perform business_validate_quantities(s->'quantities');
 if s->>'origin'='official_api' and (mi->>'platform'<>'rakuten' or mi->>'identityScope'<>'platform_shop_id' or s->>'captureScope'<>'api_fields') then raise exception 'invalid official source';end if;
 if s->>'origin'='official_api' and (coalesce(s->>'sourceUrl','') !~ '^https://item[.]rakuten[.]co[.]jp/' or coalesce(mi->>'sourceUrl','') !~ '^https://www[.]rakuten[.]co[.]jp/' or split_part(s->>'sourceUrl','/',4) is distinct from mi->>'platformShopId' or split_part(s->>'itemId',':',1) is distinct from mi->>'platformShopId') then raise exception 'official source identity mismatch';end if;
 if s->>'origin'='manual_excerpt' and s->>'captureScope'<>'manual_transcription' then raise exception 'manual source scope mismatch';end if;
 select * into m from business_merchants where user_id=p_user_id and platform=mi->>'platform' and platform_shop_id=mi->>'platformShopId';
 if not found then insert into business_merchants(user_id,platform,platform_shop_id,name,source_url,identity_scope) values(p_user_id,mi->>'platform',mi->>'platformShopId',mi->>'name',mi->>'sourceUrl',mi->>'identityScope') returning * into m;
 elsif not exists(select 1 from business_material_snapshots where merchant_id=m.id) then update business_merchants set name=mi->>'name',source_url=mi->>'sourceUrl',identity_scope=mi->>'identityScope' where id=m.id returning * into m;end if;
 if v_operation='primary' then
  if c.id is null then insert into business_daily_cases(user_id,local_date,merchant_id,selection_reason) values(p_user_id,business_today(),m.id,p_input->>'selectionReason') returning * into c;end if;
 else
  if (v_role='comparison' and m.id=c.merchant_id) or (v_role='product' and m.id<>c.merchant_id) then raise exception 'material merchant does not match role';end if;
  update business_daily_cases set revision=revision+1 where id=c.id returning * into c;
  if v_role='product' and not exists(select 1 from business_case_members where case_id=c.id and role='primary') then v_role:='primary';end if;
 end if;
 insert into business_material_snapshots(user_id,merchant_id,platform,item_id,origin,source_url,published_at,capture_scope,captured_text,quantities,structured,coverage,content_hash)
 values(p_user_id,m.id,s->>'platform',s->>'itemId',s->>'origin',s->>'sourceUrl',(s->>'publishedAt')::timestamptz,s->>'captureScope',s->>'capturedText',s->'quantities',s->'structured',s->>'coverage',md5(s::text)) returning id into v_snapshot;
 insert into business_case_members(user_id,case_id,snapshot_id,merchant_id,role,selection_reason) values(p_user_id,c.id,v_snapshot,m.id,v_role,p_input->>'selectionReason');
 if v_role='primary' then update business_daily_cases set state='ready',failure_reason=null where id=c.id returning * into c;end if;
 v_result:=business_case_dto(c);insert into business_case_requests values(p_user_id,v_request,v_operation,p_input->>'userInputHash',p_input,v_result,clock_timestamp());return v_result;
end $$;
alter table business_merchants enable row level security;
alter table business_material_snapshots enable row level security;
alter table business_daily_cases enable row level security;
alter table business_case_members enable row level security;
alter table business_case_requests enable row level security;
alter table business_case_preparations enable row level security;
create policy business_merchants_read on business_merchants for select to authenticated using(user_id=auth.uid());
create policy business_material_read on business_material_snapshots for select to authenticated using(user_id=auth.uid());
create policy business_cases_read on business_daily_cases for select to authenticated using(user_id=auth.uid());
create policy business_members_read on business_case_members for select to authenticated using(user_id=auth.uid());
revoke all on business_merchants,business_material_snapshots,business_daily_cases,business_case_members,business_case_requests,business_case_preparations from public,anon,authenticated,service_role;
grant select on business_merchants,business_material_snapshots,business_daily_cases,business_case_members to authenticated,service_role;
revoke all on function business_service(uuid),business_request_receipt(uuid,uuid,text,text),business_save_case_material(uuid,jsonb),business_load_today(uuid) from public,anon,authenticated;
grant execute on function business_request_receipt(uuid,uuid,text,text),business_save_case_material(uuid,jsonb),business_load_today(uuid) to service_role;
revoke all on function business_prepare_case(uuid,jsonb),business_fail_preparation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function business_prepare_case(uuid,jsonb),business_fail_preparation(uuid,uuid,text) to service_role;
commit;


-- ============================================================================
-- Synced migration: 120_business_teardown_research.sql
-- ============================================================================
begin;
create table public.business_ai_consents(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,material_revision integer not null,payload jsonb not null,request_id uuid not null,revoked_at timestamptz,consumed_by_request_id uuid,created_at timestamptz not null default clock_timestamp(),unique(user_id,request_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_case_revisions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,revision integer not null,material_revision integer not null,manifest jsonb not null,input_manifest_hash text not null,payload jsonb not null,erased_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(user_id,id),unique(case_id,revision),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_report_requests(user_id uuid not null references auth.users(id),request_id uuid not null,case_id uuid not null,input jsonb not null,input_hash text not null,manifest jsonb not null,consent_id uuid not null references business_ai_consents(id),lease_token uuid not null default gen_random_uuid(),lease_until timestamptz not null default clock_timestamp()+interval '5 minutes',status text not null default 'pending' check(status in ('pending','completed','failed','unknown')),report_id uuid references business_case_revisions(id),primary key(user_id,request_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_case_lessons(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,report_id uuid not null,payload jsonb not null,request_id uuid not null,created_at timestamptz not null default clock_timestamp(),unique(user_id,request_id),foreign key(user_id,report_id) references business_case_revisions(user_id,id));
create table public.business_case_action_refs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,report_id uuid not null,kind text not null check(kind in ('observation','experiment')),request_id uuid not null,input jsonb not null,input_hash text not null,preview_token uuid not null default gen_random_uuid(),target_id uuid,source_invalidated_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(user_id,request_id),foreign key(user_id,report_id) references business_case_revisions(user_id,id));
create table public.business_report_publications(user_id uuid not null references auth.users(id),request_id uuid not null,input jsonb not null,report_id uuid not null references business_case_revisions(id),primary key(user_id,request_id));
alter table business_material_snapshots add column erased_at timestamptz;
create function public.business_report_dto(r business_case_revisions) returns jsonb language sql stable as $$select r.payload||jsonb_build_object('id',r.id,'caseId',r.case_id,'revision',r.revision,'materialRevision',r.material_revision,'inputManifestHash',r.input_manifest_hash,'createdAt',r.created_at,'erasedAt',r.erased_at)$$;
create function public.business_consent_dto(r business_ai_consents) returns jsonb language sql stable as $$select r.payload||jsonb_build_object('id',r.id,'caseId',r.case_id,'materialRevision',r.material_revision,'createdAt',r.created_at,'revokedAt',r.revoked_at,'consumedByRequestId',r.consumed_by_request_id,'consumedRequestStatus',(select status from business_report_requests q where q.user_id=r.user_id and q.request_id=r.consumed_by_request_id),'consumedExpectedReportRevision',(select (input->>'expectedReportRevision')::integer from business_report_requests q where q.user_id=r.user_id and q.request_id=r.consumed_by_request_id))$$;
create function public.business_selected_manifest(p_user_id uuid,p_case uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;n integer;selected jsonb;begin
 perform business_service(p_user_id);
 if jsonb_typeof(p_input->'snapshotIds') is distinct from 'array' or jsonb_typeof(p_input->'comparisonSnapshotIds') is distinct from 'array' or jsonb_array_length(p_input->'snapshotIds')=0 then raise exception 'select sources explicitly';end if;
 selected=(p_input->'snapshotIds')||(p_input->'comparisonSnapshotIds');n=jsonb_array_length(selected);
 if n>30 or (select count(distinct value) from jsonb_array_elements_text(selected))<>n then raise exception 'invalid source selection';end if;
 select jsonb_agg(jsonb_build_object('id',s.id,'merchantId',s.merchant_id,'platform',s.platform,'itemId',s.item_id,'origin',s.origin,'sourceUrl',s.source_url,'capturedAt',s.captured_at,'publishedAt',s.published_at,'captureScope',s.capture_scope,'capturedText',s.captured_text,'quantities',s.quantities,'structured',s.structured,'coverage',s.coverage,'contentHash',s.content_hash,'role',m.role) order by s.id) into result
 from business_case_members m join business_material_snapshots s on s.id=m.snapshot_id and s.user_id=m.user_id where m.user_id=p_user_id and m.case_id=p_case and s.erased_at is null and ((m.role in ('primary','product') and p_input->'snapshotIds' ? s.id::text) or (m.role='comparison' and p_input->'comparisonSnapshotIds' ? s.id::text));
 if result is null or jsonb_array_length(result)<>n then raise exception 'source unavailable or role mismatch';end if;return result;
end$$;
create function public.business_report_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;con business_ai_consents;r business_case_revisions;req business_report_requests;l business_case_lessons;ref business_case_action_refs;pub business_report_publications;v_case uuid;v_id uuid;v_manifest jsonb;v_hash text;v_result jsonb;v_revision integer;v_target uuid;v_key text;v_count integer;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>200000 then raise exception 'invalid report input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));
 if p_operation='revoke' then update business_ai_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user_id and id=(p_input->>'consentId')::uuid; if not found then raise exception 'consent unavailable';end if;return '{}'::jsonb;end if;
 if p_operation in ('verify','finish','fail') then
  select * into req from business_report_requests where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid for update;
  if not found or req.lease_token is distinct from (p_input->>'leaseToken')::uuid or req.input_hash is distinct from p_input->>'inputManifestHash' then raise exception 'lease unavailable';end if;
  if p_operation='finish' and req.status='completed' then select * into r from business_case_revisions where id=req.report_id;return business_report_dto(r);end if;
  if p_operation='fail' then update business_report_requests set status='failed' where user_id=p_user_id and request_id=req.request_id and status='pending';return '{}'::jsonb;end if;
  v_case=req.case_id;
 else v_case=(p_input->>'caseId')::uuid;end if;
 select * into c from business_daily_cases where user_id=p_user_id and id=v_case for update;if not found then raise exception 'case unavailable' using errcode='42501';end if;
 if p_operation='state' then
  return jsonb_build_object('available',true,'publishedReportId',c.published_revision_id,'reports',coalesce((select jsonb_agg(business_report_dto(x) order by revision desc) from business_case_revisions x where x.user_id=p_user_id and x.case_id=c.id),'[]'::jsonb),'consents',coalesce((select jsonb_agg(business_consent_dto(x) order by created_at desc) from business_ai_consents x where x.user_id=p_user_id and x.case_id=c.id),'[]'::jsonb),'lessons',coalesce((select jsonb_agg(x.payload||jsonb_build_object('id',x.id,'createdAt',x.created_at)) from business_case_lessons x where x.user_id=p_user_id and x.case_id=c.id),'[]'::jsonb));
 end if;
 if p_operation='consent' then
  select * into con from business_ai_consents where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if con.payload<>p_input then raise exception 'request payload conflict';end if;return business_consent_dto(con);end if;
  if c.revision is distinct from (p_input->>'materialRevision')::integer then raise exception 'material revision changed';end if;
  v_manifest=business_selected_manifest(p_user_id,c.id,p_input);
  if (p_input->>'publicExcerptDeidentified')::boolean is distinct from true then raise exception 'public deidentified source confirmation required';end if;
  insert into business_ai_consents(user_id,case_id,material_revision,payload,request_id) values(p_user_id,c.id,c.revision,p_input,(p_input->>'requestId')::uuid) returning * into con;return business_consent_dto(con);
 end if;
 if p_operation='start' then
  select * into req from business_report_requests where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid for update;
  if found then
   if req.input<>p_input then raise exception 'request payload conflict';end if;
   if req.status='completed' then select * into r from business_case_revisions where id=req.report_id;return jsonb_build_object('status','completed','report',business_report_dto(r));end if;
   if req.status='pending' and req.lease_until>clock_timestamp() then return jsonb_build_object('status','busy');end if;
   update business_report_requests set status=case when status='pending' then 'unknown' else status end where user_id=p_user_id and request_id=req.request_id;return jsonb_build_object('status','unknown');
  end if;
  if c.revision is distinct from (p_input->>'materialRevision')::integer then raise exception 'material revision changed';end if;
  select coalesce(max(revision),0) into v_revision from business_case_revisions where case_id=c.id;
  if v_revision is distinct from (p_input->>'expectedReportRevision')::integer then raise exception 'report revision changed';end if;
  select * into con from business_ai_consents where user_id=p_user_id and id=(p_input->>'consentId')::uuid and case_id=c.id and revoked_at is null and material_revision=c.revision;
  if not found or con.payload->'snapshotIds' is distinct from p_input->'snapshotIds' or con.payload->'comparisonSnapshotIds' is distinct from p_input->'comparisonSnapshotIds' then raise exception 'consent unavailable or selection changed';end if;
  if con.consumed_by_request_id is not null then raise exception 'consent already consumed; explicitly grant a new generation';end if;
  v_manifest=business_selected_manifest(p_user_id,c.id,p_input);v_hash=md5(jsonb_build_object('input',p_input,'sources',v_manifest)::text);
  insert into business_report_requests(user_id,request_id,case_id,input,input_hash,manifest,consent_id) values(p_user_id,(p_input->>'requestId')::uuid,c.id,p_input,v_hash,v_manifest,con.id) returning * into req;
  update business_ai_consents set consumed_by_request_id=req.request_id where id=con.id returning * into con;
  return jsonb_build_object('status','ready','lease',jsonb_build_object('requestId',req.request_id,'leaseToken',req.lease_token,'caseId',c.id,'inputManifestHash',v_hash,'materialRevision',c.revision),'sources',v_manifest,'consent',business_consent_dto(con));
 end if;
 if p_operation in ('verify','finish') then
  if req.status<>'pending' or req.lease_until<=clock_timestamp() then raise exception 'lease expired; result or usage unknown; confirm a new request';end if;
  select * into con from business_ai_consents where user_id=p_user_id and id=req.consent_id and revoked_at is null and material_revision=c.revision and consumed_by_request_id=req.request_id;
  if not found or c.revision is distinct from (req.input->>'materialRevision')::integer or business_selected_manifest(p_user_id,c.id,req.input) is distinct from req.manifest then raise exception 'sources or consent changed';end if;
  if p_operation='verify' then return jsonb_build_object('sources',req.manifest,'consent',business_consent_dto(con));end if;
  select coalesce(max(revision),0) into v_revision from business_case_revisions where case_id=c.id;
  if v_revision is distinct from (req.input->>'expectedReportRevision')::integer then raise exception 'report revision changed';end if;
  if jsonb_typeof(p_input->'report'->'sections') is distinct from 'array' or jsonb_array_length(p_input->'report'->'sections')<>12 then raise exception 'twelve sections required';end if;
  foreach v_key in array array['offering','trigger','buyers','volume','journey','value','operations','economics','comparison','failure_conditions','transfer','experiment'] loop select count(*) into v_count from jsonb_array_elements(p_input->'report'->'sections') s where s->>'key'=v_key;if v_count<>1 then raise exception 'section keys invalid';end if;end loop;
  insert into business_case_revisions(user_id,case_id,revision,material_revision,manifest,input_manifest_hash,payload) values(p_user_id,c.id,v_revision+1,c.revision,req.manifest,req.input_hash,(p_input->'report')||jsonb_build_object('primarySnapshotIds',req.input->'snapshotIds','comparisonSnapshotIds',req.input->'comparisonSnapshotIds','authorship','ai_draft')) returning * into r;
  update business_report_requests set status='completed',report_id=r.id where user_id=p_user_id and request_id=req.request_id;return business_report_dto(r);
 end if;
 select * into r from business_case_revisions where user_id=p_user_id and case_id=c.id and id=(p_input->>'reportId')::uuid;
 if not found or r.erased_at is not null then raise exception 'report unavailable';end if;
 if p_operation='publish' then
  select * into pub from business_report_publications where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if pub.input<>p_input then raise exception 'request payload conflict';end if;return business_report_dto(r);end if;
  if c.published_revision_id is distinct from (p_input->>'expectedPublishedReportId')::uuid or c.revision<>r.material_revision then raise exception 'publication or material changed';end if;
  update business_daily_cases set published_revision_id=r.id where id=c.id;insert into business_report_publications values(p_user_id,(p_input->>'requestId')::uuid,p_input,r.id);return business_report_dto(r);
 elsif p_operation='lesson' then
  select * into l from business_case_lessons where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if l.payload<>p_input then raise exception 'request payload conflict';end if;return l.payload||jsonb_build_object('id',l.id,'createdAt',l.created_at);end if;
  foreach v_key in array array['method','conditions','unknowns'] loop if length(btrim(coalesce(p_input->>v_key,''))) not between 1 and 4000 then raise exception 'user method, conditions and unknowns required';end if;end loop;
  insert into business_case_lessons(user_id,case_id,report_id,payload,request_id) values(p_user_id,c.id,r.id,p_input,(p_input->>'requestId')::uuid) returning * into l;return l.payload||jsonb_build_object('id',l.id,'createdAt',l.created_at);
 elsif p_operation='preview' then
  if c.revision<>r.material_revision then raise exception 'material changed';end if;
  if p_input->>'kind'='observation' then if length(btrim(coalesce(p_input->>'takeaway',''))) not between 1 and 12000 then raise exception 'write your observation';end if;
  elsif p_input->>'kind'='experiment' then
   if to_regprocedure('public.save_idea_experiment_version(uuid,jsonb)') is null then raise exception 'experiment schema unavailable';end if;
   execute 'select id from public.ideas where user_id=$1 and id=$2' into v_target using p_user_id,(p_input->'experiment'->>'ideaId')::uuid;if v_target is null then raise exception 'target idea unavailable';end if;
  else raise exception 'invalid action kind';end if;
  select * into ref from business_case_action_refs where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if ref.input<>p_input then raise exception 'request payload conflict';end if;
  else insert into business_case_action_refs(user_id,case_id,report_id,kind,request_id,input,input_hash) values(p_user_id,c.id,r.id,p_input->>'kind',(p_input->>'requestId')::uuid,p_input,md5(p_input::text)) returning * into ref;end if;
  return ref.input||jsonb_build_object('token',ref.preview_token,'inputHash',ref.input_hash,'localCaseLink','/business-lab/'||c.id::text);
 elsif p_operation='confirm' then
  select * into ref from business_case_action_refs where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid for update;
  if not found or ref.preview_token is distinct from (p_input->>'token')::uuid or ref.input_hash is distinct from p_input->>'inputHash' or ref.input is distinct from p_input-array['token','inputHash','localCaseLink'] then raise exception 'preview input changed';end if;
  if ref.target_id is not null then return jsonb_build_object('targetId',ref.target_id,'kind',ref.kind);end if;
  if c.revision<>r.material_revision or ref.source_invalidated_at is not null then raise exception 'preview stale';end if;
  if ref.kind='observation' then execute 'insert into public.observations(user_id,raw_text,tags) values($1,$2,$3) returning id' into v_target using p_user_id,ref.input->>'takeaway'||E'\n出处：/business-lab/'||c.id::text,array[]::text[];
  else execute 'select public.save_idea_experiment_version($1,$2)' into v_result using p_user_id,ref.input->'experiment';v_target=(v_result->>'id')::uuid;end if;
  if v_target is null then raise exception 'action target not saved';end if;update business_case_action_refs set target_id=v_target where id=ref.id;return jsonb_build_object('targetId',v_target,'kind',ref.kind);
 end if;
 raise exception 'invalid report operation';
end$$;
create function public.business_erase_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if current_setting('business.erase_case',true) is distinct from old.user_id::text or coalesce(auth.role(),'')<>'service_role' or tg_op<>'UPDATE' or old.erased_at is not null or new.erased_at is null then raise exception 'business history immutable';end if;
 if tg_table_name='business_material_snapshots' then
  if (to_jsonb(new)-array['captured_text','quantities','structured','coverage','content_hash','erased_at']) is distinct from (to_jsonb(old)-array['captured_text','quantities','structured','coverage','content_hash','erased_at']) or new.captured_text is not null or new.structured<>'{}'::jsonb or new.quantities<>'[]'::jsonb or new.coverage<>'来源已清除' then raise exception 'invalid erase';end if;
 else if (to_jsonb(new)-array['payload','manifest','erased_at']) is distinct from (to_jsonb(old)-array['payload','manifest','erased_at']) or new.manifest<>'[]'::jsonb or new.payload<>'{"sections":[],"authorship":"ai_draft","primarySnapshotIds":[],"comparisonSnapshotIds":[],"model":null,"promptVersion":null}'::jsonb then raise exception 'invalid report erase';end if;end if;return new;
end$$;
drop trigger business_snapshot_immutable on business_material_snapshots;
create trigger business_snapshot_immutable before update or delete on business_material_snapshots for each row execute function business_erase_guard();
create trigger business_report_immutable before update or delete on business_case_revisions for each row execute function business_erase_guard();
create function public.business_erase_content(p_user_id uuid,p_case_id uuid,p_snapshot_id uuid default null,p_report_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c business_daily_cases;v_cases uuid[];begin
 perform business_service(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));select * into c from business_daily_cases where id=p_case_id and user_id=p_user_id for update;if not found then raise exception 'case unavailable' using errcode='42501';end if;
 if (p_snapshot_id is null)=(p_report_id is null) then raise exception 'choose one source or report';end if;
 perform set_config('business.erase_case',p_user_id::text,true);
 if p_snapshot_id is not null then
  if not exists(select 1 from business_case_members where user_id=p_user_id and case_id=c.id and snapshot_id=p_snapshot_id) then raise exception 'source unavailable';end if;
  select array_agg(distinct case_id) into v_cases from business_case_members where user_id=p_user_id and snapshot_id=p_snapshot_id;
  update business_material_snapshots set captured_text=null,structured='{}',quantities='[]',coverage='来源已清除',content_hash='erased:'||id::text,erased_at=clock_timestamp() where user_id=p_user_id and id=p_snapshot_id and erased_at is null;
  update business_case_revisions set payload='{"sections":[],"authorship":"ai_draft","primarySnapshotIds":[],"comparisonSnapshotIds":[],"model":null,"promptVersion":null}',manifest='[]',erased_at=clock_timestamp() where user_id=p_user_id and erased_at is null and exists(select 1 from jsonb_array_elements(manifest) s where s->>'id'=p_snapshot_id::text);
  update business_report_requests set manifest='[]',status=case when status='pending' then 'unknown' else status end where user_id=p_user_id and case_id=any(v_cases);
  update business_case_requests set input='{"erased":true}' where user_id=p_user_id and result->>'id' in(select unnest(v_cases)::text);
  update business_ai_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user_id and case_id=any(v_cases);
  update business_daily_cases set revision=revision+1 where user_id=p_user_id and id=any(v_cases);
 else
  if not exists(select 1 from business_case_revisions where user_id=p_user_id and case_id=c.id and id=p_report_id) then raise exception 'report unavailable';end if;
  update business_case_revisions set payload='{"sections":[],"authorship":"ai_draft","primarySnapshotIds":[],"comparisonSnapshotIds":[],"model":null,"promptVersion":null}',manifest='[]',erased_at=clock_timestamp() where user_id=p_user_id and case_id=c.id and id=p_report_id and erased_at is null;
 end if;
 update business_case_action_refs a set source_invalidated_at=coalesce(source_invalidated_at,clock_timestamp()) where a.user_id=p_user_id and exists(select 1 from business_case_revisions r where r.id=a.report_id and r.erased_at is not null);
 update business_daily_cases d set published_revision_id=null where d.user_id=p_user_id and exists(select 1 from business_case_revisions r where r.id=d.published_revision_id and r.erased_at is not null);
 perform set_config('business.erase_case','',true);
end$$;
create trigger business_lesson_immutable before update or delete on business_case_lessons for each row execute function business_immutable();
do $$declare t text;begin foreach t in array array['business_ai_consents','business_case_revisions','business_report_requests','business_case_lessons','business_case_action_refs','business_report_publications'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy owner_read on public.%I for select to authenticated using(auth.uid()=user_id)',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end$$;
revoke all on function public.business_selected_manifest(uuid,uuid,jsonb),public.business_report_command(uuid,text,jsonb),public.business_erase_content(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_selected_manifest(uuid,uuid,jsonb),public.business_report_command(uuid,text,jsonb),public.business_erase_content(uuid,uuid,uuid,uuid) to service_role;
commit;


-- ============================================================================
-- Synced migration: 121_business_teardown_jobs.sql
-- ============================================================================
begin;
create table public.business_job_settings(
 user_id uuid primary key references auth.users(id),revision integer not null default 0,
 payload jsonb not null default '{"enabled":false,"prepareOnOpen":false,"schedule":"07:00","httpBudget":12,"aiBudget":1,"sources":[],"excluded":[],"autoAI":false,"policyVersion":"official-rakuten-scalars-v1"}',
 consent_version uuid,consent_revoked_at timestamptz,updated_at timestamptz not null default clock_timestamp());
create table public.business_job_setting_receipts(user_id uuid not null references auth.users(id),request_id uuid not null,input jsonb not null,result jsonb not null,primary key(user_id,request_id));
create table public.business_job_candidates(user_id uuid not null references auth.users(id),identity text not null,item_code text not null,payload jsonb not null,discovered_at timestamptz not null default clock_timestamp(),primary key(user_id,identity,item_code));
create table public.business_job_source_cursors(user_id uuid not null references auth.users(id),source_key text not null,next_page integer not null check(next_page>0),coverage text not null,captured_at timestamptz not null,primary key(user_id,source_key));
create table public.business_job_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),local_date date not null,
 status text not null default 'running' check(status in('running','materials_ready','completed','failed','unknown')),
 trigger text not null check(trigger in('manual','cron','open')),settings_revision integer not null,settings jsonb not null,parent_consent_version uuid,
 lease_token uuid not null default gen_random_uuid(),lease_until timestamptz not null default clock_timestamp()+interval '15 minutes',
 candidate jsonb,rule_version text,selection_reason text,case_id uuid,material_request uuid not null default gen_random_uuid(),material_hash text,
 material_status text not null default 'pending',report_status text not null default 'pending',report_request uuid not null default gen_random_uuid(),child_consent_id uuid,publication_base uuid,
 result jsonb,message text,created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 unique(user_id,local_date),unique(user_id,id),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_job_attempts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,run_id uuid not null,request_id uuid not null,
 kind text not null check(kind in('http','ai')),stage text not null,status text not null default 'pending' check(status in('pending','completed','failed','unknown')),
 usage jsonb,operation_reference text,receipt jsonb,created_at timestamptz not null default clock_timestamp(),settled_at timestamptz,
 unique(user_id,request_id),foreign key(user_id,run_id) references business_job_runs(user_id,id));
create table public.business_job_child_consents(consent_id uuid primary key references business_ai_consents(id),user_id uuid not null,run_id uuid not null,parent_version uuid not null,settings_revision integer not null,foreign key(user_id,run_id) references business_job_runs(user_id,id));
create function public.business_job_settings_dto(s business_job_settings) returns jsonb language sql stable as $$select s.payload||jsonb_build_object('revision',s.revision,'consentVersion',s.consent_version,'consentRevokedAt',s.consent_revoked_at)$$;
create function public.business_job_run_dto(r business_job_runs) returns jsonb language sql stable as $$select jsonb_build_object('runId',r.id,'leaseToken',r.lease_token,'localDate',r.local_date,'status',r.status,'settings',r.settings,'caseId',r.case_id,'candidate',r.candidate,'ruleVersion',r.rule_version,'message',r.message,'materialStatus',r.material_status,'reportStatus',r.report_status,'reportRequestId',r.report_request)$$;
-- D may replace this function with an identity-link aware exclusion set.
create function public.business_excluded_merchants(p_user_id uuid) returns text[] language sql stable security definer set search_path=public,pg_temp as $$select coalesce(array_agg(m.platform||':'||m.platform_shop_id),array[]::text[]) from business_daily_cases c join business_merchants m on m.id=c.merchant_id where c.user_id=p_user_id$$;
create function public.business_job_assert(p_user_id uuid,p_input jsonb,p_ai boolean default false) returns business_job_runs language plpgsql security definer set search_path=public,pg_temp as $$declare r business_job_runs;s business_job_settings;begin
 select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid for update;
 if not found then raise exception 'run owner unavailable' using errcode='42501';end if;
 if r.status<>'running' or r.lease_token is distinct from (p_input->>'leaseToken')::uuid or r.lease_until<=clock_timestamp() then raise exception 'job lease unavailable';end if;
 select * into s from business_job_settings where user_id=p_user_id;
 if s.revision<>r.settings_revision or (s.payload->>'enabled')::boolean is distinct from true then raise exception 'job settings changed or paused';end if;
 if p_ai and ((s.payload->>'autoAI')::boolean is distinct from true or s.consent_revoked_at is not null or s.consent_version is distinct from r.parent_consent_version) then raise exception 'automatic consent revoked';end if;
 return r;
end$$;
-- Wrap the existing B API without changing its implementation. Derived consents are
-- checked even when a caller uses B's public verify/finish entry point directly.
alter function public.business_report_command(uuid,text,jsonb) rename to business_report_command_v120;
revoke all on function public.business_report_command_v120(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.business_report_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare link business_job_child_consents;r business_job_runs;v_consent uuid;begin
 perform business_service(p_user_id);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));
 if p_operation in('verify','finish','start') then
  if p_operation='start' then v_consent=(p_input->>'consentId')::uuid;else select consent_id into v_consent from business_report_requests where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;end if;
  select * into link from business_job_child_consents where user_id=p_user_id and consent_id=v_consent;
  if found then
   select * into r from business_job_runs where id=link.run_id and user_id=p_user_id;
   perform business_job_assert(p_user_id,jsonb_build_object('runId',r.id,'leaseToken',r.lease_token),true);
   if p_operation='finish' and current_setting('business.job_finish',true) is distinct from r.id::text then raise exception 'automatic report requires atomic job finalization';end if;
  end if;
 end if;
 return business_report_command_v120(p_user_id,p_operation,p_input);
end$$;
create function public.business_job_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s business_job_settings;r business_job_runs;receipt business_job_setting_receipts;a business_job_attempts;c business_daily_cases;v jsonb;v_payload jsonb;v_candidate jsonb;item jsonb;v_identity text;v_case uuid;v_count integer;v_revision integer;v_consent jsonb;v_start jsonb;v_manifest jsonb;v_report jsonb;v_snapshots jsonb;v_comparisons jsonb;v_request uuid;v_budget integer;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>250000 then raise exception 'invalid job input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));
 insert into business_job_settings(user_id) values(p_user_id) on conflict do nothing;select * into s from business_job_settings where user_id=p_user_id for update;
 if p_operation='settings' then
  select * into receipt from business_job_setting_receipts where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if receipt.input<>p_input then raise exception 'settings request conflict';end if;return receipt.result;end if;
  if s.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'settings revision changed';end if;
  if jsonb_typeof(p_input->'httpBudget') is distinct from 'number' or jsonb_typeof(p_input->'aiBudget') is distinct from 'number' then raise exception 'integer HTTP and AI budgets required';end if;
  if (p_input->>'httpBudget')::numeric%1<>0 or (p_input->>'aiBudget')::numeric%1<>0 or (p_input->>'httpBudget')::numeric not between 1 and 1000 or (p_input->>'aiBudget')::numeric not between 0 and 10 then raise exception 'integer request budgets outside bounds';end if;
  if coalesce(p_input->>'schedule','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p_input->>'httpBudget')::integer not between 1 and 1000 or (p_input->>'aiBudget')::integer not between 0 and 10 or jsonb_typeof(p_input->'sources') is distinct from 'array' or jsonb_typeof(p_input->'excluded') is distinct from 'array' or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or jsonb_typeof(p_input->'prepareOnOpen') is distinct from 'boolean' or jsonb_typeof(p_input->'autoAI') is distinct from 'boolean' then raise exception 'invalid job settings';end if;
  for item in select value from jsonb_array_elements(p_input->'sources') loop
   if coalesce(item->>'mode','') not in('search','ranking') or jsonb_typeof(item->'category') is distinct from 'string' or jsonb_typeof(item->'priceBand') is distinct from 'string' or jsonb_typeof(item->'businessModel') is distinct from 'string' or length(btrim(coalesce(item->>'category',''))) not between 1 and 120 or length(btrim(coalesce(item->>'priceBand',''))) not between 1 and 120 or length(btrim(coalesce(item->>'businessModel',''))) not between 1 and 120 or (item->>'mode'='search' and (jsonb_typeof(item->'keyword') is distinct from 'string' or length(btrim(coalesce(item->>'keyword',''))) not between 1 and 128)) or (item->>'mode'='ranking' and item ? 'keyword') or (item ? 'genreId' and (jsonb_typeof(item->'genreId') is distinct from 'string' or item->>'genreId' !~ '^[0-9]+$')) then raise exception 'invalid official source configuration';end if;
   if item-array['mode','keyword','genreId','category','priceBand','businessModel']<>'{}'::jsonb then raise exception 'unsupported source configuration';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(p_input->'excluded') x where x.value !~ '^rakuten:[a-zA-Z0-9_-]+$') then raise exception 'invalid exclusion';end if;
  if (p_input->>'autoAI')::boolean and (p_input->>'policyVersion' is distinct from 'official-rakuten-scalars-v1' or ((s.payload->>'autoAI')::boolean is distinct from true and p_input->'autoAIConfirmed' is distinct from 'true'::jsonb)) then raise exception 'explicit automatic AI policy confirmation required';end if;
  v_payload=jsonb_build_object('enabled',(p_input->>'enabled')::boolean,'prepareOnOpen',(p_input->>'prepareOnOpen')::boolean,'schedule',p_input->>'schedule','httpBudget',(p_input->>'httpBudget')::integer,'aiBudget',(p_input->>'aiBudget')::integer,'sources',p_input->'sources','excluded',p_input->'excluded','autoAI',(p_input->>'autoAI')::boolean,'policyVersion','official-rakuten-scalars-v1');
  if s.payload->'sources' is distinct from p_input->'sources' then delete from business_job_candidates where user_id=p_user_id;delete from business_job_source_cursors where user_id=p_user_id;end if;
  update business_job_settings set revision=revision+1,payload=v_payload,consent_version=case when (p_input->>'autoAI')::boolean then case when (s.payload->>'autoAI')::boolean then s.consent_version else gen_random_uuid() end else s.consent_version end,consent_revoked_at=case when (p_input->>'autoAI')::boolean then null else coalesce(s.consent_revoked_at,clock_timestamp()) end,updated_at=clock_timestamp() where user_id=p_user_id returning * into s;
  v=business_job_settings_dto(s);insert into business_job_setting_receipts values(p_user_id,(p_input->>'requestId')::uuid,p_input,v);return v;
 elsif p_operation='state' then
  select * into r from business_job_runs where user_id=p_user_id and local_date=business_today();
  return jsonb_build_object('available',true,'settings',business_job_settings_dto(s),'run',case when r.id is null then null else business_job_run_dto(r) end,'attempts',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from business_job_attempts x where x.user_id=p_user_id and x.run_id=r.id),'[]'::jsonb),'sourceCursors',coalesce((select jsonb_object_agg(source_key,next_page) from business_job_source_cursors where user_id=p_user_id),'{}'::jsonb),'candidates',coalesce((select jsonb_agg(payload order by identity,item_code) from business_job_candidates where user_id=p_user_id),'[]'::jsonb),'history',jsonb_build_object('excluded',s.payload->'excluded','priorMain',to_jsonb(business_excluded_merchants(p_user_id)),'recent',coalesce((select jsonb_agg(candidate order by local_date desc) from business_job_runs where user_id=p_user_id and candidate is not null),'[]'::jsonb)));
 elsif p_operation='history' then
  select coalesce(jsonb_agg(business_job_run_dto(x)||jsonb_build_object('attemptSummary',jsonb_build_object('http',(select count(*) from business_job_attempts ba where ba.run_id=x.id and ba.kind='http'),'ai',(select count(*) from business_job_attempts ba where ba.run_id=x.id and ba.kind='ai'))) order by local_date desc),'[]'::jsonb) into v from (select * from business_job_runs where user_id=p_user_id and (p_input->>'before' is null or local_date<(p_input->>'before')::date) order by local_date desc limit 21) x;
  return jsonb_build_object('items',case when jsonb_array_length(v)>20 then v-20 else v end,'nextCursor',case when jsonb_array_length(v)>20 then v->19->>'localDate' else null end);
 elsif p_operation='claim' then
  select * into r from business_job_runs where user_id=p_user_id and local_date=business_today() for update;
  if found then
   if r.status<>'running' then return coalesce(r.result,business_job_run_dto(r));end if;
   if r.lease_until<=clock_timestamp() then update business_job_runs set status='unknown',message='Worker lease expired; usage or result may be unknown',finished_at=clock_timestamp() where id=r.id returning * into r;update business_job_attempts set status='unknown' where run_id=r.id and status='pending';return business_job_run_dto(r);end if;
   return jsonb_build_object('status','busy','runId',r.id);
  end if;
  if (s.payload->>'enabled')::boolean is distinct from true then return jsonb_build_object('status','disabled');end if;
  if p_input->>'trigger'='open' and (s.payload->>'prepareOnOpen')::boolean is distinct from true then return jsonb_build_object('status','disabled');end if;
  if p_input->>'trigger'='cron' and to_char(clock_timestamp() at time zone 'Asia/Tokyo','HH24:MI')<s.payload->>'schedule' then return jsonb_build_object('status','not_due');end if;
  select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today();
  insert into business_job_runs(user_id,local_date,trigger,settings_revision,settings,parent_consent_version,case_id,material_status) values(p_user_id,business_today(),p_input->>'trigger',s.revision,s.payload,s.consent_version,c.id,case when c.state='ready' then 'ready' else 'pending' end) returning * into r;return business_job_run_dto(r);
 end if;
 -- Successful terminal receipts precede live lease/settings checks.
 if p_operation in('finish','complete') then select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid;if found and r.lease_token=(p_input->>'leaseToken')::uuid and r.result is not null then return r.result;end if;end if;
 if p_operation='settle' then
  select * into a from business_job_attempts where user_id=p_user_id and run_id=(p_input->>'runId')::uuid and id=(p_input->>'ticketId')::uuid;
  if found and a.receipt is not null and exists(select 1 from business_job_runs where id=a.run_id and user_id=p_user_id and lease_token=(p_input->>'leaseToken')::uuid) then if a.receipt<>p_input-array['runId','leaseToken','settings','statusUnused'] then raise exception 'attempt receipt conflict';end if;return to_jsonb(a);end if;
 end if;
 if p_operation='fail' then
  select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid for update;
  if not found or r.lease_token is distinct from (p_input->>'leaseToken')::uuid then raise exception 'run owner unavailable';end if;
  if r.status<>'running' then return coalesce(r.result,business_job_run_dto(r));end if;
  update business_job_attempts set status='unknown',settled_at=clock_timestamp() where run_id=r.id and status='pending';
  update business_job_runs set status=case when exists(select 1 from business_job_attempts where run_id=r.id and kind='ai') then 'unknown' else 'failed' end,material_status=case when material_status='ready' then material_status else 'failed' end,report_status=case when exists(select 1 from business_job_attempts where run_id=r.id and kind='ai') then 'unknown' else 'not_started' end,message=left(coalesce(p_input->>'message','worker failed'),2000),finished_at=clock_timestamp() where id=r.id returning * into r;
  if r.case_id is not null and r.material_status<>'ready' and exists(select 1 from business_case_preparations where user_id=p_user_id and request_id=r.material_request) then perform business_fail_preparation(p_user_id,r.material_request,r.material_hash);end if;return business_job_run_dto(r);
 end if;
 r=business_job_assert(p_user_id,p_input,p_operation in('verify_ai','finish'));
 if p_operation='check' then return business_job_run_dto(r);
 elsif p_operation='enqueue' then
  for v_candidate in select value from jsonb_array_elements(p_input->'candidates') loop
   if v_candidate->'merchant'->>'platform' is distinct from 'rakuten' or v_candidate->'merchant'->>'identityScope' is distinct from 'platform_shop_id' or split_part(v_candidate->>'itemCode',':',1) is distinct from v_candidate->'merchant'->>'platformShopId' or coalesce(v_candidate->>'coverage','')='' or (v_candidate->>'sourcePage')::integer<1 or v_candidate->>'capturedAt' is null then raise exception 'invalid official candidate';end if;
   v_identity='rakuten:'||(v_candidate->'merchant'->>'platformShopId');insert into business_job_candidates(user_id,identity,item_code,payload) values(p_user_id,v_identity,v_candidate->>'itemCode',v_candidate) on conflict(user_id,identity,item_code) do update set payload=excluded.payload,discovered_at=clock_timestamp();
  end loop;
  if p_input ? 'sourceCursor' then insert into business_job_source_cursors values(p_user_id,p_input->'sourceCursor'->>'sourceKey',(p_input->'sourceCursor'->>'nextPage')::integer,p_input->'sourceCursor'->>'coverage',(p_input->'sourceCursor'->>'capturedAt')::timestamptz) on conflict(user_id,source_key) do update set next_page=excluded.next_page,coverage=excluded.coverage,captured_at=excluded.captured_at;end if;return '{}'::jsonb;
 elsif p_operation='reserve' then
  if r.case_id is not null then return business_job_run_dto(r);end if;
  if r.local_date<>business_today() then raise exception 'run date changed before slot reservation';end if;
  v_candidate=p_input->'candidate';v_identity='rakuten:'||(v_candidate->'merchant'->>'platformShopId');
  if not exists(select 1 from business_job_candidates where user_id=p_user_id and identity=v_identity and item_code=v_candidate->>'itemCode' and payload=v_candidate) then raise exception 'candidate not queued';end if;
  if v_identity=any(business_excluded_merchants(p_user_id)) or s.payload->'excluded' ? v_identity then raise exception 'main merchant already used or excluded';end if;
  v=business_prepare_case(p_user_id,jsonb_build_object('requestId',r.material_request,'userInputHash',md5(v_candidate::text),'merchant',v_candidate->'merchant','selectionReason',p_input->>'reason'));
  update business_job_runs set case_id=(v->'dailyCase'->>'id')::uuid,candidate=v_candidate,rule_version=p_input->>'ruleVersion',selection_reason=p_input->>'reason',material_hash=md5(v_candidate::text) where id=r.id returning * into r;return business_job_run_dto(r);
 elsif p_operation='ticket' then
  select * into a from business_job_attempts where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then raise exception 'request ticket already issued; outcome may be unknown';end if;
  if p_input->>'kind'='ai' then perform business_job_assert(p_user_id,p_input,true);end if;
  if p_input->>'stage'='inspect' and r.case_id is null then raise exception 'reserve daily slot before inspect HTTP';end if;
  if jsonb_typeof(r.settings->(case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end)) is distinct from 'number' then raise exception 'valid frozen numeric request budget required';end if;
  if (r.settings->>(case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end))::numeric%1<>0 then raise exception 'integer frozen request budget required';end if;
  select count(*) into v_count from business_job_attempts where user_id=p_user_id and run_id=r.id and kind=p_input->>'kind';v_budget=(r.settings->>case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end)::integer;
  if v_budget is null or (p_input->>'kind'='http' and v_budget not between 1 and 1000) or (p_input->>'kind'='ai' and v_budget not between 0 and 10) then raise exception 'valid frozen request budget required';end if;
  if v_count>=v_budget then raise exception 'daily request budget exhausted';end if;
  if p_input->>'kind'='http' and p_input->>'stage'='discovery' and v_count>=v_budget-1 then raise exception 'HTTP discovery budget exhausted; one request reserved for shop inspection';end if;
  if p_input->>'kind'='ai' and v_count>0 then raise exception 'AI result may be unknown; no automatic retry';end if;
  insert into business_job_attempts(user_id,run_id,request_id,kind,stage,operation_reference) values(p_user_id,r.id,(p_input->>'requestId')::uuid,p_input->>'kind',p_input->>'stage',case when p_input->>'kind'='ai' then 'business_teardown_report:'||r.report_request::text else null end) returning * into a;return to_jsonb(a);
 elsif p_operation='settle' then
  select * into a from business_job_attempts where user_id=p_user_id and run_id=r.id and id=(p_input->>'ticketId')::uuid for update;
  if not found then raise exception 'ticket unavailable';end if;
  if a.receipt is not null then if a.receipt<>p_input-array['runId','leaseToken','settings','statusUnused'] then raise exception 'attempt receipt conflict';end if;return to_jsonb(a);end if;
  if a.kind='ai' then perform business_job_assert(p_user_id,p_input,true);end if;
  update business_job_attempts set status=p_input->>'status',usage=nullif(p_input->'usage','null'::jsonb),receipt=p_input-array['runId','leaseToken','settings','statusUnused'],settled_at=clock_timestamp() where id=a.id returning * into a;return to_jsonb(a);
 elsif p_operation='material' then
  if r.material_status='ready' then return business_job_run_dto(r);end if;
  if r.case_id is null or r.candidate is null then raise exception 'reserved official candidate required';end if;
  if p_input->'merchant' is distinct from r.candidate->'merchant' or p_input->'snapshot'->>'itemId' is distinct from r.candidate->>'itemCode' or p_input->'snapshot'->>'origin' is distinct from 'official_api' or p_input->'snapshot'->>'capturedText' is not null or exists(select 1 from jsonb_each(p_input->'snapshot'->'structured') e where jsonb_typeof(e.value) not in('string','number','boolean','null')) then raise exception 'automatic material must be official public scalar fields';end if;
  perform business_save_case_material(p_user_id,jsonb_build_object('requestId',r.material_request,'operation','primary','userInputHash',r.material_hash,'merchant',p_input->'merchant','snapshot',p_input->'snapshot','selectionReason',r.selection_reason));
  update business_job_runs set material_status='ready' where id=r.id returning * into r;return business_job_run_dto(r);
 elsif p_operation='ai_start' then
  if (s.payload->>'autoAI')::boolean is distinct from true then return jsonb_build_object('status','not_permitted');end if;
  perform business_job_assert(p_user_id,p_input,true);
  if r.material_status<>'ready' then raise exception 'material not ready';end if;
  if exists(select 1 from business_report_requests where user_id=p_user_id and request_id=r.report_request) then raise exception 'AI request already started; result may be unknown';end if;
  select * into c from business_daily_cases where user_id=p_user_id and id=r.case_id;
  select coalesce(jsonb_agg(x.snapshot_id order by x.snapshot_id) filter(where x.role in('primary','product')),'[]'::jsonb),coalesce(jsonb_agg(x.snapshot_id order by x.snapshot_id) filter(where x.role='comparison'),'[]'::jsonb) into v_snapshots,v_comparisons from business_case_members x join business_material_snapshots t on t.id=x.snapshot_id and t.user_id=x.user_id where x.user_id=p_user_id and x.case_id=c.id and t.platform='rakuten' and t.origin='official_api' and t.capture_scope='api_fields' and t.captured_text is null and t.erased_at is null;
  if jsonb_array_length(v_snapshots)=0 then raise exception 'no official scalar primary materials';end if;
  select coalesce(max(revision),0) into v_revision from business_case_revisions where user_id=p_user_id and case_id=c.id;
  v=jsonb_build_object('caseId',c.id,'materialRevision',c.revision,'snapshotIds',v_snapshots,'comparisonSnapshotIds',v_comparisons,'publicExcerptDeidentified',true,'requestId',r.report_request);
  v_consent=business_report_command(p_user_id,'consent',v);insert into business_job_child_consents values((v_consent->>'id')::uuid,p_user_id,r.id,r.parent_consent_version,r.settings_revision);
  update business_job_runs set child_consent_id=(v_consent->>'id')::uuid,report_status='started',publication_base=c.published_revision_id where id=r.id;
  v_start=business_report_command(p_user_id,'start',(v-'publicExcerptDeidentified')||jsonb_build_object('consentId',v_consent->>'id','expectedReportRevision',v_revision));return v_start;
 elsif p_operation='verify_ai' then
  if p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;return business_report_command(p_user_id,'verify',p_input->'draftLease');
 elsif p_operation='finish' then
  if p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;
  if not exists(select 1 from business_job_attempts where user_id=p_user_id and run_id=r.id and kind='ai' and status='completed') then raise exception 'completed AI ticket required before finalization';end if;
  perform set_config('business.job_finish',r.id::text,true);
  v_report=business_report_command(p_user_id,'finish',(p_input->'draftLease')||jsonb_build_object('report',p_input->'report'));
  select * into c from business_daily_cases where user_id=p_user_id and id=r.case_id;
  perform business_report_command(p_user_id,'publish',jsonb_build_object('caseId',c.id,'reportId',v_report->>'id','expectedPublishedReportId',r.publication_base,'requestId',r.report_request));
  v=jsonb_build_object('status','completed','runId',r.id,'caseId',c.id,'reportId',v_report->>'id');
  update business_job_runs set status='completed',report_status='published',result=v,finished_at=clock_timestamp() where id=r.id;return v;
 elsif p_operation='complete' then
  if r.material_status<>'ready' then raise exception 'materials not ready';end if;
  v=jsonb_build_object('status','materials_ready','runId',r.id,'caseId',r.case_id,'message',p_input->>'message');update business_job_runs set status='materials_ready',report_status='not_permitted',message=p_input->>'message',result=v,finished_at=clock_timestamp() where id=r.id;return v;
 end if;
 raise exception 'unknown business job operation';
end$$;
alter table business_job_source_cursors enable row level security;alter table business_job_settings enable row level security;alter table business_job_setting_receipts enable row level security;alter table business_job_candidates enable row level security;alter table business_job_runs enable row level security;alter table business_job_attempts enable row level security;alter table business_job_child_consents enable row level security;
revoke all on business_job_source_cursors,business_job_settings,business_job_setting_receipts,business_job_candidates,business_job_runs,business_job_attempts,business_job_child_consents from public,anon,authenticated,service_role;
grant select on business_job_settings,business_job_runs,business_job_attempts to service_role;
revoke all on function business_job_command(uuid,text,jsonb),business_job_assert(uuid,jsonb,boolean),business_excluded_merchants(uuid),business_report_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function business_job_command(uuid,text,jsonb),business_report_command(uuid,text,jsonb) to service_role;
commit;






-- ============================================================================
-- Synced migration: 122_business_teardown_followups.sql
-- ============================================================================
begin;
-- Every learning record is historical. Receipts retain a digest, never another copy of a quotation.
create function public.business_learning_now() returns timestamptz language sql volatile set search_path=public,pg_temp as $$select clock_timestamp()$$;
create table public.business_learning_entries(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,
 operation text not null check(operation in('identity','expectation','followup','correction','method')),payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default business_learning_now(),identity_version bigint,left_merchant_id uuid,right_merchant_id uuid,
 report_id uuid,snapshot_id uuid,expectation_id uuid,lesson_id uuid,
 unique(user_id,id),unique(user_id,case_id,id),unique(user_id,identity_version),
 foreign key(user_id,case_id) references business_daily_cases(user_id,id),
 foreign key(user_id,left_merchant_id) references business_merchants(user_id,id),foreign key(user_id,right_merchant_id) references business_merchants(user_id,id),
 foreign key(user_id,report_id) references business_case_revisions(user_id,id),foreign key(user_id,snapshot_id) references business_material_snapshots(user_id,id),
 foreign key(user_id,case_id,expectation_id) references business_learning_entries(user_id,case_id,id),
 check((operation='identity')=(identity_version is not null)),check(operation<>'identity' or (left_merchant_id is not null and right_merchant_id is not null and left_merchant_id<right_merchant_id))
);
create unique index business_lessons_owner_id_learning on business_case_lessons(user_id,id);
alter table business_learning_entries add foreign key(user_id,lesson_id) references business_case_lessons(user_id,id);
create table public.business_learning_receipts(user_id uuid not null references auth.users(id),request_id uuid not null,input_hash text not null,entry_id uuid not null,primary key(user_id,request_id),foreign key(user_id,entry_id) references business_learning_entries(user_id,id));
create table public.business_learning_sources(user_id uuid not null,entry_id uuid not null,snapshot_id uuid not null,primary key(entry_id,snapshot_id),foreign key(user_id,entry_id) references business_learning_entries(user_id,id),foreign key(user_id,snapshot_id) references business_material_snapshots(user_id,id));
create table public.business_learning_report_reviews(user_id uuid not null,correction_id uuid not null,report_id uuid not null,section_keys jsonb not null check(jsonb_typeof(section_keys)='array'),primary key(correction_id,report_id),foreign key(user_id,correction_id) references business_learning_entries(user_id,id),foreign key(user_id,report_id) references business_case_revisions(user_id,id));
create table public.business_learning_erasures(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,snapshot_id uuid,report_id uuid,created_at timestamptz not null default business_learning_now(),foreign key(user_id,case_id) references business_daily_cases(user_id,id),foreign key(user_id,snapshot_id) references business_material_snapshots(user_id,id),foreign key(user_id,report_id) references business_case_revisions(user_id,id),check((snapshot_id is null)<>(report_id is null)));
create index business_learning_case_history on business_learning_entries(user_id,case_id,created_at desc,id desc);
create index business_learning_methods on business_learning_entries(user_id,created_at desc,id desc) where operation='method';

create function public.business_learning_entry_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='UPDATE' and coalesce(auth.role(),'')='service_role' and current_setting('business.learning_erase',true)=old.user_id::text and old.operation='followup'
 and new.payload=old.payload||jsonb_build_object('quote','') and new.payload->>'quote'='' and
 (to_jsonb(new)-'payload')=(to_jsonb(old)-'payload') then return new;end if;
 raise exception 'business learning history is immutable';
end$$;
create trigger business_learning_entries_immutable before update or delete on business_learning_entries for each row execute function business_learning_entry_guard();
do $$declare t text;begin foreach t in array array['business_learning_receipts','business_learning_sources','business_learning_report_reviews','business_learning_erasures'] loop execute format('create trigger learning_immutable before update or delete on %I for each row execute function business_immutable()',t);end loop;end$$;

-- Only explicitly confirmed latest events form edges; names never participate in identity.
create function public.business_learning_component(p_user_id uuid,p_merchant_id uuid) returns setof uuid language sql stable security definer set search_path=public,pg_temp as $$
 with recursive latest as (select distinct on(left_merchant_id,right_merchant_id) left_merchant_id l,right_merchant_id r,payload->>'action' action from business_learning_entries where user_id=p_user_id and operation='identity' order by left_merchant_id,right_merchant_id,identity_version desc),
 edges as (select l,r from latest where action='link' union all select r,l from latest where action='link'),
 reached(id) as (select id from business_merchants where user_id=p_user_id and id=p_merchant_id union select e.r from reached c join edges e on e.l=c.id)
 select id from reached
$$;
create or replace function public.business_excluded_merchants(p_user_id uuid) returns text[] language plpgsql stable security definer set search_path=public,pg_temp as $$declare result text[];begin
 perform business_service(p_user_id);
 select coalesce(array_agg(distinct m.platform||':'||m.platform_shop_id),array[]::text[]) into result from business_daily_cases c cross join lateral business_learning_component(p_user_id,c.merchant_id) component(id) join business_merchants m on m.id=component.id and m.user_id=p_user_id where c.user_id=p_user_id;
 return result;
end$$;
create function public.business_learning_case_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform business_service(new.user_id);
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,722));
 if exists(select 1 from business_daily_cases c where c.user_id=new.user_id and c.merchant_id in(select business_learning_component(new.user_id,new.merchant_id))) then raise exception 'main merchant already used or linked to an excluded merchant';end if;
 return new;
end$$;
create trigger business_learning_case_dedupe before insert on business_daily_cases for each row execute function business_learning_case_guard();

create function public.business_learning_dto(e business_learning_entries) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'operation',e.operation,'caseId',e.case_id,'createdAt',e.created_at,'payload',e.payload,
 'sourceInvalidated',exists(select 1 from business_learning_sources d join business_material_snapshots s on s.id=d.snapshot_id and s.user_id=d.user_id where d.user_id=e.user_id and d.entry_id=e.id and s.erased_at is not null) or exists(select 1 from business_case_revisions r where r.user_id=e.user_id and r.id=e.report_id and r.erased_at is not null),
 'reviewNeeded',exists(select 1 from business_learning_sources d join business_learning_entries correction on correction.user_id=d.user_id and correction.snapshot_id=d.snapshot_id and correction.operation='correction' where d.user_id=e.user_id and d.entry_id=e.id and correction.id<>e.id) or exists(select 1 from business_learning_report_reviews r where r.user_id=e.user_id and r.report_id=e.report_id))
$$;
create function public.business_learning_text(p_input jsonb,p_key text,p_max integer default 3000) returns void language plpgsql set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p_input->p_key) is distinct from 'string' or length(trim(p_input->>p_key))=0 or length(p_input->>p_key)>p_max then raise exception 'invalid learning text: %',p_key;end if;
end$$;
create function public.business_learning_uuid(p_input jsonb,p_key text) returns uuid language plpgsql set search_path=public,pg_temp as $$declare v uuid;begin
 if jsonb_typeof(p_input->p_key) is distinct from 'string' then raise exception 'invalid learning identifier: %',p_key;end if;v:=(p_input->>p_key)::uuid;if v is null then raise exception 'missing learning identifier';end if;return v;
end$$;

create function public.business_learning_section_keys(p_payload jsonb,p_snapshot uuid) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(distinct section->>'key'),'[]'::jsonb) from jsonb_array_elements(coalesce(p_payload->'sections','[]')) section
 where exists(select 1 from jsonb_array_elements(coalesce(section->'observations','[]')) observation where observation->>'snapshotId'=p_snapshot::text)
 or exists(select 1 from jsonb_array_elements(coalesce(section->'interpretations','[]')) interpretation cross join lateral jsonb_array_elements(coalesce(interpretation->'refs','[]')) ref where ref->>'snapshotId'=p_snapshot::text)
$$;
-- Date-only manual sightings cannot establish an ordering within the prediction's local day.
create function public.business_learning_seen_after(p_seen jsonb,p_prediction timestamptz,p_now timestamptz) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$declare seen_date date;seen_text text;begin
 if jsonb_typeof(p_seen) is distinct from 'string' then return false;end if;seen_text:=p_seen#>>'{}';
 if seen_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
 begin seen_date:=seen_text::date;exception when invalid_datetime_format or datetime_field_overflow then return false;end;
 return to_char(seen_date,'YYYY-MM-DD')=seen_text and seen_date>(p_prediction at time zone 'Asia/Tokyo')::date and seen_date<=(p_now at time zone 'Asia/Tokyo')::date;
end$$;
create function public.business_learning_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request uuid;v_case uuid;v_report uuid;v_snapshot uuid;v_expectation uuid;v_lesson uuid;v_left uuid;v_right uuid;v_version bigint;v_now timestamptz;v_hash text;v_keys text[];k text;e business_learning_entries;prediction business_learning_entries;r business_learning_receipts;s business_material_snapshots;base business_material_snapshots;rep business_case_revisions;v_payload jsonb;v_outcome text;v_report_ids uuid[];
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>40000 or p_operation is null or p_operation not in('identity','expectation','followup','correction','method') or p_input->>'operation' is distinct from p_operation then raise exception 'invalid learning operation';end if;
 v_request:=business_learning_uuid(p_input,'requestId');v_case:=business_learning_uuid(p_input,'caseId');v_hash:=md5(p_input::text);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,722));
 select * into r from business_learning_receipts where user_id=p_user_id and request_id=v_request;
 if found then if r.input_hash is distinct from v_hash then raise exception 'learning request payload conflict';end if;select * into e from business_learning_entries where user_id=p_user_id and id=r.entry_id;return business_learning_dto(e);end if;
 if not exists(select 1 from business_daily_cases where user_id=p_user_id and id=v_case) then raise exception 'learning case owner unavailable' using errcode='42501';end if;
 v_keys:=array['operation','requestId','caseId']||case p_operation when 'identity' then array['expectedVersion','leftMerchantId','rightMerchantId','leftSource','rightSource','reason','confirmed','action'] when 'expectation' then array['reportId','baselineSnapshotId','question','scope','deadline','supportCriteria','refuteCriteria'] when 'followup' then array['expectationId','snapshotId','outcome','quote','sameScopeConfirmed','scope','note','accessStatus','coverage'] when 'correction' then array['snapshotId','explanation'] else array['reportId','method','scenario','conditions','failureConditions','unknowns','confirmed','lessonId'] end;
 if exists(select 1 from jsonb_object_keys(p_input) key where not(key=any(v_keys))) then raise exception 'unsupported learning field; timestamps are database owned';end if;
 v_now:=business_learning_now();v_payload:=p_input-array['operation','requestId','caseId'];
 if p_operation='identity' then
  v_left:=business_learning_uuid(p_input,'leftMerchantId');v_right:=business_learning_uuid(p_input,'rightMerchantId');
  if v_left=v_right or p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' or (p_input->>'expectedVersion') !~ '^[0-9]+$' or coalesce(p_input->>'action','') not in('link','revoke') then raise exception 'invalid identity confirmation/version';end if;
  foreach k in array array['leftSource','rightSource','reason'] loop perform business_learning_text(p_input,k);end loop;
  if (select count(*) from business_merchants where user_id=p_user_id and id in(v_left,v_right))<>2 then raise exception 'merchant owner unavailable' using errcode='42501';end if;
  select coalesce(max(identity_version),0) into v_version from business_learning_entries where user_id=p_user_id and operation='identity';
  if v_version is distinct from (p_input->>'expectedVersion')::bigint then raise exception 'identity version conflict';end if;v_version:=v_version+1;
  if p_input->>'action'='revoke' and (select payload->>'action' from business_learning_entries where user_id=p_user_id and left_merchant_id=least(v_left,v_right) and right_merchant_id=greatest(v_left,v_right) and operation='identity' order by identity_version desc limit 1) is distinct from 'link' then raise exception 'identity link unavailable';end if;
 elsif p_operation='expectation' then
  v_report:=business_learning_uuid(p_input,'reportId');v_snapshot:=business_learning_uuid(p_input,'baselineSnapshotId');
  foreach k in array array['question','scope','supportCriteria','refuteCriteria'] loop perform business_learning_text(p_input,k);end loop;perform business_learning_text(p_input,'deadline',100);
  if not isfinite((p_input->>'deadline')::timestamptz) or (p_input->>'deadline')::timestamptz<=v_now then raise exception 'expectation deadline must be future';end if;
 elsif p_operation='followup' then
  v_expectation:=business_learning_uuid(p_input,'expectationId');v_snapshot:=business_learning_uuid(p_input,'snapshotId');
  if coalesce(p_input->>'outcome','') not in('support','refute','unknown') or coalesce(p_input->>'accessStatus','') not in('public','partial','login_required','unavailable') or coalesce(p_input->>'coverage','') not in('complete','insufficient','failed_fetch','list_absence') or jsonb_typeof(p_input->'sameScopeConfirmed') is distinct from 'boolean' or jsonb_typeof(p_input->'quote') is distinct from 'string' or length(p_input->>'quote')>12000 then raise exception 'invalid followup fields';end if;
  perform business_learning_text(p_input,'scope');perform business_learning_text(p_input,'note');
  select * into prediction from business_learning_entries where user_id=p_user_id and case_id=v_case and id=v_expectation and operation='expectation';if not found then raise exception 'expectation owner unavailable' using errcode='42501';end if;
  v_report:=prediction.report_id;select * into base from business_material_snapshots where user_id=p_user_id and id=prediction.snapshot_id;
 elsif p_operation='correction' then
  v_snapshot:=business_learning_uuid(p_input,'snapshotId');perform business_learning_text(p_input,'explanation',6000);
 else
  v_report:=business_learning_uuid(p_input,'reportId');if p_input ? 'lessonId' then v_lesson:=business_learning_uuid(p_input,'lessonId');end if;
  foreach k in array array['method','scenario','conditions','failureConditions','unknowns'] loop perform business_learning_text(p_input,k,6000);end loop;
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'method requires user confirmation';end if;
  if v_lesson is not null and not exists(select 1 from business_case_lessons where user_id=p_user_id and case_id=v_case and report_id=v_report and id=v_lesson) then raise exception 'lesson owner/report unavailable' using errcode='42501';end if;
 end if;
 if v_report is not null then
  select * into rep from business_case_revisions where user_id=p_user_id and case_id=v_case and id=v_report and erased_at is null;
  if not found then raise exception 'report owner unavailable' using errcode='42501';end if;
 end if;
 if v_snapshot is not null then
  select material.* into s from business_material_snapshots material join business_case_members member on member.user_id=material.user_id and member.snapshot_id=material.id where material.user_id=p_user_id and material.id=v_snapshot and member.case_id=v_case and material.erased_at is null;
  if not found then raise exception 'snapshot owner/case unavailable' using errcode='42501';end if;
  if s.captured_at>v_now then raise exception 'future source unavailable';end if;
 end if;
 if p_operation='expectation' then
  if not exists(select 1 from jsonb_array_elements(rep.manifest) src where src->>'id'=v_snapshot::text) then raise exception 'baseline absent from selected report manifest';end if;
 elsif p_operation='followup' then
  if s.captured_at<=prediction.created_at then raise exception 'followup source must be obtained after prediction';end if;
  if length(trim(p_input->>'quote'))>0 and position((p_input->>'quote') in coalesce(s.captured_text,''))=0 then raise exception 'followup quote must be exact source text';end if;
  v_outcome:=p_input->>'outcome';
  if v_now<(prediction.payload->>'deadline')::timestamptz or p_input->'sameScopeConfirmed'<>'true'::jsonb or p_input->>'scope' is distinct from prediction.payload->>'scope' or length(trim(p_input->>'quote'))=0 or p_input->>'accessStatus'<>'public' or p_input->>'coverage'<>'complete' or coalesce(s.structured->>'accessStatus','public')<>'public' or base.erased_at is not null or s.merchant_id is distinct from base.merchant_id or (nullif(s.item_id,'') is not null and nullif(base.item_id,'') is not null and s.item_id is distinct from base.item_id) or ((s.origin='manual_excerpt' or s.structured ? 'dateSeen') and not business_learning_seen_after(s.structured->'dateSeen',prediction.created_at,v_now)) then v_outcome:='unknown';end if;
  v_payload:=v_payload||jsonb_build_object('outcome',v_outcome);
 end if;
 if p_operation='correction' then
  v_payload:=v_payload||jsonb_build_object('dependencies',coalesce((select jsonb_agg(distinct label order by label) from (
   select '报告版本 '||revision.revision||' · '||case section_key when 'offering' then '卖什么' when 'trigger' then '购买触发' when 'buyers' then '谁在购买' when 'volume' then '热销依据' when 'journey' then '购买路径' when 'value' then '交付价值' when 'operations' then '运营条件' when 'economics' then '成本与收入' when 'comparison' then '对照材料' when 'failure_conditions' then '失效条件' when 'transfer' then '可迁移方法' when 'experiment' then '下一步验证' else '引用来源' end label
   from business_case_revisions revision cross join lateral jsonb_array_elements_text(case when jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0 then business_learning_section_keys(revision.payload,v_snapshot) else '["source"]'::jsonb end) section(section_key)
   where revision.user_id=p_user_id and (exists(select 1 from jsonb_array_elements(revision.manifest) src where src->>'id'=v_snapshot::text) or jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0)
   union all select '本人确认的方法 · 引用受影响报告' from business_learning_entries method join business_learning_sources dep on dep.user_id=method.user_id and dep.entry_id=method.id where method.user_id=p_user_id and method.operation='method' and dep.snapshot_id=v_snapshot
   union all select '本人确认的经验 · 引用受影响报告' from business_case_lessons lesson join business_case_revisions revision on revision.user_id=lesson.user_id and revision.id=lesson.report_id where lesson.user_id=p_user_id and (exists(select 1 from jsonb_array_elements(revision.manifest) src where src->>'id'=v_snapshot::text) or jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0)
   union all select '后续核对记录 · 引用该来源' from business_learning_entries followup join business_learning_sources dep on dep.user_id=followup.user_id and dep.entry_id=followup.id where followup.user_id=p_user_id and followup.operation='followup' and dep.snapshot_id=v_snapshot
  ) affected),'[]'::jsonb));
 end if;
 insert into business_learning_entries(user_id,case_id,operation,payload,created_at,identity_version,left_merchant_id,right_merchant_id,report_id,snapshot_id,expectation_id,lesson_id)
 values(p_user_id,v_case,p_operation,v_payload,v_now,v_version,least(v_left,v_right),greatest(v_left,v_right),v_report,v_snapshot,v_expectation,v_lesson) returning * into e;
 if v_snapshot is not null then insert into business_learning_sources values(p_user_id,e.id,v_snapshot);end if;
 if p_operation='followup' then insert into business_learning_sources values(p_user_id,e.id,prediction.snapshot_id) on conflict do nothing;end if;
 if v_report is not null then insert into business_learning_sources select p_user_id,e.id,snap.id from business_material_snapshots snap where snap.user_id=p_user_id and exists(select 1 from jsonb_array_elements(rep.manifest) src where src->>'id'=snap.id::text) on conflict do nothing;end if;
 if p_operation='correction' then
  insert into business_learning_report_reviews(user_id,correction_id,report_id,section_keys)
  select p_user_id,e.id,revision.id,business_learning_section_keys(revision.payload,v_snapshot)
  from business_case_revisions revision where revision.user_id=p_user_id and (exists(select 1 from jsonb_array_elements(revision.manifest) src where src->>'id'=v_snapshot::text) or jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0);
 end if;
 insert into business_learning_receipts values(p_user_id,v_request,v_hash,e.id);
 return business_learning_dto(e);
end$$;

create function public.business_learning_read(p_user_id uuid,p_case_id uuid,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;boundary business_learning_entries;v_items jsonb;v_more boolean;v_next uuid;v_merchants jsonb;v_duplicates jsonb;begin
 perform business_service(p_user_id);select * into c from business_daily_cases where user_id=p_user_id and id=p_case_id;if not found then raise exception 'learning case owner unavailable' using errcode='42501';end if;
 if p_before is not null then select * into boundary from business_learning_entries where user_id=p_user_id and case_id=p_case_id and id=p_before;if not found then raise exception 'learning cursor unavailable' using errcode='42501';end if;end if;
 select coalesce(jsonb_agg(business_learning_dto(page) order by page.created_at desc,page.id desc),'[]'::jsonb) into v_items from(select * from business_learning_entries where user_id=p_user_id and case_id=p_case_id and (p_before is null or (created_at,id)<(boundary.created_at,boundary.id)) order by created_at desc,id desc limit 50) page;
 v_next:=(v_items->-1->>'id')::uuid;
 select exists(select 1 from business_learning_entries where user_id=p_user_id and case_id=p_case_id and (created_at,id)<((select created_at from business_learning_entries where id=v_next),v_next)) into v_more;
 select coalesce(jsonb_agg(jsonb_build_object('merchantId',m.id,'name',m.name,'platform',m.platform,'platformShopId',m.platform_shop_id,'caseIds',coalesce((select jsonb_agg(id order by local_date,id) from business_daily_cases where user_id=p_user_id and merchant_id=m.id),'[]'::jsonb)) order by m.created_at,m.id),'[]'::jsonb) into v_merchants from business_merchants m where m.user_id=p_user_id;
 select coalesce(jsonb_agg(id order by local_date,id),'[]'::jsonb) into v_duplicates from business_daily_cases where user_id=p_user_id and id<>p_case_id and merchant_id in(select business_learning_component(p_user_id,c.merchant_id));
 return jsonb_build_object('available',true,'version',(select coalesce(max(identity_version),0) from business_learning_entries where user_id=p_user_id),'items',v_items,'nextCursor',case when v_more then v_next else null end,'merchants',v_merchants,'duplicateCaseIds',v_duplicates);
end$$;

create function public.business_method_rows(p_user_id uuid) returns table(id uuid,created_at timestamptz,item jsonb) language sql stable security definer set search_path=public,pg_temp as $$
 select e.id,e.created_at,business_learning_dto(e) from business_learning_entries e where e.user_id=p_user_id and e.operation='method'
 union all
 select l.id,l.created_at,jsonb_build_object('id',l.id,'operation','method','caseId',l.case_id,'createdAt',l.created_at,'payload',l.payload||jsonb_build_object('source','confirmed_lesson'),
 'sourceInvalidated',r.erased_at is not null,'reviewNeeded',exists(select 1 from business_learning_report_reviews review where review.user_id=l.user_id and review.report_id=l.report_id)) from business_case_lessons l join business_case_revisions r on r.user_id=l.user_id and r.id=l.report_id where l.user_id=p_user_id
$$;
create function public.business_method_search(p_user_id uuid,p_query text,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare v_created timestamptz;v_items jsonb;v_next uuid;v_more boolean;begin
 perform business_service(p_user_id);if p_query is null or length(p_query)>500 then raise exception 'invalid method query';end if;
 if p_before is not null then select created_at into v_created from business_method_rows(p_user_id) where id=p_before;if not found then raise exception 'method cursor owner unavailable' using errcode='42501';end if;end if;
 select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_items from(select * from business_method_rows(p_user_id) where (p_before is null or (created_at,id)<(v_created,p_before)) and (trim(p_query)='' or position(lower(trim(p_query)) in lower(concat_ws(' ',item->'payload'->>'method',item->'payload'->>'scenario',item->'payload'->>'conditions',item->'payload'->>'failureConditions',item->'payload'->>'unknowns')))>0) order by created_at desc,id desc limit 51) page;
 v_more:=jsonb_array_length(v_items)>50;if v_more then v_items:=v_items-50;end if;v_next:=(v_items->-1->>'id')::uuid;
 return jsonb_build_object('available',true,'items',v_items,'nextCursor',case when v_more then v_next else null end);
end$$;

-- Keep the B/C erase behavior behind a single D-aware entry point and a consistent lock order.
alter function public.business_erase_content(uuid,uuid,uuid,uuid) rename to business_erase_content_before_learning;
revoke all on function public.business_erase_content_before_learning(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.business_erase_content(p_user_id uuid,p_case_id uuid,p_snapshot_id uuid default null,p_report_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform business_service(p_user_id);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,722));
 perform business_erase_content_before_learning(p_user_id,p_case_id,p_snapshot_id,p_report_id);
 insert into business_learning_erasures(user_id,case_id,snapshot_id,report_id) values(p_user_id,p_case_id,p_snapshot_id,p_report_id);
 perform set_config('business.learning_erase',p_user_id::text,true);
 update business_learning_entries e set payload=e.payload||jsonb_build_object('quote','') where e.user_id=p_user_id and e.operation='followup' and e.payload->>'quote'<>'' and (e.snapshot_id=p_snapshot_id or (p_report_id is not null and exists(select 1 from business_learning_entries prediction where prediction.user_id=e.user_id and prediction.id=e.expectation_id and prediction.report_id=p_report_id)));
 perform set_config('business.learning_erase','',true);
end$$;

do $$declare t text;begin foreach t in array array['business_learning_entries','business_learning_receipts','business_learning_sources','business_learning_report_reviews','business_learning_erasures'] loop execute format('alter table %I enable row level security',t);execute format('create policy learning_owner_read on %I for select to authenticated using(user_id=auth.uid())',t);execute format('revoke all on %I from public,anon,authenticated,service_role',t);execute format('grant select on %I to authenticated,service_role',t);end loop;end$$;
revoke all on function business_learning_component(uuid,uuid),business_learning_dto(business_learning_entries),business_learning_text(jsonb,text,integer),business_learning_section_keys(jsonb,uuid),business_learning_seen_after(jsonb,timestamptz,timestamptz),business_learning_uuid(jsonb,text),business_method_rows(uuid),business_learning_case_guard(),business_learning_entry_guard() from public,anon,authenticated,service_role;
revoke all on function business_learning_command(uuid,text,jsonb),business_learning_read(uuid,uuid,uuid),business_method_search(uuid,text,uuid),business_excluded_merchants(uuid),business_erase_content(uuid,uuid,uuid,uuid),business_learning_now() from public,anon,authenticated;
grant execute on function business_learning_command(uuid,text,jsonb),business_learning_read(uuid,uuid,uuid),business_method_search(uuid,text,uuid),business_excluded_merchants(uuid),business_erase_content(uuid,uuid,uuid,uuid) to service_role;
commit;



-- ============================================================================
-- Synced migration: 123_business_job_partial_drafts.sql
-- ============================================================================
begin;

alter table public.business_job_runs drop constraint business_job_runs_status_check;
alter table public.business_job_runs add constraint business_job_runs_status_check check(status in('running','materials_ready','completed','draft_ready','failed','unknown'));

create function public.business_job_draft_capability(p_user_id uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform business_service(p_user_id);
 return true;
end$$;

alter function public.business_job_command(uuid,text,jsonb) rename to business_job_command_v121;
revoke all on function public.business_job_command_v121(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.business_job_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_job_runs;v_report jsonb;v_result jsonb;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>250000 then raise exception 'invalid job input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));

 if p_operation='finish' and exists(select 1 from jsonb_array_elements(p_input->'report'->'sections') section where jsonb_typeof(section->'validationGaps')='array' and jsonb_array_length(section->'validationGaps')>0) then
  raise exception 'partial report requires draft finalization';
 end if;
 if p_operation<>'finish_draft' then return business_job_command_v121(p_user_id,p_operation,p_input);end if;

 -- A completed receipt is safe to replay after settings or leases have changed.
 select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid for update;
 if not found or r.lease_token is distinct from (p_input->>'leaseToken')::uuid then raise exception 'run owner unavailable' using errcode='42501';end if;
 if r.result is not null then
  if r.status<>'draft_ready' or p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'draft terminal receipt conflict';end if;
  return r.result;
 end if;
 r=business_job_assert(p_user_id,p_input,true);
 if r.material_status<>'ready' or p_input->'draftLease'->>'caseId' is distinct from r.case_id::text or p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;
 if not exists(select 1 from business_job_attempts where user_id=p_user_id and run_id=r.id and kind='ai' and status='completed') then raise exception 'completed AI ticket required before finalization';end if;

 perform set_config('business.job_finish',r.id::text,true);
 v_report=business_report_command(p_user_id,'finish',(p_input->'draftLease')||jsonb_build_object('report',p_input->'report'));
 v_result=jsonb_build_object('status','draft_ready','runId',r.id,'caseId',r.case_id,'reportId',v_report->>'id','message','部分报告与拦截记录已保存为草稿，请打开案例核对；未自动发布。');
 update business_job_runs set status='draft_ready',report_status='draft',result=v_result,message=v_result->>'message',finished_at=clock_timestamp() where id=r.id;
 return v_result;
end$$;

revoke all on function public.business_job_draft_capability(uuid),public.business_job_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.business_job_draft_capability(uuid),public.business_job_command(uuid,text,jsonb) to service_role;

commit;
