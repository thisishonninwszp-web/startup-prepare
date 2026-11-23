begin;

-- This paid collection budget is independent of the Rakuten job budget and defaults OFF.
create table public.business_withdrawal_collection_settings(
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,issuer_ids uuid[] not null default '{}',
 public_text_confirmed boolean not null default false,
 policy_version text not null default 'official-withdrawal-public-text-v1' check(policy_version='official-withdrawal-public-text-v1'),
 revision integer not null default 0 check(revision>=0),updated_at timestamptz not null default clock_timestamp(),
 check(not enabled or(public_text_confirmed and cardinality(issuer_ids)>0)),check(cardinality(issuer_ids)<=20)
);
create table public.business_withdrawal_collection_runs(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null,status text not null check(status in('running','completed','failed','unknown')),
 token uuid not null,settings_revision integer not null,issuer_ids uuid[] not null,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 unique(user_id,id),unique(user_id,local_date)
);
create table public.business_withdrawal_collection_tickets(
 id uuid primary key,user_id uuid not null,run_id uuid not null,
 kind text not null check(kind in('search','page','ai')),
 status text not null default 'reserved' check(status in('reserved','completed','failed','unknown')),
 issuer_id uuid,url text,created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,run_id) references business_withdrawal_collection_runs(user_id,id),
 foreign key(user_id,issuer_id) references business_withdrawal_issuers(user_id,id)
);
create table public.business_withdrawal_collection_archives(
 id uuid primary key,user_id uuid not null,run_id uuid not null,raw text not null,
 issues jsonb not null,validator_version text not null check(validator_version='withdrawal-collection-v1'),
 truncated boolean not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,run_id) references business_withdrawal_collection_runs(user_id,id)
);
create table public.business_withdrawal_collection_receipts(
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 input_hash text not null,result jsonb not null,primary key(user_id,request_id)
);
alter table public.business_withdrawal_collection_settings enable row level security;
alter table public.business_withdrawal_collection_runs enable row level security;
alter table public.business_withdrawal_collection_tickets enable row level security;
alter table public.business_withdrawal_collection_archives enable row level security;
alter table public.business_withdrawal_collection_receipts enable row level security;

create function public.business_withdrawal_collection_settings_dto(s business_withdrawal_collection_settings) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('enabled',s.enabled,'issuerIds',to_jsonb(s.issuer_ids),'publicTextConfirmed',s.public_text_confirmed,'policyVersion',s.policy_version,'revision',s.revision)
$$;
create function public.business_withdrawal_collection_run_dto(r business_withdrawal_collection_runs) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'localDate',r.local_date,'status',r.status,'revision',r.settings_revision,'expiresAt',r.expires_at)
$$;
create function public.business_withdrawal_collection_expire(p_owner uuid) returns void language plpgsql set search_path=public,pg_temp as $$begin
 update business_withdrawal_collection_runs set status='unknown' where user_id=p_owner and status='running' and expires_at<=clock_timestamp();
 update business_withdrawal_collection_tickets t set status='unknown' from business_withdrawal_collection_runs r where t.user_id=p_owner and r.user_id=t.user_id and r.id=t.run_id and r.status in('failed','unknown') and t.status='reserved';
end$$;
create function public.business_withdrawal_collection_verify(p_owner uuid,p jsonb) returns business_withdrawal_collection_runs language plpgsql set search_path=public,pg_temp as $$
declare r business_withdrawal_collection_runs;s business_withdrawal_collection_settings;begin
 select * into r from business_withdrawal_collection_runs where user_id=p_owner and id=business_simulation_uuid(p->'runId') for update;
 if not found or r.token<>business_simulation_uuid(p->'token') or r.settings_revision<>business_simulation_integer(p->'revision',2147483646)::integer then raise exception 'collection lease unavailable' using errcode='42501';end if;
 if r.status<>'running' or r.expires_at<=clock_timestamp() or r.local_date<>business_today() then raise exception 'collection lease terminal or expired';end if;
 select * into s from business_withdrawal_collection_settings where user_id=p_owner;
 if not s.enabled or not s.public_text_confirmed or s.revision<>r.settings_revision or s.issuer_ids<>r.issuer_ids then raise exception 'collection stopped or settings revision changed';end if;
 return r;
end$$;

-- The frozen issuer registry is a durable run-to-subject relation, including duplicate
-- subjects reached through a different registered host. Scrub the whole batch because
-- rejected raw output cannot safely be split back into individual lesson fragments.
create function public.business_withdrawal_collection_has_erasure(p_owner uuid,p_run uuid) returns boolean language sql stable set search_path=public,pg_temp as $$
 select exists(
  select 1 from business_withdrawal_collection_runs r
  join business_withdrawal_issuers i on i.user_id=r.user_id and i.id=any(r.issuer_ids)
  join business_withdrawal_lessons l on l.user_id=i.user_id and l.identity_key=i.subject_identity_key
  left join business_withdrawal_sources s on s.user_id=l.user_id and s.id=l.id
  where r.user_id=p_owner and r.id=p_run and(l.erased_at is not null or s.erased_at is not null)
 )
$$;
create function public.business_withdrawal_collection_archive_erasure() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_identity text;begin
 if old.erased_at is not null or new.erased_at is null then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,719));
 select identity_key into v_identity from business_withdrawal_lessons where user_id=new.user_id and id=new.id;
 update business_withdrawal_collection_archives a set raw=''
 where a.user_id=new.user_id and a.raw<>'' and exists(
  select 1 from business_withdrawal_collection_runs r
  join business_withdrawal_issuers i on i.user_id=r.user_id and i.id=any(r.issuer_ids)
  where r.user_id=a.user_id and r.id=a.run_id and i.subject_identity_key=v_identity
 );
 return new;
end$$;
create trigger business_withdrawal_collection_lesson_erasure after update of erased_at on public.business_withdrawal_lessons for each row execute function public.business_withdrawal_collection_archive_erasure();
create trigger business_withdrawal_collection_source_erasure after update of erased_at on public.business_withdrawal_sources for each row execute function public.business_withdrawal_collection_archive_erasure();

create function public.business_withdrawal_collection_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s business_withdrawal_collection_settings;r business_withdrawal_collection_runs;t business_withdrawal_collection_tickets;
 prior business_withdrawal_collection_receipts;i business_withdrawal_issuers;v_ids uuid[];v_request uuid;v_hash text;v_result jsonb;v jsonb;v_id uuid;v_count integer;v_revision integer;v_kind text;begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>500000 then raise exception 'invalid collection input';end if;
 if p_operation='state' then perform business_simulation_keys(p_input,'{}');
 elsif p_operation='settings' then perform business_simulation_keys(p_input,array['enabled','issuerIds','publicTextConfirmed','policyVersion','expectedRevision','requestId']);
 elsif p_operation='claim' then perform business_simulation_keys(p_input,array['requestId']);
 elsif p_operation='check' then perform business_simulation_keys(p_input,array['runId','token','revision']);
 elsif p_operation='ticket' then perform business_simulation_keys(p_input,array['runId','token','revision','kind','issuerId','url','requestId']);
 elsif p_operation='settle' then perform business_simulation_keys(p_input,array['runId','token','revision','ticketId','status','requestId']);
 elsif p_operation='archive' then perform business_simulation_keys(p_input,array['runId','token','revision','raw','issues','validatorVersion','truncated','requestId']);
 elsif p_operation='save_candidate' then perform business_simulation_keys(p_input,array['runId','token','revision','command','requestId']);
 elsif p_operation='complete' then perform business_simulation_keys(p_input,array['runId','token','revision','requestId']);
 elsif p_operation='terminate' then perform business_simulation_keys(p_input,array['runId','token','revision','status','requestId']);
 else raise exception 'invalid collection operation';end if;
 -- Shared lock order with146: candidate check and existing save execute atomically.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 insert into business_withdrawal_collection_settings(user_id) values(p_user_id) on conflict do nothing;
 perform business_withdrawal_collection_expire(p_user_id);
 select * into s from business_withdrawal_collection_settings where user_id=p_user_id for update;
 if p_operation not in('state','check') then
  v_request:=business_simulation_uuid(p_input->'requestId');v_hash:=encode(sha256(convert_to('withdrawal149:'||p_operation||':'||p_input::text,'UTF8')),'hex');
  select * into prior from business_withdrawal_collection_receipts where user_id=p_user_id and request_id=v_request;
  if found then if prior.input_hash<>v_hash then raise exception 'collection request conflict';end if;return prior.result;end if;
 end if;
 if p_operation='state' then
  select * into r from business_withdrawal_collection_runs where user_id=p_user_id and local_date=business_today();
  return jsonb_build_object('available',true,'settings',business_withdrawal_collection_settings_dto(s),'run',case when r.id is null then null else business_withdrawal_collection_run_dto(r) end,
   'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'status',status,'createdAt',created_at) order by created_at,id) from business_withdrawal_collection_tickets where user_id=p_user_id and run_id=r.id),'[]'::jsonb),
   'diagnostics',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'validatorVersion',d.validator_version,'issues',d.issues,'truncated',d.truncated,'createdAt',d.created_at) order by d.created_at desc,d.id desc) from(select * from business_withdrawal_collection_archives where user_id=p_user_id order by created_at desc,id desc limit 20)d),'[]'::jsonb));
 elsif p_operation='settings' then
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or jsonb_typeof(p_input->'publicTextConfirmed') is distinct from 'boolean' or p_input->>'policyVersion' is distinct from 'official-withdrawal-public-text-v1' or jsonb_typeof(p_input->'issuerIds') is distinct from 'array' or jsonb_array_length(p_input->'issuerIds')>20 then raise exception 'invalid separate collection consent';end if;
  v_revision:=business_simulation_integer(p_input->'expectedRevision',2147483646)::integer;if v_revision<>s.revision then raise exception 'collection settings revision conflict';end if;
  select coalesce(array_agg(business_simulation_uuid(value) order by ordinality),'{}'::uuid[]) into v_ids from jsonb_array_elements(p_input->'issuerIds') with ordinality;
  if cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids)x) then raise exception 'duplicate issuer';end if;
  if exists(select 1 from unnest(v_ids)x where not exists(select 1 from business_withdrawal_issuers where user_id=p_user_id and id=x and confirmed_at is not null)) then raise exception 'owned confirmed issuer required' using errcode='42501';end if;
  if (p_input->>'enabled')::boolean and(not(p_input->>'publicTextConfirmed')::boolean or cardinality(v_ids)=0) then raise exception 'extra budget and public text confirmation required';end if;
  update business_withdrawal_collection_settings set enabled=(p_input->>'enabled')::boolean,issuer_ids=v_ids,public_text_confirmed=(p_input->>'publicTextConfirmed')::boolean,revision=revision+1,updated_at=clock_timestamp() where user_id=p_user_id returning * into s;
  v_result:=business_withdrawal_collection_settings_dto(s);
 elsif p_operation='claim' then
  if not s.enabled then v_result:=jsonb_build_object('status','disabled');else
   select * into r from business_withdrawal_collection_runs where user_id=p_user_id and local_date=business_today();
   if found then v_result:=business_withdrawal_collection_run_dto(r);else
    insert into business_withdrawal_collection_runs(id,user_id,local_date,status,token,settings_revision,issuer_ids,expires_at) values(gen_random_uuid(),p_user_id,business_today(),'running',gen_random_uuid(),s.revision,s.issuer_ids,clock_timestamp()+interval '10 minutes') returning * into r;
    v_result:=business_withdrawal_collection_run_dto(r)||jsonb_build_object('token',r.token,'issuers',coalesce((select jsonb_agg(business_withdrawal_issuer_dto(x) order by array_position(r.issuer_ids,x.id)) from business_withdrawal_issuers x where user_id=p_user_id and id=any(r.issuer_ids)),'[]'::jsonb));
   end if;
  end if;
 elsif p_operation='terminate' then
  select * into r from business_withdrawal_collection_runs where user_id=p_user_id and id=business_simulation_uuid(p_input->'runId') for update;
  if not found or r.token<>business_simulation_uuid(p_input->'token') or r.settings_revision<>business_simulation_integer(p_input->'revision',2147483646)::integer then raise exception 'collection lease unavailable' using errcode='42501';end if;
  if p_input->>'status' not in('failed','unknown') or jsonb_typeof(p_input->'status') is distinct from 'string' then raise exception 'invalid terminal status';end if;
  if r.status='running' then update business_withdrawal_collection_runs set status=p_input->>'status' where id=r.id returning * into r;end if;
  update business_withdrawal_collection_tickets set status='unknown' where run_id=r.id and user_id=p_user_id and status='reserved';v_result:=business_withdrawal_collection_run_dto(r);
 else
  r:=business_withdrawal_collection_verify(p_user_id,p_input);
  if p_operation='check' then return jsonb_build_object('ok',true,'runId',r.id,'revision',r.settings_revision);
  elsif p_operation='ticket' then
   v_kind:=p_input->>'kind';if jsonb_typeof(p_input->'kind') is distinct from 'string' or v_kind not in('search','page','ai') then raise exception 'invalid collection ticket';end if;
   if v_kind='page' then
    v_id:=business_simulation_uuid(p_input->'issuerId');select * into i from business_withdrawal_issuers where user_id=p_user_id and id=v_id and id=any(r.issuer_ids);if not found then raise exception 'unselected issuer';end if;
    perform business_withdrawal_url(p_input->'url',i.domain);
   elsif p_input->'issuerId' is distinct from 'null'::jsonb or p_input->'url' is distinct from 'null'::jsonb then raise exception 'unexpected collection ticket target';end if;
   select count(*) into v_count from business_withdrawal_collection_tickets where user_id=p_user_id and run_id=r.id and kind=v_kind;
   if v_count>=(case v_kind when 'search' then 2 when 'page' then 3 else 1 end) then raise exception 'collection budget exhausted';end if;
   insert into business_withdrawal_collection_tickets(id,user_id,run_id,kind,issuer_id,url) values(gen_random_uuid(),p_user_id,r.id,v_kind,v_id,p_input->>'url') returning * into t;v_result:=jsonb_build_object('id',t.id,'kind',t.kind,'runId',r.id,'status','reserved');
  elsif p_operation='settle' then
   if jsonb_typeof(p_input->'status') is distinct from 'string' or p_input->>'status' not in('completed','failed','unknown') then raise exception 'invalid ticket status';end if;
   select * into t from business_withdrawal_collection_tickets where user_id=p_user_id and run_id=r.id and id=business_simulation_uuid(p_input->'ticketId') for update;
   if not found or t.status<>'reserved' then raise exception 'ticket terminal or unavailable';end if;
   update business_withdrawal_collection_tickets set status=p_input->>'status' where id=t.id;v_result:=jsonb_build_object('id',t.id,'status',p_input->>'status','runId',r.id);
  elsif p_operation='archive' then
   if jsonb_typeof(p_input->'raw') is distinct from 'string' or length(p_input->>'raw')+length(regexp_replace(p_input->>'raw',U&'[\0001-\FFFF]','','g'))>120000 or jsonb_typeof(p_input->'issues') is distinct from 'array' or jsonb_array_length(p_input->'issues')>30 or p_input->>'validatorVersion' is distinct from 'withdrawal-collection-v1' or jsonb_typeof(p_input->'truncated') is distinct from 'boolean' then raise exception 'invalid collection archive';end if;
   for v in select value from jsonb_array_elements(p_input->'issues') loop if jsonb_typeof(v) is distinct from 'string' or v#>>'{}' not in('invalid_json','invalid_candidate','invalid_analysis','source_mismatch','unrecognized_subject','page_unavailable','collection_failed') then raise exception 'invalid issue code';end if;end loop;
   -- Erasure can occur during provider I/O, before any save/duplicate association.
   -- A tombstone for any frozen subject therefore prevents all late raw restoration.
   v_id:=gen_random_uuid();insert into business_withdrawal_collection_archives(id,user_id,run_id,raw,issues,validator_version,truncated) values(v_id,p_user_id,r.id,case when business_withdrawal_collection_has_erasure(p_user_id,r.id) then '' else p_input->>'raw' end,p_input->'issues',p_input->>'validatorVersion',(p_input->>'truncated')::boolean);v_result:=jsonb_build_object('id',v_id,'runId',r.id);
  elsif p_operation='save_candidate' then
   v:=p_input->'command';perform business_simulation_keys(v,array['operation','id','requestId','expectedRevision','lesson','confirmed']);perform business_simulation_uuid(v->'id');perform business_simulation_uuid(v->'requestId');
   if v->>'operation' is distinct from 'save' or v->'confirmed' is distinct from 'false'::jsonb or v->'expectedRevision' is distinct from '0'::jsonb or not(business_simulation_uuid(v->'lesson'->'source'->'issuerId')=any(r.issuer_ids)) then raise exception 'automatic candidates must be new unconfirmed owned drafts';end if;
   if not exists(select 1 from business_withdrawal_collection_tickets where user_id=p_user_id and run_id=r.id and kind='ai' and status='completed') then raise exception 'completed analysis ticket required';end if;
   if not exists(select 1 from business_withdrawal_collection_tickets where user_id=p_user_id and run_id=r.id and kind='page' and status='completed' and issuer_id=business_simulation_uuid(v->'lesson'->'source'->'issuerId') and url=v->'lesson'->'source'->>'url') then raise exception 'completed official page ticket required';end if;
   -- Validate the complete frozen facts even when this identity has already been studied.
   perform business_withdrawal_validate(p_user_id,v->'lesson');
   if exists(select 1 from business_withdrawal_lessons where user_id=p_user_id and identity_key=business_withdrawal_identity(v->'lesson'->'subject')) then
    v_result:=jsonb_build_object('status','duplicate','identityKey',business_withdrawal_identity(v->'lesson'->'subject'));
   else v_result:=business_withdrawal_command(p_user_id,'save',v)||jsonb_build_object('status','saved');end if;
   if business_withdrawal_collection_has_erasure(p_user_id,r.id) then update business_withdrawal_collection_archives set raw='' where user_id=p_user_id and run_id=r.id and raw<>'';end if;
  elsif p_operation='complete' then
   if exists(select 1 from business_withdrawal_collection_tickets where user_id=p_user_id and run_id=r.id and status='reserved') then raise exception 'unsettled ticket';end if;
   update business_withdrawal_collection_runs set status='completed' where id=r.id returning * into r;v_result:=business_withdrawal_collection_run_dto(r);
  end if;
 end if;
 insert into business_withdrawal_collection_receipts(user_id,request_id,input_hash,result) values(p_user_id,v_request,v_hash,v_result);return v_result;
end$$;

revoke all on public.business_withdrawal_collection_settings,public.business_withdrawal_collection_runs,public.business_withdrawal_collection_tickets,public.business_withdrawal_collection_archives,public.business_withdrawal_collection_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_withdrawal_collection_settings_dto(public.business_withdrawal_collection_settings),public.business_withdrawal_collection_run_dto(public.business_withdrawal_collection_runs),public.business_withdrawal_collection_expire(uuid),public.business_withdrawal_collection_verify(uuid,jsonb),public.business_withdrawal_collection_has_erasure(uuid,uuid),public.business_withdrawal_collection_archive_erasure(),public.business_withdrawal_collection_command(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_withdrawal_collection_command(uuid,text,jsonb) to service_role;
commit;
