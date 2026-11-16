begin;
create table public.business_cash_scenarios(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,case_id uuid not null,
 assumptions jsonb not null,revision integer not null check(revision>0),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index business_cash_order on public.business_cash_scenarios(user_id,created_at desc,id desc);
-- Keep identifier-only receipts after erasure so retries cannot resurrect an erased scenario.
create table public.business_cash_receipts(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,input_hash text not null check(input_hash~'^[0-9a-f]{64}$'),scenario_id uuid not null,revision integer not null,primary key(user_id,request_id));
create index business_cash_receipt_record on public.business_cash_receipts(user_id,scenario_id);
create function public.business_cash_service(p_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if coalesce(auth.role(),'')<>'service_role' or p_owner is null or not exists(select 1 from auth.users where id=p_owner) then raise exception 'cash service owner required' using errcode='42501';end if;
end$$;
create function public.business_cash_keys(p jsonb,required text[],optional text[] default '{}') returns void language plpgsql immutable set search_path=public,pg_temp as $$begin
 if p is null or jsonb_typeof(p) is distinct from 'object' or not(p?&required) or exists(select 1 from jsonb_object_keys(p) k where not(k=any(required||optional))) then raise exception 'invalid cash fields';end if;
end$$;
create function public.business_cash_uuid(p jsonb) returns uuid language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or (p#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid cash identifier';end if;return (p#>>'{}')::uuid;
end$$;
create function public.business_cash_text(p jsonb,maximum integer) returns text language plpgsql immutable set search_path=public,pg_temp as $$declare v text;begin
 if jsonb_typeof(p) is distinct from 'string' then raise exception 'invalid cash text';end if;
 -- Match JavaScript trim and UTF-16 string limits, including supplementary-plane characters.
 v:=btrim(p#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 if length(v)+length(regexp_replace(v,U&'[\0001-\FFFF]','','g')) not between 1 and maximum then raise exception 'invalid cash text';end if;return v;
end$$;
create function public.business_cash_integer(p jsonb,maximum numeric) returns numeric language plpgsql immutable set search_path=public,pg_temp as $$declare n numeric;begin
 if jsonb_typeof(p) is distinct from 'number' then raise exception 'invalid cash integer';end if;n:=(p#>>'{}')::numeric;if n<>trunc(n) or n<0 or n>maximum then raise exception 'invalid cash integer';end if;return n;
end$$;
create function public.business_cash_date(p jsonb) returns date language plpgsql immutable set search_path=public,pg_temp as $$declare d date;begin
 if jsonb_typeof(p) is distinct from 'string' or (p#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid cash date';end if;d:=(p#>>'{}')::date;if d<date '1900-01-01' or d>date '2200-12-31' or to_char(d,'YYYY-MM-DD')<>p#>>'{}' then raise exception 'invalid cash date';end if;return d;
end$$;
create function public.business_cash_validate(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb:=p;f jsonb;flows jsonb;k text;ids uuid[];fid uuid;total numeric;opening numeric;start_day date;text_bytes integer;begin
 perform business_cash_keys(v,array['caseId','title','currency','startDate','openingMinor','baseline','alternative']);
 v:=jsonb_set(v,'{caseId}',to_jsonb(business_cash_uuid(v->'caseId')));v:=jsonb_set(v,'{title}',to_jsonb(business_cash_text(v->'title',300)));
 if jsonb_typeof(v->'currency') is distinct from 'string' or v->>'currency' not in ('JPY','CNY','USD','EUR') then raise exception 'invalid cash currency';end if;
 start_day:=business_cash_date(v->'startDate');opening:=business_cash_integer(v->'openingMinor',1000000000000);text_bytes:=octet_length((v->'title')::text);
 foreach k in array array['baseline','alternative'] loop
  if jsonb_typeof(v->k) is distinct from 'array' then raise exception 'invalid cash flows';end if;if jsonb_array_length(v->k)>200 then raise exception 'too many cash flows';end if;
  ids:='{}';total:=opening;flows:='[]';
  for f in select value from jsonb_array_elements(v->k) loop
   perform business_cash_keys(f,array['id','date','label','direction','amountMinor','assumption']);fid:=business_cash_uuid(f->'id');if fid=any(ids) then raise exception 'duplicate cash flow';end if;ids:=array_append(ids,fid);f:=jsonb_set(f,'{id}',to_jsonb(fid));
   if business_cash_date(f->'date')<start_day then raise exception 'cash flow precedes start';end if;
   if jsonb_typeof(f->'direction') is distinct from 'string' or f->>'direction' not in ('in','out') then raise exception 'invalid cash direction';end if;
   total:=total+business_cash_integer(f->'amountMinor',1000000000000);f:=jsonb_set(f,'{label}',to_jsonb(business_cash_text(f->'label',300)));f:=jsonb_set(f,'{assumption}',to_jsonb(business_cash_text(f->'assumption',3000)));text_bytes:=text_bytes+octet_length((f->'label')::text)+octet_length((f->'assumption')::text);flows:=flows||jsonb_build_array(f);
  end loop;
  if total>9007199254740991 then raise exception 'unsafe cash total';end if;v:=jsonb_set(v,array[k],flows);
 end loop;if text_bytes>700000 then raise exception 'cash text too large: 文字太长，请精简假设说明后再保存';end if;return v;
end$$;
create function public.business_cash_context(p_owner uuid,p_case uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('caseId',c.id,'caseTitle',m.name) from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where c.user_id=p_owner and c.id=p_case
$$;
create function public.business_cash_dto(p business_cash_scenarios) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare c jsonb;begin
 c:=business_cash_context(p.user_id,p.case_id);return jsonb_build_object('id',p.id,'scenario',p.assumptions||jsonb_build_object('caseId',p.case_id),'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'sources',jsonb_build_object('caseAvailable',c is not null,'caseTitle',c->'caseTitle'));
end$$;
create function public.business_cash_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_hash text;v jsonb;v_case uuid;r business_cash_scenarios;receipt business_cash_receipts;begin
 perform business_cash_service(p_user_id);
 if p_operation='save' then perform business_cash_keys(p_input,array['operation','id','requestId','expectedRevision','scenario']);elsif p_operation='erase' then perform business_cash_keys(p_input,array['operation','id','requestId','expectedRevision']);else raise exception 'invalid cash operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid cash operation';end if;
 v_id:=business_cash_uuid(p_input->'id');v_request:=business_cash_uuid(p_input->'requestId');v_expected:=business_cash_integer(p_input->'expectedRevision',2147483646)::integer;if p_operation='erase' and v_expected=0 then raise exception 'invalid cash revision';end if;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,128));
 select * into receipt from business_cash_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'cash request conflict';end if;return jsonb_build_object('id',receipt.scenario_id,'revision',receipt.revision);end if;
 select * into r from business_cash_scenarios where user_id=p_user_id and id=v_id for update;
 if not found then
  if p_operation<>'save' or v_expected<>0 or exists(select 1 from business_cash_scenarios where id=v_id) or exists(select 1 from business_cash_receipts where user_id=p_user_id and scenario_id=v_id) then raise exception 'cash unavailable' using errcode='42501';end if;
 elsif r.revision<>v_expected then raise exception 'cash revision conflict: 另一页面已修改，请比较最新内容';end if;
 v_revision:=coalesce(r.revision,0)+1;
 if p_operation='save' then
  v:=business_cash_validate(p_input->'scenario');v_case:=business_cash_uuid(v->'caseId');
  if r.id is null then perform 1 from business_daily_cases where user_id=p_user_id and id=v_case for share;if business_cash_context(p_user_id,v_case) is null then raise exception 'cash source unavailable' using errcode='42501';end if;
   insert into business_cash_scenarios(id,user_id,case_id,assumptions,revision) values(v_id,p_user_id,v_case,v-'caseId',1);
  else if r.case_id<>v_case then raise exception 'cash source reference is frozen';end if;update business_cash_scenarios set assumptions=v-'caseId',revision=v_revision,updated_at=clock_timestamp() where id=v_id and user_id=p_user_id;end if;
 else delete from business_cash_scenarios where id=v_id and user_id=p_user_id;end if;
 insert into business_cash_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;
create function public.business_cash_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_cash_scenarios;v_id uuid;v_date timestamptz;v_before uuid;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;row_data record;begin
 perform business_cash_service(p_user_id);
 if p_operation='get' then perform business_cash_keys(p_input,array['id']);v_id:=business_cash_uuid(p_input->'id');select * into r from business_cash_scenarios where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_cash_dto(r);
 elsif p_operation='context' then perform business_cash_keys(p_input,array['caseId']);return business_cash_context(p_user_id,business_cash_uuid(p_input->'caseId'));
 elsif p_operation in ('list','cases') then perform business_cash_keys(p_input,'{}',array['before']);else raise exception 'invalid cash read';end if;
 if p_input?'before' then perform business_cash_keys(p_input->'before',array['date','id']);v_before:=business_cash_uuid(p_input->'before'->'id');if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or (p_input->'before'->>'date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid cash cursor';end if;v_date:=(p_input->'before'->>'date')::timestamptz;end if;
 if p_operation='list' then
  for r in select * from business_cash_scenarios where user_id=p_user_id and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_cash_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;end loop;
 else
  for row_data in select c.id,c.created_at,c.local_date,m.name from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where c.user_id=p_user_id and (v_before is null or (c.created_at,c.id)<(v_date,v_before)) order by c.created_at desc,c.id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(jsonb_build_object('id',row_data.id,'title',row_data.name,'date',row_data.local_date));v_next:=jsonb_build_object('date',row_data.created_at,'id',row_data.id);end if;end loop;
 end if;return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;
alter table public.business_cash_scenarios enable row level security;
alter table public.business_cash_receipts enable row level security;
revoke all on public.business_cash_scenarios,public.business_cash_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_cash_service(uuid),public.business_cash_keys(jsonb,text[],text[]),public.business_cash_uuid(jsonb),public.business_cash_text(jsonb,integer),public.business_cash_integer(jsonb,numeric),public.business_cash_date(jsonb),public.business_cash_validate(jsonb),public.business_cash_context(uuid,uuid),public.business_cash_dto(public.business_cash_scenarios),public.business_cash_command(uuid,text,jsonb),public.business_cash_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_cash_command(uuid,text,jsonb),public.business_cash_read(uuid,text,jsonb) to service_role;
commit;
