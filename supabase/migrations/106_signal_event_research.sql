-- Typed append-only research journal: preserves each user's evolving evidence and views.
create table public.signal_event_research_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  kind text not null check (kind in ('note','unknown','unknown_answer','explanation','explanation_evidence','expectation','expectation_resolution','perspective','source_link','dossier','connection','window','window_check','understanding')),
  subject_id uuid,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=65000),
  client_request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id,user_id,event_id), unique(user_id,client_request_id),
  foreign key (user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
  foreign key (subject_id,user_id,event_id) references public.signal_event_research_entries(id,user_id,event_id)
);
create index event_research_history on public.signal_event_research_entries(user_id,event_id,created_at,id);
alter table public.signal_event_research_entries enable row level security;
create policy event_research_owner on public.signal_event_research_entries for select to authenticated using(auth.uid()=user_id);
revoke all on public.signal_event_research_entries from public,anon,authenticated;
grant select on public.signal_event_research_entries to authenticated;
grant select,insert on public.signal_event_research_entries to service_role;

create function public.preserve_event_research() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); return new; end if;
  if tg_op='DELETE' and (not exists(select 1 from auth.users where id=old.user_id) or not exists(select 1 from public.signal_events where id=old.event_id)) then return old; end if;
  raise exception 'event research is append only';
end $$;
create trigger event_research_immutable before insert or update or delete on public.signal_event_research_entries for each row execute function public.preserve_event_research();

create function public.append_signal_event_research(p_user_id uuid,p_event_id uuid,p_kind text,p_subject_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.signal_event_research_entries; parent public.signal_event_research_entries; result public.signal_event_research_entries; ref jsonb; target uuid; allowed_event uuid; proof text; from_id uuid; to_id uuid;
begin
  perform public.signal_event_guard_owner(p_user_id);
  perform 1 from public.signal_events where id=p_event_id and user_id=p_user_id and archived_at is null for update;
  if not found then raise exception 'event owner required' using errcode='42501'; end if;
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65000 then raise exception 'invalid research payload'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where lower(k) ~ 'score|rating|confidence|percentage') then raise exception 'research does not accept scores'; end if;
  if p_kind in ('window_check','dossier','understanding') and coalesce(auth.role(),'')<>'service_role' then raise exception 'server generated research only' using errcode='42501'; end if;
  if p_kind in ('note','unknown_answer','explanation','explanation_evidence','expectation','expectation_resolution','perspective','connection') and nullif(btrim(p_payload->>'text'),'') is null then raise exception 'research text required'; end if;
  if p_kind='unknown' and (nullif(btrim(p_payload->>'question'),'') is null or nullif(btrim(p_payload->>'criterion'),'') is null) then raise exception 'unknown requires question and criterion'; end if;
  if p_kind='unknown_answer' and (p_payload->>'status' is null or p_payload->>'status' not in ('open','answered','closed')) then raise exception 'unknown status required'; end if;
  if p_kind='explanation' and (nullif(btrim(p_payload->>'assumptions'),'') is null or nullif(btrim(p_payload->>'distinguish'),'') is null) then raise exception 'explanation needs assumptions and distinguishing observation'; end if;
  if p_kind='explanation_evidence' and (p_payload->>'direction' is null or p_payload->>'direction' not in ('supports','contradicts','context') or jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0) then raise exception 'explanation needs evidence'; end if;
  if p_kind='expectation' then
    if p_payload->>'dueAt' is null or p_payload->>'dueAt' !~ '^\d{4}-\d{2}-\d{2}$' or nullif(btrim(p_payload->>'criterion'),'') is null then raise exception 'expectation requires date and criterion'; end if;
    perform (p_payload->>'dueAt')::date;
  end if;
  if p_kind='perspective' and (p_payload->>'role' is null or p_payload->>'role' not in ('customer','employee','operator','supplier') or nullif(btrim(p_payload->>'questions'),'') is null or jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0) then raise exception 'perspective requires source evidence and questions'; end if;
  if p_kind='window' and (p_payload->>'url' is null or p_payload->>'url' !~ '^https?://' or p_payload->>'cadence' is null or p_payload->>'cadence' not in ('manual','weekly','monthly') or jsonb_typeof(p_payload->'field') is distinct from 'string') then raise exception 'invalid observation window'; end if;
  if p_kind='window_check' then
    if p_payload->>'status' is null or p_payload->>'status' not in ('success','failed') or p_payload->>'url' is null or p_payload->>'url' !~ '^https?://' or p_payload->>'checkedAt' is null then raise exception 'invalid observation check'; end if;
    perform (p_payload->>'checkedAt')::timestamptz;
    if p_payload->>'status'='failed' and (nullif(btrim(p_payload->>'error'),'') is null or p_payload ?| array['value','excerpt','hash']) then raise exception 'failed check cannot contain success facts'; end if;
    if p_payload->>'status'='success' and (p_payload->>'hash' is null or p_payload->>'hash' !~ '^[a-f0-9]{64}$' or nullif(btrim(p_payload->>'excerpt'),'') is null) then raise exception 'successful check needs captured text'; end if;
  end if;
  if p_kind in ('dossier','understanding') then
    if p_payload->>'inputHash' is null or p_payload->>'inputHash' !~ '^[a-f0-9]{64}$' or p_payload->>'task' is null or jsonb_typeof(p_payload->'sections') is distinct from 'array' or jsonb_array_length(p_payload->'sections') not between 1 and 12 then raise exception 'generated draft requires provenance'; end if;
    for ref in select value from jsonb_array_elements(p_payload->'sections') loop
      if nullif(btrim(ref->>'heading'),'') is null or nullif(btrim(ref->>'text'),'') is null or jsonb_typeof(ref->'refs') is distinct from 'array' then raise exception 'invalid generated section'; end if;
      if jsonb_array_length(ref->'refs')=0 and jsonb_array_length(coalesce(ref->'noteRefs','[]'::jsonb))=0 and concat(ref->>'heading',ref->>'text') !~ '未知|待核实|需要核实|需要问|尚不清楚' then raise exception 'generated claim requires evidence'; end if;
      if exists(select 1 from jsonb_array_elements(ref->'refs') r where not coalesce(p_payload->'refs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'section citation missing from validated refs'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(ref->'noteRefs','[]'::jsonb)) r where not coalesce(p_payload->'noteRefs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'section note citation missing'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(ref->'proposal'->'payload'->'refs','[]'::jsonb)) r where not coalesce(p_payload->'refs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'proposal source citation missing'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(ref->'proposal'->'payload'->'noteRefs','[]'::jsonb)) r where not coalesce(p_payload->'noteRefs','[]'::jsonb) @> jsonb_build_array(r)) then raise exception 'proposal note citation missing'; end if;
    end loop;
    if jsonb_typeof(coalesce(p_payload->'selectedSnapshotIds','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'selectedSnapshotIds','[]'::jsonb))>12 or jsonb_typeof(coalesce(p_payload->'selectedNoteIds','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'selectedNoteIds','[]'::jsonb))>10 then raise exception 'invalid selected input scope'; end if;
    for ref in select value from jsonb_array_elements(coalesce(p_payload->'noteRefs','[]'::jsonb)) loop
      if not coalesce(p_payload->'selectedNoteIds','[]'::jsonb) @> jsonb_build_array(ref->>'recordId') then raise exception 'unselected private note' using errcode='42501'; end if;
    end loop;
    if p_payload->>'targetEventId' is not null then
      allowed_event:=(p_payload->>'targetEventId')::uuid;
      if allowed_event=p_event_id or not exists(select 1 from public.signal_events where id=allowed_event and user_id=p_user_id) then raise exception 'draft target unavailable' using errcode='42501'; end if;
    end if;
  end if;
  if jsonb_typeof(coalesce(p_payload->'noteRefs','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'noteRefs','[]'::jsonb))>24 then raise exception 'invalid private note refs'; end if;
  for ref in select value from jsonb_array_elements(coalesce(p_payload->'noteRefs','[]'::jsonb)) loop
    if nullif(btrim(ref->>'quote'),'') is null or length(ref->>'quote')>1000 or not exists(select 1 from public.signal_event_research_entries r where r.id=(ref->>'recordId')::uuid and r.user_id=p_user_id and r.event_id=p_event_id and r.kind in ('note','explanation') and position(ref->>'quote' in r.payload->>'text')>0) then raise exception 'unavailable private note or quote mismatch' using errcode='42501'; end if;
  end loop;
  select * into previous from public.signal_event_research_entries where user_id=p_user_id and client_request_id=p_request_id;
  if found then
    if previous.event_id is distinct from p_event_id or previous.kind is distinct from p_kind or previous.subject_id is distinct from p_subject_id or previous.payload is distinct from p_payload then raise exception 'request payload conflict' using errcode='23505'; end if;
    return to_jsonb(previous);
  end if;
  if p_subject_id is not null then
    select * into parent from public.signal_event_research_entries where id=p_subject_id and event_id=p_event_id and user_id=p_user_id;
    if not found then raise exception 'research parent unavailable' using errcode='42501'; end if;
    if p_kind in ('note','explanation','source_link') and parent.kind is distinct from p_kind then raise exception 'research revision type mismatch'; end if;
  end if;
  if (p_kind='unknown_answer' and parent.kind is distinct from 'unknown') or (p_kind='explanation_evidence' and parent.kind is distinct from 'explanation') or (p_kind='expectation_resolution' and parent.kind is distinct from 'expectation') or (p_kind='window_check' and parent.kind is distinct from 'window') then raise exception 'research parent type mismatch'; end if;
  if p_kind='expectation_resolution' then
    if p_payload->>'result' is null or p_payload->>'result' not in ('happened','not_happened','unknown') or nullif(btrim(p_payload->>'text'),'') is null then raise exception 'invalid resolution'; end if;
    if p_payload->>'result'='not_happened' and clock_timestamp()<((parent.payload->>'dueAt')||'T23:59:59+09:00')::timestamptz then raise exception 'expectation deadline has not passed'; end if;
    if p_payload->>'result'<>'unknown' and jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0 then raise exception 'resolution needs source evidence'; end if;
  end if;
  if p_kind='unknown_answer' and p_payload->>'status'='answered' and jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))=0 then raise exception 'answer needs source evidence'; end if;
  if p_kind='connection' then
    allowed_event:=(p_payload->>'targetEventId')::uuid;
    if allowed_event=p_event_id or not exists(select 1 from public.signal_events where id=allowed_event and user_id=p_user_id) then raise exception 'connection target unavailable' using errcode='42501'; end if;
    if nullif(btrim(p_payload->>'assumption'),'') is null or nullif(btrim(p_payload->>'counter'),'') is null or nullif(btrim(p_payload->>'alternative'),'') is null then raise exception 'connection requires assumptions and alternatives'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'refs','[]'::jsonb)) r join public.signal_event_memberships m on m.snapshot_id=(r->>'snapshotId')::uuid where m.user_id=p_user_id and m.event_id=p_event_id and m.action='include') or not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'refs','[]'::jsonb)) r join public.signal_event_memberships m on m.snapshot_id=(r->>'snapshotId')::uuid where m.user_id=p_user_id and m.event_id=allowed_event and m.action='include') then raise exception 'connection needs sources from both events'; end if;
  end if;
  if jsonb_typeof(coalesce(p_payload->'refs','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'refs','[]'::jsonb))>24 then raise exception 'invalid source refs'; end if;
  for ref in select value from jsonb_array_elements(coalesce(p_payload->'refs','[]'::jsonb)) loop
    target:=(ref->>'snapshotId')::uuid; proof:=ref->>'quote';
    if p_kind in ('dossier','understanding') and not coalesce(p_payload->'selectedSnapshotIds','[]'::jsonb) @> jsonb_build_array(target::text) then raise exception 'unselected source in generated draft'; end if;
    if nullif(btrim(proof),'') is null or length(proof)>2000 or not exists (
      select 1 from public.signal_source_snapshots s where s.id=target and s.user_id=p_user_id and position(proof in s.captured_text)>0
      and exists(select 1 from public.signal_event_memberships m where m.user_id=p_user_id and m.snapshot_id=s.id and m.action='include' and (m.event_id=p_event_id or m.event_id=allowed_event))
    ) then raise exception 'source quote unavailable' using errcode='42501'; end if;
  end loop;
  if p_kind='source_link' then
    from_id:=(p_payload->>'fromSnapshotId')::uuid; to_id:=(p_payload->>'toSnapshotId')::uuid;
    if from_id is null or to_id is null or from_id=to_id or p_payload->>'relation' is null or p_payload->>'relation' not in ('cites','reprints') or not exists(select 1 from jsonb_array_elements(p_payload->'refs') r where r->>'snapshotId'=from_id::text) then raise exception 'source relation needs explicit proof'; end if;
    if exists(select 1 from unnest(array[from_id,to_id]) s(id) where not exists(select 1 from public.signal_event_memberships m where m.user_id=p_user_id and m.event_id=p_event_id and m.snapshot_id=s.id and m.action='include')) then raise exception 'source relation owner mismatch'; end if;
    if coalesce((p_payload->>'active')::boolean,true) and exists(
      with recursive latest as (
        select distinct on(payload->>'fromSnapshotId',payload->>'toSnapshotId') payload,created_at,id from public.signal_event_research_entries
        where user_id=p_user_id and event_id=p_event_id and kind='source_link' order by payload->>'fromSnapshotId',payload->>'toSnapshotId',created_at desc,id desc
      ), edges as (select payload->>'fromSnapshotId' as a,payload->>'toSnapshotId' as b from latest where coalesce((payload->>'active')::boolean,true)),
      reach(id) as (select to_id::text union select edges.b from edges join reach on edges.a=reach.id)
      select 1 from reach where id=from_id::text
    ) then raise exception 'source lineage cycle'; end if;
  end if;
  insert into public.signal_event_research_entries(user_id,event_id,kind,subject_id,payload,client_request_id) values(p_user_id,p_event_id,p_kind,p_subject_id,p_payload,p_request_id) returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid),public.preserve_event_research() from public,anon;
grant execute on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) to authenticated,service_role;

-- Short leases prevent duplicate paid generations for the same explicit input.
create table public.signal_event_ai_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  status text not null check(status in ('running','done','failed')),
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,event_id,input_hash),
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade
);
alter table public.signal_event_ai_jobs enable row level security;
revoke all on public.signal_event_ai_jobs from public,anon,authenticated;
grant select,insert,update on public.signal_event_ai_jobs to service_role;
create function public.claim_signal_event_ai_job(p_user_id uuid,p_event_id uuid,p_input_hash text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed boolean;
begin
  perform public.signal_event_guard_owner(p_user_id);
  if coalesce(auth.role(),'')<>'service_role' or not exists(select 1 from public.signal_events where id=p_event_id and user_id=p_user_id) then raise exception 'server owned generation required' using errcode='42501'; end if;
  if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid input hash'; end if;
  insert into public.signal_event_ai_jobs(user_id,event_id,input_hash,status,lease_until) values(p_user_id,p_event_id,p_input_hash,'running',clock_timestamp()+interval '180 seconds')
  on conflict(user_id,event_id,input_hash) do update set status='running',lease_until=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp()
  where signal_event_ai_jobs.status<>'running' or signal_event_ai_jobs.lease_until<=clock_timestamp() returning true into claimed;
  if coalesce(claimed,false)=false then raise exception 'same event analysis is already running'; end if;
  return true;
end $$;
revoke all on function public.claim_signal_event_ai_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_signal_event_ai_job(uuid,uuid,text) to service_role;
