begin;
create table public.company_observation_entries (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),company_id uuid not null references public.companies(id) on delete restrict,
 revision integer not null check(revision>0),
 kind text not null check(kind in ('identity','activity','snapshot','review')),payload jsonb not null,
 request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default clock_timestamp(),content_hash text not null,
 unique(user_id,request_id),unique(company_id,revision)
);
create index company_observation_history on public.company_observation_entries(user_id,company_id,created_at desc,id desc);
create index company_observation_identity_history on public.company_observation_entries(user_id,company_id,revision desc) where kind='identity';
alter table public.company_observation_entries enable row level security;
create policy company_observation_owner on public.company_observation_entries for select using(auth.uid()=user_id);
grant select on public.company_observation_entries to authenticated,service_role;
revoke insert,update,delete on public.company_observation_entries from anon,authenticated,service_role;
create function public.company_observation_guard() returns trigger language plpgsql as $$begin
 if tg_op<>'INSERT' or current_setting('ideaos.company_write',true) is distinct from 'allowed' then raise exception 'immutable company history; use RPC';end if;return new;end$$;
create trigger company_observation_immutable before insert or update or delete on public.company_observation_entries for each row execute function public.company_observation_guard();
create function public.validate_company_source(s jsonb) returns void language plpgsql as $$begin
 if jsonb_typeof(s) is distinct from 'object' or coalesce(s->>'kind','') not in ('manual_import','official_response','web_capture','saved_job') or length(coalesce(s->>'rawText','')) not between 1 and 100000 or length(coalesce(s->>'quote','')) not between 1 and 20000 or position(s->>'quote' in s->>'rawText')=0 then raise exception 'invalid source quote';end if;
 if s ? 'requestProof' and (jsonb_typeof(s->'requestProof') is distinct from 'string' or coalesce(s->>'requestProof','') !~ '^[a-f0-9]{64}$') then raise exception 'invalid request proof';end if;
 if length(trim(coalesce(s->>'scope','')))=0 or length(s->>'scope')>2000 or (s->>'url' is not null and (s->>'url' !~ '^https?://' or s->>'url' ~ '^https?://[^/[:space:]]*@' or s->>'url' ~ '[[:cntrl:]]' or length(s->>'url')>8000)) then raise exception 'invalid source scope/url';end if;
end$$;
create function public.company_job_preview_hash(j public.job_postings) returns text language sql immutable set search_path=public,pg_temp as $$
 select encode(sha256(convert_to(string_agg(case when value is null then '-1:' else octet_length(convert_to(value,'UTF8'))::text||':'||value end,'' order by ordinal),'UTF8')),'hex')
 from unnest(array[j.id::text,j.company_id::text,j.company_name,j.title,j.body,j.url,j.found_on::text]) with ordinality as fields(value,ordinal)
$$;
create function public.save_company_observation(p_user_id uuid,p_company_id uuid,p_request_id uuid,p_kind text,p_payload jsonb,p_expected_identity_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.company_observation_entries;latest public.company_observation_entries;other_row record;result_id uuid;stored jsonb;req jsonb;job public.job_postings;idea public.ideas;v text;
begin
 if p_user_id is null then raise exception 'company owner required' using errcode='42501';end if;
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 if p_request_id is null or p_company_id is null or p_kind not in ('identity','activity','snapshot','review','job') or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>150000 then raise exception 'invalid company input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,110));
 req=jsonb_build_object('companyId',p_company_id,'kind',p_kind,'payload',p_payload,'expectedIdentityId',p_expected_identity_id);
 select * into old from company_observation_entries where user_id=p_user_id and request_id=p_request_id;
 if found then if old.request_payload is distinct from req then raise exception 'request conflict';end if;return jsonb_build_object('id',old.id);end if;
 perform 1 from companies where id=p_company_id and user_id=p_user_id for update;if not found then raise exception 'company unavailable';end if;
 stored=p_payload;
 if p_kind='identity' then
 select * into latest from company_observation_entries where user_id=p_user_id and company_id=p_company_id and kind='identity' order by revision desc limit 1;
 if latest.id is distinct from p_expected_identity_id then raise exception 'stale identity';end if;
 if coalesce(p_payload->>'action','') not in ('confirm','clear') then raise exception 'invalid identity action';end if;
 if p_payload->>'action'='confirm' then
 if coalesce(p_payload#>>'{identity,corporateNumber}','') !~ '^[0-9]{13}$' or length(trim(coalesce(p_payload#>>'{identity,legalName}','')))=0 or length(trim(coalesce(p_payload#>>'{identity,address}','')))=0 then raise exception 'invalid identity';end if;
 perform validate_company_source(p_payload#>'{identity,source}');
 for other_row in select distinct on(company_id) company_id,payload from company_observation_entries where user_id=p_user_id and kind='identity' and company_id<>p_company_id order by company_id,revision desc loop
 if other_row.payload->>'action'='confirm' and other_row.payload#>>'{identity,corporateNumber}'=p_payload#>>'{identity,corporateNumber}' then raise exception 'corporate number already bound';end if;end loop;
 end if;
 elsif p_kind='review' then
 perform 1 from company_observation_entries where id=(p_payload->>'sourceEntryId')::uuid and company_id=p_company_id and user_id=p_user_id and kind<>'review';if not found then raise exception 'entry unavailable';end if;
 select * into idea from ideas where id=(p_payload->>'ideaId')::uuid and user_id=p_user_id;if not found then raise exception 'idea unavailable';end if;
 if length(trim(coalesce(p_payload->>'assumption','')))=0 or length(trim(coalesce(p_payload->>'unknown','')))=0 then raise exception 'review assumption and unknown required';end if;
 stored=stored||jsonb_build_object('ideaSnapshot',jsonb_build_object('id',idea.id,'title',idea.title));
 elsif p_kind='job' then
 select * into job from job_postings where id=(p_payload->>'jobId')::uuid and user_id=p_user_id for share;if not found or (job.company_id is not null and job.company_id<>p_company_id) then raise exception 'job unavailable';end if;
 if job.company_id is null and coalesce(p_payload->>'confirmCandidate','false')<>'true' then raise exception 'candidate confirmation required';end if;
 if p_payload->>'previewHash' is distinct from company_job_preview_hash(job) then raise exception 'job changed; reload preview';end if;
 stored=jsonb_build_object('type','recruitment','stage','announcement','title',job.title,'occurredOn',job.found_on,'dateUnknown',job.found_on is null,'source',jsonb_build_object('kind','saved_job','url',job.url,'rawText',left(job.body,100000),'quote',left(job.body,20000),'scope',format('one saved job posting; body captured %s of %s characters%s; quote %s of %s captured characters%s',least(length(job.body),100000),length(job.body),case when length(job.body)>100000 then ' (clipped)' else '' end,least(length(job.body),20000),least(length(job.body),100000),case when length(job.body)>20000 then ' (clipped)' else '' end)),'details',jsonb_build_object('jobSnapshot',jsonb_build_object('id',job.id,'company_id',job.company_id,'company_name',job.company_name,'title',job.title,'url',job.url,'found_on',job.found_on,'facts',job.facts),'originalBodyHash',encode(sha256(convert_to(job.body,'UTF8')),'hex'),'capturedBodyHash',encode(sha256(convert_to(left(job.body,100000),'UTF8')),'hex'),'originalBodyLength',length(job.body),'capturedBodyLength',least(length(job.body),100000),'bodyTruncated',length(job.body)>100000,'quoteTruncated',length(job.body)>20000,'candidateConfirmed',job.company_id is null));
 perform validate_company_source(stored->'source');
 else
 if coalesce(stored->>'type','') not in ('manual','procurement','subsidy','recruitment','price','feature','disclosure') or coalesce(stored->>'stage','') not in ('announcement','action','result') or length(trim(coalesce(stored->>'title','')))=0 then raise exception 'invalid activity';end if;
 perform validate_company_source(stored->'source');
 if p_kind='activity' and (stored#>>'{source,kind}'='official_response' or stored->'details' ? 'corporateNumber') then
 select * into latest from company_observation_entries where user_id=p_user_id and company_id=p_company_id and kind='identity' order by revision desc limit 1;
 if latest.id is null or latest.payload->>'action'<>'confirm' or latest.id::text is distinct from stored#>>'{details,identityEntryId}' or latest.payload#>>'{identity,corporateNumber}' is distinct from stored#>>'{details,corporateNumber}' then raise exception 'company identity changed; reload official data';end if;
 end if;
 if jsonb_typeof(stored->'dateUnknown') is distinct from 'boolean' or (stored->>'dateUnknown')::boolean is distinct from (stored->>'occurredOn' is null) then raise exception 'unknown date declaration required';end if;
 if stored->>'occurredOn' is not null then v=(stored->>'occurredOn')::date::text;if v<>stored->>'occurredOn' then raise exception 'invalid activity date';end if;end if;
 if jsonb_typeof(stored->'details') is distinct from 'object' then raise exception 'invalid details';end if;
 end if;
 perform set_config('ideaos.company_write','allowed',true);
 insert into company_observation_entries(user_id,company_id,kind,payload,request_id,request_payload,content_hash,revision) values(p_user_id,p_company_id,case when p_kind='job' then 'activity' else p_kind end,stored,p_request_id,req,encode(sha256(convert_to(stored::text,'UTF8')),'hex'),(select coalesce(max(revision),0)+1 from company_observation_entries where company_id=p_company_id)) returning id into result_id;
 perform set_config('ideaos.company_write','',true);
 return jsonb_build_object('id',result_id);
end$$;
revoke all on function public.save_company_observation(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_company_observation(uuid,uuid,uuid,text,jsonb,uuid) to service_role;
commit;







