-- ============================================================================
-- 迁移 053：外部信号的每日精选 + 读新闻用的"关于你"
-- signal_profiles：用户自己写的几句背景，AI 挑新闻、分析新闻时拿它当上下文。
-- signal_briefs：每天一份精选（新闻一份、工具一份），由 cron 生成，页面只读。
-- 精选只是"挑出来并说明为什么"，不打分、不排名（原则 1）。
-- 幂等，可重复执行。
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
