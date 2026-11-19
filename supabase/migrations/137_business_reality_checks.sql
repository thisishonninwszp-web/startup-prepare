begin;
-- Plans retain only an immutable source anchor, never copies of simulation prose.
create table public.business_reality_checks(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 case_id uuid not null,simulation_id uuid not null,round integer not null check(round between 1 and 6),
 source_revision integer not null check(source_revision between 2 and 7 and source_revision>=round+1),
 plan jsonb not null check(jsonb_typeof(plan)='object'),revision integer not null check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index business_reality_check_order on public.business_reality_checks(user_id,created_at desc,id desc);
create index business_reality_check_case_order on public.business_reality_checks(user_id,case_id,created_at desc,id desc);
create index business_reality_check_simulation_order on public.business_reality_checks(user_id,simulation_id,created_at desc,id desc);
-- Hash-only receipts survive erase, preventing retries from resurrecting an ID.
create table public.business_reality_check_receipts(
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 input_hash text not null check(input_hash~'^[0-9a-f]{64}$'),reality_check_id uuid not null,
 revision integer not null check(revision>0),primary key(user_id,request_id)
);
create index business_reality_check_receipt_record on public.business_reality_check_receipts(reality_check_id);

create function public.business_reality_check_plan(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb:=p;begin
 perform business_simulation_keys(v,array['question','falsifier','method','dueDate']);
 v:=jsonb_set(v,'{question}',to_jsonb(business_simulation_text(v->'question',1000)));
 v:=jsonb_set(v,'{falsifier}',to_jsonb(business_simulation_text(v->'falsifier',3000)));
 v:=jsonb_set(v,'{method}',to_jsonb(business_simulation_text(v->'method',3000)));
 perform business_simulation_date(v->'dueDate');return v;
end$$;

create function public.business_reality_check_source_dto(p business_simulations,p_summary boolean) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;v jsonb;begin
 c:=business_simulation_context(p.user_id,p.case_id);
 v:=jsonb_build_object('id',p.id,'caseId',p.case_id,'title',p.setup->'title','revision',p.revision,'caseAvailable',c is not null,'caseTitle',c->'caseTitle');
 if p_summary then return v||jsonb_build_object('roundCount',jsonb_array_length(p.turns));end if;
 return v||jsonb_build_object('turns',coalesce((select jsonb_agg(jsonb_build_object('reason',value->'reason','checkNext',value->'checkNext') order by ordinal) from jsonb_array_elements(p.turns) with ordinality t(value,ordinal)),'[]'::jsonb));
end$$;

create function public.business_reality_check_dto(p business_reality_checks) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;s business_simulations;v_available boolean;begin
 c:=business_simulation_context(p.user_id,p.case_id);
 select * into s from business_simulations where user_id=p.user_id and id=p.simulation_id and case_id=p.case_id and jsonb_array_length(turns)>=p.round;
 v_available:=found;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'simulationId',p.simulation_id,'round',p.round,'sourceRevision',p.source_revision,'plan',p.plan,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
  'source',jsonb_build_object('available',v_available,'title',case when v_available then s.setup->'title' else null end,'currentRevision',case when v_available then s.revision else null end,'reason',case when v_available then s.turns->(p.round-1)->'reason' else null end,'checkNext',case when v_available then s.turns->(p.round-1)->'checkNext' else null end,'caseAvailable',c is not null,'caseTitle',c->'caseTitle'));
end$$;

create function public.business_reality_check_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_simulation uuid;v_round integer;v_plan jsonb;v_hash text;r business_reality_checks;s business_simulations;receipt business_reality_check_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_operation='save' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','simulationId','round','plan','confirmed']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);
 else raise exception 'invalid reality check operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid reality check operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');v_expected:=business_simulation_integer(p_input->'expectedRevision',2147483646)::integer;
 if p_operation='erase' and v_expected=0 then raise exception 'invalid reality check revision';end if;
 if p_operation='save' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'reality check confirmation required';end if;
  v_simulation:=business_simulation_uuid(p_input->'simulationId');v_round:=business_simulation_integer(p_input->'round',6)::integer;if v_round<1 then raise exception 'invalid reality check round';end if;
  v_plan:=business_reality_check_plan(p_input->'plan');
 end if;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,137));
 -- Resolve committed requests before rereading sources or comparing revisions.
 select * into receipt from business_reality_check_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'reality check request conflict';end if;return jsonb_build_object('id',receipt.reality_check_id,'revision',receipt.revision);end if;
 select * into r from business_reality_checks where user_id=p_user_id and id=v_id for update;
 if p_operation='save' and v_expected=0 then
  if r.id is not null or exists(select 1 from business_reality_checks where id=v_id) or exists(select 1 from business_reality_check_receipts where reality_check_id=v_id) then raise exception 'reality check unavailable' using errcode='42501';end if;
  select * into s from business_simulations where user_id=p_user_id and id=v_simulation for share;
  if not found or jsonb_array_length(s.turns)<v_round then raise exception 'reality check source unavailable' using errcode='42501';end if;
  perform 1 from business_daily_cases where user_id=p_user_id and id=s.case_id for share;
  if not found or business_simulation_context(p_user_id,s.case_id) is null then raise exception 'reality check source unavailable' using errcode='42501';end if;
  insert into business_reality_checks(id,user_id,case_id,simulation_id,round,source_revision,plan,revision) values(v_id,p_user_id,s.case_id,s.id,v_round,s.revision,v_plan,1);v_revision:=1;
 else
  if r.id is null then raise exception 'reality check unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'reality check revision conflict: 另一页面已经修改，请比较最新内容';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.simulation_id<>v_simulation or r.round<>v_round then raise exception 'reality check source anchor is immutable';end if;
   update business_reality_checks set plan=v_plan,revision=v_revision,updated_at=clock_timestamp() where id=v_id and user_id=p_user_id;
  else delete from business_reality_checks where id=v_id and user_id=p_user_id;end if;
 end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create function public.business_reality_check_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_reality_checks;s business_simulations;v_id uuid;v_case uuid;v_simulation uuid;v_date timestamptz;v_before uuid;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;v_stamp text;begin
 perform business_simulation_service(p_user_id);
 if p_operation in ('get','source') then
  perform business_simulation_keys(p_input,array['id']);v_id:=business_simulation_uuid(p_input->'id');
  if p_operation='get' then select * into r from business_reality_checks where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_reality_check_dto(r);end if;
  select * into s from business_simulations where user_id=p_user_id and id=v_id and jsonb_array_length(turns)>0;if not found then return null;end if;return business_reality_check_source_dto(s,false);
 elsif p_operation='list' then
  perform business_simulation_keys(p_input,'{}',array['caseId','simulationId','before']);if p_input?'simulationId' then v_simulation:=business_simulation_uuid(p_input->'simulationId');end if;
 elsif p_operation='sources' then perform business_simulation_keys(p_input,'{}',array['caseId','before']);
 else raise exception 'invalid reality check read';end if;
 if p_input?'caseId' then v_case:=business_simulation_uuid(p_input->'caseId');end if;
 if p_input?'before' then
  perform business_simulation_keys(p_input->'before',array['date','id']);v_before:=business_simulation_uuid(p_input->'before'->'id');v_stamp:=p_input->'before'->>'date';
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or length(v_stamp)>80 or v_stamp!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid reality check cursor';end if;
  perform business_simulation_date(to_jsonb(left(v_stamp,10)));v_date:=v_stamp::timestamptz;
 end if;
 if p_operation='list' then
  for r in select * from business_reality_checks where user_id=p_user_id and (v_case is null or case_id=v_case) and (v_simulation is null or simulation_id=v_simulation) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_check_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
  end loop;
 else
  for s in select * from business_simulations where user_id=p_user_id and jsonb_array_length(turns)>0 and (v_case is null or case_id=v_case) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_check_source_dto(s,true));v_next:=jsonb_build_object('date',s.created_at,'id',s.id);end if;
  end loop;
 end if;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

alter table public.business_reality_checks enable row level security;
alter table public.business_reality_check_receipts enable row level security;
revoke all on public.business_reality_checks,public.business_reality_check_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_reality_check_plan(jsonb),public.business_reality_check_source_dto(public.business_simulations,boolean),public.business_reality_check_dto(public.business_reality_checks),public.business_reality_check_command(uuid,text,jsonb),public.business_reality_check_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_reality_check_command(uuid,text,jsonb),public.business_reality_check_read(uuid,text,jsonb) to service_role;
commit;
