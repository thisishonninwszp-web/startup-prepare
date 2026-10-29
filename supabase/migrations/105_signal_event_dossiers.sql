-- Private, explicitly curated event dossiers. No AI, scores, or automatic membership.
create table public.signal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  scope_note text check (length(scope_note) <= 1000),
  revision bigint not null default 0 check (revision >= 0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(user_id,id), unique(user_id,client_request_id)
);
create index signal_events_page on public.signal_events(user_id,created_at desc,id desc);

create table public.signal_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null references public.external_signals(id) on delete restrict,
  title text not null check(length(btrim(title)) between 1 and 1000),
  source_name text not null check(length(btrim(source_name)) between 1 and 200),
  source_url text check(source_url is null or (length(source_url) <= 4096 and source_url ~* '^https?://[^/[:space:]]+' and source_url !~* '^https?://[^/]*@')),
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  source_fetched_at timestamptz,
  capture_scope text not null check(capture_scope in ('summary','excerpt','body')),
  captured_text text not null check(length(btrim(captured_text)) between 1 and 100000),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  unique(user_id,id,signal_id), unique(user_id,signal_id,payload_hash)
);
create table public.signal_event_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  signal_id uuid not null references public.external_signals(id) on delete restrict,
  snapshot_id uuid,
  action text not null check(action in ('include','exclude')),
  revision bigint not null check(revision > 0),
  client_request_id uuid not null,
  note text check(length(note) <= 1000),
  occurred_from text, occurred_to text, occurred_precision text, occurred_quote text,
  created_at timestamptz not null default now(),
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
  foreign key(user_id,snapshot_id,signal_id) references public.signal_source_snapshots(user_id,id,signal_id) on delete restrict,
  unique(event_id,revision), unique(user_id,client_request_id),
  check(action<>'include' or snapshot_id is not null),
  check ((occurred_from is null and occurred_to is null and occurred_precision is null and occurred_quote is null) or
    (occurred_from is not null and occurred_precision in ('day','month','year') and length(btrim(occurred_quote)) between 1 and 4000))
);
create index signal_event_members_latest on public.signal_event_memberships(user_id,event_id,signal_id,revision desc);

alter table public.signal_events enable row level security;
alter table public.signal_source_snapshots enable row level security;
alter table public.signal_event_memberships enable row level security;
create policy event_owner_read on public.signal_events for select to authenticated using(auth.uid()=user_id);
create policy snapshot_owner_read on public.signal_source_snapshots for select to authenticated using(auth.uid()=user_id);
create policy membership_owner_read on public.signal_event_memberships for select to authenticated using(auth.uid()=user_id);
revoke all on public.signal_events,public.signal_source_snapshots,public.signal_event_memberships from anon,authenticated;
grant select on public.signal_events,public.signal_source_snapshots,public.signal_event_memberships to authenticated;
grant all on public.signal_events,public.signal_source_snapshots,public.signal_event_memberships to service_role;

-- Date precision remains text: a month/year never masquerades as an exact day.
create function public.signal_occurrence_date(value text, p_precision text) returns date
language plpgsql immutable set search_path=public,pg_temp as $$
declare normalized text; result date;
begin
  if value is null then return null; end if;
  if p_precision='day' and value ~ '^\d{4}-\d{2}-\d{2}$' then normalized:=value;
  elsif p_precision='month' and value ~ '^\d{4}-\d{2}$' then normalized:=value||'-01';
  elsif p_precision='year' and value ~ '^\d{4}$' then normalized:=value||'-01-01';
  else raise exception 'invalid occurrence precision'; end if;
  result:=normalized::date;
  if to_char(result,'YYYY-MM-DD')<>normalized then raise exception 'invalid occurrence date'; end if;
  return result;
end $$;

create function public.signal_event_guard_owner(p_user_id uuid) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_user_id is null or (coalesce(auth.role(),'')<>'service_role' and auth.uid() is distinct from p_user_id) then
    raise exception 'event owner required' using errcode='42501';
  end if;
end $$;

create function public.signal_snapshot_immutable() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.captured_at:=clock_timestamp(); return new; end if;
  if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  raise exception 'source snapshots are immutable';
end $$;
create trigger source_snapshot_immutable before insert or update or delete on public.signal_source_snapshots for each row execute function public.signal_snapshot_immutable();

create function public.signal_membership_immutable() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare text_copy text; from_date date; to_date date;
begin
  if tg_op='DELETE' and (not exists(select 1 from auth.users where id=old.user_id) or not exists(select 1 from public.signal_events where id=old.event_id and user_id=old.user_id)) then return old; end if;
  if tg_op<>'INSERT' then raise exception 'membership history is append only'; end if;
  if new.occurred_from is not null then
    from_date:=public.signal_occurrence_date(new.occurred_from,new.occurred_precision);
    to_date:=public.signal_occurrence_date(new.occurred_to,new.occurred_precision);
    if to_date<from_date then raise exception 'occurrence interval reversed'; end if;
    select captured_text into text_copy from public.signal_source_snapshots where id=new.snapshot_id and user_id=new.user_id and signal_id=new.signal_id;
    if text_copy is null or new.occurred_quote is null or position(new.occurred_quote in text_copy)=0 then raise exception 'occurrence quote absent from snapshot'; end if;
  end if;
  return new;
end $$;
create trigger membership_immutable before insert or update or delete on public.signal_event_memberships for each row execute function public.signal_membership_immutable();

create function public.create_signal_event(p_user_id uuid,p_title text,p_scope_note text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare row public.signal_events;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_request_id is null or p_title is null or length(btrim(p_title)) not between 1 and 120 or length(p_scope_note)>1000 then raise exception 'invalid event input'; end if;
  -- Unique insertion serializes concurrent retries, then compare the original payload.
  insert into public.signal_events(user_id,title,scope_note,client_request_id)
    values(p_user_id,btrim(p_title),nullif(btrim(p_scope_note),''),p_request_id)
    on conflict(user_id,client_request_id) do nothing;
  select * into row from public.signal_events where user_id=p_user_id and client_request_id=p_request_id for update;
  if row.title is distinct from btrim(p_title) or row.scope_note is distinct from nullif(btrim(p_scope_note),'') then raise exception 'request payload conflict' using errcode='23505'; end if;
  return jsonb_build_object('id',row.id,'revision',row.revision);
end $$;

create function public.revise_signal_event_member(p_user_id uuid,p_event_id uuid,p_signal_id uuid,p_snapshot_id uuid,p_action text,p_request_id uuid,p_note text default null,p_occurred_from text default null,p_occurred_to text default null,p_occurred_precision text default null,p_occurred_quote text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare event_row public.signal_events; old_row public.signal_event_memberships; snapshot uuid; new_revision bigint;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_event_id is null or p_signal_id is null or p_request_id is null or p_action is null or p_action not in ('include','exclude') or length(p_note)>1000 then raise exception 'invalid member input'; end if;
  select * into event_row from public.signal_events where id=p_event_id and user_id=p_user_id for update;
  if not found or event_row.archived_at is not null then raise exception 'event unavailable' using errcode='42501'; end if;
  select * into old_row from public.signal_event_memberships where user_id=p_user_id and client_request_id=p_request_id;
  if found then
    if old_row.event_id is distinct from p_event_id or old_row.signal_id is distinct from p_signal_id or old_row.action is distinct from p_action or
      (p_snapshot_id is not null and old_row.snapshot_id is distinct from p_snapshot_id) or old_row.note is distinct from nullif(btrim(p_note),'') or
      old_row.occurred_from is distinct from p_occurred_from or old_row.occurred_to is distinct from p_occurred_to or old_row.occurred_precision is distinct from p_occurred_precision or old_row.occurred_quote is distinct from p_occurred_quote then raise exception 'request payload conflict' using errcode='23505'; end if;
    return jsonb_build_object('revision',old_row.revision);
  end if;
  if p_action='exclude' then
    if p_snapshot_id is not null or p_occurred_from is not null or p_occurred_to is not null or p_occurred_precision is not null or p_occurred_quote is not null then raise exception 'exclude cannot supply source or dates'; end if;
    select * into old_row from public.signal_event_memberships where user_id=p_user_id and event_id=p_event_id and signal_id=p_signal_id order by revision desc limit 1;
    snapshot:=old_row.snapshot_id;
  else
    snapshot:=p_snapshot_id;
    if snapshot is null or not exists(select 1 from public.signal_source_snapshots where user_id=p_user_id and id=snapshot and signal_id=p_signal_id) then raise exception 'source snapshot unavailable' using errcode='42501'; end if;
  end if;
  update public.signal_events set revision=revision+1 where id=p_event_id returning revision into new_revision;
  insert into public.signal_event_memberships(user_id,event_id,signal_id,snapshot_id,action,revision,client_request_id,note,occurred_from,occurred_to,occurred_precision,occurred_quote)
    values(p_user_id,p_event_id,p_signal_id,snapshot,p_action,new_revision,p_request_id,nullif(btrim(p_note),''),p_occurred_from,p_occurred_to,p_occurred_precision,p_occurred_quote);
  return jsonb_build_object('revision',new_revision);
end $$;

create function public.list_signal_events(p_user_id uuid,p_search text default '',p_cursor text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; cursor_data jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_limit is null or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'invalid page input'; end if;
  cursor_data:=p_cursor::jsonb;
  with selected as (
    select id,title,scope_note,revision,created_at,archived_at from public.signal_events
    where user_id=p_user_id and archived_at is null and (coalesce(p_search,'')='' or title ilike '%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%')
      and (p_cursor is null or (created_at,id)<((cursor_data->>'at')::timestamptz,(cursor_data->>'id')::uuid))
    order by created_at desc,id desc limit p_limit+1
  ), page as (select * from selected order by created_at desc,id desc limit p_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from selected)>p_limit then (select jsonb_build_object('at',created_at,'id',id)::text from page order by created_at,id limit 1) else null end) into result;
  return result;
end $$;

create function public.signal_event_timeline(p_user_id uuid,p_event_id uuid,p_mode text default 'published',p_cursor text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; cursor_data jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_mode is null or p_mode not in ('published','occurred','captured') or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid timeline input'; end if;
  if not exists(select 1 from public.signal_events where user_id=p_user_id and id=p_event_id) then raise exception 'event unavailable' using errcode='42501'; end if;
  cursor_data:=p_cursor::jsonb;
  if p_cursor is not null and cursor_data->>'mode' is distinct from p_mode then raise exception 'cursor mode mismatch'; end if;
  with latest as (
    select distinct on (m.signal_id) m.* from public.signal_event_memberships m
    where m.user_id=p_user_id and m.event_id=p_event_id order by m.signal_id,m.revision desc
  ), entries as (
    select m.signal_id,s.id as snapshot_id,s.title,s.source_name,s.source_url,s.published_at,s.captured_at,s.source_fetched_at,s.captured_text,s.capture_scope,
      m.occurred_from,m.occurred_to,m.occurred_precision,m.occurred_quote,m.note,m.revision,
      (select min(o.first_at) from public.signal_opens o where o.user_id=p_user_id and o.signal_id=m.signal_id) as first_open,
      case p_mode when 'published' then s.published_at when 'captured' then s.captured_at else public.signal_occurrence_date(m.occurred_from,m.occurred_precision)::timestamp at time zone 'UTC' end as time_key
    from latest m join public.signal_source_snapshots s on (s.user_id,s.id,s.signal_id)=(m.user_id,m.snapshot_id,m.signal_id)
    where m.action='include'
  ), selected as (
    select * from entries where p_cursor is null or
      (case when cursor_data->>'at' is null then time_key is null and snapshot_id<(cursor_data->>'id')::uuid
        else time_key is null or (time_key,snapshot_id)<((cursor_data->>'at')::timestamptz,(cursor_data->>'id')::uuid) end)
    order by time_key desc nulls last,snapshot_id desc limit p_limit+1
  ), page as (select * from selected order by time_key desc nulls last,snapshot_id desc limit p_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'signalId',signal_id,'snapshotId',snapshot_id,'title',title,'sourceName',source_name,'sourceUrl',source_url,
    'publishedAt',published_at,'capturedAt',captured_at,'sourceFetchedAt',source_fetched_at,'capturedText',captured_text,'captureScope',capture_scope,
    'occurred',case when occurred_from is null then null else jsonb_build_object('from',occurred_from,'to',occurred_to,'precision',occurred_precision,'quote',occurred_quote) end,
    'firstRecordedOpenAt',first_open,'note',note,'revision',revision) order by time_key desc nulls last,snapshot_id desc) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from selected)>p_limit then (select jsonb_build_object('mode',p_mode,'at',time_key,'id',snapshot_id)::text from page order by time_key asc nulls first,snapshot_id asc limit 1) else null end) into result;
  return result;
end $$;

create function public.suggest_signal_event_members(p_user_id uuid,p_event_id uuid,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare event_title text; result jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid candidate limit'; end if;
  select title into event_title from public.signal_events where user_id=p_user_id and id=p_event_id;
  if not found then raise exception 'event unavailable' using errcode='42501'; end if;
  -- Any prior explicit exclusion remains excluded from suggestions. Inclusion always requires a command.
  select coalesce(jsonb_agg(to_jsonb(candidate)),'[]'::jsonb) into result from (
    select s.id,coalesce(s.title,'无标题') as title,s.source,s.url,s.fetched_at from public.external_signals s
    where (to_tsvector('simple',coalesce(s.title,'')) @@ plainto_tsquery('simple',event_title)
      or (select count(distinct substring(event_title from n for 2)) from generate_series(1,length(event_title)-1) n
        where substring(event_title from n for 2) ~ '^[一-龥ぁ-んァ-ヶ]{2}$'
          and position(substring(event_title from n for 2) in coalesce(s.title,''))>0)>=2)
      and s.source not like 'github%'
      and not exists(select 1 from public.signal_event_memberships m where m.user_id=p_user_id and m.event_id=p_event_id and m.signal_id=s.id)
    order by s.fetched_at desc,s.id desc limit p_limit
  ) candidate;
  return result;
end $$;

create function public.signal_event_links(p_user_id uuid,p_signal_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if p_signal_ids is null or cardinality(p_signal_ids)>200 then raise exception 'invalid signal batch'; end if;
  with latest as (
    select distinct on (m.event_id,m.signal_id) m.event_id,m.signal_id,m.action
    from public.signal_event_memberships m where m.user_id=p_user_id and m.signal_id=any(p_signal_ids)
    order by m.event_id,m.signal_id,m.revision desc
  ), grouped as (
    select m.signal_id,jsonb_agg(jsonb_build_object('id',e.id,'title',e.title) order by e.created_at desc,e.id desc) as links
    from latest m join public.signal_events e on e.id=m.event_id and e.user_id=p_user_id
    where m.action='include' and e.archived_at is null group by m.signal_id
  ) select coalesce(jsonb_object_agg(signal_id::text,links),'{}'::jsonb) into result from grouped;
  return result;
end $$;

revoke all on function public.signal_occurrence_date(text,text),public.signal_event_guard_owner(uuid),public.signal_snapshot_immutable(),public.signal_membership_immutable() from public,anon,authenticated;
revoke all on function public.create_signal_event(uuid,text,text,uuid),public.revise_signal_event_member(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text),public.list_signal_events(uuid,text,text,integer),public.signal_event_timeline(uuid,uuid,text,text,integer),public.suggest_signal_event_members(uuid,uuid,integer) from public,anon;
grant execute on function public.create_signal_event(uuid,text,text,uuid),public.revise_signal_event_member(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text),public.list_signal_events(uuid,text,text,integer),public.signal_event_timeline(uuid,uuid,text,text,integer),public.suggest_signal_event_members(uuid,uuid,integer) to authenticated,service_role;
revoke all on function public.signal_event_links(uuid,uuid[]) from public,anon;
grant execute on function public.signal_event_links(uuid,uuid[]) to authenticated,service_role;
