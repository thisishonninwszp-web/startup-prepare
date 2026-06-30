-- 知识库 + 公司档案

-- ── 知识卡片 ─────────────────────────────────────────────────────────────────

create table if not exists knowledge_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  card_type   text not null
    check (card_type in ('market', 'customer', 'judgment', 'domain')),
  tags        text[] not null default '{}',
  source_type text not null default 'manual'
    check (source_type in ('manual', 'extracted')),
  source_ref  uuid,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_knowledge_cards_user
  on knowledge_cards (user_id, created_at desc)
  where archived_at is null;

alter table knowledge_cards enable row level security;

create policy "knowledge_cards_owner" on knowledge_cards
  for all using (auth.uid() = user_id);

-- ── 公司档案 ──────────────────────────────────────────────────────────────────

create table if not exists companies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  company_type text not null
    check (company_type in ('prospect', 'customer', 'both')),
  ceo_notes    text not null default '',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_companies_user
  on companies (user_id, updated_at desc)
  where archived_at is null;

alter table companies enable row level security;

create policy "companies_owner" on companies
  for all using (auth.uid() = user_id);

-- ── 公司大事记 ────────────────────────────────────────────────────────────────

create table if not exists company_events (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies (id) on delete cascade,
  year           int,
  description    text not null,
  related_party  text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_company_events_company
  on company_events (company_id, year asc nulls last);

alter table company_events enable row level security;

create policy "company_events_owner" on company_events
  for all using (
    exists (
      select 1 from companies c
      where c.id = company_events.company_id and c.user_id = auth.uid()
    )
  );

-- ── 公司想法/备注 ─────────────────────────────────────────────────────────────

create table if not exists company_notes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  content    text not null,
  idea_id    uuid references ideas (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_notes_company
  on company_notes (company_id, created_at desc);

alter table company_notes enable row level security;

create policy "company_notes_owner" on company_notes
  for all using (
    exists (
      select 1 from companies c
      where c.id = company_notes.company_id and c.user_id = auth.uid()
    )
  );
