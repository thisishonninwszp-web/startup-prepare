-- 用户自己收下的技能：让树长到代码没写过的领域。
--
-- 骨架固定的时候，树只能长到我预先写下的那些地方 —— 而
-- 「我该掌握哪些技能」恰恰是用户没有的知识量，这正是模型该出力的地方。
--
-- 所以这一层允许 AI 提名骨架上缺的技能。边界还是那条：
--   AI 只有提名权。提名不写库，用户逐条改过、收下的才落到这里；
--   落进来的技能和内置的走同一套规则 —— 同样的前置、同样要写 proof 才点亮。
--
-- requires 里只允许写已经存在的技能 key，而且层不能高于自己：
--   这条在服务端再校验一次，否则一条乱写的前置会让树出现环。
--
-- milestones 是三档兜底（[{name, test}]）—— 新技能一进来就得能点，
-- 没有它这项技能在树上会是一个点不动的空壳。

create table if not exists self_custom_skills (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  name       text not null,
  gloss      text not null,
  -- info / express / make / run / self / relate
  skill_group text not null,
  -- STR CON DEX INT WIS CHA WIL LCK RES
  main       text not null,
  -- component / circuit / module / core / signature
  layer      text not null,
  requires   jsonb not null default '[]'::jsonb,
  -- [{ name, test }] × 3
  milestones jsonb not null default '[]'::jsonb,
  -- 为什么提这条，留着以后回看
  because    text,
  source     text not null default 'ai_nominated',
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table self_custom_skills enable row level security;

drop policy if exists "self_custom_skills_owner" on self_custom_skills;
create policy "self_custom_skills_owner" on self_custom_skills
  for all using (auth.uid() = user_id);
