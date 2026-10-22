-- 097：预测第四轮 —— 日本政策的「流水线」（经用户同意，2026-10-22）
--
-- 日本的规则有很固定的流程：征求意见（パブコメ）→ 公布 → 施行。各部委从征求意见到公布、从公布到施行一般隔多久，
-- 可以从历史直接数出来 —— 一个简单的统计就比任何人的意见准。
-- 1. policy_items：e-Gov 意见征集（每天抓「正在征求意见」和「结果公示」两个订阅），标出跟他有关的（标题里有他关心的词）。
--    结果公示里有「案の公示日」「受付締切日」「命令等の公布日」：攒下来就是「截止 → 公布」的基准。
-- 2. policy_law_lags：几十部跟他的方向有关的法律（入管法、劳动、护理、民宿、支付、运输……）历次修改的公布日、施行日（e-Gov 法令 API）。
-- 3. 政策题（forecast_questions.kind = policy）：正在征求意见、跟他有关的那几件，「会不会在某天之前公布」——
--    门槛日取历史上「截止 → 公布」的中位数，到期由代码对账（看结果公示的公布日）；统计基准当成一方（forecasts.source = base）一起记分。

create table if not exists policy_items (
  id               text primary key,               -- e-Gov 案件番号
  title            text not null,
  ministry         text,
  category         text,
  notice_date      date,                           -- 案の公示日
  deadline         date,                           -- 受付締切日
  result_date      date,                           -- 結果の公示日
  promulgate_date  date,                           -- 命令等の公布日（结果页上叫「対象が定められた日」）
  comments         integer,                        -- 提出意見数
  url              text,
  relevant         boolean not null default false, -- 标题里有他关心的词
  first_seen       date not null default current_date,
  updated_at       timestamptz not null default now()
);
create index if not exists policy_items_open_idx on policy_items (relevant, deadline) where result_date is null;
alter table policy_items enable row level security;

create table if not exists policy_law_lags (
  law_id           text not null,
  law_title        text not null,
  law_type         text,
  amendment_title  text not null default '',
  promulgate_date  date not null,
  enforce_date     date not null,
  fetched_on       date not null default current_date,
  primary key (law_id, amendment_title, promulgate_date, enforce_date)
);
alter table policy_law_lags enable row level security;

alter table forecast_questions drop constraint if exists forecast_questions_kind_check;
alter table forecast_questions add constraint forecast_questions_kind_check check (kind in ('market', 'data', 'business', 'arrival', 'policy'));
alter table forecasts drop constraint if exists forecasts_source_check;
alter table forecasts add constraint forecasts_source_check check (source in ('ai_outside', 'ai_inside', 'ai_devil', 'ai', 'me', 'market', 'base'));
