-- Reality Materials: unified real-world input, three-province review, six-department routing.

create table if not exists public.reality_materials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  source_type     text not null check (
    source_type in ('text', 'url', 'file', 'customer_quote', 'business_fragment', 'emotion_fragment')
  ),
  title           text,
  input_text      text,
  sanitized_text  text,
  source_url      text,
  file_name       text,
  file_type       text,
  file_size       integer,
  status          text not null default 'captured' check (
    status in ('captured', 'extracted', 'drafted', 'reviewed', 'confirmed', 'parked', 'rejected', 'summary_only', 'failed')
  ),
  redactions      text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.reality_material_extractions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  material_id     uuid not null references public.reality_materials (id) on delete cascade,
  extracted_text  text not null,
  extraction_meta jsonb not null default '{}'::jsonb,
  visible_sheets  jsonb not null default '[]'::jsonb,
  unreadable      jsonb not null default '[]'::jsonb,
  is_truncated    boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (material_id)
);

create table if not exists public.reality_material_drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.reality_materials (id) on delete cascade,
  draft       jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.reality_material_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.reality_materials (id) on delete cascade,
  review      jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.reality_material_departments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.reality_materials (id) on delete cascade,
  department  text not null check (
    department in ('customer', 'company', 'market', 'judgment', 'action', 'self')
  ),
  created_at  timestamptz not null default now(),
  unique (material_id, department)
);

create table if not exists public.reality_material_routes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  material_id        uuid not null references public.reality_materials (id) on delete cascade,
  target             text not null check (
    target in ('reality', 'customer_view', 'company_kb', 'idea', 'retrospective', 'reasoning', 'decision_closure')
  ),
  target_object_type text,
  target_object_id   uuid,
  reason             text not null,
  output_expectation text not null,
  source_snapshot    jsonb not null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_reality_materials_user_status
  on public.reality_materials (user_id, status, updated_at desc);
create index if not exists idx_reality_material_routes_material
  on public.reality_material_routes (user_id, material_id, created_at desc);
create index if not exists idx_reality_material_departments_user
  on public.reality_material_departments (user_id, department, created_at desc);

alter table public.reality_materials enable row level security;
alter table public.reality_material_extractions enable row level security;
alter table public.reality_material_drafts enable row level security;
alter table public.reality_material_reviews enable row level security;
alter table public.reality_material_routes enable row level security;
alter table public.reality_material_departments enable row level security;

revoke all on table public.reality_materials from anon, authenticated;
revoke all on table public.reality_material_extractions from anon, authenticated;
revoke all on table public.reality_material_drafts from anon, authenticated;
revoke all on table public.reality_material_reviews from anon, authenticated;
revoke all on table public.reality_material_routes from anon, authenticated;
revoke all on table public.reality_material_departments from anon, authenticated;
