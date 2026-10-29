-- Replay packets never have a reader SELECT policy: future material stays server-side.
create table public.signal_event_replays (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null, cutoff timestamptz not null, mode text not null check(mode in ('archived','recovered')),
 request_id uuid not null, revealed integer not null default 0 check(revealed>=0), guess text, guess_request uuid,
 created_at timestamptz not null default now(),
 foreign key(user_id,event_id) references public.signal_events(user_id,id) on delete cascade,
 unique(user_id,request_id), unique(user_id,id), check(guess is null or length(btrim(guess)) between 1 and 4000)
);
create table public.signal_event_replay_packets (
 session_id uuid not null references public.signal_event_replays(id) on delete cascade,
 step integer not null check(step>=0), materials jsonb not null, primary key(session_id,step)
);
create table public.signal_event_replay_advances (
 session_id uuid not null references public.signal_event_replays(id) on delete cascade,
 request_id uuid not null, step integer not null, primary key(session_id,request_id)
);
alter table public.signal_event_replays enable row level security;
alter table public.signal_event_replay_packets enable row level security;
alter table public.signal_event_replay_advances enable row level security;
revoke all on public.signal_event_replays, public.signal_event_replay_packets,public.signal_event_replay_advances from public,anon,authenticated;
grant all on public.signal_event_replays,public.signal_event_replay_packets,public.signal_event_replay_advances to service_role;

create function public.read_signal_event_replay(p_user_id uuid,p_event_id uuid,p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays; materials jsonb;
begin
 perform public.signal_event_guard_owner(p_user_id);
 select * into r from public.signal_event_replays where id=p_session_id and user_id=p_user_id and event_id=p_event_id;
 if not found then raise exception 'replay unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(item order by p.step,n),'[]'::jsonb) into materials
 from public.signal_event_replay_packets p cross join lateral jsonb_array_elements(p.materials) with ordinality x(item,n)
 where p.session_id=r.id and p.step<=r.revealed;
 return jsonb_build_object('id',r.id,'cutoff',r.cutoff,'mode',r.mode,'guess',r.guess,'revealed',r.revealed,'materials',materials,
 'complete',r.guess is not null
   and exists(select 1 from public.signal_event_replay_advances where session_id=r.id)
   and not exists(select 1 from public.signal_event_replay_packets where session_id=r.id and step=r.revealed+1));
end $$;

create function public.create_signal_event_replay(p_user_id uuid,p_event_id uuid,p_cutoff timestamptz,p_mode text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays;
begin
 perform public.signal_event_guard_owner(p_user_id);
 if p_cutoff is null or not isfinite(p_cutoff) or p_cutoff>clock_timestamp() or p_mode is null or p_mode not in ('archived','recovered') or p_request_id is null then raise exception 'invalid replay input'; end if;
 -- Lock the owned event so concurrent membership revisions cannot split the freeze.
 perform 1 from public.signal_events where id=p_event_id and user_id=p_user_id for update;
 if not found then raise exception 'event unavailable' using errcode='42501'; end if;
 select * into r from public.signal_event_replays where user_id=p_user_id and request_id=p_request_id;
 if found then
  if r.event_id is distinct from p_event_id or r.cutoff is distinct from p_cutoff or r.mode is distinct from p_mode then raise exception 'request payload conflict'; end if;
  return jsonb_build_object('id',r.id);
 end if;
 insert into public.signal_event_replays(user_id,event_id,cutoff,mode,request_id) values(p_user_id,p_event_id,p_cutoff,p_mode,p_request_id) returning * into r;
 -- Archived uses the actual membership log and source capture clock. Recovered deliberately
 -- uses today's curated set and publication dates; every such item is labelled hindsight.
 with latest as (
  select distinct on(signal_id) * from public.signal_event_memberships where user_id=p_user_id and event_id=p_event_id order by signal_id,revision desc
 ), candidates as (
  select m.*,s.title,s.source_name,s.source_url,s.published_at,s.captured_at,s.captured_text,
    case when p_mode='archived' then case when m.action='exclude' then m.created_at else greatest(m.created_at,s.captured_at,coalesce(s.published_at,m.created_at)) end else s.published_at end as available_at
  from public.signal_event_memberships m left join public.signal_source_snapshots s on s.user_id=m.user_id and s.id=m.snapshot_id and s.signal_id=m.signal_id
  where m.user_id=p_user_id and m.event_id=p_event_id and
   (p_mode='archived' or (m.id in(select id from latest where action='include') and s.published_at is not null))
 ), initial_state as (
  select distinct on(signal_id) * from candidates where available_at<=p_cutoff order by signal_id,revision desc
 ), material as (
  select *,jsonb_build_object('title',case when action='include' then title else '移出事件档案' end,
   'text',case when action='include' then captured_text else '' end,'source',case when action='include' then source_name else '' end,
   'url',case when action='include' then source_url else null end,'publishedAt',case when action='include' then published_at else null end,'capturedAt',case when action='include' then captured_at else null end,
   'retrospective',p_mode='recovered','action',action,'availableAt',available_at) as payload from candidates
 ), future as (
  select row_number() over(order by available_at,revision)::integer as step,payload from material where available_at>p_cutoff
 )
 insert into public.signal_event_replay_packets(session_id,step,materials)
 select r.id,0,coalesce((select jsonb_agg(m.payload order by m.available_at,m.revision) from material m join initial_state i on i.id=m.id where i.action='include'),'[]'::jsonb)
 union all select r.id,step,jsonb_build_array(payload) from future;
 return jsonb_build_object('id',r.id);
end $$;

create function public.guess_signal_event_replay(p_user_id uuid,p_event_id uuid,p_session_id uuid,p_guess text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays;
begin
 perform public.signal_event_guard_owner(p_user_id);
 if p_guess is null or length(btrim(p_guess)) not between 1 and 4000 or p_request_id is null then raise exception 'invalid replay guess'; end if;
 select * into r from public.signal_event_replays where id=p_session_id and user_id=p_user_id and event_id=p_event_id for update;
 if not found then raise exception 'replay unavailable' using errcode='42501'; end if;
 if r.guess is not null then
  if r.guess_request is distinct from p_request_id or r.guess is distinct from btrim(p_guess) then raise exception 'practice guess is immutable'; end if;
 else
  update public.signal_event_replays set guess=btrim(p_guess),guess_request=p_request_id where id=r.id;
 end if;
 return public.read_signal_event_replay(p_user_id,p_event_id,p_session_id);
end $$;

create function public.advance_signal_event_replay(p_user_id uuid,p_event_id uuid,p_session_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.signal_event_replays;
begin
 perform public.signal_event_guard_owner(p_user_id);
 if p_request_id is null then raise exception 'request required'; end if;
 select * into r from public.signal_event_replays where id=p_session_id and user_id=p_user_id and event_id=p_event_id for update;
 if not found then raise exception 'replay unavailable' using errcode='42501'; end if;
 if r.guess is null then raise exception 'record a practice guess first'; end if;
 if not exists(select 1 from public.signal_event_replay_advances where session_id=r.id and request_id=p_request_id) then
  if exists(select 1 from public.signal_event_replay_packets where session_id=r.id and step=r.revealed+1) then
   update public.signal_event_replays set revealed=revealed+1 where id=r.id;
  end if;
  insert into public.signal_event_replay_advances(session_id,request_id,step) select r.id,p_request_id,revealed from public.signal_event_replays where id=r.id;
 end if;
 return public.read_signal_event_replay(p_user_id,p_event_id,p_session_id);
end $$;
revoke all on function public.create_signal_event_replay(uuid,uuid,timestamptz,text,uuid),public.read_signal_event_replay(uuid,uuid,uuid),public.guess_signal_event_replay(uuid,uuid,uuid,text,uuid),public.advance_signal_event_replay(uuid,uuid,uuid,uuid) from public,anon,authenticated;
-- Only the authenticated server action may invoke these. Ownership remains explicit even with service role.
grant execute on function public.create_signal_event_replay(uuid,uuid,timestamptz,text,uuid),public.read_signal_event_replay(uuid,uuid,uuid),public.guess_signal_event_replay(uuid,uuid,uuid,text,uuid),public.advance_signal_event_replay(uuid,uuid,uuid,uuid) to service_role;

create function public.signal_replay_immutable() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='signal_event_replays' then
  if new.user_id is distinct from old.user_id or new.event_id is distinct from old.event_id or new.cutoff is distinct from old.cutoff or new.mode is distinct from old.mode or new.request_id is distinct from old.request_id or new.created_at is distinct from old.created_at or
   (old.guess is not null and (new.guess is distinct from old.guess or new.guess_request is distinct from old.guess_request)) then
   raise exception 'replay session and practice guess are immutable';
  end if;
  return new;
 end if;
 if tg_op='DELETE' and not exists(select 1 from public.signal_event_replays where id=old.session_id) then return old; end if;
 raise exception 'replay packets and advance receipts are immutable';
end $$;
create trigger replay_session_immutable before update on public.signal_event_replays for each row execute function public.signal_replay_immutable();
create trigger replay_packet_immutable before update or delete on public.signal_event_replay_packets for each row execute function public.signal_replay_immutable();
create trigger replay_receipt_immutable before update or delete on public.signal_event_replay_advances for each row execute function public.signal_replay_immutable();
revoke all on function public.signal_replay_immutable() from public,anon,authenticated;
