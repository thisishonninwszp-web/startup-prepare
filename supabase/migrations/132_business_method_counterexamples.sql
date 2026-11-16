begin;
-- Studies keep identifiers and a digest of the selected method, never its original prose.
create table public.business_method_counterexamples(
 id uuid primary key,user_id uuid not null references auth.users(id),revision integer not null check(revision>0),
 study jsonb not null,adopted_method_id uuid,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,id),foreign key(user_id,adopted_method_id) references business_learning_entries(user_id,id)
);
create index business_counterexample_history on business_method_counterexamples(user_id,created_at desc,id desc);
create table public.business_counterexample_receipts(
 user_id uuid not null references auth.users(id),request_id uuid not null,input_hash text not null,operation text not null,
 study_id uuid not null,revision integer not null,method_id uuid,primary key(user_id,request_id)
);
create trigger counterexample_receipt_immutable before update or delete on business_counterexample_receipts for each row execute function business_immutable();
alter table business_method_counterexamples enable row level security;
alter table business_counterexample_receipts enable row level security;
revoke all on business_method_counterexamples,business_counterexample_receipts from public,anon,authenticated;
grant all on business_method_counterexamples,business_counterexample_receipts to service_role;

create function public.business_counterexample_report_readable(p_owner uuid,p_report uuid,p_case uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from business_case_revisions r join business_daily_cases c on c.user_id=r.user_id and c.id=r.case_id
 where r.user_id=p_owner and r.id=p_report and r.case_id=p_case and r.erased_at is null
 and not exists(select 1 from jsonb_array_elements(r.manifest) src left join business_material_snapshots s on s.user_id=p_owner and s.id::text=src->>'id' where s.id is null or s.erased_at is not null))
$$;
create function public.business_counterexample_case(p_owner uuid,p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',c.id,'title',m.name,'date',c.local_date) from business_daily_cases c join business_merchants m on m.user_id=c.user_id and m.id=c.merchant_id
 where c.user_id=p_owner and c.id=p_id and business_counterexample_report_readable(p_owner,c.published_revision_id,c.id)
$$;
create function public.business_counterexample_methods(p_owner uuid) returns table(id uuid,kind text,created_at timestamptz,item jsonb) language sql stable security definer set search_path=public,pg_temp as $$
 with source as (
 select rows.id,rows.created_at,rows.item,e.report_id,'learning'::text kind from business_method_rows(p_owner) rows join business_learning_entries e on e.user_id=p_owner and e.id=rows.id and e.operation='method' where e.payload->'confirmed'='true'::jsonb and rows.item->'payload'->>'source' is distinct from 'confirmed_lesson'
 union all
 select rows.id,rows.created_at,rows.item,l.report_id,'lesson'::text kind from business_method_rows(p_owner) rows join business_case_lessons l on l.user_id=p_owner and l.id=rows.id where rows.item->'payload'->>'source'='confirmed_lesson'
 )
 select source.id,source.kind,source.created_at,jsonb_build_object('id',source.id,'kind',source.kind,'caseId',source.item->>'caseId','reportId',source.report_id,
 'baselineHash',md5(jsonb_build_object('kind',source.kind,'payload',source.item->'payload','reportId',source.report_id)::text),
 'draft',jsonb_build_object('method',source.item->'payload'->>'method','scenario',coalesce(nullif(source.item->'payload'->>'scenario',''),'未记录'),'conditions',source.item->'payload'->>'conditions','failureConditions',coalesce(nullif(source.item->'payload'->>'failureConditions',''),'未记录'),'unknowns',source.item->'payload'->>'unknowns'))
 from source where source.item->'sourceInvalidated'='false'::jsonb and business_counterexample_report_readable(p_owner,source.report_id,(source.item->>'caseId')::uuid)
$$;
create function public.business_counterexample_dto(s business_method_counterexamples) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',s.id,'revision',s.revision,'study',s.study,'createdAt',s.created_at,'updatedAt',s.updated_at,'adoptedMethodId',s.adopted_method_id,
 'sources',jsonb_build_object('method',m.item,'candidate',business_counterexample_case(s.user_id,(s.study->>'candidateCaseId')::uuid),'stale',m.item is null))
 from (select 1) seed left join lateral(select item from business_counterexample_methods(s.user_id) where id=(s.study->>'methodId')::uuid and kind=s.study->>'methodKind' and item->>'baselineHash'=s.study->>'baselineHash') m on true
$$;
create function public.business_counterexample_uuid(p jsonb,k text) returns uuid language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p->k) is distinct from 'string' or (p->>k)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid counterexample identifier';end if;return (p->>k)::uuid;
end$$;
create function public.business_counterexample_text(p jsonb,k text) returns void language plpgsql immutable set search_path=public,pg_temp as $$declare v text;begin
 if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'invalid counterexample text';end if;v:=p->>k;
 if length(v)+length(regexp_replace(v,U&'[\0001-\FFFF]','','g'))>6000 or length(btrim(v,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0 then raise exception 'invalid counterexample text';end if;
end$$;
create function public.business_counterexample_draft(p jsonb) returns void language plpgsql set search_path=public,pg_temp as $$declare k text;v_bytes integer:=0;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>5 or exists(select 1 from jsonb_object_keys(p) key where key<>all(array['method','scenario','conditions','failureConditions','unknowns'])) then raise exception 'invalid method draft fields';end if;
 foreach k in array array['method','scenario','conditions','failureConditions','unknowns'] loop perform business_counterexample_text(p,k);v_bytes:=v_bytes+octet_length(to_jsonb(p->>k)::text);end loop;
 if v_bytes>38000 then raise exception 'method draft total text too long';end if;
end$$;
create function public.business_counterexample_read(p_user_id uuid,p_operation text,p_input jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_kind text;v_query text;v_items jsonb;v_next jsonb;v_date timestamptz;v_before uuid;v_keys text[];v_count integer;begin
 perform business_service(p_user_id);
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2000 or p_operation is null or p_operation not in('get','list','method','method_start','methods','case','cases') then raise exception 'invalid counterexample read';end if;
 v_keys:=case p_operation when 'get' then array['id'] when 'case' then array['id'] when 'method_start' then array['id'] when 'method' then array['id','kind'] when 'methods' then array['query','before'] else array['before'] end;
 if exists(select 1 from jsonb_object_keys(p_input) key where key<>all(v_keys)) then raise exception 'unsupported counterexample read field';end if;
 if p_operation in('get','case','method','method_start') then v_id:=business_counterexample_uuid(p_input,'id');end if;
 if p_operation='get' then return (select business_counterexample_dto(s) from business_method_counterexamples s where user_id=p_user_id and id=v_id);
 elsif p_operation='case' then return business_counterexample_case(p_user_id,v_id);
 elsif p_operation in('method','method_start') then
  if p_operation='method' then if coalesce(p_input->>'kind','') not in('learning','lesson') then raise exception 'invalid method kind';end if;v_kind:=p_input->>'kind';end if;
  select count(*) into v_count from business_counterexample_methods(p_user_id) where id=v_id and (v_kind is null or kind=v_kind);if v_count>1 then raise exception 'ambiguous owned method identifier';end if;
  return (select item from business_counterexample_methods(p_user_id) where id=v_id and (v_kind is null or kind=v_kind));
 end if;
 if p_input ? 'before' then
  if jsonb_typeof(p_input->'before') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input->'before'))<>2 or exists(select 1 from jsonb_object_keys(p_input->'before') key where key<>all(array['date','id'])) or jsonb_typeof(p_input->'before'->'date') is distinct from 'string' then raise exception 'invalid counterexample cursor';end if;
  v_date:=(p_input->'before'->>'date')::timestamptz;v_before:=business_counterexample_uuid(p_input->'before','id');if not isfinite(v_date) then raise exception 'invalid cursor date';end if;
 end if;
 if p_operation='list' then
  select coalesce(jsonb_agg(business_counterexample_dto(s) order by s.created_at desc,s.id desc),'[]') into v_items from(select * from business_method_counterexamples where user_id=p_user_id and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21) s;
 elsif p_operation='cases' then
  select coalesce(jsonb_agg(business_counterexample_case(p_user_id,c.id)||jsonb_build_object('_date',c.created_at) order by c.created_at desc,c.id desc),'[]') into v_items from(select * from business_daily_cases where user_id=p_user_id and business_counterexample_case(p_user_id,id) is not null and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21) c;
 else
  if p_input ? 'query' and (jsonb_typeof(p_input->'query') is distinct from 'string' or length(p_input->>'query')>500) then raise exception 'invalid method query';end if;v_query:=trim(coalesce(p_input->>'query',''));
  select coalesce(jsonb_agg(m.item||jsonb_build_object('_date',m.created_at) order by m.created_at desc,m.id desc),'[]') into v_items from(select * from business_counterexample_methods(p_user_id) where (v_before is null or (created_at,id)<(v_date,v_before)) and (v_query='' or position(lower(v_query) in lower(concat_ws(' ',item->'draft'->>'method',item->'draft'->>'scenario',item->'draft'->>'conditions',item->'draft'->>'failureConditions',item->'draft'->>'unknowns')))>0) order by created_at desc,id desc limit 21) m;
 end if;
 if jsonb_array_length(v_items)>20 then v_items:=v_items-20;v_next:=jsonb_build_object('date',coalesce(v_items->19->'createdAt',v_items->19->'_date'),'id',v_items->19->'id');end if;
 select coalesce(jsonb_agg(value-'_date' order by ord),'[]') into v_items from jsonb_array_elements(v_items) with ordinality items(value,ord);
 return jsonb_build_object('items',v_items,'nextCursor',v_next);
end$$;

create function public.business_counterexample_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
  v_result:=business_learning_command(p_user_id,'method',s.study->'revisedMethodDraft'||jsonb_build_object('operation','method','requestId',v_request,'caseId',v_method->>'caseId','reportId',v_method->>'reportId','confirmed',true));
  v_method_id:=(v_result->>'id')::uuid;
  update business_method_counterexamples set adopted_method_id=v_method_id,revision=revision+1,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
 end if;
 insert into business_counterexample_receipts(user_id,request_id,input_hash,operation,study_id,revision,method_id) values(p_user_id,v_request,v_hash,p_operation,v_id,v_revision+1,v_method_id);
 return jsonb_build_object('id',v_id,'revision',v_revision+1,'methodId',v_method_id);
end$$;
revoke all on function business_counterexample_report_readable(uuid,uuid,uuid),business_counterexample_case(uuid,uuid),business_counterexample_methods(uuid),business_counterexample_dto(business_method_counterexamples),business_counterexample_draft(jsonb),business_counterexample_uuid(jsonb,text),business_counterexample_text(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function business_counterexample_read(uuid,text,jsonb),business_counterexample_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function business_counterexample_read(uuid,text,jsonb),business_counterexample_command(uuid,text,jsonb) to service_role;
commit;
