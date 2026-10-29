-- Confirmed feedback may propose a new manual task version. No validation/activity writes.
begin;
create table public.feedback_task_proposals (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 revision bigint generated always as identity unique,
 feedback_id uuid not null references public.decision_feedback(id),task_id uuid not null,
 base_version_id uuid not null,source_link_id uuid references public.decision_feedback_links(id),
 before_config jsonb not null,next_config jsonb not null,reason text not null,
 request_id uuid not null,request_payload jsonb not null,created_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id),unique(id,user_id),
 foreign key(base_version_id,task_id,user_id) references public.decision_observation_versions(id,task_id,user_id)
);
create table public.feedback_task_applications (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,
 proposal_id uuid not null unique,task_id uuid not null,new_task_version_id uuid not null,
 request_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id),foreign key(proposal_id,user_id) references public.feedback_task_proposals(id,user_id),
 foreign key(new_task_version_id,task_id,user_id) references public.decision_observation_versions(id,task_id,user_id)
);
create table public.feedback_task_requests (
 user_id uuid not null,request_id uuid not null,proposal_id uuid not null,
 application_id uuid not null references public.feedback_task_applications(id),
 primary key(user_id,request_id),foreign key(proposal_id,user_id) references public.feedback_task_proposals(id,user_id)
);
create function public.feedback_task_guard() returns trigger language plpgsql as $$
begin
 if tg_op<>'INSERT' or current_setting('ideaos.feedback_task_write',true) is distinct from 'allowed' then raise exception 'immutable feedback task history';end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['feedback_task_proposals','feedback_task_applications','feedback_task_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy feedback_task_read on public.%I for select to authenticated using(auth.uid()=user_id)',t);
 execute format('grant select on public.%I to authenticated,service_role',t);
 execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 execute format('create trigger immutable_feedback_task before insert or update or delete on public.%I for each row execute function public.feedback_task_guard()',t);
 end loop;
end $$;
create function public.save_feedback_task_proposal(p_user_id uuid,p_feedback_id uuid,p_task_id uuid,p_base_version_id uuid,p_next_config jsonb,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.feedback_task_proposals;t public.decision_observation_tasks;v public.decision_observation_versions;f public.decision_feedback;l public.decision_feedback_links;req jsonb;rid uuid;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'feedback task owner required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'request required';end if;
 perform public.validate_observation_config(p_next_config);
 if p_reason is null or length(trim(p_reason))=0 or length(p_reason)>4000 then raise exception 'adjustment reason required';end if;
 req=jsonb_build_object('feedbackId',p_feedback_id,'taskId',p_task_id,'baseVersionId',p_base_version_id,'nextConfig',p_next_config,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,113));
 select * into old from public.feedback_task_proposals where user_id=p_user_id and request_id=p_request_id;
 if found then
 if old.request_payload<>req then raise exception 'request payload conflict';end if;
 return jsonb_build_object('id',old.id);end if;
 select * into t from public.decision_observation_tasks where id=p_task_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.ideas where id=t.object_id and user_id=p_user_id) then raise exception 'task unavailable';end if;
 select * into v from public.decision_observation_versions where task_id=t.id and user_id=p_user_id order by revision desc limit 1;
 if v.id is distinct from p_base_version_id then raise exception '观察配置已变化，请重新读取并预览';end if;
 if v.config=p_next_config then raise exception '配置没有变化';end if;
 select * into f from public.decision_feedback where id=p_feedback_id and user_id=p_user_id;
 if not found or not exists(select 1 from public.ideas where id=f.idea_id and user_id=p_user_id) then raise exception 'feedback unavailable';end if;
 if f.idea_id<>t.object_id then
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_feedback_id::text||t.object_id::text,113));
 select * into l from public.decision_feedback_links where user_id=p_user_id and feedback_id=f.id and target_idea_id=t.object_id order by revision desc limit 1;
 if not found or l.action<>'confirm' then raise exception '反馈适用关系已撤回或未确认';end if;
 end if;
 perform set_config('ideaos.feedback_task_write','allowed',true);
 insert into public.feedback_task_proposals(user_id,feedback_id,task_id,base_version_id,source_link_id,before_config,next_config,reason,request_id,request_payload)
 values(p_user_id,f.id,t.id,v.id,l.id,v.config,p_next_config,p_reason,p_request_id,req) returning id into rid;
 perform set_config('ideaos.feedback_task_write','',true);
 return jsonb_build_object('id',rid);
end $$;
create function public.apply_feedback_task_proposal(p_user_id uuid,p_proposal_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.feedback_task_applications;receipt public.feedback_task_requests;p public.feedback_task_proposals;t public.decision_observation_tasks;v_id uuid;f public.decision_feedback;l public.decision_feedback_links;result jsonb;rid uuid;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'feedback task owner required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'request required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,113));
 select * into receipt from public.feedback_task_requests where user_id=p_user_id and request_id=p_request_id;
 if found then
 if receipt.proposal_id is distinct from p_proposal_id then raise exception 'request payload conflict';end if;
 select * into old from public.feedback_task_applications where id=receipt.application_id and user_id=p_user_id;
 return jsonb_build_object('id',old.id,'versionId',old.new_task_version_id);end if;
 select * into p from public.feedback_task_proposals where id=p_proposal_id and user_id=p_user_id for update;
 if not found then raise exception 'proposal unavailable';end if;
 select * into old from public.feedback_task_applications where proposal_id=p.id and user_id=p_user_id;
 if found then
 perform set_config('ideaos.feedback_task_write','allowed',true);
 insert into public.feedback_task_requests(user_id,request_id,proposal_id,application_id) values(p_user_id,p_request_id,p.id,old.id);
 perform set_config('ideaos.feedback_task_write','',true);
 return jsonb_build_object('id',old.id,'versionId',old.new_task_version_id);end if;
 select * into t from public.decision_observation_tasks where id=p.task_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from public.ideas where id=t.object_id and user_id=p_user_id) then raise exception 'task unavailable';end if;
 select id into v_id from public.decision_observation_versions where task_id=t.id and user_id=p_user_id order by revision desc limit 1;
 if v_id is distinct from p.base_version_id then raise exception '观察配置已变化，请重新读取并预览';end if;
 select * into f from public.decision_feedback where id=p.feedback_id and user_id=p_user_id;
 if not found or not exists(select 1 from public.ideas where id=f.idea_id and user_id=p_user_id) then raise exception 'feedback unavailable';end if;
 if f.idea_id<>t.object_id then
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||f.id::text||t.object_id::text,113));
 select * into l from public.decision_feedback_links where user_id=p_user_id and feedback_id=f.id and target_idea_id=t.object_id order by revision desc limit 1;
 if not found or l.action<>'confirm' or l.id is distinct from p.source_link_id then raise exception '反馈适用关系已变化，请重新确认';end if;
 end if;
 result=public.save_decision_observation_version(p_user_id,t.id,null,null,p.next_config,p_request_id);
 perform set_config('ideaos.feedback_task_write','allowed',true);
 insert into public.feedback_task_applications(user_id,proposal_id,task_id,new_task_version_id,request_id)
 values(p_user_id,p.id,t.id,(result->>'id')::uuid,p_request_id) returning id into rid;
 insert into public.feedback_task_requests(user_id,request_id,proposal_id,application_id) values(p_user_id,p_request_id,p.id,rid);
 perform set_config('ideaos.feedback_task_write','',true);
 return jsonb_build_object('id',rid,'versionId',result->>'id');
end $$;
revoke all on function public.save_feedback_task_proposal(uuid,uuid,uuid,uuid,jsonb,text,uuid), public.apply_feedback_task_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_feedback_task_proposal(uuid,uuid,uuid,uuid,jsonb,text,uuid), public.apply_feedback_task_proposal(uuid,uuid,uuid) to service_role;
commit;
