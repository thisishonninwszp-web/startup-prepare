begin;
-- Independent methods live in the existing append-only learning store. Only origin identifiers survive erasure.
create table public.business_result_method_origins(
 user_id uuid not null references auth.users(id),entry_id uuid primary key,result_id uuid not null,parent_method_id uuid,erased_at timestamptz,
 foreign key(user_id,entry_id) references public.business_learning_entries(user_id,id),
 foreign key(user_id,parent_method_id) references public.business_learning_entries(user_id,id),unique(user_id,entry_id)
);
create index business_result_method_origin_result on public.business_result_method_origins(user_id,result_id,entry_id);
alter table public.business_result_method_origins enable row level security;
revoke all on public.business_result_method_origins from public,anon,authenticated,service_role;

create function public.business_result_method_source(p_owner uuid,p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'caseId',r.case_id,'body',r.body,'createdAt',r.created_at) from business_reality_results r where r.user_id=p_owner and r.id=p_id
$$;
create function public.business_result_method_dto(p_owner uuid,p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'caseId',e.case_id,'resultId',o.result_id,'parentMethodId',o.parent_method_id,'draft',e.payload-array['source','resultId','parentMethodId','confirmed'],'createdAt',e.created_at,'source',business_result_method_source(p_owner,o.result_id))
 from business_result_method_origins o join business_learning_entries e on e.user_id=o.user_id and e.id=o.entry_id and e.operation='method' where o.user_id=p_owner and o.entry_id=p_id and o.erased_at is null
$$;
create function public.business_result_method_insert(p_owner uuid,p_id uuid,p_result uuid,p_case uuid,p_parent uuid,p_draft jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform business_counterexample_draft(p_draft);
 if not exists(select 1 from business_daily_cases where user_id=p_owner and id=p_case for key share) then raise exception 'method case owner unavailable' using errcode='42501';end if;
 if exists(select 1 from business_learning_entries where id=p_id) or exists(select 1 from business_result_method_origins where entry_id=p_id) then raise exception 'method identifier unavailable';end if;
 insert into business_learning_entries(id,user_id,case_id,operation,payload,report_id) values(p_id,p_owner,p_case,'method',p_draft||jsonb_build_object('source','reality_result','resultId',p_result,'parentMethodId',p_parent,'confirmed',true),null);
 insert into business_result_method_origins(user_id,entry_id,result_id,parent_method_id) values(p_owner,p_id,p_result,p_parent);
 return p_id;
end$$;
create function public.business_result_method_adopt(p_owner uuid,p_parent uuid,p_request uuid,p_draft jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o business_result_method_origins;e business_learning_entries;r business_learning_receipts;v_id uuid;v_hash text;begin
 perform business_service(p_owner);perform business_counterexample_draft(p_draft);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,719));perform pg_advisory_xact_lock(hashtextextended(p_owner::text,720));perform pg_advisory_xact_lock(hashtextextended(p_owner::text,721));perform pg_advisory_xact_lock(hashtextextended(p_owner::text,722));
 v_hash:='result-method:adopt:'||encode(sha256(convert_to(jsonb_build_object('parent',p_parent,'requestId',p_request,'draft',p_draft)::text,'UTF8')),'hex');
 select * into r from business_learning_receipts where user_id=p_owner and request_id=p_request;
 if found then if r.input_hash is distinct from v_hash then raise exception 'result method request conflict';end if;return jsonb_build_object('id',r.entry_id);end if;
 select * into o from business_result_method_origins where user_id=p_owner and entry_id=p_parent and erased_at is null for share;if not found then raise exception 'method parent unavailable';end if;
 select * into e from business_learning_entries where user_id=p_owner and id=p_parent and operation='method';if not found then raise exception 'method parent unavailable';end if;
 v_id:=business_result_method_insert(p_owner,gen_random_uuid(),o.result_id,e.case_id,p_parent,p_draft);
 insert into business_learning_receipts(user_id,request_id,input_hash,entry_id) values(p_owner,p_request,v_hash,v_id);
 return jsonb_build_object('id',v_id);
end$$;
create or replace function public.business_learning_entry_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='UPDATE' and coalesce(auth.role(),'')='service_role' and current_setting('business.learning_erase',true)=old.user_id::text and old.operation='followup'
 and new.payload=old.payload||jsonb_build_object('quote','') and new.payload->>'quote'='' and
 (to_jsonb(new)-'payload')=(to_jsonb(old)-'payload') then return new;end if;
 if tg_op='UPDATE' and coalesce(auth.role(),'')='service_role' and current_setting('business.result_method_erase',true)=old.user_id::text and old.operation='method'
 and exists(select 1 from business_result_method_origins o where o.user_id=old.user_id and o.entry_id=old.id and o.erased_at is null
 and old.report_id is null and old.payload->>'source'='reality_result' and old.payload->>'resultId'=o.result_id::text and old.payload->'parentMethodId'=coalesce(to_jsonb(o.parent_method_id),'null'::jsonb))
 and new.payload=(old.payload-array['method','scenario','conditions','failureConditions','unknowns'])||jsonb_build_object('erased',true)
 and new.payload=jsonb_build_object('source','reality_result','resultId',old.payload->'resultId','parentMethodId',old.payload->'parentMethodId','confirmed',true,'erased',true)
 and (to_jsonb(new)-'payload')=(to_jsonb(old)-'payload') then return new;end if;
 raise exception 'business learning history is immutable';
end$$;

create function public.business_result_method_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_result uuid;v_hash text;v_tag text;r business_learning_receipts;s business_reality_results;o business_result_method_origins;begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>100000 or p_operation is null or p_operation not in('append','erase') or p_input->>'operation' is distinct from p_operation then raise exception 'invalid result method command';end if;
 perform business_simulation_keys(p_input,case p_operation when 'append' then array['operation','id','requestId','resultId','draft','confirmed'] else array['operation','id','requestId','expectedRevision'] end);
 v_id:=business_counterexample_uuid(p_input,'id');v_request:=business_counterexample_uuid(p_input,'requestId');
 if p_operation='append' then v_result:=business_counterexample_uuid(p_input,'resultId');perform business_counterexample_draft(p_input->'draft');if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'method explicit confirmation required';end if;
 else if p_input->'expectedRevision' is distinct from '1'::jsonb then raise exception 'invalid result method revision';end if;end if;
 v_tag:='result-method:'||p_operation||':';v_hash:=v_tag||encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,722));
 select * into r from business_learning_receipts where user_id=p_user_id and request_id=v_request;
 if found then if r.input_hash is distinct from v_hash or r.entry_id<>v_id then raise exception 'result method request conflict';end if;return jsonb_build_object('id',v_id,'revision',case p_operation when 'append' then 1 else 2 end);end if;
 if p_operation='append' then
  if exists(select 1 from business_learning_entries where id=v_id) or exists(select 1 from business_result_method_origins where entry_id=v_id) then raise exception 'method identifier unavailable';end if;
  select * into s from business_reality_results where user_id=p_user_id and id=v_result for share;if not found then raise exception 'method source unavailable';end if;
  perform business_result_method_insert(p_user_id,v_id,v_result,s.case_id,null,p_input->'draft');
 else
  select * into o from business_result_method_origins where user_id=p_user_id and entry_id=v_id and erased_at is null for update;if not found then raise exception 'method unavailable';end if;
  perform set_config('business.result_method_erase',p_user_id::text,true);
  update business_learning_entries set payload=(payload-array['method','scenario','conditions','failureConditions','unknowns'])||jsonb_build_object('erased',true) where user_id=p_user_id and id=v_id;
  perform set_config('business.result_method_erase','',true);
  update business_result_method_origins set erased_at=clock_timestamp() where user_id=p_user_id and entry_id=v_id;
 end if;
 insert into business_learning_receipts(user_id,request_id,input_hash,entry_id) values(p_user_id,v_request,v_hash,v_id);
 return jsonb_build_object('id',v_id,'revision',case p_operation when 'append' then 1 else 2 end);
end$$;
create function public.business_result_method_read(p_user_id uuid,p_operation text,p_input jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_case uuid;v_result uuid;v_before uuid;v_date timestamptz;v_stamp text;v_items jsonb:='[]';v_next jsonb;v_count integer:=0;e business_learning_entries;begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2000 or p_operation is null or p_operation not in('list','get','source') then raise exception 'invalid result method read';end if;
 if p_operation in('get','source') then perform business_simulation_keys(p_input,array['id']);v_id:=business_counterexample_uuid(p_input,'id');if p_operation='get' then return business_result_method_dto(p_user_id,v_id);else return business_result_method_source(p_user_id,v_id);end if;end if;
 perform business_simulation_keys(p_input,'{}',array['caseId','resultId','before']);
 if p_input?'caseId' then v_case:=business_counterexample_uuid(p_input,'caseId');end if;if p_input?'resultId' then v_result:=business_counterexample_uuid(p_input,'resultId');end if;
 if p_input?'before' then
  perform business_simulation_keys(p_input->'before',array['date','id']);v_before:=business_counterexample_uuid(p_input->'before','id');v_stamp:=p_input->'before'->>'date';
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or length(v_stamp)>80 or v_stamp!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid method cursor';end if;
  perform business_simulation_date(to_jsonb(left(v_stamp,10)));v_date:=v_stamp::timestamptz;
 end if;
 for e in select entries.* from business_learning_entries entries join business_result_method_origins o on o.user_id=entries.user_id and o.entry_id=entries.id and o.erased_at is null where entries.user_id=p_user_id and (v_case is null or entries.case_id=v_case) and (v_result is null or o.result_id=v_result) and (v_before is null or (entries.created_at,entries.id)<(v_date,v_before)) order by entries.created_at desc,entries.id desc limit 21 loop
  v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_result_method_dto(p_user_id,e.id));v_next:=jsonb_build_object('date',e.created_at,'id',e.id);end if;
 end loop;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

create or replace function public.business_method_rows(p_user_id uuid) returns table(id uuid,created_at timestamptz,item jsonb) language sql stable security definer set search_path=public,pg_temp as $$
 select e.id,e.created_at,business_learning_dto(e) from business_learning_entries e where e.user_id=p_user_id and e.operation='method' and not exists(select 1 from business_result_method_origins o where o.user_id=e.user_id and o.entry_id=e.id and o.erased_at is not null)
 union all
 select l.id,l.created_at,jsonb_build_object('id',l.id,'operation','method','caseId',l.case_id,'createdAt',l.created_at,'payload',l.payload||jsonb_build_object('source','confirmed_lesson'),
 'sourceInvalidated',r.erased_at is not null,'reviewNeeded',exists(select 1 from business_learning_report_reviews review where review.user_id=l.user_id and review.report_id=l.report_id)) from business_case_lessons l join business_case_revisions r on r.user_id=l.user_id and r.id=l.report_id where l.user_id=p_user_id
$$;
create or replace function public.business_counterexample_methods(p_owner uuid) returns table(id uuid,kind text,created_at timestamptz,item jsonb) language sql stable security definer set search_path=public,pg_temp as $$
 with source as (
 select rows.id,rows.created_at,rows.item,e.report_id,'learning'::text kind from business_method_rows(p_owner) rows join business_learning_entries e on e.user_id=p_owner and e.id=rows.id and e.operation='method' where e.payload->'confirmed'='true'::jsonb and rows.item->'payload'->>'source' is distinct from 'confirmed_lesson'
 union all
 select rows.id,rows.created_at,rows.item,l.report_id,'lesson'::text kind from business_method_rows(p_owner) rows join business_case_lessons l on l.user_id=p_owner and l.id=rows.id where rows.item->'payload'->>'source'='confirmed_lesson'
 )
 select source.id,source.kind,source.created_at,jsonb_build_object('id',source.id,'kind',source.kind,'caseId',source.item->>'caseId','reportId',source.report_id,
 'baselineHash',md5(jsonb_build_object('kind',source.kind,'payload',source.item->'payload','reportId',source.report_id)::text),
 'draft',jsonb_build_object('method',source.item->'payload'->>'method','scenario',coalesce(nullif(source.item->'payload'->>'scenario',''),'未记录'),'conditions',source.item->'payload'->>'conditions','failureConditions',coalesce(nullif(source.item->'payload'->>'failureConditions',''),'未记录'),'unknowns',source.item->'payload'->>'unknowns'))
 from source where source.item->'sourceInvalidated'='false'::jsonb and business_counterexample_report_readable(p_owner,source.report_id,(source.item->>'caseId')::uuid)
 union all
 select e.id,'learning'::text,e.created_at,jsonb_build_object('id',e.id,'kind','learning','caseId',e.case_id,'reportId',null,
 'baselineHash',md5(jsonb_build_object('kind','learning','payload',e.payload,'reportId',null)::text),
 'draft',e.payload-array['source','resultId','parentMethodId','confirmed'])
 from business_result_method_origins o join business_learning_entries e on e.user_id=o.user_id and e.id=o.entry_id and e.operation='method' and e.report_id is null
 where o.user_id=p_owner and o.erased_at is null
$$;
create or replace function public.business_counterexample_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_revision integer;v_hash text;v_keys text[];v_study jsonb;k text;s business_method_counterexamples;r business_counterexample_receipts;v_method jsonb;v_result jsonb;v_method_id uuid;begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>200000 or p_operation is null or p_operation not in('save','delete','adopt') or p_input->>'operation' is distinct from p_operation then raise exception 'invalid counterexample operation';end if;
 v_id:=business_counterexample_uuid(p_input,'id');v_request:=business_counterexample_uuid(p_input,'requestId');v_hash:=md5(p_input::text);
 if jsonb_typeof(p_input->'expectedRevision') is distinct from 'number' or (p_input->>'expectedRevision') !~ '^[0-9]+$' or (p_input->>'expectedRevision')::numeric>2147483646 then raise exception 'invalid counterexample revision';end if;v_revision:=(p_input->>'expectedRevision')::integer;
 v_keys:=array['operation','id','requestId','expectedRevision']||case p_operation when 'save' then array['study'] when 'adopt' then array['confirmed','preview'] else array[]::text[] end;
 if exists(select 1 from jsonb_object_keys(p_input) key where key<>all(v_keys)) then raise exception 'unsupported counterexample command field';end if;
 -- Same lock ordering as the existing learning/erase commands, followed by this module's owner lock.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,722));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,729));
 select * into r from business_counterexample_receipts where user_id=p_user_id and request_id=v_request;
 if found then if r.input_hash is distinct from v_hash then raise exception 'counterexample request conflict';end if;return jsonb_build_object('id',r.study_id,'revision',r.revision,'methodId',r.method_id);end if;
 select * into s from business_method_counterexamples where user_id=p_user_id and id=v_id for update;
 if coalesce(s.revision,0)<>v_revision then raise exception 'counterexample revision conflict';end if;
 if p_operation='save' then
  v_study:=p_input->'study';
  if jsonb_typeof(v_study) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_study))<>8 or exists(select 1 from jsonb_object_keys(v_study) key where key<>all(array['methodId','methodKind','baselineHash','candidateCaseId','explanation','conditionDifferences','checkNext','revisedMethodDraft'])) then raise exception 'invalid study fields';end if;
  perform business_counterexample_uuid(v_study,'methodId');perform business_counterexample_uuid(v_study,'candidateCaseId');
  if coalesce(v_study->>'methodKind','') not in('learning','lesson') or jsonb_typeof(v_study->'baselineHash') is distinct from 'string' or (v_study->>'baselineHash') !~ '^[a-f0-9]{32}$' then raise exception 'invalid method reference';end if;
  foreach k in array array['explanation','conditionDifferences','checkNext'] loop perform business_counterexample_text(v_study,k);end loop;perform business_counterexample_draft(v_study->'revisedMethodDraft');
  if s.id is not null and (s.study->'methodId' is distinct from v_study->'methodId' or s.study->'methodKind' is distinct from v_study->'methodKind' or s.study->'baselineHash' is distinct from v_study->'baselineHash' or s.study->'candidateCaseId' is distinct from v_study->'candidateCaseId') then raise exception 'historical source selection cannot rebase; create a new study';end if;
  if s.id is null then
   if exists(select 1 from business_counterexample_receipts where user_id=p_user_id and study_id=v_id) then raise exception 'counterexample identifier already deleted; create a new identifier';end if;
   select item into v_method from business_counterexample_methods(p_user_id) where id=(v_study->>'methodId')::uuid and kind=v_study->>'methodKind' and item->>'baselineHash'=v_study->>'baselineHash';
   if v_method is null or business_counterexample_case(p_user_id,(v_study->>'candidateCaseId')::uuid) is null then raise exception 'source unavailable or changed';end if;
   insert into business_method_counterexamples(id,user_id,revision,study) values(v_id,p_user_id,1,v_study);
  else update business_method_counterexamples set study=v_study,revision=revision+1,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;end if;
  v_method_id:=s.adopted_method_id;
 elsif p_operation='delete' then
  if s.id is null then raise exception 'counterexample unavailable';end if;
  v_method_id:=s.adopted_method_id;delete from business_method_counterexamples where user_id=p_user_id and id=v_id;
 else
  if s.id is null then raise exception 'counterexample unavailable';end if;
  if s.adopted_method_id is not null then raise exception 'study already adopted';end if;
  perform business_counterexample_draft(p_input->'preview');
  if p_input->'confirmed' is distinct from 'true'::jsonb or p_input->'preview' is distinct from s.study->'revisedMethodDraft' then raise exception 'explicit confirmation of full current preview required';end if;
  select item into v_method from business_counterexample_methods(p_user_id) where id=(s.study->>'methodId')::uuid and kind=s.study->>'methodKind' and item->>'baselineHash'=s.study->>'baselineHash';
  if v_method is null or business_counterexample_case(p_user_id,(s.study->>'candidateCaseId')::uuid) is null then raise exception 'source unavailable or changed';end if;
  if v_method->'reportId'='null'::jsonb then
   v_result:=business_result_method_adopt(p_user_id,(v_method->>'id')::uuid,v_request,s.study->'revisedMethodDraft');
  else
   v_result:=business_learning_command(p_user_id,'method',s.study->'revisedMethodDraft'||jsonb_build_object('operation','method','requestId',v_request,'caseId',v_method->>'caseId','reportId',v_method->>'reportId','confirmed',true));
  end if;
  v_method_id:=(v_result->>'id')::uuid;
  update business_method_counterexamples set adopted_method_id=v_method_id,revision=revision+1,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
 end if;
 insert into business_counterexample_receipts(user_id,request_id,input_hash,operation,study_id,revision,method_id) values(p_user_id,v_request,v_hash,p_operation,v_id,v_revision+1,v_method_id);
 return jsonb_build_object('id',v_id,'revision',v_revision+1,'methodId',v_method_id);
end$$;
revoke all on function business_result_method_source(uuid,uuid),business_result_method_dto(uuid,uuid),business_result_method_insert(uuid,uuid,uuid,uuid,uuid,jsonb),business_result_method_adopt(uuid,uuid,uuid,jsonb),business_result_method_read(uuid,text,jsonb),business_result_method_command(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function business_result_method_read(uuid,text,jsonb),business_result_method_command(uuid,text,jsonb) to service_role;
commit;
