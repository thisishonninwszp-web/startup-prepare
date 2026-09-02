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
