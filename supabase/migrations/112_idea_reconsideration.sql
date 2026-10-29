-- Manual archived condition history; no automatic decision or real-contact side effects.
begin;
create unique index if not exists ideas_reconsideration_owner on public.ideas(id,user_id);
create table public.idea_reconsideration_entries(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),idea_id uuid not null,
 revision integer generated always as identity unique,kind text not null check(kind in ('condition','retract','evaluation','cue','ack')),
 condition_version_id uuid,expected_version_id uuid,cue_id uuid,evaluation_id uuid,
 learned text,change_required text,criterion text,scope text,decision_snapshot jsonb,
 outcome text check(outcome in ('met','not_met','unknown')),coverage text,source_snapshot jsonb,
 request_id uuid,request_payload jsonb,created_at timestamptz not null default clock_timestamp(),
 unique(id,user_id,idea_id),unique(user_id,request_id),
 foreign key(idea_id,user_id) references public.ideas(id,user_id) on delete restrict,
 foreign key(condition_version_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(expected_version_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(cue_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(evaluation_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict
);
create table public.idea_reconsideration_requests(
 user_id uuid not null references auth.users(id),request_id uuid not null,idea_id uuid not null,entry_id uuid not null,cue_id uuid,
 request_payload jsonb not null,result jsonb not null,primary key(user_id,request_id),
 foreign key(entry_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict,
 foreign key(cue_id,user_id,idea_id) references public.idea_reconsideration_entries(id,user_id,idea_id) on delete restrict
);
alter table public.idea_reconsideration_requests enable row level security;
create policy reconsideration_request_owner on public.idea_reconsideration_requests for select to authenticated using(auth.uid()=user_id);
grant select on public.idea_reconsideration_requests to authenticated,service_role;
revoke insert,update,delete on public.idea_reconsideration_requests from anon,authenticated,service_role;
create unique index reconsideration_one_cue on public.idea_reconsideration_entries(condition_version_id) where kind='cue';
create unique index reconsideration_one_ack on public.idea_reconsideration_entries(cue_id) where kind='ack';
create index reconsideration_history on public.idea_reconsideration_entries(user_id,idea_id,revision desc);
alter table public.idea_reconsideration_entries enable row level security;
create policy reconsideration_owner on public.idea_reconsideration_entries for select to authenticated using(auth.uid()=user_id);
grant select on public.idea_reconsideration_entries to authenticated,service_role;
revoke insert,update,delete on public.idea_reconsideration_entries from anon,authenticated,service_role;
create function public.reconsideration_history_guard() returns trigger language plpgsql as $$begin
 if tg_op<>'INSERT' or current_setting('ideaos.reconsideration_write',true) is distinct from 'allowed' then raise exception 'immutable reconsideration history';end if;return new;end$$;
create trigger reconsideration_immutable before insert or update or delete on public.idea_reconsideration_entries for each row execute function public.reconsideration_history_guard();
create trigger reconsideration_request_immutable before insert or update or delete on public.idea_reconsideration_requests for each row execute function public.reconsideration_history_guard();
create function public.save_idea_reconsideration(p_user_id uuid,p_idea_id uuid,p_request_id uuid,p_kind text,p_expected_version_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old idea_reconsideration_requests;latest idea_reconsideration_entries;receipt idea_reconsideration_entries;req jsonb;result_id uuid;cue uuid;source jsonb;raw_source jsonb;record_source jsonb;decision jsonb;quote text;k text;idx integer;
begin
 if p_user_id is null then raise exception 'reconsideration owner required' using errcode='42501';end if;
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 if p_idea_id is null or p_request_id is null or p_kind is null or p_kind not in ('condition','retract','evaluation','ack') or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>180000 then raise exception 'invalid reconsideration input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,112));
 req=jsonb_build_object('ideaId',p_idea_id,'kind',p_kind,'expectedVersionId',p_expected_version_id,'payload',p_payload);
 select * into old from idea_reconsideration_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if old.request_payload is distinct from req then raise exception 'request conflict';end if;
 return old.result;end if;
 perform 1 from ideas where id=p_idea_id and user_id=p_user_id for update;if not found then raise exception 'idea unavailable';end if;
 if not exists(select 1 from ideas where id=p_idea_id and user_id=p_user_id and status::text='归档') then raise exception 'archived idea required';end if;
 select * into latest from idea_reconsideration_entries where user_id=p_user_id and idea_id=p_idea_id and kind in ('condition','retract') order by revision desc limit 1;
 if latest.id is distinct from p_expected_version_id then raise exception 'stale condition version';end if;
 if p_kind<>'condition' and (latest.id is null or latest.kind<>'condition') then raise exception 'active condition required';end if;
 if p_kind='condition' then
 foreach k in array array['learned','changeRequired','criterion','scope'] loop
 if jsonb_typeof(p_payload->k) is distinct from 'string' or length(trim(p_payload->>k)) not between 1 and 4000 then raise exception 'condition text required %',k;end if;end loop;
 if p_payload->>'decisionId' is not null then
 select jsonb_build_object('id',d.id,'learned',d.learned,'verdict',d.verdict) into decision from decisions d where d.id=(p_payload->>'decisionId')::uuid and d.idea_id=p_idea_id and lower(d.verdict::text)='kill';
 if decision is null then raise exception 'Kill learning unavailable';end if;end if;
 elsif p_kind='evaluation' then
 if coalesce(p_payload->>'outcome','') not in ('met','not_met','unknown') or length(trim(coalesce(p_payload->>'coverage',''))) not between 1 and 4000 then raise exception 'evaluation outcome and coverage required';end if;
 raw_source=p_payload->'source';quote=raw_source->>'quote';
 if jsonb_typeof(raw_source) is distinct from 'object' or jsonb_typeof(raw_source->'quote') is distinct from 'string' or length(trim(quote)) not between 1 and 20000 then raise exception 'source quote required';end if;
 if raw_source->>'kind'='manual' then
 if jsonb_typeof(raw_source->'rawText') is distinct from 'string' or length(raw_source->>'rawText') not between 1 and 100000 or coalesce(raw_source->>'url','') !~ '^https?://' or raw_source->>'url' ~ '^https?://[^/[:space:]]*@' or raw_source->>'url' ~ '[[:cntrl:][:space:]]' or length(raw_source->>'url')>8000 then raise exception 'manual source URL and material required';end if;
 source=jsonb_build_object('kind','manual','origin','user_provided','url',raw_source->>'url','rawText',raw_source->>'rawText','quote',quote);
 elsif raw_source->>'kind'='observation_run' then
 if to_regclass('public.decision_observation_runs') is null then raise exception 'observation source unavailable: migration 108 required';end if;
 if coalesce(raw_source->>'recordIndex','') !~ '^[0-9]{1,3}$' then raise exception 'invalid record index';end if;idx=(raw_source->>'recordIndex')::integer;if idx>499 then raise exception 'invalid record index';end if;
 execute 'select payload from public.decision_observation_runs where id=$1 and user_id=$2' into record_source using (raw_source->>'runId')::uuid,p_user_id;
 if record_source is null then raise exception 'observation source unavailable';end if;
 record_source=record_source->'records'->idx;if record_source is null then raise exception 'observation record unavailable';end if;
 if coalesce(record_source->>'origin','') not in ('manual','public','synthetic','ai_seed') then raise exception 'observation origin unavailable';end if;
 if p_payload->>'outcome'='met' and record_source->>'origin' in ('synthetic','ai_seed') then raise exception 'synthetic/AI material cannot meet real condition';end if;
 if record_source->>'origin'='public' and coalesce(record_source->>'sourceUrl','') !~ '^https?://' then raise exception 'public record URL required';end if;
 source=jsonb_build_object('kind','observation_run','runId',raw_source->>'runId','recordIndex',idx,'origin',record_source->>'origin','url',record_source->>'sourceUrl','rawText',record_source->>'text','quote',quote,'title',record_source->>'title');
 elsif raw_source->>'kind'='company_entry' then
 if to_regclass('public.company_observation_entries') is null then raise exception 'company source unavailable: migration 110 required';end if;
 execute 'select payload->''source'' from public.company_observation_entries where id=$1 and user_id=$2 and kind in (''activity'',''snapshot'')' into record_source using (raw_source->>'entryId')::uuid,p_user_id;
 if record_source is null or coalesce(record_source->>'kind','') not in ('manual_import','official_response','web_capture','saved_job') then raise exception 'company source unavailable';end if;
 source=jsonb_build_object('kind','company_entry','entryId',raw_source->>'entryId','origin',record_source->>'kind','url',record_source->>'url','rawText',record_source->>'rawText','quote',quote,'scope',record_source->>'scope');
 else raise exception 'invalid material source';end if;
 if length(coalesce(source->>'rawText','')) not between 1 and 100000 or position(quote in source->>'rawText')=0 then raise exception 'quote not found in actual material text';end if;
 elsif p_kind='ack' then
 select id into cue from idea_reconsideration_entries where id=(p_payload->>'cueId')::uuid and user_id=p_user_id and idea_id=p_idea_id and condition_version_id=latest.id and kind='cue';if cue is null then raise exception 'cue unavailable';end if;
 select * into receipt from idea_reconsideration_entries where kind='ack' and cue_id=cue;
 if found then
 perform set_config('ideaos.reconsideration_write','allowed',true);
 insert into idea_reconsideration_requests(user_id,request_id,idea_id,entry_id,cue_id,request_payload,result) values(p_user_id,p_request_id,p_idea_id,receipt.id,cue,req,jsonb_build_object('id',receipt.id,'cueId',cue));
 perform set_config('ideaos.reconsideration_write','',true);
 return jsonb_build_object('id',receipt.id,'cueId',cue);end if;
 end if;
 perform set_config('ideaos.reconsideration_write','allowed',true);
 insert into idea_reconsideration_entries(user_id,idea_id,kind,condition_version_id,expected_version_id,cue_id,learned,change_required,criterion,scope,decision_snapshot,outcome,coverage,source_snapshot,request_id,request_payload)
 values(p_user_id,p_idea_id,p_kind,case when p_kind='condition' then null else latest.id end,p_expected_version_id,cue,case when p_kind='condition' then p_payload->>'learned' end,case when p_kind='condition' then p_payload->>'changeRequired' end,case when p_kind='condition' then p_payload->>'criterion' end,case when p_kind='condition' then p_payload->>'scope' end,decision,case when p_kind='evaluation' then p_payload->>'outcome' end,case when p_kind='evaluation' then p_payload->>'coverage' end,source,p_request_id,req) returning id into result_id;
 if p_kind='evaluation' then
 select id into cue from idea_reconsideration_entries where condition_version_id=latest.id and kind='cue';
 if p_payload->>'outcome'='met' and cue is null then
 insert into idea_reconsideration_entries(user_id,idea_id,kind,condition_version_id,evaluation_id) values(p_user_id,p_idea_id,'cue',latest.id,result_id) returning id into cue;
 end if;end if;
 insert into idea_reconsideration_requests(user_id,request_id,idea_id,entry_id,cue_id,request_payload,result) values(p_user_id,p_request_id,p_idea_id,result_id,cue,req,jsonb_build_object('id',result_id,'cueId',cue));
 perform set_config('ideaos.reconsideration_write','',true);
 return jsonb_build_object('id',result_id,'cueId',cue);
end$$;
create function public.list_idea_reconsideration_cues(p_user_id uuid,p_before_revision integer default null) returns setof public.idea_reconsideration_entries language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_user_id is null then raise exception 'reconsideration owner required' using errcode='42501';end if;
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 return query select c.* from idea_reconsideration_entries c join ideas i on i.id=c.idea_id and i.user_id=c.user_id
 where c.user_id=p_user_id and c.kind='cue' and i.status::text='归档' and (p_before_revision is null or c.revision<p_before_revision)
 and c.condition_version_id=(select v.id from idea_reconsideration_entries v where v.idea_id=c.idea_id and v.user_id=p_user_id and v.kind in ('condition','retract') order by v.revision desc limit 1)
 and (select e.outcome from idea_reconsideration_entries e where e.kind='evaluation' and e.user_id=p_user_id and e.condition_version_id=c.condition_version_id order by e.revision desc limit 1)='met'
 and not exists(select 1 from idea_reconsideration_entries a where a.kind='ack' and a.cue_id=c.id and a.user_id=p_user_id)
 order by c.revision desc limit 21;
end$$;
revoke all on function public.save_idea_reconsideration(uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.list_idea_reconsideration_cues(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_idea_reconsideration(uuid,uuid,uuid,text,uuid,jsonb) to service_role;
grant execute on function public.list_idea_reconsideration_cues(uuid,integer) to service_role;
commit;

