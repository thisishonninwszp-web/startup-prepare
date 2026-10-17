-- ============================================================================
-- 迁移 081：「这家可能会问的 case」—— 在岗位页按这家公司出一道ケース面接的题
-- status：asked（出好题）→ answered（交了结构、追问已生成）→ reviewed（答完追问、复盘已生成）。
-- stuck_step：他自己点的"卡在哪一步"（AI 只提名，存在 review.suggested_step）。不打分。
-- 要先跑 078。幂等，可重复执行。
-- ============================================================================

create table if not exists job_case_drills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  posting_id   uuid not null references job_postings (id) on delete cascade,
  status       text not null default 'asked'
    check (status in ('asked', 'answered', 'reviewed')),
  question     jsonb not null,
  answer       text,
  answered_at  timestamptz,
  followups    jsonb,
  review       jsonb,
  stuck_step   text check (stuck_step in ('define', 'split', 'numbers', 'prioritize', 'conclude')),
  started_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_job_case_drills_user on job_case_drills (user_id, created_at desc);
create index if not exists idx_job_case_drills_posting on job_case_drills (posting_id);

alter table job_case_drills enable row level security;
drop policy if exists "job_case_drills_owner" on job_case_drills;
create policy "job_case_drills_owner" on job_case_drills
  for all using (auth.uid() = user_id);
