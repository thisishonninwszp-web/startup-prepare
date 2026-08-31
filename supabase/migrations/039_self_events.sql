-- 事件流。
--
-- 在这之前，/self 上的一切都是**当前状态**：特性是现在持有的，等级是现在算出来的，
-- 称号是现在满足条件的。所以变化发生的那一刻不可见 —— 你永远看不到
-- "三天前解锁了封顶匠"，只能看到"现在有封顶匠"。
--
-- 没有事件就没有那一下"叮"。再多内容也补不上这个。
--
-- dedupe_key 让一次性的事件只记一次：称号解锁、转职。
-- 反复发生的（技能上涨、特性褪色又重来）留空，它们本来就该出现多次。

create table if not exists self_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind        text not null check (kind in (
                'trait_granted', 'trait_faded',
                'skill_up', 'skill_rust',
                'feat_taken',
                'title_earned', 'build_changed',
                'hypothesis_refuted', 'tier_changed'
              )),
  title       text not null,
  detail      text,
  ref         jsonb,
  dedupe_key  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_self_events_dedupe
  on self_events (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_self_events_user
  on self_events (user_id, occurred_at desc);

alter table self_events enable row level security;

drop policy if exists "self_events_owner" on self_events;
create policy "self_events_owner" on self_events
  for all using (auth.uid() = user_id);
