-- ============================================================================
-- 迁移 082：官报決算公告（外部信号的一手数据第一步）
-- kanpo_notices：每天官报里的会社決算公告，全部存；公开数据，不分用户（单用户阶段只用 service role 读写）。
--   字段由规则从原文截出，金额按单位换成日元；四样（公司名、单位、资产合计、当期纯损益）都抽到才算 complete。
-- kanpo_fetch_days：哪天抓过（几页、几条、几条没抽全）。
-- kanpo_watch：他的「在日本的中国公司」名单；case_id 是从时差图谱加进来时那一件的 id。
-- 要先跑 073（signal_transfer_cases）。幂等，可重复执行。
-- ============================================================================

create table if not exists kanpo_notices (
  id                uuid primary key default gen_random_uuid(),
  notice_key        text not null unique,
  issue_date        date not null,
  issue             text not null,
  page              int not null,
  pdf_url           text not null,
  company_name      text,
  company_key       text,
  address           text,
  period            text,
  fiscal_end        text,
  unit              text,
  total_assets      bigint,
  net_assets        bigint,
  retained_earnings bigint,
  net_income        bigint,
  complete          boolean not null default false,
  raw_text          text not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_kanpo_notices_company on kanpo_notices (company_key);
create index if not exists idx_kanpo_notices_date on kanpo_notices (issue_date desc);
alter table kanpo_notices enable row level security;

create table if not exists kanpo_fetch_days (
  issue_date  date primary key,
  pages       int not null,
  notices     int not null,
  incomplete  int not null,
  fetched_at  timestamptz not null default now()
);
alter table kanpo_fetch_days enable row level security;

create table if not exists kanpo_watch (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name_zh     text not null,
  aliases     text[] not null,
  rejected    text[] not null default '{}',
  note        text not null default '',
  case_id     uuid references signal_transfer_cases (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table kanpo_watch enable row level security;
drop policy if exists "kanpo_watch_owner" on kanpo_watch;
create policy "kanpo_watch_owner" on kanpo_watch
  for all using (auth.uid() = user_id);
