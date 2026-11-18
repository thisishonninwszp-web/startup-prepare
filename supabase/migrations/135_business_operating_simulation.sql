begin;
create table public.business_simulations(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,case_id uuid not null,setup jsonb not null,turns jsonb not null default '[]',revision integer not null check(revision between 1 and 7),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp());
create index business_simulation_order on public.business_simulations(user_id,created_at desc,id desc);
create index business_simulation_case_order on public.business_simulations(user_id,case_id,created_at desc,id desc);
-- Identifier/hash-only receipts also serve as deletion tombstones.
create table public.business_simulation_receipts(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,input_hash text not null check(input_hash~'^[0-9a-f]{64}$'),simulation_id uuid not null,revision integer not null,primary key(user_id,request_id));
create index business_simulation_receipt_record on public.business_simulation_receipts(user_id,simulation_id);create function public.business_simulation_service(p_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if coalesce(auth.role(),'')<>'service_role' or p_owner is null or not exists(select 1 from auth.users where id=p_owner) then raise exception 'simulation service owner required' using errcode='42501';end if;
end$$;

create function public.business_simulation_keys(p jsonb,required text[],optional text[] default '{}') returns void language plpgsql immutable set search_path=public,pg_temp as $$begin
 if p is null or jsonb_typeof(p) is distinct from 'object' or not(p?&required) or exists(select 1 from jsonb_object_keys(p) k where not(k=any(required||optional))) then raise exception 'invalid simulation fields';end if;
end$$;
create function public.business_simulation_uuid(p jsonb) returns uuid language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or (p#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid simulation identifier';end if;return (p#>>'{}')::uuid;
end$$;
create function public.business_simulation_text(p jsonb,maximum integer) returns text language plpgsql immutable set search_path=public,pg_temp as $$declare v text;begin
 if jsonb_typeof(p) is distinct from 'string' then raise exception 'invalid simulation text';end if;
 -- Match JavaScript trim and UTF-16 string limits, including supplementary-plane characters.
 v:=btrim(p#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 if length(v)+length(regexp_replace(v,U&'[\0001-\FFFF]','','g')) not between 1 and maximum then raise exception 'invalid simulation text';end if;return v;
end$$;
create function public.business_simulation_integer(p jsonb,maximum numeric) returns numeric language plpgsql immutable set search_path=public,pg_temp as $$declare n numeric;begin
 if jsonb_typeof(p) is distinct from 'number' then raise exception 'invalid simulation integer';end if;n:=(p#>>'{}')::numeric;if n<>trunc(n) or n<0 or n>maximum then raise exception 'invalid simulation integer';end if;return n;
end$$;
create function public.business_simulation_date(p jsonb) returns date language plpgsql immutable set search_path=public,pg_temp as $$declare d date;begin
 if jsonb_typeof(p) is distinct from 'string' or (p#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid simulation date';end if;d:=(p#>>'{}')::date;if d<date '1900-01-01' or d>date '2200-12-31' or to_char(d,'YYYY-MM-DD')<>p#>>'{}' then raise exception 'invalid simulation date';end if;return d;
end$$;

create function public.business_simulation_setup(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb:=p;k text;d date;begin
 perform business_simulation_keys(v,array['caseId','title','currency','startDate','openingMinor','initialStock','unitPriceMinor','unitCostMinor','shipCostMinor','capacityUnits','leadRounds','customerPays','orderLimitPerRound','changedOrderLimit','changedCapacity','changedLeadRounds','hypotheticalConfirmed']);
 v:=jsonb_set(v,'{caseId}',to_jsonb(business_simulation_uuid(v->'caseId')));v:=jsonb_set(v,'{title}',to_jsonb(business_simulation_text(v->'title',300)));
 d:=business_simulation_date(v->'startDate');if d+5>date '2200-12-31' then raise exception 'invalid simulation end date';end if;
 if jsonb_typeof(v->'currency') is distinct from 'string' or v->>'currency' not in ('JPY','CNY','USD','EUR') or jsonb_typeof(v->'customerPays') is distinct from 'string' or v->>'customerPays' not in ('order','shipment') or v->'hypotheticalConfirmed' is distinct from 'true'::jsonb then raise exception 'invalid simulation assumptions';end if;
 foreach k in array array['openingMinor','unitPriceMinor','unitCostMinor','shipCostMinor'] loop perform business_simulation_integer(v->k,1000000000);end loop;
 foreach k in array array['initialStock','capacityUnits','orderLimitPerRound','changedOrderLimit','changedCapacity'] loop perform business_simulation_integer(v->k,100000);end loop;
 if (v->>'capacityUnits')::integer<1 then raise exception 'invalid simulation capacity';end if;
 perform business_simulation_integer(v->'leadRounds',2);perform business_simulation_integer(v->'changedLeadRounds',2);return v;
end$$;
create function public.business_simulation_turn(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$declare v jsonb:=p;k text;begin
 perform business_simulation_keys(v,array['purchaseUnits','acceptUnits','shipUnits','cancelUnits','reason','checkNext']);
 foreach k in array array['purchaseUnits','acceptUnits','shipUnits','cancelUnits'] loop perform business_simulation_integer(v->k,100000);end loop;
 v:=jsonb_set(v,'{reason}',to_jsonb(business_simulation_text(v->'reason',3000)));v:=jsonb_set(v,'{checkNext}',to_jsonb(business_simulation_text(v->'checkNext',3000)));return v;
end$$;
-- Batches are at most six purchase/order entries; never allocate one row per unit.
create function public.business_simulation_replay(p_setup jsonb,p_turns jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare s jsonb;t jsonb;r integer:=0;lead integer;cap integer;lim integer;stock bigint;cash bigint;minimum_cash bigint;orders jsonb:='[]';supplies jsonb:='[]';updated jsonb;o jsonb;n integer;left_units integer;purchase integer;accepted integer;shipped integer;cancelled integer;outstanding integer;begin
 s:=business_simulation_setup(p_setup);if jsonb_typeof(p_turns) is distinct from 'array' or jsonb_array_length(p_turns)>6 then raise exception 'invalid simulation turns';end if;
 cash:=(s->>'openingMinor')::bigint;minimum_cash:=cash;stock:=(s->>'initialStock')::bigint;
 for t in select value from jsonb_array_elements(p_turns) loop
  t:=business_simulation_turn(t);r:=r+1;lead:=(s->>case when r>=2 then 'changedLeadRounds' else 'leadRounds' end)::integer;cap:=(s->>case when r>=4 then 'changedCapacity' else 'capacityUnits' end)::integer;lim:=(s->>case when r>=3 then 'changedOrderLimit' else 'orderLimitPerRound' end)::integer;
  updated:='[]';for o in select value from jsonb_array_elements(supplies) loop if (o->>'round')::integer=r then stock:=stock+(o->>'units')::integer;else updated:=updated||jsonb_build_array(o);end if;end loop;supplies:=updated;
  purchase:=(t->>'purchaseUnits')::integer;accepted:=(t->>'acceptUnits')::integer;shipped:=(t->>'shipUnits')::integer;cancelled:=(t->>'cancelUnits')::integer;
  cash:=cash-purchase::bigint*(s->>'unitCostMinor')::bigint;minimum_cash:=least(minimum_cash,cash);if purchase>0 then if lead=0 then stock:=stock+purchase;else supplies:=supplies||jsonb_build_array(jsonb_build_object('round',r+lead,'units',purchase));end if;end if;
  select coalesce(sum((value->>'units')::integer),0) into outstanding from jsonb_array_elements(orders);if cancelled>outstanding then raise exception 'invalid simulation cancellation';end if;
  left_units:=cancelled;updated:='[]';for o in select value from jsonb_array_elements(orders) loop n:=least(left_units,(o->>'units')::integer);left_units:=left_units-n;if (o->>'units')::integer>n then updated:=updated||jsonb_build_array(jsonb_set(o,'{units}',to_jsonb((o->>'units')::integer-n)));end if;end loop;orders:=updated;
  if s->>'customerPays'='order' then cash:=cash-cancelled::bigint*(s->>'unitPriceMinor')::bigint;minimum_cash:=least(minimum_cash,cash);end if;
  if accepted>lim then raise exception 'invalid simulation order cap';end if;if accepted>0 then orders:=orders||jsonb_build_array(jsonb_build_object('round',r,'dueRound',r+1,'units',accepted));if s->>'customerPays'='order' then cash:=cash+accepted::bigint*(s->>'unitPriceMinor')::bigint;end if;end if;
  select coalesce(sum((value->>'units')::integer),0) into outstanding from jsonb_array_elements(orders);if shipped>least(stock,cap,outstanding) then raise exception 'invalid simulation shipment';end if;
  stock:=stock-shipped;left_units:=shipped;updated:='[]';for o in select value from jsonb_array_elements(orders) loop n:=least(left_units,(o->>'units')::integer);left_units:=left_units-n;if (o->>'units')::integer>n then updated:=updated||jsonb_build_array(jsonb_set(o,'{units}',to_jsonb((o->>'units')::integer-n)));end if;end loop;orders:=updated;
  if s->>'customerPays'='shipment' then cash:=cash+shipped::bigint*(s->>'unitPriceMinor')::bigint;end if;cash:=cash-shipped::bigint*(s->>'shipCostMinor')::bigint;minimum_cash:=least(minimum_cash,cash);
  if abs(cash)>9007199254740991 then raise exception 'unsafe simulation cash';end if;
 end loop;return jsonb_build_object('cashMinor',cash,'minimumCashMinor',minimum_cash,'stock',stock,'orders',orders,'supplies',supplies);
end$$;
create function public.business_simulation_context(p_owner uuid,p_case uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('caseId',c.id,'caseTitle',m.name) from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where c.user_id=p_owner and c.id=p_case
$$;
create function public.business_simulation_dto(p business_simulations) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare c jsonb;begin
 c:=business_simulation_context(p.user_id,p.case_id);return jsonb_build_object('id',p.id,'setup',p.setup||jsonb_build_object('caseId',p.case_id),'turns',p.turns,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'sources',jsonb_build_object('caseAvailable',c is not null,'caseTitle',c->'caseTitle'));
end$$;
create function public.business_simulation_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_hash text;v jsonb;v_turn jsonb;v_case uuid;r business_simulations;receipt business_simulation_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_operation='create' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','setup']);elsif p_operation='turn' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','turn']);elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);else raise exception 'invalid simulation operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid simulation operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');v_expected:=business_simulation_integer(p_input->'expectedRevision',7)::integer;
 if (p_operation='create' and v_expected<>0) or (p_operation<>'create' and v_expected=0) or (p_operation='turn' and v_expected>6) then raise exception 'invalid simulation revision';end if;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,135));
 select * into receipt from business_simulation_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'simulation request conflict';end if;return jsonb_build_object('id',receipt.simulation_id,'revision',receipt.revision);end if;
 select * into r from business_simulations where user_id=p_user_id and id=v_id for update;
 if p_operation='create' then
  if r.id is not null or exists(select 1 from business_simulations where id=v_id) or exists(select 1 from business_simulation_receipts where user_id=p_user_id and simulation_id=v_id) then raise exception 'simulation unavailable' using errcode='42501';end if;
  v:=business_simulation_setup(p_input->'setup');v_case:=business_simulation_uuid(v->'caseId');perform 1 from business_daily_cases where user_id=p_user_id and id=v_case for share;if business_simulation_context(p_user_id,v_case) is null then raise exception 'simulation source unavailable' using errcode='42501';end if;
  insert into business_simulations(id,user_id,case_id,setup,revision) values(v_id,p_user_id,v_case,v-'caseId',1);v_revision:=1;
 else
  if r.id is null then raise exception 'simulation unavailable' using errcode='42501';end if;if r.revision<>v_expected then raise exception 'simulation revision conflict: 另一页面已经推进，请比较最新内容';end if;v_revision:=r.revision+1;
  if p_operation='turn' then v_turn:=business_simulation_turn(p_input->'turn');perform business_simulation_replay(r.setup||jsonb_build_object('caseId',r.case_id),r.turns||jsonb_build_array(v_turn));update business_simulations set turns=turns||jsonb_build_array(v_turn),revision=v_revision,updated_at=clock_timestamp() where id=v_id and user_id=p_user_id;
  else delete from business_simulations where id=v_id and user_id=p_user_id;end if;
 end if;
 insert into business_simulation_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;
create function public.business_simulation_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_simulations;v_id uuid;v_case uuid;v_date timestamptz;v_before uuid;v_items jsonb:='[]';v_count integer:=0;v_next jsonb;row_data record;begin
 perform business_simulation_service(p_user_id);
 if p_operation='get' then perform business_simulation_keys(p_input,array['id']);v_id:=business_simulation_uuid(p_input->'id');select * into r from business_simulations where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_simulation_dto(r);
 elsif p_operation='context' then perform business_simulation_keys(p_input,array['caseId']);return business_simulation_context(p_user_id,business_simulation_uuid(p_input->'caseId'));
 elsif p_operation='list' then perform business_simulation_keys(p_input,'{}',array['before','caseId']);if p_input?'caseId' then v_case:=business_simulation_uuid(p_input->'caseId');end if;
 elsif p_operation='cases' then perform business_simulation_keys(p_input,'{}',array['before']);else raise exception 'invalid simulation read';end if;
 if p_input?'before' then perform business_simulation_keys(p_input->'before',array['date','id']);v_before:=business_simulation_uuid(p_input->'before'->'id');if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or (p_input->'before'->>'date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid simulation cursor';end if;v_date:=(p_input->'before'->>'date')::timestamptz;end if;
 if p_operation='list' then
  for r in select * from business_simulations where user_id=p_user_id and (v_case is null or case_id=v_case) and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_simulation_dto(r));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;end loop;
 else
  for row_data in select c.id,c.created_at,c.local_date,m.name from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where c.user_id=p_user_id and (v_before is null or (c.created_at,c.id)<(v_date,v_before)) order by c.created_at desc,c.id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(jsonb_build_object('id',row_data.id,'title',row_data.name,'date',row_data.local_date));v_next:=jsonb_build_object('date',row_data.created_at,'id',row_data.id);end if;end loop;
 end if;return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;
alter table public.business_simulations enable row level security;
alter table public.business_simulation_receipts enable row level security;
revoke all on public.business_simulations,public.business_simulation_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_simulation_service(uuid),public.business_simulation_keys(jsonb,text[],text[]),public.business_simulation_uuid(jsonb),public.business_simulation_text(jsonb,integer),public.business_simulation_integer(jsonb,numeric),public.business_simulation_date(jsonb),public.business_simulation_setup(jsonb),public.business_simulation_turn(jsonb),public.business_simulation_replay(jsonb,jsonb),public.business_simulation_context(uuid,uuid),public.business_simulation_dto(public.business_simulations),public.business_simulation_command(uuid,text,jsonb),public.business_simulation_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_simulation_command(uuid,text,jsonb),public.business_simulation_read(uuid,text,jsonb) to service_role;
commit;
