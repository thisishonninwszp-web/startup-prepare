-- ============================================================================
-- 迁移 067：差距清单 —— 能不能搬过来
-- signal_gap_transfers：清单里一条东西，在那边做成靠哪几个条件，每个条件这边现在怎样
--   （成立 / 不成立 / 说不清，原文由代码核对，没出处的一律说不清），以及有没有人试过把它带过来。
--   很多东西这边没有，不是没人想到，而是条件不具备 —— 不成立的那几条，就是要搬过来得先解决的事。
--   不打分、不下"值得做"的结论。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_gap_transfers (
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  analysis    jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, signal_id, side)
);

alter table signal_gap_transfers enable row level security;

drop policy if exists "signal_gap_transfers_owner" on signal_gap_transfers;
create policy "signal_gap_transfers_owner" on signal_gap_transfers
  for all using (auth.uid() = user_id);
