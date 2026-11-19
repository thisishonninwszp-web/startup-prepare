begin;
-- Both authoring workflows share137 receipts and139 version capture, but retain
-- exactly one origin. Source-result metadata survives erasure without copied prose.
lock table public.business_reality_checks in share row exclusive mode;
alter table public.business_reality_checks
 alter column simulation_id drop not null,
 alter column round drop not null,
 alter column source_revision drop not null,
 add column origin_result_id uuid,
 add constraint business_reality_check_exact_origin check(
  (origin_result_id is null and simulation_id is not null and round is not null and source_revision is not null)
  or (origin_result_id is not null and simulation_id is null and round is null and source_revision is null)
 );
create index business_followup_check_result_order on public.business_reality_checks(user_id,origin_result_id,created_at desc,id desc) where origin_result_id is not null;

create function public.business_followup_check_source_dto(p business_reality_results) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p.id,'caseId',p.case_id,'body',p.body,'createdAt',p.created_at)
$$;
create function public.business_followup_check_dto(p business_reality_checks) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s business_reality_results;v_source jsonb;begin
 select * into s from business_reality_results where user_id=p.user_id and id=p.origin_result_id and case_id=p.case_id;
 if found then v_source:=business_followup_check_source_dto(s);end if;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'resultId',p.origin_result_id,'plan',p.plan,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'source',v_source);
end$$;

create function public.business_followup_check_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_result uuid;v_plan jsonb;v_hash text;r business_reality_checks;s business_reality_results;receipt business_reality_check_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_operation='save' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','resultId','plan','confirmed']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);
 else raise exception 'invalid followup check operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid followup check operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');v_expected:=business_simulation_integer(p_input->'expectedRevision',2147483646)::integer;
 if p_operation='erase' and v_expected=0 then raise exception 'invalid followup check revision';end if;
 if p_operation='save' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'followup check confirmation required';end if;
  v_result:=business_simulation_uuid(p_input->'resultId');v_plan:=business_reality_check_plan(p_input->'plan');
 end if;
 -- The workflow tag prevents identical erase JSON from replaying through137.
 v_hash:=encode(sha256(convert_to('followup:'||p_operation||':'||p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,137));
 select * into receipt from business_reality_check_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'followup check request conflict';end if;return jsonb_build_object('id',receipt.reality_check_id,'revision',receipt.revision);end if;
 select * into r from business_reality_checks where user_id=p_user_id and id=v_id for update;
 if p_operation='save' and v_expected=0 then
  if r.id is not null or exists(select 1 from business_reality_checks where id=v_id) or exists(select 1 from business_reality_check_receipts where reality_check_id=v_id) then raise exception 'followup check unavailable' using errcode='42501';end if;
  -- Serialize against139 result erasure; neither the old plan nor case is required.
  select * into s from business_reality_results where user_id=p_user_id and id=v_result for share;
  if not found then raise exception 'followup check source unavailable' using errcode='42501';end if;
  insert into business_reality_checks(id,user_id,case_id,origin_result_id,plan,revision) values(v_id,p_user_id,s.case_id,s.id,v_plan,1);v_revision:=1;
 else
  if r.id is null or r.origin_result_id is null then raise exception 'followup check unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'followup check revision conflict: 另一页面已经修改，请比较最新内容';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.origin_result_id<>v_result then raise exception 'followup check source anchor is immutable';end if;
   update business_reality_checks set plan=v_plan,revision=v_revision,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
  else delete from business_reality_checks where user_id=p_user_id and id=v_id;end if;
 end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create function public.business_followup_check_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_reality_checks;s business_reality_results;v_id uuid;v_case uuid;v_result uuid;v_date timestamptz;v_before uuid;v_stamp text;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;begin
 perform business_simulation_service(p_user_id);
 if p_operation in ('get','source') then
  perform business_simulation_keys(p_input,array['id']);v_id:=business_simulation_uuid(p_input->'id');
  if p_operation='get' then select * into r from business_reality_checks where user_id=p_user_id and id=v_id and origin_result_id is not null;if not found then return null;end if;return business_followup_check_dto(r);end if;
  select * into s from business_reality_results where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_followup_check_source_dto(s);
 elsif p_operation='list' then perform business_simulation_keys(p_input,'{}',array['caseId','resultId','before']);
 else raise exception 'invalid followup check read';end if;
 if p_input?'caseId' then v_case:=business_simulation_uuid(p_input->'caseId');end if;
 if p_input?'resultId' then v_result:=business_simulation_uuid(p_input->'resultId');end if;
 if p_input?'before' then
  perform business_simulation_keys(p_input->'before',array['date','id']);v_before:=business_simulation_uuid(p_input->'before'->'id');v_stamp:=p_input->'before'->>'date';
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or length(v_stamp)>80 or v_stamp!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid followup check cursor';end if;
  perform business_simulation_date(to_jsonb(left(v_stamp,10)));v_date:=v_stamp::timestamptz;
 end if;
 for r in select * from business_reality_checks where user_id=p_user_id and origin_result_id is not null and (v_case is null or case_id=v_case) and (v_result is null or origin_result_id=v_result) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
  v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_followup_check_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
 end loop;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

-- Preserve137 strict simulation DTOs and reject result-origin IDs in its commands.
create or replace function public.business_reality_check_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
  if r.id is null or r.origin_result_id is not null then raise exception 'reality check unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'reality check revision conflict: 另一页面已经修改，请比较最新内容';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.simulation_id<>v_simulation or r.round<>v_round then raise exception 'reality check source anchor is immutable';end if;
   update business_reality_checks set plan=v_plan,revision=v_revision,updated_at=clock_timestamp() where id=v_id and user_id=p_user_id;
  else delete from business_reality_checks where id=v_id and user_id=p_user_id;end if;
 end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create or replace function public.business_reality_check_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_reality_checks;s business_simulations;v_id uuid;v_case uuid;v_simulation uuid;v_date timestamptz;v_before uuid;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;v_stamp text;begin
 perform business_simulation_service(p_user_id);
 if p_operation in ('get','source') then
  perform business_simulation_keys(p_input,array['id']);v_id:=business_simulation_uuid(p_input->'id');
  if p_operation='get' then select * into r from business_reality_checks where user_id=p_user_id and id=v_id and origin_result_id is null;if not found then return null;end if;return business_reality_check_dto(r);end if;
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
  for r in select * from business_reality_checks where user_id=p_user_id and origin_result_id is null and (v_case is null or case_id=v_case) and (v_simulation is null or simulation_id=v_simulation) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_check_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
  end loop;
 else
  for s in select * from business_simulations where user_id=p_user_id and jsonb_array_length(turns)>0 and (v_case is null or case_id=v_case) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_check_source_dto(s,true));v_next:=jsonb_build_object('date',s.created_at,'id',s.id);end if;
  end loop;
 end if;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

revoke all on function public.business_followup_check_source_dto(public.business_reality_results),public.business_followup_check_dto(public.business_reality_checks),public.business_followup_check_command(uuid,text,jsonb),public.business_followup_check_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_followup_check_command(uuid,text,jsonb),public.business_followup_check_read(uuid,text,jsonb) to service_role;
commit;
