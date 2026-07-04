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
