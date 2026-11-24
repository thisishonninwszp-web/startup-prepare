begin;
lock table public.business_reality_checks in share row exclusive mode;
lock table public.business_reality_results in share row exclusive mode;
-- Independent personal prose belongs to the exact plan version or result only.
create table public.business_reality_action_choices(
 user_id uuid not null,plan_id uuid not null,revision integer not null,
 choice jsonb not null check(jsonb_typeof(choice)='object'),
 primary key(user_id,plan_id,revision),
 foreign key(user_id,plan_id,revision) references public.business_reality_check_versions(user_id,plan_id,revision) on delete cascade
);
alter table public.business_reality_results add constraint business_reality_results_owner_id unique(user_id,id);
create table public.business_reality_result_actions(
 user_id uuid not null,result_id uuid not null,review jsonb not null check(jsonb_typeof(review)='object'),
 primary key(user_id,result_id),
 foreign key(user_id,result_id) references public.business_reality_results(user_id,id) on delete cascade
);
alter table public.business_reality_action_choices enable row level security;
alter table public.business_reality_result_actions enable row level security;
revoke all on public.business_reality_action_choices,public.business_reality_result_actions from public,anon,authenticated,service_role;

create function public.business_action_target(p jsonb) returns text language plpgsql immutable set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p) is distinct from 'string' or p#>>'{}' not in('current','alternative','hold') then raise exception 'invalid action target';end if;return p#>>'{}';
end$$;
create function public.business_action_choice_input(p jsonb,p_expectations boolean) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb:=p;k text;c jsonb;begin
 perform business_simulation_keys(v,array['decision','currentAction','alternativeAction','holdAction','conditions','mapping','relatedIdeaId']);
 foreach k in array array['decision','currentAction','alternativeAction','holdAction'] loop v:=jsonb_set(v,array[k],to_jsonb(business_simulation_text(v->k,case when k='decision' then 1000 else 2000 end)));end loop;
 c:=v->'conditions';
 if c->>'kind'='expectations' and p_expectations then perform business_simulation_keys(c,array['kind']);
 elsif c->>'kind'='explicit' and not p_expectations then
  perform business_simulation_keys(c,array['kind','a','b']);c:=jsonb_set(c,'{a}',to_jsonb(business_simulation_text(c->'a',3000)));c:=jsonb_set(c,'{b}',to_jsonb(business_simulation_text(c->'b',3000)));v:=jsonb_set(v,'{conditions}',c);
 else raise exception '请亲手填写两条观察条件';end if;
 perform business_simulation_keys(v->'mapping',array['a','b','unclear']);foreach k in array array['a','b','unclear'] loop perform business_action_target(v->'mapping'->k);end loop;
 if v->'relatedIdeaId' is distinct from 'null'::jsonb then v:=jsonb_set(v,'{relatedIdeaId}',to_jsonb(business_simulation_uuid(v->'relatedIdeaId')));end if;
 return v;
end$$;
create function public.business_action_review_input(p jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v jsonb:=p;e jsonb;d date;begin
 perform business_simulation_keys(v,array['outcome','nextAction','otherAction','reason','execution']);
 if jsonb_typeof(v->'outcome') is distinct from 'string' or v->>'outcome' not in('a','b','both','neither','unclear') then raise exception 'invalid action review outcome';end if;
 if v->>'nextAction'='other' then v:=jsonb_set(v,'{otherAction}',to_jsonb(business_simulation_text(v->'otherAction',2000)));
 else perform business_action_target(v->'nextAction');if v->'otherAction' is distinct from 'null'::jsonb then raise exception 'other action only for other choice';end if;end if;
 v:=jsonb_set(v,'{reason}',to_jsonb(business_simulation_text(v->'reason',3000)));
 e:=v->'execution';if e is distinct from 'null'::jsonb then
  perform business_simulation_keys(e,array['what','actedOn']);e:=jsonb_set(e,'{what}',to_jsonb(business_simulation_text(e->'what',3000)));d:=business_simulation_date(e->'actedOn');
  if d>(clock_timestamp() at time zone 'Asia/Tokyo')::date then raise exception '执行日期不能晚于东京今天';end if;v:=jsonb_set(v,'{execution}',e);
 end if;return v;
end$$;
-- Called only after the original receipt lookup and owner/revision checks.
create function public.business_action_choice_save(p_owner uuid,p_plan uuid,p_revision integer,p_input jsonb,p_expectations boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb;previous_choice jsonb;v_idea uuid;begin
 if not p_input?'actionChoice' then
  if exists(select 1 from business_reality_action_choices where user_id=p_owner and plan_id=p_plan and revision=p_revision-1) then raise exception '请使用支持行动约定的编辑器，核对本版条件后再保存';end if;return;
 end if;
 if p_input->'actionChoice'='null'::jsonb then return;end if;
 c:=business_action_choice_input(p_input->'actionChoice',p_expectations);
 if c->'relatedIdeaId'<>'null'::jsonb then
  v_idea:=(c->>'relatedIdeaId')::uuid;select choice into previous_choice from business_reality_action_choices where user_id=p_owner and plan_id=p_plan and revision=p_revision-1;
  -- An unchanged dead link retains independent personal prose; changing it requires ownership.
  if previous_choice->>'relatedIdeaId' is distinct from c->>'relatedIdeaId' then
   perform 1 from ideas where user_id=p_owner and id=v_idea for share;if not found then raise exception '关联想法不可用' using errcode='42501';end if;
  end if;
 end if;
 if c->'conditions'->>'kind'='expectations' and business_explanation_expectations(p_owner,p_plan,p_revision) is null then raise exception 'exact explanation expectations unavailable';end if;
 insert into business_reality_action_choices(user_id,plan_id,revision,choice) values(p_owner,p_plan,p_revision,c);
end$$;
create function public.business_action_choice_projection(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;e jsonb;a text;b text;v_title text;v_available boolean:=false;begin
 select choice into c from business_reality_action_choices where user_id=p_owner and plan_id=p_plan and revision=p_revision;
 if c is null then return '{}'::jsonb;end if;
 if c->'conditions'->>'kind'='expectations' then e:=business_explanation_expectations(p_owner,p_plan,p_revision);a:=e->>'expectedA';b:=e->>'expectedB';else a:=c->'conditions'->>'a';b:=c->'conditions'->>'b';end if;
 if c->'relatedIdeaId'<>'null'::jsonb then select coalesce(title,'') into v_title from ideas where user_id=p_owner and id=(c->>'relatedIdeaId')::uuid;v_available:=found;end if;
 return jsonb_build_object('actionChoice',jsonb_build_object('choice',c,'conditionA',a,'conditionB',b,'ideaAvailable',v_available,'ideaTitle',v_title));
end$$;
create function public.business_action_review_projection(p_owner uuid,p_result uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select jsonb_build_object('actionReview',review) from business_reality_result_actions where user_id=p_owner and result_id=p_result),'{}'::jsonb)
$$;
create function public.business_action_choice_context(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before uuid;v_date timestamptz;v_stamp text;v_count integer:=0;v_items jsonb:='[]';v_next jsonb;r ideas;begin
 perform business_simulation_service(p_user_id);if p_operation is distinct from 'ideas' then raise exception 'invalid action choice context operation';end if;
 perform business_simulation_keys(p_input,'{}',array['before']);
 if p_input?'before' then
  perform business_simulation_keys(p_input->'before',array['date','id']);v_before:=business_simulation_uuid(p_input->'before'->'id');v_stamp:=p_input->'before'->>'date';
  if jsonb_typeof(p_input->'before'->'date') is distinct from 'string' or length(v_stamp)>80 or v_stamp!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid action idea cursor';end if;
  perform business_simulation_date(to_jsonb(left(v_stamp,10)));v_date:=v_stamp::timestamptz;
 end if;
 for r in select * from ideas where user_id=p_user_id and (v_before is null or (created_at,id)<(v_date,v_before)) order by created_at desc,id desc limit 21 loop
  v_count:=v_count+1;if v_count<=20 then v_items:=v_items||jsonb_build_array(jsonb_build_object('id',r.id,'title',coalesce(r.title,''),'createdAt',r.created_at));v_next:=jsonb_build_object('date',r.created_at,'id',r.id);end if;
 end loop;return jsonb_build_object('items',v_items,'nextCursor',case when v_count>20 then v_next else null end);
end$$;


create or replace function public.business_reality_check_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_simulation uuid;v_round integer;v_plan jsonb;v_hash text;r business_reality_checks;s business_simulations;receipt business_reality_check_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>160000 then raise exception '计划内容过长';end if;
 if p_operation='save' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','simulationId','round','plan','confirmed'],array['actionChoice']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);
 else raise exception 'invalid reality check operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid reality check operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');v_expected:=business_simulation_integer(p_input->'expectedRevision',2147483646)::integer;
 if p_operation='erase' and v_expected=0 then raise exception 'invalid reality check revision';end if;
 if p_operation='save' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'reality check confirmation required';end if;
  v_simulation:=business_simulation_uuid(p_input->'simulationId');v_round:=business_simulation_integer(p_input->'round',6)::integer;if v_round<1 then raise exception 'invalid reality check round';end if;
  v_plan:=business_reality_check_plan(p_input->'plan');
 end if;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,137));
 -- Resolve committed requests before rereading sources or comparing revisions.
 select * into receipt from business_reality_check_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'reality check request conflict';end if;return jsonb_build_object('id',receipt.reality_check_id,'revision',receipt.revision);end if;
 select * into r from business_reality_checks where user_id=p_user_id and id=v_id for update;
 if p_operation='save' and v_expected=0 then
  if r.id is not null or exists(select 1 from business_reality_checks where id=v_id) or exists(select 1 from business_reality_check_receipts where reality_check_id=v_id) then raise exception 'reality check unavailable' using errcode='42501';end if;
  select * into s from business_simulations where user_id=p_user_id and id=v_simulation for share;
  if not found or jsonb_array_length(s.turns)<v_round then raise exception 'reality check source unavailable' using errcode='42501';end if;
  perform 1 from business_daily_cases where user_id=p_user_id and id=s.case_id for share;
  if not found or business_simulation_context(p_user_id,s.case_id) is null then raise exception 'reality check source unavailable' using errcode='42501';end if;
  insert into business_reality_checks(id,user_id,case_id,simulation_id,round,source_revision,plan,revision) values(v_id,p_user_id,s.case_id,s.id,v_round,s.revision,v_plan,1);v_revision:=1;
 else
  if r.id is null or r.simulation_id is null then raise exception 'reality check unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'reality check revision conflict: 另一页面已经修改，请比较最新内容';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.simulation_id<>v_simulation or r.round<>v_round then raise exception 'reality check source anchor is immutable';end if;
   update business_reality_checks set plan=v_plan,revision=v_revision,updated_at=clock_timestamp() where id=v_id and user_id=p_user_id;
  else delete from business_reality_checks where id=v_id and user_id=p_user_id;end if;
 end if;
 if p_operation='save' then perform business_action_choice_save(p_user_id,v_id,v_revision,p_input,false);end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create or replace function public.business_followup_check_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_result uuid;v_plan jsonb;v_hash text;r business_reality_checks;s business_reality_results;receipt business_reality_check_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>160000 then raise exception '计划内容过长';end if;
 if p_operation='save' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','resultId','plan','confirmed'],array['actionChoice']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);
 else raise exception 'invalid followup check operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid followup check operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');v_expected:=business_simulation_integer(p_input->'expectedRevision',2147483646)::integer;
 if p_operation='erase' and v_expected=0 then raise exception 'invalid followup check revision';end if;
 if p_operation='save' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'followup check confirmation required';end if;
  v_result:=business_simulation_uuid(p_input->'resultId');v_plan:=business_reality_check_plan(p_input->'plan');
 end if;
 -- The workflow tag prevents identical erase JSON from replaying through137.
 v_hash:=encode(sha256(convert_to('followup:'||p_operation||':'||p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,137));
 select * into receipt from business_reality_check_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'followup check request conflict';end if;return jsonb_build_object('id',receipt.reality_check_id,'revision',receipt.revision);end if;
 select * into r from business_reality_checks where user_id=p_user_id and id=v_id for update;
 if p_operation='save' and v_expected=0 then
  if r.id is not null or exists(select 1 from business_reality_checks where id=v_id) or exists(select 1 from business_reality_check_receipts where reality_check_id=v_id) then raise exception 'followup check unavailable' using errcode='42501';end if;
  -- Serialize against139 result erasure; neither the old plan nor case is required.
  select * into s from business_reality_results where user_id=p_user_id and id=v_result for share;
  if not found then raise exception 'followup check source unavailable' using errcode='42501';end if;
  insert into business_reality_checks(id,user_id,case_id,origin_result_id,plan,revision) values(v_id,p_user_id,s.case_id,s.id,v_plan,1);v_revision:=1;
 else
  if r.id is null or r.origin_result_id is null then raise exception 'followup check unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'followup check revision conflict: 另一页面已经修改，请比较最新内容';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.origin_result_id<>v_result then raise exception 'followup check source anchor is immutable';end if;
   update business_reality_checks set plan=v_plan,revision=v_revision,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
  else delete from business_reality_checks where user_id=p_user_id and id=v_id;end if;
 end if;
 if p_operation='save' then perform business_action_choice_save(p_user_id,v_id,v_revision,p_input,false);end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create or replace function public.business_explanation_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_expected integer;v_revision integer;v_anchor jsonb;v_draft jsonb;v_source jsonb;v_hash text;r business_reality_checks;receipt business_reality_check_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>160000 then raise exception '计划内容过长';end if;
 if p_input is null or octet_length((p_input-'actionChoice')::text)>90000 then raise exception 'invalid explanation input';end if;
 if p_operation='save' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision','anchor','draft','confirmed'],array['actionChoice']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);else raise exception 'invalid explanation operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid explanation operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');v_expected:=business_simulation_integer(p_input->'expectedRevision',2147483646);if p_operation='erase' and v_expected<1 then raise exception 'invalid explanation revision';end if;
 if p_operation='save' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'explicit explanation preview confirmation required';end if;v_anchor:=business_explanation_anchor(p_input->'anchor');v_draft:=business_explanation_draft(p_input->'draft');
 end if;
 v_hash:=encode(sha256(convert_to('explanation:'||p_operation||':'||p_input::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,137));
 select * into receipt from business_reality_check_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'explanation request conflict';end if;return jsonb_build_object('id',receipt.reality_check_id,'revision',receipt.revision);end if;
 select * into r from business_reality_checks where user_id=p_user_id and id=v_id for update;
 if p_operation='save' and v_expected=0 then
  if r.id is not null or exists(select 1 from business_reality_checks where id=v_id) or exists(select 1 from business_reality_check_receipts where reality_check_id=v_id) then raise exception 'explanation unavailable' using errcode='42501';end if;
  v_source:=business_explanation_source(p_user_id,v_anchor);if v_source is null then raise exception 'explanation source unavailable' using errcode='42501';end if;
  insert into business_reality_checks(id,user_id,case_id,origin_explanation,plan,revision) values(v_id,p_user_id,(v_source->>'caseId')::uuid,v_anchor,v_draft-'expectedA'-'expectedB'-'uncontrolled',1);v_revision:=1;
 else
  if r.id is null or r.origin_explanation is null then raise exception 'explanation unavailable' using errcode='42501';end if;
  if r.revision<>v_expected then raise exception 'explanation revision conflict: 另一页面已经修改，请重新核对';end if;v_revision:=r.revision+1;
  if p_operation='save' then
   if r.origin_explanation<>v_anchor then raise exception 'explanation anchor is immutable';end if;
   update business_reality_checks set plan=v_draft-'expectedA'-'expectedB'-'uncontrolled',revision=v_revision,updated_at=clock_timestamp() where user_id=p_user_id and id=v_id;
  else delete from business_reality_checks where user_id=p_user_id and id=v_id;end if;
 end if;
 if p_operation='save' then insert into business_explanation_expectations(user_id,plan_id,revision,expectations) values(p_user_id,v_id,v_revision,v_draft-'question'-'falsifier'-'method'-'dueDate');end if;
 if p_operation='save' then perform business_action_choice_save(p_user_id,v_id,v_revision,p_input,true);end if;
 insert into business_reality_check_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create or replace function public.business_reality_result_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_request uuid;v_plan uuid;v_revision integer;v_body jsonb;v_hash text;r business_reality_results;p business_reality_checks;v business_reality_check_versions;receipt business_reality_result_receipts;begin
 perform business_simulation_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>160000 then raise exception '调查内容过长';end if;
 if p_operation='append' then perform business_simulation_keys(p_input,array['operation','id','requestId','planId','planRevision','body','confirmed'],array['actionReview']);
 elsif p_operation='erase' then perform business_simulation_keys(p_input,array['operation','id','requestId','expectedRevision']);else raise exception 'invalid reality result operation';end if;
 if p_input->>'operation' is distinct from p_operation then raise exception 'invalid reality result operation';end if;
 v_id:=business_simulation_uuid(p_input->'id');v_request:=business_simulation_uuid(p_input->'requestId');
 if p_operation='append' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'reality result confirmation required';end if;
  v_plan:=business_simulation_uuid(p_input->'planId');v_revision:=business_simulation_integer(p_input->'planRevision',2147483647)::integer;if v_revision<1 then raise exception 'invalid reality result plan revision';end if;
 else if business_simulation_integer(p_input->'expectedRevision',1)<>1 then raise exception 'invalid reality result revision';end if;end if;
 v_hash:=encode(sha256(convert_to(p_operation||':'||p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,139));
 -- Receipts resolve before source rereads or body revalidation. Erasure cannot resurrect data.
 select * into receipt from business_reality_result_receipts where user_id=p_user_id and request_id=v_request;
 if found then if receipt.input_hash<>v_hash then raise exception 'reality result request conflict';end if;return jsonb_build_object('id',receipt.result_id,'revision',receipt.revision);end if;
 select * into r from business_reality_results where user_id=p_user_id and id=v_id for update;
 if p_operation='append' then
  if r.id is not null or exists(select 1 from business_reality_results where id=v_id) or exists(select 1 from business_reality_result_receipts where result_id=v_id) then raise exception 'reality result unavailable' using errcode='42501';end if;
  v_body:=business_reality_result_body(p_input->'body');
  select * into p from business_reality_checks where user_id=p_user_id and id=v_plan for share;
  if not found then raise exception 'reality result source unavailable' using errcode='42501';end if;
  select * into v from business_reality_check_versions where user_id=p_user_id and plan_id=v_plan and revision=v_revision;
  if not found then raise exception 'reality result source unavailable' using errcode='42501';end if;
  insert into business_reality_results(id,user_id,case_id,plan_id,plan_revision,plan_snapshot,plan_saved_at,body) values(v_id,p_user_id,p.case_id,p.id,v.revision,v.plan,v.saved_at,v_body);v_revision:=1;
  if p_input?'actionReview' then
   if not exists(select 1 from business_reality_action_choices where user_id=p_user_id and plan_id=v_plan and revision=(p_input->>'planRevision')::integer) then raise exception '该计划版本没有行动约定';end if;
   insert into business_reality_result_actions(user_id,result_id,review) values(p_user_id,v_id,business_action_review_input(p_input->'actionReview'));
  end if;
 else
  if r.id is null then raise exception 'reality result unavailable' using errcode='42501';end if;
  delete from business_reality_results where user_id=p_user_id and id=v_id;v_revision:=2;
 end if;
 insert into business_reality_result_receipts values(p_user_id,v_request,v_hash,v_id,v_revision);
 return jsonb_build_object('id',v_id,'revision',v_revision);
end$$;

create or replace function public.business_reality_check_dto(p business_reality_checks) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;s business_simulations;v_available boolean;begin
 c:=business_simulation_context(p.user_id,p.case_id);
 select * into s from business_simulations where user_id=p.user_id and id=p.simulation_id and case_id=p.case_id and jsonb_array_length(turns)>=p.round;
 v_available:=found;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'simulationId',p.simulation_id,'round',p.round,'sourceRevision',p.source_revision,'plan',p.plan,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
  'source',jsonb_build_object('available',v_available,'title',case when v_available then s.setup->'title' else null end,'currentRevision',case when v_available then s.revision else null end,'reason',case when v_available then s.turns->(p.round-1)->'reason' else null end,'checkNext',case when v_available then s.turns->(p.round-1)->'checkNext' else null end,'caseAvailable',c is not null,'caseTitle',c->'caseTitle'))||business_action_choice_projection(p.user_id,p.id,p.revision);
end$$;

create or replace function public.business_followup_check_dto(p business_reality_checks) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s business_reality_results;v_source jsonb;begin
 select * into s from business_reality_results where user_id=p.user_id and id=p.origin_result_id and case_id=p.case_id;
 if found then v_source:=business_followup_check_source_dto(s);end if;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'resultId',p.origin_result_id,'plan',p.plan,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'source',v_source)||business_action_choice_projection(p.user_id,p.id,p.revision);
end$$;

create or replace function public.business_explanation_dto(p business_reality_checks,p_revision integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v business_reality_check_versions;e jsonb;begin
 select * into v from business_reality_check_versions where user_id=p.user_id and plan_id=p.id and revision=p_revision;
 e:=business_explanation_expectations(p.user_id,p.id,p_revision);if v.plan_id is null or e is null or p.origin_explanation is null then return null;end if;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'anchor',p.origin_explanation,'draft',v.plan||e,'revision',v.revision,'createdAt',p.created_at,'updatedAt',v.saved_at,'source',business_explanation_source(p.user_id,p.origin_explanation))||business_action_choice_projection(p.user_id,p.id,p_revision);
end$$;

create or replace function public.business_reality_result_plan_dto(p business_reality_checks) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;begin
 c:=business_subject_context(p.user_id,p.case_id);
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'question',p.plan->'question','revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'caseAvailable',c is not null,'caseTitle',c->'caseTitle')||business_action_choice_projection(p.user_id,p.id,p.revision);
end$$;

create or replace function public.business_reality_result_version_dto(p business_reality_check_versions) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c jsonb;current_revision integer;begin
 select revision into current_revision from business_reality_checks where user_id=p.user_id and id=p.plan_id;
 c:=business_subject_context(p.user_id,p.case_id);
 return jsonb_build_object('planId',p.plan_id,'caseId',p.case_id,'revision',p.revision,'plan',p.plan,'savedAt',p.saved_at,'currentRevision',current_revision,'caseAvailable',c is not null,'caseTitle',c->'caseTitle')||case when business_explanation_expectations(p.user_id,p.plan_id,p.revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p.user_id,p.plan_id,p.revision)) end||business_action_choice_projection(p.user_id,p.plan_id,p.revision);
end$$;

create or replace function public.business_reality_result_dto(p business_reality_results) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare current_revision integer;begin
 select revision into current_revision from business_reality_checks where user_id=p.user_id and id=p.plan_id;
 return jsonb_build_object('id',p.id,'caseId',p.case_id,'planId',p.plan_id,'planRevision',p.plan_revision,'planSavedAt',p.plan_saved_at,'planSnapshot',p.plan_snapshot,'snapshotErasedAt',p.snapshot_erased_at,'body',p.body,'createdAt',p.created_at,'revision',1,'planCurrentRevision',current_revision)||case when business_explanation_expectations(p.user_id,p.plan_id,p.plan_revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p.user_id,p.plan_id,p.plan_revision)) end||business_action_choice_projection(p.user_id,p.plan_id,p.plan_revision)||business_action_review_projection(p.user_id,p.id);
end$$;

create or replace function public.business_confirmation_history_nodes(p_owner uuid,p_case uuid)
returns table(kind text,id uuid,case_id uuid,revision integer,at timestamptz,node jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select 'plan'::text,v.plan_id,v.case_id,v.revision,v.saved_at,
  jsonb_build_object('kind','plan','id',v.plan_id,'caseId',v.case_id,'revision',v.revision,'at',v.saved_at,
   'parent',case when p.origin_explanation is not null then jsonb_build_object('kind','explanation','id',p.id,'revision',v.revision,'available',true) when p.origin_result_id is not null then
    jsonb_build_object('kind','result','id',p.origin_result_id,'revision',1,'available',exists(select 1 from business_reality_results r where r.user_id=p_owner and r.id=p.origin_result_id and r.case_id=v.case_id))
   else jsonb_build_object('kind','simulation','id',p.simulation_id,'revision',p.source_revision,'available',exists(select 1 from business_simulations s where s.user_id=p_owner and s.id=p.simulation_id and s.case_id=v.case_id and s.revision>=p.source_revision and jsonb_array_length(s.turns)>=p.round)) end,
   'plan',business_reality_check_plan(v.plan),'body',null,'planSnapshot',null,'planSavedAt',null,'snapshotErasedAt',null)||case when business_explanation_expectations(p_owner,v.plan_id,v.revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p_owner,v.plan_id,v.revision)) end
  ||business_action_choice_projection(p_owner,v.plan_id,v.revision)
 from business_reality_check_versions v join business_reality_checks p on p.user_id=v.user_id and p.id=v.plan_id and p.case_id=v.case_id and p.revision>=v.revision
 where v.user_id=p_owner and (p_case is null or v.case_id=p_case)
 union all
 select 'result'::text,r.id,r.case_id,1,r.created_at,
  jsonb_build_object('kind','result','id',r.id,'caseId',r.case_id,'revision',1,'at',r.created_at,
   'parent',jsonb_build_object('kind','plan','id',r.plan_id,'revision',r.plan_revision,'available',exists(select 1 from business_reality_check_versions v join business_reality_checks p on p.user_id=v.user_id and p.id=v.plan_id and p.case_id=v.case_id where v.user_id=p_owner and v.plan_id=r.plan_id and v.revision=r.plan_revision and v.case_id=r.case_id)),
   'plan',null,'body',business_reality_result_body(r.body),'planSnapshot',case when r.plan_snapshot is null then null else business_reality_check_plan(r.plan_snapshot) end,'planSavedAt',r.plan_saved_at,'snapshotErasedAt',r.snapshot_erased_at)||case when business_explanation_expectations(p_owner,r.plan_id,r.plan_revision) is null then '{}'::jsonb else jsonb_build_object('expectations',business_explanation_expectations(p_owner,r.plan_id,r.plan_revision)) end
  ||business_action_choice_projection(p_owner,r.plan_id,r.plan_revision)||business_action_review_projection(p_owner,r.id)
 from business_reality_results r where r.user_id=p_owner and (p_case is null or r.case_id=p_case)
$$;

revoke all on function public.business_action_target(jsonb),public.business_action_choice_input(jsonb,boolean),public.business_action_review_input(jsonb),public.business_action_choice_save(uuid,uuid,integer,jsonb,boolean),public.business_action_choice_projection(uuid,uuid,integer),public.business_action_review_projection(uuid,uuid),public.business_action_choice_context(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_action_choice_context(uuid,text,jsonb) to service_role;
commit;
