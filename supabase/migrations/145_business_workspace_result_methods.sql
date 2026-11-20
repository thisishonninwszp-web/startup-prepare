begin;
-- This projection retains only live source identifiers and bounded independently authored text.
create or replace function public.business_workspace_base_items(p_owner uuid,p_case uuid default null) returns table(kind text,id uuid,case_id uuid,revision integer,updated_at timestamptz,title text,excerpt text,next_check text,source_available boolean) language sql stable security definer set search_path=public,pg_temp as $$
 select base.* from (select 'pressure'::text kind,p.id,p.case_id,p.revision,p.updated_at,left(p.plan->>'changedCondition',160),left(p.plan->>'action',400),left(p.plan->>'checkNext',400),business_pressure_context(p.user_id,p.case_id) is not null from business_pressure_records p where p.user_id=p_owner
 union all
 select 'cash',p.id,p.case_id,p.revision,p.updated_at,left(p.assumptions->>'title',160),left(coalesce(p.assumptions->'baseline'->0->>'assumption',''),400),null,business_cash_context(p.user_id,p.case_id) is not null from business_cash_scenarios p where p.user_id=p_owner
 union all
 select 'practice',p.id,p.case_id,p.revision,p.updated_at,left(p.plan->>'title',160),left(case when p.result is null then '已保存课题：'||coalesce(p.plan->>'objective','') else '已记录成果：'||coalesce(p.result->>'artifactDescription','') end,400),left(p.result->>'nextChange',400),
 (business_practice_dto(p)->'sources'->>'caseAvailable')::boolean and (p.report_id is null or (business_practice_dto(p)->'sources'->>'reportAvailable')::boolean) and (p.apprenticeship_id is null or (business_practice_dto(p)->'sources'->>'apprenticeshipAvailable')::boolean) from business_making_practices p where p.user_id=p_owner
 union all
 select 'counterexample',p.id,(p.study->>'candidateCaseId')::uuid,p.revision,p.updated_at,'反例研究',left(p.study->>'explanation',400),left(p.study->>'checkNext',400),
 not (business_counterexample_dto(p)->'sources'->>'stale')::boolean and business_counterexample_case(p.user_id,(p.study->>'candidateCaseId')::uuid) is not null from business_method_counterexamples p where p.user_id=p_owner
 union all
 select m.kind,m.id,(m.item->>'caseId')::uuid,1,m.created_at,left(m.item->'draft'->>'method',160),left(m.item->'draft'->>'conditions',400),null,case when origin.entry_id is null then true else exists(select 1 from business_reality_results result where result.user_id=p_owner and result.id=origin.result_id and result.case_id=(m.item->>'caseId')::uuid) end from business_counterexample_methods(p_owner) m left join business_result_method_origins origin on origin.user_id=p_owner and origin.entry_id=m.id) base where p_case is null or base.case_id=p_case
$$;

revoke all on function public.business_workspace_base_items(uuid,uuid) from public,anon,authenticated,service_role;
commit;
