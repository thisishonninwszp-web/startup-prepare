-- ============================================================================
-- 迁移 004：外部信号 staging（独立爬虫子项目的落地表）
-- 爬虫只写这张表；主应用审阅后把好的条目"提升"为 observation。
-- 刻意独立于 observations——机器抓的批量噪音绝不能直接灌进捕捉入口，
-- 否则会污染痛点雷达聚类与观察计数（CLAUDE.md 第 3 条）。
-- 在 Supabase SQL Editor 整段执行一次即可。幂等，可重复执行。
-- ============================================================================

-- 待审 / 已提升 / 已忽略（三态，对齐项目"只做二元/少级"的取向，这里是流转状态非分类）
do $$ begin
  create type external_signal_status as enum ('pending', 'promoted', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists external_signals (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,            -- 'hackernews' | 'reddit' | 'v2ex' | 'web' ...
  source_id    text not null,            -- 源内唯一 id，用于去重
  url          text,
  title        text,
  raw_text     text not null,            -- 原始正文/摘要
  query        text,                     -- 触发抓取的关键词/主题（用途②③）
  status       external_signal_status not null default 'pending',
  promoted_observation_id uuid references observations (id) on delete set null,
  fetched_at   timestamptz not null default now(),
  -- 同一源的同一条目重复抓取不再新增（爬虫可安全重复跑）。
  constraint external_signals_uniq unique (source, source_id)
);

create index if not exists idx_external_signals_status
  on external_signals (status, fetched_at desc);

-- 与现有业务表一致：开启 RLS，单用户阶段由服务端 service role key 旁路访问。
alter table external_signals enable row level security;
