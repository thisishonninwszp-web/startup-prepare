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
