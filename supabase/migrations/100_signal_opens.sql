-- 100：他点开了哪几条新闻（经用户同意，2026-10-23；被动记录，他什么都不用点）。
-- 报告里展开一条、打开新闻详情页、从邮件里点进来，都记一次；同一条一天只记一次（数的是「点开过几天」）。
-- 用处：点开过两天以上的算「在跟的事」（接后来的消息，不进回想）；信息源体检里每个源数「点开过几条」。
-- 只是记下来，不进任何台账的推理，不打分。

create table if not exists signal_opens (
  user_id    uuid not null references auth.users (id) on delete cascade,
  signal_id  uuid not null references external_signals (id) on delete cascade,
  opened_on  date not null,                       -- 东京日期
  via        text not null check (via in ('report', 'detail', 'email', 'list')),
  first_at   timestamptz not null default now(),
  primary key (user_id, signal_id, opened_on)
);
create index if not exists signal_opens_user_idx on signal_opens (user_id, opened_on desc);

alter table signal_opens enable row level security;
drop policy if exists "signal_opens_owner" on signal_opens;
create policy "signal_opens_owner" on signal_opens for all using (auth.uid() = user_id);
