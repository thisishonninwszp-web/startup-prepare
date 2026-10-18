-- ============================================================================
-- 迁移 084：「这家为什么现在招」—— 岗位页上查这家公司的公开资料，推测招聘背景
-- 一个岗位一行（重查就覆盖）。facts 是查到的事（每条原话由代码核对过），
-- needs 是 AI 推测的深层需求（每条至少引一件查到的事，标明是推测）。
-- picked：他认同的那一条（needs 里的下标）；改職務経歴書时按它挑经历、排顺序。不打分。
-- 要先跑 078。幂等，可重复执行。
-- ============================================================================

create table if not exists job_hiring_contexts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  posting_id  uuid not null references job_postings (id) on delete cascade,
  queries     text[] not null default '{}',
  sources     jsonb not null default '[]'::jsonb,
  facts       jsonb not null default '[]'::jsonb,
  needs       jsonb not null default '[]'::jsonb,
  picked      integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint job_hiring_contexts_posting_uniq unique (user_id, posting_id)
);

alter table job_hiring_contexts enable row level security;
drop policy if exists "job_hiring_contexts_owner" on job_hiring_contexts;
create policy "job_hiring_contexts_owner" on job_hiring_contexts
  for all using (auth.uid() = user_id);
