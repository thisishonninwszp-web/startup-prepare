begin;
-- This projection retains only live source identifiers and bounded independently authored text.
create function public.business_workspace_base_items(p_owner uuid,p_case uuid default null) returns table(kind text,id uuid,case_id uuid,revision integer,updated_at timestamptz,title text,excerpt text,next_check text,source_available boolean) language sql stable security definer set search_path=public,pg_temp as $$
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
 select m.kind,m.id,(m.item->>'caseId')::uuid,1,m.created_at,left(m.item->'draft'->>'method',160),left(m.item->'draft'->>'conditions',400),null,true from business_counterexample_methods(p_owner) m) base where p_case is null or base.case_id=p_case
$$;
create function public.business_workspace_items(p_owner uuid,p_case uuid default null) returns table(kind text,id uuid,case_id uuid,revision integer,updated_at timestamptz,title text,excerpt text,next_check text,source_available boolean) language sql stable security definer set search_path=public,pg_temp as $$select * from business_workspace_base_items(p_owner,p_case)$$;
create function public.business_workspace_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_case uuid;v_date timestamptz;v_kind text;v_id uuid;v_count integer:=0;v_items jsonb:='[]';v_next jsonb;r record;begin
 perform business_pressure_service(p_user_id);
 if p_operation='case' then perform business_pressure_keys(p_input,array['caseId'],array['before']);v_case:=business_pressure_uuid(p_input->'caseId');
 elsif p_operation='recent' then perform business_pressure_keys(p_input,'{}',array['before']);
 else raise exception 'invalid workspace read';end if;
 if p_input?'before' then
  perform business_pressure_keys(p_input->'before',array['date','kind','id']);v_id:=business_pressure_uuid(p_input->'before'->'id');
  if jsonb_typeof(p_input->'before'->'kind') is distinct from 'string' or (p_input->'before'->>'kind')<>all(array['pressure','cash','practice','counterexample','learning','lesson','boundary','simulation']) then raise exception 'invalid workspace cursor kind';end if;v_kind:=p_input->'before'->>'kind';
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or (p_input->'before'->>'date')!~'^\d{4}-\d\d-\d\dT[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid workspace cursor date';end if;v_date:=(p_input->'before'->>'date')::timestamptz;
 end if;
 for r in select w.*,left(m.name,300) case_title from business_workspace_items(p_user_id,v_case) w
 join business_daily_cases c on c.id=w.case_id and c.user_id=p_user_id join business_merchants m on m.id=c.merchant_id and m.user_id=c.user_id
 where (v_case is null or w.case_id=v_case) and (v_id is null or (w.updated_at,w.kind collate "C",w.id)<(v_date,v_kind collate "C",v_id))
 order by w.updated_at desc,w.kind collate "C" desc,w.id desc limit 21 loop
  v_count:=v_count+1;if v_count<=20 then
   v_items:=v_items||jsonb_build_array(jsonb_build_object('kind',r.kind,'id',r.id,'caseId',r.case_id,'caseTitle',r.case_title,'revision',r.revision,'updatedAt',r.updated_at,'title',coalesce(r.title,''),'excerpt',coalesce(r.excerpt,''),'nextCheck',r.next_check,'sourceAvailable',r.source_available));
   v_next:=jsonb_build_object('date',r.updated_at,'kind',r.kind,'id',r.id);
  end if;
 end loop;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;
revoke all on function public.business_workspace_base_items(uuid,uuid),public.business_workspace_items(uuid,uuid),public.business_workspace_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_workspace_read(uuid,text,jsonb) to service_role;
commit;
