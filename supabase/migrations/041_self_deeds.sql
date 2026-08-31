-- 事迹与参照类。
--
-- /self 到现在有统计（属性）和模式（特性），没有**事件**。
-- 但一个人也是他做过的那些具体的事，而且更要紧的是：
-- 没有历史，就没有参照类；没有参照类，"未来预想"永远只能靠想象。
--
-- 这张表的唯一存在理由是**基准率**：
--   你自发启动 9 件事 · 做完 4 · 有人用 1 · 中位 3.5 个月
--   → 下一条路径的先验
-- 所以字段是围绕"一条基准率需要什么"设计的，不是围绕"怎么写好看"。
-- 一条事迹如果进不了任何参照类，它就不该记在这里。
--
-- occurred_on 允许粗到月：补录 2018 年的事时，日期精确不到天，
-- 而卡在这一步会让整件事做不下去。

create table if not exists self_deeds (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  occurred_on   date not null,
  title         text not null,
  what_happened text,
  -- 付出/放弃了什么。区分 preference 与 value 的唯一标准。
  cost          text,
  -- 参照类：同类事情放一起才算得出基准率。
  class_key     text not null,
  domain        text not null default 'work'
                check (domain in ('work', 'body', 'people', 'self')),
  outcome       text not null default 'ongoing'
                check (outcome in ('done', 'abandoned', 'ongoing')),
  -- 有没有人真的用了 / 接受了。null = 不适用（比如纯私人的事）。
  adopted       boolean,
  duration_days integer check (duration_days is null or duration_days >= 0),
  source        text not null default 'manual'
                check (source in ('manual', 'auto')),
  ref           jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_self_deeds_user
  on self_deeds (user_id, occurred_on desc);
create index if not exists idx_self_deeds_class
  on self_deeds (user_id, class_key);

alter table self_deeds enable row level security;

drop policy if exists "self_deeds_owner" on self_deeds;
create policy "self_deeds_owner" on self_deeds
  for all using (auth.uid() = user_id);
