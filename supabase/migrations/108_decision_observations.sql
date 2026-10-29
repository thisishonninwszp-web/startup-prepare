-- Manual observation history. No validation/status/activity writes or external calls.
begin;
create unique index if not exists idea_info_gaps_owner_idea_id on public.idea_info_gaps(id,user_id,idea_id);
create table public.decision_observation_tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 object_type text not null default 'idea' check(object_type='idea'), object_id uuid not null references public.ideas(id),
 gap_id uuid, created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(gap_id,user_id,object_id) references public.idea_info_gaps(id,user_id,idea_id) on delete restrict
);
create table public.decision_observation_versions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,task_id uuid not null,
 revision integer not null check(revision>0),config jsonb not null,decision_snapshot jsonb not null,gap_snapshot jsonb,
 client_request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default now(),
 unique(task_id,revision),unique(user_id,client_request_id),unique(id,task_id,user_id),
 foreign key(task_id,user_id) references public.decision_observation_tasks(id,user_id) on delete restrict
);
create table public.decision_observation_runs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,task_id uuid not null,task_version_id uuid not null,
 payload jsonb not null,snapshots jsonb not null,client_request_id uuid not null,created_at timestamptz not null default now(),
 unique(user_id,client_request_id),foreign key(task_version_id,task_id,user_id) references public.decision_observation_versions(id,task_id,user_id) on delete restrict
);
create table public.decision_observation_gap_refs (
 user_id uuid not null,gap_id uuid not null references public.idea_info_gaps(id) on delete restrict,
 run_id uuid not null references public.decision_observation_runs(id) on delete restrict,
 request_id uuid not null,primary key(user_id,request_id)
);
create function public.observation_owner(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_user_id is null or (coalesce(auth.role(),'')<>'service_role' and auth.uid() is distinct from p_user_id) then raise exception 'observation owner required' using errcode='42501';end if;
end $$;
create function public.validate_observation_config(c jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
declare k text;item jsonb;
begin
 if jsonb_typeof(c) is distinct from 'object' or c->>'mode' is distinct from 'manual' or length(c::text)>60000 then raise exception 'invalid observation config';end if;
 foreach k in array array['question','decisionToChange','stopCondition','region','language','timeRange'] loop
 if jsonb_typeof(c->k) is distinct from 'string' or length(c->>k)>2000 or (k in ('question','decisionToChange','stopCondition') and length(trim(c->>k))=0) then raise exception 'invalid config text %',k;end if;
 end loop;
 foreach k in array array['sources','fixedPhrases','exploratoryPhrases','seeds'] loop
 if jsonb_typeof(c->k) is distinct from 'array' then raise exception 'invalid config array %',k;end if;
 if jsonb_array_length(c->k)>100 then raise exception 'config array too long';end if;
 for item in select value from jsonb_array_elements(c->k) loop
 if k='seeds' then
 if jsonb_typeof(item) is distinct from 'object' or length(trim(coalesce(item->>'text','')))=0 or length(item->>'text')>2000 or coalesce(item->>'origin','') not in ('user','source','ai') then raise exception 'invalid seed';end if;
 else
 if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}'))=0 or length(item#>>'{}')>2000 then raise exception 'invalid config phrase';end if;
 end if;
 end loop;
 end loop;
 if jsonb_typeof(c->'filters') is distinct from 'object' or (c->'resources' is distinct from 'null'::jsonb and jsonb_typeof(c->'resources') is distinct from 'object') then raise exception 'invalid config resources';end if;
 if jsonb_typeof(c->'resources')='object' and exists(select 1 from jsonb_each(c->'resources') where jsonb_typeof(value)<>'boolean') then raise exception 'invalid resource flag';end if;
end $$;
create function public.observation_history_guard() returns trigger language plpgsql as $$
begin
 if tg_op<>'INSERT' or current_setting('ideaos.observation_write',true) is distinct from 'allowed' then raise exception 'immutable observation history; use RPC';end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['decision_observation_tasks','decision_observation_versions','decision_observation_runs','decision_observation_gap_refs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy observation_read on public.%I for select to authenticated using(auth.uid()=user_id)',t);
 execute format('grant select on public.%I to authenticated,service_role',t);
 execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 execute format('create trigger observation_immutable before insert or update or delete on public.%I for each row execute function public.observation_history_guard()',t);
 end loop;
end $$;
create function public.save_decision_observation_version(p_user_id uuid,p_task_id uuid,p_object_id uuid,p_gap_id uuid,p_config jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.decision_observation_tasks; old public.decision_observation_versions; v_id uuid; rev integer; snap jsonb; gap jsonb; req jsonb;
begin
 perform public.observation_owner(p_user_id);
 if p_request_id is null then raise exception 'request required';end if;
 perform public.validate_observation_config(p_config);
 req=jsonb_build_object('taskId',p_task_id,'objectId',p_object_id,'gapId',p_gap_id,'config',p_config);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,0));
 select * into old from public.decision_observation_versions where user_id=p_user_id and client_request_id=p_request_id;
 if found then
 if old.request_payload<>req then raise exception 'request payload conflict';end if;
 return jsonb_build_object('id',old.id,'taskId',old.task_id,'revision',old.revision);end if;
 perform set_config('ideaos.observation_write','allowed',true);
 if p_task_id is null then
 if not exists(select 1 from public.ideas where id=p_object_id and user_id=p_user_id) then raise exception 'idea unavailable';end if;
 insert into public.decision_observation_tasks(user_id,object_id,gap_id) values(p_user_id,p_object_id,p_gap_id) returning * into t;
 else
 select * into t from public.decision_observation_tasks where id=p_task_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.ideas where id=t.object_id and user_id=p_user_id) then raise exception 'task unavailable';end if;
 end if;
 select to_jsonb(i) into snap from public.ideas i where id=t.object_id and user_id=p_user_id;
 snap=jsonb_build_object('idea',snap,'currentClosure',(select to_jsonb(c) from public.decision_closures c where c.object_type='idea' and c.object_id=t.object_id and c.user_id=p_user_id and c.status='active' order by c.created_at desc limit 1));
 if t.gap_id is not null then select to_jsonb(g) into gap from public.idea_info_gaps g where id=t.gap_id and user_id=p_user_id and idea_id=t.object_id;end if;
 select coalesce(max(revision),0)+1 into rev from public.decision_observation_versions where task_id=t.id;
 insert into public.decision_observation_versions(user_id,task_id,revision,config,decision_snapshot,gap_snapshot,client_request_id,request_payload)
 values(p_user_id,t.id,rev,p_config,snap,gap,p_request_id,req) returning id into v_id;
 perform set_config('ideaos.observation_write','',true);
 return jsonb_build_object('id',v_id,'taskId',t.id,'revision',rev);
end $$;
create function public.save_decision_observation_run(p_user_id uuid,p_task_id uuid,p_version_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.decision_observation_runs;r jsonb; snaps jsonb='[]';rid uuid;k text;bound_config jsonb;
begin
 perform public.observation_owner(p_user_id);
 select v.config into bound_config from public.decision_observation_versions v join public.decision_observation_tasks t on t.id=v.task_id join public.ideas i on i.id=t.object_id where v.id=p_version_id and v.task_id=p_task_id and v.user_id=p_user_id and i.user_id=p_user_id;
 if p_request_id is null or not found then raise exception 'version unavailable';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'records') is distinct from 'array' then raise exception 'invalid run payload';end if;
 if p_payload->>'parserVersion'='search-csv-v1' then
 if p_payload->>'status' is distinct from 'success'
 or length(trim(coalesce(bound_config->>'region','')))=0
 or length(trim(coalesce(bound_config->>'language','')))=0
 or length(trim(coalesce(bound_config->>'timeRange','')))=0
 or p_payload#>'{requestConditions,region}' is distinct from bound_config->'region'
 or p_payload#>'{requestConditions,language}' is distinct from bound_config->'language'
 or p_payload#>'{requestConditions,timeframe}' is distinct from bound_config->'timeRange'
 then raise exception 'search import context must match immutable task version';end if;
 end if;
 if jsonb_array_length(p_payload->'records')>500 or length(p_payload::text)>2000000
 or coalesce(p_payload->>'status','') not in ('success','partial','failed','unavailable')
 or coalesce(p_payload->>'resultState','') not in ('observed','zero','suppressed','unknown','failed') then raise exception 'invalid run payload';end if;
 if p_payload->>'status' in ('failed','unavailable') and (jsonb_array_length(p_payload->'records')>0 or p_payload->>'resultState'<>'failed') then raise exception 'failure is not zero';end if;
 if p_payload->>'resultState'='failed' and p_payload->>'status' not in ('failed','unavailable') then raise exception 'invalid failed status';end if;
 if p_payload->>'resultState'='zero' and jsonb_array_length(p_payload->'records')>0 then raise exception 'invalid zero result';end if;
 if p_payload->>'resultState'='observed' and jsonb_array_length(p_payload->'records')=0 then raise exception 'empty result must be explicit zero or unknown';end if;
 if (p_payload->>'costMinor' is null)<>(p_payload->>'currency' is null) or (p_payload->>'costMinor' is not null and (jsonb_typeof(p_payload->'costMinor')<>'number' or (p_payload->>'costMinor')::numeric<0 or trunc((p_payload->>'costMinor')::numeric)<>(p_payload->>'costMinor')::numeric or p_payload->>'currency' !~ '^[A-Z]{3}$')) then raise exception 'invalid cost';end if;
 foreach k in array array['parserVersion','returnedScope','dataPeriod','error','rawSnapshot','startedAt'] loop
 if p_payload->>k is not null and jsonb_typeof(p_payload->k)<>'string' then raise exception 'invalid run text %',k;end if;
 if k<>'rawSnapshot' and length(p_payload->>k)>2000 then raise exception 'run text too long';end if;
 end loop;
 if length(p_payload->>'rawSnapshot')>500000 or (p_payload ? 'truncated' and jsonb_typeof(p_payload->'truncated')<>'boolean') then raise exception 'invalid capture bounds';end if;
 foreach k in array array['requestConditions','providerMetadata','pagination','providerUsage'] loop
 if p_payload->>k is not null and jsonb_typeof(p_payload->k)<>'object' then raise exception 'invalid run metadata';end if;
 end loop;
 for r in select value from jsonb_array_elements(p_payload->'records') loop
 if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'text') is distinct from 'string' or length(trim(coalesce(r->>'text','')))=0 or length(r->>'text')>30000 or jsonb_typeof(r->'title') is distinct from 'string' or length(trim(coalesce(r->>'title','')))=0 or length(r->>'title')>2000 or coalesce(r->>'origin','') not in ('manual','public','synthetic','ai_seed') then raise exception 'invalid observation record';end if;
 if r->>'origin'='public' and coalesce(r->>'sourceUrl','') !~ '^https?://' then raise exception 'public source required';end if;
 if r->>'sourceUrl' is not null and (jsonb_typeof(r->'sourceUrl')<>'string' or r->>'sourceUrl' !~ '^https?://' or length(r->>'sourceUrl')>2000) then raise exception 'invalid source URL';end if;
 foreach k in array array['metric','unit','time','region','publishedAt'] loop
 if r->>k is not null and (jsonb_typeof(r->k)<>'string' or length(r->>k)>2000) then raise exception 'invalid record text %',k;end if;
 end loop;
 foreach k in array array['data','providerMetadata'] loop
 if r->>k is not null and jsonb_typeof(r->k)<>'object' then raise exception 'invalid record metadata';end if;
 end loop;
 if r->'value'<>'null'::jsonb and jsonb_typeof(r->'value')<>'number' then raise exception 'invalid observed number';end if;
 snaps=snaps||jsonb_build_array(jsonb_build_object('text',r->>'text','sourceUrl',r->>'sourceUrl','publishedAt',r->>'publishedAt','origin',r->>'origin','captureScope','user-provided-excerpt','capturedAt',now(),'hash',encode(sha256(convert_to(r::text,'UTF8')),'hex')));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,1));
 select * into old from public.decision_observation_runs where user_id=p_user_id and client_request_id=p_request_id;
 if found then if old.task_id<>p_task_id or old.task_version_id<>p_version_id or old.payload<>p_payload then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old.id);end if;
 if p_payload->>'retryOf' is not null and not exists(select 1 from public.decision_observation_runs where id=(p_payload->>'retryOf')::uuid and user_id=p_user_id and task_id=p_task_id) then raise exception 'retry unavailable';end if;
 perform set_config('ideaos.observation_write','allowed',true);
 insert into public.decision_observation_runs(user_id,task_id,task_version_id,payload,snapshots,client_request_id)values(p_user_id,p_task_id,p_version_id,p_payload,snaps,p_request_id)returning id into rid;
 perform set_config('ideaos.observation_write','',true);
 return jsonb_build_object('id',rid);
end $$;
create function public.attach_observation_gap_ref(p_user_id uuid,p_gap_id uuid,p_run_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.idea_info_gaps; old public.decision_observation_gap_refs; already_attached boolean;
begin
 perform public.observation_owner(p_user_id);
 if p_request_id is null then raise exception 'request required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,2));
 select * into old from public.decision_observation_gap_refs where user_id=p_user_id and request_id=p_request_id;
 if found then if old.gap_id<>p_gap_id or old.run_id<>p_run_id then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old.run_id);end if;
 select * into g from public.idea_info_gaps where id=p_gap_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.decision_observation_runs r join public.decision_observation_tasks t on t.id=r.task_id join public.ideas i on i.id=t.object_id where r.id=p_run_id and r.user_id=p_user_id and t.object_id=g.idea_id and i.user_id=p_user_id) then raise exception 'gap or run unavailable';end if;
 perform set_config('ideaos.observation_write','allowed',true);
 select exists(select 1 from public.decision_observation_gap_refs where gap_id=p_gap_id and run_id=p_run_id) into already_attached;
 insert into public.decision_observation_gap_refs(user_id,gap_id,run_id,request_id)values(p_user_id,p_gap_id,p_run_id,p_request_id);
 if not already_attached then update public.idea_info_gaps set evidence=coalesce(evidence,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'title','人工观察记录','observation_run_id',p_run_id,'note','公开材料或人工摘录；痛点和付费仍须真实验证')) where id=p_gap_id and user_id=p_user_id;end if;
 perform set_config('ideaos.observation_write','',true);
 return jsonb_build_object('id',p_run_id);
end $$;
revoke all on function public.observation_owner(uuid) from public;
revoke all on function public.observation_history_guard() from public;
revoke all on function public.validate_observation_config(jsonb) from public;
revoke all on function public.save_decision_observation_version(uuid,uuid,uuid,uuid,jsonb,uuid) from public;
revoke all on function public.save_decision_observation_run(uuid,uuid,uuid,uuid,jsonb) from public;
revoke all on function public.attach_observation_gap_ref(uuid,uuid,uuid,uuid) from public;
grant execute on function public.save_decision_observation_version(uuid,uuid,uuid,uuid,jsonb,uuid),public.save_decision_observation_run(uuid,uuid,uuid,uuid,jsonb),public.attach_observation_gap_ref(uuid,uuid,uuid,uuid) to authenticated,service_role;
commit;
