-- AI reliability diagnostics.
-- Stores encrypted request/response payloads for short-term debugging only.

create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  request_id text not null unique,
  operation text not null,
  module text not null default 'unknown',
  entity_type text,
  entity_id uuid,
  prompt_version text not null default 'v1',
  model text not null,
  output_mode text not null check (output_mode in ('text', 'json')),
  timeout_ms integer not null,
  status text not null check (status in ('running', 'success', 'failed')),
  error_code text,
  error_message text,
  duration_ms integer,
  encrypted_request_payload text,
  request_metadata_only boolean not null default false,
  expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_call_attempts (
  id uuid primary key default gen_random_uuid(),
  ai_call_id uuid not null references public.ai_calls(id) on delete cascade,
  attempt_no integer not null check (attempt_no in (1, 2)),
  purpose text not null check (purpose in ('primary', 'repair')),
  status text not null check (status in ('success', 'failed')),
  duration_ms integer,
  encrypted_response_payload text,
  response_metadata_only boolean not null default false,
  validation_errors text[],
  created_at timestamptz not null default now(),
  unique (ai_call_id, attempt_no)
);

create index if not exists ai_calls_user_created_idx
  on public.ai_calls(user_id, created_at desc);

create index if not exists ai_calls_expires_idx
  on public.ai_calls(expires_at);

alter table public.ai_calls enable row level security;
alter table public.ai_call_attempts enable row level security;

drop policy if exists "Users can read own AI calls" on public.ai_calls;
create policy "Users can read own AI calls"
  on public.ai_calls for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own AI calls" on public.ai_calls;
create policy "Users can delete own AI calls"
  on public.ai_calls for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own AI call attempts" on public.ai_call_attempts;
create policy "Users can read own AI call attempts"
  on public.ai_call_attempts for select
  using (
    exists (
      select 1
      from public.ai_calls c
      where c.id = ai_call_attempts.ai_call_id
        and c.user_id = auth.uid()
    )
  );

create or replace function public.purge_expired_ai_calls()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.ai_calls
  where expires_at < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
