begin;

alter table public.business_job_runs drop constraint business_job_runs_status_check;
alter table public.business_job_runs add constraint business_job_runs_status_check check(status in('running','materials_ready','completed','draft_ready','failed','unknown'));

create function public.business_job_draft_capability(p_user_id uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform business_service(p_user_id);
 return true;
end$$;

alter function public.business_job_command(uuid,text,jsonb) rename to business_job_command_v121;
revoke all on function public.business_job_command_v121(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.business_job_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r business_job_runs;v_report jsonb;v_result jsonb;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>250000 then raise exception 'invalid job input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));

 if p_operation='finish' and exists(select 1 from jsonb_array_elements(p_input->'report'->'sections') section where jsonb_typeof(section->'validationGaps')='array' and jsonb_array_length(section->'validationGaps')>0) then
  raise exception 'partial report requires draft finalization';
 end if;
 if p_operation<>'finish_draft' then return business_job_command_v121(p_user_id,p_operation,p_input);end if;

 -- A completed receipt is safe to replay after settings or leases have changed.
 select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid for update;
 if not found or r.lease_token is distinct from (p_input->>'leaseToken')::uuid then raise exception 'run owner unavailable' using errcode='42501';end if;
 if r.result is not null then
  if r.status<>'draft_ready' or p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'draft terminal receipt conflict';end if;
  return r.result;
 end if;
 r=business_job_assert(p_user_id,p_input,true);
 if r.material_status<>'ready' or p_input->'draftLease'->>'caseId' is distinct from r.case_id::text or p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;
 if not exists(select 1 from business_job_attempts where user_id=p_user_id and run_id=r.id and kind='ai' and status='completed') then raise exception 'completed AI ticket required before finalization';end if;

 perform set_config('business.job_finish',r.id::text,true);
 v_report=business_report_command(p_user_id,'finish',(p_input->'draftLease')||jsonb_build_object('report',p_input->'report'));
 v_result=jsonb_build_object('status','draft_ready','runId',r.id,'caseId',r.case_id,'reportId',v_report->>'id','message','部分报告与拦截记录已保存为草稿，请打开案例核对；未自动发布。');
 update business_job_runs set status='draft_ready',report_status='draft',result=v_result,message=v_result->>'message',finished_at=clock_timestamp() where id=r.id;
 return v_result;
end$$;

revoke all on function public.business_job_draft_capability(uuid),public.business_job_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.business_job_draft_capability(uuid),public.business_job_command(uuid,text,jsonb) to service_role;

commit;
