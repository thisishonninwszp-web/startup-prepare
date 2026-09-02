-- 技能拆解：让树自己长出来。
--
-- 问题不是"节点写不完"，是**用户不知道有哪些节点**。
-- 一个人说不出"要成为这个领域的专家，需要掌握哪些小技能" ——
-- 那本来就是他没有的知识量。这一层就是给这件事用的。
--
-- 所以拆解不再硬编码在代码里，而是可以由 AI 提名、用户收下之后存进这里。
-- 代码里的 SKILL_STAGES 只是**默认拆解**；这张表里有的，覆盖它。
--
-- 边界还是同一条：AI 只有提名权。
--   提名不写库，用户逐条改过、收下的才落到这里；
--   点亮某个小技能仍然要写 proof，AI 一个字都碰不到 self_skill_nodes。
--
-- nodes 里每个小技能自带一个稳定 id，节点 key = skill:tier:id。
-- 有了 id，以后改名、增删同级的小技能，都不会把已经点亮的证据挪位。

create table if not exists self_skill_stages (
  user_id    uuid not null references auth.users (id) on delete cascade,
  skill_key  text not null,
  tier       smallint not null check (tier between 1 and 4),
  -- 入门 / 基础 / 精通 / 专家
  stage_name text not null,
  -- 过了这一级算什么。
  standard   text not null,
  -- [{ id, name, test }]，每个 test 都要能判真假。
  nodes      jsonb not null default '[]'::jsonb,
  -- ai_nominated / hand_written
  source     text not null default 'ai_nominated',
  created_at timestamptz not null default now(),
  primary key (user_id, skill_key, tier)
);

alter table self_skill_stages enable row level security;

drop policy if exists "self_skill_stages_owner" on self_skill_stages;
create policy "self_skill_stages_owner" on self_skill_stages
  for all using (auth.uid() = user_id);

-- 044 建表时档位只到 3（那时还是三档 milestones）。
-- 现在是入门/基础/精通/专家四级，放开到 4。
alter table self_skill_nodes
  drop constraint if exists self_skill_nodes_tier_check;
alter table self_skill_nodes
  add constraint self_skill_nodes_tier_check check (tier between 1 and 4);
