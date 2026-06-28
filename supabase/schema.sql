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
