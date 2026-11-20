begin;
-- A read projection over retained139 versions and independent result bodies.
-- Never reconstruct revisions that predate139 or copy source prose.
create function public.business_confirmation_history_nodes(p_owner uuid,p_case uuid)
returns table(kind text,id uuid,case_id uuid,revision integer,at timestamptz,node jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select 'plan'::text,v.plan_id,v.case_id,v.revision,v.saved_at,
  jsonb_build_object('kind','plan','id',v.plan_id,'caseId',v.case_id,'revision',v.revision,'at',v.saved_at,
   'parent',case when p.origin_result_id is not null then
    jsonb_build_object('kind','result','id',p.origin_result_id,'revision',1,'available',exists(select 1 from business_reality_results r where r.user_id=p_owner and r.id=p.origin_result_id and r.case_id=v.case_id))
   else jsonb_build_object('kind','simulation','id',p.simulation_id,'revision',p.source_revision,'available',exists(select 1 from business_simulations s where s.user_id=p_owner and s.id=p.simulation_id and s.case_id=v.case_id and s.revision>=p.source_revision and jsonb_array_length(s.turns)>=p.round)) end,
   'plan',business_reality_check_plan(v.plan),'body',null,'planSnapshot',null,'planSavedAt',null,'snapshotErasedAt',null)
 from business_reality_check_versions v join business_reality_checks p on p.user_id=v.user_id and p.id=v.plan_id and p.case_id=v.case_id and p.revision>=v.revision
 where v.user_id=p_owner and (p_case is null or v.case_id=p_case)
 union all
 select 'result'::text,r.id,r.case_id,1,r.created_at,
  jsonb_build_object('kind','result','id',r.id,'caseId',r.case_id,'revision',1,'at',r.created_at,
   'parent',jsonb_build_object('kind','plan','id',r.plan_id,'revision',r.plan_revision,'available',exists(select 1 from business_reality_check_versions v join business_reality_checks p on p.user_id=v.user_id and p.id=v.plan_id and p.case_id=v.case_id where v.user_id=p_owner and v.plan_id=r.plan_id and v.revision=r.plan_revision and v.case_id=r.case_id)),
   'plan',null,'body',business_reality_result_body(r.body),'planSnapshot',case when r.plan_snapshot is null then null else business_reality_check_plan(r.plan_snapshot) end,'planSavedAt',r.plan_saved_at,'snapshotErasedAt',r.snapshot_erased_at)
 from business_reality_results r where r.user_id=p_owner and (p_case is null or r.case_id=p_case)
$$;

create function public.business_confirmation_history_read(p_user_id uuid,p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_case uuid;v_revision integer;v_kind text;v_at timestamptz;v_stamp text;n record;v_count integer:=0;v_items jsonb:='[]';v_next jsonb;
begin
 perform business_simulation_service(p_user_id);
 if p_operation='get' then
  if p_input->>'kind'='plan' then perform business_simulation_keys(p_input,array['kind','id','revision']);v_revision:=business_simulation_integer(p_input->'revision',2147483647)::integer;if v_revision<1 then raise exception 'invalid confirmation revision';end if;
  elsif p_input->>'kind'='result' then perform business_simulation_keys(p_input,array['kind','id']);v_revision:=1;
  else raise exception 'invalid confirmation kind';end if;
  v_kind:=p_input->>'kind';v_id:=business_simulation_uuid(p_input->'id');
  select * into n from business_confirmation_history_nodes(p_user_id,null) h where h.kind=v_kind and h.id=v_id and h.revision=v_revision;
  if not found then return null;end if;
  if n.kind='result' and ((n.node->'parent'->>'available')::boolean is distinct from (n.node->'planSnapshot'<>'null'::jsonb)) then raise exception 'inconsistent confirmation source';end if;
  return n.node;
 elsif p_operation<>'list' or p_operation is null then raise exception 'invalid confirmation read';end if;
 perform business_simulation_keys(p_input,'{}',array['caseId','before']);
 if p_input?'caseId' then v_case:=business_simulation_uuid(p_input->'caseId');end if;
 if p_input?'before' then
  perform business_simulation_keys(p_input->'before',array['at','kind','id','revision']);
  v_id:=business_simulation_uuid(p_input->'before'->'id');v_kind:=p_input->'before'->>'kind';
  if v_kind not in ('plan','result') or v_kind is null then raise exception 'invalid confirmation cursor kind';end if;
  v_revision:=business_simulation_integer(p_input->'before'->'revision',2147483647)::integer;
  if v_revision<1 or (v_kind='result' and v_revision<>1) then raise exception 'invalid confirmation cursor revision';end if;
  v_stamp:=p_input->'before'->>'at';
  if jsonb_typeof(p_input->'before'->'at') is distinct from 'string' or length(v_stamp)>80 or v_stamp!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$' then raise exception 'invalid confirmation cursor timestamp';end if;
  perform business_simulation_date(to_jsonb(left(v_stamp,10)));v_at:=v_stamp::timestamptz;
 end if;
 for n in select * from business_confirmation_history_nodes(p_user_id,v_case) h
  where v_id is null or (h.at,h.kind collate "C",h.id,h.revision)<(v_at,v_kind collate "C",v_id,v_revision)
  order by h.at desc,h.kind collate "C" desc,h.id desc,h.revision desc limit 21
 loop
  v_count:=v_count+1;
  if v_count<=20 then
   if n.kind='result' and ((n.node->'parent'->>'available')::boolean is distinct from (n.node->'planSnapshot'<>'null'::jsonb)) then raise exception 'inconsistent confirmation source';end if;
   v_items:=v_items||jsonb_build_array(n.node);v_next:=jsonb_build_object('at',n.at,'kind',n.kind,'id',n.id,'revision',n.revision);
  end if;
 end loop;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;

revoke all on function public.business_confirmation_history_nodes(uuid,uuid),public.business_confirmation_history_read(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_confirmation_history_read(uuid,text,jsonb) to service_role;
commit;
