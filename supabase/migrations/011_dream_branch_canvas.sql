-- 梦想分支、单题访谈、实时画布与版本来源快照。

create table if not exists dream_branches (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references dream_cases (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  parent_branch_id  uuid references dream_branches (id) on delete set null,
  name              text not null,
  fork_question     text not null default '',
  tradeoff          text not null default '',
  phase             text not null default 'memory_bridge',
  current_question  text not null default '最近一次让你觉得轻松、投入或羡慕的真实片段，发生了什么？',
  is_focused        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  constraint dream_branch_phase_check check (
    phase in (
      'memory_bridge', 'future_day', 'people', 'inner_state',
      'meaning', 'non_negotiables', 'fork_point'
    )
  )
);

create table if not exists dream_branch_messages (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references dream_branches (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  idempotency_key  text,
  created_at       timestamptz not null default now()
);

create table if not exists dream_branch_canvases (
  branch_id           uuid primary key references dream_branches (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  revision            integer not null default 0 check (revision >= 0),
  content             jsonb not null,
  unknown_dimensions  text[] not null default '{}',
  updated_at          timestamptz not null default now()
);

create table if not exists dream_canvas_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references dream_branches (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  dimension           text not null,
  canvas_item_id      text not null,
  text                text not null,
  source_message_ids  uuid[] not null,
  source_ids          text[] not null default '{}',
  status              text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint dream_canvas_suggestion_item_uniq
    unique (branch_id, canvas_item_id)
);

create table if not exists dream_branch_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references dream_cases (id) on delete cascade,
  source_branch_id    uuid not null references dream_branches (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  label               text not null,
  fork_question       text not null,
  tradeoff            text not null,
  source_message_ids  uuid[] not null,
  status              text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_branch_id   uuid references dream_branches (id) on delete set null,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create table if not exists dream_version_sources (
  id                uuid primary key default gen_random_uuid(),
  dream_version_id  uuid not null references dream_versions (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  source_scope      text not null check (source_scope in ('case', 'branch')),
  source_type       text not null,
  source_id         uuid not null,
  snapshot          jsonb not null,
  created_at        timestamptz not null default now(),
  constraint dream_version_sources_uniq
    unique (dream_version_id, source_scope, source_type, source_id)
);

alter table dream_versions
  add column if not exists branch_id uuid references dream_branches (id) on delete cascade,
  add column if not exists canvas_snapshot jsonb;

alter table dream_sources
  add column if not exists branch_id uuid references dream_branches (id) on delete cascade;

alter table dream_sources
  drop constraint if exists dream_sources_case_source_uniq;

create unique index if not exists idx_dream_sources_case_unique
  on dream_sources (case_id, source_type, source_id)
  where branch_id is null;
create unique index if not exists idx_dream_sources_branch_unique
  on dream_sources (branch_id, source_type, source_id)
  where branch_id is not null;
create unique index if not exists idx_dream_focused_branch
  on dream_branches (case_id)
  where is_focused and archived_at is null;
create unique index if not exists idx_dream_message_idempotency
  on dream_branch_messages (branch_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_dream_branches_case
  on dream_branches (case_id, created_at) where archived_at is null;
create index if not exists idx_dream_messages_branch
  on dream_branch_messages (branch_id, created_at);
create index if not exists idx_dream_canvas_suggestions_branch
  on dream_canvas_suggestions (branch_id, status, created_at);
create index if not exists idx_dream_branch_suggestions_case
  on dream_branch_suggestions (case_id, status, created_at);

alter table dream_branches enable row level security;
alter table dream_branch_messages enable row level security;
alter table dream_branch_canvases enable row level security;
alter table dream_canvas_suggestions enable row level security;
alter table dream_branch_suggestions enable row level security;
alter table dream_version_sources enable row level security;

create or replace function dream_empty_canvas() returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'memory_fragments', '[]'::jsonb,
    'scene_title', '[]'::jsonb,
    'horizon', '[]'::jsonb,
    'location', '[]'::jsonb,
    'people', '[]'::jsonb,
    'sensory_details', '[]'::jsonb,
    'actions', '[]'::jsonb,
    'inner_state', '[]'::jsonb,
    'desired_changes', '[]'::jsonb,
    'past_roots', '[]'::jsonb,
    'non_negotiables', '[]'::jsonb,
    'costs', '[]'::jsonb,
    'assumptions', '[]'::jsonb,
    'reality_signals', '[]'::jsonb,
    'conflicts', '[]'::jsonb
  );
$$;

create or replace function dream_legacy_items(p_value jsonb) returns jsonb
language plpgsql volatile
as $$
declare
  result jsonb := '[]'::jsonb;
  item jsonb;
  text_value text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return result;
  end if;
  if jsonb_typeof(p_value) = 'array' then
    for item in select * from jsonb_array_elements(p_value)
    loop
      text_value := item #>> '{}';
      if text_value <> '' then
        result := result || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text,
          'text', text_value,
          'origin', 'legacy',
          'status', 'confirmed',
          'source_message_ids', '[]'::jsonb
        ));
      end if;
    end loop;
  else
    text_value := p_value #>> '{}';
    if text_value <> '' then
      result := jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', text_value,
        'origin', 'legacy',
        'status', 'confirmed',
        'source_message_ids', '[]'::jsonb
      ));
    end if;
  end if;
  return result;
end;
$$;

insert into dream_branches (
  case_id, user_id, name, phase, current_question, is_focused, created_at, updated_at
)
select
  c.id, c.user_id, '原始路径', 'memory_bridge',
  '最近一次让你觉得轻松、投入或羡慕的真实片段，发生了什么？',
  true, c.created_at, c.updated_at
from dream_cases c
where not exists (
  select 1 from dream_branches b where b.case_id = c.id
);

insert into dream_branch_messages (
  branch_id, user_id, role, content, idempotency_key, created_at
)
select
  b.id,
  c.user_id,
  case when message.value->>'role' = 'assistant' then 'assistant' else 'user' end,
  message.value->>'content',
  'legacy-' || message.ordinality,
  c.created_at + (message.ordinality || ' milliseconds')::interval
from dream_cases c
join dream_branches b
  on b.case_id = c.id and b.parent_branch_id is null
cross join lateral jsonb_array_elements(c.messages)
  with ordinality as message(value, ordinality)
where coalesce(message.value->>'content', '') <> ''
on conflict do nothing;

update dream_versions v
set branch_id = b.id
from dream_branches b
where b.case_id = v.case_id
  and b.parent_branch_id is null
  and v.branch_id is null;

insert into dream_branch_canvases (
  branch_id, user_id, revision, content, unknown_dimensions, updated_at
)
select
  b.id,
  b.user_id,
  0,
  case
    when latest.vision is null then dream_empty_canvas()
    else jsonb_build_object(
      'memory_fragments', '[]'::jsonb,
      'scene_title', dream_legacy_items(latest.vision->'scene'->'title'),
      'horizon', dream_legacy_items(latest.vision->'scene'->'horizon'),
      'location', dream_legacy_items(latest.vision->'scene'->'location'),
      'people', dream_legacy_items(latest.vision->'scene'->'people'),
      'sensory_details', dream_legacy_items(latest.vision->'scene'->'sensory_details'),
      'actions', dream_legacy_items(latest.vision->'scene'->'actions'),
      'inner_state', dream_legacy_items(latest.vision->'scene'->'inner_state'),
      'desired_changes', dream_legacy_items(latest.vision->'desired_changes'),
      'past_roots', dream_legacy_items(latest.vision->'past_roots'),
      'non_negotiables', dream_legacy_items(latest.vision->'non_negotiables'),
      'costs', dream_legacy_items(latest.vision->'costs'),
      'assumptions', dream_legacy_items(latest.vision->'assumptions'),
      'reality_signals', dream_legacy_items(latest.vision->'reality_signals'),
      'conflicts', dream_legacy_items(latest.vision->'conflicts')
    )
  end,
  '{}'::text[],
  b.updated_at
from dream_branches b
left join lateral (
  select v.vision
  from dream_versions v
  where v.branch_id = b.id
  order by v.version_no desc
  limit 1
) latest on true
where not exists (
  select 1 from dream_branch_canvases canvas where canvas.branch_id = b.id
);

insert into dream_version_sources (
  dream_version_id, user_id, source_scope, source_type, source_id, snapshot
)
select
  version.id, source.user_id, 'case', source.source_type, source.source_id, source.snapshot
from dream_versions version
join dream_sources source
  on source.case_id = version.case_id and source.branch_id is null
on conflict do nothing;

alter table dream_versions
  alter column branch_id set not null;

alter table dream_versions
  drop constraint if exists dream_versions_case_version_uniq;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dream_versions_branch_version_uniq'
      and conrelid = 'dream_versions'::regclass
  ) then
    alter table dream_versions
      add constraint dream_versions_branch_version_uniq
        unique (branch_id, version_no);
  end if;
end $$;

create or replace function enforce_dream_branch_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_count integer;
begin
  select count(*) into active_count
  from dream_branches
  where case_id = new.case_id and archived_at is null;
  if active_count >= 5 then
    raise exception '同一梦想最多保留5个活跃分支';
  end if;
  return new;
end;
$$;

drop trigger if exists dream_branch_limit_trigger on dream_branches;
create trigger dream_branch_limit_trigger
before insert on dream_branches
for each row execute function enforce_dream_branch_limit();

create or replace function set_focused_dream_branch(
  p_case_id uuid,
  p_branch_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dream_cases
    where id = p_case_id and user_id = p_user_id
  ) or not exists (
    select 1 from dream_branches
    where id = p_branch_id
      and case_id = p_case_id
      and user_id = p_user_id
      and archived_at is null
  ) then
    raise exception '无权切换该梦想分支';
  end if;
  perform 1 from dream_cases where id = p_case_id for update;
  update dream_branches
  set is_focused = false, updated_at = now()
  where case_id = p_case_id
    and user_id = p_user_id
    and archived_at is null
    and is_focused;
  update dream_branches
  set is_focused = true, updated_at = now()
  where id = p_branch_id and user_id = p_user_id;
  return p_branch_id;
end;
$$;

revoke all on function set_focused_dream_branch(uuid, uuid, uuid) from public;
revoke all on function set_focused_dream_branch(uuid, uuid, uuid) from anon;
revoke all on function set_focused_dream_branch(uuid, uuid, uuid) from authenticated;
grant execute on function set_focused_dream_branch(uuid, uuid, uuid) to service_role;

create or replace function dream_confirmed_canvas(p_content jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(
    jsonb_object_agg(
      dimension,
      (
        select coalesce(jsonb_agg(item), '[]'::jsonb)
        from jsonb_array_elements(items) as entries(item)
        where item->>'status' = 'confirmed'
      )
    ),
    dream_empty_canvas()
  )
  from jsonb_each(p_content) as dimensions(dimension, items);
$$;

create or replace function accept_dream_branch_suggestion(
  p_suggestion_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_row dream_branch_suggestions%rowtype;
  source_canvas dream_branch_canvases%rowtype;
  new_branch_id uuid;
begin
  select * into suggestion_row
  from dream_branch_suggestions
  where id = p_suggestion_id
  for update;
  if suggestion_row.id is null
    or suggestion_row.user_id is distinct from p_user_id
    or suggestion_row.status <> 'pending' then
    raise exception '无权创建该梦想分支';
  end if;
  if not exists (
    select 1 from dream_branches
    where id = suggestion_row.source_branch_id
      and case_id = suggestion_row.case_id
      and user_id = p_user_id
      and archived_at is null
  ) then
    raise exception '来源分支不存在或已经归档';
  end if;
  perform 1 from dream_cases
  where id = suggestion_row.case_id and user_id = p_user_id
  for update;
  select * into source_canvas
  from dream_branch_canvases
  where branch_id = suggestion_row.source_branch_id;

  insert into dream_branches (
    case_id, user_id, parent_branch_id, name, fork_question, tradeoff,
    phase, current_question, is_focused
  ) values (
    suggestion_row.case_id,
    p_user_id,
    suggestion_row.source_branch_id,
    suggestion_row.label,
    suggestion_row.fork_question,
    suggestion_row.tradeoff,
    'fork_point',
    suggestion_row.fork_question,
    false
  ) returning id into new_branch_id;

  insert into dream_branch_canvases (
    branch_id, user_id, revision, content, unknown_dimensions
  ) values (
    new_branch_id,
    p_user_id,
    0,
    dream_confirmed_canvas(
      coalesce(source_canvas.content, dream_empty_canvas())
    ),
    coalesce(source_canvas.unknown_dimensions, '{}'::text[])
  );

  update dream_branch_suggestions
  set status = 'accepted',
      created_branch_id = new_branch_id,
      resolved_at = now()
  where id = p_suggestion_id;
  return new_branch_id;
end;
$$;

create or replace function archive_dream_branch(
  p_branch_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_row dream_branches%rowtype;
  replacement_id uuid;
  active_count integer;
begin
  select * into branch_row
  from dream_branches
  where id = p_branch_id
  for update;
  if branch_row.id is null
    or branch_row.user_id is distinct from p_user_id
    or branch_row.archived_at is not null then
    raise exception '无权归档该梦想分支';
  end if;
  select count(*) into active_count
  from dream_branches
  where case_id = branch_row.case_id and archived_at is null;
  if active_count <= 1 then
    raise exception '至少保留一个活跃梦想分支';
  end if;
  update dream_branches
  set archived_at = now(), is_focused = false, updated_at = now()
  where id = p_branch_id;
  if branch_row.is_focused then
    select id into replacement_id
    from dream_branches
    where case_id = branch_row.case_id and archived_at is null
    order by created_at
    limit 1;
    update dream_branches
    set is_focused = true, updated_at = now()
    where id = replacement_id;
  end if;
  return p_branch_id;
end;
$$;

revoke all on function accept_dream_branch_suggestion(uuid, uuid) from public;
revoke all on function accept_dream_branch_suggestion(uuid, uuid) from anon;
revoke all on function accept_dream_branch_suggestion(uuid, uuid) from authenticated;
grant execute on function accept_dream_branch_suggestion(uuid, uuid) to service_role;
revoke all on function archive_dream_branch(uuid, uuid) from public;
revoke all on function archive_dream_branch(uuid, uuid) from anon;
revoke all on function archive_dream_branch(uuid, uuid) from authenticated;
grant execute on function archive_dream_branch(uuid, uuid) to service_role;

create or replace function create_dream_case_with_branch(
  p_user_id uuid,
  p_title text,
  p_context dream_context,
  p_scale dream_scale,
  p_initial_desire text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_case_id uuid;
  new_branch_id uuid;
begin
  insert into dream_cases (
    user_id, title, context, scale, initial_desire, messages
  ) values (
    p_user_id, p_title, p_context, p_scale, p_initial_desire, '[]'::jsonb
  ) returning id into new_case_id;
  insert into dream_branches (
    case_id, user_id, name, phase, current_question, is_focused
  ) values (
    new_case_id,
    p_user_id,
    '原始路径',
    'memory_bridge',
    '最近一次让你觉得轻松、投入或羡慕的真实片段，发生了什么？',
    true
  ) returning id into new_branch_id;
  insert into dream_branch_canvases (
    branch_id, user_id, revision, content
  ) values (
    new_branch_id, p_user_id, 0, dream_empty_canvas()
  );
  insert into dream_branch_messages (
    branch_id, user_id, role, content, idempotency_key
  ) values (
    new_branch_id, p_user_id, 'user', p_initial_desire, 'initial-desire'
  );
  return new_case_id;
end;
$$;

revoke all on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) from public;
revoke all on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) from anon;
revoke all on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) from authenticated;
grant execute on function create_dream_case_with_branch(uuid, text, dream_context, dream_scale, text) to service_role;

create or replace function apply_dream_turn(
  p_branch_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_content jsonb,
  p_unknown_dimensions text[],
  p_phase text,
  p_question text,
  p_inferences jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  canvas_row dream_branch_canvases%rowtype;
  inference jsonb;
begin
  select * into canvas_row
  from dream_branch_canvases
  where branch_id = p_branch_id
  for update;
  if canvas_row.branch_id is null
    or canvas_row.user_id is distinct from p_user_id then
    raise exception '无权更新该梦想画布';
  end if;
  if canvas_row.revision <> p_expected_revision then
    raise exception '画布已经更新，请基于最新版本重试';
  end if;
  update dream_branch_canvases
  set content = p_content,
      unknown_dimensions = p_unknown_dimensions,
      revision = revision + 1,
      updated_at = now()
  where branch_id = p_branch_id;
  update dream_branches
  set phase = p_phase,
      current_question = p_question,
      updated_at = now()
  where id = p_branch_id and user_id = p_user_id;
  insert into dream_branch_messages (
    branch_id, user_id, role, content
  ) values (
    p_branch_id, p_user_id, 'assistant', p_question
  );
  for inference in select * from jsonb_array_elements(p_inferences)
  loop
    insert into dream_canvas_suggestions (
      branch_id, user_id, dimension, canvas_item_id, text,
      source_message_ids, source_ids, status
    ) values (
      p_branch_id,
      p_user_id,
      inference->>'dimension',
      inference->>'canvas_item_id',
      inference->>'text',
      array(
        select value::uuid
        from jsonb_array_elements_text(inference->'source_message_ids')
      ),
      array(
        select value
        from jsonb_array_elements_text(inference->'source_ids')
      ),
      'pending'
    )
    on conflict (branch_id, canvas_item_id) do nothing;
  end loop;
  return p_expected_revision + 1;
end;
$$;

revoke all on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) from public;
revoke all on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) from anon;
revoke all on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) from authenticated;
grant execute on function apply_dream_turn(uuid, uuid, integer, jsonb, text[], text, text, jsonb) to service_role;

create or replace function create_dream_branch_version(
  p_case_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_vision jsonb,
  p_canvas_snapshot jsonb,
  p_delta jsonb,
  p_prompt_version text,
  p_sources jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_row dream_branches%rowtype;
  previous_row dream_versions%rowtype;
  new_version_id uuid;
  source jsonb;
begin
  select * into branch_row
  from dream_branches
  where id = p_branch_id
  for update;
  if branch_row.id is null
    or branch_row.case_id is distinct from p_case_id
    or branch_row.user_id is distinct from p_user_id
    or branch_row.archived_at is not null then
    raise exception '无权创建该梦想版本';
  end if;
  select * into previous_row
  from dream_versions
  where branch_id = p_branch_id
  order by version_no desc
  limit 1;
  insert into dream_versions (
    case_id, branch_id, previous_version_id, version_no, vision,
    canvas_snapshot, delta, prompt_version
  ) values (
    p_case_id,
    p_branch_id,
    previous_row.id,
    coalesce(previous_row.version_no, 0) + 1,
    p_vision,
    p_canvas_snapshot,
    p_delta,
    p_prompt_version
  ) returning id into new_version_id;
  for source in select * from jsonb_array_elements(p_sources)
  loop
    insert into dream_version_sources (
      dream_version_id, user_id, source_scope, source_type, source_id, snapshot
    ) values (
      new_version_id,
      p_user_id,
      source->>'source_scope',
      source->>'source_type',
      (source->>'source_id')::uuid,
      source->'snapshot'
    );
  end loop;
  update dream_cases set updated_at = now()
  where id = p_case_id and user_id = p_user_id;
  return new_version_id;
end;
$$;

revoke all on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) from public;
revoke all on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) from anon;
revoke all on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) from authenticated;
grant execute on function create_dream_branch_version(uuid, uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) to service_role;

create or replace function resolve_dream_canvas_suggestion(
  p_suggestion_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_content jsonb,
  p_resolution text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_row dream_canvas_suggestions%rowtype;
  canvas_row dream_branch_canvases%rowtype;
begin
  if p_resolution not in ('accepted', 'rejected') then
    raise exception '画布建议处理方式无效';
  end if;
  select * into suggestion_row
  from dream_canvas_suggestions
  where id = p_suggestion_id
  for update;
  if suggestion_row.id is null
    or suggestion_row.branch_id is distinct from p_branch_id
    or suggestion_row.user_id is distinct from p_user_id
    or suggestion_row.status <> 'pending' then
    raise exception '画布建议不存在或已经处理';
  end if;
  select * into canvas_row
  from dream_branch_canvases
  where branch_id = p_branch_id
  for update;
  if canvas_row.user_id is distinct from p_user_id
    or canvas_row.revision <> p_expected_revision then
    raise exception '画布已经更新，请刷新后重试';
  end if;
  update dream_branch_canvases
  set content = p_content,
      revision = revision + 1,
      updated_at = now()
  where branch_id = p_branch_id;
  update dream_canvas_suggestions
  set status = p_resolution, resolved_at = now()
  where id = p_suggestion_id;
  return p_expected_revision + 1;
end;
$$;

revoke all on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) from public;
revoke all on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) from anon;
revoke all on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) from authenticated;
grant execute on function resolve_dream_canvas_suggestion(uuid, uuid, uuid, integer, jsonb, text) to service_role;
