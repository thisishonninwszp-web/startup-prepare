begin;
-- Manual event-scoped attention history; never filters feeds or changes idea state.
create table public.reading_attention_entries (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null, kind text not null check(kind in ('contract','contract_exit','register','review','blind_start','blind_judge','blind_exit','blind_reveal')),
 version_id uuid references public.reading_attention_entries(id), payload jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade
);
create index reading_attention_page on public.reading_attention_entries(user_id,event_id,revision);
create unique index reading_attention_registration on public.reading_attention_entries(version_id,(payload->>'snapshotId')) where kind='register';
create table public.reading_attention_requests (
 user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 input jsonb not null, entry_id uuid not null references public.reading_attention_entries(id), primary key(user_id,request_id)
);
alter table public.reading_attention_entries enable row level security;
alter table public.reading_attention_requests enable row level security;
-- All access through service-only RPCs; raw storage contains frozen titles.
revoke all on public.reading_attention_entries,public.reading_attention_requests from public,anon,authenticated,service_role;
create function public.reading_attention_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'reading attention history is immutable'; end $$;
create trigger reading_attention_immutable before update or delete on public.reading_attention_entries for each row execute function public.reading_attention_immutable();
create trigger reading_attention_request_immutable before update or delete on public.reading_attention_requests for each row execute function public.reading_attention_immutable();
create function public.reading_attention_owner(p_user_id uuid,p_event_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' or not exists(select 1 from signal_events where id=p_event_id and user_id=p_user_id) then raise exception 'reading attention owner required' using errcode='42501'; end if;
end $$;
create function public.reading_attention_dto(r public.reading_attention_entries) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'revision',r.revision::text,'event_id',r.event_id,'version_id',r.version_id,'kind',r.kind,'payload',case when r.kind='register' then r.payload-'privateTitle' when r.kind='blind_start' then r.payload-'privateTitle' else r.payload end,'created_at',r.created_at)
$$;
create function public.save_reading_attention(p_user_id uuid,p_event_id uuid,p_kind text,p_version_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reading_attention_entries; prior reading_attention_requests; latest reading_attention_entries; target reading_attention_entries; snap signal_source_snapshots; n integer; rule integer; body jsonb; request jsonb;
begin
 perform reading_attention_owner(p_user_id,p_event_id);
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid reading attention input'; end if;
 -- User lock protects request identities across events; event lock serializes ordinals and state transitions.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,115));
 perform 1 from signal_events where id=p_event_id and user_id=p_user_id for update;
 request:=jsonb_build_object('eventId',p_event_id,'kind',p_kind,'versionId',p_version_id,'payload',p_payload);
 select * into prior from reading_attention_requests where user_id=p_user_id and request_id=p_request_id;
 if found then
  if prior.input<>request then raise exception 'request payload conflict'; end if;
  select * into r from reading_attention_entries where id=prior.entry_id; return reading_attention_dto(r);
 end if;
 select * into latest from reading_attention_entries where event_id=p_event_id and user_id=p_user_id and kind in ('contract','contract_exit') order by revision desc limit 1;
 body:=p_payload;
 if p_kind in ('contract','contract_exit') then
  if p_version_id is distinct from latest.id then raise exception 'contract changed; reload'; end if;
  if p_kind='contract' then
   if not (p_payload ?& array['triggers','counterevidence','everyNth']) or (p_payload-array['triggers','counterevidence','everyNth'])<>'{}'::jsonb or jsonb_typeof(p_payload->'triggers')<>'string' or jsonb_typeof(p_payload->'counterevidence')<>'string' or length(btrim(p_payload->>'triggers')) not between 1 and 4000 or length(btrim(p_payload->>'counterevidence')) not between 1 and 4000 or coalesce(p_payload->>'everyNth','')!~'^[0-9]{1,4}$' or (p_payload->>'everyNth')::integer not between 1 and 1000 then raise exception 'invalid contract'; end if;
  elsif p_payload<>'{}'::jsonb or latest.kind is distinct from 'contract' then raise exception 'no active contract'; end if;
 elsif p_kind='register' then
  if latest.kind is distinct from 'contract' or p_version_id is distinct from latest.id then raise exception 'contract changed; reload'; end if;
  if not(p_payload ?& array['snapshotId','choice']) or (p_payload-array['snapshotId','choice','contractMatch','matchReason'])<>'{}'::jsonb or coalesce(p_payload->>'choice','') not in ('seen','open','skip','pending') then raise exception 'explicit user choice required'; end if;
  if coalesce(p_payload->>'contractMatch','unknown') not in ('matched','not_matched','unknown') or (p_payload ? 'matchReason' and (jsonb_typeof(p_payload->'matchReason')<>'string' or length(p_payload->>'matchReason')>4000)) then raise exception 'invalid manual match'; end if;
  select * into snap from signal_source_snapshots s where s.id=(p_payload->>'snapshotId')::uuid and s.user_id=p_user_id and exists(select 1 from signal_event_memberships m where m.user_id=p_user_id and m.event_id=p_event_id and m.snapshot_id=s.id and m.action='include');
  if not found then raise exception 'source unavailable' using errcode='42501'; end if;
  select * into r from reading_attention_entries where event_id=p_event_id and version_id=p_version_id and kind='register' and payload->>'snapshotId'=snap.id::text;
  if found then insert into reading_attention_requests values(p_user_id,p_request_id,request,r.id); return reading_attention_dto(r); end if;
  select count(*)::integer+1 into n from reading_attention_entries where version_id=p_version_id and kind='register'; rule:=(latest.payload->>'everyNth')::integer;
  body:=jsonb_build_object('contractMatch','unknown')||p_payload||jsonb_build_object('ordinal',n,'sampled',(n-1)%rule=0,'rule',latest.payload,'snapshot',jsonb_build_object('snapshotId',snap.id,'body',snap.captured_text,'sourceUrl',snap.source_url,'capturedAt',snap.captured_at,'captureScope',snap.capture_scope),'privateTitle',snap.title);
 elsif p_kind in ('review','blind_start') then
  if not(p_payload ? 'registrationId') or (p_payload - case when p_kind='review' then array['registrationId','note'] else array['registrationId'] end)<>'{}'::jsonb then raise exception 'invalid registration reference'; end if;
  select * into target from reading_attention_entries where id=(p_payload->>'registrationId')::uuid and user_id=p_user_id and event_id=p_event_id and kind='register';
  if not found then raise exception 'registration unavailable' using errcode='42501'; end if;
  p_version_id:=target.version_id;
  if p_kind='review' then
   if jsonb_typeof(p_payload->'note') is distinct from 'string' or length(btrim(p_payload->>'note')) not between 1 and 4000 then raise exception 'review note required'; end if;
  else
   select * into r from reading_attention_entries where event_id=p_event_id and kind='blind_start' and payload->>'registrationId'=target.id::text;
   if found then insert into reading_attention_requests values(p_user_id,p_request_id,request,r.id); return reading_attention_dto(r); end if;
   if target.payload->>'sampled'<>'true' then raise exception 'blind reading requires fixed sample'; end if;
   body:=jsonb_build_object('registrationId',target.id,'body',target.payload->'snapshot'->'body','sourceUrl',target.payload->'snapshot'->'sourceUrl','privateTitle',target.payload->'privateTitle');
  end if;
 elsif p_kind in ('blind_judge','blind_reveal','blind_exit') then
  if not(p_payload ? 'sessionId') or (p_payload - case when p_kind='blind_judge' then array['sessionId','judgment'] else array['sessionId'] end)<>'{}'::jsonb then raise exception 'invalid session reference'; end if;
  select * into target from reading_attention_entries where id=(p_payload->>'sessionId')::uuid and user_id=p_user_id and event_id=p_event_id and kind='blind_start';
  if not found then raise exception 'blind session unavailable' using errcode='42501'; end if;
  p_version_id:=target.version_id;
  if exists(select 1 from reading_attention_entries where event_id=p_event_id and kind in ('blind_reveal','blind_exit') and payload->>'sessionId'=target.id::text) then raise exception 'blind session closed'; end if;
  if p_kind='blind_judge' then
   if jsonb_typeof(p_payload->'judgment') is distinct from 'string' or length(btrim(p_payload->>'judgment')) not between 1 and 4000 then raise exception 'judgment required'; end if;
   if exists(select 1 from reading_attention_entries where event_id=p_event_id and kind='blind_judge' and payload->>'sessionId'=target.id::text) then raise exception 'judgment already frozen'; end if;
  else
   if p_kind='blind_reveal' and not exists(select 1 from reading_attention_entries where event_id=p_event_id and kind='blind_judge' and payload->>'sessionId'=target.id::text) then raise exception 'judgment required before reveal'; end if;
   body:=p_payload||jsonb_build_object('title',target.payload->'privateTitle','body',target.payload->'body','sourceUrl',target.payload->'sourceUrl');
  end if;
 else raise exception 'invalid attention kind'; end if;
 insert into reading_attention_entries(user_id,event_id,kind,version_id,payload) values(p_user_id,p_event_id,p_kind,p_version_id,body) returning * into r;
 insert into reading_attention_requests values(p_user_id,p_request_id,request,r.id);
 return reading_attention_dto(r);
end $$;
create function public.page_reading_attention(p_user_id uuid,p_event_id uuid,p_after bigint default null,p_samples_only boolean default false,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb; cursor text;
begin
 perform reading_attention_owner(p_user_id,p_event_id);
 if p_limit is null or p_limit not between 1 and 100 or (p_after is not null and p_after<1) then raise exception 'invalid attention page'; end if;
 select coalesce(jsonb_agg(reading_attention_dto(t) order by t.revision),'[]'::jsonb),max(t.revision)::text into rows,cursor from (select * from reading_attention_entries where user_id=p_user_id and event_id=p_event_id and (p_after is null or revision>p_after) and (not p_samples_only or (kind='register' and payload->>'sampled'='true')) order by revision limit p_limit) t;
 return jsonb_build_object('available',true,'entries',rows,'nextCursor',case when jsonb_array_length(rows)=p_limit then cursor else null end);
end $$;
revoke all on function public.reading_attention_owner(uuid,uuid),public.reading_attention_dto(public.reading_attention_entries),public.save_reading_attention(uuid,uuid,text,uuid,jsonb,uuid),public.page_reading_attention(uuid,uuid,bigint,boolean,integer) from public,anon,authenticated;
grant execute on function public.save_reading_attention(uuid,uuid,text,uuid,jsonb,uuid),public.page_reading_attention(uuid,uuid,bigint,boolean,integer) to service_role;


commit;

