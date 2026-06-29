-- Reality closure: one current next move per reality case, with immutable
-- decision snapshots and append-only lifecycle events.

create table if not exists reality_closures (
  id                           uuid primary key default gen_random_uuid(),
  user_id                      uuid not null references auth.users (id) on delete cascade,
  case_id                      uuid not null references reality_cases (id) on delete cascade,
  source_version_id            uuid not null references reality_versions (id) on delete restrict,
  replaces_closure_id          uuid references reality_closures (id) on delete restrict,
  mode                         text not null check (mode in ('act', 'verify', 'wait')),
  decision                     text not null check (length(trim(decision)) > 0),
  critical_unknown             text not null check (length(trim(critical_unknown)) > 0),
  next_action                  text not null check (length(trim(next_action)) > 0),
  completion_criterion         text not null check (length(trim(completion_criterion)) > 0),
  expected_feedback            text not null check (length(trim(expected_feedback)) > 0),
  due_on                       date not null,
  rejected_alternative_reason  text not null check (length(trim(rejected_alternative_reason)) > 0),
  direction_change_reason      text,
  wait_signal                  text,
  basis_refs                   jsonb not null check (
    jsonb_typeof(basis_refs) = 'array' and jsonb_array_length(basis_refs) > 0
  ),
  source_snapshot              jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  source_fingerprint           text not null check (length(source_fingerprint) = 64),
  status                       text not null default 'active'
    check (status in ('active', 'completed', 'not_completed', 'replaced')),
  created_at                   timestamptz not null default now(),
  closed_at                    timestamptz,
  check (mode <> 'wait' or length(trim(coalesce(wait_signal, ''))) > 0)
);

create table if not exists reality_closure_events (
  id                  uuid primary key default gen_random_uuid(),
  closure_id          uuid not null references reality_closures (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  event_type          text not null
    check (event_type in ('completed', 'not_completed', 'replaced', 'reconfirmed')),
  reality_version_id  uuid references reality_versions (id) on delete restrict,
  note                text not null check (length(trim(note)) > 0),
  created_at          timestamptz not null default now()
);

create unique index if not exists reality_closures_one_active_per_case
  on reality_closures (case_id)
  where status = 'active';

create index if not exists reality_closures_user_case_created
  on reality_closures (user_id, case_id, created_at desc);

create index if not exists reality_closure_events_closure_created
  on reality_closure_events (closure_id, created_at);

alter table reality_closures enable row level security;
alter table reality_closure_events enable row level security;

create or replace function save_reality_closure(
  p_user_id uuid,
  p_case_id uuid,
  p_source_version_id uuid,
  p_payload jsonb,
  p_source_snapshot jsonb,
  p_source_fingerprint text,
  p_replaces_closure_id uuid default null,
  p_replace_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case reality_cases%rowtype;
  v_version reality_versions%rowtype;
  v_active_id uuid;
  v_closure_id uuid;
  v_due_on date;
begin
  select * into v_case
  from reality_cases
  where id = p_case_id and user_id = p_user_id
  for update;
  if v_case.id is null then
    raise exception '无权收束该现状课题';
  end if;

  select * into v_version
  from reality_versions
  where id = p_source_version_id and case_id = p_case_id;
  if v_version.id is null then
    raise exception '现状版本不属于该课题';
  end if;

  if p_payload->>'mode' not in ('act', 'verify', 'wait')
    or coalesce(trim(p_payload->>'decision'), '') = ''
    or coalesce(trim(p_payload->>'critical_unknown'), '') = ''
    or coalesce(trim(p_payload->>'next_action'), '') = ''
    or coalesce(trim(p_payload->>'completion_criterion'), '') = ''
    or coalesce(trim(p_payload->>'expected_feedback'), '') = ''
    or coalesce(trim(p_payload->>'rejected_alternative_reason'), '') = ''
    or jsonb_typeof(p_payload->'basis_refs') is distinct from 'array'
    or jsonb_array_length(p_payload->'basis_refs') = 0 then
    raise exception '收束内容不完整';
  end if;
  if p_payload->>'mode' = 'wait'
    and coalesce(trim(p_payload->>'wait_signal'), '') = '' then
    raise exception '暂缓必须记录重新判断信号';
  end if;
  begin
    v_due_on := (p_payload->>'due_on')::date;
  exception when others then
    raise exception '截止日期无效';
  end;
  if v_due_on <= current_date then
    raise exception '截止日期必须晚于今天';
  end if;
  if length(p_source_fingerprint) <> 64
    or jsonb_typeof(p_source_snapshot) is distinct from 'object' then
    raise exception '来源快照无效';
  end if;

  select id into v_active_id
  from reality_closures
  where case_id = p_case_id and status = 'active'
  limit 1
  for update;

  if v_active_id is not null then
    if p_replaces_closure_id is distinct from v_active_id
      or coalesce(trim(p_replace_reason), '') = '' then
      raise exception '该课题已有当前下一步，替代时必须记录原因';
    end if;
    update reality_closures
    set status = 'replaced', closed_at = now()
    where id = v_active_id;
    insert into reality_closure_events (
      closure_id, user_id, event_type, reality_version_id, note
    ) values (
      v_active_id, p_user_id, 'replaced', p_source_version_id, trim(p_replace_reason)
    );
  elsif p_replaces_closure_id is not null then
    raise exception '要替代的当前下一步不存在';
  end if;

  insert into reality_closures (
    user_id,
    case_id,
    source_version_id,
    replaces_closure_id,
    mode,
    decision,
    critical_unknown,
    next_action,
    completion_criterion,
    expected_feedback,
    due_on,
    rejected_alternative_reason,
    direction_change_reason,
    wait_signal,
    basis_refs,
    source_snapshot,
    source_fingerprint
  ) values (
    p_user_id,
    p_case_id,
    p_source_version_id,
    p_replaces_closure_id,
    p_payload->>'mode',
    trim(p_payload->>'decision'),
    trim(p_payload->>'critical_unknown'),
    trim(p_payload->>'next_action'),
    trim(p_payload->>'completion_criterion'),
    trim(p_payload->>'expected_feedback'),
    v_due_on,
    trim(p_payload->>'rejected_alternative_reason'),
    nullif(trim(p_payload->>'direction_change_reason'), ''),
    nullif(trim(p_payload->>'wait_signal'), ''),
    p_payload->'basis_refs',
    p_source_snapshot,
    p_source_fingerprint
  )
  returning id into v_closure_id;

  return v_closure_id;
end;
$$;

create or replace function resolve_reality_closure(
  p_closure_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closure reality_closures%rowtype;
begin
  select * into v_closure
  from reality_closures
  where id = p_closure_id
  for update;
  if v_closure.id is null
    or v_closure.user_id is distinct from p_user_id
    or v_closure.status <> 'active' then
    raise exception '当前下一步不存在或无权操作';
  end if;
  if p_outcome not in ('completed', 'not_completed')
    or coalesce(trim(p_note), '') = '' then
    raise exception '必须记录实际发生了什么';
  end if;

  update reality_closures
  set status = p_outcome, closed_at = now()
  where id = p_closure_id;

  insert into reality_closure_events (
    closure_id, user_id, event_type, reality_version_id, note
  ) values (
    p_closure_id, p_user_id, p_outcome, v_closure.source_version_id, trim(p_note)
  );
end;
$$;

create or replace function reconfirm_reality_closure(
  p_closure_id uuid,
  p_user_id uuid,
  p_reality_version_id uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closure reality_closures%rowtype;
  v_version reality_versions%rowtype;
begin
  select * into v_closure
  from reality_closures
  where id = p_closure_id
  for update;
  if v_closure.id is null
    or v_closure.user_id is distinct from p_user_id
    or v_closure.status <> 'active' then
    raise exception '当前下一步不存在或无权操作';
  end if;

  select * into v_version
  from reality_versions
  where id = p_reality_version_id and case_id = v_closure.case_id;
  if v_version.id is null or coalesce(trim(p_note), '') = '' then
    raise exception '重新确认必须引用当前课题版本并记录理由';
  end if;

  insert into reality_closure_events (
    closure_id, user_id, event_type, reality_version_id, note
  ) values (
    p_closure_id, p_user_id, 'reconfirmed', p_reality_version_id, trim(p_note)
  );
end;
$$;

revoke all on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) from public;
revoke all on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) from anon;
revoke all on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) from authenticated;
grant execute on function save_reality_closure(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text) to service_role;

revoke all on function resolve_reality_closure(uuid, uuid, text, text) from public;
revoke all on function resolve_reality_closure(uuid, uuid, text, text) from anon;
revoke all on function resolve_reality_closure(uuid, uuid, text, text) from authenticated;
grant execute on function resolve_reality_closure(uuid, uuid, text, text) to service_role;

revoke all on function reconfirm_reality_closure(uuid, uuid, uuid, text) from public;
revoke all on function reconfirm_reality_closure(uuid, uuid, uuid, text) from anon;
revoke all on function reconfirm_reality_closure(uuid, uuid, uuid, text) from authenticated;
grant execute on function reconfirm_reality_closure(uuid, uuid, uuid, text) to service_role;
