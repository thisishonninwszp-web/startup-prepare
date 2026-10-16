-- ============================================================================
-- 迁移 079：官网填表助手
-- job_postings.fill_status：他在岗位页点「去填表」→ requested；他电脑上的填表助手（npm run jobs:helper）
--   取走 → filling；填好、停在页面上等他自己点「応募する」→ waiting；看到提交成功的页面 → done（同时记一条投递）；
--   没填成、他关掉页面没提交、两小时没动静 → failed，原因写在 fill_note。
-- 个人信息新加的几格（郵便番号、希望年収、入社可能時期、在留期限）存在 job_profiles.personal 里，不用改表。
-- 要先跑 078。幂等，可重复执行。
-- ============================================================================

alter table job_postings add column if not exists fill_status text
  check (fill_status in ('requested', 'filling', 'waiting', 'done', 'failed'));
alter table job_postings add column if not exists fill_requested_at timestamptz;
alter table job_postings add column if not exists fill_note text;

create index if not exists idx_job_postings_fill on job_postings (fill_status, fill_requested_at)
  where fill_status is not null;
