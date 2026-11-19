begin;
-- Keep one global keyset across plans, own findings and all prior operating work.
create or replace function public.business_workspace_items(p_owner uuid,p_case uuid default null)
returns table(kind text,id uuid,case_id uuid,revision integer,updated_at timestamptz,title text,excerpt text,next_check text,source_available boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select * from business_workspace_base_items(p_owner,p_case)
 union all
 select 'boundary',b.id,b.case_id,b.revision,b.updated_at,left(b.definition->>'title',160),
  (case b.definition->>'side' when 'baseline' then '基准假设' else '替代假设' end)||' · '||
  (case b.definition->'variable'->>'kind' when 'opening' then '期初现金范围' when 'amount' then '单笔收付金额范围' else '单笔收付日期范围' end),
  null,
  exists(select 1 from business_cash_scenarios c where c.user_id=p_owner and c.id=(b.definition->>'cashId')::uuid and c.revision=(b.definition->>'cashRevision')::integer)
 from business_cash_boundaries b where b.user_id=p_owner and (p_case is null or b.case_id=p_case)
 union all
 select 'simulation',s.id,s.case_id,s.revision,s.updated_at,left(s.setup->>'title',160),
  left(case when jsonb_array_length(s.turns)=0 then '已保存练习条件，尚未记录第一回合的选择。' else s.turns->-1->>'reason' end,400),
  left(s.turns->-1->>'checkNext',400),business_simulation_context(s.user_id,s.case_id) is not null
 from business_simulations s where s.user_id=p_owner and (p_case is null or s.case_id=p_case)
 union all
 select 'reality_check',q.id,q.case_id,q.revision,q.updated_at,
  left(q.plan->>'question',120)||' · '||(case when (q.plan->>'dueDate')::date<(current_timestamp at time zone 'Asia/Tokyo')::date then '期限已过 · ' else '截止 ' end)||(q.plan->>'dueDate'),
  left(q.plan->>'falsifier',400),left(q.plan->>'method',400),
  exists(select 1 from business_simulations s where s.user_id=p_owner and s.id=q.simulation_id and s.case_id=q.case_id and jsonb_array_length(s.turns)>=q.round)
 from business_reality_checks q where q.user_id=p_owner and (p_case is null or q.case_id=p_case)
 union all
 select 'reality_result',r.id,r.case_id,1,r.created_at,
  left(r.body->>'learned',160),left(r.body->>'found',400),null,
  r.plan_snapshot is not null
 from business_reality_results r where r.user_id=p_owner and (p_case is null or r.case_id=p_case)

$$;
create or replace function public.business_workspace_read(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_case uuid;v_date timestamptz;v_kind text;v_id uuid;v_count integer:=0;v_items jsonb:='[]';v_next jsonb;r record;begin
 perform business_pressure_service(p_user_id);
 if p_operation='case' then perform business_pressure_keys(p_input,array['caseId'],array['before']);v_case:=business_pressure_uuid(p_input->'caseId');
 elsif p_operation='recent' then perform business_pressure_keys(p_input,'{}',array['before']);
 else raise exception 'invalid workspace read';end if;
 if p_input?'before' then
  perform business_pressure_keys(p_input->'before',array['date','kind','id']);v_id:=business_pressure_uuid(p_input->'before'->'id');
  if jsonb_typeof(p_input->'before'->'kind') is distinct from 'string' or (p_input->'before'->>'kind')<>all(array['pressure','cash','practice','counterexample','learning','lesson','boundary','simulation','reality_check','reality_result']) then raise exception 'invalid workspace cursor kind';end if;v_kind:=p_input->'before'->>'kind';
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

revoke all on function public.business_workspace_items(uuid,uuid),public.business_workspace_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_workspace_read(uuid,text,jsonb) to service_role;
commit;
