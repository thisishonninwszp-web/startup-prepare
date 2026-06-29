-- Bounded, map-item-anchored inquiry sessions.

alter table reality_versions
  add column if not exists focus_session_ids uuid[] not null default '{}';

create table if not exists reality_focus_sessions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  case_id                  uuid not null references reality_cases (id) on delete cascade,
  version_id               uuid not null references reality_versions (id) on delete restrict,
  anchor_type              text not null check (anchor_type in (
    'topic',
    'emotion',
    'fact',
    'interpretation',
    'unknown',
    'constraint_fixed',
    'constraint_influenceable',
    'constraint_actionable',
    'contradiction',
    'path'
  )),
  anchor_index             integer not null check (anchor_index >= 0),
  anchor_snapshot          jsonb not null check (jsonb_typeof(anchor_snapshot) = 'object'),
  status                   text not null default 'open'
    check (status in ('open', 'completed', 'safety_stopped')),
  summary                  jsonb,
  include_in_closure       boolean not null default false,
  include_in_next_version  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  completed_at             timestamptz,
  check (status <> 'completed' or jsonb_typeof(summary) = 'object'),
  check (
    status = 'completed'
    or (include_in_closure = false and include_in_next_version = false)
  )
);

create table if not exists reality_focus_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references reality_focus_sessions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'safety')),
  turn_no     integer not null check (turn_no between 1 and 3),
  client_key  text,
  content     jsonb not null check (jsonb_typeof(content) = 'object'),
  created_at  timestamptz not null default now(),
  check (
    (role = 'user' and client_key is not null and length(trim(client_key)) > 0)
    or (role <> 'user' and client_key is null)
  )
);

create unique index if not exists reality_focus_messages_role_turn_uniq
  on reality_focus_messages (session_id, role, turn_no);

create unique index if not exists reality_focus_messages_client_key_uniq
  on reality_focus_messages (session_id, client_key)
  where client_key is not null;

create index if not exists reality_focus_sessions_case_created
  on reality_focus_sessions (user_id, case_id, created_at desc);

create index if not exists reality_focus_sessions_next_version
  on reality_focus_sessions (user_id, case_id, include_in_next_version)
  where status = 'completed' and include_in_next_version = true;

create index if not exists reality_focus_messages_session_created
  on reality_focus_messages (session_id, turn_no, created_at);

alter table reality_focus_sessions enable row level security;
alter table reality_focus_messages enable row level security;

create or replace function reserve_reality_focus_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_question text,
  p_client_key text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session reality_focus_sessions%rowtype;
  v_existing_turn integer;
  v_turn integer;
  v_pending boolean;
begin
  select * into v_session
  from reality_focus_sessions
  where id = p_session_id
  for update;

  if v_session.id is null or v_session.user_id is distinct from p_user_id then
    raise exception '无权访问该聚焦探索';
  end if;

  select turn_no into v_existing_turn
  from reality_focus_messages
  where session_id = p_session_id
    and role = 'user'
    and client_key = p_client_key;
  if v_existing_turn is not null then
    return v_existing_turn;
  end if;

  if v_session.status <> 'open' then
    raise exception '该聚焦探索已经结束';
  end if;
  if coalesce(length(trim(p_question)), 0) = 0
    or length(trim(p_question)) > 2000
    or coalesce(length(trim(p_client_key)), 0) = 0 then
    raise exception '问题或幂等键无效';
  end if;

  select exists (
    select 1
    from reality_focus_messages u
    where u.session_id = p_session_id
      and u.role = 'user'
      and not exists (
        select 1
        from reality_focus_messages a
        where a.session_id = p_session_id
          and a.turn_no = u.turn_no
          and a.role in ('assistant', 'safety')
      )
  ) into v_pending;
  if v_pending then
    raise exception '上一轮AI回答尚未完成，请先重试';
  end if;

  select coalesce(max(turn_no), 0) + 1 into v_turn
  from reality_focus_messages
  where session_id = p_session_id
    and role = 'user';
  if v_turn > 3 then
    raise exception '聚焦探索最多三轮';
  end if;

  insert into reality_focus_messages (
    session_id, user_id, role, turn_no, client_key, content
  ) values (
    p_session_id,
    p_user_id,
    'user',
    v_turn,
    trim(p_client_key),
    jsonb_build_object('text', trim(p_question))
  );

  update reality_focus_sessions
  set updated_at = now()
  where id = p_session_id;

  return v_turn;
end;
$$;

create or replace function complete_reality_focus_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_turn_no integer,
  p_payload jsonb,
  p_is_final boolean,
  p_summary jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session reality_focus_sessions%rowtype;
  v_has_user boolean;
  v_has_answer boolean;
  v_should_finish boolean;
begin
  select * into v_session
  from reality_focus_sessions
  where id = p_session_id
  for update;
  if v_session.id is null or v_session.user_id is distinct from p_user_id then
    raise exception '无权访问该聚焦探索';
  end if;

  select exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id and role = 'user' and turn_no = p_turn_no
  ) into v_has_user;
  if not v_has_user then
    raise exception '该轮用户问题不存在';
  end if;

  select exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id
      and role in ('assistant', 'safety')
      and turn_no = p_turn_no
  ) into v_has_answer;
  if v_has_answer then
    return;
  end if;
  if v_session.status <> 'open' then
    raise exception '该聚焦探索已经结束';
  end if;

  v_should_finish := p_is_final or p_turn_no = 3;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or (v_should_finish and jsonb_typeof(p_summary) is distinct from 'object') then
    raise exception 'AI回答或摘要格式无效';
  end if;

  insert into reality_focus_messages (
    session_id, user_id, role, turn_no, content
  ) values (
    p_session_id, p_user_id, 'assistant', p_turn_no, p_payload
  );

  update reality_focus_sessions
  set status = case when v_should_finish then 'completed' else status end,
      summary = case when v_should_finish then p_summary else summary end,
      completed_at = case when v_should_finish then now() else completed_at end,
      updated_at = now()
  where id = p_session_id;
end;
$$;

create or replace function stop_reality_focus_for_safety(
  p_session_id uuid,
  p_user_id uuid,
  p_turn_no integer,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session reality_focus_sessions%rowtype;
begin
  select * into v_session
  from reality_focus_sessions
  where id = p_session_id
  for update;
  if v_session.id is null or v_session.user_id is distinct from p_user_id then
    raise exception '无权访问该聚焦探索';
  end if;
  if not exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id and role = 'user' and turn_no = p_turn_no
  ) then
    raise exception '该轮用户问题不存在';
  end if;
  if exists (
    select 1 from reality_focus_messages
    where session_id = p_session_id
      and role in ('assistant', 'safety')
      and turn_no = p_turn_no
  ) then
    return;
  end if;

  insert into reality_focus_messages (
    session_id, user_id, role, turn_no, content
  ) values (
    p_session_id, p_user_id, 'safety', p_turn_no, p_payload
  );

  update reality_focus_sessions
  set status = 'safety_stopped',
      include_in_closure = false,
      include_in_next_version = false,
      completed_at = now(),
      updated_at = now()
  where id = p_session_id;
end;
$$;

-- Serializes version creation per case so a completed exploration can be
-- consumed by at most one later map, even when two requests finish together.
create or replace function insert_reality_version_with_focus(
  p_user_id uuid,
  p_case_id uuid,
  p_previous_version_id uuid,
  p_map jsonb,
  p_delta jsonb,
  p_focus_session_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id uuid;
  v_latest_id uuid;
  v_latest_no integer;
  v_version_id uuid;
  v_requested_count integer;
  v_unique_count integer;
  v_valid_count integer;
begin
  select id into v_case_id
  from reality_cases
  where id = p_case_id and user_id = p_user_id
  for update;
  if v_case_id is null then
    raise exception '现状课题不存在或无权访问';
  end if;

  select id, version_no into v_latest_id, v_latest_no
  from reality_versions
  where case_id = p_case_id
  order by version_no desc
  limit 1;
  if v_latest_id is distinct from p_previous_version_id then
    raise exception '现状地图已产生新版本，请重试';
  end if;

  select count(*), count(distinct item)
  into v_requested_count, v_unique_count
  from unnest(coalesce(p_focus_session_ids, '{}'::uuid[])) as item;
  if v_requested_count <> v_unique_count then
    raise exception '聚焦探索引用重复';
  end if;

  select count(*) into v_valid_count
  from reality_focus_sessions
  where id = any(coalesce(p_focus_session_ids, '{}'::uuid[]))
    and user_id = p_user_id
    and case_id = p_case_id
    and status = 'completed'
    and include_in_next_version = true;
  if v_valid_count <> v_requested_count then
    raise exception '聚焦探索引用无效或无权访问';
  end if;

  if exists (
    select 1
    from reality_versions
    where case_id = p_case_id
      and focus_session_ids && coalesce(p_focus_session_ids, '{}'::uuid[])
  ) then
    raise exception '聚焦探索已被其他版本引用，请重试';
  end if;

  insert into reality_versions (
    case_id,
    previous_version_id,
    version_no,
    map,
    delta,
    focus_session_ids
  ) values (
    p_case_id,
    v_latest_id,
    coalesce(v_latest_no, 0) + 1,
    p_map,
    p_delta,
    coalesce(p_focus_session_ids, '{}'::uuid[])
  )
  returning id into v_version_id;

  return v_version_id;
end;
$$;

revoke all on function reserve_reality_focus_turn(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function reserve_reality_focus_turn(uuid, uuid, text, text) to service_role;

revoke all on function complete_reality_focus_turn(uuid, uuid, integer, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function complete_reality_focus_turn(uuid, uuid, integer, jsonb, boolean, jsonb) to service_role;

revoke all on function stop_reality_focus_for_safety(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function stop_reality_focus_for_safety(uuid, uuid, integer, jsonb) to service_role;

revoke all on function insert_reality_version_with_focus(uuid, uuid, uuid, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function insert_reality_version_with_focus(uuid, uuid, uuid, jsonb, jsonb, uuid[]) to service_role;
