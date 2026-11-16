begin;
create table public.business_making_practices (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 case_id uuid not null,report_id uuid,apprenticeship_id uuid,plan jsonb not null,result jsonb,result_plan jsonb,result_plan_revision integer,
 revision integer not null check(revision>0),plan_revision integer not null check(plan_revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,id),check((result is null and result_plan is null and result_plan_revision is null) or (result is not null and result_plan is not null and result_plan_revision>0 and result_plan_revision<=plan_revision))
);
create index business_making_practice_order on public.business_making_practices(user_id,created_at desc,id desc);
-- Receipts intentionally retain only identifiers, digests and revisions, including after deletion.
create table public.business_practice_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,input_hash text not null check(input_hash~'^[0-9a-f]{64}$'),
 practice_id uuid not null,revision integer not null,primary key(user_id,request_id)
);
create function public.business_practice_service(p_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if coalesce(auth.role(),'')<>'service_role' or p_owner is null or not exists(select 1 from auth.users where id=p_owner) then raise exception 'practice service owner required' using errcode='42501';end if;
end$$;
create function public.business_practice_keys(p jsonb,required text[],optional text[] default '{}') returns void language plpgsql immutable set search_path=public,pg_temp as $$begin
 if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>60000 or not(p?&required) or exists(select 1 from jsonb_object_keys(p) k where not(k=any(required||optional))) then raise exception 'invalid practice fields';end if;
end$$;
create function public.business_practice_uuid(p jsonb) returns uuid language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or (p#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid practice identifier';end if;return (p#>>'{}')::uuid;
end$$;
create function public.business_practice_text(p jsonb,max_length integer default 3000) returns text language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or length(btrim(p#>>'{}')) not between 1 and max_length then raise exception 'invalid practice text';end if;return btrim(p#>>'{}');
end$$;
create function public.business_practice_integer(p jsonb,minimum integer,maximum integer) returns integer language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'number' or (p#>>'{}')!~'^[0-9]+$' or (p#>>'{}')::numeric not between minimum and maximum then raise exception 'invalid practice integer';end if;return (p#>>'{}')::integer;
end$$;
create function public.business_practice_apprenticeship(p_owner uuid,p_id uuid,p_case uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare r business_research_records;v jsonb;begin
 if not exists(select 1 from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where c.user_id=p_owner and c.id=p_case) then return null;end if;
 select * into r from business_research_records where user_id=p_owner and id=p_id and kind='apprenticeship' and erased_at is null and case_ids?p_case::text;
 if not found then return null;end if;v:=business_research_dto(r);
 if (v->>'invalidated')::boolean or (v->>'experienceInvalidated')::boolean then return null;end if;
 return jsonb_build_object('id',r.id,'title',r.title);
end$$;
create function public.business_practice_context(p_owner uuid,p_case uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('caseId',c.id,'caseTitle',m.name,'reportId',r.id,'reportRevision',r.revision)
 from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id
 left join business_case_revisions r on r.id=c.published_revision_id and r.case_id=c.id and r.user_id=c.user_id and r.erased_at is null
 where c.id=p_case and c.user_id=p_owner
$$;
create function public.business_practice_dto(p business_making_practices) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare c jsonb;a jsonb;v_report integer;begin
 c:=business_practice_context(p.user_id,p.case_id);a:=business_practice_apprenticeship(p.user_id,p.apprenticeship_id,p.case_id);
 if c is not null then select revision into v_report from business_case_revisions where id=p.report_id and user_id=p.user_id and case_id=p.case_id and erased_at is null;end if;
 return jsonb_build_object('id',p.id,'plan',p.plan||jsonb_build_object('caseId',p.case_id,'reportId',p.report_id,'apprenticeshipId',p.apprenticeship_id),
 'result',p.result,'resultPlan',p.result_plan,'resultPlanRevision',p.result_plan_revision,'revision',p.revision,'planRevision',p.plan_revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
 'sources',jsonb_build_object('caseAvailable',c is not null,'caseTitle',c->'caseTitle','reportAvailable',v_report is not null,'reportRevision',v_report,'apprenticeshipAvailable',a is not null,'apprenticeshipTitle',a->'title'));
end$$;
create function public.business_practice_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_hash text;v_expected integer;v_revision integer;v_case uuid;v_report uuid;v_apprentice uuid;v_plan jsonb;v_result jsonb;v_context jsonb;k text;r business_making_practices;receipt business_practice_receipts;begin
 perform business_practice_service(p_user_id);
 if p_operation='plan' then perform business_practice_keys(p_input,array['operation','id','requestId','expectedRevision','plan']);
 elsif p_operation='result' then perform business_practice_keys(p_input,array['operation','id','requestId','expectedRevision','result']);
 elsif p_operation='erase' then perform business_practice_keys(p_input,array['operation','id','requestId','expectedRevision']);
 else raise exception 'invalid practice operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid practice operation';end if;
 v_id:=business_practice_uuid(p_input->'id');v_request:=business_practice_uuid(p_input->'requestId');v_expected:=business_practice_integer(p_input->'expectedRevision',0,2147483646);
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');
 -- Serialize owner commands, including retries, creation, row revisions and deletes.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,126));
 select * into receipt from business_practice_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'practice request conflict';end if;return jsonb_build_object('id',receipt.practice_id,'revision',receipt.revision);end if;
 select * into r from business_making_practices where user_id=p_user_id and id=v_id for update;
 if not found then
  if p_operation<>'plan' or v_expected<>0 or exists(select 1 from business_making_practices where id=v_id) then raise exception 'practice unavailable' using errcode='42501';end if;
 elsif r.revision<>v_expected then raise exception 'practice revision conflict: 请重新读取，保留的文字可再填写';end if;
 v_revision:=coalesce(r.revision,0)+1;
 if p_operation='plan' then
  v_plan:=p_input->'plan';perform business_practice_keys(v_plan,array['caseId','reportId','apprenticeshipId','title','objective','deliverable','checkMethod','plannedMinutes','constraints']);
  v_case:=business_practice_uuid(v_plan->'caseId');
  if v_plan->'reportId'<>'null'::jsonb then v_report:=business_practice_uuid(v_plan->'reportId');end if;
  if v_plan->'apprenticeshipId'<>'null'::jsonb then v_apprentice:=business_practice_uuid(v_plan->'apprenticeshipId');end if;
  foreach k in array array['title','objective','deliverable','checkMethod','constraints'] loop v_plan:=jsonb_set(v_plan,array[k],to_jsonb(business_practice_text(v_plan->k,case when k='title' then 300 else 3000 end)));end loop;
  perform business_practice_integer(v_plan->'plannedMinutes',1,10080);v_plan:=v_plan-array['caseId','reportId','apprenticeshipId'];
  if r.id is null then
   perform 1 from business_daily_cases where user_id=p_user_id and id=v_case for share;v_context:=business_practice_context(p_user_id,v_case);
   if v_context is null or (v_context->>'reportId')::uuid is distinct from v_report then raise exception 'practice source unavailable or report changed; 请重新读取案例';end if;
   if v_report is not null then perform 1 from business_case_revisions where user_id=p_user_id and id=v_report and case_id=v_case and erased_at is null for share;if not found then raise exception 'practice source unavailable';end if;end if;
   if v_apprentice is not null then
    perform 1 from business_research_records where user_id=p_user_id and id=v_apprentice for share;
    if business_practice_apprenticeship(p_user_id,v_apprentice,v_case) is null then raise exception 'practice apprenticeship unavailable';end if;
   end if;
   insert into business_making_practices(id,user_id,case_id,report_id,apprenticeship_id,plan,revision,plan_revision) values(v_id,p_user_id,v_case,v_report,v_apprentice,v_plan,1,1);
  else
   if r.case_id is distinct from v_case or r.report_id is distinct from v_report or r.apprenticeship_id is distinct from v_apprentice then raise exception 'practice source references are frozen; 请复制成新练习';end if;
   update business_making_practices set plan=v_plan,plan_revision=plan_revision+case when plan is distinct from v_plan then 1 else 0 end,revision=v_revision,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
  end if;
 elsif p_operation='result' then
  v_result:=p_input->'result';perform business_practice_keys(v_result,array['artifactDescription','artifactUrl','actualMinutes','obstacle','nextChange']);
  foreach k in array array['artifactDescription','obstacle','nextChange'] loop v_result:=jsonb_set(v_result,array[k],to_jsonb(business_practice_text(v_result->k)));end loop;
  perform business_practice_integer(v_result->'actualMinutes',0,10080);
  if v_result->'artifactUrl'<>'null'::jsonb then
   if jsonb_typeof(v_result->'artifactUrl') is distinct from 'string' or length(v_result->>'artifactUrl')>2000 or (v_result->>'artifactUrl')!~'^https?://[A-Za-z0-9][^[:space:]]*$' then raise exception 'invalid practice artifact URL';end if;
  end if;
  update business_making_practices set result=v_result,result_plan=coalesce(result_plan,plan),result_plan_revision=coalesce(result_plan_revision,plan_revision),revision=v_revision,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
 else delete from business_making_practices where user_id=p_user_id and id=v_id;end if;
 insert into business_practice_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;
create function public.business_practice_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_making_practices;v_id uuid;v_case uuid;v_date timestamptz;v_before uuid;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;row_data record;v jsonb;begin
 perform business_practice_service(p_user_id);
 if p_operation='get' then
  perform business_practice_keys(p_input,array['id']);v_id:=business_practice_uuid(p_input->'id');select * into r from business_making_practices where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_practice_dto(r);
 elsif p_operation='context' then perform business_practice_keys(p_input,array['caseId']);return business_practice_context(p_user_id,business_practice_uuid(p_input->'caseId'));
 elsif p_operation='apprenticeship' then perform business_practice_keys(p_input,array['caseId','id']);return business_practice_apprenticeship(p_user_id,business_practice_uuid(p_input->'id'),business_practice_uuid(p_input->'caseId'));
 elsif p_operation='apprenticeships' then perform business_practice_keys(p_input,array['caseId'],array['before']);v_case:=business_practice_uuid(p_input->'caseId');
 elsif p_operation in ('list','cases') then perform business_practice_keys(p_input,'{}',array['before']);
 else raise exception 'invalid practice read';end if;
 if p_input?'before' then
  perform business_practice_keys(p_input->'before',array['date','id']);v_before:=business_practice_uuid(p_input->'before'->'id');
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or (p_input->'before'->>'date')!~'^\d{4}-\d\d-\d\dT[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid practice cursor';end if;v_date:=(p_input->'before'->>'date')::timestamptz;
 end if;
 if p_operation='list' then
  for r in select * from business_making_practices where user_id=p_user_id and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_practice_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
  end loop;
 elsif p_operation='cases' then
  for row_data in select c.id,c.created_at,c.local_date,m.name from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where c.user_id=p_user_id and (v_before is null or (c.created_at,c.id)<(v_date,v_before)) order by c.created_at desc,c.id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(jsonb_build_object('id',row_data.id,'title',row_data.name,'date',row_data.local_date));v_next:=jsonb_build_object('date',row_data.created_at,'id',row_data.id);end if;
  end loop;
 else
  -- Fetch one bounded page of eligible records; filtering is applied before LIMIT to avoid skipping live records.
  for row_data in select e.id,e.created_at,business_practice_apprenticeship(p_user_id,e.id,v_case) dto from business_research_records e where e.user_id=p_user_id and e.kind='apprenticeship' and e.case_ids?v_case::text and e.erased_at is null and (v_before is null or (e.created_at,e.id)<(v_date,v_before)) and business_practice_apprenticeship(p_user_id,e.id,v_case) is not null order by e.created_at desc,e.id desc limit 21 loop
   v_count:=v_count+1;if v_count<=20 then v:=row_data.dto;v_items:=v_items||jsonb_build_array(v);v_next:=jsonb_build_object('date',row_data.created_at,'id',row_data.id);end if;
  end loop;
 end if;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;
alter table public.business_making_practices enable row level security;
alter table public.business_practice_receipts enable row level security;
revoke all on public.business_making_practices,public.business_practice_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_practice_service(uuid),public.business_practice_keys(jsonb,text[],text[]),public.business_practice_uuid(jsonb),public.business_practice_text(jsonb,integer),public.business_practice_integer(jsonb,integer,integer),public.business_practice_apprenticeship(uuid,uuid,uuid),public.business_practice_context(uuid,uuid),public.business_practice_dto(public.business_making_practices),public.business_practice_command(uuid,text,jsonb),public.business_practice_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_practice_command(uuid,text,jsonb),public.business_practice_read(uuid,text,jsonb) to service_role;
commit;
