begin;
create table public.shared_premises (
 id uuid primary key,user_id uuid not null references auth.users(id),text text not null,invalid_when text not null,keywords text[] not null,
 revision integer not null check(revision>0),created_at timestamptz not null default clock_timestamp(),unique(user_id,id),
 check(length(btrim(text)) between 1 and 3000),check(length(btrim(invalid_when)) between 1 and 3000),check(cardinality(keywords) between 1 and 12)
);
create table public.shared_premise_links (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,premise_id uuid not null,target_kind text not null check(target_kind in('idea','business_case','method')),target_id uuid not null,
 rationale text not null check(length(btrim(rationale)) between 1 and 3000),created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,premise_id) references shared_premises(user_id,id) on delete cascade,unique(premise_id,target_kind,target_id)
);
create table public.shared_premise_reviews (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,premise_id uuid not null,news_id uuid not null,effect text not null check(length(btrim(effect)) between 1 and 3000),
 premise_text text not null,premise_invalid_when text not null,premise_revision integer not null check(premise_revision>0),
 created_at timestamptz not null default clock_timestamp(),foreign key(user_id,premise_id) references shared_premises(user_id,id) on delete cascade
);
-- No source, target or authored text in receipts; identifiers/digests only. Remain after erase for retry safety.
create table public.shared_premise_receipts (
 user_id uuid not null references auth.users(id),request_id uuid not null,input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 premise_id uuid not null,revision integer not null,operation text not null,primary key(user_id,request_id)
);
create index shared_premise_history on shared_premise_reviews(user_id,premise_id,created_at desc,id desc);
create index shared_premise_order on shared_premises(user_id,created_at desc,id desc);
create function public.shared_premise_service(p_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if coalesce(auth.role(),'')<>'service_role' or p_owner is null or not exists(select 1 from auth.users where id=p_owner) then raise exception 'premise service owner required' using errcode='42501';end if;
end$$;
create function public.shared_premise_keys(p jsonb,required text[],optional text[] default '{}') returns void language plpgsql set search_path=public,pg_temp as $$begin
 if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>60000 or exists(select 1 from jsonb_object_keys(p) k where not(k=any(required||optional))) or exists(select 1 from unnest(required) k where not(p?k)) then raise exception 'invalid premise keys';end if;
end$$;
create function public.shared_premise_uuid(p jsonb) returns uuid language plpgsql set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or (p#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid premise identifier';end if;return (p#>>'{}')::uuid;
end$$;
create function public.shared_premise_text(p jsonb,max_length integer default 3000) returns text language plpgsql set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or length(btrim(p#>>'{}')) not between 1 and max_length then raise exception 'invalid premise text';end if;return btrim(p#>>'{}');
end$$;
create function public.shared_premise_target(p_owner uuid,p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t text;h text;begin
 if p_kind='idea' then select title,'/ideas/'||id into t,h from ideas where user_id=p_owner and id=p_id;
 elsif p_kind='business_case' then select m.name,'/business-lab/'||c.id into t,h from business_daily_cases c join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where c.user_id=p_owner and c.id=p_id;
 elsif p_kind='method' then select e.payload->>'method','/business-lab/'||c.id||'#learning' into t,h from business_learning_entries e join business_daily_cases c on c.user_id=e.user_id and c.id=e.case_id join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id where e.user_id=p_owner and e.id=p_id and e.operation='method' and e.payload->'confirmed'='true'::jsonb;
 end if;
 return jsonb_build_object('id',p_id,'kind',p_kind,'title',t,'href',h,'available',t is not null and h is not null);
end$$;
create function public.shared_premise_news(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_id,'title',s.title,'summary',left(s.raw_text,1200),'available',s.id is not null,'fetchedAt',s.fetched_at) from (select 1) one left join external_signals s on s.id=p_id
$$;
create function public.shared_premise_dto(p shared_premises) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p.id,'text',p.text,'invalidWhen',p.invalid_when,'keywords',p.keywords,'revision',p.revision,'createdAt',p.created_at)
$$;
create function public.shared_premise_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request uuid;v_id uuid;v_hash text;v_expected integer;v_revision integer;r shared_premises;receipt shared_premise_receipts;v_target uuid;v_kind text;v_text text;v_invalid text;v_keywords text[]:='{}';k jsonb;begin
 perform shared_premise_service(p_user_id);
 if p_operation='save' then perform shared_premise_keys(p_input,array['operation','requestId','id','expectedRevision','text','invalidWhen','keywords']);
 elsif p_operation='erase' then perform shared_premise_keys(p_input,array['operation','requestId','id','expectedRevision']);
 elsif p_operation='link' then perform shared_premise_keys(p_input,array['operation','requestId','id','expectedRevision','targetKind','targetId','rationale']);
 elsif p_operation='unlink' then perform shared_premise_keys(p_input,array['operation','requestId','id','expectedRevision','linkId']);
 elsif p_operation='review' then perform shared_premise_keys(p_input,array['operation','requestId','id','expectedRevision','newsId','effect']);
 else raise exception 'invalid premise operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid premise operation';end if;
 v_request:=shared_premise_uuid(p_input->'requestId');v_id:=shared_premise_uuid(p_input->'id');
 if jsonb_typeof(p_input->'expectedRevision') is distinct from 'number' or (p_input->>'expectedRevision') !~ '^[0-9]+$' or (p_input->>'expectedRevision')::numeric>2147483646 then raise exception 'invalid premise revision';end if;v_expected:=(p_input->>'expectedRevision')::integer;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');
 -- One owner lock serializes receipt checks, creation, revision checks and all child writes atomically.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,125));
 select * into receipt from shared_premise_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'premise request conflict';end if;return jsonb_build_object('id',receipt.premise_id,'revision',receipt.revision,'operation',receipt.operation);end if;
 select * into r from shared_premises where id=v_id and user_id=p_user_id for update;
 if not found then
  if p_operation<>'save' or v_expected<>0 then raise exception 'premise unavailable' using errcode='42501';end if;
  if exists(select 1 from shared_premises where id=v_id) then raise exception 'premise unavailable' using errcode='42501';end if;
 elsif r.revision<>v_expected then raise exception 'premise revision conflict: 请重新读取，保留的文字可再填写';end if;
 v_revision:=coalesce(r.revision,0)+1;
 if p_operation='save' then
  v_text:=shared_premise_text(p_input->'text');v_invalid:=shared_premise_text(p_input->'invalidWhen');
  if jsonb_typeof(p_input->'keywords') is distinct from 'array' or jsonb_array_length(p_input->'keywords') not between 1 and 12 then raise exception 'invalid premise keywords';end if;
  for k in select value from jsonb_array_elements(p_input->'keywords') loop v_keywords:=array_append(v_keywords,shared_premise_text(k,80));end loop;
  if r.id is null then insert into shared_premises(id,user_id,text,invalid_when,keywords,revision) values(v_id,p_user_id,v_text,v_invalid,v_keywords,v_revision);
  else update shared_premises set text=v_text,invalid_when=v_invalid,keywords=v_keywords,revision=v_revision where id=v_id and user_id=p_user_id;end if;
 elsif p_operation='erase' then delete from shared_premises where id=v_id and user_id=p_user_id;
 else
  if p_operation='link' then
   v_target:=shared_premise_uuid(p_input->'targetId');v_kind:=shared_premise_text(p_input->'targetKind',20);
   if v_kind not in('idea','business_case','method') or (shared_premise_target(p_user_id,v_kind,v_target)->>'available')::boolean is distinct from true then raise exception 'premise target unavailable' using errcode='42501';end if;
   insert into shared_premise_links(user_id,premise_id,target_kind,target_id,rationale) values(p_user_id,v_id,v_kind,v_target,shared_premise_text(p_input->'rationale')) on conflict(premise_id,target_kind,target_id) do update set rationale=excluded.rationale;
  elsif p_operation='unlink' then
   v_target:=shared_premise_uuid(p_input->'linkId');delete from shared_premise_links where id=v_target and premise_id=v_id and user_id=p_user_id;if not found then raise exception 'premise link unavailable' using errcode='42501';end if;
  else
   v_target:=shared_premise_uuid(p_input->'newsId');perform 1 from external_signals where id=v_target for share;if not found then raise exception 'premise news unavailable' using errcode='42501';end if;
   insert into shared_premise_reviews(user_id,premise_id,news_id,effect,premise_text,premise_invalid_when,premise_revision) values(p_user_id,v_id,v_target,shared_premise_text(p_input->'effect'),r.text,r.invalid_when,r.revision);
  end if;
  update shared_premises set revision=v_revision where id=v_id and user_id=p_user_id;
 end if;
 insert into shared_premise_receipts values(p_user_id,v_request,v_hash,v_id,v_revision,p_operation);
 return jsonb_build_object('id',v_id,'revision',v_revision,'operation',p_operation);
end$$;
create function public.shared_premise_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r shared_premises;b shared_premises;v_premise shared_premises;v_id uuid;v_before uuid;v_kind text;v_items jsonb:='[]';v_count integer:=0;v_row record;v_time timestamptz;v_dto jsonb;begin
 perform shared_premise_service(p_user_id);
 if p_operation='list' then perform shared_premise_keys(p_input,array['operation'],array['before']);
 elsif p_operation='get' then perform shared_premise_keys(p_input,array['operation','id']);
 elsif p_operation='targets' then perform shared_premise_keys(p_input,array['operation','targetKind'],array['before']);
 elsif p_operation in('news','history') then perform shared_premise_keys(p_input,array['operation','id'],array['before']);
 else raise exception 'invalid premise read operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid premise read operation';end if;
 if p_input?'id' then v_id:=shared_premise_uuid(p_input->'id');select * into r from shared_premises where user_id=p_user_id and id=v_id;if not found then raise exception 'premise unavailable' using errcode='42501';end if;end if;
 if p_input?'before' then v_before:=shared_premise_uuid(p_input->'before');end if;
 if p_operation='get' then
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'rationale',l.rationale,'target',shared_premise_target(p_user_id,l.target_kind,l.target_id)) order by l.created_at,l.id),'[]'::jsonb) into v_items from shared_premise_links l where l.user_id=p_user_id and l.premise_id=v_id;
  return jsonb_build_object('premise',shared_premise_dto(r),'links',v_items);
 elsif p_operation='list' then
  if v_before is not null then select * into b from shared_premises where user_id=p_user_id and id=v_before;if not found then raise exception 'premise cursor unavailable';end if;end if;
  for v_premise in select * from shared_premises where user_id=p_user_id and (v_before is null or (created_at,id)<(b.created_at,b.id)) order by created_at desc,id desc limit 31 loop
   v_count:=v_count+1;if v_count<=30 then v_items:=v_items||jsonb_build_array(shared_premise_dto(v_premise));end if;
  end loop;
 elsif p_operation='targets' then
  v_kind:=shared_premise_text(p_input->'targetKind',20);if v_kind not in('idea','business_case','method') then raise exception 'invalid premise target kind';end if;
  if v_before is not null and (shared_premise_target(p_user_id,v_kind,v_before)->>'available')::boolean is distinct from true then raise exception 'premise cursor unavailable';end if;
  for v_row in select id from (select id from ideas where user_id=p_user_id and v_kind='idea' union all select id from business_daily_cases where user_id=p_user_id and v_kind='business_case' union all select id from business_learning_entries where user_id=p_user_id and v_kind='method' and operation='method' and payload->'confirmed'='true'::jsonb) targets where (v_before is null or id<v_before) and (shared_premise_target(p_user_id,v_kind,id)->>'available')::boolean order by id desc limit 31 loop
   v_count:=v_count+1;if v_count<=30 then v_items:=v_items||jsonb_build_array(shared_premise_target(p_user_id,v_kind,v_row.id));end if;
  end loop;
 elsif p_operation='news' then
  if v_before is not null then select fetched_at into v_time from external_signals where id=v_before;if not found then raise exception 'premise news cursor unavailable';end if;end if;
  -- strpos is a literal, case-insensitive substring match: percent/underscore are not wildcards.
  for v_row in select s.id from external_signals s where exists(select 1 from unnest(r.keywords) kw where strpos(lower(coalesce(s.title,'')||' '||coalesce(s.raw_text,'')),lower(kw))>0) and (v_before is null or (s.fetched_at,s.id)<(v_time,v_before)) order by s.fetched_at desc,s.id desc limit 31 loop
   v_count:=v_count+1;if v_count<=30 then v_items:=v_items||jsonb_build_array(shared_premise_news(v_row.id)||jsonb_build_object('lastReviewedAt',(select max(created_at) from shared_premise_reviews where user_id=p_user_id and premise_id=v_id and news_id=v_row.id)));end if;
  end loop;
 else
  if v_before is not null then select created_at into v_time from shared_premise_reviews where user_id=p_user_id and premise_id=v_id and id=v_before;if not found then raise exception 'premise history cursor unavailable';end if;end if;
  for v_row in select * from shared_premise_reviews where user_id=p_user_id and premise_id=v_id and (v_before is null or (created_at,id)<(v_time,v_before)) order by created_at desc,id desc limit 31 loop
   v_count:=v_count+1;v_dto:=jsonb_build_object('id',v_row.id,'effect',v_row.effect,'createdAt',v_row.created_at,'news',shared_premise_news(v_row.news_id),'premiseText',v_row.premise_text,'premiseInvalidWhen',v_row.premise_invalid_when,'premiseRevision',v_row.premise_revision);if v_count<=30 then v_items:=v_items||jsonb_build_array(v_dto);end if;
  end loop;
 end if;
 return jsonb_build_object('available',true,'items',v_items,'nextCursor',case when v_count>30 then v_items->-1->>'id' else null end);
end$$;
do $$declare t text;begin foreach t in array array['shared_premises','shared_premise_links','shared_premise_reviews','shared_premise_receipts'] loop
 execute format('alter table %I enable row level security',t);execute format('create policy premise_owner_read on %I for select to authenticated using(user_id=auth.uid())',t);
 execute format('revoke all on %I from public,anon,authenticated,service_role',t);execute format('grant select on %I to authenticated,service_role',t);
end loop;end$$;
revoke all on function shared_premise_service(uuid),shared_premise_keys(jsonb,text[],text[]),shared_premise_uuid(jsonb),shared_premise_text(jsonb,integer),shared_premise_target(uuid,text,uuid),shared_premise_news(uuid),shared_premise_dto(shared_premises),shared_premise_command(uuid,text,jsonb),shared_premise_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function shared_premise_command(uuid,text,jsonb),shared_premise_read(uuid,text,jsonb) to service_role;
commit;
