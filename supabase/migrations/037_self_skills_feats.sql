-- 技能与专长。
--
-- 技能的成长规则来自 CoC：**只有实际用过并且有结果，才打一个勾**。
-- 所以这里有两张表：技能的当前值，和每一次打勾的流水。
-- 只存当前值不存流水，就没法回答"这 60 分是怎么涨上来的"——
-- 和这个模块其它地方一样，没有分母的数字不算数。
--
-- 专长来自 D&D：有前置、花专长点、给具体效果。
-- 定义（45 项技能 / 12 个专长及其前置树）写在
-- lib/domains/self-model/skills.ts，不进数据库：它们是静态规则，
-- 放代码里才能被 TypeScript 和单元测试守住，也才轮不到 AI 去改。

create table if not exists self_skills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  skill_key  text not null,
  value      smallint not null default 0 check (value between 0 and 100),
  -- 🔥 0–2：没人要求你也会做的程度。只影响成长速度，不直接进数值。
  passion    smallint not null default 0 check (passion between 0 and 2),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint self_skills_one_per_key unique (user_id, skill_key)
);

create index if not exists idx_self_skills_user
  on self_skills (user_id, value desc);

-- 打勾流水：一次"用过并且有结果"。note 写清楚用在哪，否则勾就是空的。
create table if not exists self_skill_ticks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  skill_key   text not null,
  occurred_on date not null default current_date,
  note        text not null,
  -- 关联到产生它的东西（触发窗口 / 预测 / 训练 / 互动）。
  ref         jsonb,
  -- 结算后置为该次结算的时间，之后不再参与成长。
  settled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_self_skill_ticks_user
  on self_skill_ticks (user_id, skill_key, occurred_on desc);
create index if not exists idx_self_skill_ticks_open
  on self_skill_ticks (user_id, skill_key) where settled_at is null;

create table if not exists self_feats (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  feat_key text not null,
  taken_on date not null default current_date,
  constraint self_feats_one_per_key unique (user_id, feat_key)
);

alter table self_skills      enable row level security;
alter table self_skill_ticks enable row level security;
alter table self_feats       enable row level security;

drop policy if exists "self_skills_owner" on self_skills;
create policy "self_skills_owner" on self_skills
  for all using (auth.uid() = user_id);

drop policy if exists "self_skill_ticks_owner" on self_skill_ticks;
create policy "self_skill_ticks_owner" on self_skill_ticks
  for all using (auth.uid() = user_id);

drop policy if exists "self_feats_owner" on self_feats;
create policy "self_feats_owner" on self_feats
  for all using (auth.uid() = user_id);
