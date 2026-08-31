-- 怪物点名。
--
-- 在这之前，怪是每次访问现算出来的：打了没打都不留痕。
-- 所以一只 BOSS 可以在你面前站五周，而系统一无所知。
--
-- 逃跑本身就是证据，而且是最硬的那一种 —— 它不需要你承认，
-- 记录会自己说话。一周只记一次（week_key 唯一索引），
-- 所以刷新页面不会把"出现周数"刷高。
--
-- 没有"被击败"这一列：怪不再出现，就是被解决了。
-- 硬要记一个 killed_at，等于要求人在做完事之后再回来点一下按钮，
-- 那一步一定会被跳过，然后这张表就开始说谎。

create table if not exists self_quest_sightings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  quest_id   text not null,
  -- ISO 周，例 2026-W35。一周之内反复打开只算一次。
  week_key   text not null,
  tier       text not null check (tier in ('trash', 'elite', 'boss')),
  name       text not null,
  seen_on    date not null default current_date,
  created_at timestamptz not null default now(),
  constraint self_quest_sightings_once_a_week
    unique (user_id, quest_id, week_key)
);

create index if not exists idx_self_quest_sightings_user
  on self_quest_sightings (user_id, quest_id);

alter table self_quest_sightings enable row level security;

drop policy if exists "self_quest_sightings_owner" on self_quest_sightings;
create policy "self_quest_sightings_owner" on self_quest_sightings
  for all using (auth.uid() = user_id);
