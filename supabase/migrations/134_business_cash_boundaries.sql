begin;
create table public.business_cash_boundaries(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,case_id uuid not null,
 definition jsonb not null,revision integer not null check(revision>0),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index business_cash_boundary_order on public.business_cash_boundaries(user_id,created_at desc,id desc);
create index business_cash_boundary_case on public.business_cash_boundaries(user_id,case_id,created_at desc,id desc);
create table public.business_cash_boundary_receipts(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,input_hash text not null check(input_hash~'^[0-9a-f]{64}$'),record_id uuid not null,revision integer not null,primary key(user_id,request_id));
create index business_cash_boundary_receipt_record on public.business_cash_boundary_receipts(user_id,record_id);
-- Only guarded RPCs may read cash rows, whose direct service-role grants were revoked in131.
create function public.business_cash_boundary_source(p_owner uuid,p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select business_cash_dto(s) from business_cash_scenarios s where s.user_id=p_owner and s.id=p_id
$$;
create function public.business_cash_boundary_validate(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb:=p;x jsonb;k text;lo numeric;hi numeric;begin
 perform business_cash_keys(v,array['cashId','cashRevision','title','side','variable']);v:=jsonb_set(v,'{cashId}',to_jsonb(business_cash_uuid(v->'cashId')));
 if business_cash_integer(v->'cashRevision',2147483647)<1 then raise exception 'invalid boundary source revision';end if;
 v:=jsonb_set(v,'{title}',to_jsonb(business_cash_text(v->'title',300)));
 if jsonb_typeof(v->'side') is distinct from 'string' or v->>'side' not in ('baseline','alternative') then raise exception 'invalid boundary side';end if;
 x:=v->'variable';k:=x->>'kind';
 if k='opening' then perform business_cash_keys(x,array['kind','minMinor','maxMinor']);
 elsif k='amount' then perform business_cash_keys(x,array['kind','flowId','minMinor','maxMinor']);
 elsif k='date' then perform business_cash_keys(x,array['kind','flowId','from','to']);
 else raise exception 'invalid boundary variable';end if;
 if k<>'opening' then x:=jsonb_set(x,'{flowId}',to_jsonb(business_cash_uuid(x->'flowId')));end if;
 if k='date' then lo:=business_cash_date(x->'from')-date '1900-01-01';hi:=business_cash_date(x->'to')-date '1900-01-01';if hi-lo not between 0 and 365 then raise exception 'invalid boundary date range';end if;
 else lo:=business_cash_integer(x->'minMinor',1000000000000);hi:=business_cash_integer(x->'maxMinor',1000000000000);if hi<lo then raise exception 'invalid boundary money range';end if;end if;
 return jsonb_set(v,'{variable}',x);
end$$;
create function public.business_cash_boundary_dto(p business_cash_boundaries) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare s jsonb;begin
 s:=business_cash_boundary_source(p.user_id,business_cash_uuid(p.definition->'cashId'));
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'definition',p.definition,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'source',jsonb_build_object('available',s is not null and s->'revision'=p.definition->'cashRevision','currentRevision',s->'revision','caseId',s->'scenario'->'caseId'));
end$$;
create function public.business_cash_boundary_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_hash text;v jsonb;s business_cash_scenarios;r business_cash_boundaries;receipt business_cash_boundary_receipts;begin
 perform business_cash_service(p_user_id);
 if p_operation='save' then perform business_cash_keys(p_input,array['operation','id','requestId','expectedRevision','definition']);elsif p_operation='erase' then perform business_cash_keys(p_input,array['operation','id','requestId','expectedRevision']);else raise exception 'invalid boundary operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid boundary operation';end if;
 v_id:=business_cash_uuid(p_input->'id');v_request:=business_cash_uuid(p_input->'requestId');v_expected:=business_cash_integer(p_input->'expectedRevision',2147483646)::integer;if p_operation='erase' and v_expected=0 then raise exception 'invalid boundary revision';end if;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,134));
 select * into receipt from business_cash_boundary_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'boundary request conflict';end if;return jsonb_build_object('id',receipt.record_id,'revision',receipt.revision);end if;
 select * into r from business_cash_boundaries where user_id=p_user_id and id=v_id for update;
 if not found then
  if p_operation<>'save' or v_expected<>0 or exists(select 1 from business_cash_boundaries where id=v_id) or exists(select 1 from business_cash_boundary_receipts where user_id=p_user_id and record_id=v_id) then raise exception 'boundary unavailable' using errcode='42501';end if;
 elsif r.revision<>v_expected then raise exception 'boundary revision conflict: 另一页面已修改，请比较最新内容';end if;
 v_revision:=coalesce(r.revision,0)+1;
 if p_operation='save' then
  v:=business_cash_boundary_validate(p_input->'definition');select * into s from business_cash_scenarios where user_id=p_user_id and id=business_cash_uuid(v->'cashId') for share;
  if not found then raise exception 'boundary source unavailable' using errcode='42501';end if;
  if s.revision<>(v->>'cashRevision')::integer then raise exception 'boundary source revision changed: 来源已修改，请明确采用新版重新分析';end if;
  if v->'variable'->>'kind'<>'opening' and not exists(select 1 from jsonb_array_elements(s.assumptions->(v->>'side')) f where business_cash_uuid(f->'id')=business_cash_uuid(v->'variable'->'flowId')) then raise exception 'boundary flow unavailable';end if;
  if v->'variable'->>'kind'='date' and business_cash_date(v->'variable'->'from')<business_cash_date(s.assumptions->'startDate') then raise exception 'boundary date precedes start';end if;
  if r.id is null then insert into business_cash_boundaries(id,user_id,case_id,definition,revision) values(v_id,p_user_id,s.case_id,v,1);
  else update business_cash_boundaries set definition=v,case_id=s.case_id,revision=v_revision,updated_at=clock_timestamp() where id=v_id and user_id=p_user_id;end if;
 else delete from business_cash_boundaries where id=v_id and user_id=p_user_id;end if;
 insert into business_cash_boundary_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;
create function public.business_cash_boundary_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_cash_boundaries;s business_cash_scenarios;v_id uuid;v_case uuid;v_date timestamptz;v_before uuid;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;dto jsonb;begin
 perform business_cash_service(p_user_id);
 if p_operation in ('get','source') then perform business_cash_keys(p_input,array['id']);v_id:=business_cash_uuid(p_input->'id');if p_operation='source' then return business_cash_boundary_source(p_user_id,v_id);end if;select * into r from business_cash_boundaries where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_cash_boundary_dto(r);
 elsif p_operation='summaries' then perform business_cash_keys(p_input,array['caseId'],array['before']);
 elsif p_operation in ('list','sources') then perform business_cash_keys(p_input,'{}',array['before','caseId']);else raise exception 'invalid boundary read';end if;
 if p_input?'caseId' then v_case:=business_cash_uuid(p_input->'caseId');end if;
 if p_input?'before' then perform business_cash_keys(p_input->'before',array['date','id']);v_before:=business_cash_uuid(p_input->'before'->'id');if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or length(p_input->'before'->>'date')>80 or (p_input->'before'->>'date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid boundary cursor';end if;v_date:=(p_input->'before'->>'date')::timestamptz;end if;
 if p_operation='sources' then
  for s in select * from business_cash_scenarios where user_id=p_user_id and (v_case is null or case_id=v_case) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_cash_dto(s));v_next:=jsonb_build_object('date',s.created_at,'id',s.id);end if;end loop;
 else
  for r in select * from business_cash_boundaries where user_id=p_user_id and (v_case is null or case_id=v_case) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then dto:=business_cash_boundary_dto(r);if p_operation='summaries' then dto:=jsonb_build_object('id',r.id,'label',r.definition->'title','refId',r.definition->'cashId','revision',r.revision,'updatedAt',r.updated_at,'nextCheck',null,'sourceAvailable',dto->'source'->'available');end if;v_items:=v_items||jsonb_build_array(dto);v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;end loop;
 end if;return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;
alter table public.business_cash_boundaries enable row level security;
alter table public.business_cash_boundary_receipts enable row level security;
revoke all on public.business_cash_boundaries,public.business_cash_boundary_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_cash_boundary_source(uuid,uuid),public.business_cash_boundary_validate(jsonb),public.business_cash_boundary_dto(public.business_cash_boundaries),public.business_cash_boundary_command(uuid,text,jsonb),public.business_cash_boundary_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_cash_boundary_command(uuid,text,jsonb),public.business_cash_boundary_read(uuid,text,jsonb) to service_role;
commit;
