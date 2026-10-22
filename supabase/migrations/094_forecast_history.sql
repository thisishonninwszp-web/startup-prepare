-- 094：预测第一轮 —— 历史回测 + 校准练习（经用户同意，2026-10-22；原则 1 例外四：只用于对世界事件的预测）
--
-- 为什么：线上的题一天进几道、几个月后才对账，攒到能校准要半年以上。项目用的 AI（Gemini 2.5 Flash）知识停在 2025 年 1 月，
-- 2025 年 3 月以后开、现在已经结算的预测市场题，它不知道答案 —— 选那段时间里的某一天当「今天」，只给它那天以前的新闻（GDELT），
-- 它当时会说几成、那天市场说几成、后来实际怎样，几天就能攒几百道，AI 准不准、偏向哪边马上看得出来，也能学校准。
-- 同一批题给他练：先写「这类事一般几成」，再写这件事几成，马上揭晓（记得结果的不计分）。

create table if not exists forecast_history (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('manifold', 'polymarket')),
  market_id     text not null,
  url           text,
  token         text,                          -- Polymarket「会」那一边的代号（查那天的价格用）
  original_title text not null,
  description   text,
  created_on    date not null,                 -- 市场开的那天
  as_of         date not null,                 -- 当成「今天」的那天（开盘后、结算前）
  resolve_on    date not null,                 -- 结算的那天
  outcome       boolean not null,              -- 结果：会 / 不会（作废的不收）
  depth         numeric not null default 0,    -- 多少人在押（Manifold 人数 / Polymarket 成交额）
  priority      int not null default 0,        -- 先做哪些（跟日本、中国、经济、科技有关的在前）
  status        text not null default 'pending' check (status in ('pending', 'ready', 'skipped')),
  skip_reason   text,
  title         text,                          -- 中文题目
  criteria      text,                          -- 怎么才算「会」
  category      text,
  market_prob   numeric,                       -- 那天市场给的几成
  news          jsonb,                         -- 那天以前 30 天的新闻标题（GDELT），AI 和他看到的一样
  ai            jsonb,                         -- {outside:{p,reason}, inside:{…}, devil:{…}, median}
  created_at    timestamptz not null default now(),
  prepared_at   timestamptz,
  constraint forecast_history_uniq unique (platform, market_id)
);

create index if not exists forecast_history_todo_idx on forecast_history (status, priority desc, depth desc);
-- 题目是公开的世界上的事，大家共用；只有服务端读写
alter table forecast_history enable row level security;

create table if not exists forecast_history_answers (
  question_id uuid not null references forecast_history (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  base_rate   numeric,                         -- 先写的「这一类事一般几成会发生」
  probability numeric,                         -- 他的判断；knew 时为空
  knew        boolean not null default false,  -- 他记得结果：不计分
  answered_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create index if not exists forecast_history_answers_user_idx on forecast_history_answers (user_id, answered_at desc);
alter table forecast_history_answers enable row level security;
drop policy if exists "forecast_history_answers_owner" on forecast_history_answers;
create policy "forecast_history_answers_owner" on forecast_history_answers for all using (auth.uid() = user_id);
