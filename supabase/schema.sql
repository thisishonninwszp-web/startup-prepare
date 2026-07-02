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
