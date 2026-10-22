-- 096：预测第三轮 —— 领先指标 + 「会不会来日本」的题（经用户同意，2026-10-22）
--
-- 1. app_watch：上过中国 App Store 免费榜的 App，每天查它在日本 App Store 上架了没有、支不支持日语。
--    中国公司要进日本，几个月前就会留下痕迹：加日语、在日本上架。看行为，不看说法。
-- 2. forecast_questions 多一种题：arrival（到日本题）—— 差距清单里「那边有、日本还没有」的东西，到某天会不会在日本出现；
--    出题时附上时差图谱里同一类东西的历史（几件、几年内到了日本），当基准率。到期程序查证据、他确认，同生意题。

alter table forecast_questions drop constraint if exists forecast_questions_kind_check;
alter table forecast_questions add constraint forecast_questions_kind_check check (kind in ('market', 'data', 'business', 'arrival'));

create table if not exists app_watch (
  app_id      text primary key,              -- App Store 的 id（中国区、日本区同一个）
  name        text not null,
  developer   text,
  url         text,
  first_seen  date not null,                 -- 第一次在中国免费榜上见到
  checked_on  date,                          -- 最近一次查日本 App Store
  in_jp       boolean,                       -- 日本 App Store 上有没有
  has_ja      boolean,                       -- 支不支持日语
  jp_since    date,                          -- 看着它在日本上架的那天（第一次查就已经在的为空）
  ja_since    date,                          -- 看着它加了日语的那天（第一次查就已经有的为空）
  created_at  timestamptz not null default now()
);

alter table app_watch enable row level security;
