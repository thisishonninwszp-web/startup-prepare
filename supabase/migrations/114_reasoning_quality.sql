begin;
-- Manual reasoning journal and immutable source-correction notices. No AI or idea writes.
create table public.event_reasoning_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null, revision bigint not null check(revision between 1 and 9007199254740991),
  kind text not null check(kind in ('claim','increment','denominator','comparability','disagreement','mechanism','applicability','review','correction','ack')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=65000),
  created_at timestamptz not null default clock_timestamp(),
  unique(id,user_id,event_id),unique(event_id,revision),
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade
);
create table public.event_reasoning_impacts (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,event_id uuid not null,
  revision bigint generated always as identity check(revision<=9007199254740991),correction_id uuid not null,
  subject_kind text not null check(subject_kind in ('reasoning','research')),subject_id uuid not null,
  old_conclusion jsonb not null,created_at timestamptz not null default clock_timestamp(),
  foreign key(correction_id,user_id,event_id) references public.event_reasoning_entries(id,user_id,event_id) on delete cascade,
  foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
  unique(correction_id,subject_kind,subject_id),unique(id,user_id,event_id)
);
create table public.event_reasoning_requests (
  user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,event_id uuid not null,
  kind text not null,payload jsonb not null,expected_revision bigint not null,entry_id uuid not null,
  primary key(user_id,request_id),foreign key(entry_id,user_id,event_id) references public.event_reasoning_entries(id,user_id,event_id) on delete cascade
);
create index event_reasoning_history on public.event_reasoning_entries(user_id,event_id,revision);
create index event_reasoning_impact_history on public.event_reasoning_impacts(user_id,event_id,revision);
create function public.preserve_event_reasoning() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' and (not exists(select 1 from auth.users where id=old.user_id) or not exists(select 1 from public.signal_events where id=old.event_id and user_id=old.user_id)) then return old;end if;
  raise exception 'reasoning history is immutable';
end $$;
create trigger reasoning_entries_immutable before update or delete on public.event_reasoning_entries for each row execute function public.preserve_event_reasoning();
create trigger reasoning_impacts_immutable before update or delete on public.event_reasoning_impacts for each row execute function public.preserve_event_reasoning();
create trigger reasoning_requests_immutable before update or delete on public.event_reasoning_requests for each row execute function public.preserve_event_reasoning();
alter table public.event_reasoning_entries enable row level security;
alter table public.event_reasoning_impacts enable row level security;
alter table public.event_reasoning_requests enable row level security;
create policy reasoning_entry_owner on public.event_reasoning_entries for select to authenticated using(auth.uid()=user_id);
create policy reasoning_impact_owner on public.event_reasoning_impacts for select to authenticated using(auth.uid()=user_id);
revoke all on public.event_reasoning_entries,public.event_reasoning_impacts,public.event_reasoning_requests from public,anon,authenticated,service_role;
grant select on public.event_reasoning_entries,public.event_reasoning_impacts to authenticated,service_role;

create function public.guard_event_reasoning(p_user_id uuid,p_event_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'reasoning service owner required' using errcode='42501';end if;
  if not exists(select 1 from public.signal_events where id=p_event_id and user_id=p_user_id) then raise exception 'event owner required' using errcode='42501';end if;
end $$;
create function public.validate_event_reasoning_ref(p_user_id uuid,p_event_id uuid,p_ref jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if jsonb_typeof(p_ref) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_ref) k where k not in ('snapshotId','quote')) or jsonb_typeof(p_ref->'quote') is distinct from 'string' or length(btrim(p_ref->>'quote')) not between 1 and 2000 then raise exception 'invalid source ref';end if;
  if not exists(select 1 from public.signal_source_snapshots s join public.signal_event_memberships m on m.snapshot_id=s.id and m.user_id=s.user_id where s.id=(p_ref->>'snapshotId')::uuid and s.user_id=p_user_id and m.event_id=p_event_id and m.action='include' and position(p_ref->>'quote' in s.captured_text)>0) then raise exception 'source membership or exact quote unavailable' using errcode='42501';end if;
end $$;
create function public.validate_event_reasoning_payload(p_user_id uuid,p_event_id uuid,p_kind text,p jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed text[];required text[];k text;r jsonb;link jsonb;pair jsonb;sid uuid;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>65000 then raise exception 'invalid reasoning payload';end if;
  case p_kind
    when 'claim' then allowed:=array[]::text[];required:=array[]::text[];
    when 'increment' then allowed:=array['baseline','addition','increment','independence','independenceBasis'];required:=array['increment','independenceBasis'];
    when 'denominator' then allowed:=array['sample','population','denominator','omittedGroups'];required:=allowed;
    when 'comparability' then allowed:=array['dimensions','verdict','reason'];required:=array['reason'];
    when 'disagreement' then allowed:=array['left','right','cause','checkQuestion'];required:=array['checkQuestion'];
    when 'mechanism' then allowed:=array['links'];required:=array[]::text[];
    when 'applicability' then allowed:=array['conditions','invalidators','followUp'];required:=allowed;
    when 'review' then allowed:=array[]::text[];required:=array[]::text[];
    when 'correction' then allowed:=array['oldSnapshotId','newSnapshotId'];required:=array[]::text[];
    when 'ack' then allowed:=array['impactId'];required:=array[]::text[];
    else raise exception 'invalid reasoning kind';
  end case;
  if exists(select 1 from jsonb_object_keys(p) key where not key=any(allowed||array['text','refs','claimIds'])) then raise exception 'unsupported reasoning field';end if;
  foreach k in array required||array['text'] loop
    if jsonb_typeof(p->k) is distinct from 'string' or length(btrim(p->>k)) not between 1 and 4000 then raise exception 'required reasoning text: %',k;end if;
  end loop;
  if jsonb_typeof(p->'refs') is distinct from 'array' or jsonb_array_length(p->'refs')>24 or jsonb_typeof(p->'claimIds') is distinct from 'array' or jsonb_array_length(p->'claimIds')>24 then raise exception 'invalid reasoning refs or dependencies';end if;
  for r in select value from jsonb_array_elements(p->'refs') loop perform public.validate_event_reasoning_ref(p_user_id,p_event_id,r);end loop;
  for r in select value from jsonb_array_elements(p->'claimIds') loop
    if jsonb_typeof(r)<>'string' or not exists(select 1 from public.event_reasoning_entries e where e.id=(r#>>'{}')::uuid and e.user_id=p_user_id and e.kind not in ('correction','ack')) then raise exception 'reasoning dependency unavailable' using errcode='42501';end if;
  end loop;
  if p_kind in ('claim','increment','denominator','comparability','disagreement','applicability') and jsonb_array_length(p->'refs')+jsonb_array_length(p->'claimIds')=0 then raise exception 'source or dependency required';end if;
  if p_kind='increment' then
    if p->>'independence' is null or p->>'independence' not in ('independent','shared','unknown') then raise exception 'source independence basis required';end if;
    foreach k in array array['baseline','addition'] loop
      perform public.validate_event_reasoning_ref(p_user_id,p_event_id,p->k);
      if not (p->'refs') @> jsonb_build_array(p->k) then raise exception 'increment citation missing from refs';end if;
    end loop;
    if p->'baseline'->>'snapshotId'=p->'addition'->>'snapshotId' then raise exception 'distinct baseline and new snapshot required';end if;
  end if;
  if p_kind='comparability' then
    if jsonb_typeof(p->'dimensions') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p->'dimensions') key where key not in ('definition','unit','period','geography','priceBasis','quantityBasis')) then raise exception 'invalid dimensions';end if;
    if p->>'verdict' is null or p->>'verdict' not in ('comparable','not_comparable') then raise exception 'comparability verdict required';end if;
    foreach k in array array['definition','unit','period','geography','priceBasis','quantityBasis'] loop
      pair:=p->'dimensions'->k;
      if jsonb_typeof(pair) is distinct from 'object' or exists(select 1 from jsonb_object_keys(pair) key where key not in ('left','right')) or jsonb_typeof(pair->'left') is distinct from 'string' or jsonb_typeof(pair->'right') is distinct from 'string' or length(btrim(pair->>'left')) not between 1 and 4000 or length(btrim(pair->>'right')) not between 1 and 4000 then raise exception 'dimension missing; explicitly retain unknown';end if;
      if p->>'verdict'='comparable' and (btrim(pair->>'left')<>btrim(pair->>'right') or (pair->>'left')~*'未知|不明|unknown|unsure' or (pair->>'right')~*'未知|不明|unknown|unsure') then raise exception 'unknown or different dimension is not comparable';end if;
    end loop;
  end if;
  if p_kind='disagreement' then
    if p->>'cause' is null or p->>'cause' not in ('fact','definition','time','mechanism','value') then raise exception 'disagreement cause required';end if;
    foreach k in array array['left','right'] loop perform public.validate_event_reasoning_ref(p_user_id,p_event_id,p->k);if not (p->'refs')@>jsonb_build_array(p->k) then raise exception 'disagreement citation missing';end if;end loop;
  end if;
  if p_kind='mechanism' then
    if jsonb_typeof(p->'links') is distinct from 'array' or jsonb_array_length(p->'links') not between 1 and 12 then raise exception 'mechanism links required';end if;
    for link in select value from jsonb_array_elements(p->'links') loop
      if jsonb_typeof(link) is distinct from 'object' or exists(select 1 from jsonb_object_keys(link) key where key not in ('text','refs','counterexample','unknown')) or jsonb_typeof(link->'text') is distinct from 'string' or length(btrim(link->>'text')) not between 1 and 4000 or jsonb_typeof(link->'refs') is distinct from 'array' or jsonb_array_length(link->'refs')>24 or jsonb_typeof(link->'counterexample') is distinct from 'string' or jsonb_typeof(link->'unknown') is distinct from 'string' or length(link->>'counterexample')>4000 or length(link->>'unknown')>4000 then raise exception 'invalid mechanism link';end if;
      if jsonb_array_length(link->'refs')=0 and btrim(link->>'counterexample')='' and btrim(link->>'unknown')='' then raise exception 'each link needs evidence counterexample or unknown';end if;
      for r in select value from jsonb_array_elements(link->'refs') loop if not (p->'refs')@>jsonb_build_array(r) then raise exception 'mechanism citation missing';end if;end loop;
    end loop;
  end if;
  if p_kind='review' and jsonb_array_length(p->'claimIds')=0 then raise exception 'review requires original claim';end if;
  if p_kind='correction' then
    if p->>'oldSnapshotId' is null or p->>'newSnapshotId' is null or p->>'oldSnapshotId'=p->>'newSnapshotId' or jsonb_array_length(p->'claimIds')<>0 then raise exception 'correction requires distinct old and new sources';end if;
    foreach k in array array['oldSnapshotId','newSnapshotId'] loop sid:=(p->>k)::uuid;if not exists(select 1 from jsonb_array_elements(p->'refs') v where (v->>'snapshotId')::uuid=sid) then raise exception 'correction needs exact old and new quotes';end if;end loop;
  end if;
  if p_kind='ack' then
    if jsonb_array_length(p->'refs')<>0 or jsonb_array_length(p->'claimIds')<>0 or not exists(select 1 from public.event_reasoning_impacts i where i.id=(p->>'impactId')::uuid and i.user_id=p_user_id and (i.event_id=p_event_id or i.old_conclusion->>'event_id'=p_event_id::text)) then raise exception 'correction impact unavailable' using errcode='42501';end if;
  end if;
end $$;

-- Only typed provenance fields participate. Text containing JSON/UUIDs never creates a dependency.
create function public.refresh_event_reasoning_impacts(p_user_id uuid,p_event_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.event_reasoning_entries;old_id text;
begin
  for c in select * from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and kind='correction' order by revision loop
    old_id:=c.payload->>'oldSnapshotId';
    with recursive affected as (
      select e.id from public.event_reasoning_entries e where e.user_id=p_user_id and e.kind not in ('correction','ack') and exists(select 1 from jsonb_array_elements(e.payload->'refs') r where r->>'snapshotId'=old_id)
      union
      select e.id from public.event_reasoning_entries e join affected a on (e.payload->'claimIds')@>jsonb_build_array(a.id::text) where e.user_id=p_user_id and e.kind not in ('correction','ack')
    ) insert into public.event_reasoning_impacts(user_id,event_id,correction_id,subject_kind,subject_id,old_conclusion)
      select p_user_id,p_event_id,c.id,'reasoning',e.id,to_jsonb(e) from affected a join public.event_reasoning_entries e on e.id=a.id on conflict(correction_id,subject_kind,subject_id) do nothing;
    with recursive affected as (
      select r.id from public.signal_event_research_entries r where r.user_id=p_user_id and (
        exists(select 1 from jsonb_array_elements(coalesce(r.payload->'refs','[]')) ref where ref->>'snapshotId'=old_id)
        or coalesce(r.payload->'selectedSnapshotIds','[]')@>jsonb_build_array(old_id)
        or (r.kind='source_link' and old_id in (r.payload->>'fromSnapshotId',r.payload->>'toSnapshotId'))
      )
      union
      select r.id from public.signal_event_research_entries r join affected a on r.subject_id=a.id or coalesce(r.payload->'selectedNoteIds','[]')@>jsonb_build_array(a.id::text) or exists(select 1 from jsonb_array_elements(coalesce(r.payload->'noteRefs','[]')) n where n->>'recordId'=a.id::text) where r.user_id=p_user_id
    ) insert into public.event_reasoning_impacts(user_id,event_id,correction_id,subject_kind,subject_id,old_conclusion)
      select p_user_id,p_event_id,c.id,'research',r.id,to_jsonb(r) from affected a join public.signal_event_research_entries r on r.id=a.id on conflict(correction_id,subject_kind,subject_id) do nothing;
  end loop;
end $$;
create function public.research_reasoning_correction_notice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.signal_events where id=new.event_id and user_id=new.user_id for update;
  perform public.refresh_event_reasoning_impacts(new.user_id,e.event_id) from (select distinct event_id from public.event_reasoning_entries where user_id=new.user_id and kind='correction') e;return new;
end $$;
create trigger research_correction_notice after insert on public.signal_event_research_entries for each row execute function public.research_reasoning_correction_notice();

-- Serialize old research RPCs before their existing event lock, keeping all 106 validation intact.
alter function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) rename to append_signal_event_research_before_reasoning;
revoke all on function public.append_signal_event_research_before_reasoning(uuid,uuid,text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.append_signal_event_research(p_user_id uuid,p_event_id uuid,p_kind text,p_subject_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.signal_event_guard_owner(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,114));
  return public.append_signal_event_research_before_reasoning(p_user_id,p_event_id,p_kind,p_subject_id,p_payload,p_request_id);
end $$;
revoke all on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.append_signal_event_research(uuid,uuid,text,uuid,jsonb,uuid) to service_role;
create function public.lock_research_reasoning_owner() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,114));return new;end $$;
create trigger research_reasoning_owner_lock before insert on public.signal_event_research_entries for each row execute function public.lock_research_reasoning_owner();

create function public.append_event_reasoning(p_user_id uuid,p_event_id uuid,p_kind text,p_payload jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.event_reasoning_requests;result public.event_reasoning_entries;current_revision bigint;
begin
  perform public.guard_event_reasoning(p_user_id,p_event_id);
  if p_request_id is null or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991 then raise exception 'invalid request or revision';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,114));
  perform 1 from public.signal_events where user_id=p_user_id and id=p_event_id and archived_at is null for update;
  if not found then raise exception 'event owner required' using errcode='42501';end if;
  select * into prior from public.event_reasoning_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.event_id is distinct from p_event_id or prior.kind is distinct from p_kind or prior.payload is distinct from p_payload or prior.expected_revision is distinct from p_expected_revision then raise exception 'reasoning request conflict' using errcode='23505';end if;
    select * into result from public.event_reasoning_entries where id=prior.entry_id;return to_jsonb(result);
  end if;
  perform public.validate_event_reasoning_payload(p_user_id,p_event_id,p_kind,p_payload);
  if p_kind='ack' then
    select * into result from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and kind='ack' and payload->>'impactId'=p_payload->>'impactId' order by revision limit 1;
    if found then
      insert into public.event_reasoning_requests values(p_user_id,p_request_id,p_event_id,p_kind,p_payload,p_expected_revision,result.id);return to_jsonb(result);
    end if;
  end if;
  select coalesce(max(revision),0) into current_revision from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id;
  if current_revision<>p_expected_revision then raise exception 'stale reasoning revision; reload history';end if;
  insert into public.event_reasoning_entries(user_id,event_id,revision,kind,payload) values(p_user_id,p_event_id,current_revision+1,p_kind,p_payload) returning * into result;
  insert into public.event_reasoning_requests values(p_user_id,p_request_id,p_event_id,p_kind,p_payload,p_expected_revision,result.id);
  if p_kind<>'ack' then perform public.refresh_event_reasoning_impacts(p_user_id,e.event_id) from (select distinct event_id from public.event_reasoning_entries where user_id=p_user_id and kind='correction') e;end if;
  return to_jsonb(result);
end $$;
create function public.list_event_reasoning(p_user_id uuid,p_event_id uuid,p_after_revision bigint default 0,p_after_impact_revision bigint default 0,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entries jsonb;impacts jsonb;next_revision bigint;next_impact bigint;current_revision bigint;
begin
  perform public.guard_event_reasoning(p_user_id,p_event_id);
  perform pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,114));
  if p_after_revision is null or p_after_impact_revision is null or p_after_revision not between 0 and 9007199254740991 or p_after_impact_revision not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid reasoning cursor or page size';end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by revision),'[]'),max(revision) into entries,next_revision from (select * from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and revision>p_after_revision order by revision limit p_limit) e;
  if not exists(select 1 from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id and revision>next_revision) then next_revision:=null;end if;
  select coalesce(max(revision),0) into current_revision from public.event_reasoning_entries where user_id=p_user_id and event_id=p_event_id;
  select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('correction',(select to_jsonb(c) from public.event_reasoning_entries c where c.id=i.correction_id and c.user_id=p_user_id),'acknowledged',exists(select 1 from public.event_reasoning_entries a where a.user_id=p_user_id and a.kind='ack' and a.payload->>'impactId'=i.id::text)) order by revision),'[]'),max(revision) into impacts,next_impact from (select * from public.event_reasoning_impacts where user_id=p_user_id and (event_id=p_event_id or old_conclusion->>'event_id'=p_event_id::text) and revision>p_after_impact_revision order by revision limit p_limit) i;
  if not exists(select 1 from public.event_reasoning_impacts where user_id=p_user_id and (event_id=p_event_id or old_conclusion->>'event_id'=p_event_id::text) and revision>next_impact) then next_impact:=null;end if;
  return jsonb_build_object('available',true,'entries',entries,'currentRevision',current_revision,'nextRevision',next_revision,'impacts',impacts,'nextImpactRevision',next_impact);
end $$;
revoke all on function public.guard_event_reasoning(uuid,uuid),public.validate_event_reasoning_ref(uuid,uuid,jsonb),public.validate_event_reasoning_payload(uuid,uuid,text,jsonb),public.refresh_event_reasoning_impacts(uuid,uuid),public.research_reasoning_correction_notice(),public.lock_research_reasoning_owner(),public.preserve_event_reasoning() from public,anon,authenticated,service_role;
revoke all on function public.append_event_reasoning(uuid,uuid,text,jsonb,uuid,bigint),public.list_event_reasoning(uuid,uuid,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.append_event_reasoning(uuid,uuid,text,jsonb,uuid,bigint),public.list_event_reasoning(uuid,uuid,bigint,bigint,integer) to service_role;

commit;


