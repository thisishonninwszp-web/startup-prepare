-- ============================================================================
-- 迁移 071：周刊
-- signal_issues：每周一期"中国有、日本还没有"。他挑这周的几条、每条写一句自己的判断（中文），
--   再挑几条公开对账；系统把核实过的事实和他的原话排成中文长文 / 小红书短帖 / 日文 note / 日文 X 四个版本。
--   中文版里他的判断由代码核对一字不改；日文版是 AI 翻译的。只搬运、不替他写观点。
-- published：发在了哪、链接；responses：读者回应（同时记成带「读者回应」标签的观察，材料还是只从一个口子进）。
-- 幂等，可重复执行。
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
