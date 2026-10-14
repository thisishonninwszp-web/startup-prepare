-- ============================================================================
-- 迁移 072：公开对账页
-- signal_public_records：他打开了"公开对账页"就有一个随机口令，/record/<口令> 不用登录就能看，
--   只显示周刊上公开押过的判断和结果（自动对账的带出处），别的一概不显示。关掉就删这一行，旧链接立刻失效。
--   陌生人信不信一个人，看的是他押过的东西应验了几条 —— 这份记录别人抄不走。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_public_records (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

alter table signal_public_records enable row level security;

drop policy if exists "signal_public_records_owner" on signal_public_records;
create policy "signal_public_records_owner" on signal_public_records
  for all using (auth.uid() = user_id);
