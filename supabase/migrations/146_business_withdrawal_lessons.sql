begin;

create table public.business_withdrawal_issuers(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,domain text not null,subject_identity_key text not null,
 created_at timestamptz not null default clock_timestamp(),confirmed_at timestamptz not null default clock_timestamp(),
 unique(user_id,id),unique(user_id,domain,subject_identity_key)
);
create table public.business_withdrawal_lessons(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 identity_key text not null,subject_scope text not null check(subject_scope in('company','business','store','product')),
 event text not null check(event in('exit','shrink','stop')),phase text not null check(phase in('announced','completed')),
 announced_on date,effective_on date,payload jsonb,confirmed boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),erased_at timestamptz,
 unique(user_id,id),unique(user_id,identity_key),check((erased_at is null)=(payload is not null)),check(erased_at is null or not confirmed)
);
create table public.business_withdrawal_sources(
 id uuid primary key,user_id uuid not null,issuer_id uuid not null,source_url text not null,
 captured_text text not null,captured_at timestamptz not null,published_on date,
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),erased_at timestamptz,
 foreign key(user_id,id) references business_withdrawal_lessons(user_id,id),
 foreign key(user_id,issuer_id) references business_withdrawal_issuers(user_id,id),
 check(erased_at is null or captured_text='')
);
create table public.business_withdrawal_receipts(
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),result jsonb not null,primary key(user_id,request_id)
);
create index business_withdrawal_lesson_order on public.business_withdrawal_lessons(user_id,created_at desc,id desc);
create index business_withdrawal_issuer_order on public.business_withdrawal_issuers(user_id,created_at desc,id desc);

lock table public.business_daily_cases in share row exclusive mode;
alter table public.business_daily_cases
 add column case_kind text not null default 'shop' check(case_kind in('shop','withdrawal')),
 add column withdrawal_lesson_id uuid,
 alter column merchant_id drop not null,
 drop constraint business_daily_cases_user_id_local_date_key,
 add constraint business_case_exact_subject check(
  (case_kind='shop' and merchant_id is not null and withdrawal_lesson_id is null)
  or(case_kind='withdrawal' and merchant_id is null and withdrawal_lesson_id is not null and published_revision_id is null)
 ),
 add constraint business_case_owned_withdrawal foreign key(user_id,withdrawal_lesson_id) references public.business_withdrawal_lessons(user_id,id);
create unique index business_case_daily_kind on public.business_daily_cases(user_id,local_date,case_kind);
create unique index business_case_withdrawal_once on public.business_daily_cases(user_id,withdrawal_lesson_id) where case_kind='withdrawal';

create or replace function public.business_case_identity_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.user_id is distinct from old.user_id or new.id is distinct from old.id or new.local_date is distinct from old.local_date or new.merchant_id is distinct from old.merchant_id or new.timezone is distinct from old.timezone or new.selection_reason is distinct from old.selection_reason or new.case_kind is distinct from old.case_kind or new.withdrawal_lesson_id is distinct from old.withdrawal_lesson_id then raise exception 'business daily identity is immutable';end if;return new;
end$$;

create function public.business_withdrawal_text(p jsonb,p_max integer) returns text language plpgsql immutable set search_path=public,pg_temp as $$declare v text;begin
 if jsonb_typeof(p) is distinct from 'string' then raise exception 'invalid withdrawal text';end if;
 v:=p#>>'{}';if length(v)+length(regexp_replace(v,U&'[\0001-\FFFF]','','g'))>p_max then raise exception 'invalid withdrawal text length';end if;
 v:=regexp_replace(v,U&'^[[:space:]\3000\FEFF]+|[[:space:]\3000\FEFF]+$','','g');
 if v='' then raise exception 'invalid withdrawal text length';end if;return v;
end$$;
create function public.business_withdrawal_identity(p jsonb) returns text language plpgsql immutable set search_path=public,pg_temp as $$declare v text;k text;r text[]:='{}';begin
 perform business_simulation_keys(p,array['name','operator','market','scope','identityKey']);
 if p->>'scope' not in('company','business','store','product') then raise exception 'invalid withdrawal scope';end if;
 foreach k in array array['operator','market','scope','name'] loop
  v:=business_withdrawal_text(p->k,300);if position('|' in v)>0 then raise exception 'invalid withdrawal identity separator';end if;
  v:=lower(btrim(regexp_replace(normalize(v,NFKC),U&'[[:space:]\3000\FEFF]+',' ','g')));r:=array_append(r,v);
 end loop;
 v:=array_to_string(r,'|');if p->>'identityKey' is distinct from v then raise exception 'withdrawal identity key mismatch';end if;return v;
end$$;
create function public.business_withdrawal_domain(p jsonb) returns text language plpgsql immutable set search_path=public,pg_temp as $$declare v text;begin
 v:=business_withdrawal_text(p,253);
 if v!~'^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' or v~'\.(local|localhost)$' then raise exception 'invalid official domain';end if;return v;
end$$;
create function public.business_withdrawal_url(p jsonb,p_domain text) returns text language plpgsql immutable set search_path=public,pg_temp as $$declare v text;a text;begin
 v:=business_withdrawal_text(p,2000);
 if v is distinct from p#>>'{}' or v!~'^https://' or v~U&'[\0001-\0020\007F-\009F\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' or position(chr(92) in v)>0 or v~*'%(0[0-9a-f]|1[0-9a-f]|7f)' then raise exception 'invalid official HTTPS URL';end if;
 a:=split_part(split_part(split_part(substr(v,9),'/',1),'?',1),'#',1);
 if a is distinct from p_domain then raise exception 'official URL must match registered domain exactly';end if;return v;
end$$;
create function public.business_withdrawal_stamp(p jsonb) returns timestamptz language plpgsql stable set search_path=public,pg_temp as $$declare v text;d timestamptz;begin
 v:=business_withdrawal_text(p,80);
 if v!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid withdrawal timestamp';end if;
 perform business_simulation_date(to_jsonb(left(v,10)));d:=v::timestamptz;return d;
end$$;
create function public.business_withdrawal_date_binding(p_date jsonb,p_quote jsonb,p_text text) returns void language plpgsql stable set search_path=public,pg_temp as $$declare d date;q text;y text;m text;n text;begin
 if p_date='null'::jsonb then if p_quote is distinct from 'null'::jsonb then raise exception 'unknown date requires null quote';end if;return;end if;
 d:=business_simulation_date(p_date);q:=business_withdrawal_text(p_quote,3000);y:=extract(year from d)::integer::text;m:=extract(month from d)::integer::text;n:=extract(day from d)::integer::text;
 if position(q in p_text)=0 or (position(d::text in q)=0 and position(y||'/'||m||'/'||n in q)=0 and position(y||'年'||m||'月'||n||'日' in q)=0 and position(y||'年'||lpad(m,2,'0')||'月'||lpad(n,2,'0')||'日' in q)=0) then raise exception 'withdrawal date needs its own exact quote';end if;
end$$;
create function public.business_withdrawal_validate(p_owner uuid,p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i business_withdrawal_issuers;s jsonb;b jsonb;t text;k text;q text;v_key text;begin
 perform business_simulation_keys(p,array['subject','event','phase','announcedOn','effectiveOn','source','eventQuote','reasonQuote','bindings','offering','buyers','explanationA','explanationB','distinguishingObservation','unknowns']);
 v_key:=business_withdrawal_identity(p->'subject');
 if jsonb_typeof(p->'event') is distinct from 'string' or p->>'event' not in('exit','shrink','stop') or jsonb_typeof(p->'phase') is distinct from 'string' or p->>'phase' not in('announced','completed') then raise exception 'invalid withdrawal event or phase';end if;
 if p->'offering' is distinct from 'null'::jsonb or p->'buyers' is distinct from 'null'::jsonb then raise exception 'offering and buyers require separate literal evidence; leave unknown';end if;
 s:=p->'source';perform business_simulation_keys(s,array['issuerId','url','text','capturedAt','publishedOn']);
 select * into i from business_withdrawal_issuers where user_id=p_owner and id=business_simulation_uuid(s->'issuerId') for share;
 if not found or i.subject_identity_key<>v_key then raise exception 'official issuer subject owner unavailable' using errcode='42501';end if;
 perform business_withdrawal_url(s->'url',i.domain);t:=business_withdrawal_text(s->'text',60000);if business_withdrawal_stamp(s->'capturedAt')>clock_timestamp()+interval '5 minutes' then raise exception 'withdrawal capture cannot be in the future';end if;
 b:=p->'bindings';perform business_simulation_keys(b,array['subject','phase','announcedOn','effectiveOn','publishedOn']);
 foreach k in array array['subject','phase'] loop q:=business_withdrawal_text(b->k,3000);if position(q in t)=0 then raise exception 'withdrawal claim needs exact quote';end if;end loop;
 if position(p->'subject'->>'name' in b->>'subject')=0 or position(p->'subject'->>'operator' in b->>'subject')=0 or position(p->'subject'->>'market' in b->>'subject')=0 then raise exception 'subject name, operator and market need exact quote';end if;
 foreach k in array array['eventQuote','reasonQuote'] loop if p->k is distinct from 'null'::jsonb then q:=business_withdrawal_text(p->k,3000);if position(q in t)=0 then raise exception 'withdrawal claim needs exact quote';end if;elsif k='eventQuote' then raise exception 'withdrawal event quote required';end if;end loop;
 foreach k in array array['announcedOn','effectiveOn'] loop perform business_withdrawal_date_binding(p->k,b->k,t);end loop;
 perform business_withdrawal_date_binding(s->'publishedOn',b->'publishedOn',t);
 foreach k in array array['explanationA','explanationB','distinguishingObservation'] loop if p->k is distinct from 'null'::jsonb then perform business_withdrawal_text(p->k,3000);end if;end loop;
 if jsonb_typeof(p->'unknowns') is distinct from 'array' or jsonb_array_length(p->'unknowns')>20 then raise exception 'invalid withdrawal unknowns';end if;
 for s in select value from jsonb_array_elements(p->'unknowns') loop perform business_withdrawal_text(s,3000);end loop;
 return p;
end$$;

create function public.business_withdrawal_source_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='UPDATE' and new.captured_text='' and old.erased_at is null and new.erased_at is not null and (to_jsonb(new)-array['captured_text','erased_at'])=(to_jsonb(old)-array['captured_text','erased_at']) then return new;end if;
 raise exception 'official source is immutable';
end$$;
create trigger business_withdrawal_source_immutable before update or delete on public.business_withdrawal_sources for each row execute function public.business_withdrawal_source_guard();

create function public.business_withdrawal_issuer_dto(p business_withdrawal_issuers) returns jsonb language sql stable set search_path=public,pg_temp as $$select jsonb_build_object('id',p.id,'name',p.name,'domain',p.domain,'subjectIdentityKey',p.subject_identity_key,'createdAt',p.created_at,'confirmedAt',p.confirmed_at)$$;
create function public.business_withdrawal_dto(p business_withdrawal_lessons) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare s business_withdrawal_sources;c uuid;v_selected date;v jsonb;begin
 select * into s from business_withdrawal_sources where user_id=p.user_id and id=p.id;
 select id,local_date into c,v_selected from business_daily_cases where user_id=p.user_id and withdrawal_lesson_id=p.id and case_kind='withdrawal';
 if p.erased_at is null then v:=p.payload;
 else v:=jsonb_build_object('subject',jsonb_build_object('name','','operator','','market','','scope',p.subject_scope,'identityKey',p.identity_key),'eventQuote','','reasonQuote',null,'bindings',jsonb_build_object('subject','','phase','','announcedOn',null,'effectiveOn',null,'publishedOn',null),'offering',null,'buyers',null,'explanationA',null,'explanationB',null,'distinguishingObservation',null,'unknowns','[]'::jsonb);end if;
 return v||jsonb_build_object('id',p.id,'caseId',c,'selectedOn',v_selected,'event',p.event,'phase',p.phase,'announcedOn',p.announced_on,'effectiveOn',p.effective_on,'source',jsonb_build_object('issuerId',s.issuer_id,'url',s.source_url,'text',s.captured_text,'capturedAt',s.captured_at,'publishedOn',s.published_on,'contentHash',s.content_hash),'confirmed',p.confirmed,'revision',p.revision,'createdAt',p.created_at,'erasedAt',p.erased_at);
end$$;
create function public.business_subject_context(p_owner uuid,p_case uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('caseId',c.id,'caseTitle',case c.case_kind when 'shop' then m.name else l.payload->'subject'->>'name' end,'kind',c.case_kind)
 from business_daily_cases c left join business_merchants m on m.user_id=c.user_id and m.id=c.merchant_id
 left join business_withdrawal_lessons l on l.user_id=c.user_id and l.id=c.withdrawal_lesson_id and l.erased_at is null
 where c.user_id=p_owner and c.id=p_case and ((c.case_kind='shop' and m.id is not null) or(c.case_kind='withdrawal' and l.id is not null))
$$;
create function public.business_withdrawal_explanation_source(p_owner uuid,p_lesson uuid,p_revision integer) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('caseId',c.id,'title',l.payload->'subject'->>'name','explanationA',l.payload->'explanationA','explanationB',l.payload->'explanationB','distinguishingObservation',l.payload->'distinguishingObservation',
 'refs',jsonb_build_array(jsonb_build_object('quote',l.payload->'eventQuote','url',s.source_url)),
 'anchor',jsonb_build_object('kind','withdrawal','lessonId',l.id,'lessonRevision',l.revision))
 from business_withdrawal_lessons l join business_daily_cases c on c.user_id=l.user_id and c.withdrawal_lesson_id=l.id and c.case_kind='withdrawal'
 join business_withdrawal_sources s on s.user_id=l.user_id and s.id=l.id and s.erased_at is null and s.captured_text<>''
 where l.user_id=p_owner and l.id=p_lesson and l.revision=p_revision and l.erased_at is null and l.confirmed and nullif(l.payload->>'explanationA','') is not null and nullif(l.payload->>'explanationB','') is not null
 and encode(sha256(convert_to(s.captured_text,'UTF8')),'hex')=s.content_hash and position(l.payload->>'eventQuote' in s.captured_text)>0
$$;

create function public.business_withdrawal_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_hash text;v_key text;v_revision integer;v_result jsonb;v jsonb;s jsonb;i business_withdrawal_issuers;l business_withdrawal_lessons;src business_withdrawal_sources;r business_withdrawal_receipts;c business_daily_cases;begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>250000 or p_input->>'operation' is distinct from p_operation then raise exception 'invalid withdrawal input';end if;
 if p_operation='register_issuer' then perform business_simulation_keys(p_input,array['operation','id','requestId','issuer','confirmed']);
 elsif p_operation='save' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','lesson','confirmed']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);
 elsif p_operation='select_today' then perform business_simulation_keys(p_input,array['operation','requestId']);else raise exception 'invalid withdrawal operation';end if;
 v_request:=business_simulation_uuid(p_input->'requestId');v_hash:=encode(sha256(convert_to('withdrawal146:'||p_operation||':'||p_input::text,'UTF8')),'hex');
 -- Use the established shop/learning lock first, so selection and erasure serialize with legacy commands.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into r from business_withdrawal_receipts where user_id=p_user_id and request_id=v_request;
 if found then if r.input_hash<>v_hash then raise exception 'withdrawal request conflict';end if;return r.result;end if;
 if p_operation<>'select_today' then v_id:=business_simulation_uuid(p_input->'id');end if;
 if p_operation='register_issuer' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'official issuer requires explicit confirmation';end if;
  v:=p_input->'issuer';perform business_simulation_keys(v,array['name','domain','subjectIdentityKey']);
  if exists(select 1 from business_withdrawal_issuers where id=v_id) then raise exception 'issuer identifier unavailable' using errcode='42501';end if;
  insert into business_withdrawal_issuers(id,user_id,name,domain,subject_identity_key) values(v_id,p_user_id,business_withdrawal_text(v->'name',300),business_withdrawal_domain(v->'domain'),business_withdrawal_text(v->'subjectIdentityKey',1000));
  v_result:=jsonb_build_object('id',v_id,'revision',1);
 elsif p_operation='save' then
  if jsonb_typeof(p_input->'confirmed') is distinct from 'boolean' then raise exception 'manual disclosure confirmation boolean required';end if;
  v_revision:=business_simulation_integer(p_input->'expectedRevision',2147483646)::integer;
  v:=business_withdrawal_validate(p_user_id,p_input->'lesson');s:=v->'source';v_key:=business_withdrawal_identity(v->'subject');
  select * into l from business_withdrawal_lessons where user_id=p_user_id and id=v_id for update;
  if not found then
   if v_revision<>0 or exists(select 1 from business_withdrawal_lessons where id=v_id) then raise exception 'withdrawal lesson unavailable' using errcode='42501';end if;
   if exists(select 1 from business_withdrawal_lessons where user_id=p_user_id and identity_key=v_key) then raise exception 'withdrawal subject identity already recorded';end if;
   insert into business_withdrawal_lessons(id,user_id,identity_key,subject_scope,event,phase,announced_on,effective_on,payload,confirmed)
   values(v_id,p_user_id,v_key,v->'subject'->>'scope',v->>'event',v->>'phase',(v->>'announcedOn')::date,(v->>'effectiveOn')::date,v-'source',(p_input->>'confirmed')::boolean) returning * into l;
   insert into business_withdrawal_sources(id,user_id,issuer_id,source_url,captured_text,captured_at,published_on,content_hash)
   values(v_id,p_user_id,business_simulation_uuid(s->'issuerId'),s->>'url',s->>'text',business_withdrawal_stamp(s->'capturedAt'),(s->>'publishedOn')::date,encode(sha256(convert_to(s->>'text','UTF8')),'hex'));
  else
   if l.erased_at is not null then raise exception 'withdrawal lesson unavailable' using errcode='42501';end if;
   if l.revision<>v_revision then raise exception 'withdrawal revision conflict';end if;
   select * into src from business_withdrawal_sources where user_id=p_user_id and id=l.id for share;
   if l.identity_key<>v_key or l.subject_scope<>v->'subject'->>'scope' or l.event<>v->>'event' or l.phase<>v->>'phase' or l.announced_on is distinct from (v->>'announcedOn')::date or l.effective_on is distinct from (v->>'effectiveOn')::date
   or src.issuer_id is distinct from business_simulation_uuid(s->'issuerId') or src.source_url is distinct from s->>'url' or src.captured_text is distinct from s->>'text' or src.captured_at is distinct from business_withdrawal_stamp(s->'capturedAt') or src.published_on is distinct from (s->>'publishedOn')::date
   or (l.payload-array['explanationA','explanationB','distinguishingObservation','unknowns']) is distinct from ((v-'source')-array['explanationA','explanationB','distinguishingObservation','unknowns']) then raise exception 'withdrawal source and factual anchor are immutable';end if;
   if exists(select 1 from business_daily_cases where user_id=p_user_id and withdrawal_lesson_id=l.id) then raise exception 'published withdrawal lesson is immutable';end if;
   update business_withdrawal_lessons set payload=v-'source',confirmed=(p_input->>'confirmed')::boolean,revision=revision+1 where user_id=p_user_id and id=v_id returning * into l;
  end if;
  v_result:=jsonb_build_object('id',l.id,'revision',l.revision);
 elsif p_operation='erase' then
  v_revision:=business_simulation_integer(p_input->'expectedRevision',2147483646)::integer;
  select * into l from business_withdrawal_lessons where user_id=p_user_id and id=v_id for update;
  if not found or l.erased_at is not null then raise exception 'withdrawal lesson unavailable' using errcode='42501';end if;
  if l.revision<>v_revision then raise exception 'withdrawal revision conflict';end if;
  update business_withdrawal_sources set captured_text='',erased_at=clock_timestamp() where user_id=p_user_id and id=v_id;
  update business_withdrawal_lessons set payload=null,confirmed=false,erased_at=clock_timestamp(),revision=revision+1 where user_id=p_user_id and id=v_id returning * into l;
  v_result:=jsonb_build_object('id',l.id,'revision',l.revision);
 else
  select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() and case_kind='withdrawal' for update;
  if not found then
   select lessons.* into l from business_withdrawal_lessons lessons join business_withdrawal_sources sources on sources.user_id=lessons.user_id and sources.id=lessons.id and sources.erased_at is null and sources.captured_text<>''
   where lessons.user_id=p_user_id and lessons.confirmed and lessons.erased_at is null and not exists(select 1 from business_daily_cases cases where cases.user_id=p_user_id and cases.withdrawal_lesson_id=lessons.id)
   order by lessons.created_at,lessons.id limit 1 for update of lessons;
   if found then insert into business_daily_cases(user_id,local_date,merchant_id,case_kind,withdrawal_lesson_id,state,selection_reason) values(p_user_id,business_today(),null,'withdrawal',l.id,'ready','Verified official disclosure selected from the owned queue') returning * into c;end if;
  else select * into l from business_withdrawal_lessons where user_id=p_user_id and id=c.withdrawal_lesson_id;end if;
  v_result:=jsonb_build_object('id',l.id,'caseId',c.id,'revision',l.revision);
 end if;
 insert into business_withdrawal_receipts(user_id,request_id,input_hash,result) values(p_user_id,v_request,v_hash,v_result);return v_result;
end$$;

create function public.business_withdrawal_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_before uuid;v_date timestamptz;v_count integer:=0;v_items jsonb:='[]';v_next jsonb;l business_withdrawal_lessons;i business_withdrawal_issuers;begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2000 then raise exception 'invalid withdrawal read';end if;
 if p_operation='get' then perform business_simulation_keys(p_input,array['id']);v_id:=business_simulation_uuid(p_input->'id');select * into l from business_withdrawal_lessons where user_id=p_user_id and id=v_id;if not found then return null;end if;return business_withdrawal_dto(l);
 elsif p_operation='today' then perform business_simulation_keys(p_input,'{}');select lessons.* into l from business_daily_cases cases join business_withdrawal_lessons lessons on lessons.user_id=cases.user_id and lessons.id=cases.withdrawal_lesson_id where cases.user_id=p_user_id and cases.local_date=business_today() and cases.case_kind='withdrawal';if not found then return null;end if;return business_withdrawal_dto(l);
 elsif p_operation not in('list','issuers') or p_operation is null then raise exception 'invalid withdrawal read operation';end if;
 perform business_simulation_keys(p_input,'{}',array['before']);
 if p_input?'before' then perform business_simulation_keys(p_input->'before',array['date','id']);v_before:=business_simulation_uuid(p_input->'before'->'id');v_date:=business_withdrawal_stamp(p_input->'before'->'date');end if;
 if p_operation='list' then
  for l in select * from business_withdrawal_lessons where user_id=p_user_id and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_withdrawal_dto(l));v_next:=jsonb_build_object('date',l.created_at,'id',l.id);end if;end loop;
 else
  for i in select * from business_withdrawal_issuers where user_id=p_user_id and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(business_withdrawal_issuer_dto(i));v_next:=jsonb_build_object('date',i.created_at,'id',i.id);end if;end loop;
 end if;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

alter table public.business_withdrawal_issuers enable row level security;
alter table public.business_withdrawal_lessons enable row level security;
alter table public.business_withdrawal_sources enable row level security;
alter table public.business_withdrawal_receipts enable row level security;
revoke all on public.business_withdrawal_issuers,public.business_withdrawal_lessons,public.business_withdrawal_sources,public.business_withdrawal_receipts from public,anon,authenticated,service_role;
revoke all on function public.business_withdrawal_text(jsonb,integer),public.business_withdrawal_identity(jsonb),public.business_withdrawal_domain(jsonb),public.business_withdrawal_url(jsonb,text),public.business_withdrawal_stamp(jsonb),public.business_withdrawal_date_binding(jsonb,jsonb,text),public.business_withdrawal_validate(uuid,jsonb),public.business_withdrawal_source_guard(),public.business_withdrawal_issuer_dto(public.business_withdrawal_issuers),public.business_withdrawal_dto(public.business_withdrawal_lessons),public.business_subject_context(uuid,uuid),public.business_withdrawal_explanation_source(uuid,uuid,integer),public.business_withdrawal_command(uuid,text,jsonb),public.business_withdrawal_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_withdrawal_command(uuid,text,jsonb),public.business_withdrawal_read(uuid,text,jsonb) to service_role;

-- Legacy shop function definitions follow. They deliberately keep their existing DTOs.
create or replace function public.business_prepare_case(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;m business_merchants;prep business_case_preparations;r business_case_requests;mi jsonb;v_request uuid;v_hash text;v_needs boolean;
begin
 perform business_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>10000 then raise exception 'invalid preparation input';end if;
 v_request:=(p_input->>'requestId')::uuid;v_hash:=p_input->>'userInputHash';mi:=p_input->'merchant';
 if v_request is null or coalesce(v_hash,'')='' or coalesce(mi->>'platform','') not in ('rakuten','xiaohongshu') or coalesce(mi->>'platformShopId','')='' or coalesce(p_input->>'selectionReason','')='' then raise exception 'invalid preparation identity';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into r from business_case_requests where user_id=p_user_id and request_id=v_request;
 if found then if r.operation<>'primary' or r.user_input_hash<>v_hash then raise exception 'business request payload conflict';end if;return jsonb_build_object('dailyCase',r.result,'needsMaterial',false);end if;
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=v_request;
 if found then
  if prep.operation<>'primary' or prep.user_input_hash<>v_hash then raise exception 'business request payload conflict';end if;
  select * into c from business_daily_cases where user_id=p_user_id and id=prep.case_id and case_kind='shop' for update;
 else
  select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() and case_kind='shop' for update;
  if not found then
   select * into m from business_merchants where user_id=p_user_id and platform=mi->>'platform' and platform_shop_id=mi->>'platformShopId';
   if not found then insert into business_merchants(user_id,platform,platform_shop_id,name,source_url,identity_scope) values(p_user_id,mi->>'platform',mi->>'platformShopId',mi->>'name',mi->>'sourceUrl','user_supplied_unverified') returning * into m;end if;
   insert into business_daily_cases(user_id,local_date,merchant_id,selection_reason) values(p_user_id,business_today(),m.id,p_input->>'selectionReason') returning * into c;
  end if;
  insert into business_case_preparations(user_id,request_id,operation,user_input_hash,case_id) values(p_user_id,v_request,'primary',v_hash,c.id);
 end if;
 select * into m from business_merchants where id=c.merchant_id and user_id=p_user_id;
 v_needs:=m.platform=mi->>'platform' and m.platform_shop_id=mi->>'platformShopId' and not exists(select 1 from business_case_members where case_id=c.id and role='primary');
 return jsonb_build_object('dailyCase',business_case_dto(c),'needsMaterial',v_needs);
end $$;

create or replace function public.business_load_today(p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c business_daily_cases;begin
 perform business_service(p_user_id);select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() and case_kind='shop';if not found then return null;end if;return business_case_dto(c);
end $$;

create or replace function public.business_save_case_material(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;m business_merchants;r business_case_requests;prep business_case_preparations;s jsonb;mi jsonb;v_snapshot uuid;v_result jsonb;v_request uuid;v_operation text;v_role text;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>100000 then raise exception 'invalid business input';end if;
 v_request:=(p_input->>'requestId')::uuid;v_operation:=p_input->>'operation';
 if v_request is null or v_operation not in ('primary','attach') or coalesce(p_input->>'userInputHash','')='' then raise exception 'invalid business request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into r from business_case_requests where user_id=p_user_id and request_id=v_request;
 if found then if r.input is distinct from p_input then raise exception 'business request payload conflict';end if;return r.result;end if;
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=v_request;
 if found and (v_operation<>'primary' or prep.user_input_hash is distinct from p_input->>'userInputHash') then raise exception 'business request payload conflict';end if;
 if v_operation='primary' then
  if prep.case_id is not null then select * into c from business_daily_cases where user_id=p_user_id and id=prep.case_id and case_kind='shop' for update;
  else select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() and case_kind='shop' for update;end if;
  if found and (exists(select 1 from business_case_members where case_id=c.id and role='primary') or not exists(select 1 from business_merchants where id=c.merchant_id and platform=p_input->'merchant'->>'platform' and platform_shop_id=p_input->'merchant'->>'platformShopId')) then v_result:=business_case_dto(c);insert into business_case_requests values(p_user_id,v_request,v_operation,p_input->>'userInputHash',p_input,v_result,clock_timestamp());return v_result;end if;
  v_role:='primary';
 else
  select * into c from business_daily_cases where id=(p_input->>'caseId')::uuid and user_id=p_user_id and case_kind='shop' for update;
  if not found then raise exception 'business case owner required' using errcode='42501';end if;
  if c.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'business case revision conflict';end if;
  v_role:=p_input->>'role';if v_role not in ('product','comparison') then raise exception 'invalid member role';end if;
 end if;
 mi:=p_input->'merchant';s:=p_input->'snapshot';
 if coalesce(mi->>'platform','') not in ('rakuten','xiaohongshu') or coalesce(mi->>'platformShopId','')='' or coalesce(mi->>'name','')='' or mi->>'platform' is distinct from s->>'platform' or coalesce(p_input->>'selectionReason','')='' then raise exception 'invalid merchant material';end if;
 if coalesce(s->>'coverage','')='' or jsonb_typeof(s->'quantities') is distinct from 'array' or jsonb_typeof(s->'structured') is distinct from 'object' then raise exception 'invalid source coverage';end if;
 perform business_validate_quantities(s->'quantities');
 if s->>'origin'='official_api' and (mi->>'platform'<>'rakuten' or mi->>'identityScope'<>'platform_shop_id' or s->>'captureScope'<>'api_fields') then raise exception 'invalid official source';end if;
 if s->>'origin'='official_api' and (coalesce(s->>'sourceUrl','') !~ '^https://item[.]rakuten[.]co[.]jp/' or coalesce(mi->>'sourceUrl','') !~ '^https://www[.]rakuten[.]co[.]jp/' or split_part(s->>'sourceUrl','/',4) is distinct from mi->>'platformShopId' or split_part(s->>'itemId',':',1) is distinct from mi->>'platformShopId') then raise exception 'official source identity mismatch';end if;
 if s->>'origin'='manual_excerpt' and s->>'captureScope'<>'manual_transcription' then raise exception 'manual source scope mismatch';end if;
 select * into m from business_merchants where user_id=p_user_id and platform=mi->>'platform' and platform_shop_id=mi->>'platformShopId';
 if not found then insert into business_merchants(user_id,platform,platform_shop_id,name,source_url,identity_scope) values(p_user_id,mi->>'platform',mi->>'platformShopId',mi->>'name',mi->>'sourceUrl',mi->>'identityScope') returning * into m;
 elsif not exists(select 1 from business_material_snapshots where merchant_id=m.id) then update business_merchants set name=mi->>'name',source_url=mi->>'sourceUrl',identity_scope=mi->>'identityScope' where id=m.id returning * into m;end if;
 if v_operation='primary' then
  if c.id is null then insert into business_daily_cases(user_id,local_date,merchant_id,selection_reason) values(p_user_id,business_today(),m.id,p_input->>'selectionReason') returning * into c;end if;
 else
  if (v_role='comparison' and m.id=c.merchant_id) or (v_role='product' and m.id<>c.merchant_id) then raise exception 'material merchant does not match role';end if;
  update business_daily_cases set revision=revision+1 where id=c.id returning * into c;
  if v_role='product' and not exists(select 1 from business_case_members where case_id=c.id and role='primary') then v_role:='primary';end if;
 end if;
 insert into business_material_snapshots(user_id,merchant_id,platform,item_id,origin,source_url,published_at,capture_scope,captured_text,quantities,structured,coverage,content_hash)
 values(p_user_id,m.id,s->>'platform',s->>'itemId',s->>'origin',s->>'sourceUrl',(s->>'publishedAt')::timestamptz,s->>'captureScope',s->>'capturedText',s->'quantities',s->'structured',s->>'coverage',md5(s::text)) returning id into v_snapshot;
 insert into business_case_members(user_id,case_id,snapshot_id,merchant_id,role,selection_reason) values(p_user_id,c.id,v_snapshot,m.id,v_role,p_input->>'selectionReason');
 if v_role='primary' then update business_daily_cases set state='ready',failure_reason=null where id=c.id returning * into c;end if;
 v_result:=business_case_dto(c);insert into business_case_requests values(p_user_id,v_request,v_operation,p_input->>'userInputHash',p_input,v_result,clock_timestamp());return v_result;
end $$;

create or replace function public.business_job_command_v121(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s business_job_settings;r business_job_runs;receipt business_job_setting_receipts;a business_job_attempts;c business_daily_cases;v jsonb;v_payload jsonb;v_candidate jsonb;item jsonb;v_identity text;v_case uuid;v_count integer;v_revision integer;v_consent jsonb;v_start jsonb;v_manifest jsonb;v_report jsonb;v_snapshots jsonb;v_comparisons jsonb;v_request uuid;v_budget integer;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>250000 then raise exception 'invalid job input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));
 insert into business_job_settings(user_id) values(p_user_id) on conflict do nothing;select * into s from business_job_settings where user_id=p_user_id for update;
 if p_operation='settings' then
  select * into receipt from business_job_setting_receipts where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if receipt.input<>p_input then raise exception 'settings request conflict';end if;return receipt.result;end if;
  if s.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'settings revision changed';end if;
  if jsonb_typeof(p_input->'httpBudget') is distinct from 'number' or jsonb_typeof(p_input->'aiBudget') is distinct from 'number' then raise exception 'integer HTTP and AI budgets required';end if;
  if (p_input->>'httpBudget')::numeric%1<>0 or (p_input->>'aiBudget')::numeric%1<>0 or (p_input->>'httpBudget')::numeric not between 1 and 1000 or (p_input->>'aiBudget')::numeric not between 0 and 10 then raise exception 'integer request budgets outside bounds';end if;
  if coalesce(p_input->>'schedule','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p_input->>'httpBudget')::integer not between 1 and 1000 or (p_input->>'aiBudget')::integer not between 0 and 10 or jsonb_typeof(p_input->'sources') is distinct from 'array' or jsonb_typeof(p_input->'excluded') is distinct from 'array' or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or jsonb_typeof(p_input->'prepareOnOpen') is distinct from 'boolean' or jsonb_typeof(p_input->'autoAI') is distinct from 'boolean' then raise exception 'invalid job settings';end if;
  for item in select value from jsonb_array_elements(p_input->'sources') loop
   if coalesce(item->>'mode','') not in('search','ranking') or jsonb_typeof(item->'category') is distinct from 'string' or jsonb_typeof(item->'priceBand') is distinct from 'string' or jsonb_typeof(item->'businessModel') is distinct from 'string' or length(btrim(coalesce(item->>'category',''))) not between 1 and 120 or length(btrim(coalesce(item->>'priceBand',''))) not between 1 and 120 or length(btrim(coalesce(item->>'businessModel',''))) not between 1 and 120 or (item->>'mode'='search' and (jsonb_typeof(item->'keyword') is distinct from 'string' or length(btrim(coalesce(item->>'keyword',''))) not between 1 and 128)) or (item->>'mode'='ranking' and item ? 'keyword') or (item ? 'genreId' and (jsonb_typeof(item->'genreId') is distinct from 'string' or item->>'genreId' !~ '^[0-9]+$')) then raise exception 'invalid official source configuration';end if;
   if item-array['mode','keyword','genreId','category','priceBand','businessModel']<>'{}'::jsonb then raise exception 'unsupported source configuration';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(p_input->'excluded') x where x.value !~ '^rakuten:[a-zA-Z0-9_-]+$') then raise exception 'invalid exclusion';end if;
  if (p_input->>'autoAI')::boolean and (p_input->>'policyVersion' is distinct from 'official-rakuten-scalars-v1' or ((s.payload->>'autoAI')::boolean is distinct from true and p_input->'autoAIConfirmed' is distinct from 'true'::jsonb)) then raise exception 'explicit automatic AI policy confirmation required';end if;
  v_payload=jsonb_build_object('enabled',(p_input->>'enabled')::boolean,'prepareOnOpen',(p_input->>'prepareOnOpen')::boolean,'schedule',p_input->>'schedule','httpBudget',(p_input->>'httpBudget')::integer,'aiBudget',(p_input->>'aiBudget')::integer,'sources',p_input->'sources','excluded',p_input->'excluded','autoAI',(p_input->>'autoAI')::boolean,'policyVersion','official-rakuten-scalars-v1');
  if s.payload->'sources' is distinct from p_input->'sources' then delete from business_job_candidates where user_id=p_user_id;delete from business_job_source_cursors where user_id=p_user_id;end if;
  update business_job_settings set revision=revision+1,payload=v_payload,consent_version=case when (p_input->>'autoAI')::boolean then case when (s.payload->>'autoAI')::boolean then s.consent_version else gen_random_uuid() end else s.consent_version end,consent_revoked_at=case when (p_input->>'autoAI')::boolean then null else coalesce(s.consent_revoked_at,clock_timestamp()) end,updated_at=clock_timestamp() where user_id=p_user_id returning * into s;
  v=business_job_settings_dto(s);insert into business_job_setting_receipts values(p_user_id,(p_input->>'requestId')::uuid,p_input,v);return v;
 elsif p_operation='state' then
  select * into r from business_job_runs where user_id=p_user_id and local_date=business_today();
  return jsonb_build_object('available',true,'settings',business_job_settings_dto(s),'run',case when r.id is null then null else business_job_run_dto(r) end,'attempts',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from business_job_attempts x where x.user_id=p_user_id and x.run_id=r.id),'[]'::jsonb),'sourceCursors',coalesce((select jsonb_object_agg(source_key,next_page) from business_job_source_cursors where user_id=p_user_id),'{}'::jsonb),'candidates',coalesce((select jsonb_agg(payload order by identity,item_code) from business_job_candidates where user_id=p_user_id),'[]'::jsonb),'history',jsonb_build_object('excluded',s.payload->'excluded','priorMain',to_jsonb(business_excluded_merchants(p_user_id)),'recent',coalesce((select jsonb_agg(candidate order by local_date desc) from business_job_runs where user_id=p_user_id and candidate is not null),'[]'::jsonb)));
 elsif p_operation='history' then
  select coalesce(jsonb_agg(business_job_run_dto(x)||jsonb_build_object('attemptSummary',jsonb_build_object('http',(select count(*) from business_job_attempts ba where ba.run_id=x.id and ba.kind='http'),'ai',(select count(*) from business_job_attempts ba where ba.run_id=x.id and ba.kind='ai'))) order by local_date desc),'[]'::jsonb) into v from (select * from business_job_runs where user_id=p_user_id and (p_input->>'before' is null or local_date<(p_input->>'before')::date) order by local_date desc limit 21) x;
  return jsonb_build_object('items',case when jsonb_array_length(v)>20 then v-20 else v end,'nextCursor',case when jsonb_array_length(v)>20 then v->19->>'localDate' else null end);
 elsif p_operation='claim' then
  select * into r from business_job_runs where user_id=p_user_id and local_date=business_today() for update;
  if found then
   if r.status<>'running' then return coalesce(r.result,business_job_run_dto(r));end if;
   if r.lease_until<=clock_timestamp() then update business_job_runs set status='unknown',message='Worker lease expired; usage or result may be unknown',finished_at=clock_timestamp() where id=r.id returning * into r;update business_job_attempts set status='unknown' where run_id=r.id and status='pending';return business_job_run_dto(r);end if;
   return jsonb_build_object('status','busy','runId',r.id);
  end if;
  if (s.payload->>'enabled')::boolean is distinct from true then return jsonb_build_object('status','disabled');end if;
  if p_input->>'trigger'='open' and (s.payload->>'prepareOnOpen')::boolean is distinct from true then return jsonb_build_object('status','disabled');end if;
  if p_input->>'trigger'='cron' and to_char(clock_timestamp() at time zone 'Asia/Tokyo','HH24:MI')<s.payload->>'schedule' then return jsonb_build_object('status','not_due');end if;
  select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() and case_kind='shop';
  insert into business_job_runs(user_id,local_date,trigger,settings_revision,settings,parent_consent_version,case_id,material_status) values(p_user_id,business_today(),p_input->>'trigger',s.revision,s.payload,s.consent_version,c.id,case when c.state='ready' then 'ready' else 'pending' end) returning * into r;return business_job_run_dto(r);
 end if;
 -- Successful terminal receipts precede live lease/settings checks.
 if p_operation in('finish','complete') then select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid;if found and r.lease_token=(p_input->>'leaseToken')::uuid and r.result is not null then return r.result;end if;end if;
 if p_operation='settle' then
  select * into a from business_job_attempts where user_id=p_user_id and run_id=(p_input->>'runId')::uuid and id=(p_input->>'ticketId')::uuid;
  if found and a.receipt is not null and exists(select 1 from business_job_runs where id=a.run_id and user_id=p_user_id and lease_token=(p_input->>'leaseToken')::uuid) then if a.receipt<>p_input-array['runId','leaseToken','settings','statusUnused'] then raise exception 'attempt receipt conflict';end if;return to_jsonb(a);end if;
 end if;
 if p_operation='fail' then
  select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid for update;
  if not found or r.lease_token is distinct from (p_input->>'leaseToken')::uuid then raise exception 'run owner unavailable';end if;
  if r.status<>'running' then return coalesce(r.result,business_job_run_dto(r));end if;
  update business_job_attempts set status='unknown',settled_at=clock_timestamp() where run_id=r.id and status='pending';
  update business_job_runs set status=case when exists(select 1 from business_job_attempts where run_id=r.id and kind='ai') then 'unknown' else 'failed' end,material_status=case when material_status='ready' then material_status else 'failed' end,report_status=case when exists(select 1 from business_job_attempts where run_id=r.id and kind='ai') then 'unknown' else 'not_started' end,message=left(coalesce(p_input->>'message','worker failed'),2000),finished_at=clock_timestamp() where id=r.id returning * into r;
  if r.case_id is not null and r.material_status<>'ready' and exists(select 1 from business_case_preparations where user_id=p_user_id and request_id=r.material_request) then perform business_fail_preparation(p_user_id,r.material_request,r.material_hash);end if;return business_job_run_dto(r);
 end if;
 r=business_job_assert(p_user_id,p_input,p_operation in('verify_ai','finish'));
 if p_operation='check' then return business_job_run_dto(r);
 elsif p_operation='enqueue' then
  for v_candidate in select value from jsonb_array_elements(p_input->'candidates') loop
   if v_candidate->'merchant'->>'platform' is distinct from 'rakuten' or v_candidate->'merchant'->>'identityScope' is distinct from 'platform_shop_id' or split_part(v_candidate->>'itemCode',':',1) is distinct from v_candidate->'merchant'->>'platformShopId' or coalesce(v_candidate->>'coverage','')='' or (v_candidate->>'sourcePage')::integer<1 or v_candidate->>'capturedAt' is null then raise exception 'invalid official candidate';end if;
   v_identity='rakuten:'||(v_candidate->'merchant'->>'platformShopId');insert into business_job_candidates(user_id,identity,item_code,payload) values(p_user_id,v_identity,v_candidate->>'itemCode',v_candidate) on conflict(user_id,identity,item_code) do update set payload=excluded.payload,discovered_at=clock_timestamp();
  end loop;
  if p_input ? 'sourceCursor' then insert into business_job_source_cursors values(p_user_id,p_input->'sourceCursor'->>'sourceKey',(p_input->'sourceCursor'->>'nextPage')::integer,p_input->'sourceCursor'->>'coverage',(p_input->'sourceCursor'->>'capturedAt')::timestamptz) on conflict(user_id,source_key) do update set next_page=excluded.next_page,coverage=excluded.coverage,captured_at=excluded.captured_at;end if;return '{}'::jsonb;
 elsif p_operation='reserve' then
  if r.case_id is not null then return business_job_run_dto(r);end if;
  if r.local_date<>business_today() then raise exception 'run date changed before slot reservation';end if;
  v_candidate=p_input->'candidate';v_identity='rakuten:'||(v_candidate->'merchant'->>'platformShopId');
  if not exists(select 1 from business_job_candidates where user_id=p_user_id and identity=v_identity and item_code=v_candidate->>'itemCode' and payload=v_candidate) then raise exception 'candidate not queued';end if;
  if v_identity=any(business_excluded_merchants(p_user_id)) or s.payload->'excluded' ? v_identity then raise exception 'main merchant already used or excluded';end if;
  v=business_prepare_case(p_user_id,jsonb_build_object('requestId',r.material_request,'userInputHash',md5(v_candidate::text),'merchant',v_candidate->'merchant','selectionReason',p_input->>'reason'));
  update business_job_runs set case_id=(v->'dailyCase'->>'id')::uuid,candidate=v_candidate,rule_version=p_input->>'ruleVersion',selection_reason=p_input->>'reason',material_hash=md5(v_candidate::text) where id=r.id returning * into r;return business_job_run_dto(r);
 elsif p_operation='ticket' then
  select * into a from business_job_attempts where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then raise exception 'request ticket already issued; outcome may be unknown';end if;
  if p_input->>'kind'='ai' then perform business_job_assert(p_user_id,p_input,true);end if;
  if p_input->>'stage'='inspect' and r.case_id is null then raise exception 'reserve daily slot before inspect HTTP';end if;
  if jsonb_typeof(r.settings->(case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end)) is distinct from 'number' then raise exception 'valid frozen numeric request budget required';end if;
  if (r.settings->>(case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end))::numeric%1<>0 then raise exception 'integer frozen request budget required';end if;
  select count(*) into v_count from business_job_attempts where user_id=p_user_id and run_id=r.id and kind=p_input->>'kind';v_budget=(r.settings->>case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end)::integer;
  if v_budget is null or (p_input->>'kind'='http' and v_budget not between 1 and 1000) or (p_input->>'kind'='ai' and v_budget not between 0 and 10) then raise exception 'valid frozen request budget required';end if;
  if v_count>=v_budget then raise exception 'daily request budget exhausted';end if;
  if p_input->>'kind'='http' and p_input->>'stage'='discovery' and v_count>=v_budget-1 then raise exception 'HTTP discovery budget exhausted; one request reserved for shop inspection';end if;
  if p_input->>'kind'='ai' and v_count>0 then raise exception 'AI result may be unknown; no automatic retry';end if;
  insert into business_job_attempts(user_id,run_id,request_id,kind,stage,operation_reference) values(p_user_id,r.id,(p_input->>'requestId')::uuid,p_input->>'kind',p_input->>'stage',case when p_input->>'kind'='ai' then 'business_teardown_report:'||r.report_request::text else null end) returning * into a;return to_jsonb(a);
 elsif p_operation='settle' then
  select * into a from business_job_attempts where user_id=p_user_id and run_id=r.id and id=(p_input->>'ticketId')::uuid for update;
  if not found then raise exception 'ticket unavailable';end if;
  if a.receipt is not null then if a.receipt<>p_input-array['runId','leaseToken','settings','statusUnused'] then raise exception 'attempt receipt conflict';end if;return to_jsonb(a);end if;
  if a.kind='ai' then perform business_job_assert(p_user_id,p_input,true);end if;
  update business_job_attempts set status=p_input->>'status',usage=nullif(p_input->'usage','null'::jsonb),receipt=p_input-array['runId','leaseToken','settings','statusUnused'],settled_at=clock_timestamp() where id=a.id returning * into a;return to_jsonb(a);
 elsif p_operation='material' then
  if r.material_status='ready' then return business_job_run_dto(r);end if;
  if r.case_id is null or r.candidate is null then raise exception 'reserved official candidate required';end if;
  if p_input->'merchant' is distinct from r.candidate->'merchant' or p_input->'snapshot'->>'itemId' is distinct from r.candidate->>'itemCode' or p_input->'snapshot'->>'origin' is distinct from 'official_api' or p_input->'snapshot'->>'capturedText' is not null or exists(select 1 from jsonb_each(p_input->'snapshot'->'structured') e where jsonb_typeof(e.value) not in('string','number','boolean','null')) then raise exception 'automatic material must be official public scalar fields';end if;
  perform business_save_case_material(p_user_id,jsonb_build_object('requestId',r.material_request,'operation','primary','userInputHash',r.material_hash,'merchant',p_input->'merchant','snapshot',p_input->'snapshot','selectionReason',r.selection_reason));
  update business_job_runs set material_status='ready' where id=r.id returning * into r;return business_job_run_dto(r);
 elsif p_operation='ai_start' then
  if (s.payload->>'autoAI')::boolean is distinct from true then return jsonb_build_object('status','not_permitted');end if;
  perform business_job_assert(p_user_id,p_input,true);
  if r.material_status<>'ready' then raise exception 'material not ready';end if;
  if exists(select 1 from business_report_requests where user_id=p_user_id and request_id=r.report_request) then raise exception 'AI request already started; result may be unknown';end if;
  select * into c from business_daily_cases where user_id=p_user_id and id=r.case_id;
  select coalesce(jsonb_agg(x.snapshot_id order by x.snapshot_id) filter(where x.role in('primary','product')),'[]'::jsonb),coalesce(jsonb_agg(x.snapshot_id order by x.snapshot_id) filter(where x.role='comparison'),'[]'::jsonb) into v_snapshots,v_comparisons from business_case_members x join business_material_snapshots t on t.id=x.snapshot_id and t.user_id=x.user_id where x.user_id=p_user_id and x.case_id=c.id and t.platform='rakuten' and t.origin='official_api' and t.capture_scope='api_fields' and t.captured_text is null and t.erased_at is null;
  if jsonb_array_length(v_snapshots)=0 then raise exception 'no official scalar primary materials';end if;
  select coalesce(max(revision),0) into v_revision from business_case_revisions where user_id=p_user_id and case_id=c.id;
  v=jsonb_build_object('caseId',c.id,'materialRevision',c.revision,'snapshotIds',v_snapshots,'comparisonSnapshotIds',v_comparisons,'publicExcerptDeidentified',true,'requestId',r.report_request);
  v_consent=business_report_command(p_user_id,'consent',v);insert into business_job_child_consents values((v_consent->>'id')::uuid,p_user_id,r.id,r.parent_consent_version,r.settings_revision);
  update business_job_runs set child_consent_id=(v_consent->>'id')::uuid,report_status='started',publication_base=c.published_revision_id where id=r.id;
  v_start=business_report_command(p_user_id,'start',(v-'publicExcerptDeidentified')||jsonb_build_object('consentId',v_consent->>'id','expectedReportRevision',v_revision));return v_start;
 elsif p_operation='verify_ai' then
  if p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;return business_report_command(p_user_id,'verify',p_input->'draftLease');
 elsif p_operation='finish' then
  if p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;
  if not exists(select 1 from business_job_attempts where user_id=p_user_id and run_id=r.id and kind='ai' and status='completed') then raise exception 'completed AI ticket required before finalization';end if;
  perform set_config('business.job_finish',r.id::text,true);
  v_report=business_report_command(p_user_id,'finish',(p_input->'draftLease')||jsonb_build_object('report',p_input->'report'));
  select * into c from business_daily_cases where user_id=p_user_id and id=r.case_id;
  perform business_report_command(p_user_id,'publish',jsonb_build_object('caseId',c.id,'reportId',v_report->>'id','expectedPublishedReportId',r.publication_base,'requestId',r.report_request));
  v=jsonb_build_object('status','completed','runId',r.id,'caseId',c.id,'reportId',v_report->>'id');
  update business_job_runs set status='completed',report_status='published',result=v,finished_at=clock_timestamp() where id=r.id;return v;
 elsif p_operation='complete' then
  if r.material_status<>'ready' then raise exception 'materials not ready';end if;
  v=jsonb_build_object('status','materials_ready','runId',r.id,'caseId',r.case_id,'message',p_input->>'message');update business_job_runs set status='materials_ready',report_status='not_permitted',message=p_input->>'message',result=v,finished_at=clock_timestamp() where id=r.id;return v;
 end if;
 raise exception 'unknown business job operation';
end$$;
commit;
