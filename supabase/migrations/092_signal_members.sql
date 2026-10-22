-- 092：给朋友用（经用户同意，2026-10-22）
-- 预测题共用：题目、AI 和市场的概率只在主账号下存一份；每个人自己的判断（source = me）各存各的，
--   所以唯一键加上 user_id；「先看了答案、这道不能再判断」也改成每人一份（forecast_reveals）。
-- 新闻的「记成观察 / 只是知道了」每人一份：主账号照旧记在 external_signals.status 上，
--   别的账号记在 signal_user_states（不会把主账号的列表弄乱）。

alter table forecasts drop constraint if exists forecasts_uniq;
do $$ begin
  alter table forecasts add constraint forecasts_uniq unique (question_id, user_id, source);
exception when duplicate_object then null; end $$;

create table if not exists forecast_reveals (
  question_id uuid not null references forecast_questions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (question_id, user_id)
);
insert into forecast_reveals (question_id, user_id, revealed_at)
  select id, user_id, revealed_at from forecast_questions where revealed_at is not null
  on conflict do nothing;
alter table forecast_reveals enable row level security;
drop policy if exists "forecast_reveals_owner" on forecast_reveals;
create policy "forecast_reveals_owner" on forecast_reveals for all using (auth.uid() = user_id);

create table if not exists signal_user_states (
  user_id        uuid not null references auth.users (id) on delete cascade,
  signal_id      uuid not null references external_signals (id) on delete cascade,
  status         text not null check (status in ('promoted', 'dismissed')),
  observation_id uuid references observations (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (user_id, signal_id)
);
alter table signal_user_states enable row level security;
drop policy if exists "signal_user_states_owner" on signal_user_states;
create policy "signal_user_states_owner" on signal_user_states for all using (auth.uid() = user_id);
