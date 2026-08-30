-- 特性层：挂在子属性上的带符号修正。
--
-- 这一层最重要的一条：**品级是算出来的，不是评出来的。**
-- 一条特性的修正如果有正有负、且落在不同主属性上，它自动是「暗金 · 双刃」；
-- 全正是资产，全负是负债，属于某个套装的是套装。
-- 规则在 lib/domains/self-model/traits.ts，AI 只能提名特性，不能授予品级。
--
-- 防通胀靠两件事，都不靠自觉：
--   1) 互斥光谱 —— 同一根光谱上只能有一条在持有中（下面的唯一索引）。
--      稀缺来自互斥，不来自配额喊话。
--   2) 品级配额 —— 史诗 ≤2 / 传说 ≤1 / 暗金 ≤2，在 TS 里结算时执行。
--
-- 传说级（不可交易）的门槛单独说：必须填 refused_offer ——
-- 你得举出一次为它推掉的具体好处。说不出那次拒绝的，只是没被考验过的漂亮话。

create table if not exists self_traits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- 光谱名（例："收敛" / "接触" / "更新"）。同一根光谱同时只能持有一条。
  spectrum_key  text not null,
  name          text not null,
  -- 挂载的修正：[{ sub: "wis.contact", sign: "plus" | "minus", note: "…" }]
  -- sub 必须是 panel.ts 里存在的子属性 key，写入前由 server action 校验。
  modifiers     jsonb not null default '[]'::jsonb,
  -- 反噬条件 / 装备条件：双刃特性必填，否则它只是一句夸奖。
  backfire      text,
  equip_note    text,
  -- 套装标记。同 set_key 的特性凑齐才解锁效果。
  set_key       text,
  set_effect    text,
  -- 传说级门槛：你曾经为它推掉的一个具体好处。
  refused_offer text,
  -- 关联的假设（证据从那边借）。
  hypothesis_id uuid references self_hypotheses (id) on delete set null,
  status        text not null default 'held'
                check (status in ('held', 'faded')),
  first_held_on date not null default current_date,
  faded_at      timestamptz,
  created_at    timestamptz not null default now()
);

-- 互斥光谱：同一用户、同一根光谱，持有中的特性只能有一条。
create unique index if not exists idx_self_traits_spectrum_uniq
  on self_traits (user_id, spectrum_key)
  where status = 'held';

create index if not exists idx_self_traits_user
  on self_traits (user_id, status, first_held_on desc);

alter table self_traits enable row level security;

drop policy if exists "self_traits_owner" on self_traits;
create policy "self_traits_owner" on self_traits
  for all using (auth.uid() = user_id);
