-- 「这算不算」：把记录口从填空题改成判断题。
--
-- 三份档案里最值钱的是 outcome=miss 的窗口 —— 符合条件的情境出现了，
-- 而你没动。这种事没有人会主动写下来，所以只能由系统从已有记录
-- （接触、决策、复盘承诺）里挑出候选，反过来问：这算不算那一次？
--
-- 答「算，做了」或「算，没做」→ 写进 self_windows，source_ref 记下来源。
-- 答「不算」→ 记在这张表里，下次不再问。它不是窗口，只是一个已回答的问题。

create table if not exists self_window_skips (
  user_id     uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('validation', 'decision', 'commitment')),
  source_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, source_type, source_id)
);

alter table self_window_skips enable row level security;

drop policy if exists "self_window_skips_owner" on self_window_skips;
create policy "self_window_skips_owner" on self_window_skips
  for all using (auth.uid() = user_id);
