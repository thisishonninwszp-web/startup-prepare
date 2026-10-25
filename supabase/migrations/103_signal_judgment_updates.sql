-- A later view is a new entry. The original prediction remains the basis for reconciliation.
create table if not exists signal_judgment_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  judgment_id uuid not null references signal_judgments (id) on delete cascade,
  judgment text not null check (char_length(btrim(judgment)) between 4 and 500),
  reason text not null check (char_length(btrim(reason)) between 4 and 1000),
  source_url text check (source_url is null or (char_length(source_url) <= 2000 and source_url ~ '^https?://[^[:space:]]+$')),
  created_at timestamptz not null default now()
);

create index if not exists signal_judgment_updates_history_idx
  on signal_judgment_updates (user_id, judgment_id, created_at, id);

alter table signal_judgment_updates enable row level security;
drop policy if exists signal_judgment_updates_read on signal_judgment_updates;
create policy signal_judgment_updates_read on signal_judgment_updates for select
  using (auth.uid() = user_id);
drop policy if exists signal_judgment_updates_append on signal_judgment_updates;
create policy signal_judgment_updates_append on signal_judgment_updates for insert
  with check (auth.uid() = user_id and exists (
    select 1 from signal_judgments j where j.id = judgment_id and j.user_id = auth.uid()
  ));

-- Also enforce ownership when the server uses its service role and bypasses RLS.
create or replace function check_signal_judgment_update_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from signal_judgments j where j.id = new.judgment_id and j.user_id = new.user_id) then
    raise exception 'Judgment update owner does not match the original judgment';
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists signal_judgment_update_owner on signal_judgment_updates;
create trigger signal_judgment_update_owner before insert on signal_judgment_updates
  for each row execute function check_signal_judgment_update_owner();

create or replace function preserve_signal_judgment_update() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Permit cascades when an account or the parent record is removed.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Judgment history is append-only';
end;
$$;
drop trigger if exists signal_judgment_update_immutable on signal_judgment_updates;
create trigger signal_judgment_update_immutable before update or delete on signal_judgment_updates
  for each row execute function preserve_signal_judgment_update();

revoke update, delete on signal_judgment_updates from anon, authenticated;
