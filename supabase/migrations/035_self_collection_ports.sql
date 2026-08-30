-- 补齐四个还没有采集口的方向，让「身体 / 人际 / 自己」三个域真的能亮起来。
--
-- 面板上有八个子属性一直标着「尚未采集」，怪物清单也一直在指它们 ——
-- 指得出来却做不了，是设计缺口。这个迁移把入口补上。
--
-- 三张表都刻意做得极小。采集口的成败只看一件事：一次记录能不能在 20 秒内完成。
-- 超过 20 秒的，两周之后就没人记了（宪法原则 3 同一条理由）。

-- ---------------------------------------------------------------------------
-- 1. 每日：只记睡了几小时。
--    「续航 / 睡眠债」这一项换算成"达到 7 小时的天数占比"，
--    而不是平均时长 —— 平均值会把"五天四小时 + 两天十二小时"洗成健康。
-- ---------------------------------------------------------------------------
create table if not exists self_daily (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  logged_on   date not null default current_date,
  sleep_hours numeric(4, 2) not null check (sleep_hours >= 0 and sleep_hours <= 24),
  created_at  timestamptz not null default now(),
  constraint self_daily_one_per_day unique (user_id, logged_on)
);

create index if not exists idx_self_daily_user
  on self_daily (user_id, logged_on desc);

-- ---------------------------------------------------------------------------
-- 2. 与他人的一次互动。三种，共用一张表：
--    exposure  把没做完的东西给某人看了     → 人望 / 敢给人看
--    new_face  第一次接触的人               → 机缘 / 认识新人
--    proposal  提了一个建议，以及它的下场   → 人望 / 说话有人听
--
--    proposal 的 outcome 必须填，哪怕是 pending：
--    只记"我提了"不记"有没有被采纳"，采纳率就没有分母。
-- ---------------------------------------------------------------------------
create table if not exists self_encounters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null default current_date,
  kind       text not null check (kind in ('exposure', 'new_face', 'proposal')),
  counterpart text not null,              -- 对方是谁（一个称呼就够）
  detail     text,                        -- 给他看了什么 / 提了什么
  outcome    text check (outcome in ('accepted', 'rejected', 'pending')),
  created_at timestamptz not null default now(),
  constraint self_encounters_proposal_outcome check (
    kind <> 'proposal' or outcome is not null
  )
);

create index if not exists idx_self_encounters_user
  on self_encounters (user_id, kind, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 3. 底牌快照：跑道 / 能叫来的人 / 每周属于自己的时间。
--    一个月填一次。这三个数决定你能打几级本，而大多数人从来没写下来过。
--    保留历史行，不做 upsert —— 跑道的变化曲线本身就是信息。
-- ---------------------------------------------------------------------------
create table if not exists self_resources (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  recorded_on       date not null default current_date,
  runway_months     numeric(5, 1) not null check (runway_months >= 0),
  allies            smallint not null check (allies >= 0),
  weekly_free_hours numeric(4, 1) not null check (weekly_free_hours >= 0),
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_self_resources_user
  on self_resources (user_id, recorded_on desc);

-- ---------------------------------------------------------------------------
-- 4. 触发窗口上的一个勾：这次是不是撞上了意料之外的收获。
--    「机缘 / 捡到的意外」的分子。
-- ---------------------------------------------------------------------------
alter table self_windows
  add column if not exists serendipity boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table self_daily      enable row level security;
alter table self_encounters enable row level security;
alter table self_resources  enable row level security;

drop policy if exists "self_daily_owner" on self_daily;
create policy "self_daily_owner" on self_daily
  for all using (auth.uid() = user_id);

drop policy if exists "self_encounters_owner" on self_encounters;
create policy "self_encounters_owner" on self_encounters
  for all using (auth.uid() = user_id);

drop policy if exists "self_resources_owner" on self_resources;
create policy "self_resources_owner" on self_resources
  for all using (auth.uid() = user_id);
