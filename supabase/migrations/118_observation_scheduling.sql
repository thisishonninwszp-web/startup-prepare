begin;
-- Budgeted manual opt-in schedules for approved immutable e-Stat configurations only.
create table public.observation_schedules (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),config_id uuid not null references public.statistical_source_configs(id),
 source_binding jsonb not null,revision bigint not null default 1,enabled boolean not null,
 interval_minutes integer not null check(interval_minutes between 60 and 43200),daily_budget integer not null check(daily_budget between 1 and 10000),max_attempts integer not null check(max_attempts between 1 and 5),
 failures integer not null default 0,health text not null default 'ready' check(health in ('ready','running','paused','blocked','failed')),
 last_error text,next_run_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(user_id,id)
);
create table public.observation_schedule_budgets (
 schedule_id uuid not null references public.observation_schedules(id),budget_day date not null,charged integer not null default 0 check(charged>=0),primary key(schedule_id,budget_day)
);
create table public.observation_schedule_runs (
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,schedule_id uuid not null references public.observation_schedules(id),user_id uuid not null references auth.users(id),config_id uuid not null,
 schedule_revision bigint not null,source_binding jsonb not null,settings jsonb not null,
 token uuid not null default gen_random_uuid(),status text not null check(status in ('running','completed','failed','cancelled','expired')),
 lease_until timestamptz not null,budget_day date not null,reserved integer not null default 2 check(reserved=2),requests_attempted integer not null default 0 check(requests_attempted between 0 and 2),
 error text,snapshot_id uuid,created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,result jsonb
);
create unique index observation_schedule_one_worker on public.observation_schedule_runs(schedule_id) where status='running';
create index observation_schedule_run_page on public.observation_schedule_runs(user_id,sequence desc);
create table public.observation_schedule_requests(user_id uuid not null references auth.users(id),request_id uuid not null,input jsonb not null,result jsonb not null,primary key(user_id,request_id));
alter table public.observation_schedules enable row level security;
alter table public.observation_schedule_budgets enable row level security;
alter table public.observation_schedule_runs enable row level security;
alter table public.observation_schedule_requests enable row level security;
revoke all on public.observation_schedules,public.observation_schedule_budgets,public.observation_schedule_runs,public.observation_schedule_requests from public,anon,authenticated,service_role;
create function public.observation_schedule_service(p_user_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin if coalesce(auth.role(),'')<>'service_role' then raise exception 'schedule service required' using errcode='42501'; end if;end $$;
create function public.observation_schedule_binding(p_user_id uuid,p_config_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c statistical_source_configs;begin
 select * into c from statistical_source_configs where id=p_config_id and user_id=p_user_id for update;
 if not found or c.approval_state<>'approved' or c.deleted_at is not null or c.approved_at is null or c.table_id<>'0004006264' then raise exception 'approved source unavailable' using errcode='42501';end if;
 return jsonb_build_object('tableId',c.table_id,'filters',c.filters,'metadataHash',c.metadata_hash,'approvedAt',c.approved_at);
end $$;
create function public.observation_schedule_dto(s public.observation_schedules) returns jsonb language sql immutable as $$select to_jsonb(s)||jsonb_build_object('revision',s.revision::text)$$;
create function public.save_observation_schedule(p_user_id uuid,p_schedule_id uuid,p_expected_revision bigint,p_config jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules; prior observation_schedule_requests; r observation_schedule_runs; binding jsonb; input jsonb; v_result jsonb; v_config_id uuid;
begin
 perform observation_schedule_service();if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'schedule owner required' using errcode='42501';end if;
 if p_request_id is null or p_config is null or jsonb_typeof(p_config)<>'object' or not(p_config ?& array['configId','enabled','intervalMinutes','dailyBudget','maxAttempts']) or (p_config-array['configId','enabled','intervalMinutes','dailyBudget','maxAttempts'])<>'{}'::jsonb or jsonb_typeof(p_config->'enabled')<>'boolean' or coalesce(p_config->>'intervalMinutes','')!~'^[0-9]{1,5}$' or (p_config->>'intervalMinutes')::integer not between 60 and 43200 or coalesce(p_config->>'dailyBudget','')!~'^[0-9]{1,5}$' or (p_config->>'dailyBudget')::integer not between 1 and 10000 or coalesce(p_config->>'maxAttempts','')!~'^[1-5]$' then raise exception 'invalid schedule config';end if;
 v_config_id:=(p_config->>'configId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,118));
 input:=jsonb_build_object('scheduleId',p_schedule_id,'expectedRevision',p_expected_revision,'config',p_config);
 select * into prior from observation_schedule_requests where user_id=p_user_id and request_id=p_request_id;
 if found then if prior.input<>input then raise exception 'request payload conflict';end if;return prior.result;end if;
 if p_schedule_id is null then
  if p_expected_revision is not null then raise exception 'unexpected schedule revision';end if;
  binding:=observation_schedule_binding(p_user_id,v_config_id);
  insert into observation_schedules(user_id,config_id,source_binding,enabled,interval_minutes,daily_budget,max_attempts,health) values(p_user_id,v_config_id,binding,(p_config->>'enabled')::boolean,(p_config->>'intervalMinutes')::integer,(p_config->>'dailyBudget')::integer,(p_config->>'maxAttempts')::integer,case when (p_config->>'enabled')::boolean then 'ready' else 'paused' end) returning * into s;
 else
  select * into s from observation_schedules where id=p_schedule_id and user_id=p_user_id for update;
  if not found then raise exception 'schedule owner required' using errcode='42501';end if;
  if p_expected_revision is distinct from s.revision then raise exception 'schedule revision changed';end if;
  -- Pausing always remains possible even when the source has been invalidated/deleted.
  if not (p_config->>'enabled')::boolean and v_config_id=s.config_id then binding:=s.source_binding;else binding:=observation_schedule_binding(p_user_id,v_config_id);end if;
  for r in select * from observation_schedule_runs where schedule_id=s.id and status='running' for update loop
   if r.lease_until<=clock_timestamp() then
    update observation_schedule_runs set status='expired',error='lease_expired_conservative_charge',finished_at=clock_timestamp() where id=r.id;
   else
    update observation_schedule_budgets set charged=charged-(r.reserved-r.requests_attempted) where schedule_id=s.id and budget_day=r.budget_day;
    update observation_schedule_runs set status='cancelled',error='schedule_changed',finished_at=clock_timestamp() where id=r.id;
   end if;
  end loop;
  update observation_schedules set config_id=v_config_id,source_binding=binding,revision=revision+1,enabled=(p_config->>'enabled')::boolean,interval_minutes=(p_config->>'intervalMinutes')::integer,daily_budget=(p_config->>'dailyBudget')::integer,max_attempts=(p_config->>'maxAttempts')::integer,failures=0,health=case when (p_config->>'enabled')::boolean then 'ready' else 'paused' end,last_error=null,next_run_at=clock_timestamp(),updated_at=clock_timestamp() where id=s.id returning * into s;
 end if;
 v_result:=observation_schedule_dto(s);insert into observation_schedule_requests values(p_user_id,p_request_id,input,v_result);return v_result;
end $$;
create function public.claim_observation_schedule(p_user_id uuid default null,p_schedule_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules;r observation_schedule_runs;b observation_schedule_budgets;binding jsonb;today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
 perform observation_schedule_service();
 if (p_user_id is null)<>(p_schedule_id is null) then raise exception 'schedule owner required' using errcode='42501';end if;
 if p_schedule_id is not null and not exists(select 1 from observation_schedules where id=p_schedule_id and user_id=p_user_id) then raise exception 'schedule owner required' using errcode='42501';end if;
 select * into s from observation_schedules where (p_schedule_id is null or (id=p_schedule_id and user_id=p_user_id)) and enabled and health<>'failed' and (next_run_at<=clock_timestamp() or exists(select 1 from observation_schedule_runs active_run where active_run.schedule_id=observation_schedules.id and active_run.status='running' and active_run.lease_until<=clock_timestamp())) order by next_run_at,id for update skip locked limit 1;
 if not found then return null;end if;
 select * into r from observation_schedule_runs where schedule_id=s.id and status='running' for update;
 if found then
  if r.lease_until>clock_timestamp() then return null;end if;
  -- Expiry keeps the entire reservation charged: a crashed worker may have sent requests.
  update observation_schedule_runs set status='expired',error='lease_expired_conservative_charge',finished_at=clock_timestamp() where id=r.id;
  update observation_schedules set failures=failures+1,health=case when failures+1>=max_attempts then 'failed' else 'ready' end,last_error='lease_expired_conservative_charge',next_run_at=clock_timestamp()+make_interval(mins=>least(60,power(2,failures)::integer)) where id=s.id;
  return null;
 end if;
 begin binding:=observation_schedule_binding(s.user_id,s.config_id);exception when sqlstate '42501' then update observation_schedules set health='blocked',last_error='source_unavailable',next_run_at=clock_timestamp()+interval '1 hour' where id=s.id;return null;end;
 if binding<>s.source_binding then update observation_schedules set health='blocked',last_error='source_changed_reconfirm',next_run_at=clock_timestamp()+interval '1 hour' where id=s.id;return null;end if;
 insert into observation_schedule_budgets values(s.id,today,0) on conflict do nothing;select * into b from observation_schedule_budgets where schedule_id=s.id and budget_day=today for update;
 if b.charged+2>s.daily_budget then update observation_schedules set health='blocked',last_error='daily_request_budget_exhausted',next_run_at=((today+1)::timestamp at time zone 'Asia/Tokyo') where id=s.id;return null;end if;
 update observation_schedule_budgets set charged=charged+2 where schedule_id=s.id and budget_day=today;
 insert into observation_schedule_runs(schedule_id,user_id,config_id,schedule_revision,source_binding,settings,status,lease_until,budget_day) values(s.id,s.user_id,s.config_id,s.revision,s.source_binding,jsonb_build_object('intervalMinutes',s.interval_minutes,'dailyBudget',s.daily_budget,'maxAttempts',s.max_attempts),'running',clock_timestamp()+interval '2 minutes',today) returning * into r;
 update observation_schedules set health='running',last_error=null,next_run_at=clock_timestamp()+make_interval(mins=>s.interval_minutes) where id=s.id;
 return to_jsonb(r)||jsonb_build_object('sequence',r.sequence::text,'schedule_revision',r.schedule_revision::text);
end $$;
create function public.begin_observation_request(p_run_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules;r observation_schedule_runs;binding jsonb;
begin
 perform observation_schedule_service();
 select * into r from observation_schedule_runs where id=p_run_id;if not found then raise exception 'worker lease unavailable' using errcode='42501';end if;
 select * into s from observation_schedules where id=r.schedule_id for update;select * into r from observation_schedule_runs where id=p_run_id for update;
 if r.token is distinct from p_token or r.status<>'running' or r.lease_until<=clock_timestamp() or not s.enabled or s.revision<>r.schedule_revision or r.budget_day<>(clock_timestamp() at time zone 'Asia/Tokyo')::date then raise exception 'worker lease expired or disabled' using errcode='42501';end if;
 binding:=observation_schedule_binding(s.user_id,s.config_id);if binding<>r.source_binding then raise exception 'source changed' using errcode='42501';end if;
 if r.requests_attempted>=r.reserved then raise exception 'request allowance exhausted';end if;
 update observation_schedule_runs set requests_attempted=requests_attempted+1 where id=r.id;
 return jsonb_build_object('authorized',true,'requestNumber',r.requests_attempted+1);
end $$;
create function public.finish_observation_run(p_run_id uuid,p_token uuid,p_success boolean,p_payload jsonb,p_error text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s observation_schedules;r observation_schedule_runs;binding jsonb;saved jsonb;v_result jsonb;
begin
 perform observation_schedule_service();select * into r from observation_schedule_runs where id=p_run_id;
 if not found then raise exception 'worker lease unavailable' using errcode='42501';end if;
 select * into s from observation_schedules where id=r.schedule_id for update;select * into r from observation_schedule_runs where id=p_run_id for update;
 if r.token is distinct from p_token then raise exception 'worker lease unavailable' using errcode='42501';end if;
 if r.status in ('completed','failed') then return r.result;end if;
 if r.status<>'running' or r.lease_until<=clock_timestamp() or not s.enabled or s.revision<>r.schedule_revision then raise exception 'worker lease expired or disabled' using errcode='42501';end if;
 if p_success is null then raise exception 'completion result required';end if;
 if p_success then
  binding:=observation_schedule_binding(s.user_id,s.config_id);if binding<>r.source_binding then raise exception 'source changed' using errcode='42501';end if;
  if r.requests_attempted<>2 or p_payload is null or p_payload->>'sourceType' is distinct from 'live' then raise exception 'provider request sequence incomplete';end if;
  -- This call remains in the transaction that holds schedule and approved source locks.
  saved:=persist_statistical_snapshot_internal(s.user_id,s.config_id,p_payload,r.id);
 end if;
 update observation_schedule_budgets set charged=charged-(r.reserved-r.requests_attempted) where schedule_id=s.id and budget_day=r.budget_day;
 v_result:=jsonb_build_object('runId',r.id,'status',case when p_success then 'completed' else 'failed' end,'snapshotId',saved->>'id','requestsAttempted',r.requests_attempted);
 update observation_schedule_runs set status=case when p_success then 'completed' else 'failed' end,snapshot_id=(saved->>'id')::uuid,error=case when p_success then null else left(coalesce(p_error,'provider_failed'),500) end,finished_at=clock_timestamp(),result=v_result where id=r.id;
 update observation_schedules set failures=case when p_success then 0 else failures+1 end,health=case when not p_success and failures+1>=max_attempts then 'failed' else 'ready' end,last_error=case when p_success then null else left(coalesce(p_error,'provider_failed'),500) end,next_run_at=clock_timestamp()+make_interval(mins=>case when p_success then interval_minutes else least(60,power(2,failures)::integer) end),updated_at=clock_timestamp() where id=s.id;
 return v_result;
end $$;
create function public.page_observation_scheduling(p_user_id uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare runs jsonb;cursor text;schedules jsonb;sources jsonb;budgets jsonb;
begin
 perform observation_schedule_service();if p_user_id is null then raise exception 'schedule owner required' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'invalid scheduling page';end if;
 select coalesce(jsonb_agg(observation_schedule_dto(s) order by created_at,id),'[]'::jsonb) into schedules from observation_schedules s where user_id=p_user_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'table_id',table_id,'approved_at',approved_at,'filters',filters) order by approved_at desc,id),'[]'::jsonb) into sources from statistical_source_configs where user_id=p_user_id and approval_state='approved' and deleted_at is null and table_id='0004006264';
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('sequence',r.sequence::text,'schedule_revision',r.schedule_revision::text) order by sequence desc),'[]'::jsonb),min(sequence)::text into runs,cursor from (select * from observation_schedule_runs where user_id=p_user_id and (p_before is null or sequence<p_before) order by sequence desc limit 50) r;
 select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) into budgets from observation_schedule_budgets b where schedule_id in(select id from observation_schedules where user_id=p_user_id) and budget_day=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
 return jsonb_build_object('available',true,'schedules',schedules,'sources',sources,'runs',runs,'budgets',budgets,'nextCursor',case when jsonb_array_length(runs)=50 then cursor else null end);
end $$;
revoke all on function public.observation_schedule_service(uuid),public.observation_schedule_binding(uuid,uuid),public.observation_schedule_dto(public.observation_schedules),public.save_observation_schedule(uuid,uuid,bigint,jsonb,uuid),public.claim_observation_schedule(uuid,uuid),public.begin_observation_request(uuid,uuid),public.finish_observation_run(uuid,uuid,boolean,jsonb,text),public.page_observation_scheduling(uuid,bigint) from public,anon,authenticated;
grant execute on function public.save_observation_schedule(uuid,uuid,bigint,jsonb,uuid),public.claim_observation_schedule(uuid,uuid),public.begin_observation_request(uuid,uuid),public.finish_observation_run(uuid,uuid,boolean,jsonb,text),public.page_observation_scheduling(uuid,bigint) to service_role;
commit;


