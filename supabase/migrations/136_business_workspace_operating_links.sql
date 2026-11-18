begin;
-- Keep a single ordering/cursor across all independently authored operating work.
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
$$;
revoke all on function public.business_workspace_items(uuid,uuid) from public,anon,authenticated,service_role;
commit;
