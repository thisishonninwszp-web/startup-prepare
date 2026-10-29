begin;
create table public.business_job_settings(
 user_id uuid primary key references auth.users(id),revision integer not null default 0,
 payload jsonb not null default '{"enabled":false,"prepareOnOpen":false,"schedule":"07:00","httpBudget":12,"aiBudget":1,"sources":[],"excluded":[],"autoAI":false,"policyVersion":"official-rakuten-scalars-v1"}',
 consent_version uuid,consent_revoked_at timestamptz,updated_at timestamptz not null default clock_timestamp());
create table public.business_job_setting_receipts(user_id uuid not null references auth.users(id),request_id uuid not null,input jsonb not null,result jsonb not null,primary key(user_id,request_id));
create table public.business_job_candidates(user_id uuid not null references auth.users(id),identity text not null,item_code text not null,payload jsonb not null,discovered_at timestamptz not null default clock_timestamp(),primary key(user_id,identity,item_code));
create table public.business_job_source_cursors(user_id uuid not null references auth.users(id),source_key text not null,next_page integer not null check(next_page>0),coverage text not null,captured_at timestamptz not null,primary key(user_id,source_key));
create table public.business_job_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),local_date date not null,
 status text not null default 'running' check(status in('running','materials_ready','completed','failed','unknown')),
 trigger text not null check(trigger in('manual','cron','open')),settings_revision integer not null,settings jsonb not null,parent_consent_version uuid,
 lease_token uuid not null default gen_random_uuid(),lease_until timestamptz not null default clock_timestamp()+interval '15 minutes',
 candidate jsonb,rule_version text,selection_reason text,case_id uuid,material_request uuid not null default gen_random_uuid(),material_hash text,
 material_status text not null default 'pending',report_status text not null default 'pending',report_request uuid not null default gen_random_uuid(),child_consent_id uuid,publication_base uuid,
 result jsonb,message text,created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 unique(user_id,local_date),unique(user_id,id),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_job_attempts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,run_id uuid not null,request_id uuid not null,
 kind text not null check(kind in('http','ai')),stage text not null,status text not null default 'pending' check(status in('pending','completed','failed','unknown')),
 usage jsonb,operation_reference text,receipt jsonb,created_at timestamptz not null default clock_timestamp(),settled_at timestamptz,
 unique(user_id,request_id),foreign key(user_id,run_id) references business_job_runs(user_id,id));
create table public.business_job_child_consents(consent_id uuid primary key references business_ai_consents(id),user_id uuid not null,run_id uuid not null,parent_version uuid not null,settings_revision integer not null,foreign key(user_id,run_id) references business_job_runs(user_id,id));
create function public.business_job_settings_dto(s business_job_settings) returns jsonb language sql stable as $$select s.payload||jsonb_build_object('revision',s.revision,'consentVersion',s.consent_version,'consentRevokedAt',s.consent_revoked_at)$$;
create function public.business_job_run_dto(r business_job_runs) returns jsonb language sql stable as $$select jsonb_build_object('runId',r.id,'leaseToken',r.lease_token,'localDate',r.local_date,'status',r.status,'settings',r.settings,'caseId',r.case_id,'candidate',r.candidate,'ruleVersion',r.rule_version,'message',r.message,'materialStatus',r.material_status,'reportStatus',r.report_status,'reportRequestId',r.report_request)$$;
-- D may replace this function with an identity-link aware exclusion set.
create function public.business_excluded_merchants(p_user_id uuid) returns text[] language sql stable security definer set search_path=public,pg_temp as $$select coalesce(array_agg(m.platform||':'||m.platform_shop_id),array[]::text[]) from business_daily_cases c join business_merchants m on m.id=c.merchant_id where c.user_id=p_user_id$$;
create function public.business_job_assert(p_user_id uuid,p_input jsonb,p_ai boolean default false) returns business_job_runs language plpgsql security definer set search_path=public,pg_temp as $$declare r business_job_runs;s business_job_settings;begin
 select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid for update;
 if not found then raise exception 'run owner unavailable' using errcode='42501';end if;
 if r.status<>'running' or r.lease_token is distinct from (p_input->>'leaseToken')::uuid or r.lease_until<=clock_timestamp() then raise exception 'job lease unavailable';end if;
 select * into s from business_job_settings where user_id=p_user_id;
 if s.revision<>r.settings_revision or (s.payload->>'enabled')::boolean is distinct from true then raise exception 'job settings changed or paused';end if;
 if p_ai and ((s.payload->>'autoAI')::boolean is distinct from true or s.consent_revoked_at is not null or s.consent_version is distinct from r.parent_consent_version) then raise exception 'automatic consent revoked';end if;
 return r;
end$$;
-- Wrap the existing B API without changing its implementation. Derived consents are
-- checked even when a caller uses B's public verify/finish entry point directly.
alter function public.business_report_command(uuid,text,jsonb) rename to business_report_command_v120;
revoke all on function public.business_report_command_v120(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.business_report_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare link business_job_child_consents;r business_job_runs;v_consent uuid;begin
 perform business_service(p_user_id);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));
 if p_operation in('verify','finish','start') then
  if p_operation='start' then v_consent=(p_input->>'consentId')::uuid;else select consent_id into v_consent from business_report_requests where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;end if;
  select * into link from business_job_child_consents where user_id=p_user_id and consent_id=v_consent;
  if found then
   select * into r from business_job_runs where id=link.run_id and user_id=p_user_id;
   perform business_job_assert(p_user_id,jsonb_build_object('runId',r.id,'leaseToken',r.lease_token),true);
   if p_operation='finish' and current_setting('business.job_finish',true) is distinct from r.id::text then raise exception 'automatic report requires atomic job finalization';end if;
  end if;
 end if;
 return business_report_command_v120(p_user_id,p_operation,p_input);
end$$;
create function public.business_job_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s business_job_settings;r business_job_runs;receipt business_job_setting_receipts;a business_job_attempts;c business_daily_cases;v jsonb;v_payload jsonb;v_candidate jsonb;item jsonb;v_identity text;v_case uuid;v_count integer;v_revision integer;v_consent jsonb;v_start jsonb;v_manifest jsonb;v_report jsonb;v_snapshots jsonb;v_comparisons jsonb;v_request uuid;v_budget integer;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>250000 then raise exception 'invalid job input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,721));
 insert into business_job_settings(user_id) values(p_user_id) on conflict do nothing;select * into s from business_job_settings where user_id=p_user_id for update;
 if p_operation='settings' then
  select * into receipt from business_job_setting_receipts where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if receipt.input<>p_input then raise exception 'settings request conflict';end if;return receipt.result;end if;
  if s.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'settings revision changed';end if;
  if jsonb_typeof(p_input->'httpBudget') is distinct from 'number' or jsonb_typeof(p_input->'aiBudget') is distinct from 'number' then raise exception 'integer HTTP and AI budgets required';end if;
  if (p_input->>'httpBudget')::numeric%1<>0 or (p_input->>'aiBudget')::numeric%1<>0 or (p_input->>'httpBudget')::numeric not between 1 and 1000 or (p_input->>'aiBudget')::numeric not between 0 and 10 then raise exception 'integer request budgets outside bounds';end if;
  if coalesce(p_input->>'schedule','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p_input->>'httpBudget')::integer not between 1 and 1000 or (p_input->>'aiBudget')::integer not between 0 and 10 or jsonb_typeof(p_input->'sources') is distinct from 'array' or jsonb_typeof(p_input->'excluded') is distinct from 'array' or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or jsonb_typeof(p_input->'prepareOnOpen') is distinct from 'boolean' or jsonb_typeof(p_input->'autoAI') is distinct from 'boolean' then raise exception 'invalid job settings';end if;
  for item in select value from jsonb_array_elements(p_input->'sources') loop
   if coalesce(item->>'mode','') not in('search','ranking') or jsonb_typeof(item->'category') is distinct from 'string' or jsonb_typeof(item->'priceBand') is distinct from 'string' or jsonb_typeof(item->'businessModel') is distinct from 'string' or length(btrim(coalesce(item->>'category',''))) not between 1 and 120 or length(btrim(coalesce(item->>'priceBand',''))) not between 1 and 120 or length(btrim(coalesce(item->>'businessModel',''))) not between 1 and 120 or (item->>'mode'='search' and (jsonb_typeof(item->'keyword') is distinct from 'string' or length(btrim(coalesce(item->>'keyword',''))) not between 1 and 128)) or (item->>'mode'='ranking' and item ? 'keyword') or (item ? 'genreId' and (jsonb_typeof(item->'genreId') is distinct from 'string' or item->>'genreId' !~ '^[0-9]+$')) then raise exception 'invalid official source configuration';end if;
   if item-array['mode','keyword','genreId','category','priceBand','businessModel']<>'{}'::jsonb then raise exception 'unsupported source configuration';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(p_input->'excluded') x where x.value !~ '^rakuten:[a-zA-Z0-9_-]+$') then raise exception 'invalid exclusion';end if;
  if (p_input->>'autoAI')::boolean and (p_input->>'policyVersion' is distinct from 'official-rakuten-scalars-v1' or ((s.payload->>'autoAI')::boolean is distinct from true and p_input->'autoAIConfirmed' is distinct from 'true'::jsonb)) then raise exception 'explicit automatic AI policy confirmation required';end if;
  v_payload=jsonb_build_object('enabled',(p_input->>'enabled')::boolean,'prepareOnOpen',(p_input->>'prepareOnOpen')::boolean,'schedule',p_input->>'schedule','httpBudget',(p_input->>'httpBudget')::integer,'aiBudget',(p_input->>'aiBudget')::integer,'sources',p_input->'sources','excluded',p_input->'excluded','autoAI',(p_input->>'autoAI')::boolean,'policyVersion','official-rakuten-scalars-v1');
  if s.payload->'sources' is distinct from p_input->'sources' then delete from business_job_candidates where user_id=p_user_id;delete from business_job_source_cursors where user_id=p_user_id;end if;
  update business_job_settings set revision=revision+1,payload=v_payload,consent_version=case when (p_input->>'autoAI')::boolean then case when (s.payload->>'autoAI')::boolean then s.consent_version else gen_random_uuid() end else s.consent_version end,consent_revoked_at=case when (p_input->>'autoAI')::boolean then null else coalesce(s.consent_revoked_at,clock_timestamp()) end,updated_at=clock_timestamp() where user_id=p_user_id returning * into s;
  v=business_job_settings_dto(s);insert into business_job_setting_receipts values(p_user_id,(p_input->>'requestId')::uuid,p_input,v);return v;
 elsif p_operation='state' then
  select * into r from business_job_runs where user_id=p_user_id and local_date=business_today();
  return jsonb_build_object('available',true,'settings',business_job_settings_dto(s),'run',case when r.id is null then null else business_job_run_dto(r) end,'attempts',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from business_job_attempts x where x.user_id=p_user_id and x.run_id=r.id),'[]'::jsonb),'sourceCursors',coalesce((select jsonb_object_agg(source_key,next_page) from business_job_source_cursors where user_id=p_user_id),'{}'::jsonb),'candidates',coalesce((select jsonb_agg(payload order by identity,item_code) from business_job_candidates where user_id=p_user_id),'[]'::jsonb),'history',jsonb_build_object('excluded',s.payload->'excluded','priorMain',to_jsonb(business_excluded_merchants(p_user_id)),'recent',coalesce((select jsonb_agg(candidate order by local_date desc) from business_job_runs where user_id=p_user_id and candidate is not null),'[]'::jsonb)));
 elsif p_operation='history' then
  select coalesce(jsonb_agg(business_job_run_dto(x)||jsonb_build_object('attemptSummary',jsonb_build_object('http',(select count(*) from business_job_attempts ba where ba.run_id=x.id and ba.kind='http'),'ai',(select count(*) from business_job_attempts ba where ba.run_id=x.id and ba.kind='ai'))) order by local_date desc),'[]'::jsonb) into v from (select * from business_job_runs where user_id=p_user_id and (p_input->>'before' is null or local_date<(p_input->>'before')::date) order by local_date desc limit 21) x;
  return jsonb_build_object('items',case when jsonb_array_length(v)>20 then v-20 else v end,'nextCursor',case when jsonb_array_length(v)>20 then v->19->>'localDate' else null end);
 elsif p_operation='claim' then
  select * into r from business_job_runs where user_id=p_user_id and local_date=business_today() for update;
  if found then
   if r.status<>'running' then return coalesce(r.result,business_job_run_dto(r));end if;
   if r.lease_until<=clock_timestamp() then update business_job_runs set status='unknown',message='Worker lease expired; usage or result may be unknown',finished_at=clock_timestamp() where id=r.id returning * into r;update business_job_attempts set status='unknown' where run_id=r.id and status='pending';return business_job_run_dto(r);end if;
   return jsonb_build_object('status','busy','runId',r.id);
  end if;
  if (s.payload->>'enabled')::boolean is distinct from true then return jsonb_build_object('status','disabled');end if;
  if p_input->>'trigger'='open' and (s.payload->>'prepareOnOpen')::boolean is distinct from true then return jsonb_build_object('status','disabled');end if;
  if p_input->>'trigger'='cron' and to_char(clock_timestamp() at time zone 'Asia/Tokyo','HH24:MI')<s.payload->>'schedule' then return jsonb_build_object('status','not_due');end if;
  select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today();
  insert into business_job_runs(user_id,local_date,trigger,settings_revision,settings,parent_consent_version,case_id,material_status) values(p_user_id,business_today(),p_input->>'trigger',s.revision,s.payload,s.consent_version,c.id,case when c.state='ready' then 'ready' else 'pending' end) returning * into r;return business_job_run_dto(r);
 end if;
 -- Successful terminal receipts precede live lease/settings checks.
 if p_operation in('finish','complete') then select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid;if found and r.lease_token=(p_input->>'leaseToken')::uuid and r.result is not null then return r.result;end if;end if;
 if p_operation='settle' then
  select * into a from business_job_attempts where user_id=p_user_id and run_id=(p_input->>'runId')::uuid and id=(p_input->>'ticketId')::uuid;
  if found and a.receipt is not null and exists(select 1 from business_job_runs where id=a.run_id and user_id=p_user_id and lease_token=(p_input->>'leaseToken')::uuid) then if a.receipt<>p_input-array['runId','leaseToken','settings','statusUnused'] then raise exception 'attempt receipt conflict';end if;return to_jsonb(a);end if;
 end if;
 if p_operation='fail' then
  select * into r from business_job_runs where user_id=p_user_id and id=(p_input->>'runId')::uuid for update;
  if not found or r.lease_token is distinct from (p_input->>'leaseToken')::uuid then raise exception 'run owner unavailable';end if;
  if r.status<>'running' then return coalesce(r.result,business_job_run_dto(r));end if;
  update business_job_attempts set status='unknown',settled_at=clock_timestamp() where run_id=r.id and status='pending';
  update business_job_runs set status=case when exists(select 1 from business_job_attempts where run_id=r.id and kind='ai') then 'unknown' else 'failed' end,material_status=case when material_status='ready' then material_status else 'failed' end,report_status=case when exists(select 1 from business_job_attempts where run_id=r.id and kind='ai') then 'unknown' else 'not_started' end,message=left(coalesce(p_input->>'message','worker failed'),2000),finished_at=clock_timestamp() where id=r.id returning * into r;
  if r.case_id is not null and r.material_status<>'ready' and exists(select 1 from business_case_preparations where user_id=p_user_id and request_id=r.material_request) then perform business_fail_preparation(p_user_id,r.material_request,r.material_hash);end if;return business_job_run_dto(r);
 end if;
 r=business_job_assert(p_user_id,p_input,p_operation in('verify_ai','finish'));
 if p_operation='check' then return business_job_run_dto(r);
 elsif p_operation='enqueue' then
  for v_candidate in select value from jsonb_array_elements(p_input->'candidates') loop
   if v_candidate->'merchant'->>'platform' is distinct from 'rakuten' or v_candidate->'merchant'->>'identityScope' is distinct from 'platform_shop_id' or split_part(v_candidate->>'itemCode',':',1) is distinct from v_candidate->'merchant'->>'platformShopId' or coalesce(v_candidate->>'coverage','')='' or (v_candidate->>'sourcePage')::integer<1 or v_candidate->>'capturedAt' is null then raise exception 'invalid official candidate';end if;
   v_identity='rakuten:'||(v_candidate->'merchant'->>'platformShopId');insert into business_job_candidates(user_id,identity,item_code,payload) values(p_user_id,v_identity,v_candidate->>'itemCode',v_candidate) on conflict(user_id,identity,item_code) do update set payload=excluded.payload,discovered_at=clock_timestamp();
  end loop;
  if p_input ? 'sourceCursor' then insert into business_job_source_cursors values(p_user_id,p_input->'sourceCursor'->>'sourceKey',(p_input->'sourceCursor'->>'nextPage')::integer,p_input->'sourceCursor'->>'coverage',(p_input->'sourceCursor'->>'capturedAt')::timestamptz) on conflict(user_id,source_key) do update set next_page=excluded.next_page,coverage=excluded.coverage,captured_at=excluded.captured_at;end if;return '{}'::jsonb;
 elsif p_operation='reserve' then
  if r.case_id is not null then return business_job_run_dto(r);end if;
  if r.local_date<>business_today() then raise exception 'run date changed before slot reservation';end if;
  v_candidate=p_input->'candidate';v_identity='rakuten:'||(v_candidate->'merchant'->>'platformShopId');
  if not exists(select 1 from business_job_candidates where user_id=p_user_id and identity=v_identity and item_code=v_candidate->>'itemCode' and payload=v_candidate) then raise exception 'candidate not queued';end if;
  if v_identity=any(business_excluded_merchants(p_user_id)) or s.payload->'excluded' ? v_identity then raise exception 'main merchant already used or excluded';end if;
  v=business_prepare_case(p_user_id,jsonb_build_object('requestId',r.material_request,'userInputHash',md5(v_candidate::text),'merchant',v_candidate->'merchant','selectionReason',p_input->>'reason'));
  update business_job_runs set case_id=(v->'dailyCase'->>'id')::uuid,candidate=v_candidate,rule_version=p_input->>'ruleVersion',selection_reason=p_input->>'reason',material_hash=md5(v_candidate::text) where id=r.id returning * into r;return business_job_run_dto(r);
 elsif p_operation='ticket' then
  select * into a from business_job_attempts where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then raise exception 'request ticket already issued; outcome may be unknown';end if;
  if p_input->>'kind'='ai' then perform business_job_assert(p_user_id,p_input,true);end if;
  if p_input->>'stage'='inspect' and r.case_id is null then raise exception 'reserve daily slot before inspect HTTP';end if;
  if jsonb_typeof(r.settings->(case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end)) is distinct from 'number' then raise exception 'valid frozen numeric request budget required';end if;
  if (r.settings->>(case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end))::numeric%1<>0 then raise exception 'integer frozen request budget required';end if;
  select count(*) into v_count from business_job_attempts where user_id=p_user_id and run_id=r.id and kind=p_input->>'kind';v_budget=(r.settings->>case when p_input->>'kind'='ai' then 'aiBudget' else 'httpBudget' end)::integer;
  if v_budget is null or (p_input->>'kind'='http' and v_budget not between 1 and 1000) or (p_input->>'kind'='ai' and v_budget not between 0 and 10) then raise exception 'valid frozen request budget required';end if;
  if v_count>=v_budget then raise exception 'daily request budget exhausted';end if;
  if p_input->>'kind'='http' and p_input->>'stage'='discovery' and v_count>=v_budget-1 then raise exception 'HTTP discovery budget exhausted; one request reserved for shop inspection';end if;
  if p_input->>'kind'='ai' and v_count>0 then raise exception 'AI result may be unknown; no automatic retry';end if;
  insert into business_job_attempts(user_id,run_id,request_id,kind,stage,operation_reference) values(p_user_id,r.id,(p_input->>'requestId')::uuid,p_input->>'kind',p_input->>'stage',case when p_input->>'kind'='ai' then 'business_teardown_report:'||r.report_request::text else null end) returning * into a;return to_jsonb(a);
 elsif p_operation='settle' then
  select * into a from business_job_attempts where user_id=p_user_id and run_id=r.id and id=(p_input->>'ticketId')::uuid for update;
  if not found then raise exception 'ticket unavailable';end if;
  if a.receipt is not null then if a.receipt<>p_input-array['runId','leaseToken','settings','statusUnused'] then raise exception 'attempt receipt conflict';end if;return to_jsonb(a);end if;
  if a.kind='ai' then perform business_job_assert(p_user_id,p_input,true);end if;
  update business_job_attempts set status=p_input->>'status',usage=nullif(p_input->'usage','null'::jsonb),receipt=p_input-array['runId','leaseToken','settings','statusUnused'],settled_at=clock_timestamp() where id=a.id returning * into a;return to_jsonb(a);
 elsif p_operation='material' then
  if r.material_status='ready' then return business_job_run_dto(r);end if;
  if r.case_id is null or r.candidate is null then raise exception 'reserved official candidate required';end if;
  if p_input->'merchant' is distinct from r.candidate->'merchant' or p_input->'snapshot'->>'itemId' is distinct from r.candidate->>'itemCode' or p_input->'snapshot'->>'origin' is distinct from 'official_api' or p_input->'snapshot'->>'capturedText' is not null or exists(select 1 from jsonb_each(p_input->'snapshot'->'structured') e where jsonb_typeof(e.value) not in('string','number','boolean','null')) then raise exception 'automatic material must be official public scalar fields';end if;
  perform business_save_case_material(p_user_id,jsonb_build_object('requestId',r.material_request,'operation','primary','userInputHash',r.material_hash,'merchant',p_input->'merchant','snapshot',p_input->'snapshot','selectionReason',r.selection_reason));
  update business_job_runs set material_status='ready' where id=r.id returning * into r;return business_job_run_dto(r);
 elsif p_operation='ai_start' then
  if (s.payload->>'autoAI')::boolean is distinct from true then return jsonb_build_object('status','not_permitted');end if;
  perform business_job_assert(p_user_id,p_input,true);
  if r.material_status<>'ready' then raise exception 'material not ready';end if;
  if exists(select 1 from business_report_requests where user_id=p_user_id and request_id=r.report_request) then raise exception 'AI request already started; result may be unknown';end if;
  select * into c from business_daily_cases where user_id=p_user_id and id=r.case_id;
  select coalesce(jsonb_agg(x.snapshot_id order by x.snapshot_id) filter(where x.role in('primary','product')),'[]'::jsonb),coalesce(jsonb_agg(x.snapshot_id order by x.snapshot_id) filter(where x.role='comparison'),'[]'::jsonb) into v_snapshots,v_comparisons from business_case_members x join business_material_snapshots t on t.id=x.snapshot_id and t.user_id=x.user_id where x.user_id=p_user_id and x.case_id=c.id and t.platform='rakuten' and t.origin='official_api' and t.capture_scope='api_fields' and t.captured_text is null and t.erased_at is null;
  if jsonb_array_length(v_snapshots)=0 then raise exception 'no official scalar primary materials';end if;
  select coalesce(max(revision),0) into v_revision from business_case_revisions where user_id=p_user_id and case_id=c.id;
  v=jsonb_build_object('caseId',c.id,'materialRevision',c.revision,'snapshotIds',v_snapshots,'comparisonSnapshotIds',v_comparisons,'publicExcerptDeidentified',true,'requestId',r.report_request);
  v_consent=business_report_command(p_user_id,'consent',v);insert into business_job_child_consents values((v_consent->>'id')::uuid,p_user_id,r.id,r.parent_consent_version,r.settings_revision);
  update business_job_runs set child_consent_id=(v_consent->>'id')::uuid,report_status='started',publication_base=c.published_revision_id where id=r.id;
  v_start=business_report_command(p_user_id,'start',(v-'publicExcerptDeidentified')||jsonb_build_object('consentId',v_consent->>'id','expectedReportRevision',v_revision));return v_start;
 elsif p_operation='verify_ai' then
  if p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;return business_report_command(p_user_id,'verify',p_input->'draftLease');
 elsif p_operation='finish' then
  if p_input->'draftLease'->>'requestId' is distinct from r.report_request::text then raise exception 'report run mismatch';end if;
  if not exists(select 1 from business_job_attempts where user_id=p_user_id and run_id=r.id and kind='ai' and status='completed') then raise exception 'completed AI ticket required before finalization';end if;
  perform set_config('business.job_finish',r.id::text,true);
  v_report=business_report_command(p_user_id,'finish',(p_input->'draftLease')||jsonb_build_object('report',p_input->'report'));
  select * into c from business_daily_cases where user_id=p_user_id and id=r.case_id;
  perform business_report_command(p_user_id,'publish',jsonb_build_object('caseId',c.id,'reportId',v_report->>'id','expectedPublishedReportId',r.publication_base,'requestId',r.report_request));
  v=jsonb_build_object('status','completed','runId',r.id,'caseId',c.id,'reportId',v_report->>'id');
  update business_job_runs set status='completed',report_status='published',result=v,finished_at=clock_timestamp() where id=r.id;return v;
 elsif p_operation='complete' then
  if r.material_status<>'ready' then raise exception 'materials not ready';end if;
  v=jsonb_build_object('status','materials_ready','runId',r.id,'caseId',r.case_id,'message',p_input->>'message');update business_job_runs set status='materials_ready',report_status='not_permitted',message=p_input->>'message',result=v,finished_at=clock_timestamp() where id=r.id;return v;
 end if;
 raise exception 'unknown business job operation';
end$$;
alter table business_job_source_cursors enable row level security;alter table business_job_settings enable row level security;alter table business_job_setting_receipts enable row level security;alter table business_job_candidates enable row level security;alter table business_job_runs enable row level security;alter table business_job_attempts enable row level security;alter table business_job_child_consents enable row level security;
revoke all on business_job_source_cursors,business_job_settings,business_job_setting_receipts,business_job_candidates,business_job_runs,business_job_attempts,business_job_child_consents from public,anon,authenticated,service_role;
grant select on business_job_settings,business_job_runs,business_job_attempts to service_role;
revoke all on function business_job_command(uuid,text,jsonb),business_job_assert(uuid,jsonb,boolean),business_excluded_merchants(uuid),business_report_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function business_job_command(uuid,text,jsonb),business_report_command(uuid,text,jsonb) to service_role;
commit;




