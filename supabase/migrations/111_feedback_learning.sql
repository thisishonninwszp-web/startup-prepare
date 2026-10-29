begin;
create table public.decision_feedback (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),idea_id uuid not null references public.ideas(id),
 revision integer not null check(revision>0),request_id uuid not null,request_payload jsonb not null,
 source_kind text not null check(source_kind in ('validation','manual_contact','no_reply')),
 validation_id uuid references public.validations(id),outreach_canvas_id uuid references public.outreach_canvases(id),
 source_note text,source_has_pain text check(source_has_pain in ('yes','no','unsure')),source_will_pay text check(source_will_pay in ('yes','no','unsure')),
 contacted_at timestamptz,verbatim boolean not null default false,role_context text not null,interpretation text not null,created_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id),unique(user_id,revision),unique(id,user_id),
 check((source_kind='validation' and validation_id is not null and not verbatim) or (source_kind<>'validation' and validation_id is null and source_has_pain is null and source_will_pay is null)),
 check(source_kind<>'no_reply' or not verbatim)
);
create table public.decision_feedback_links (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),feedback_id uuid not null,target_idea_id uuid not null references public.ideas(id),
 revision integer not null check(revision>0),request_id uuid not null,request_payload jsonb not null,action text not null check(action in ('confirm','retract')),
 expected_link_id uuid references public.decision_feedback_links(id),assumption text not null,scope text not null,limits text not null,unknown text not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(feedback_id,user_id) references public.decision_feedback(id,user_id),unique(user_id,request_id),unique(user_id,revision)
);
create index feedback_anchor on public.decision_feedback(user_id,idea_id,revision desc);
create index feedback_link_pair on public.decision_feedback_links(user_id,feedback_id,target_idea_id,revision desc);
create index feedback_link_incoming on public.decision_feedback_links(user_id,target_idea_id,revision desc);
alter table public.decision_feedback enable row level security;
alter table public.decision_feedback_links enable row level security;
create policy feedback_owner on public.decision_feedback for select using(auth.uid()=user_id);
create policy feedback_link_owner on public.decision_feedback_links for select using(auth.uid()=user_id);
grant select on public.decision_feedback,public.decision_feedback_links to authenticated,service_role;
revoke insert,update,delete on public.decision_feedback,public.decision_feedback_links from anon,authenticated,service_role;
create function public.feedback_immutable_guard() returns trigger language plpgsql as $$begin
 if tg_op<>'INSERT' or current_setting('ideaos.feedback_write',true) is distinct from 'allowed' then raise exception 'immutable feedback; use RPC';end if;return new;end$$;
create trigger feedback_immutable before insert or update or delete on public.decision_feedback for each row execute function public.feedback_immutable_guard();
create trigger feedback_link_immutable before insert or update or delete on public.decision_feedback_links for each row execute function public.feedback_immutable_guard();
create function public.save_decision_feedback(p_user_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old decision_feedback;v public.validations;c public.outreach_canvases;new_id uuid;source text;note_text text;contact_time timestamptz;field text;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'service owner required' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>50000 then raise exception 'invalid feedback';end if;
 for field in select jsonb_object_keys(p_payload) loop if field not in ('ideaId','requestId','sourceKind','validationId','outreachCanvasId','sourceNote','contactedAt','verbatim','roleContext','interpretation') then raise exception 'unsupported feedback field';end if;end loop;
 if p_payload->>'requestId' is null or p_payload->>'ideaId' is null then raise exception 'feedback identity required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,111));
 select * into old from decision_feedback where user_id=p_user_id and request_id=(p_payload->>'requestId')::uuid;
 if found then if old.request_payload is distinct from p_payload then raise exception 'request conflict';end if;return jsonb_build_object('id',old.id);end if;
 perform 1 from ideas where id=(p_payload->>'ideaId')::uuid and user_id=p_user_id for share;if not found then raise exception 'idea unavailable';end if;
 source=p_payload->>'sourceKind';
 if source is null or source not in ('validation','manual_contact','no_reply') then raise exception 'invalid source kind';end if;
 foreach field in array array['roleContext','interpretation'] loop if jsonb_typeof(p_payload->field) is distinct from 'string' or length(trim(p_payload->>field)) not between 1 and 4000 then raise exception 'feedback context required';end if;end loop;
 if p_payload ? 'verbatim' and jsonb_typeof(p_payload->'verbatim') is distinct from 'boolean' then raise exception 'invalid verbatim';end if;
 if p_payload->>'outreachCanvasId' is not null then
 select * into c from outreach_canvases where id=(p_payload->>'outreachCanvasId')::uuid and user_id=p_user_id for share;
 if not found or (c.source_id is not null and (c.source_type is distinct from 'idea' or c.source_id<>(p_payload->>'ideaId')::uuid)) then raise exception 'canvas unavailable for idea';end if;end if;
 if source='validation' then
 if p_payload ? 'sourceNote' or p_payload ? 'contactedAt' or coalesce((p_payload->>'verbatim')::boolean,false) then raise exception 'validation snapshot is server owned';end if;
 select * into v from validations where id=(p_payload->>'validationId')::uuid and idea_id=(p_payload->>'ideaId')::uuid for share;if not found then raise exception 'validation unavailable';end if;
 note_text=v.note;contact_time=v.contacted_at;
 else
 if p_payload->>'validationId' is not null then raise exception 'manual source cannot copy signals';end if;
 if p_payload ? 'sourceNote' and jsonb_typeof(p_payload->'sourceNote') not in ('string','null') then raise exception 'invalid source note';end if;
 note_text=p_payload->>'sourceNote';if length(note_text)>20000 then raise exception 'note too long';end if;
 if coalesce((p_payload->>'verbatim')::boolean,false) and length(trim(coalesce(note_text,'')))=0 then raise exception 'verbatim quote requires source text';end if;
 contact_time=(p_payload->>'contactedAt')::timestamptz;
 if source='no_reply' and coalesce((p_payload->>'verbatim')::boolean,false) then raise exception 'no reply has no quote';end if;
 end if;
 perform set_config('ideaos.feedback_write','allowed',true);
 insert into decision_feedback(user_id,idea_id,revision,request_id,request_payload,source_kind,validation_id,outreach_canvas_id,source_note,source_has_pain,source_will_pay,contacted_at,verbatim,role_context,interpretation)
 values(p_user_id,(p_payload->>'ideaId')::uuid,(select coalesce(max(revision),0)+1 from decision_feedback where user_id=p_user_id),(p_payload->>'requestId')::uuid,p_payload,source,v.id,c.id,note_text,v.has_pain::text,v.will_pay::text,contact_time,coalesce((p_payload->>'verbatim')::boolean,false),trim(p_payload->>'roleContext'),trim(p_payload->>'interpretation')) returning id into new_id;
 perform set_config('ideaos.feedback_write','',true);return jsonb_build_object('id',new_id);
end$$;
create function public.save_decision_feedback_link(p_user_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old decision_feedback_links;latest decision_feedback_links;f decision_feedback;new_id uuid;field text;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'service owner required' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>30000 then raise exception 'invalid feedback link';end if;
 for field in select jsonb_object_keys(p_payload) loop if field not in ('feedbackId','targetIdeaId','requestId','expectedLinkId','action','assumption','scope','limits','unknown') then raise exception 'unsupported link field';end if;end loop;
 if p_payload->>'requestId' is null or p_payload->>'feedbackId' is null or p_payload->>'targetIdeaId' is null or not(p_payload ? 'expectedLinkId') then raise exception 'link identity required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,111));
 select * into old from decision_feedback_links where user_id=p_user_id and request_id=(p_payload->>'requestId')::uuid;
 if found then if old.request_payload is distinct from p_payload then raise exception 'request conflict';end if;return jsonb_build_object('id',old.id);end if;
 select * into f from decision_feedback where id=(p_payload->>'feedbackId')::uuid and user_id=p_user_id for share;if not found then raise exception 'feedback unavailable';end if;
 perform 1 from ideas where id=(p_payload->>'targetIdeaId')::uuid and user_id=p_user_id for share;if not found or f.idea_id=(p_payload->>'targetIdeaId')::uuid then raise exception 'target idea unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||f.id::text||(p_payload->>'targetIdeaId')::uuid::text,113));
 select * into latest from decision_feedback_links where user_id=p_user_id and feedback_id=f.id and target_idea_id=(p_payload->>'targetIdeaId')::uuid order by revision desc limit 1;
 if latest.id is distinct from (p_payload->>'expectedLinkId')::uuid then raise exception 'stale feedback link';end if;
 if coalesce(p_payload->>'action','') not in ('confirm','retract') or (p_payload->>'action'='retract' and (latest.id is null or latest.action<>'confirm')) then raise exception 'invalid link action';end if;
 foreach field in array array['assumption','scope','limits','unknown'] loop
 if jsonb_typeof(p_payload->field) is distinct from 'string' or length(p_payload->>field)>4000 or (p_payload->>'action'='confirm' and length(trim(p_payload->>field))=0) then raise exception 'link scope required';end if;end loop;
 perform set_config('ideaos.feedback_write','allowed',true);
 insert into decision_feedback_links(user_id,feedback_id,target_idea_id,revision,request_id,request_payload,action,expected_link_id,assumption,scope,limits,unknown)
 values(p_user_id,f.id,(p_payload->>'targetIdeaId')::uuid,(select coalesce(max(revision),0)+1 from decision_feedback_links where user_id=p_user_id),(p_payload->>'requestId')::uuid,p_payload,p_payload->>'action',latest.id,p_payload->>'assumption',p_payload->>'scope',p_payload->>'limits',p_payload->>'unknown') returning id into new_id;
 perform set_config('ideaos.feedback_write','',true);return jsonb_build_object('id',new_id);
end$$;
revoke all on function public.save_decision_feedback(uuid,jsonb),public.save_decision_feedback_link(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_decision_feedback(uuid,jsonb),public.save_decision_feedback_link(uuid,jsonb) to service_role;
create function public.list_decision_feedback(p_user_id uuid,p_idea_id uuid default null,p_before integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_user_id is null or coalesce(auth.role(),'')<>'service_role' then raise exception 'service owner required' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'invalid feedback cursor';end if;
 if p_idea_id is not null then perform 1 from ideas where id=p_idea_id and user_id=p_user_id;if not found then raise exception 'idea unavailable';end if;end if;
 with latest as (select distinct on(feedback_id,target_idea_id) * from decision_feedback_links where user_id=p_user_id order by feedback_id,target_idea_id,revision desc),
 rows as (select f.* from decision_feedback f where f.user_id=p_user_id and (p_before is null or f.revision<p_before) and (p_idea_id is null or f.idea_id=p_idea_id or exists(select 1 from latest l where l.feedback_id=f.id and l.target_idea_id=p_idea_id and l.action='confirm')) order by f.revision desc limit 31),
 page as(select * from rows order by revision desc limit 30)
 select jsonb_build_object('status','ready','items',coalesce((select jsonb_agg(to_jsonb(p) order by revision desc) from page p),'[]'::jsonb),'links',coalesce((select jsonb_agg(to_jsonb(l) order by revision desc) from latest l where l.feedback_id in(select id from page)),'[]'::jsonb),'nextBefore',case when (select count(*) from rows)>30 then (select min(revision) from page) else null end) into result;
 return result;
end$$;
revoke all on function public.list_decision_feedback(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_decision_feedback(uuid,uuid,integer) to service_role;
commit;
