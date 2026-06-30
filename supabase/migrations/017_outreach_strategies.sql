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
