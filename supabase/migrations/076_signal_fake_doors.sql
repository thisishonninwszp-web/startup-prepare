-- ============================================================================
-- 迁移 076：假门测试
-- signal_fake_doors：差距清单里的一条，做一页"准备中的服务"（日文或中文，写明预计价格），
--   /soon/<随机口令> 不用登录就能看，陌生人可以留邮箱"上线时通知我"。页面上写明还没有这个服务、现在不收钱。
--   没有人脉时，陌生人看到价格还愿意留邮箱，是"愿付钱"最近的证据；留了邮箱的人就是可以约来聊的人。
--   一条差距最多一页；关掉（open=false）以后页面只说"募集结束"，不再收邮箱。
-- signal_fake_door_signups：留下的邮箱（只有他自己看得到）。cancel_token 给登记的人自己取消用；
--   observation_id 是同时记下的那条观察（不含邮箱），取消时一起删掉。
-- signal_fake_door_view：看了一次就加一（页面上用脚本报，爬虫和链接预览一般不跑脚本）；只给服务端调用。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_fake_doors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  token       text not null unique,
  lang        text not null check (lang in ('ja', 'zh')),
  content     jsonb not null,
  views       integer not null default 0,
  open        boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint signal_fake_doors_uniq unique (user_id, signal_id, side)
);

alter table signal_fake_doors enable row level security;

drop policy if exists "signal_fake_doors_owner" on signal_fake_doors;
create policy "signal_fake_doors_owner" on signal_fake_doors
  for all using (auth.uid() = user_id);

create table if not exists signal_fake_door_signups (
  id              uuid primary key default gen_random_uuid(),
  door_id         uuid not null references signal_fake_doors (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  email           text not null,
  note            text,
  cancel_token    text not null unique,
  observation_id  uuid,
  created_at      timestamptz not null default now()
);

create unique index if not exists signal_fake_door_signups_email_uniq
  on signal_fake_door_signups (door_id, lower(email));
create index if not exists signal_fake_door_signups_door_idx
  on signal_fake_door_signups (door_id, created_at desc);

alter table signal_fake_door_signups enable row level security;

drop policy if exists "signal_fake_door_signups_owner" on signal_fake_door_signups;
create policy "signal_fake_door_signups_owner" on signal_fake_door_signups
  for all using (auth.uid() = user_id);

create or replace function signal_fake_door_view(p_token text) returns void
  language sql
as $$
  update signal_fake_doors set views = views + 1 where token = p_token and open;
$$;

revoke execute on function signal_fake_door_view(text) from public, anon, authenticated;
grant execute on function signal_fake_door_view(text) to service_role;
