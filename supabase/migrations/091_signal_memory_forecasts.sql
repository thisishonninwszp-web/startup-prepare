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
