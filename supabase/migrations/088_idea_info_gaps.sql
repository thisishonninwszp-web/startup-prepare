-- ============================================================================
-- 迁移 088：想法的信息缺口 · 是不是你的机会
-- 信息只有改变一个决定时才有用。外部信号读了很多，但大部分的终点是"读过了"。
-- 这里倒过来：从想法的最关键假设和退出条件出发，列出"继续还是 Kill"还缺哪几样信息，
-- 每样写清它会改变什么、看到什么就该放弃（反证）、去哪拿（找真人 > 已经有人在花钱的痕迹 > 网上原话 > 外部视角）、几天内拿到。
--
-- founder_facts：他自己写的约束和优势（只写事实：钱、时间、在哪、会什么语言、做过什么；不写自我评价）。
--   经用户同意（2026-10-20）用来看"这个想法是不是你的机会"：AI 只能照抄这里的原话（代码逐字核对），不下"适不适合"的结论。
-- idea_info_gaps：一个想法的一个缺口一行；status open / got（拿到了）/ none（拿不到）；
--   evidence 是补进来的信息（从外部信号某一条"补进想法的缺口"，或者他自己记的），只追加。
-- idea_fits：这个想法用上了他哪些优势、碰到了他哪些约束（每次重列缺口时一起重写）。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists founder_facts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  text        text not null,
  updated_at  timestamptz not null default now()
);

alter table founder_facts enable row level security;
drop policy if exists "founder_facts_owner" on founder_facts;
create policy "founder_facts_owner" on founder_facts
  for all using (auth.uid() = user_id);

create table if not exists idea_info_gaps (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  question    text not null,
  matters     text not null,
  disconfirm  text not null,
  routes      jsonb not null,
  due_on      date not null,
  status      text not null default 'open' check (status in ('open', 'got', 'none')),
  evidence    jsonb not null default '[]'::jsonb,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idea_info_gaps_idea_idx on idea_info_gaps (idea_id, created_at);
create index if not exists idea_info_gaps_user_idx on idea_info_gaps (user_id, status, due_on);

alter table idea_info_gaps enable row level security;
drop policy if exists "idea_info_gaps_owner" on idea_info_gaps;
create policy "idea_info_gaps_owner" on idea_info_gaps
  for all using (auth.uid() = user_id);

create table if not exists idea_fits (
  idea_id     uuid primary key references ideas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  analysis    jsonb not null,
  created_at  timestamptz not null default now()
);

alter table idea_fits enable row level security;
drop policy if exists "idea_fits_owner" on idea_fits;
create policy "idea_fits_owner" on idea_fits
  for all using (auth.uid() = user_id);
