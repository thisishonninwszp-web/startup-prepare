begin;
create table public.business_merchants (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),platform text not null check(platform in ('rakuten','xiaohongshu')),
 platform_shop_id text not null check(length(platform_shop_id) between 1 and 200),name text not null,source_url text not null,
 identity_scope text not null check(identity_scope in ('platform_shop_id','user_supplied_unverified')),created_at timestamptz not null default clock_timestamp(),
 unique(user_id,id),unique(user_id,platform,platform_shop_id)
);
create table public.business_material_snapshots (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),merchant_id uuid not null,
 platform text not null check(platform in ('rakuten','xiaohongshu')),item_id text,origin text not null check(origin in ('official_api','public_excerpt','manual_excerpt')),
 source_url text not null,captured_at timestamptz not null default clock_timestamp(),published_at timestamptz,
 capture_scope text not null check(capture_scope in ('api_fields','excerpt','manual_transcription')),captured_text text,
 quantities jsonb not null check(jsonb_typeof(quantities)='array'),structured jsonb not null check(jsonb_typeof(structured)='object'),coverage text not null check(length(trim(coverage))>0),content_hash text not null,
 unique(user_id,id),unique(user_id,id,merchant_id),foreign key(user_id,merchant_id) references business_merchants(user_id,id)
);
create table public.business_daily_cases (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),local_date date not null,timezone text not null default 'Asia/Tokyo' check(timezone='Asia/Tokyo'),merchant_id uuid not null,
 state text not null default 'preparing' check(state in ('preparing','ready','unavailable')),published_revision_id uuid,failure_reason text,revision integer not null default 1 check(revision>0),selection_reason text not null,
 created_at timestamptz not null default clock_timestamp(),unique(user_id,id),unique(user_id,local_date),unique(user_id,merchant_id),foreign key(user_id,merchant_id) references business_merchants(user_id,id)
);
create table public.business_case_members (
 user_id uuid not null,case_id uuid not null,snapshot_id uuid not null,merchant_id uuid not null,role text not null check(role in ('primary','product','comparison')),selection_reason text not null,
 added_at timestamptz not null default clock_timestamp(),primary key(case_id,snapshot_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id),foreign key(user_id,snapshot_id,merchant_id) references business_material_snapshots(user_id,id,merchant_id)
);
create unique index business_case_one_primary on business_case_members(case_id) where role='primary';
create table public.business_case_requests (
 user_id uuid not null references auth.users(id),request_id uuid not null,operation text not null,user_input_hash text not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(user_id,request_id)
);
create table public.business_case_preparations (
 user_id uuid not null references auth.users(id),request_id uuid not null,operation text not null check(operation='primary'),user_input_hash text not null,case_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),primary key(user_id,request_id),foreign key(user_id,case_id) references business_daily_cases(user_id,id)
);
create function public.business_today() returns date language sql stable set search_path=public,pg_temp as $$select (statement_timestamp() at time zone 'Asia/Tokyo')::date$$;
create function public.business_service(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if coalesce(auth.role(),'')<>'service_role' or p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'business owner/service required' using errcode='42501';end if;
end $$;
create function public.business_case_dto(c business_daily_cases) returns jsonb language sql immutable as $$select jsonb_build_object('id',c.id,'localDate',c.local_date,'timezone',c.timezone,'merchantId',c.merchant_id,'state',c.state,'publishedRevisionId',c.published_revision_id,'failureReason',c.failure_reason,'revision',c.revision,'selectionReason',c.selection_reason)$$;
create function public.business_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin raise exception 'business historical material is immutable';end $$;
create trigger business_snapshot_immutable before update or delete on business_material_snapshots for each row execute function business_immutable();
create trigger business_member_immutable before update or delete on business_case_members for each row execute function business_immutable();
create function public.business_merchant_identity_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' then raise exception 'business merchant is immutable';end if;
 if new.id<>old.id or new.user_id<>old.user_id or new.platform<>old.platform or new.platform_shop_id<>old.platform_shop_id or exists(select 1 from business_material_snapshots where merchant_id=old.id) then raise exception 'business merchant identity/history is immutable';end if;return new;
end $$;
create trigger business_merchant_immutable before update or delete on business_merchants for each row execute function business_merchant_identity_immutable();
create function public.business_case_identity_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.user_id<>old.user_id or new.local_date<>old.local_date or new.merchant_id<>old.merchant_id or new.timezone<>old.timezone or new.selection_reason<>old.selection_reason then raise exception 'business daily identity is immutable';end if;return new;
end $$;
create function public.business_prepare_case(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;m business_merchants;prep business_case_preparations;r business_case_requests;mi jsonb;v_request uuid;v_hash text;v_needs boolean;
begin
 perform business_service(p_user_id);
 if p_input is null or octet_length(p_input::text)>10000 then raise exception 'invalid preparation input';end if;
 v_request:=(p_input->>'requestId')::uuid;v_hash:=p_input->>'userInputHash';mi:=p_input->'merchant';
 if v_request is null or coalesce(v_hash,'')='' or coalesce(mi->>'platform','') not in ('rakuten','xiaohongshu') or coalesce(mi->>'platformShopId','')='' or coalesce(p_input->>'selectionReason','')='' then raise exception 'invalid preparation identity';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into r from business_case_requests where user_id=p_user_id and request_id=v_request;
 if found then if r.operation<>'primary' or r.user_input_hash<>v_hash then raise exception 'business request payload conflict';end if;return jsonb_build_object('dailyCase',r.result,'needsMaterial',false);end if;
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=v_request;
 if found then
  if prep.operation<>'primary' or prep.user_input_hash<>v_hash then raise exception 'business request payload conflict';end if;
  select * into c from business_daily_cases where user_id=p_user_id and id=prep.case_id for update;
 else
  select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() for update;
  if not found then
   select * into m from business_merchants where user_id=p_user_id and platform=mi->>'platform' and platform_shop_id=mi->>'platformShopId';
   if not found then insert into business_merchants(user_id,platform,platform_shop_id,name,source_url,identity_scope) values(p_user_id,mi->>'platform',mi->>'platformShopId',mi->>'name',mi->>'sourceUrl','user_supplied_unverified') returning * into m;end if;
   insert into business_daily_cases(user_id,local_date,merchant_id,selection_reason) values(p_user_id,business_today(),m.id,p_input->>'selectionReason') returning * into c;
  end if;
  insert into business_case_preparations(user_id,request_id,operation,user_input_hash,case_id) values(p_user_id,v_request,'primary',v_hash,c.id);
 end if;
 select * into m from business_merchants where id=c.merchant_id and user_id=p_user_id;
 v_needs:=m.platform=mi->>'platform' and m.platform_shop_id=mi->>'platformShopId' and not exists(select 1 from business_case_members where case_id=c.id and role='primary');
 return jsonb_build_object('dailyCase',business_case_dto(c),'needsMaterial',v_needs);
end $$;
create function public.business_fail_preparation(p_user_id uuid,p_request_id uuid,p_user_input_hash text) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare prep business_case_preparations;begin
 perform business_service(p_user_id);perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=p_request_id;
 if not found or prep.user_input_hash is distinct from p_user_input_hash then raise exception 'business preparation conflict';end if;
 update business_daily_cases c set state='unavailable',failure_reason='官方来源暂不可用，请重试或补充该店公开摘录。' where c.user_id=p_user_id and c.id=prep.case_id and not exists(select 1 from business_case_members where case_id=c.id and role='primary');
end $$;
create trigger business_case_identity_immutable before update on business_daily_cases for each row execute function business_case_identity_immutable();
create function public.business_request_receipt(p_user_id uuid,p_request_id uuid,p_operation text,p_user_input_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r business_case_requests;prep business_case_preparations;begin
 perform business_service(p_user_id);select * into r from business_case_requests where user_id=p_user_id and request_id=p_request_id;
 if not found then
  select * into prep from business_case_preparations where user_id=p_user_id and request_id=p_request_id;
  if found and (prep.operation is distinct from p_operation or prep.user_input_hash is distinct from p_user_input_hash) then raise exception 'business request payload conflict';end if;return null;
 end if;
 if r.operation is distinct from p_operation or r.user_input_hash is distinct from p_user_input_hash then raise exception 'business request payload conflict';end if;return r.result;
end $$;
create function public.business_load_today(p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c business_daily_cases;begin
 perform business_service(p_user_id);select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today();if not found then return null;end if;return business_case_dto(c);
end $$;
create function public.business_validate_quantities(p_quantities jsonb) returns void language plpgsql set search_path=public,pg_temp as $$declare q jsonb;begin
 if jsonb_typeof(p_quantities) is distinct from 'array' or jsonb_array_length(p_quantities)>100 then raise exception 'invalid business quantities';end if;
 if (select count(*) from jsonb_array_elements(p_quantities))<>(select count(distinct value->>'id') from jsonb_array_elements(p_quantities)) then raise exception 'quantity identity conflict';end if;
 for q in select value from jsonb_array_elements(p_quantities) loop
  if jsonb_typeof(q) is distinct from 'object' or coalesce(q->>'id','')='' or coalesce(q->>'raw','')='' or coalesce(q->>'sampleScope','')='' or
   coalesce(q->>'metric','') not in ('pack_contents','units_per_order','displayed_sales','review_count','repeat_mention') or
   coalesce(q->>'relation','') not in ('eq','gte','unknown') or coalesce(q->>'unit','') not in ('pieces','packs','orders','buyers','mentions','unknown') or
   coalesce(q->>'attribution','') not in ('platform','merchant','review_excerpt','user_supplied') or jsonb_typeof(q->'period') is distinct from 'object' or
   not(q ? 'value') or (q->>'relation'='unknown' and q->'value'<>'null'::jsonb) or (q->>'relation'<>'unknown' and jsonb_typeof(q->'value') is distinct from 'number') then raise exception 'invalid business quantity observation';end if;
  if jsonb_typeof(q->'value')='number' and (q->>'value')::numeric<0 then raise exception 'negative business quantity';end if;
 end loop;
end $$;
create function public.business_save_case_material(p_user_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c business_daily_cases;m business_merchants;r business_case_requests;prep business_case_preparations;s jsonb;mi jsonb;v_snapshot uuid;v_result jsonb;v_request uuid;v_operation text;v_role text;
begin
 perform business_service(p_user_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>100000 then raise exception 'invalid business input';end if;
 v_request:=(p_input->>'requestId')::uuid;v_operation:=p_input->>'operation';
 if v_request is null or v_operation not in ('primary','attach') or coalesce(p_input->>'userInputHash','')='' then raise exception 'invalid business request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,719));
 select * into r from business_case_requests where user_id=p_user_id and request_id=v_request;
 if found then if r.input is distinct from p_input then raise exception 'business request payload conflict';end if;return r.result;end if;
 select * into prep from business_case_preparations where user_id=p_user_id and request_id=v_request;
 if found and (v_operation<>'primary' or prep.user_input_hash is distinct from p_input->>'userInputHash') then raise exception 'business request payload conflict';end if;
 if v_operation='primary' then
  if prep.case_id is not null then select * into c from business_daily_cases where user_id=p_user_id and id=prep.case_id for update;
  else select * into c from business_daily_cases where user_id=p_user_id and local_date=business_today() for update;end if;
  if found and (exists(select 1 from business_case_members where case_id=c.id and role='primary') or not exists(select 1 from business_merchants where id=c.merchant_id and platform=p_input->'merchant'->>'platform' and platform_shop_id=p_input->'merchant'->>'platformShopId')) then v_result:=business_case_dto(c);insert into business_case_requests values(p_user_id,v_request,v_operation,p_input->>'userInputHash',p_input,v_result,clock_timestamp());return v_result;end if;
  v_role:='primary';
 else
  select * into c from business_daily_cases where id=(p_input->>'caseId')::uuid and user_id=p_user_id for update;
  if not found then raise exception 'business case owner required' using errcode='42501';end if;
  if c.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'business case revision conflict';end if;
  v_role:=p_input->>'role';if v_role not in ('product','comparison') then raise exception 'invalid member role';end if;
 end if;
 mi:=p_input->'merchant';s:=p_input->'snapshot';
 if coalesce(mi->>'platform','') not in ('rakuten','xiaohongshu') or coalesce(mi->>'platformShopId','')='' or coalesce(mi->>'name','')='' or mi->>'platform' is distinct from s->>'platform' or coalesce(p_input->>'selectionReason','')='' then raise exception 'invalid merchant material';end if;
 if coalesce(s->>'coverage','')='' or jsonb_typeof(s->'quantities') is distinct from 'array' or jsonb_typeof(s->'structured') is distinct from 'object' then raise exception 'invalid source coverage';end if;
 perform business_validate_quantities(s->'quantities');
 if s->>'origin'='official_api' and (mi->>'platform'<>'rakuten' or mi->>'identityScope'<>'platform_shop_id' or s->>'captureScope'<>'api_fields') then raise exception 'invalid official source';end if;
 if s->>'origin'='official_api' and (coalesce(s->>'sourceUrl','') !~ '^https://item[.]rakuten[.]co[.]jp/' or coalesce(mi->>'sourceUrl','') !~ '^https://www[.]rakuten[.]co[.]jp/' or split_part(s->>'sourceUrl','/',4) is distinct from mi->>'platformShopId' or split_part(s->>'itemId',':',1) is distinct from mi->>'platformShopId') then raise exception 'official source identity mismatch';end if;
 if s->>'origin'='manual_excerpt' and s->>'captureScope'<>'manual_transcription' then raise exception 'manual source scope mismatch';end if;
 select * into m from business_merchants where user_id=p_user_id and platform=mi->>'platform' and platform_shop_id=mi->>'platformShopId';
 if not found then insert into business_merchants(user_id,platform,platform_shop_id,name,source_url,identity_scope) values(p_user_id,mi->>'platform',mi->>'platformShopId',mi->>'name',mi->>'sourceUrl',mi->>'identityScope') returning * into m;
 elsif not exists(select 1 from business_material_snapshots where merchant_id=m.id) then update business_merchants set name=mi->>'name',source_url=mi->>'sourceUrl',identity_scope=mi->>'identityScope' where id=m.id returning * into m;end if;
 if v_operation='primary' then
  if c.id is null then insert into business_daily_cases(user_id,local_date,merchant_id,selection_reason) values(p_user_id,business_today(),m.id,p_input->>'selectionReason') returning * into c;end if;
 else
  if (v_role='comparison' and m.id=c.merchant_id) or (v_role='product' and m.id<>c.merchant_id) then raise exception 'material merchant does not match role';end if;
  update business_daily_cases set revision=revision+1 where id=c.id returning * into c;
  if v_role='product' and not exists(select 1 from business_case_members where case_id=c.id and role='primary') then v_role:='primary';end if;
 end if;
 insert into business_material_snapshots(user_id,merchant_id,platform,item_id,origin,source_url,published_at,capture_scope,captured_text,quantities,structured,coverage,content_hash)
 values(p_user_id,m.id,s->>'platform',s->>'itemId',s->>'origin',s->>'sourceUrl',(s->>'publishedAt')::timestamptz,s->>'captureScope',s->>'capturedText',s->'quantities',s->'structured',s->>'coverage',md5(s::text)) returning id into v_snapshot;
 insert into business_case_members(user_id,case_id,snapshot_id,merchant_id,role,selection_reason) values(p_user_id,c.id,v_snapshot,m.id,v_role,p_input->>'selectionReason');
 if v_role='primary' then update business_daily_cases set state='ready',failure_reason=null where id=c.id returning * into c;end if;
 v_result:=business_case_dto(c);insert into business_case_requests values(p_user_id,v_request,v_operation,p_input->>'userInputHash',p_input,v_result,clock_timestamp());return v_result;
end $$;
alter table business_merchants enable row level security;
alter table business_material_snapshots enable row level security;
alter table business_daily_cases enable row level security;
alter table business_case_members enable row level security;
alter table business_case_requests enable row level security;
alter table business_case_preparations enable row level security;
create policy business_merchants_read on business_merchants for select to authenticated using(user_id=auth.uid());
create policy business_material_read on business_material_snapshots for select to authenticated using(user_id=auth.uid());
create policy business_cases_read on business_daily_cases for select to authenticated using(user_id=auth.uid());
create policy business_members_read on business_case_members for select to authenticated using(user_id=auth.uid());
revoke all on business_merchants,business_material_snapshots,business_daily_cases,business_case_members,business_case_requests,business_case_preparations from public,anon,authenticated,service_role;
grant select on business_merchants,business_material_snapshots,business_daily_cases,business_case_members to authenticated,service_role;
revoke all on function business_service(uuid),business_request_receipt(uuid,uuid,text,text),business_save_case_material(uuid,jsonb),business_load_today(uuid) from public,anon,authenticated;
grant execute on function business_request_receipt(uuid,uuid,text,text),business_save_case_material(uuid,jsonb),business_load_today(uuid) to service_role;
revoke all on function business_prepare_case(uuid,jsonb),business_fail_preparation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function business_prepare_case(uuid,jsonb),business_fail_preparation(uuid,uuid,text) to service_role;
commit;
