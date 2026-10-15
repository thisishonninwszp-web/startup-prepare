-- ============================================================================
-- 迁移 075：差距清单 · 这边有人在为这个头疼吗
-- signal_gap_voices：差距清单里的一条，点了才查 —— 去知恵袋式的提问、吐槽、App Store 差评里找
--   这边真人说的原话（原文由代码核对，Jev 判是不是真人在说这件麻烦、属于抱怨 / 找办法 / 花钱绕路哪一种）。
--   差距清单只问过"这边有没有这个东西"（供给方），这里补上"这边有没有人为这件事头疼"（需求方）。
--   网上抱怨的人不等于会掏钱的人：这些只算"有痛"的弱证据。只数次数。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_gap_voices (
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  analysis    jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, signal_id, side)
);

alter table signal_gap_voices enable row level security;

drop policy if exists "signal_gap_voices_owner" on signal_gap_voices;
create policy "signal_gap_voices_owner" on signal_gap_voices
  for all using (auth.uid() = user_id);
