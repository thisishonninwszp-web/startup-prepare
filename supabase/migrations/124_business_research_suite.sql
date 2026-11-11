begin;

create table public.business_research_records (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('failure','comparison','tension','apprenticeship')), title text not null,
 case_ids jsonb not null, experience_ids jsonb not null, payload jsonb, revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), erased_at timestamptz,
 unique(user_id,id)
);
create index business_research_order on public.business_research_records(user_id,created_at desc,id desc);
create table public.business_research_refs (
 user_id uuid not null, record_id uuid not null, source_key text not null, source_kind text not null check(source_kind in ('snapshot','material','job')),
 source_id uuid not null, quote_start integer not null check(quote_start>0), quote_length integer not null check(quote_length between 4 and 1600),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'), public_confirmed boolean not null check(public_confirmed),
 primary key(record_id,source_key), foreign key(user_id,record_id) references public.business_research_records(user_id,id) on delete cascade
);
create index business_research_source on public.business_research_refs(source_kind,source_id,user_id);
create table public.business_research_receipts (
 user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'), result jsonb not null, primary key(user_id,request_id)
);

create function public.business_research_keys(p jsonb,required text[],optional text[] default '{}') returns void
language plpgsql immutable set search_path=public,pg_temp as $$begin
 if p is null or jsonb_typeof(p)<>'object' or not(p ?& required) or exists(select 1 from jsonb_object_keys(p) k where not(k=any(required||optional))) then raise exception 'invalid research payload fields';end if;
end$$;
create function public.business_research_text(p jsonb,k text,allow_empty boolean default false) returns text
language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>3000 or (not allow_empty and length(btrim(p->>k))=0) then raise exception 'invalid research text: %',k;end if;return p->>k;
end$$;
create function public.business_research_uuid(p jsonb) returns uuid
language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or (p#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid research uuid';end if;return (p#>>'{}')::uuid;
end$$;

-- This private resolver never reads input_text, personal profiles, or private feedback.
create function public.business_research_source(p_user uuid,p_kind text,p_id uuid,p_cases jsonb,p_lock boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare v jsonb;begin
 if p_kind='snapshot' then
  if p_lock then perform 1 from business_material_snapshots where user_id=p_user and id=p_id for share;end if;
  select jsonb_build_object('text',s.captured_text,'url',s.source_url,'date',coalesce(s.published_at,s.captured_at)) into v
  from business_material_snapshots s where s.user_id=p_user and s.id=p_id and s.erased_at is null and length(btrim(s.captured_text))>0
  and exists(select 1 from business_case_members m where m.user_id=p_user and m.snapshot_id=s.id and m.case_id in (select value::uuid from jsonb_array_elements_text(p_cases)));
 elsif p_kind='material' then
  if p_lock then perform 1 from reality_materials where user_id=p_user and id=p_id for share;end if;
  select jsonb_build_object('text',sanitized_text,'url',source_url,'date',created_at) into v from reality_materials
  where user_id=p_user and id=p_id and status<>'deleted' and length(btrim(sanitized_text))>0;
 elsif p_kind='job' then
  if p_lock then perform 1 from job_postings where user_id=p_user and id=p_id for share;end if;
  select jsonb_build_object('text',body,'url',url,'date',created_at) into v from job_postings where user_id=p_user and id=p_id and length(btrim(body))>0;
 end if;
 return v;
end$$;

create function public.business_research_payload(p_kind text,p jsonb,p_sources jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$declare k text;d jsonb;v_keys text[];j jsonb;l jsonb;r jsonb;begin
 if p_kind='failure' then
  perform business_research_keys(p,array['event','when','scope','disclosureKey','confirmedDisclosure','whatChanged','alternative','condition','checkNext']);
  foreach k in array array['event','scope','disclosureKey','whatChanged','alternative','condition','checkNext'] loop perform business_research_text(p,k);end loop;
  perform business_research_text(p,'when',true);
  if p->>'event' not in ('exit','shrink','stop') or p->>'scope' not in ('company','store','product') or p->'confirmedDisclosure' is distinct from 'true'::jsonb then raise exception 'invalid failure disclosure';end if;
  if not exists(select 1 from jsonb_array_elements(p_sources) s where s->>'key'=p->>'disclosureKey' and s->>'kind' in ('snapshot','material')) then raise exception 'failure disclosure source unavailable';end if;
 elsif p_kind='comparison' then
  perform business_research_keys(p,array['dimensions','hypothesis','counterexample','checkNext']);
  foreach k in array array['hypothesis','counterexample','checkNext'] loop perform business_research_text(p,k);end loop;
  if jsonb_typeof(p->'dimensions') is distinct from 'array' or jsonb_array_length(p->'dimensions')<>6 then raise exception 'invalid comparison dimensions';end if;
  v_keys:='{}';
  for d in select value from jsonb_array_elements(p->'dimensions') loop
   perform business_research_keys(d,array['key','left','right','leftSourceKey','rightSourceKey']);
   foreach k in array array['key','left','right'] loop perform business_research_text(d,k);end loop;
   if d->>'key' not in ('buyer','user','payer','trigger','delivery','alternative') or d->>'key'=any(v_keys) then raise exception 'invalid comparison dimension key';end if;v_keys:=array_append(v_keys,d->>'key');
   foreach k in array array['leftSourceKey','rightSourceKey'] loop
    if d->k<>'null'::jsonb and (jsonb_typeof(d->k)<>'string' or not exists(select 1 from jsonb_array_elements(p_sources) s where s->>'key'=d->>k)) then raise exception 'comparison source unavailable';end if;
   end loop;
  end loop;
 elsif p_kind='tension' then
  perform business_research_keys(p,array['task','leftNeed','rightNeed','leftSourceKey','rightSourceKey','tradeoff','alternative','checkNext']);
  foreach k in array array['task','leftNeed','rightNeed','leftSourceKey','rightSourceKey','tradeoff','alternative','checkNext'] loop perform business_research_text(p,k);end loop;
  select s into l from jsonb_array_elements(p_sources) s where s->>'key'=p->>'leftSourceKey' and s->>'kind' in ('snapshot','material');
  select s into r from jsonb_array_elements(p_sources) s where s->>'key'=p->>'rightSourceKey' and s->>'kind' in ('snapshot','material');
  if l is null or r is null or (l->>'kind'=r->>'kind' and (l->>'id')::uuid=(r->>'id')::uuid and l->>'quote'=r->>'quote') then raise exception 'distinct tension source quotes required';end if;
 elsif p_kind='apprenticeship' then
  perform business_research_keys(p,array['mechanism','timeBudget','cashBudget','constraintsConfirmed','gap','practice','checkNext','jobLink']);
  foreach k in array array['mechanism','timeBudget','cashBudget','gap','practice','checkNext'] loop perform business_research_text(p,k);end loop;
  if p->'constraintsConfirmed' is distinct from 'true'::jsonb then raise exception 'confirmed apprenticeship constraints required';end if;
  j:=p->'jobLink';
  if j<>'null'::jsonb then
   perform business_research_keys(j,array['jobId','sourceKey','rationale','employerQuestion']);perform business_research_uuid(j->'jobId');
   foreach k in array array['sourceKey','rationale','employerQuestion'] loop perform business_research_text(j,k);end loop;
   if not exists(select 1 from jsonb_array_elements(p_sources) s where s->>'key'=j->>'sourceKey' and s->>'kind'='job' and (s->>'id')::uuid=(j->>'jobId')::uuid) then raise exception 'apprenticeship job source unavailable';end if;
  end if;
 else raise exception 'invalid research kind';end if;
end$$;

create function public.business_research_dto(p public.business_research_records) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare refs jsonb:='[]';r business_research_refs;v jsonb;bad boolean:=false;experience_bad boolean;source_bad boolean;begin
 for r in select * from business_research_refs where user_id=p.user_id and record_id=p.id order by source_key loop
  v:=business_research_source(p.user_id,r.source_kind,r.source_id,p.case_ids);
  source_bad:=v is null or encode(sha256(convert_to(v->>'text','UTF8')),'hex') is distinct from r.content_hash;
  bad:=bad or source_bad;
  refs:=refs||jsonb_build_array(jsonb_build_object('key',r.source_key,'kind',r.source_kind,'id',r.source_id,'quote',case when source_bad then '' else substring(v->>'text' from r.quote_start for r.quote_length) end,'publicConfirmed',r.public_confirmed,'url',v->'url','date',v->'date','invalidated',source_bad));
 end loop;
 select exists(select 1 from jsonb_array_elements_text(p.experience_ids) e where not exists(select 1 from career_entries c where c.user_id=p.user_id and c.id=e::uuid and c.confirmed_at is not null)) into experience_bad;
 bad:=bad or experience_bad or p.erased_at is not null;
 return jsonb_build_object('id',p.id,'kind',p.kind,'title',case when bad then '' else p.title end,'caseIds',p.case_ids,'experienceIds',p.experience_ids,'payload',case when bad then null else p.payload end,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'erasedAt',p.erased_at,'invalidated',bad,'experienceInvalidated',experience_bad,'sources',refs);
end$$;

create function public.business_research_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_research_records;receipt business_research_receipts;v_id uuid;v_request uuid;v_hash text;v_result jsonb;v_kind text;v_revision integer;
 s jsonb;v jsonb;e jsonb;v_uuid uuid;v_keys text[]:='{}';v_items jsonb:='[]';v_count integer:=0;v_cursor business_research_records;v_refs jsonb:='[]';
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>250000 then raise exception 'invalid research input';end if;
 if p_operation='get' then
  perform business_research_keys(p_input,array['id']);v_id:=business_research_uuid(p_input->'id');select * into r from business_research_records where user_id=p_user_id and id=v_id;
  if not found then return null;end if;return business_research_dto(r);
 elsif p_operation='list' then
  perform business_research_keys(p_input,'{}',array['kind','before']);
  if p_input ? 'kind' and (jsonb_typeof(p_input->'kind')<>'string' or p_input->>'kind' not in ('failure','comparison','tension','apprenticeship')) then raise exception 'invalid research kind';end if;
  if p_input ? 'before' then v_id:=business_research_uuid(p_input->'before');select * into v_cursor from business_research_records where user_id=p_user_id and id=v_id;if not found then raise exception 'research cursor unavailable';end if;end if;
  for r in select * from business_research_records where user_id=p_user_id and (not(p_input ? 'kind') or kind=p_input->>'kind') and (v_id is null or (created_at,id)<(v_cursor.created_at,v_cursor.id)) order by created_at desc,id desc limit 31 loop
   v_count:=v_count+1;if v_count<=30 then v_items:=v_items||jsonb_build_array(business_research_dto(r));end if;
  end loop;
  return jsonb_build_object('available',true,'items',v_items,'nextCursor',case when v_count>30 then v_items->-1->>'id' else null end);
 elsif p_operation is null or p_operation not in ('save','erase') then raise exception 'invalid research operation';end if;
 if p_operation='save' then perform business_research_keys(p_input,array['kind','title','caseIds','experienceIds','sources','payload','expectedRevision','requestId'],array['id']);
 else perform business_research_keys(p_input,array['id','requestId']);end if;
 v_request:=business_research_uuid(p_input->'requestId');
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');
 -- Requests serialize independently of source erasure; receipts contain no copied input.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||v_request::text,724));
 select * into receipt from business_research_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'research request conflict';end if;return receipt.result;end if;
 if p_input ? 'id' then v_id:=business_research_uuid(p_input->'id');end if;
 if p_operation='save' then
  v_kind:=business_research_text(p_input,'kind');perform business_research_text(p_input,'title');
  if v_kind not in ('failure','comparison','tension','apprenticeship') then raise exception 'invalid research kind';end if;
  if jsonb_typeof(p_input->'expectedRevision') is distinct from 'number' or p_input->>'expectedRevision' !~ '^[0-9]{1,9}$' then raise exception 'invalid research revision';end if;v_revision:=(p_input->>'expectedRevision')::integer;
  if jsonb_typeof(p_input->'caseIds') is distinct from 'array' or jsonb_array_length(p_input->'caseIds') not between 1 and 2 or (v_kind='comparison' and jsonb_array_length(p_input->'caseIds')<>2) then raise exception 'invalid research cases';end if;
  if (select count(distinct business_research_uuid(value)) from jsonb_array_elements(p_input->'caseIds'))<>jsonb_array_length(p_input->'caseIds') then raise exception 'invalid duplicate research cases';end if;
  for e in select value from jsonb_array_elements(p_input->'caseIds') loop v_uuid:=business_research_uuid(e);perform 1 from business_daily_cases where user_id=p_user_id and id=v_uuid for share;if not found then raise exception 'research case owner unavailable' using errcode='42501';end if;end loop;
  if jsonb_typeof(p_input->'experienceIds') is distinct from 'array' or jsonb_array_length(p_input->'experienceIds')>20 or (v_kind<>'apprenticeship' and jsonb_array_length(p_input->'experienceIds')<>0) then raise exception 'invalid research experiences';end if;
  if (select count(distinct business_research_uuid(value)) from jsonb_array_elements(p_input->'experienceIds'))<>jsonb_array_length(p_input->'experienceIds') then raise exception 'invalid duplicate research experiences';end if;
  for e in select value from jsonb_array_elements(p_input->'experienceIds') order by value loop
   v_uuid:=business_research_uuid(e);perform 1 from career_entries where user_id=p_user_id and id=v_uuid and confirmed_at is not null for share;if not found then raise exception 'confirmed research experience unavailable' using errcode='42501';end if;
  end loop;
  if jsonb_typeof(p_input->'sources') is distinct from 'array' or jsonb_array_length(p_input->'sources')>12 then raise exception 'invalid research sources';end if;
  -- Sort shared source locks before acquiring the research row lock. Source erasure
  -- already owns the source row before its AFTER trigger reaches these records.
  for s in select value from jsonb_array_elements(p_input->'sources') order by value->>'kind',value->>'id',value->>'key' loop
   perform business_research_keys(s,array['key','kind','id','quote','publicConfirmed']);
   if jsonb_typeof(s->'key') is distinct from 'string' or s->>'key' !~ '^[A-Za-z][A-Za-z0-9_-]{0,31}$' or s->>'key'=any(v_keys) then raise exception 'invalid duplicate research source key';end if;v_keys:=array_append(v_keys,s->>'key');
   if jsonb_typeof(s->'kind') is distinct from 'string' or s->>'kind' not in ('snapshot','material','job') or (v_kind in ('failure','tension') and s->>'kind'='job') then raise exception 'invalid research source kind';end if;
   v_uuid:=business_research_uuid(s->'id');
   if jsonb_typeof(s->'quote') is distinct from 'string' or length(s->>'quote') not between 4 and 1600 or length(btrim(s->>'quote'))<4 or s->'publicConfirmed' is distinct from 'true'::jsonb then raise exception 'invalid confirmed research quote';end if;
   v:=business_research_source(p_user_id,s->>'kind',v_uuid,p_input->'caseIds',true);
   if v is null or position(s->>'quote' in v->>'text')=0 then raise exception 'research source owner or exact quote unavailable' using errcode='42501';end if;
   v_refs:=v_refs||jsonb_build_array(jsonb_build_object('key',s->>'key','kind',s->>'kind','id',v_uuid,'start',position(s->>'quote' in v->>'text'),'length',length(s->>'quote'),'hash',encode(sha256(convert_to(v->>'text','UTF8')),'hex')));
  end loop;
  perform business_research_payload(v_kind,p_input->'payload',p_input->'sources');
  if v_id is null then
   if v_revision<>0 then raise exception 'research revision conflict';end if;
   insert into business_research_records(user_id,kind,title,case_ids,experience_ids,payload) values(p_user_id,v_kind,btrim(p_input->>'title'),p_input->'caseIds',p_input->'experienceIds',p_input->'payload') returning * into r;
  else
   select * into r from business_research_records where user_id=p_user_id and id=v_id for update;
   if not found or r.erased_at is not null then raise exception 'research owner unavailable' using errcode='42501';end if;
   if r.revision<>v_revision then raise exception 'research revision conflict';end if;
   update business_research_records set kind=v_kind,title=btrim(p_input->>'title'),case_ids=p_input->'caseIds',experience_ids=p_input->'experienceIds',payload=p_input->'payload',revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into r;
   delete from business_research_refs where record_id=r.id;
  end if;
  for s in select value from jsonb_array_elements(v_refs) loop
   insert into business_research_refs values(p_user_id,r.id,s->>'key',s->>'kind',(s->>'id')::uuid,(s->>'start')::integer,(s->>'length')::integer,s->>'hash',true);
  end loop;
 else
  select * into r from business_research_records where user_id=p_user_id and id=v_id for update;
  if not found then raise exception 'research owner unavailable' using errcode='42501';end if;
  update business_research_records set title='',payload=null,experience_ids='[]',revision=revision+1,updated_at=clock_timestamp(),erased_at=coalesce(erased_at,clock_timestamp()) where id=r.id returning * into r;
  delete from business_research_refs where record_id=r.id;
 end if;
 v_result:=jsonb_build_object('id',r.id,'revision',r.revision);
 insert into business_research_receipts values(p_user_id,v_request,v_hash,v_result);
 return v_result;
end$$;

-- Erasure scrubs derived prose physically; ordinary source changes are detected by
-- the full current-text hash on every DTO read and keep the user's own notes stored.
create function public.business_research_source_erasure() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$declare v_kind text;v_scrub boolean;v_ids uuid[];begin
 v_kind:=case tg_table_name when 'business_material_snapshots' then 'snapshot' when 'reality_materials' then 'material' else 'job' end;
 v_scrub:=tg_op='DELETE';
 if tg_op<>'DELETE' then
  v_scrub:=new.user_id is distinct from old.user_id or new.id is distinct from old.id;
  if v_kind='snapshot' then v_scrub:=v_scrub or new.erased_at is not null or nullif(btrim(new.captured_text),'') is null;
  elsif v_kind='material' then v_scrub:=v_scrub or new.status='deleted' or nullif(btrim(new.sanitized_text),'') is null;
  else v_scrub:=v_scrub or nullif(btrim(new.body),'') is null;end if;
 end if;
 if v_scrub then
  select array_agg(distinct record_id) into v_ids from business_research_refs where user_id=old.user_id and source_kind=v_kind and source_id=old.id;
  -- Take record locks in one order when an erased source has several dependents.
  perform 1 from business_research_records where id=any(v_ids) order by id for update;
  update business_research_records set title='',payload=null,experience_ids='[]',erased_at=coalesce(erased_at,clock_timestamp()),updated_at=clock_timestamp(),revision=revision+1 where id=any(v_ids);
  delete from business_research_refs where record_id=any(v_ids);
 end if;
 return null;
end$$;
create trigger business_research_snapshot_erasure after update or delete on public.business_material_snapshots for each row execute function public.business_research_source_erasure();
create trigger business_research_material_erasure after update or delete on public.reality_materials for each row execute function public.business_research_source_erasure();
create trigger business_research_job_erasure after update or delete on public.job_postings for each row execute function public.business_research_source_erasure();

-- All reads go through DTO invalidation; no raw-table SELECT bypass is granted.
alter table public.business_research_records enable row level security;
alter table public.business_research_refs enable row level security;
alter table public.business_research_receipts enable row level security;
revoke all on public.business_research_records,public.business_research_refs,public.business_research_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_research_keys(jsonb,text[],text[]),public.business_research_text(jsonb,text,boolean),public.business_research_uuid(jsonb),public.business_research_source(uuid,text,uuid,jsonb,boolean),public.business_research_payload(text,jsonb,jsonb),public.business_research_dto(public.business_research_records),public.business_research_source_erasure() from public,anon,authenticated,service_role;
revoke all on function public.business_research_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.business_research_command(uuid,text,jsonb) to service_role;
commit;
