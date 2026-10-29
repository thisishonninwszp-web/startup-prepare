begin;
-- Voluntary server-to-server prototype events; default-off application entrypoints.
create table public.product_event_sources(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),prototype_url text,notice_url text,notice_version text,event_kinds text[],
 retention_days integer not null check(retention_days between 1 and 30),active boolean not null default false,confirmed_at timestamptz,deleted_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(id,user_id)
);
create table public.product_event_tokens(token_hash text primary key check(token_hash~'^[a-f0-9]{64}$'),source_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,issued_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,foreign key(source_id,user_id) references public.product_event_sources(id,user_id) on delete cascade);
create unique index product_event_one_active_token on public.product_event_tokens(source_id) where revoked_at is null;
create table public.product_events(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,source_id uuid not null,revision bigint generated always as identity check(revision<=9007199254740991),
 external_id uuid,subject_hash text check(subject_hash is null or subject_hash~'^[a-f0-9]{64}$'),kind text,attributes jsonb,occurred_at timestamptz,captured_at timestamptz default clock_timestamp(),payload_digest text,deleted_at timestamptz,
 foreign key(source_id,user_id) references public.product_event_sources(id,user_id) on delete cascade,unique(id,user_id),unique(source_id,external_id),
 check((deleted_at is null and external_id is not null and kind in ('query','no_result','task_completed','return_visit','inquiry','payment') and attributes is not null and occurred_at is not null and captured_at is not null and payload_digest is not null) or (deleted_at is not null and external_id is null and subject_hash is null and kind is null and attributes is null and occurred_at is null and captured_at is null and payload_digest is null))
);
create index product_event_history on public.product_events(user_id,revision);
create index product_event_rate_window on public.product_events(source_id,captured_at) where deleted_at is null;
create table public.product_event_links(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,event_id uuid not null,idea_id uuid not null references public.ideas(id) on delete cascade,scope text,unknown text,created_at timestamptz not null default clock_timestamp(),foreign key(event_id,user_id) references public.product_events(id,user_id) on delete cascade,unique(event_id,idea_id)
);
create table public.product_event_receipts(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,removed_count integer not null check(removed_count>=0),reason text not null check(reason in ('retention','source_deleted')),created_at timestamptz not null default clock_timestamp());
create table public.product_event_requests(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,digest text not null,source_id uuid,link_id uuid,receipt_id uuid,primary key(user_id,request_id));
alter table public.product_event_sources enable row level security;alter table public.product_event_tokens enable row level security;alter table public.product_events enable row level security;alter table public.product_event_links enable row level security;alter table public.product_event_receipts enable row level security;alter table public.product_event_requests enable row level security;
create policy product_source_owner on public.product_event_sources for select to authenticated using(auth.uid()=user_id);
create policy product_event_owner on public.product_events for select to authenticated using(auth.uid()=user_id and (deleted_at is not null or captured_at>clock_timestamp()-make_interval(days=>(select s.retention_days from public.product_event_sources s where s.id=source_id and s.user_id=auth.uid()))));
create policy product_link_owner on public.product_event_links for select to authenticated using(auth.uid()=user_id and exists(select 1 from public.product_events e where e.id=event_id));
create policy product_receipt_owner on public.product_event_receipts for select to authenticated using(auth.uid()=user_id);
revoke all on public.product_event_sources,public.product_event_tokens,public.product_events,public.product_event_links,public.product_event_receipts,public.product_event_requests from public,anon,authenticated,service_role;
grant select on public.product_event_sources,public.product_events,public.product_event_links,public.product_event_receipts to authenticated,service_role;
create function public.product_event_service() returns void language plpgsql stable security definer set search_path=public,pg_temp as $$begin if coalesce(auth.role(),'')<>'service_role' then raise exception 'product event service required' using errcode='42501';end if;end $$;
create function public.product_event_owner(p_user_id uuid) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$begin perform public.product_event_service();if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'owner required' using errcode='42501';end if;end $$;
create function public.preserve_product_event_history() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old;end if;
 if tg_table_name='product_events' then
  if tg_op='UPDATE' and old.deleted_at is null and new.deleted_at is not null and new.external_id is null and new.subject_hash is null and new.kind is null and new.attributes is null and new.occurred_at is null and new.captured_at is null and new.payload_digest is null and (to_jsonb(new)-array['external_id','subject_hash','kind','attributes','occurred_at','captured_at','payload_digest','deleted_at'])=(to_jsonb(old)-array['external_id','subject_hash','kind','attributes','occurred_at','captured_at','payload_digest','deleted_at']) then return new;end if;
 elsif tg_table_name='product_event_links' then
  if tg_op='UPDATE' and new.scope is null and new.unknown is null and (to_jsonb(new)-array['scope','unknown'])=(to_jsonb(old)-array['scope','unknown']) then return new;end if;
  if tg_op='DELETE' and not exists(select 1 from public.ideas where id=old.idea_id) then return old;end if;
 end if;
 raise exception 'product event history immutable except privacy erasure';
end $$;
create trigger product_event_immutable before update or delete on public.product_events for each row execute function public.preserve_product_event_history();
create trigger product_link_immutable before update or delete on public.product_event_links for each row execute function public.preserve_product_event_history();
create trigger product_receipt_immutable before update or delete on public.product_event_receipts for each row execute function public.preserve_product_event_history();
create trigger product_request_immutable before update or delete on public.product_event_requests for each row execute function public.preserve_product_event_history();
create function public.erase_product_event_rows(p_user_id uuid,p_source_id uuid,p_expired_only boolean,p_limit integer) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected uuid[];removed integer;
begin
 select array_agg(id) into affected from (select e.id from public.product_events e join public.product_event_sources s on s.id=e.source_id where e.user_id=p_user_id and (p_source_id is null or e.source_id=p_source_id) and e.deleted_at is null and (not p_expired_only or e.captured_at<=clock_timestamp()-make_interval(days=>s.retention_days)) order by e.revision limit p_limit) q;
 removed:=coalesce(array_length(affected,1),0);if removed=0 then return 0;end if;
 update public.product_event_links set scope=null,unknown=null where user_id=p_user_id and event_id=any(affected);
 update public.product_events set external_id=null,subject_hash=null,kind=null,attributes=null,occurred_at=null,captured_at=null,payload_digest=null,deleted_at=clock_timestamp() where user_id=p_user_id and id=any(affected);
 return removed;
end $$;
create function public.validate_product_event(p jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare a jsonb;k text;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>8192 or exists(select 1 from jsonb_object_keys(p) key where key not in ('externalId','kind','occurredAt','noticeVersion','attributes','subjectHash')) then raise exception 'unsupported product event body';end if;
 if p->>'externalId' is null or p->>'externalId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or p->>'occurredAt' is null or p->>'occurredAt'!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' or p->>'noticeVersion' is null or p->>'noticeVersion'!~'^[A-Za-z0-9._-]{1,32}$' then raise exception 'invalid event identity or time';end if;
 perform (p->>'occurredAt')::timestamptz;
 if p?'subjectHash' and (jsonb_typeof(p->'subjectHash')<>'string' or p->>'subjectHash'!~'^[a-f0-9]{64}$') then raise exception 'anonymous one-way subject hash required';end if;
 a:=p->'attributes';k:=p->>'kind';if jsonb_typeof(a) is distinct from 'object' then raise exception 'invalid event attributes';end if;
 case k
 when 'query' then if (select count(*) from jsonb_object_keys(a))<>1 or jsonb_typeof(a->'resultCount') is distinct from 'number' or a->>'resultCount'!~'^\d+$' or (a->>'resultCount')::numeric not between 0 and 1000000 then raise exception 'invalid query attributes';end if;
 when 'no_result' then if a<>'{}'::jsonb then raise exception 'invalid no_result attributes';end if;
 when 'task_completed' then if (select count(*) from jsonb_object_keys(a))<>1 or a->>'durationBucket' is null or a->>'durationBucket' not in ('under_minute','one_to_five_minutes','over_five_minutes','unknown') then raise exception 'invalid task attributes';end if;
 when 'return_visit' then if (select count(*) from jsonb_object_keys(a))<>1 or a->>'interval' is null or a->>'interval' not in ('day','week','month','unknown') then raise exception 'invalid return attributes';end if;
 when 'inquiry' then if (select count(*) from jsonb_object_keys(a))<>1 or a->>'channel' is null or a->>'channel' not in ('form','email','other') then raise exception 'invalid inquiry attributes';end if;
 when 'payment' then if exists(select 1 from jsonb_object_keys(a) key where key not in ('amountMinor','currency','kind')) or jsonb_typeof(a->'amountMinor') is distinct from 'number' or a->>'amountMinor'!~'^\d+$' or (a->>'amountMinor')::numeric not between 0 and 1000000000 or a->>'currency' is null or a->>'currency' not in ('JPY','USD','EUR') or a->>'kind' is null or a->>'kind' not in ('one_time','recurring') then raise exception 'invalid payment attributes';end if;
 else raise exception 'event kind not allowed';end case;
end $$;
create function public.mutate_product_event_source(p_user_id uuid,p jsonb,p_token_hash text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.product_event_requests;s public.product_event_sources;c jsonb;action text;digest text;removed integer:=0;receipt public.product_event_receipts;token_issued boolean:=false;k text;
begin
 perform public.product_event_owner(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,117));
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>12000 or p->>'requestId' is null or exists(select 1 from jsonb_object_keys(p) key where key not in ('action','requestId','sourceId','expectedRevision','config','confirmPrototype')) then raise exception 'unsupported source command';end if;
 digest:=encode(sha256(convert_to(p::text,'UTF8')),'hex');select * into prior from public.product_event_requests where user_id=p_user_id and request_id=(p->>'requestId')::uuid;
 if found then if prior.digest<>digest then raise exception 'request conflict' using errcode='23505';end if;select * into s from public.product_event_sources where id=prior.source_id and user_id=p_user_id;select * into receipt from public.product_event_receipts where id=prior.receipt_id and user_id=p_user_id;return jsonb_build_object('source',case when s.id is null then null else to_jsonb(s)-'user_id' end,'receipt',case when receipt.id is null then null else to_jsonb(receipt)-'user_id' end,'tokenIssued',false,'replayed',true);end if;
 action:=p->>'action';
 if action='create' then
  if p?'sourceId' or p?'expectedRevision' or p?'confirmPrototype' then raise exception 'create draft first';end if;
  c:=p->'config';if jsonb_typeof(c) is distinct from 'object' or exists(select 1 from jsonb_object_keys(c) key where key not in ('prototypeUrl','noticeUrl','noticeVersion','eventKinds','retentionDays')) then raise exception 'invalid source config';end if;
  foreach k in array array['prototypeUrl','noticeUrl'] loop if jsonb_typeof(c->k) is distinct from 'string' or length(c->>k)>2048 or (c->>k)!~*'^https://([a-z0-9-]+\.)+[a-z]{2,}(/[^?#[:space:]]*)?$' then raise exception 'HTTPS prototype and notice URL required';end if;end loop;
  if c->>'noticeVersion' is null or c->>'noticeVersion'!~'^[A-Za-z0-9._-]{1,32}$' or jsonb_typeof(c->'eventKinds') is distinct from 'array' or jsonb_array_length(c->'eventKinds') not between 1 and 6 or exists(select 1 from jsonb_array_elements_text(c->'eventKinds') v where v not in ('query','no_result','task_completed','return_visit','inquiry','payment')) or (select count(distinct v) from jsonb_array_elements_text(c->'eventKinds') v)<>jsonb_array_length(c->'eventKinds') or jsonb_typeof(c->'retentionDays') is distinct from 'number' or c->>'retentionDays'!~'^\d+$' or (c->>'retentionDays')::numeric not between 1 and 30 then raise exception 'invalid event definitions or retention cap';end if;
  insert into public.product_event_sources(user_id,prototype_url,notice_url,notice_version,event_kinds,retention_days) values(p_user_id,c->>'prototypeUrl',c->>'noticeUrl',c->>'noticeVersion',array(select jsonb_array_elements_text(c->'eventKinds')),(c->>'retentionDays')::int) returning * into s;
 elsif action='purge' then
  if p?'sourceId' or p?'expectedRevision' or p?'config' or p?'confirmPrototype' then raise exception 'invalid retention purge';end if;
  removed:=public.erase_product_event_rows(p_user_id,null,true,2147483647);insert into public.product_event_receipts(user_id,removed_count,reason) values(p_user_id,removed,'retention') returning * into receipt;
 elsif action in ('activate','pause','rotate','revoke','delete') then
  if p?'config' or p->>'sourceId' is null or p->>'expectedRevision' is null or p->>'expectedRevision'!~'^\d+$' then raise exception 'source and revision required';end if;
  select * into s from public.product_event_sources where id=(p->>'sourceId')::uuid and user_id=p_user_id for update;if not found then raise exception 'source owner required' using errcode='42501';end if;
  if s.deleted_at is not null then raise exception 'source deleted';end if;if s.revision<>(p->>'expectedRevision')::bigint then raise exception 'stale source revision';end if;
  if action='activate' and p->'confirmPrototype' is distinct from 'true'::jsonb then raise exception 'actual prototype and notice confirmation required';end if;
  if action<>'activate' and p?'confirmPrototype' then raise exception 'unexpected confirmation';end if;
  if action in ('activate','rotate') then
   if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'server token hash required';end if;
   if action='rotate' and (not s.active or s.confirmed_at is null) then raise exception 'activate confirmed prototype first';end if;
   update public.product_event_tokens set revoked_at=clock_timestamp() where source_id=s.id and revoked_at is null;
   insert into public.product_event_tokens(token_hash,source_id,user_id) values(p_token_hash,s.id,p_user_id);token_issued:=true;
  end if;
  if action in ('pause','revoke','delete') then update public.product_event_tokens set revoked_at=clock_timestamp() where source_id=s.id and revoked_at is null;end if;
  if action='delete' then
   removed:=public.erase_product_event_rows(p_user_id,s.id,false,2147483647);delete from public.product_event_tokens where source_id=s.id;
   insert into public.product_event_receipts(user_id,removed_count,reason) values(p_user_id,removed,'source_deleted') returning * into receipt;
   update public.product_event_sources set prototype_url=null,notice_url=null,notice_version=null,event_kinds=null,active=false,confirmed_at=null,deleted_at=clock_timestamp(),revision=revision+1 where id=s.id returning * into s;
  else update public.product_event_sources set active=case when action='activate' then true when action in ('pause','revoke') then false else active end,confirmed_at=case when action='activate' then clock_timestamp() else confirmed_at end,revision=revision+1 where id=s.id returning * into s;end if;
 else raise exception 'unsupported source action';end if;
 insert into public.product_event_requests(user_id,request_id,digest,source_id,receipt_id) values(p_user_id,(p->>'requestId')::uuid,digest,s.id,receipt.id);
 return jsonb_build_object('source',case when s.id is null then null else to_jsonb(s)-'user_id' end,'receipt',case when receipt.id is null then null else to_jsonb(receipt)-'user_id' end,'tokenIssued',token_issued,'replayed',false);
end $$;
create function public.ingest_product_event(p_token_hash text,p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid;s public.product_event_sources;e public.product_events;digest text;removed integer;
begin
 perform public.product_event_service();perform public.validate_product_event(p);
 select user_id into owner_id from public.product_event_tokens where token_hash=p_token_hash and revoked_at is null;if not found then raise exception 'prototype token unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,117));
 select src.* into s from public.product_event_sources src join public.product_event_tokens t on t.source_id=src.id and t.user_id=src.user_id where t.token_hash=p_token_hash and t.revoked_at is null and src.active and src.confirmed_at is not null and src.deleted_at is null for update of src;
 if not found then raise exception 'prototype not active or token revoked' using errcode='42501';end if;
 if p->>'noticeVersion'<>s.notice_version then raise exception 'notice version mismatch';end if;if not (p->>'kind')=any(s.event_kinds) then raise exception 'event kind outside confirmed definitions';end if;
 if (p->>'occurredAt')::timestamptz>clock_timestamp() or (p->>'occurredAt')::timestamptz<=clock_timestamp()-make_interval(days=>s.retention_days) then raise exception 'event time outside retention window';end if;
 digest:=encode(sha256(convert_to(p::text,'UTF8')),'hex');select * into e from public.product_events where source_id=s.id and external_id=(p->>'externalId')::uuid;
 if found then if e.payload_digest<>digest then raise exception 'external event request conflict' using errcode='23505';end if;return jsonb_build_object('id',e.id,'capturedAt',e.captured_at,'replayed',true);end if;
 if (select count(*) from public.product_events where source_id=s.id and captured_at>clock_timestamp()-interval '1 minute')>=60 or (select count(*) from public.product_events where source_id=s.id and captured_at>clock_timestamp()-interval '1 day')>=5000 then raise exception 'prototype event rate limit' using errcode='54000';end if;
 removed:=public.erase_product_event_rows(owner_id,s.id,true,500);if removed>0 then insert into public.product_event_receipts(user_id,removed_count,reason) values(owner_id,removed,'retention');end if;
 insert into public.product_events(user_id,source_id,external_id,subject_hash,kind,attributes,occurred_at,payload_digest) values(owner_id,s.id,(p->>'externalId')::uuid,p->>'subjectHash',p->>'kind',p->'attributes',(p->>'occurredAt')::timestamptz,digest) returning * into e;
 return jsonb_build_object('id',e.id,'capturedAt',e.captured_at,'replayed',false);
end $$;
create function public.link_product_event(p_user_id uuid,p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.product_event_requests;e public.product_events;l public.product_event_links;digest text;
begin
 perform public.product_event_owner(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,117));
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) key where key not in ('requestId','eventId','ideaId','scope','unknown')) or p->>'requestId' is null or p->>'eventId' is null or p->>'ideaId' is null or jsonb_typeof(p->'scope') is distinct from 'string' or length(btrim(p->>'scope')) not between 1 and 2000 or jsonb_typeof(p->'unknown') is distinct from 'string' or length(btrim(p->>'unknown')) not between 1 and 2000 then raise exception 'explicit idea scope and unknown required';end if;
 digest:=encode(sha256(convert_to(p::text,'UTF8')),'hex');select * into prior from public.product_event_requests where user_id=p_user_id and request_id=(p->>'requestId')::uuid;if found then if prior.digest<>digest then raise exception 'request conflict' using errcode='23505';end if;select * into l from public.product_event_links where id=prior.link_id and user_id=p_user_id;return to_jsonb(l)-'user_id';end if;
 select e0.* into e from public.product_events e0 join public.product_event_sources s on s.id=e0.source_id where e0.id=(p->>'eventId')::uuid and e0.user_id=p_user_id and e0.deleted_at is null and e0.captured_at>clock_timestamp()-make_interval(days=>s.retention_days);
 if not found or not exists(select 1 from public.ideas where id=(p->>'ideaId')::uuid and user_id=p_user_id) then raise exception 'event or idea owner required' using errcode='42501';end if;
 select * into l from public.product_event_links where event_id=e.id and idea_id=(p->>'ideaId')::uuid;
 if found then if l.scope is distinct from p->>'scope' or l.unknown is distinct from p->>'unknown' then raise exception 'idea link already exists with different scope' using errcode='23505';end if;
 else insert into public.product_event_links(user_id,event_id,idea_id,scope,unknown) values(p_user_id,e.id,(p->>'ideaId')::uuid,p->>'scope',p->>'unknown') returning * into l;end if;
 insert into public.product_event_requests(user_id,request_id,digest,link_id) values(p_user_id,(p->>'requestId')::uuid,digest,l.id);return to_jsonb(l)-'user_id';
end $$;
create function public.list_product_events(p_user_id uuid,p_after_revision bigint default 0,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare events jsonb;sources jsonb;links jsonb;receipts jsonb;next_revision bigint;removed integer;
begin
 perform public.product_event_owner(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,117));
 if p_after_revision is null or p_after_revision not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid product event cursor';end if;
 removed:=public.erase_product_event_rows(p_user_id,null,true,500);if removed>0 then insert into public.product_event_receipts(user_id,removed_count,reason) values(p_user_id,removed,'retention');end if;
 select coalesce(jsonb_agg(to_jsonb(s)-'user_id' order by created_at,id),'[]') into sources from public.product_event_sources s where user_id=p_user_id;
 select coalesce(jsonb_agg(to_jsonb(e)-array['user_id','external_id','subject_hash','payload_digest'] order by revision),'[]'),max(revision) into events,next_revision from (select e.* from public.product_events e join public.product_event_sources s on s.id=e.source_id where e.user_id=p_user_id and e.revision>p_after_revision and (e.deleted_at is not null or e.captured_at>clock_timestamp()-make_interval(days=>s.retention_days)) order by e.revision limit p_limit) e;
 if not exists(select 1 from public.product_events where user_id=p_user_id and revision>next_revision) then next_revision:=null;end if;
 select coalesce(jsonb_agg(case when e.deleted_at is not null or e.captured_at<=clock_timestamp()-make_interval(days=>s.retention_days) then (to_jsonb(l)-array['user_id','scope','unknown'])||jsonb_build_object('scope',null,'unknown',null,'event',(to_jsonb(e)-array['user_id','external_id','subject_hash','payload_digest','kind','attributes','occurred_at','captured_at'])||jsonb_build_object('kind',null,'attributes',null,'occurred_at',null,'captured_at',null,'deleted_at',coalesce(e.deleted_at,clock_timestamp()))) else (to_jsonb(l)-'user_id')||jsonb_build_object('event',to_jsonb(e)-array['user_id','external_id','subject_hash','payload_digest']) end order by l.created_at,l.id),'[]') into links from public.product_event_links l join public.product_events e on e.id=l.event_id join public.product_event_sources s on s.id=e.source_id where l.user_id=p_user_id;
 select coalesce(jsonb_agg(to_jsonb(r)-'user_id' order by created_at,id),'[]') into receipts from public.product_event_receipts r where user_id=p_user_id;
 return jsonb_build_object('available',true,'sources',sources,'events',events,'links',links,'receipts',receipts,'nextRevision',next_revision);
end $$;
create function public.purge_expired_product_events(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid;removed integer;total integer:=0;
begin
 perform public.product_event_service();if p_limit is null or p_limit not between 1 and 5000 then raise exception 'invalid retention batch';end if;
 for owner_id in select distinct e.user_id from public.product_events e join public.product_event_sources s on s.id=e.source_id where e.deleted_at is null and e.captured_at<=clock_timestamp()-make_interval(days=>s.retention_days) order by e.user_id loop
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,117));removed:=public.erase_product_event_rows(owner_id,null,true,p_limit-total);if removed>0 then insert into public.product_event_receipts(user_id,removed_count,reason) values(owner_id,removed,'retention');end if;total:=total+removed;exit when total>=p_limit;
 end loop;return jsonb_build_object('erased',total);
end $$;
revoke all on function public.product_event_service(),public.product_event_owner(uuid),public.preserve_product_event_history(),public.erase_product_event_rows(uuid,uuid,boolean,integer),public.validate_product_event(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.mutate_product_event_source(uuid,jsonb,text),public.ingest_product_event(text,jsonb),public.link_product_event(uuid,jsonb),public.list_product_events(uuid,bigint,integer),public.purge_expired_product_events(integer) from public,anon,authenticated;
grant execute on function public.mutate_product_event_source(uuid,jsonb,text),public.ingest_product_event(text,jsonb),public.link_product_event(uuid,jsonb),public.list_product_events(uuid,bigint,integer),public.purge_expired_product_events(integer) to service_role;
commit;

