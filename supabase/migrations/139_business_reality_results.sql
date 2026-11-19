begin;
-- Block concurrent plan writes until current-only backfill and capture triggers exist.
lock table public.business_reality_checks in share row exclusive mode;
create table public.business_reality_check_versions(
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_id uuid not null references public.business_reality_checks(id) on delete cascade,
 case_id uuid not null,revision integer not null check(revision>0),
 plan jsonb not null check(jsonb_typeof(plan)='object'),saved_at timestamptz not null,
 primary key(user_id,plan_id,revision)
);
create table public.business_reality_results(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 case_id uuid not null,plan_id uuid not null,plan_revision integer not null check(plan_revision>0),
 plan_snapshot jsonb,plan_saved_at timestamptz not null,body jsonb not null check(jsonb_typeof(body)='object'),
 created_at timestamptz not null default clock_timestamp(),snapshot_erased_at timestamptz,
 check((plan_snapshot is null)=(snapshot_erased_at is not null)),
 check(plan_snapshot is null or jsonb_typeof(plan_snapshot)='object')
);
create index business_reality_result_order on public.business_reality_results(user_id,created_at desc,id desc);
create index business_reality_result_case_order on public.business_reality_results(user_id,case_id,created_at desc,id desc);
create index business_reality_result_plan_order on public.business_reality_results(user_id,plan_id,created_at desc,id desc);
create table public.business_reality_result_receipts(
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 input_hash text not null check(input_hash~'^[0-9a-f]{64}$'),result_id uuid not null,
 revision integer not null check(revision in (1,2)),primary key(user_id,request_id)
);
create index business_reality_result_receipt_record on public.business_reality_result_receipts(result_id);

create function public.business_reality_check_capture_version() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then
  -- Deleting a plan destroys every recoverable copy of its own prose atomically.
  delete from business_reality_check_versions where user_id=old.user_id and plan_id=old.id;
  update business_reality_results set plan_snapshot=null,snapshot_erased_at=clock_timestamp() where user_id=old.user_id and plan_id=old.id and plan_snapshot is not null;
  return old;
 end if;
 insert into business_reality_check_versions(user_id,plan_id,case_id,revision,plan,saved_at)
 values(new.user_id,new.id,new.case_id,new.revision,business_reality_check_plan(new.plan),new.updated_at)
 on conflict(user_id,plan_id,revision) do nothing;
 if not exists(select 1 from business_reality_check_versions where user_id=new.user_id and plan_id=new.id and case_id=new.case_id and revision=new.revision and plan=new.plan and saved_at=new.updated_at) then raise exception 'immutable reality check version conflict';end if;
 return new;
end$$;
insert into public.business_reality_check_versions(user_id,plan_id,case_id,revision,plan,saved_at)
 select user_id,id,case_id,revision,public.business_reality_check_plan(plan),updated_at from public.business_reality_checks;
create trigger business_reality_check_capture_version after insert or update on public.business_reality_checks for each row execute function public.business_reality_check_capture_version();
create trigger business_reality_check_erase_versions before delete on public.business_reality_checks for each row execute function public.business_reality_check_capture_version();

create function public.business_reality_result_body(p jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v jsonb:=p;k text;d date;u text;authority text;host text;port text;begin
 perform business_simulation_keys(v,array['checkedOn','examined','found','sourceNote','sourceUrl','learned']);
 d:=business_simulation_date(v->'checkedOn');if d>(clock_timestamp() at time zone 'Asia/Tokyo')::date then raise exception 'reality result date is in the future';end if;
 foreach k in array array['examined','sourceNote','learned'] loop v:=jsonb_set(v,array[k],to_jsonb(business_simulation_text(v->k,3000)));end loop;
 v:=jsonb_set(v,'{found}',to_jsonb(business_simulation_text(v->'found',6000)));
 if v->'sourceUrl' is distinct from 'null'::jsonb then
  if jsonb_typeof(v->'sourceUrl') is distinct from 'string' then raise exception 'invalid reality result URL';end if;u:=v->>'sourceUrl';
  if length(u)+length(regexp_replace(u,U&'[\0001-\FFFF]','','g'))>2000 or u!~*'^https://[^/?#]+' or u~U&'[\0001-\0020\007F-\009F\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' or position(chr(92) in u)>0 then raise exception 'invalid reality result URL';end if;
  authority:=split_part(regexp_replace(u,'^https://','','i'),'/',1);authority:=split_part(split_part(authority,'?',1),'#',1);
  if authority='' or position('@' in authority)>0 then raise exception 'invalid reality result URL';end if;
  if left(authority,1)='[' then
   if authority!~'^\[[0-9a-fA-F:.]+\](:[0-9]+)?$' then raise exception 'invalid reality result URL';end if;
   host:=split_part(substr(authority,2),']',1);perform host::inet;port:=substring(authority from '\]:([0-9]+)$');
  else
   if authority~'[%\[\]<>^|]' or authority!~'^[^:]+(:[0-9]+)?$' then raise exception 'invalid reality result URL';end if;
   host:=split_part(authority,':',1);port:=substring(authority from ':([0-9]+)$');
  end if;
  if host='' or (port is not null and (length(port)>5 or port::integer>65535)) then raise exception 'invalid reality result URL';end if;
 end if;
 return v;
end$$;

create function public.business_reality_result_plan_dto(p business_reality_checks) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;begin
 c:=business_simulation_context(p.user_id,p.case_id);
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'question',p.plan->'question','revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'caseAvailable',c is not null,'caseTitle',c->'caseTitle');
end$$;
create function public.business_reality_result_version_dto(p business_reality_check_versions) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;current_revision integer;begin
 select revision into current_revision from business_reality_checks where user_id=p.user_id and id=p.plan_id;
 c:=business_simulation_context(p.user_id,p.case_id);
 return jsonb_build_object('planId',p.plan_id,'caseId',p.case_id,'revision',p.revision,'plan',p.plan,'savedAt',p.saved_at,'currentRevision',current_revision,'caseAvailable',c is not null,'caseTitle',c->'caseTitle');
end$$;
create function public.business_reality_result_dto(p business_reality_results) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare current_revision integer;begin
 select revision into current_revision from business_reality_checks where user_id=p.user_id and id=p.plan_id;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'planId',p.plan_id,'planRevision',p.plan_revision,'planSavedAt',p.plan_saved_at,'planSnapshot',p.plan_snapshot,'snapshotErasedAt',p.snapshot_erased_at,'body',p.body,'createdAt',p.created_at,'revision',1,'planCurrentRevision',current_revision);
end$$;

create function public.business_reality_result_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_plan uuid;v_revision integer;v_body jsonb;v_hash text;r business_reality_results;p business_reality_checks;v business_reality_check_versions;receipt business_reality_result_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_operation='append' then perform business_simulation_keys(p_input,array['operation','id','requestId','planId','planRevision','body','confirmed']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);else raise exception 'invalid reality result operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid reality result operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');
 if p_operation='append' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'reality result confirmation required';end if;
  v_plan:=business_simulation_uuid(p_input->'planId');v_revision:=business_simulation_integer(p_input->'planRevision',2147483647)::integer;if v_revision<1 then raise exception 'invalid reality result plan revision';end if;
 else if business_simulation_integer(p_input->'expectedRevision',1)<>1 then raise exception 'invalid reality result revision';end if;end if;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,139));
 -- Receipts resolve before source rereads or body revalidation. Erasure cannot resurrect data.
 select * into receipt from business_reality_result_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'reality result request conflict';end if;return jsonb_build_object('id',receipt.result_id,'revision',receipt.revision);end if;
 select * into r from business_reality_results where user_id=p_user_id and id=v_id for update;
 if p_operation='append' then
  if r.id is not null or exists(select 1 from business_reality_results where id=v_id) or exists(select 1 from business_reality_result_receipts where result_id=v_id) then raise exception 'reality result unavailable' using errcode='42501';end if;
  v_body:=business_reality_result_body(p_input->'body');
  select * into p from business_reality_checks where user_id=p_user_id and id=v_plan for share;
  if not found then raise exception 'reality result source unavailable' using errcode='42501';end if;
  select * into v from business_reality_check_versions where user_id=p_user_id and plan_id=v_plan and revision=v_revision;
  if not found then raise exception 'reality result source unavailable' using errcode='42501';end if;
  insert into business_reality_results(id,user_id,case_id,plan_id,plan_revision,plan_snapshot,plan_saved_at,body) values(v_id,p_user_id,p.case_id,p.id,v.revision,v.plan,v.saved_at,v_body);v_revision:=1;
 else
  if r.id is null then raise exception 'reality result unavailable' using errcode='42501';end if;
  delete from business_reality_results where user_id=p_user_id and id=v_id;v_revision:=2;
 end if;
 insert into business_reality_result_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create function public.business_reality_result_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_reality_results;p business_reality_checks;v business_reality_check_versions;v_id uuid;v_case uuid;v_plan uuid;v_revision integer;v_date timestamptz;v_before uuid;v_stamp text;v_count integer:=0;v_items jsonb:='[]';v_next jsonb;begin
 perform business_simulation_service(p_user_id);
 if p_operation='get' then
  perform business_simulation_keys(p_input,array['id']);v_id:=business_simulation_uuid(p_input->'id');select * into r from business_reality_results where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_reality_result_dto(r);
 elsif p_operation in ('versions','version') then
  if p_operation='versions' then perform business_simulation_keys(p_input,array['planId'],array['before']);else perform business_simulation_keys(p_input,array['planId'],array['revision']);end if;
  v_plan:=business_simulation_uuid(p_input->'planId');
  if p_input?'revision' then v_revision:=business_simulation_integer(p_input->'revision',2147483647)::integer;if v_revision<1 then raise exception 'invalid reality result version';end if;end if;
  if p_operation='version' then
   select * into p from business_reality_checks where user_id=p_user_id and id=v_plan;if not found then return null;end if;
   select * into v from business_reality_check_versions where user_id=p_user_id and plan_id=v_plan and revision=coalesce(v_revision,p.revision);if not found then return null;end if;return business_reality_result_version_dto(v);
  end if;
  if p_input?'before' then perform business_simulation_keys(p_input->'before',array['revision']);v_revision:=business_simulation_integer(p_input->'before'->'revision',2147483647)::integer;if v_revision<1 then raise exception 'invalid reality result version cursor';end if;end if;
  for v in select * from business_reality_check_versions where user_id=p_user_id and plan_id=v_plan and (v_revision is null or revision<v_revision) order by revision desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_result_version_dto(v));v_next:=jsonb_build_object('revision',v.revision);end if;
  end loop;
  return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
 elsif p_operation='list' then perform business_simulation_keys(p_input,'{}',array['caseId','planId','before']);if p_input?'planId' then v_plan:=business_simulation_uuid(p_input->'planId');end if;
 elsif p_operation='plans' then perform business_simulation_keys(p_input,'{}',array['caseId','before']);else raise exception 'invalid reality result read';end if;
 if p_input?'caseId' then v_case:=business_simulation_uuid(p_input->'caseId');end if;
 if p_input?'before' then
  perform business_simulation_keys(p_input->'before',array['date','id']);v_before:=business_simulation_uuid(p_input->'before'->'id');v_stamp:=p_input->'before'->>'date';
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or length(v_stamp)>80 or v_stamp!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid reality result cursor';end if;
  perform business_simulation_date(to_jsonb(left(v_stamp,10)));v_date:=v_stamp::timestamptz;
 end if;
 if p_operation='list' then
  for r in select * from business_reality_results where user_id=p_user_id and (v_case is null or case_id=v_case) and (v_plan is null or plan_id=v_plan) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_result_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
  end loop;
 else
  for p in select * from business_reality_checks where user_id=p_user_id and (v_case is null or case_id=v_case) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_result_plan_dto(p));v_next:=jsonb_build_object('date',p.created_at,'id',p.id);end if;
  end loop;
 end if;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

alter table public.business_reality_check_versions enable row level security;
alter table public.business_reality_results enable row level security;
alter table public.business_reality_result_receipts enable row level security;
revoke all on public.business_reality_check_versions,public.business_reality_results,public.business_reality_result_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_reality_check_capture_version(),public.business_reality_result_body(jsonb),public.business_reality_result_plan_dto(public.business_reality_checks),public.business_reality_result_version_dto(public.business_reality_check_versions),public.business_reality_result_dto(public.business_reality_results),public.business_reality_result_command(uuid,text,jsonb),public.business_reality_result_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_reality_result_command(uuid,text,jsonb),public.business_reality_result_read(uuid,text,jsonb) to service_role;
commit;
