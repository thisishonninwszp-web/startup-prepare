-- P1A independent of event dossiers: tests never write real-contact validations.
begin;
create unique index if not exists ideas_owner_id_experiment_uq on public.ideas(user_id,id);
create unique index if not exists gaps_owner_idea_id_experiment_uq on public.idea_info_gaps(user_id,idea_id,id);
create table public.idea_experiments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), idea_id uuid not null, gap_id uuid,
 series_id uuid not null, revision integer not null check(revision>0), objective text not null check(objective in ('premise','workflow','delivery','demand')),
 route text not null check(route in ('public_check','task_reconstruction','prototype_test','opt_in_trial','direct_contact','deferred_contact')),
 access_context jsonb not null, question text not null check(length(question) between 1 and 2000), hypothesis_snapshot jsonb, gap_snapshot jsonb,
 input_plan jsonb not null, steps jsonb not null, pass_criterion text not null check(length(pass_criterion) between 1 and 3000), fail_criterion text not null check(length(fail_criterion) between 1 and 3000), limits text not null check(length(limits) between 1 and 3000),
 time_budget_minutes numeric check(time_budget_minutes>=0), cost_budget_minor bigint check(cost_budget_minor>=0), currency text,
 deferred_questions jsonb not null, recheck_on date, client_request_id uuid not null, request_payload jsonb not null, created_at timestamptz not null default now(),
 unique(user_id,series_id,revision), unique(user_id,client_request_id), unique(user_id,idea_id,id),
 foreign key(user_id,idea_id) references public.ideas(user_id,id) on delete restrict,
 foreign key(user_id,idea_id,gap_id) references public.idea_info_gaps(user_id,idea_id,id) on delete restrict,
 check((cost_budget_minor is null and currency is null) or (cost_budget_minor is not null and currency is not null and currency ~ '^[A-Z]{3}$')),
 check(jsonb_typeof(access_context)='object' and jsonb_typeof(input_plan)='object' and jsonb_typeof(steps)='array' and jsonb_array_length(steps)>0 and jsonb_typeof(deferred_questions)='array')
);
create table public.idea_experiment_cases (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,idea_id uuid not null,experiment_id uuid not null,input_origin text not null check(input_origin in ('public','owned','synthetic')),
 input_text text not null check(length(input_text) between 1 and 30000),source_snapshot jsonb,expected_output text not null check(length(expected_output) between 1 and 10000),client_request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default now(),
 unique(user_id,client_request_id),unique(user_id,idea_id,experiment_id,id),
 foreign key(user_id,idea_id,experiment_id) references public.idea_experiments(user_id,idea_id,id) on delete restrict,
 check((input_origin='synthetic' and source_snapshot is null) or (input_origin<>'synthetic' and jsonb_typeof(source_snapshot)='object'))
);
create table public.idea_experiment_runs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,idea_id uuid not null,experiment_id uuid not null,case_manifest jsonb not null,criteria_snapshot jsonb not null,supersedes_run_id uuid,
 started_at timestamptz not null default now(),finished_at timestamptz,status text not null default 'running' check(status in ('running','completed','failed','cancelled')),
 actual_minutes numeric check(actual_minutes>=0),actual_cost_minor bigint check(actual_cost_minor>=0),currency text,output_artifact jsonb,
 client_request_id uuid not null,request_payload jsonb not null,completion_request_id uuid,completion_payload jsonb,
 unique(user_id,client_request_id),unique(user_id,completion_request_id),unique(user_id,idea_id,id),
 foreign key(user_id,idea_id,experiment_id) references public.idea_experiments(user_id,idea_id,id) on delete restrict,
 foreign key(user_id,idea_id,supersedes_run_id) references public.idea_experiment_runs(user_id,idea_id,id) on delete restrict,
 check(jsonb_typeof(case_manifest)='array'),check((status='running' and finished_at is null) or (status<>'running' and finished_at is not null)),
 check((actual_cost_minor is null and currency is null) or (actual_cost_minor is not null and currency is not null and currency ~ '^[A-Z]{3}$'))
);
create table public.idea_experiment_results (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,idea_id uuid not null,run_id uuid not null,case_id uuid not null,experiment_id uuid not null,
 execution_context text not null check(execution_context in ('self_run','ai_simulation','external_feedback')),outcome text not null check(outcome in ('pass','fail','unresolved')),
 actual_output jsonb not null,manual_intervention text not null,notes text not null,client_request_id uuid not null,created_at timestamptz not null default now(),
 unique(user_id,run_id,case_id),foreign key(user_id,idea_id,run_id) references public.idea_experiment_runs(user_id,idea_id,id) on delete restrict,
 foreign key(user_id,idea_id,experiment_id,case_id) references public.idea_experiment_cases(user_id,idea_id,experiment_id,id) on delete restrict
);
create function public.experiment_owner(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_user_id is null or (coalesce(auth.role(),'')<>'service_role' and auth.uid() is distinct from p_user_id) then raise exception 'experiment owner required' using errcode='42501';end if;
end$$;
create function public.experiment_immutable() returns trigger language plpgsql as $$begin raise exception 'experiment history immutable';end$$;
create trigger experiment_version_immutable before update or delete on public.idea_experiments for each row execute function public.experiment_immutable();
create trigger experiment_case_immutable before update or delete on public.idea_experiment_cases for each row execute function public.experiment_immutable();
create trigger experiment_result_immutable before update or delete on public.idea_experiment_results for each row execute function public.experiment_immutable();
create function public.experiment_run_guard() returns trigger language plpgsql as $$begin
 if TG_OP='DELETE' then raise exception 'experiment history immutable';end if;
 if old.status<>'running' or new.status='running' or (to_jsonb(new)-array['status','finished_at','actual_minutes','actual_cost_minor','currency','output_artifact','completion_request_id','completion_payload']) is distinct from (to_jsonb(old)-array['status','finished_at','actual_minutes','actual_cost_minor','currency','output_artifact','completion_request_id','completion_payload']) then raise exception 'invalid experiment transition';end if;return new;
end$$;
create trigger experiment_run_immutable before update or delete on public.idea_experiment_runs for each row execute function public.experiment_run_guard();
create function public.experiment_text(p_value text,p_max integer,p_required boolean default true) returns void language plpgsql as $$begin if (p_required and coalesce(length(btrim(p_value)),0)=0) or length(p_value)>p_max then raise exception 'invalid experiment text';end if;end$$;
create function public.experiment_artifact(p_user_id uuid,p_artifact jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare found_id uuid;begin
 if p_artifact is null or p_artifact='null'::jsonb then return;end if;
 if jsonb_typeof(p_artifact)<>'object' then raise exception 'invalid artifact';end if;
 perform experiment_text(p_artifact->>'url',4000,false);
 if p_artifact->>'url' is not null and p_artifact->>'url' !~ '^https?://' then raise exception 'invalid artifact URL';end if;
 if p_artifact->>'material_id' is not null then
 execute 'select id from public.reality_materials where id=$1 and user_id=$2' into found_id using (p_artifact->>'material_id')::uuid,p_user_id;
 if found_id is null then raise exception 'material unavailable';end if;end if;
 perform experiment_text(p_artifact->>'description',3000);
end$$;
create function public.save_idea_experiment_version(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare old_row idea_experiments; idea_row ideas; gap_row idea_info_gaps; new_id uuid; series uuid; rev integer; a jsonb; route text; s jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 select * into old_row from idea_experiments where user_id=p_user_id and client_request_id=(p_input->>'requestId')::uuid;
 if found then if old_row.request_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old_row.id);end if;
 select * into idea_row from ideas where id=(p_input->>'ideaId')::uuid and user_id=p_user_id for update;if not found then raise exception 'idea unavailable';end if;
 if nullif(p_input->>'gapId','') is not null then select * into gap_row from idea_info_gaps where id=(p_input->>'gapId')::uuid and user_id=p_user_id and idea_id=idea_row.id for update;if not found then raise exception 'gap unavailable';end if;end if;
 series=coalesce((p_input->>'seriesId')::uuid,gen_random_uuid());
 if p_input->>'seriesId' is not null and not exists(select 1 from idea_experiments where user_id=p_user_id and idea_id=idea_row.id and series_id=series) then raise exception 'series unavailable';end if;
 select coalesce(max(revision),0)+1 into rev from idea_experiments where user_id=p_user_id and series_id=series;
 a=p_input->'accessContext';route=p_input->>'route';
 if a is null or jsonb_typeof(a)<>'object' or jsonb_typeof(a->'publicSources') is distinct from 'boolean' or jsonb_typeof(a->'canRunPrototype') is distinct from 'boolean' or jsonb_typeof(a->'canPublishExample') is distinct from 'boolean' or jsonb_typeof(a->'canContactPeople') is distinct from 'boolean' then raise exception 'invalid access context';end if;
 if not (case route when 'public_check' then (a->>'publicSources')::boolean when 'task_reconstruction' then (a->>'publicSources')::boolean when 'prototype_test' then (a->>'canRunPrototype')::boolean when 'opt_in_trial' then (a->>'canPublishExample')::boolean when 'direct_contact' then (a->>'canContactPeople')::boolean when 'deferred_contact' then not (a->>'canContactPeople')::boolean else false end) then raise exception 'route unavailable';end if;
 perform experiment_text(p_input->>'question',2000);perform experiment_text(p_input->>'passCriterion',3000);perform experiment_text(p_input->>'failCriterion',3000);perform experiment_text(p_input->>'limits',3000);perform experiment_text(p_input->'inputPlan'->>'scope',5000);
 if jsonb_typeof(p_input->'steps') is distinct from 'array' or jsonb_array_length(p_input->'steps') not between 1 and 30 or jsonb_typeof(p_input->'deferredQuestions') is distinct from 'array' or jsonb_array_length(p_input->'deferredQuestions')>30 then raise exception 'invalid steps/questions';end if;
 for s in select value from jsonb_array_elements(p_input->'steps') loop if jsonb_typeof(s)<>'string' then raise exception 'invalid step';end if;perform experiment_text(s#>>'{}',2000);end loop;
 if route='task_reconstruction' then if jsonb_typeof(p_input->'inputPlan'->'refs') is distinct from 'array' then raise exception 'task references required';end if;foreach route in array array['role','trigger','inputs','steps','current_alternative','obstacles','unknowns'] loop perform experiment_text(p_input->'inputPlan'->>route,5000);end loop;end if;
 insert into idea_experiments(user_id,idea_id,gap_id,series_id,revision,objective,route,access_context,question,hypothesis_snapshot,gap_snapshot,input_plan,steps,pass_criterion,fail_criterion,limits,time_budget_minutes,cost_budget_minor,currency,deferred_questions,recheck_on,client_request_id,request_payload)
 values(p_user_id,idea_row.id,gap_row.id,series,rev,p_input->>'objective',p_input->>'route',a,p_input->>'question',to_jsonb(idea_row)->'hypothesis',case when gap_row.id is not null then to_jsonb(gap_row) else null end,p_input->'inputPlan',p_input->'steps',p_input->>'passCriterion',p_input->>'failCriterion',p_input->>'limits',(p_input->>'timeBudgetMinutes')::numeric,(p_input->>'costBudgetMinor')::bigint,p_input->>'currency',p_input->'deferredQuestions',(p_input->>'recheckOn')::date,(p_input->>'requestId')::uuid,p_input) returning id into new_id;
 return jsonb_build_object('id',new_id);end$$;
create function public.append_idea_experiment_case(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare e idea_experiments;c idea_experiment_cases;s jsonb;new_id uuid; saved_source text; material_url text; material_kind text; source_record jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 if jsonb_typeof(p_input->'sourceSnapshot')='object' then p_input=jsonb_set(p_input,'{sourceSnapshot}',(p_input->'sourceSnapshot')-'hash'-'captured_at');end if;
 select * into c from idea_experiment_cases where user_id=p_user_id and client_request_id=(p_input->>'requestId')::uuid;if found then if c.request_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',c.id);end if;
 select * into e from idea_experiments where id=(p_input->>'experimentId')::uuid and user_id=p_user_id for update;if not found then raise exception 'experiment unavailable';end if;
 if (select count(*) from idea_experiment_cases where user_id=p_user_id and experiment_id=e.id)>=200 then raise exception 'sample limit reached; create a new version';end if;
 if e.route in ('public_check','task_reconstruction') and p_input->>'inputOrigin'='synthetic' then raise exception 'material-backed route requires public or authorized owned source';end if;
 perform experiment_text(p_input->>'inputText',30000);perform experiment_text(p_input->>'expectedOutput',10000);s=nullif(p_input->'sourceSnapshot','null'::jsonb);if s is not null then s=s||jsonb_build_object('captured_at',now());end if;
 if p_input->>'inputOrigin'='synthetic' then if s is not null then raise exception 'synthetic source forbidden';end if;
 else if s is null or jsonb_typeof(s)<>'object' then raise exception 'source snapshot required';end if;
 perform experiment_text(s->>'source_type',200);perform experiment_text(s->>'excerpt',30000,false);perform experiment_text(s->>'capture_scope',2000);if (s->>'captured_at')::timestamptz is null or jsonb_typeof(s->'truncated') is distinct from 'boolean' or jsonb_typeof(s->'missing_text') is distinct from 'boolean' then raise exception 'invalid snapshot metadata';end if;
 if p_input->>'inputOrigin'='public' and p_input->>'inputText' is distinct from s->>'excerpt' then raise exception 'public input must equal captured excerpt';end if;
 if p_input->>'inputOrigin'='public' then perform experiment_text(s->>'publisher',1000);perform experiment_text(s->>'excerpt',30000);if coalesce(s->>'url',s->>'source_id') is null or (s->>'missing_text')::boolean then raise exception 'public source/excerpt required';end if;end if;
 if p_input->>'inputOrigin'='owned' and coalesce((s->>'authorized')::boolean,false)=false then raise exception 'owned source permission required';end if;
 if s->>'url' is not null and s->>'url' !~ '^https?://' then raise exception 'invalid source URL';end if;
 if s->>'source_type'='material' then
 select sanitized_text,source_url,source_type into saved_source,material_url,material_kind from public.reality_materials where id=(s->>'source_id')::uuid and user_id=p_user_id;
 if not found then raise exception 'material unavailable';end if;
 if p_input->>'inputOrigin'='public' and (material_kind<>'url' or material_url is distinct from s->>'url') then raise exception 'public material source mismatch';end if;
 if length(coalesce(s->>'excerpt',''))>0 and position(s->>'excerpt' in coalesce(saved_source,''))=0 then raise exception 'material quote absent';end if;
 end if;
 if s->>'source_type'='observation_run' then
 execute 'select item from public.decision_observation_runs r cross join lateral jsonb_array_elements(r.payload->''records'') item where r.id=$1 and r.user_id=$2 and item->>''origin''=$3 and item->>''sourceUrl'' is not distinct from $4 and position($5 in item->>''text'')>0 limit 1'
 into source_record using (s->>'source_id')::uuid,p_user_id,case when p_input->>'inputOrigin'='public' then 'public' else 'manual' end,s->>'url',s->>'excerpt';
 if source_record is null then raise exception 'observation source origin/url/quote mismatch';end if;
 s=s||jsonb_build_object('publisher',coalesce(substring(source_record->>'sourceUrl' from '^https?://([^/]+)'),'用户授权的原始记录'));
 end if; s=s||jsonb_build_object('captured_at',now());
 s=s||jsonb_build_object('hash',encode(sha256(convert_to((s-'hash')::text,'UTF8')),'hex'));
 end if;
 insert into idea_experiment_cases(user_id,idea_id,experiment_id,input_origin,input_text,source_snapshot,expected_output,client_request_id,request_payload) values(p_user_id,e.idea_id,e.id,p_input->>'inputOrigin',p_input->>'inputText',s,p_input->>'expectedOutput',(p_input->>'requestId')::uuid,p_input) returning id into new_id;return jsonb_build_object('id',new_id);end$$;
create function public.start_idea_experiment_run(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare e idea_experiments;r idea_experiment_runs;manifest jsonb;new_id uuid;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 select * into r from idea_experiment_runs where user_id=p_user_id and client_request_id=(p_input->>'requestId')::uuid;if found then if r.request_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',r.id);end if;
 select * into e from idea_experiments where id=(p_input->>'experimentId')::uuid and user_id=p_user_id for update;if not found then raise exception 'experiment unavailable';end if;
 if p_input->>'supersedesRunId' is not null and not exists(select 1 from idea_experiment_runs where id=(p_input->>'supersedesRunId')::uuid and user_id=p_user_id and idea_id=e.idea_id and status<>'running') then raise exception 'prior final run unavailable';end if;
 select coalesce(jsonb_agg(id order by created_at,id),'[]'::jsonb) into manifest from idea_experiment_cases where user_id=p_user_id and experiment_id=e.id;
 if jsonb_array_length(manifest)=0 and e.route<>'deferred_contact' then raise exception 'samples required';end if;
 if jsonb_array_length(manifest)>200 then raise exception 'too many samples';end if;
 insert into idea_experiment_runs(user_id,idea_id,experiment_id,case_manifest,criteria_snapshot,supersedes_run_id,client_request_id,request_payload) values(p_user_id,e.idea_id,e.id,manifest,jsonb_build_object('pass',e.pass_criterion,'fail',e.fail_criterion,'limits',e.limits),(p_input->>'supersedesRunId')::uuid,(p_input->>'requestId')::uuid,p_input) returning id into new_id;return jsonb_build_object('id',new_id);end$$;
create function public.complete_idea_experiment_run(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r idea_experiment_runs;old_run idea_experiment_runs;item jsonb;got jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));
 select * into old_run from idea_experiment_runs where user_id=p_user_id and completion_request_id=(p_input->>'requestId')::uuid;if found then if old_run.completion_payload<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',old_run.id);end if;
 select * into r from idea_experiment_runs where id=(p_input->>'runId')::uuid and user_id=p_user_id for update;if not found then raise exception 'run unavailable';end if;if r.status<>'running' then raise exception 'run already final';end if;
 if jsonb_typeof(p_input->'results') is distinct from 'array' then raise exception 'results required';end if;
 select coalesce(jsonb_agg(v order by v),'[]'::jsonb) into got from (select value->>'caseId' v from jsonb_array_elements(p_input->'results')) q;
 if got<>(select coalesce(jsonb_agg(value#>>'{}' order by value#>>'{}'),'[]'::jsonb) from jsonb_array_elements(r.case_manifest)) then raise exception 'case manifest mismatch';end if;
 perform experiment_artifact(p_user_id,nullif(p_input->'outputArtifact','null'::jsonb));
 for item in select value from jsonb_array_elements(p_input->'results') loop
 perform experiment_text(item->'actualOutput'->>'text',30000);perform experiment_text(item->>'manualIntervention',10000,false);perform experiment_text(item->>'notes',10000,false);perform experiment_artifact(p_user_id,nullif(item->'actualOutput'->'artifact','null'::jsonb));
 if item->>'executionContext'='external_feedback' then perform experiment_text(item->>'notes',10000);end if;
 insert into idea_experiment_results(user_id,idea_id,run_id,case_id,experiment_id,execution_context,outcome,actual_output,manual_intervention,notes,client_request_id) values(p_user_id,r.idea_id,r.id,(item->>'caseId')::uuid,r.experiment_id,item->>'executionContext',item->>'outcome',item->'actualOutput',item->>'manualIntervention',item->>'notes',(p_input->>'requestId')::uuid);
 end loop;
 update idea_experiment_runs set status=p_input->>'status',finished_at=now(),actual_minutes=(p_input->>'actualMinutes')::numeric,actual_cost_minor=(p_input->>'actualCostMinor')::bigint,currency=p_input->>'currency',output_artifact=nullif(p_input->'outputArtifact','null'::jsonb),completion_request_id=(p_input->>'requestId')::uuid,completion_payload=p_input where id=r.id;
 return jsonb_build_object('id',r.id);end$$;
create function public.attach_experiment_gap_ref(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare g idea_info_gaps;r idea_experiment_runs;existing jsonb;new_item jsonb;begin
 perform experiment_owner(p_user_id);if p_input is null or jsonb_typeof(p_input)<>'object' or nullif(p_input->>'requestId','') is null then raise exception 'invalid experiment payload';end if;perform (p_input->>'requestId')::uuid;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));select * into g from idea_info_gaps where id=(p_input->>'gapId')::uuid and user_id=p_user_id for update;if not found then raise exception 'gap unavailable';end if;
 select item.value into existing from idea_info_gaps gg cross join lateral jsonb_array_elements(gg.evidence) item where gg.user_id=p_user_id and item.value->>'request_id'=p_input->>'requestId';if found then if existing->'request_payload'<>p_input then raise exception 'request payload conflict';end if;return jsonb_build_object('id',g.id);end if;
 select * into r from idea_experiment_runs where id=(p_input->>'runId')::uuid and user_id=p_user_id and idea_id=g.idea_id;if not found or r.status='running' then raise exception 'finished run unavailable';end if;perform experiment_text(p_input->>'note',3000,false);
 new_item=jsonb_build_object('at',now(),'title','原型/公开资料核对（需求仍未知）','note',p_input->>'note','experiment_id',r.experiment_id,'experiment_run_id',r.id,'request_id',p_input->>'requestId','request_payload',p_input);
 update idea_info_gaps set evidence=evidence||jsonb_build_array(new_item),updated_at=now() where id=g.id;return jsonb_build_object('id',g.id);end$$;
-- Existing evidence callers retain their lock semantics; only append becomes atomic.
create function public.append_idea_gap_evidence(p_user_id uuid,p_gap_id uuid,p_item jsonb,p_request_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare g idea_info_gaps;old_item jsonb;begin
 perform experiment_owner(p_user_id);if p_request_id is null or p_item is null or jsonb_typeof(p_item)<>'object' then raise exception 'invalid evidence request';end if;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,109));select * into g from idea_info_gaps where id=p_gap_id and user_id=p_user_id for update;if not found then raise exception 'gap unavailable';end if;
 select item.value into old_item from idea_info_gaps gg cross join lateral jsonb_array_elements(gg.evidence) item where gg.user_id=p_user_id and item.value->>'request_id'=p_request_id::text;if found then if old_item->'request_payload'<>jsonb_build_object('gap_id',p_gap_id,'item',p_item) then raise exception 'request payload conflict';end if;return;end if;
 if p_item ? 'experiment_id' or p_item ? 'experiment_run_id' or p_item ? 'observation_run_id' then raise exception 'use experiment attach RPC';end if;
 perform experiment_text(p_item->>'title',3000);
 update idea_info_gaps set evidence=evidence||jsonb_build_array(p_item||jsonb_build_object('at',now(),'request_id',p_request_id,'request_payload',jsonb_build_object('gap_id',p_gap_id,'item',p_item))),updated_at=now() where id=g.id;
end$$;
do $$declare t text;f text;begin
 foreach t in array array['idea_experiments','idea_experiment_cases','idea_experiment_runs','idea_experiment_results'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy experiment_owner_read on public.%I for select using (auth.uid()=user_id)',t);
 execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('experiment_owner','experiment_artifact','save_idea_experiment_version','append_idea_experiment_case','start_idea_experiment_run','complete_idea_experiment_run','attach_experiment_gap_ref','append_idea_gap_evidence') loop execute 'revoke all on function '||f||' from public,anon,authenticated';execute 'grant execute on function '||f||' to service_role';end loop;
end$$;
commit;











