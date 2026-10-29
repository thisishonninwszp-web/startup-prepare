begin;
-- Every learning record is historical. Receipts retain a digest, never another copy of a quotation.
create function public.business_learning_now() returns timestamptz language sql volatile set search_path=public,pg_temp as $$select clock_timestamp()$$;
create table public.business_learning_entries(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,
 operation text not null check(operation in('identity','expectation','followup','correction','method')),payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default business_learning_now(),identity_version bigint,left_merchant_id uuid,right_merchant_id uuid,
 report_id uuid,snapshot_id uuid,expectation_id uuid,lesson_id uuid,
 unique(user_id,id),unique(user_id,case_id,id),unique(user_id,identity_version),
 foreign key(user_id,case_id) references business_daily_cases(user_id,id),
 foreign key(user_id,left_merchant_id) references business_merchants(user_id,id),foreign key(user_id,right_merchant_id) references business_merchants(user_id,id),
 foreign key(user_id,report_id) references business_case_revisions(user_id,id),foreign key(user_id,snapshot_id) references business_material_snapshots(user_id,id),
 foreign key(user_id,case_id,expectation_id) references business_learning_entries(user_id,case_id,id),
 check((operation='identity')=(identity_version is not null)),check(operation<>'identity' or (left_merchant_id is not null and right_merchant_id is not null and left_merchant_id<right_merchant_id))
);
create unique index business_lessons_owner_id_learning on business_case_lessons(user_id,id);
alter table business_learning_entries add foreign key(user_id,lesson_id) references business_case_lessons(user_id,id);
create table public.business_learning_receipts(user_id uuid not null references auth.users(id),request_id uuid not null,input_hash text not null,entry_id uuid not null,primary key(user_id,request_id),foreign key(user_id,entry_id) references business_learning_entries(user_id,id));
create table public.business_learning_sources(user_id uuid not null,entry_id uuid not null,snapshot_id uuid not null,primary key(entry_id,snapshot_id),foreign key(user_id,entry_id) references business_learning_entries(user_id,id),foreign key(user_id,snapshot_id) references business_material_snapshots(user_id,id));
create table public.business_learning_report_reviews(user_id uuid not null,correction_id uuid not null,report_id uuid not null,section_keys jsonb not null check(jsonb_typeof(section_keys)='array'),primary key(correction_id,report_id),foreign key(user_id,correction_id) references business_learning_entries(user_id,id),foreign key(user_id,report_id) references business_case_revisions(user_id,id));
create table public.business_learning_erasures(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,snapshot_id uuid,report_id uuid,created_at timestamptz not null default business_learning_now(),foreign key(user_id,case_id) references business_daily_cases(user_id,id),foreign key(user_id,snapshot_id) references business_material_snapshots(user_id,id),foreign key(user_id,report_id) references business_case_revisions(user_id,id),check((snapshot_id is null)<>(report_id is null)));
create index business_learning_case_history on business_learning_entries(user_id,case_id,created_at desc,id desc);
create index business_learning_methods on business_learning_entries(user_id,created_at desc,id desc) where operation='method';

create function public.business_learning_entry_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='UPDATE' and coalesce(auth.role(),'')='service_role' and current_setting('business.learning_erase',true)=old.user_id::text and old.operation='followup'
 and new.payload=old.payload||jsonb_build_object('quote','') and new.payload->>'quote'='' and
 (to_jsonb(new)-'payload')=(to_jsonb(old)-'payload') then return new;end if;
 raise exception 'business learning history is immutable';
end$$;
create trigger business_learning_entries_immutable before update or delete on business_learning_entries for each row execute function business_learning_entry_guard();
do $$declare t text;begin foreach t in array array['business_learning_receipts','business_learning_sources','business_learning_report_reviews','business_learning_erasures'] loop execute format('create trigger learning_immutable before update or delete on %I for each row execute function business_immutable()',t);end loop;end$$;

-- Only explicitly confirmed latest events form edges; names never participate in identity.
create function public.business_learning_component(p_user_id uuid,p_merchant_id uuid) returns setof uuid language sql stable security definer set search_path=public,pg_temp as $$
 with recursive latest as (select distinct on(left_merchant_id,right_merchant_id) left_merchant_id l,right_merchant_id r,payload->>'action' action from business_learning_entries where user_id=p_user_id and operation='identity' order by left_merchant_id,right_merchant_id,identity_version desc),
 edges as (select l,r from latest where action='link' union all select r,l from latest where action='link'),
 reached(id) as (select id from business_merchants where user_id=p_user_id and id=p_merchant_id union select e.r from reached c join edges e on e.l=c.id)
 select id from reached
$$;
create or replace function public.business_excluded_merchants(p_user_id uuid) returns text[] language plpgsql stable security definer set search_path=public,pg_temp as $$declare result text[];begin
 perform business_service(p_user_id);
 select coalesce(array_agg(distinct m.platform||':'||m.platform_shop_id),array[]::text[]) into result from business_daily_cases c cross join lateral business_learning_component(p_user_id,c.merchant_id) component(id) join business_merchants m on m.id=component.id and m.user_id=p_user_id where c.user_id=p_user_id;
 return result;
end$$;
create function public.business_learning_case_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform business_service(new.user_id);
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,722));
 if exists(select 1 from business_daily_cases c where c.user_id=new.user_id and c.merchant_id in(select business_learning_component(new.user_id,new.merchant_id))) then raise exception 'main merchant already used or linked to an excluded merchant';end if;
 return new;
end$$;
create trigger business_learning_case_dedupe before insert on business_daily_cases for each row execute function business_learning_case_guard();

create function public.business_learning_dto(e business_learning_entries) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'operation',e.operation,'caseId',e.case_id,'createdAt',e.created_at,'payload',e.payload,
 'sourceInvalidated',exists(select 1 from business_learning_sources d join business_material_snapshots s on s.id=d.snapshot_id and s.user_id=d.user_id where d.user_id=e.user_id and d.entry_id=e.id and s.erased_at is not null) or exists(select 1 from business_case_revisions r where r.user_id=e.user_id and r.id=e.report_id and r.erased_at is not null),
 'reviewNeeded',exists(select 1 from business_learning_sources d join business_learning_entries correction on correction.user_id=d.user_id and correction.snapshot_id=d.snapshot_id and correction.operation='correction' where d.user_id=e.user_id and d.entry_id=e.id and correction.id<>e.id) or exists(select 1 from business_learning_report_reviews r where r.user_id=e.user_id and r.report_id=e.report_id))
$$;
create function public.business_learning_text(p_input jsonb,p_key text,p_max integer default 3000) returns void language plpgsql set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p_input->p_key) is distinct from 'string' or length(trim(p_input->>p_key))=0 or length(p_input->>p_key)>p_max then raise exception 'invalid learning text: %',p_key;end if;
end$$;
create function public.business_learning_uuid(p_input jsonb,p_key text) returns uuid language plpgsql set search_path=public,pg_temp as $$declare v uuid;begin
 if jsonb_typeof(p_input->p_key) is distinct from 'string' then raise exception 'invalid learning identifier: %',p_key;end if;v:=(p_input->>p_key)::uuid;if v is null then raise exception 'missing learning identifier';end if;return v;
end$$;

create function public.business_learning_section_keys(p_payload jsonb,p_snapshot uuid) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(distinct section->>'key'),'[]'::jsonb) from jsonb_array_elements(coalesce(p_payload->'sections','[]')) section
 where exists(select 1 from jsonb_array_elements(coalesce(section->'observations','[]')) observation where observation->>'snapshotId'=p_snapshot::text)
 or exists(select 1 from jsonb_array_elements(coalesce(section->'interpretations','[]')) interpretation cross join lateral jsonb_array_elements(coalesce(interpretation->'refs','[]')) ref where ref->>'snapshotId'=p_snapshot::text)
$$;
-- Date-only manual sightings cannot establish an ordering within the prediction's local day.
create function public.business_learning_seen_after(p_seen jsonb,p_prediction timestamptz,p_now timestamptz) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$declare seen_date date;seen_text text;begin
 if jsonb_typeof(p_seen) is distinct from 'string' then return false;end if;seen_text:=p_seen#>>'{}';
 if seen_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
 begin seen_date:=seen_text::date;exception when invalid_datetime_format or datetime_field_overflow then return false;end;
 return to_char(seen_date,'YYYY-MM-DD')=seen_text and seen_date>(p_prediction at time zone 'Asia/Tokyo')::date and seen_date<=(p_now at time zone 'Asia/Tokyo')::date;
end$$;
create function public.business_learning_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request uuid;v_case uuid;v_report uuid;v_snapshot uuid;v_expectation uuid;v_lesson uuid;v_left uuid;v_right uuid;v_version bigint;v_now timestamptz;v_hash text;v_keys text[];k text;e business_learning_entries;prediction business_learning_entries;r business_learning_receipts;s business_material_snapshots;base business_material_snapshots;rep business_case_revisions;v_payload jsonb;v_outcome text;v_report_ids uuid[];
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>40000 or p_operation is null or p_operation not in('identity','expectation','followup','correction','method') or p_input->>'operation' is distinct from p_operation then raise exception 'invalid learning operation';end if;
 v_request:=business_learning_uuid(p_input,'requestId');v_case:=business_learning_uuid(p_input,'caseId');v_hash:=md5(p_input::text);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,722));
 select * into r from business_learning_receipts where user_id=p_user_id and request_id=v_request;
 if found then if r.input_hash is distinct from v_hash then raise exception 'learning request payload conflict';end if;select * into e from business_learning_entries where user_id=p_user_id and id=r.entry_id;return business_learning_dto(e);end if;
 if not exists(select 1 from business_daily_cases where user_id=p_user_id and id=v_case) then raise exception 'learning case owner unavailable' using errcode='42501';end if;
 v_keys:=array['operation','requestId','caseId']||case p_operation when 'identity' then array['expectedVersion','leftMerchantId','rightMerchantId','leftSource','rightSource','reason','confirmed','action'] when 'expectation' then array['reportId','baselineSnapshotId','question','scope','deadline','supportCriteria','refuteCriteria'] when 'followup' then array['expectationId','snapshotId','outcome','quote','sameScopeConfirmed','scope','note','accessStatus','coverage'] when 'correction' then array['snapshotId','explanation'] else array['reportId','method','scenario','conditions','failureConditions','unknowns','confirmed','lessonId'] end;
 if exists(select 1 from jsonb_object_keys(p_input) key where not(key=any(v_keys))) then raise exception 'unsupported learning field; timestamps are database owned';end if;
 v_now:=business_learning_now();v_payload:=p_input-array['operation','requestId','caseId'];
 if p_operation='identity' then
  v_left:=business_learning_uuid(p_input,'leftMerchantId');v_right:=business_learning_uuid(p_input,'rightMerchantId');
  if v_left=v_right or p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' or (p_input->>'expectedVersion') !~ '^[0-9]+$' or coalesce(p_input->>'action','') not in('link','revoke') then raise exception 'invalid identity confirmation/version';end if;
  foreach k in array array['leftSource','rightSource','reason'] loop perform business_learning_text(p_input,k);end loop;
  if (select count(*) from business_merchants where user_id=p_user_id and id in(v_left,v_right))<>2 then raise exception 'merchant owner unavailable' using errcode='42501';end if;
  select coalesce(max(identity_version),0) into v_version from business_learning_entries where user_id=p_user_id and operation='identity';
  if v_version is distinct from (p_input->>'expectedVersion')::bigint then raise exception 'identity version conflict';end if;v_version:=v_version+1;
  if p_input->>'action'='revoke' and (select payload->>'action' from business_learning_entries where user_id=p_user_id and left_merchant_id=least(v_left,v_right) and right_merchant_id=greatest(v_left,v_right) and operation='identity' order by identity_version desc limit 1) is distinct from 'link' then raise exception 'identity link unavailable';end if;
 elsif p_operation='expectation' then
  v_report:=business_learning_uuid(p_input,'reportId');v_snapshot:=business_learning_uuid(p_input,'baselineSnapshotId');
  foreach k in array array['question','scope','supportCriteria','refuteCriteria'] loop perform business_learning_text(p_input,k);end loop;perform business_learning_text(p_input,'deadline',100);
  if not isfinite((p_input->>'deadline')::timestamptz) or (p_input->>'deadline')::timestamptz<=v_now then raise exception 'expectation deadline must be future';end if;
 elsif p_operation='followup' then
  v_expectation:=business_learning_uuid(p_input,'expectationId');v_snapshot:=business_learning_uuid(p_input,'snapshotId');
  if coalesce(p_input->>'outcome','') not in('support','refute','unknown') or coalesce(p_input->>'accessStatus','') not in('public','partial','login_required','unavailable') or coalesce(p_input->>'coverage','') not in('complete','insufficient','failed_fetch','list_absence') or jsonb_typeof(p_input->'sameScopeConfirmed') is distinct from 'boolean' or jsonb_typeof(p_input->'quote') is distinct from 'string' or length(p_input->>'quote')>12000 then raise exception 'invalid followup fields';end if;
  perform business_learning_text(p_input,'scope');perform business_learning_text(p_input,'note');
  select * into prediction from business_learning_entries where user_id=p_user_id and case_id=v_case and id=v_expectation and operation='expectation';if not found then raise exception 'expectation owner unavailable' using errcode='42501';end if;
  v_report:=prediction.report_id;select * into base from business_material_snapshots where user_id=p_user_id and id=prediction.snapshot_id;
 elsif p_operation='correction' then
  v_snapshot:=business_learning_uuid(p_input,'snapshotId');perform business_learning_text(p_input,'explanation',6000);
 else
  v_report:=business_learning_uuid(p_input,'reportId');if p_input ? 'lessonId' then v_lesson:=business_learning_uuid(p_input,'lessonId');end if;
  foreach k in array array['method','scenario','conditions','failureConditions','unknowns'] loop perform business_learning_text(p_input,k,6000);end loop;
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'method requires user confirmation';end if;
  if v_lesson is not null and not exists(select 1 from business_case_lessons where user_id=p_user_id and case_id=v_case and report_id=v_report and id=v_lesson) then raise exception 'lesson owner/report unavailable' using errcode='42501';end if;
 end if;
 if v_report is not null then
  select * into rep from business_case_revisions where user_id=p_user_id and case_id=v_case and id=v_report and erased_at is null;
  if not found then raise exception 'report owner unavailable' using errcode='42501';end if;
 end if;
 if v_snapshot is not null then
  select material.* into s from business_material_snapshots material join business_case_members member on member.user_id=material.user_id and member.snapshot_id=material.id where material.user_id=p_user_id and material.id=v_snapshot and member.case_id=v_case and material.erased_at is null;
  if not found then raise exception 'snapshot owner/case unavailable' using errcode='42501';end if;
  if s.captured_at>v_now then raise exception 'future source unavailable';end if;
 end if;
 if p_operation='expectation' then
  if not exists(select 1 from jsonb_array_elements(rep.manifest) src where src->>'id'=v_snapshot::text) then raise exception 'baseline absent from selected report manifest';end if;
 elsif p_operation='followup' then
  if s.captured_at<=prediction.created_at then raise exception 'followup source must be obtained after prediction';end if;
  if length(trim(p_input->>'quote'))>0 and position((p_input->>'quote') in coalesce(s.captured_text,''))=0 then raise exception 'followup quote must be exact source text';end if;
  v_outcome:=p_input->>'outcome';
  if v_now<(prediction.payload->>'deadline')::timestamptz or p_input->'sameScopeConfirmed'<>'true'::jsonb or p_input->>'scope' is distinct from prediction.payload->>'scope' or length(trim(p_input->>'quote'))=0 or p_input->>'accessStatus'<>'public' or p_input->>'coverage'<>'complete' or coalesce(s.structured->>'accessStatus','public')<>'public' or base.erased_at is not null or s.merchant_id is distinct from base.merchant_id or (nullif(s.item_id,'') is not null and nullif(base.item_id,'') is not null and s.item_id is distinct from base.item_id) or ((s.origin='manual_excerpt' or s.structured ? 'dateSeen') and not business_learning_seen_after(s.structured->'dateSeen',prediction.created_at,v_now)) then v_outcome:='unknown';end if;
  v_payload:=v_payload||jsonb_build_object('outcome',v_outcome);
 end if;
 if p_operation='correction' then
  v_payload:=v_payload||jsonb_build_object('dependencies',coalesce((select jsonb_agg(distinct label order by label) from (
   select '报告版本 '||revision.revision||' · '||case section_key when 'offering' then '卖什么' when 'trigger' then '购买触发' when 'buyers' then '谁在购买' when 'volume' then '热销依据' when 'journey' then '购买路径' when 'value' then '交付价值' when 'operations' then '运营条件' when 'economics' then '成本与收入' when 'comparison' then '对照材料' when 'failure_conditions' then '失效条件' when 'transfer' then '可迁移方法' when 'experiment' then '下一步验证' else '引用来源' end label
   from business_case_revisions revision cross join lateral jsonb_array_elements_text(case when jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0 then business_learning_section_keys(revision.payload,v_snapshot) else '["source"]'::jsonb end) section(section_key)
   where revision.user_id=p_user_id and (exists(select 1 from jsonb_array_elements(revision.manifest) src where src->>'id'=v_snapshot::text) or jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0)
   union all select '本人确认的方法 · 引用受影响报告' from business_learning_entries method join business_learning_sources dep on dep.user_id=method.user_id and dep.entry_id=method.id where method.user_id=p_user_id and method.operation='method' and dep.snapshot_id=v_snapshot
   union all select '本人确认的经验 · 引用受影响报告' from business_case_lessons lesson join business_case_revisions revision on revision.user_id=lesson.user_id and revision.id=lesson.report_id where lesson.user_id=p_user_id and (exists(select 1 from jsonb_array_elements(revision.manifest) src where src->>'id'=v_snapshot::text) or jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0)
   union all select '后续核对记录 · 引用该来源' from business_learning_entries followup join business_learning_sources dep on dep.user_id=followup.user_id and dep.entry_id=followup.id where followup.user_id=p_user_id and followup.operation='followup' and dep.snapshot_id=v_snapshot
  ) affected),'[]'::jsonb));
 end if;
 insert into business_learning_entries(user_id,case_id,operation,payload,created_at,identity_version,left_merchant_id,right_merchant_id,report_id,snapshot_id,expectation_id,lesson_id)
 values(p_user_id,v_case,p_operation,v_payload,v_now,v_version,least(v_left,v_right),greatest(v_left,v_right),v_report,v_snapshot,v_expectation,v_lesson) returning * into e;
 if v_snapshot is not null then insert into business_learning_sources values(p_user_id,e.id,v_snapshot);end if;
 if p_operation='followup' then insert into business_learning_sources values(p_user_id,e.id,prediction.snapshot_id) on conflict do nothing;end if;
 if v_report is not null then insert into business_learning_sources select p_user_id,e.id,snap.id from business_material_snapshots snap where snap.user_id=p_user_id and exists(select 1 from jsonb_array_elements(rep.manifest) src where src->>'id'=snap.id::text) on conflict do nothing;end if;
 if p_operation='correction' then
  insert into business_learning_report_reviews(user_id,correction_id,report_id,section_keys)
  select p_user_id,e.id,revision.id,business_learning_section_keys(revision.payload,v_snapshot)
  from business_case_revisions revision where revision.user_id=p_user_id and (exists(select 1 from jsonb_array_elements(revision.manifest) src where src->>'id'=v_snapshot::text) or jsonb_array_length(business_learning_section_keys(revision.payload,v_snapshot))>0);
 end if;
 insert into business_learning_receipts values(p_user_id,v_request,v_hash,e.id);
 return business_learning_dto(e);
end$$;

create function public.business_learning_read(p_user_id uuid,p_case_id uuid,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;boundary business_learning_entries;v_items jsonb;v_more boolean;v_next uuid;v_merchants jsonb;v_duplicates jsonb;begin
 perform business_service(p_user_id);select * into c from business_daily_cases where user_id=p_user_id and id=p_case_id;if not found then raise exception 'learning case owner unavailable' using errcode='42501';end if;
 if p_before is not null then select * into boundary from business_learning_entries where user_id=p_user_id and case_id=p_case_id and id=p_before;if not found then raise exception 'learning cursor unavailable' using errcode='42501';end if;end if;
 select coalesce(jsonb_agg(business_learning_dto(page) order by page.created_at desc,page.id desc),'[]'::jsonb) into v_items from(select * from business_learning_entries where user_id=p_user_id and case_id=p_case_id and (p_before is null or (created_at,id)<(boundary.created_at,boundary.id)) order by created_at desc,id desc limit 50) page;
 v_next:=(v_items->-1->>'id')::uuid;
 select exists(select 1 from business_learning_entries where user_id=p_user_id and case_id=p_case_id and (created_at,id)<((select created_at from business_learning_entries where id=v_next),v_next)) into v_more;
 select coalesce(jsonb_agg(jsonb_build_object('merchantId',m.id,'name',m.name,'platform',m.platform,'platformShopId',m.platform_shop_id,'caseIds',coalesce((select jsonb_agg(id order by local_date,id) from business_daily_cases where user_id=p_user_id and merchant_id=m.id),'[]'::jsonb)) order by m.created_at,m.id),'[]'::jsonb) into v_merchants from business_merchants m where m.user_id=p_user_id;
 select coalesce(jsonb_agg(id order by local_date,id),'[]'::jsonb) into v_duplicates from business_daily_cases where user_id=p_user_id and id<>p_case_id and merchant_id in(select business_learning_component(p_user_id,c.merchant_id));
 return jsonb_build_object('available',true,'version',(select coalesce(max(identity_version),0) from business_learning_entries where user_id=p_user_id),'items',v_items,'nextCursor',case when v_more then v_next else null end,'merchants',v_merchants,'duplicateCaseIds',v_duplicates);
end$$;

create function public.business_method_rows(p_user_id uuid) returns table(id uuid,created_at timestamptz,item jsonb) language sql stable security definer set search_path=public,pg_temp as $$
 select e.id,e.created_at,business_learning_dto(e) from business_learning_entries e where e.user_id=p_user_id and e.operation='method'
 union all
 select l.id,l.created_at,jsonb_build_object('id',l.id,'operation','method','caseId',l.case_id,'createdAt',l.created_at,'payload',l.payload||jsonb_build_object('source','confirmed_lesson'),
 'sourceInvalidated',r.erased_at is not null,'reviewNeeded',exists(select 1 from business_learning_report_reviews review where review.user_id=l.user_id and review.report_id=l.report_id)) from business_case_lessons l join business_case_revisions r on r.user_id=l.user_id and r.id=l.report_id where l.user_id=p_user_id
$$;
create function public.business_method_search(p_user_id uuid,p_query text,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare v_created timestamptz;v_items jsonb;v_next uuid;v_more boolean;begin
 perform business_service(p_user_id);if p_query is null or length(p_query)>500 then raise exception 'invalid method query';end if;
 if p_before is not null then select created_at into v_created from business_method_rows(p_user_id) where id=p_before;if not found then raise exception 'method cursor owner unavailable' using errcode='42501';end if;end if;
 select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_items from(select * from business_method_rows(p_user_id) where (p_before is null or (created_at,id)<(v_created,p_before)) and (trim(p_query)='' or position(lower(trim(p_query)) in lower(concat_ws(' ',item->'payload'->>'method',item->'payload'->>'scenario',item->'payload'->>'conditions',item->'payload'->>'failureConditions',item->'payload'->>'unknowns')))>0) order by created_at desc,id desc limit 51) page;
 v_more:=jsonb_array_length(v_items)>50;if v_more then v_items:=v_items-50;end if;v_next:=(v_items->-1->>'id')::uuid;
 return jsonb_build_object('available',true,'items',v_items,'nextCursor',case when v_more then v_next else null end);
end$$;

-- Keep the B/C erase behavior behind a single D-aware entry point and a consistent lock order.
alter function public.business_erase_content(uuid,uuid,uuid,uuid) rename to business_erase_content_before_learning;
revoke all on function public.business_erase_content_before_learning(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.business_erase_content(p_user_id uuid,p_case_id uuid,p_snapshot_id uuid default null,p_report_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform business_service(p_user_id);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,722));
 perform business_erase_content_before_learning(p_user_id,p_case_id,p_snapshot_id,p_report_id);
 insert into business_learning_erasures(user_id,case_id,snapshot_id,report_id) values(p_user_id,p_case_id,p_snapshot_id,p_report_id);
 perform set_config('business.learning_erase',p_user_id::text,true);
 update business_learning_entries e set payload=e.payload||jsonb_build_object('quote','') where e.user_id=p_user_id and e.operation='followup' and e.payload->>'quote'<>'' and (e.snapshot_id=p_snapshot_id or (p_report_id is not null and exists(select 1 from business_learning_entries prediction where prediction.user_id=e.user_id and prediction.id=e.expectation_id and prediction.report_id=p_report_id)));
 perform set_config('business.learning_erase','',true);
end$$;

do $$declare t text;begin foreach t in array array['business_learning_entries','business_learning_receipts','business_learning_sources','business_learning_report_reviews','business_learning_erasures'] loop execute format('alter table %I enable row level security',t);execute format('create policy learning_owner_read on %I for select to authenticated using(user_id=auth.uid())',t);execute format('revoke all on %I from public,anon,authenticated,service_role',t);execute format('grant select on %I to authenticated,service_role',t);end loop;end$$;
revoke all on function business_learning_component(uuid,uuid),business_learning_dto(business_learning_entries),business_learning_text(jsonb,text,integer),business_learning_section_keys(jsonb,uuid),business_learning_seen_after(jsonb,timestamptz,timestamptz),business_learning_uuid(jsonb,text),business_method_rows(uuid),business_learning_case_guard(),business_learning_entry_guard() from public,anon,authenticated,service_role;
revoke all on function business_learning_command(uuid,text,jsonb),business_learning_read(uuid,uuid,uuid),business_method_search(uuid,text,uuid),business_excluded_merchants(uuid),business_erase_content(uuid,uuid,uuid,uuid),business_learning_now() from public,anon,authenticated;
grant execute on function business_learning_command(uuid,text,jsonb),business_learning_read(uuid,uuid,uuid),business_method_search(uuid,text,uuid),business_excluded_merchants(uuid),business_erase_content(uuid,uuid,uuid,uuid) to service_role;
commit;

