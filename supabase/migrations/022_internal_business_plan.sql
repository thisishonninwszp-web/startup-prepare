-- Internal business plan imports.
-- Raw workbooks never enter Storage; only user-confirmed, redacted JSON chunks do.

do $$
begin
  if to_regclass('public.reality_case_sources') is null then
    raise exception
      '022_internal_business_plan requires 005_reality_system first';
  end if;
end
$$;

create table if not exists own_company_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists business_plan_imports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  profile_id          uuid not null references own_company_profiles (id) on delete cascade,
  version_no          integer not null check (version_no > 0),
  status              text not null check (
    status in (
      'uploading',
      'extracting',
      'awaiting_confirmation',
      'completed',
      'failed'
    )
  ),
  file_name           text not null,
  file_size           integer not null check (file_size between 1 and 10485760),
  workbook_hash       text not null,
  visible_sheet_count integer not null check (visible_sheet_count > 0),
  chunk_count         integer not null check (chunk_count > 0),
  previous_import_id  uuid references business_plan_imports (id) on delete set null,
  error_code          text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  unique (profile_id, version_no),
  unique (user_id, workbook_hash)
);

create table if not exists business_plan_chunks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  import_id         uuid not null references business_plan_imports (id) on delete cascade,
  sheet_name        text not null,
  cell_range        text not null,
  ordinal           integer not null check (ordinal >= 0),
  storage_path      text not null unique,
  content_hash      text not null,
  row_count         integer not null check (row_count > 0),
  column_count      integer not null check (column_count > 0),
  compressed_size integer not null check (compressed_size between 1 and 2097152),
  extraction_status text not null default 'pending' check (
    extraction_status in ('pending', 'processing', 'completed', 'failed')
  ),
  error_code        text,
  created_at        timestamptz not null default now(),
  unique (import_id, ordinal)
);

-- Keep the migration safe to rerun if an earlier draft created the table.
alter table business_plan_chunks
  add column if not exists compressed_size integer not null default 1;
alter table business_plan_chunks
  alter column compressed_size drop default;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.business_plan_chunks'::regclass
      and conname = 'business_plan_chunks_compressed_size_check'
  ) then
    alter table business_plan_chunks
      add constraint business_plan_chunks_compressed_size_check
      check (compressed_size between 1 and 2097152);
  end if;
end
$$;

create table if not exists business_plan_supplier_aliases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name_hmac  text not null,
  alias      text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name_hmac),
  unique (user_id, alias)
);

create table if not exists business_plan_extractions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  import_id   uuid not null references business_plan_imports (id) on delete cascade,
  chunk_id    uuid not null unique references business_plan_chunks (id) on delete cascade,
  facts       jsonb not null default '[]'::jsonb,
  plans       jsonb not null default '[]'::jsonb,
  forecasts   jsonb not null default '[]'::jsonb,
  cost_items  jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  risks       jsonb not null default '[]'::jsonb,
  unknowns    jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists business_plan_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  import_id             uuid not null unique references business_plan_imports (id) on delete cascade,
  summary               jsonb not null,
  strategy              jsonb not null,
  financial_outlook     jsonb not null,
  cost_structure        jsonb not null,
  selling_general_admin jsonb not null,
  assumptions           jsonb not null,
  risks                 jsonb not null,
  unknowns              jsonb not null,
  source_refs           jsonb not null,
  delta                 jsonb,
  created_at            timestamptz not null default now()
);

create table if not exists business_plan_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  import_id   uuid not null references business_plan_imports (id) on delete cascade,
  question    text not null check (char_length(question) between 1 and 2000),
  answer      jsonb not null,
  source_refs jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_business_plan_imports_profile
  on business_plan_imports (profile_id, version_no desc);
create index if not exists idx_business_plan_imports_user_status
  on business_plan_imports (user_id, status, created_at desc);
create index if not exists idx_business_plan_chunks_import
  on business_plan_chunks (import_id, ordinal);
create index if not exists idx_business_plan_chunks_pending
  on business_plan_chunks (import_id, extraction_status, ordinal);
create index if not exists idx_business_plan_extractions_import
  on business_plan_extractions (import_id);
create index if not exists idx_business_plan_questions_import
  on business_plan_questions (import_id, created_at desc);

alter table own_company_profiles enable row level security;
alter table business_plan_imports enable row level security;
alter table business_plan_chunks enable row level security;
alter table business_plan_supplier_aliases enable row level security;
alter table business_plan_extractions enable row level security;
alter table business_plan_snapshots enable row level security;
alter table business_plan_questions enable row level security;

drop policy if exists "own_company_profiles_owner" on own_company_profiles;
create policy "own_company_profiles_owner"
  on own_company_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_imports_owner" on business_plan_imports;
create policy "business_plan_imports_owner"
  on business_plan_imports for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_chunks_owner" on business_plan_chunks;
create policy "business_plan_chunks_owner"
  on business_plan_chunks for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_supplier_aliases_owner"
  on business_plan_supplier_aliases;
create policy "business_plan_supplier_aliases_owner"
  on business_plan_supplier_aliases for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_extractions_owner"
  on business_plan_extractions;
create policy "business_plan_extractions_owner"
  on business_plan_extractions for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_snapshots_owner"
  on business_plan_snapshots;
create policy "business_plan_snapshots_owner"
  on business_plan_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "business_plan_questions_owner"
  on business_plan_questions;
create policy "business_plan_questions_owner"
  on business_plan_questions for select
  using (auth.uid() = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'internal-business-plans',
  'internal-business-plans',
  false,
  2097152,
  array['application/json', 'application/gzip']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "internal_business_plans_select_own"
  on storage.objects;
create policy "internal_business_plans_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "internal_business_plans_insert_own"
  on storage.objects;
create policy "internal_business_plans_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "internal_business_plans_update_own"
  on storage.objects;
create policy "internal_business_plans_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "internal_business_plans_delete_own"
  on storage.objects;
create policy "internal_business_plans_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'internal-business-plans'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

alter table reality_case_sources
  add column if not exists business_plan_snapshot_id uuid
    references business_plan_snapshots (id) on delete set null;

alter table reality_case_sources
  drop constraint if exists reality_case_sources_parent_check;

alter table reality_case_sources
  add constraint reality_case_sources_parent_check
  check (
    num_nonnulls(
      observation_id,
      idea_id,
      validation_id,
      prediction_id,
      business_plan_snapshot_id
    ) <= 1
  );

create index if not exists idx_reality_sources_business_plan
  on reality_case_sources (business_plan_snapshot_id)
  where business_plan_snapshot_id is not null;
