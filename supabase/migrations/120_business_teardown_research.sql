begin;
create table public.business_ai_consents(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,material_revision integer not null,payload jsonb not null,request_id uuid not null,revoked_at timestamptz,consumed_by_request_id uuid,created_at timestamptz not null default clock_timestamp(),unique(user_id,request_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_case_revisions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,revision integer not null,material_revision integer not null,manifest jsonb not null,input_manifest_hash text not null,payload jsonb not null,erased_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(user_id,id),unique(case_id,revision),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_report_requests(user_id uuid not null references auth.users(id),request_id uuid not null,case_id uuid not null,input jsonb not null,input_hash text not null,manifest jsonb not null,consent_id uuid not null references business_ai_consents(id),lease_token uuid not null default gen_random_uuid(),lease_until timestamptz not null default clock_timestamp()+interval '5 minutes',status text not null default 'pending' check(status in ('pending','completed','failed','unknown')),report_id uuid references business_case_revisions(id),primary key(user_id,request_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id));
create table public.business_case_lessons(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,report_id uuid not null,payload jsonb not null,request_id uuid not null,created_at timestamptz not null default clock_timestamp(),unique(user_id,request_id),foreign key(user_id,report_id) references business_case_revisions(user_id,id));
create table public.business_case_action_refs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),case_id uuid not null,report_id uuid not null,kind text not null check(kind in ('observation','experiment')),request_id uuid not null,input jsonb not null,input_hash text not null,preview_token uuid not null default gen_random_uuid(),target_id uuid,source_invalidated_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(user_id,request_id),foreign key(user_id,report_id) references business_case_revisions(user_id,id));
create table public.business_report_publications(user_id uuid not null references auth.users(id),request_id uuid not null,input jsonb not null,report_id uuid not null references business_case_revisions(id),primary key(user_id,request_id));
alter table business_material_snapshots add column erased_at timestamptz;
create function public.business_report_dto(r business_case_revisions) returns jsonb language sql stable as $$select r.payload||jsonb_build_object('id',r.id,'caseId',r.case_id,'revision',r.revision,'materialRevision',r.material_revision,'inputManifestHash',r.input_manifest_hash,'createdAt',r.created_at,'erasedAt',r.erased_at)$$;
create function public.business_consent_dto(r business_ai_consents) returns jsonb language sql stable as $$select r.payload||jsonb_build_object('id',r.id,'caseId',r.case_id,'materialRevision',r.material_revision,'createdAt',r.created_at,'revokedAt',r.revoked_at,'consumedByRequestId',r.consumed_by_request_id,'consumedRequestStatus',(select status from business_report_requests q where q.user_id=r.user_id and q.request_id=r.consumed_by_request_id),'consumedExpectedReportRevision',(select (input->>'expectedReportRevision')::integer from business_report_requests q where q.user_id=r.user_id and q.request_id=r.consumed_by_request_id))$$;
create function public.business_selected_manifest(p_user_id uuid,p_case uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;n integer;selected jsonb;begin
 perform business_service(p_user_id);
 if jsonb_typeof(p_input->'snapshotIds') is distinct from 'array' or jsonb_typeof(p_input->'comparisonSnapshotIds') is distinct from 'array' or jsonb_array_length(p_input->'snapshotIds')=0 then raise exception 'select sources explicitly';end if;
 selected=(p_input->'snapshotIds')||(p_input->'comparisonSnapshotIds');n=jsonb_array_length(selected);
 if n>30 or (select count(distinct value) from jsonb_array_elements_text(selected))<>n then raise exception 'invalid source selection';end if;
 select jsonb_agg(jsonb_build_object('id',s.id,'merchantId',s.merchant_id,'platform',s.platform,'itemId',s.item_id,'origin',s.origin,'sourceUrl',s.source_url,'capturedAt',s.captured_at,'publishedAt',s.published_at,'captureScope',s.capture_scope,'capturedText',s.captured_text,'quantities',s.quantities,'structured',s.structured,'coverage',s.coverage,'contentHash',s.content_hash,'role',m.role) order by s.id) into result
 from business_case_members m join business_material_snapshots s on s.id=m.snapshot_id and s.user_id=m.user_id where m.user_id=p_user_id and m.case_id=p_case and s.erased_at is null and ((m.role in ('primary','product') and p_input->'snapshotIds' ? s.id::text) or (m.role='comparison' and p_input->'comparisonSnapshotIds' ? s.id::text));
 if result is null or jsonb_array_length(result)<>n then raise exception 'source unavailable or role mismatch';end if;return result;
end$$;
create function public.business_report_command(p_user_id uuid,p_operation text,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;con business_ai_consents;r business_case_revisions;req business_report_requests;l business_case_lessons;ref business_case_action_refs;pub business_report_publications;v_case uuid;v_id uuid;v_manifest jsonb;v_hash text;v_result jsonb;v_revision integer;v_target uuid;v_key text;v_count integer;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>200000 then raise exception 'invalid report input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));
 if p_operation='revoke' then update business_ai_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user_id and id=(p_input->>'consentId')::uuid; if not found then raise exception 'consent unavailable';end if;return '{}'::jsonb;end if;
 if p_operation in ('verify','finish','fail') then
  select * into req from business_report_requests where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid for update;
  if not found or req.lease_token is distinct from (p_input->>'leaseToken')::uuid or req.input_hash is distinct from p_input->>'inputManifestHash' then raise exception 'lease unavailable';end if;
  if p_operation='finish' and req.status='completed' then select * into r from business_case_revisions where id=req.report_id;return business_report_dto(r);end if;
  if p_operation='fail' then update business_report_requests set status='failed' where user_id=p_user_id and request_id=req.request_id and status='pending';return '{}'::jsonb;end if;
  v_case=req.case_id;
 else v_case=(p_input->>'caseId')::uuid;end if;
 select * into c from business_daily_cases where user_id=p_user_id and id=v_case for update;if not found then raise exception 'case unavailable' using errcode='42501';end if;
 if p_operation='state' then
  return jsonb_build_object('available',true,'publishedReportId',c.published_revision_id,'reports',coalesce((select jsonb_agg(business_report_dto(x) order by revision desc) from business_case_revisions x where x.user_id=p_user_id and x.case_id=c.id),'[]'::jsonb),'consents',coalesce((select jsonb_agg(business_consent_dto(x) order by created_at desc) from business_ai_consents x where x.user_id=p_user_id and x.case_id=c.id),'[]'::jsonb),'lessons',coalesce((select jsonb_agg(x.payload||jsonb_build_object('id',x.id,'createdAt',x.created_at)) from business_case_lessons x where x.user_id=p_user_id and x.case_id=c.id),'[]'::jsonb));
 end if;
 if p_operation='consent' then
  select * into con from business_ai_consents where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if con.payload<>p_input then raise exception 'request payload conflict';end if;return business_consent_dto(con);end if;
  if c.revision is distinct from (p_input->>'materialRevision')::integer then raise exception 'material revision changed';end if;
  v_manifest=business_selected_manifest(p_user_id,c.id,p_input);
  if (p_input->>'publicExcerptDeidentified')::boolean is distinct from true then raise exception 'public deidentified source confirmation required';end if;
  insert into business_ai_consents(user_id,case_id,material_revision,payload,request_id) values(p_user_id,c.id,c.revision,p_input,(p_input->>'requestId')::uuid) returning * into con;return business_consent_dto(con);
 end if;
 if p_operation='start' then
  select * into req from business_report_requests where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid for update;
  if found then
   if req.input<>p_input then raise exception 'request payload conflict';end if;
   if req.status='completed' then select * into r from business_case_revisions where id=req.report_id;return jsonb_build_object('status','completed','report',business_report_dto(r));end if;
   if req.status='pending' and req.lease_until>clock_timestamp() then return jsonb_build_object('status','busy');end if;
   update business_report_requests set status=case when status='pending' then 'unknown' else status end where user_id=p_user_id and request_id=req.request_id;return jsonb_build_object('status','unknown');
  end if;
  if c.revision is distinct from (p_input->>'materialRevision')::integer then raise exception 'material revision changed';end if;
  select coalesce(max(revision),0) into v_revision from business_case_revisions where case_id=c.id;
  if v_revision is distinct from (p_input->>'expectedReportRevision')::integer then raise exception 'report revision changed';end if;
  select * into con from business_ai_consents where user_id=p_user_id and id=(p_input->>'consentId')::uuid and case_id=c.id and revoked_at is null and material_revision=c.revision;
  if not found or con.payload->'snapshotIds' is distinct from p_input->'snapshotIds' or con.payload->'comparisonSnapshotIds' is distinct from p_input->'comparisonSnapshotIds' then raise exception 'consent unavailable or selection changed';end if;
  if con.consumed_by_request_id is not null then raise exception 'consent already consumed; explicitly grant a new generation';end if;
  v_manifest=business_selected_manifest(p_user_id,c.id,p_input);v_hash=md5(jsonb_build_object('input',p_input,'sources',v_manifest)::text);
  insert into business_report_requests(user_id,request_id,case_id,input,input_hash,manifest,consent_id) values(p_user_id,(p_input->>'requestId')::uuid,c.id,p_input,v_hash,v_manifest,con.id) returning * into req;
  update business_ai_consents set consumed_by_request_id=req.request_id where id=con.id returning * into con;
  return jsonb_build_object('status','ready','lease',jsonb_build_object('requestId',req.request_id,'leaseToken',req.lease_token,'caseId',c.id,'inputManifestHash',v_hash,'materialRevision',c.revision),'sources',v_manifest,'consent',business_consent_dto(con));
 end if;
 if p_operation in ('verify','finish') then
  if req.status<>'pending' or req.lease_until<=clock_timestamp() then raise exception 'lease expired; result or usage unknown; confirm a new request';end if;
  select * into con from business_ai_consents where user_id=p_user_id and id=req.consent_id and revoked_at is null and material_revision=c.revision and consumed_by_request_id=req.request_id;
  if not found or c.revision is distinct from (req.input->>'materialRevision')::integer or business_selected_manifest(p_user_id,c.id,req.input) is distinct from req.manifest then raise exception 'sources or consent changed';end if;
  if p_operation='verify' then return jsonb_build_object('sources',req.manifest,'consent',business_consent_dto(con));end if;
  select coalesce(max(revision),0) into v_revision from business_case_revisions where case_id=c.id;
  if v_revision is distinct from (req.input->>'expectedReportRevision')::integer then raise exception 'report revision changed';end if;
  if jsonb_typeof(p_input->'report'->'sections') is distinct from 'array' or jsonb_array_length(p_input->'report'->'sections')<>12 then raise exception 'twelve sections required';end if;
  foreach v_key in array array['offering','trigger','buyers','volume','journey','value','operations','economics','comparison','failure_conditions','transfer','experiment'] loop select count(*) into v_count from jsonb_array_elements(p_input->'report'->'sections') s where s->>'key'=v_key;if v_count<>1 then raise exception 'section keys invalid';end if;end loop;
  insert into business_case_revisions(user_id,case_id,revision,material_revision,manifest,input_manifest_hash,payload) values(p_user_id,c.id,v_revision+1,c.revision,req.manifest,req.input_hash,(p_input->'report')||jsonb_build_object('primarySnapshotIds',req.input->'snapshotIds','comparisonSnapshotIds',req.input->'comparisonSnapshotIds','authorship','ai_draft')) returning * into r;
  update business_report_requests set status='completed',report_id=r.id where user_id=p_user_id and request_id=req.request_id;return business_report_dto(r);
 end if;
 select * into r from business_case_revisions where user_id=p_user_id and case_id=c.id and id=(p_input->>'reportId')::uuid;
 if not found or r.erased_at is not null then raise exception 'report unavailable';end if;
 if p_operation='publish' then
  select * into pub from business_report_publications where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if pub.input<>p_input then raise exception 'request payload conflict';end if;return business_report_dto(r);end if;
  if c.published_revision_id is distinct from (p_input->>'expectedPublishedReportId')::uuid or c.revision<>r.material_revision then raise exception 'publication or material changed';end if;
  update business_daily_cases set published_revision_id=r.id where id=c.id;insert into business_report_publications values(p_user_id,(p_input->>'requestId')::uuid,p_input,r.id);return business_report_dto(r);
 elsif p_operation='lesson' then
  select * into l from business_case_lessons where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if l.payload<>p_input then raise exception 'request payload conflict';end if;return l.payload||jsonb_build_object('id',l.id,'createdAt',l.created_at);end if;
  foreach v_key in array array['method','conditions','unknowns'] loop if length(btrim(coalesce(p_input->>v_key,''))) not between 1 and 4000 then raise exception 'user method, conditions and unknowns required';end if;end loop;
  insert into business_case_lessons(user_id,case_id,report_id,payload,request_id) values(p_user_id,c.id,r.id,p_input,(p_input->>'requestId')::uuid) returning * into l;return l.payload||jsonb_build_object('id',l.id,'createdAt',l.created_at);
 elsif p_operation='preview' then
  if c.revision<>r.material_revision then raise exception 'material changed';end if;
  if p_input->>'kind'='observation' then if length(btrim(coalesce(p_input->>'takeaway',''))) not between 1 and 12000 then raise exception 'write your observation';end if;
  elsif p_input->>'kind'='experiment' then
   if to_regprocedure('public.save_idea_experiment_version(uuid,jsonb)') is null then raise exception 'experiment schema unavailable';end if;
   execute 'select id from public.ideas where user_id=$1 and id=$2' into v_target using p_user_id,(p_input->'experiment'->>'ideaId')::uuid;if v_target is null then raise exception 'target idea unavailable';end if;
  else raise exception 'invalid action kind';end if;
  select * into ref from business_case_action_refs where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid;
  if found then if ref.input<>p_input then raise exception 'request payload conflict';end if;
  else insert into business_case_action_refs(user_id,case_id,report_id,kind,request_id,input,input_hash) values(p_user_id,c.id,r.id,p_input->>'kind',(p_input->>'requestId')::uuid,p_input,md5(p_input::text)) returning * into ref;end if;
  return ref.input||jsonb_build_object('token',ref.preview_token,'inputHash',ref.input_hash,'localCaseLink','/business-lab/'||c.id::text);
 elsif p_operation='confirm' then
  select * into ref from business_case_action_refs where user_id=p_user_id and request_id=(p_input->>'requestId')::uuid for update;
  if not found or ref.preview_token is distinct from (p_input->>'token')::uuid or ref.input_hash is distinct from p_input->>'inputHash' or ref.input is distinct from p_input-array['token','inputHash','localCaseLink'] then raise exception 'preview input changed';end if;
  if ref.target_id is not null then return jsonb_build_object('targetId',ref.target_id,'kind',ref.kind);end if;
  if c.revision<>r.material_revision or ref.source_invalidated_at is not null then raise exception 'preview stale';end if;
  if ref.kind='observation' then execute 'insert into public.observations(user_id,raw_text,tags) values($1,$2,$3) returning id' into v_target using p_user_id,ref.input->>'takeaway'||E'\n出处：/business-lab/'||c.id::text,array[]::text[];
  else execute 'select public.save_idea_experiment_version($1,$2)' into v_result using p_user_id,ref.input->'experiment';v_target=(v_result->>'id')::uuid;end if;
  if v_target is null then raise exception 'action target not saved';end if;update business_case_action_refs set target_id=v_target where id=ref.id;return jsonb_build_object('targetId',v_target,'kind',ref.kind);
 end if;
 raise exception 'invalid report operation';
end$$;
create function public.business_erase_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if current_setting('business.erase_case',true) is distinct from old.user_id::text or coalesce(auth.role(),'')<>'service_role' or tg_op<>'UPDATE' or old.erased_at is not null or new.erased_at is null then raise exception 'business history immutable';end if;
 if tg_table_name='business_material_snapshots' then
  if (to_jsonb(new)-array['captured_text','quantities','structured','coverage','content_hash','erased_at']) is distinct from (to_jsonb(old)-array['captured_text','quantities','structured','coverage','content_hash','erased_at']) or new.captured_text is not null or new.structured<>'{}'::jsonb or new.quantities<>'[]'::jsonb or new.coverage<>'来源已清除' then raise exception 'invalid erase';end if;
 else if (to_jsonb(new)-array['payload','manifest','erased_at']) is distinct from (to_jsonb(old)-array['payload','manifest','erased_at']) or new.manifest<>'[]'::jsonb or new.payload<>'{"sections":[],"authorship":"ai_draft","primarySnapshotIds":[],"comparisonSnapshotIds":[],"model":null,"promptVersion":null}'::jsonb then raise exception 'invalid report erase';end if;end if;return new;
end$$;
drop trigger business_snapshot_immutable on business_material_snapshots;
create trigger business_snapshot_immutable before update or delete on business_material_snapshots for each row execute function business_erase_guard();
create trigger business_report_immutable before update or delete on business_case_revisions for each row execute function business_erase_guard();
create function public.business_erase_content(p_user_id uuid,p_case_id uuid,p_snapshot_id uuid default null,p_report_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c business_daily_cases;v_cases uuid[];begin
 perform business_service(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,720));select * into c from business_daily_cases where id=p_case_id and user_id=p_user_id for update;if not found then raise exception 'case unavailable' using errcode='42501';end if;
 if (p_snapshot_id is null)=(p_report_id is null) then raise exception 'choose one source or report';end if;
 perform set_config('business.erase_case',p_user_id::text,true);
 if p_snapshot_id is not null then
  if not exists(select 1 from business_case_members where user_id=p_user_id and case_id=c.id and snapshot_id=p_snapshot_id) then raise exception 'source unavailable';end if;
  select array_agg(distinct case_id) into v_cases from business_case_members where user_id=p_user_id and snapshot_id=p_snapshot_id;
  update business_material_snapshots set captured_text=null,structured='{}',quantities='[]',coverage='来源已清除',content_hash='erased:'||id::text,erased_at=clock_timestamp() where user_id=p_user_id and id=p_snapshot_id and erased_at is null;
  update business_case_revisions set payload='{"sections":[],"authorship":"ai_draft","primarySnapshotIds":[],"comparisonSnapshotIds":[],"model":null,"promptVersion":null}',manifest='[]',erased_at=clock_timestamp() where user_id=p_user_id and erased_at is null and exists(select 1 from jsonb_array_elements(manifest) s where s->>'id'=p_snapshot_id::text);
  update business_report_requests set manifest='[]',status=case when status='pending' then 'unknown' else status end where user_id=p_user_id and case_id=any(v_cases);
  update business_case_requests set input='{"erased":true}' where user_id=p_user_id and result->>'id' in(select unnest(v_cases)::text);
  update business_ai_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user_id and case_id=any(v_cases);
  update business_daily_cases set revision=revision+1 where user_id=p_user_id and id=any(v_cases);
 else
  if not exists(select 1 from business_case_revisions where user_id=p_user_id and case_id=c.id and id=p_report_id) then raise exception 'report unavailable';end if;
  update business_case_revisions set payload='{"sections":[],"authorship":"ai_draft","primarySnapshotIds":[],"comparisonSnapshotIds":[],"model":null,"promptVersion":null}',manifest='[]',erased_at=clock_timestamp() where user_id=p_user_id and case_id=c.id and id=p_report_id and erased_at is null;
 end if;
 update business_case_action_refs a set source_invalidated_at=coalesce(source_invalidated_at,clock_timestamp()) where a.user_id=p_user_id and exists(select 1 from business_case_revisions r where r.id=a.report_id and r.erased_at is not null);
 update business_daily_cases d set published_revision_id=null where d.user_id=p_user_id and exists(select 1 from business_case_revisions r where r.id=d.published_revision_id and r.erased_at is not null);
 perform set_config('business.erase_case','',true);
end$$;
create trigger business_lesson_immutable before update or delete on business_case_lessons for each row execute function business_immutable();
do $$declare t text;begin foreach t in array array['business_ai_consents','business_case_revisions','business_report_requests','business_case_lessons','business_case_action_refs','business_report_publications'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy owner_read on public.%I for select to authenticated using(auth.uid()=user_id)',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end$$;
revoke all on function public.business_selected_manifest(uuid,uuid,jsonb),public.business_report_command(uuid,text,jsonb),public.business_erase_content(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_selected_manifest(uuid,uuid,jsonb),public.business_report_command(uuid,text,jsonb),public.business_erase_content(uuid,uuid,uuid,uuid) to service_role;
commit;
