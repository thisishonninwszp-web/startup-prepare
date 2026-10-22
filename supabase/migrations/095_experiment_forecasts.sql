-- 095：预测第二轮 —— 先猜自己实验的结果（经用户同意，2026-10-22；原则 1 例外四的延伸）
--
-- 为什么：创业者最要练的判断是「陌生人会怎么做」。假门开出去、周刊发出去之前，先猜一下结果，过一两周系统自己对账 ——
-- 反馈快，而且每一道都跟他的决定有关。
-- 规矩同例外四：题目和门槛由代码出（门槛取他过去同类实验的中位数，没有历史用默认），他只点几成；
-- 只数次数（几个人留邮箱、看了几次），不算转化率；分数由代码算；不挂到想法上、不给想法打分。

create table if not exists experiment_forecasts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('door_signups', 'door_views', 'issue_views')),
  target_id   uuid not null,                    -- 假门（signal_fake_doors.id）或周刊（signal_issues.id）
  platform    text not null default '',         -- 周刊：哪个平台；假门为空
  question    text not null,                    -- 代码写的题目
  threshold   integer not null,                 -- 至少多少才算「会」
  baseline    integer not null default 0,       -- 猜的时候已经有多少（之后新增的才算）
  start_at    timestamptz not null default now(),
  due_on      date not null,
  probability numeric not null,                 -- 他点的几成
  status      text not null default 'open' check (status in ('open', 'resolved', 'void')),
  observed    integer,                          -- 到期时实际多少
  outcome     boolean,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 同一个假门 / 同一期同一个平台，同时只有一道没对账的
create unique index if not exists experiment_forecasts_open_uniq on experiment_forecasts (user_id, kind, target_id, platform) where status = 'open';
create index if not exists experiment_forecasts_user_idx on experiment_forecasts (user_id, status, due_on);

alter table experiment_forecasts enable row level security;
drop policy if exists "experiment_forecasts_owner" on experiment_forecasts;
create policy "experiment_forecasts_owner" on experiment_forecasts for all using (auth.uid() = user_id);
