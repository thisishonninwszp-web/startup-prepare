begin;
lock table public.business_reality_checks in share row exclusive mode;
alter table public.business_reality_checks add column origin_explanation jsonb;
alter table public.business_reality_checks drop constraint business_reality_check_exact_origin;
alter table public.business_reality_checks add constraint business_reality_check_exact_origin check(
 (origin_explanation is null and origin_result_id is null and simulation_id is not null and round is not null and source_revision is not null)
 or (origin_explanation is null and origin_result_id is not null and simulation_id is null and round is null and source_revision is null)
 or (origin_explanation is not null and jsonb_typeof(origin_explanation)='object' and origin_result_id is null and simulation_id is null and round is null and source_revision is null));
create table public.business_explanation_expectations(
 user_id uuid not null,plan_id uuid not null,revision integer not null,
 expectations jsonb not null check(jsonb_typeof(expectations)='object'),
 primary key(user_id,plan_id,revision),
 foreign key(user_id,plan_id,revision) references public.business_reality_check_versions(user_id,plan_id,revision) on delete cascade
);
alter table public.business_explanation_expectations enable row level security;
revoke all on table public.business_explanation_expectations from public,anon,authenticated,service_role;
create index business_explanation_order on public.business_reality_checks(user_id,created_at desc,id desc) where origin_explanation is not null;

create function public.business_explanation_anchor(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare n integer;k text;begin
 if p->>'kind'='report' then
  perform business_simulation_keys(p,array['kind','reportId','reportRevision','section','index','manifestHash']);perform business_simulation_uuid(p->'reportId');n:=business_simulation_integer(p->'reportRevision',2147483647);if n<1 then raise exception 'invalid explanation revision';end if;
  perform business_simulation_integer(p->'index',99);k:=p->>'section';if k not in('offering','trigger','buyers','volume','journey','value','operations','economics','comparison','failure_conditions','transfer','experiment') or k is null then raise exception 'invalid explanation chapter';end if;perform business_simulation_text(p->'manifestHash',200);
 elsif p->>'kind'='withdrawal' then
  perform business_simulation_keys(p,array['kind','lessonId','lessonRevision']);perform business_simulation_uuid(p->'lessonId');n:=business_simulation_integer(p->'lessonRevision',2147483647);if n<1 then raise exception 'invalid explanation revision';end if;
 else raise exception 'invalid explanation origin';end if;return p;
end$$;
create function public.business_explanation_draft(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb:=p;k text;begin
 perform business_simulation_keys(v,array['question','expectedA','expectedB','uncontrolled','falsifier','method','dueDate']);
 foreach k in array array['question','expectedA','expectedB','falsifier','method'] loop v:=jsonb_set(v,array[k],to_jsonb(business_simulation_text(v->k,case when k='question' then 1000 else 3000 end)));end loop;
 if jsonb_typeof(v->'uncontrolled') is distinct from 'string' or length(v->>'uncontrolled')+length(regexp_replace(v->>'uncontrolled',U&'[\0001-\FFFF]','','g'))>3000 then raise exception 'invalid uncontrolled conditions';end if;
 perform business_simulation_date(v->'dueDate');return v;
end$$;
create function public.business_explanation_expectations(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select expectations from business_explanation_expectations where user_id=p_owner and plan_id=p_plan and revision=p_revision
$$;
create function public.business_explanation_source(p_owner uuid,p_anchor jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb;r business_case_revisions;c jsonb;s jsonb;i jsonb;ref jsonb;material business_material_snapshots;v_refs jsonb:='[]';n integer;begin
 a:=business_explanation_anchor(p_anchor);
 if a->>'kind'='withdrawal' then return business_withdrawal_explanation_source(p_owner,(a->>'lessonId')::uuid,(a->>'lessonRevision')::integer);end if;
 select * into r from business_case_revisions where user_id=p_owner and id=(a->>'reportId')::uuid and revision=(a->>'reportRevision')::integer and input_manifest_hash=a->>'manifestHash' and erased_at is null for share;
 if not found then return null;end if;c:=business_subject_context(p_owner,r.case_id);if c is null then return null;end if;
 select count(*),jsonb_agg(value)->0 into n,s from jsonb_array_elements(r.payload->'sections') where value->>'key'=a->>'section';if n<>1 then return null;end if;
 i:=s->'interpretations'->((a->>'index')::integer);if jsonb_typeof(i) is distinct from 'object' or coalesce(length(i->>'text'),0)=0 or coalesce(length(i->>'competingExplanation'),0)=0 then return null;end if;
 if jsonb_typeof(i->'refs') is distinct from 'array' then return null;end if;
 for ref in select value from jsonb_array_elements(i->'refs') loop
  select * into material from business_material_snapshots where user_id=p_owner and id=(ref->>'snapshotId')::uuid and erased_at is null for share;
  if not found or material.captured_text is null or length(coalesce(ref->>'quote',''))=0 or position(ref->>'quote' in material.captured_text)=0 or not exists(select 1 from business_case_members where user_id=p_owner and case_id=r.case_id and snapshot_id=material.id) then return null;end if;
  v_refs:=v_refs||jsonb_build_array(jsonb_build_object('quote',ref->>'quote','url',material.source_url));
 end loop;
 return jsonb_build_object('caseId',r.case_id,'title',c->'caseTitle','explanationA',i->'text','explanationB',i->'competingExplanation','distinguishingObservation',coalesce(i->'distinguishingObservation','""'::jsonb),'refs',v_refs,'anchor',a);
end$$;
create function public.business_explanation_dto(p business_reality_checks,p_revision integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v business_reality_check_versions;e jsonb;begin
 select * into v from business_reality_check_versions where user_id=p.user_id and plan_id=p.id and revision=p_revision;
 e:=business_explanation_expectations(p.user_id,p.id,p_revision);if v.plan_id is null or e is null or p.origin_explanation is null then return null;end if;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'anchor',p.origin_explanation,'draft',v.plan||e,'revision',v.revision,'createdAt',p.created_at,'updatedAt',v.saved_at,'source',business_explanation_source(p.user_id,p.origin_explanation));
end$$;
create function public.business_explanation_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_anchor jsonb;v_draft jsonb;v_source jsonb;v_hash text;r business_reality_checks;receipt business_reality_check_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>90000 then raise exception 'invalid explanation input';end if;
 if p_operation='save' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','anchor','draft','confirmed']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);else raise exception 'invalid explanation operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid explanation operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');v_expected:=business_simulation_integer(p_input->'expectedRevision',2147483646);if p_operation='erase' and v_expected<1 then raise exception 'invalid explanation revision';end if;
 if p_operation='save' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'explicit explanation preview confirmation required';end if;v_anchor:=business_explanation_anchor(p_input->'anchor');v_draft:=business_explanation_draft(p_input->'draft');
 end if;
 v_hash:=encode(sha256(convert_to('explanation:'||p_operation||':'||p_input::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,137));
 select * into receipt from business_reality_check_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'explanation request conflict';end if;return jsonb_build_object('id',receipt.reality_check_id,'revision',receipt.revision);end if;
 select * into r from business_reality_checks where user_id=p_user_id and id=v_id for update;
 if p_operation='save' and v_expected=0 then
  if r.id is not null or exists(select 1 from business_reality_checks where id=v_id) or exists(select 1 from business_reality_check_receipts where reality_check_id=v_id) then raise exception 'explanation unavailable' using errcode='42501';end if;
  v_source:=business_explanation_source(p_user_id,v_anchor);if v_source is null then raise exception 'explanation source unavailable' using errcode='42501';end if;
  insert into business_reality_checks(id,user_id,case_id,origin_explanation,plan,revision) values(v_id,p_user_id,(v_source->>'caseId')::uuid,v_anchor,v_draft-'expectedA'-'expectedB'-'uncontrolled',1);v_revision:=1;
 else
  if r.id is null or r.origin_explanation is null then raise exception 'explanation unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'explanation revision conflict: 另一页面已经修改，请重新核对';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.origin_explanation<>v_anchor then raise exception 'explanation anchor is immutable';end if;
   update business_reality_checks set plan=v_draft-'expectedA'-'expectedB'-'uncontrolled',revision=v_revision,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
  else delete from business_reality_checks where user_id=p_user_id and id=v_id;end if;
 end if;
 if p_operation='save' then insert into business_explanation_expectations(user_id,plan_id,revision,expectations) values(p_user_id,v_id,v_revision,v_draft-'question'-'falsifier'-'method'-'dueDate');end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;
create function public.business_explanation_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_reality_checks;v_id uuid;v_case uuid;v_revision integer;v_date timestamptz;v_stamp text;v_count integer:=0;v_items jsonb:='[]';v_next jsonb;begin
 perform business_simulation_service(p_user_id);
 if p_operation='source' then perform business_simulation_keys(p_input,array['anchor']);return business_explanation_source(p_user_id,p_input->'anchor');end if;
 if p_operation='get' then
  perform business_simulation_keys(p_input,array['id'],array['revision']);v_id:=business_simulation_uuid(p_input->'id');select * into r from business_reality_checks where user_id=p_user_id and id=v_id and origin_explanation is not null;if not found then return null;end if;
  v_revision:=r.revision;if p_input?'revision' then v_revision:=business_simulation_integer(p_input->'revision',2147483647);if v_revision<1 then raise exception 'invalid explanation version';end if;end if;return business_explanation_dto(r,v_revision);
 elsif p_operation<>'list' or p_operation is null then raise exception 'invalid explanation read';end if;
 perform business_simulation_keys(p_input,'{}',array['caseId','before']);if p_input?'caseId' then v_case:=business_simulation_uuid(p_input->'caseId');end if;
 if p_input?'before' then
  perform business_simulation_keys(p_input->'before',array['date','id']);v_id:=business_simulation_uuid(p_input->'before'->'id');v_stamp:=p_input->'before'->>'date';
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or length(v_stamp)>80 or v_stamp!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid explanation cursor';end if;perform business_simulation_date(to_jsonb(left(v_stamp,10)));v_date:=v_stamp::timestamptz;
 end if;
 for r in select * from business_reality_checks where user_id=p_user_id and origin_explanation is not null and (v_case is null or case_id=v_case) and (v_id is null or (created_at,id)<(v_date,v_id)) order by created_at desc,id desc limit 21 loop
  v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_explanation_dto(r,r.revision));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
 end loop;return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

-- Keep legacy simulation endpoints isolated from every other origin.
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
  if r.id is null or r.simulation_id is null then raise exception 'reality check unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'reality check revision conflict: 另一页面已经修改，请比较最新内容';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.simulation_id<>v_simulation or r.round<>v_round then raise exception 'reality check source anchor is immutable';end if;
   update business_reality_checks set plan=v_plan,revision=v_revision,updated_at=clock_timestamp() where id=v_id and user_id=p_user_id;
  else delete from business_reality_checks where id=v_id and user_id=p_user_id;end if;
 end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

-- Keep legacy simulation endpoints isolated from every other origin.
create or replace function public.business_reality_check_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_reality_checks;s business_simulations;v_id uuid;v_case uuid;v_simulation uuid;v_date timestamptz;v_before uuid;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;v_stamp text;begin
 perform business_simulation_service(p_user_id);
 if p_operation in ('get','source') then
  perform business_simulation_keys(p_input,array['id']);v_id:=business_simulation_uuid(p_input->'id');
  if p_operation='get' then select * into r from business_reality_checks where user_id=p_user_id and id=v_id and simulation_id is not null;if not found then return null;end if;return business_reality_check_dto(r);end if;
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
  for r in select * from business_reality_checks where user_id=p_user_id and simulation_id is not null and (v_case is null or case_id=v_case) and (v_simulation is null or simulation_id=v_simulation) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_check_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
  end loop;
 else
  for s in select * from business_simulations where user_id=p_user_id and jsonb_array_length(turns)>0 and (v_case is null or case_id=v_case) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_reality_check_source_dto(s,true));v_next:=jsonb_build_object('date',s.created_at,'id',s.id);end if;
  end loop;
 end if;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

create or replace function public.business_reality_result_plan_dto(p business_reality_checks) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;begin
 c:=business_subject_context(p.user_id,p.case_id);
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'question',p.plan->'question','revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'caseAvailable',c is not null,'caseTitle',c->'caseTitle');
end$$;

create or replace function public.business_reality_result_version_dto(p business_reality_check_versions) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;current_revision integer;begin
 select revision into current_revision from business_reality_checks where user_id=p.user_id and id=p.plan_id;
 c:=business_subject_context(p.user_id,p.case_id);
 return jsonb_build_object('planId',p.plan_id,'caseId',p.case_id,'revision',p.revision,'plan',p.plan,'savedAt',p.saved_at,'currentRevision',current_revision,'caseAvailable',c is not null,'caseTitle',c->'caseTitle')||case when business_explanation_expectations(p.user_id,p.plan_id,p.revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p.user_id,p.plan_id,p.revision)) end;
end$$;

create or replace function public.business_reality_result_dto(p business_reality_results) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare current_revision integer;begin
 select revision into current_revision from business_reality_checks where user_id=p.user_id and id=p.plan_id;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'planId',p.plan_id,'planRevision',p.plan_revision,'planSavedAt',p.plan_saved_at,'planSnapshot',p.plan_snapshot,'snapshotErasedAt',p.snapshot_erased_at,'body',p.body,'createdAt',p.created_at,'revision',1,'planCurrentRevision',current_revision)||case when business_explanation_expectations(p.user_id,p.plan_id,p.plan_revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p.user_id,p.plan_id,p.plan_revision)) end;
end$$;

create or replace function public.business_confirmation_history_nodes(p_owner uuid,p_case uuid)
returns table(kind text,id uuid,case_id uuid,revision integer,at timestamptz,node jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select 'plan'::text,v.plan_id,v.case_id,v.revision,v.saved_at,
  jsonb_build_object('kind','plan','id',v.plan_id,'caseId',v.case_id,'revision',v.revision,'at',v.saved_at,
   'parent',case when p.origin_explanation is not null then jsonb_build_object('kind','explanation','id',p.id,'revision',v.revision,'available',true) when p.origin_result_id is not null then
    jsonb_build_object('kind','result','id',p.origin_result_id,'revision',1,'available',exists(select 1 from business_reality_results r where r.user_id=p_owner and r.id=p.origin_result_id and r.case_id=v.case_id))
   else jsonb_build_object('kind','simulation','id',p.simulation_id,'revision',p.source_revision,'available',exists(select 1 from business_simulations s where s.user_id=p_owner and s.id=p.simulation_id and s.case_id=v.case_id and s.revision>=p.source_revision and jsonb_array_length(s.turns)>=p.round)) end,
   'plan',business_reality_check_plan(v.plan),'body',null,'planSnapshot',null,'planSavedAt',null,'snapshotErasedAt',null)||case when business_explanation_expectations(p_owner,v.plan_id,v.revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p_owner,v.plan_id,v.revision)) end
 from business_reality_check_versions v join business_reality_checks p on p.user_id=v.user_id and p.id=v.plan_id and p.case_id=v.case_id and p.revision>=v.revision
 where v.user_id=p_owner and (p_case is null or v.case_id=p_case)
 union all
 select 'result'::text,r.id,r.case_id,1,r.created_at,
  jsonb_build_object('kind','result','id',r.id,'caseId',r.case_id,'revision',1,'at',r.created_at,
   'parent',jsonb_build_object('kind','plan','id',r.plan_id,'revision',r.plan_revision,'available',exists(select 1 from business_reality_check_versions v join business_reality_checks p on p.user_id=v.user_id and p.id=v.plan_id and p.case_id=v.case_id where v.user_id=p_owner and v.plan_id=r.plan_id and v.revision=r.plan_revision and v.case_id=r.case_id)),
   'plan',null,'body',business_reality_result_body(r.body),'planSnapshot',case when r.plan_snapshot is null then null else business_reality_check_plan(r.plan_snapshot) end,'planSavedAt',r.plan_saved_at,'snapshotErasedAt',r.snapshot_erased_at)||case when business_explanation_expectations(p_owner,r.plan_id,r.plan_revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p_owner,r.plan_id,r.plan_revision)) end
 from business_reality_results r where r.user_id=p_owner and (p_case is null or r.case_id=p_case)
$$;

revoke all on function public.business_explanation_anchor(jsonb),public.business_explanation_draft(jsonb),public.business_explanation_expectations(uuid,uuid,integer),public.business_explanation_source(uuid,jsonb),public.business_explanation_dto(business_reality_checks,integer),public.business_explanation_command(uuid,text,jsonb),public.business_explanation_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_explanation_command(uuid,text,jsonb),public.business_explanation_read(uuid,text,jsonb) to service_role;
commit;
