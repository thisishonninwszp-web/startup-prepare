-- Generic decision closures: a C-compatible system exit for analysis modules.
-- v1 writes new closures without migrating existing module-specific closures.

create table if not exists decision_closures (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  object_type           text not null check (
    object_type in (
      'reality_case',
      'idea',
      'customer_case',
      'dream_case',
      'dream_branch',
      'retro_period',
      'company_profile',
      'reasoning_session'
    )
  ),
  object_id             uuid not null,
  origin_module         text not null,
  title                 text not null,
  current_judgment      text not null,
  critical_unknowns     jsonb not null,
  options               jsonb not null,
  selected_next_step    text not null,
  completion_criterion  text not null,
  expected_feedback     text not null,
  due_on                date not null,
  basis_refs            text[] not null,
  status                text not null default 'active' check (
    status in ('active', 'completed', 'not_completed', 'replaced', 'archived')
  ),
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (
    jsonb_typeof(critical_unknowns) = 'array'
    and jsonb_array_length(critical_unknowns) between 1 and 3
  ),
  check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 3
  ),
  check (cardinality(basis_refs) >= 1)
);

create table if not exists decision_closure_sources (
  id                 uuid primary key default gen_random_uuid(),
  closure_id         uuid not null references decision_closures (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  source_type        text not null,
  source_id          uuid not null,
  source_version_id  uuid,
  snapshot           jsonb not null,
  basis_refs         text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table if not exists decision_closure_events (
  id          uuid primary key default gen_random_uuid(),
  closure_id  uuid not null references decision_closures (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_type  text not null check (
    event_type in ('created', 'completed', 'not_completed', 'replaced', 'archived')
  ),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create unique index if not exists decision_closures_one_active_per_object
  on decision_closures (user_id, object_type, object_id)
  where status = 'active';

create index if not exists decision_closures_user_due
  on decision_closures (user_id, status, due_on, created_at desc);

create index if not exists decision_closure_sources_closure
  on decision_closure_sources (closure_id);

create index if not exists decision_closure_events_closure
  on decision_closure_events (closure_id, created_at);

alter table decision_closures enable row level security;
alter table decision_closure_sources enable row level security;
alter table decision_closure_events enable row level security;

revoke all on table public.decision_closures from anon, authenticated;
revoke all on table public.decision_closure_sources from anon, authenticated;
revoke all on table public.decision_closure_events from anon, authenticated;

create or replace function save_decision_closure(
  p_user_id uuid,
  p_object_type text,
  p_object_id uuid,
  p_origin_module text,
  p_title text,
  p_payload jsonb,
  p_sources jsonb,
  p_replaces_closure_id uuid default null,
  p_replace_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_active_id uuid;
  v_closure_id uuid;
  v_source jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  if p_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_object_type not in (
    'reality_case',
    'idea',
    'customer_case',
    'dream_case',
    'dream_branch',
    'retro_period',
    'company_profile',
    'reasoning_session'
  ) then
    raise exception 'invalid closure object type';
  end if;

  if coalesce(trim(p_title), '') = ''
    or coalesce(trim(p_origin_module), '') = ''
    or coalesce(trim(p_payload->>'current_judgment'), '') = ''
    or coalesce(trim(p_payload->>'selected_next_step'), '') = ''
    or coalesce(trim(p_payload->>'completion_criterion'), '') = ''
    or coalesce(trim(p_payload->>'expected_feedback'), '') = ''
    or coalesce(trim(p_payload->>'due_on'), '') = '' then
    raise exception 'incomplete closure payload';
  end if;

  if jsonb_typeof(p_payload->'critical_unknowns') <> 'array'
    or jsonb_array_length(p_payload->'critical_unknowns') not between 1 and 3
    or jsonb_typeof(p_payload->'options') <> 'array'
    or jsonb_array_length(p_payload->'options') not between 2 and 3
    or jsonb_typeof(p_payload->'basis_refs') <> 'array'
    or jsonb_array_length(p_payload->'basis_refs') < 1 then
    raise exception 'invalid closure structure';
  end if;

  if p_sources is null
    or jsonb_typeof(p_sources) <> 'array'
    or jsonb_array_length(p_sources) < 1 then
    raise exception 'closure sources are required';
  end if;

  select id into v_active_id
  from public.decision_closures
  where user_id = p_user_id
    and object_type = p_object_type
    and object_id = p_object_id
    and status = 'active'
  for update;

  if v_active_id is not null then
    if p_replaces_closure_id is distinct from v_active_id
      or coalesce(trim(p_replace_reason), '') = '' then
      raise exception 'active closure replacement requires a reason';
    end if;

    update public.decision_closures
    set status = 'replaced',
        closed_at = now(),
        updated_at = now()
    where id = v_active_id;

    insert into public.decision_closure_events (closure_id, user_id, event_type, note)
    values (v_active_id, p_user_id, 'replaced', trim(p_replace_reason));
  elsif p_replaces_closure_id is not null then
    raise exception 'closure to replace does not exist';
  end if;

  insert into public.decision_closures (
    user_id,
    object_type,
    object_id,
    origin_module,
    title,
    current_judgment,
    critical_unknowns,
    options,
    selected_next_step,
    completion_criterion,
    expected_feedback,
    due_on,
    basis_refs
  )
  values (
    p_user_id,
    p_object_type,
    p_object_id,
    trim(p_origin_module),
    trim(p_title),
    trim(p_payload->>'current_judgment'),
    p_payload->'critical_unknowns',
    p_payload->'options',
    trim(p_payload->>'selected_next_step'),
    trim(p_payload->>'completion_criterion'),
    trim(p_payload->>'expected_feedback'),
    (p_payload->>'due_on')::date,
    array(select jsonb_array_elements_text(p_payload->'basis_refs'))
  )
  returning id into v_closure_id;

  for v_source in select * from jsonb_array_elements(p_sources)
  loop
    insert into public.decision_closure_sources (
      closure_id,
      user_id,
      source_type,
      source_id,
      source_version_id,
      snapshot,
      basis_refs
    )
    values (
      v_closure_id,
      p_user_id,
      v_source->>'source_type',
      (v_source->>'source_id')::uuid,
      nullif(v_source->>'source_version_id', '')::uuid,
      v_source->'snapshot',
      array(select jsonb_array_elements_text(coalesce(v_source->'basis_refs', '[]'::jsonb)))
    );
  end loop;

  insert into public.decision_closure_events (closure_id, user_id, event_type, note)
  values (v_closure_id, p_user_id, 'created', '');

  return v_closure_id;
end;
$function$;

create or replace function resolve_decision_closure(
  p_closure_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_closure public.decision_closures%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select * into v_closure
  from public.decision_closures
  where id = p_closure_id
  for update;

  if v_closure.id is null
    or v_closure.user_id is distinct from p_user_id
    or v_closure.status <> 'active' then
    raise exception 'active closure not found or access denied';
  end if;

  if p_outcome not in ('completed', 'not_completed') then
    raise exception 'invalid closure outcome';
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'closure result note is required';
  end if;

  update public.decision_closures
  set status = p_outcome,
      closed_at = now(),
      updated_at = now()
  where id = p_closure_id;

  insert into public.decision_closure_events (closure_id, user_id, event_type, note)
  values (p_closure_id, p_user_id, p_outcome, trim(p_note));
end;
$function$;

revoke all on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) from public;
revoke all on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) from anon;
revoke all on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) from authenticated;
grant execute on function save_decision_closure(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text) to service_role;

revoke all on function resolve_decision_closure(uuid, uuid, text, text) from public;
revoke all on function resolve_decision_closure(uuid, uuid, text, text) from anon;
revoke all on function resolve_decision_closure(uuid, uuid, text, text) from authenticated;
grant execute on function resolve_decision_closure(uuid, uuid, text, text) to service_role;
