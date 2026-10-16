-- ============================================================================
-- 迁移 078：求职（/jobs，经用户明确裁决新增的一级模块，2026-10）
-- job_profiles：条件（四类、地点、现年收、期望下限、在留资格）和个人信息。
--   personal 里是姓名、联系方式、住址，永远不发给 AI，只在打印简历时由代码填进去。
--   last_search_on：今天搜过没有（每天第一次打开 /jobs 时搜）。
-- career_entries：底稿。一段经历一条；raw_text 是他的原话，draft_ja 是 AI 整理的日文；
--   confirmed_at 为空的不算数（对照和改简历只用确认过的）。
-- job_postings：岗位。picked_at 为空的是每天搜到、他还没点"要这个"的候选，14 天后清掉。
--   facts 存抽出来的字段（每条条件都带招聘页原话），match 存跟底稿的对照。
--   同一家公司 + 同一个职位名（dedupe_key）或同一个网址，算同一个岗位。
-- job_resumes：某个岗位的一版简历，每句带出处（底稿的 id）；他改过的段存在 sections 的 user_text 里。
-- job_applications：一次投递，一个岗位最多一条。events 记每次状态变化的日期；
--   "没回音"不存，由代码按 21 天算。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists job_profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  categories     text[] not null default '{data,consulting,planning,chinese}',
  locations      text[] not null default '{大阪}',
  salary_now     integer,
  salary_floor   integer,
  visa           text not null default 'gijinkoku' check (visa in ('gijinkoku', 'none')),
  personal       jsonb not null default '{}'::jsonb,
  last_search_on date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table job_profiles enable row level security;
drop policy if exists "job_profiles_owner" on job_profiles;
create policy "job_profiles_owner" on job_profiles
  for all using (auth.uid() = user_id);

create table if not exists career_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  topic        text not null check (topic in ('education', 'work', 'project', 'language', 'license')),
  org          text not null default '',
  period       text not null default '',
  raw_text     text not null,
  draft_ja     text,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_career_entries_user on career_entries (user_id, created_at);
alter table career_entries enable row level security;
drop policy if exists "career_entries_owner" on career_entries;
create policy "career_entries_owner" on career_entries
  for all using (auth.uid() = user_id);

create table if not exists job_postings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  company_id   uuid references companies (id) on delete set null,
  company_name text not null,
  title        text not null,
  url          text,
  dedupe_key   text not null,
  source       text not null check (source in ('share', 'search', 'manual', 'email')),
  material_id  uuid references reality_materials (id) on delete set null,
  body         text not null,
  facts        jsonb not null,
  category     text not null check (category in ('data', 'consulting', 'planning', 'chinese', 'none')),
  match        jsonb,
  picked_at    timestamptz,
  found_on     date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint job_postings_key_uniq unique (user_id, dedupe_key)
);

create unique index if not exists job_postings_url_uniq on job_postings (user_id, url) where url is not null;
create index if not exists idx_job_postings_user on job_postings (user_id, found_on desc);
alter table job_postings enable row level security;
drop policy if exists "job_postings_owner" on job_postings;
create policy "job_postings_owner" on job_postings
  for all using (auth.uid() = user_id);

create table if not exists job_resumes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  posting_id uuid not null references job_postings (id) on delete cascade,
  version    integer not null,
  sections   jsonb not null,
  probes     jsonb not null default '[]'::jsonb,
  dropped    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint job_resumes_version_uniq unique (posting_id, version)
);

alter table job_resumes enable row level security;
drop policy if exists "job_resumes_owner" on job_resumes;
create policy "job_resumes_owner" on job_resumes
  for all using (auth.uid() = user_id);

create table if not exists job_applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  posting_id     uuid not null references job_postings (id) on delete cascade,
  resume_id      uuid references job_resumes (id) on delete set null,
  channel        text not null check (channel in ('site', 'board', 'agent', 'email')),
  status         text not null default 'applied'
    check (status in ('applied', 'replied', 'interview', 'rejected', 'withdrawn')),
  events         jsonb not null default '[]'::jsonb,
  offered_salary integer,
  applied_on     date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint job_applications_posting_uniq unique (posting_id)
);

alter table job_applications enable row level security;
drop policy if exists "job_applications_owner" on job_applications;
create policy "job_applications_owner" on job_applications
  for all using (auth.uid() = user_id);
