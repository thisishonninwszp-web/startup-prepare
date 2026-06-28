-- 日／周／月复盘：每日时间镜子、周期证据、判断规则、行动与预测。

do $$ begin
  create type reflection_status as enum ('draft', 'confirmed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reflection_time_basis as enum ('explicit', 'approximate');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reflection_block_origin as enum ('ai', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type retro_period_type as enum ('weekly', 'monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type retro_period_status as enum ('draft', 'interview', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type judgment_rule_status as enum ('active', 'revised', 'retired');
exception when duplicate_object then null; end $$;

create table if not exists reflection_settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  timezone        text not null default 'Asia/Tokyo',
  review_weekday  integer not null default 0 check (review_weekday between 0 and 6),
  categories      jsonb not null default '[]'::jsonb,
  gray_keywords   text[] not null default '{}',
  private_terms   text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists daily_reflections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  reflection_date    date not null,
  sanitized_journal  text not null default '',
  ambiguities        jsonb not null default '[]'::jsonb,
  fact_observation   text not null default '',
  status             reflection_status not null default 'draft',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  constraint daily_reflections_user_date_uniq unique (user_id, reflection_date)
);

create table if not exists daily_time_blocks (
  id              uuid primary key default gen_random_uuid(),
  reflection_id   uuid not null references daily_reflections (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  start_slot      integer not null check (start_slot between 0 and 47),
  end_slot        integer not null check (end_slot between 1 and 48 and end_slot > start_slot),
  event           text not null,
  category_key    text not null,
  time_basis      reflection_time_basis not null,
  secondary_note  text,
  origin          reflection_block_origin not null,
  created_at      timestamptz not null default now()
);

create table if not exists retro_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  period_type   retro_period_type not null,
  period_start  date not null,
  period_end    date not null check (period_end >= period_start),
  status        retro_period_status not null default 'draft',
  draft         jsonb,
  messages      jsonb not null default '[]'::jsonb,
  final         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint retro_periods_user_range_uniq
    unique (user_id, period_type, period_start, period_end)
);

create table if not exists retro_sources (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid not null references retro_periods (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  source_type  text not null,
  source_id    text not null,
  label        text not null,
  snapshot     jsonb not null,
  included     boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint retro_sources_period_source_uniq
    unique (period_id, source_type, source_id)
);

create table if not exists judgment_rules (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  source_period_id   uuid not null references retro_periods (id) on delete restrict,
  replaces_rule_id   uuid references judgment_rules (id) on delete set null,
  text               text not null,
  status             judgment_rule_status not null default 'active',
  created_at         timestamptz not null default now(),
  retired_at         timestamptz
);

create table if not exists retro_commitments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  period_id    uuid not null unique references retro_periods (id) on delete cascade,
  text         text not null,
  due_at       timestamptz,
  completed_at timestamptz,
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists retro_predictions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  period_id    uuid not null unique references retro_periods (id) on delete cascade,
  text         text not null,
  due_at       timestamptz not null,
  outcome      prediction_outcome not null default 'pending',
  resolved_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_daily_reflections_user_date
  on daily_reflections (user_id, reflection_date desc);
create index if not exists idx_daily_time_blocks_reflection
  on daily_time_blocks (reflection_id, start_slot);
create index if not exists idx_retro_periods_user_start
  on retro_periods (user_id, period_type, period_start desc);
create index if not exists idx_retro_sources_period
  on retro_sources (period_id, included);
create index if not exists idx_judgment_rules_user_status
  on judgment_rules (user_id, status, created_at desc);
create index if not exists idx_retro_predictions_due
  on retro_predictions (user_id, outcome, due_at);

alter table reflection_settings enable row level security;
alter table daily_reflections enable row level security;
alter table daily_time_blocks enable row level security;
alter table retro_periods enable row level security;
alter table retro_sources enable row level security;
alter table judgment_rules enable row level security;
alter table retro_commitments enable row level security;
alter table retro_predictions enable row level security;

create or replace function save_daily_timeline(
  p_user_id uuid,
  p_reflection_date date,
  p_sanitized_journal text,
  p_ambiguities jsonb,
  p_blocks jsonb,
  p_fact_observation text,
  p_confirm boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reflection_id uuid;
  block jsonb;
begin
  insert into daily_reflections (
    user_id, reflection_date, sanitized_journal, ambiguities,
    fact_observation, status, confirmed_at, updated_at
  ) values (
    p_user_id, p_reflection_date, p_sanitized_journal, p_ambiguities,
    p_fact_observation,
    case when p_confirm then 'confirmed'::reflection_status else 'draft'::reflection_status end,
    case when p_confirm then now() else null end,
    now()
  )
  on conflict (user_id, reflection_date) do update set
    sanitized_journal = excluded.sanitized_journal,
    ambiguities = excluded.ambiguities,
    fact_observation = excluded.fact_observation,
    status = excluded.status,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning id into v_reflection_id;

  delete from daily_time_blocks
  where daily_time_blocks.reflection_id = v_reflection_id;

  for block in select * from jsonb_array_elements(p_blocks)
  loop
    insert into daily_time_blocks (
      reflection_id, user_id, start_slot, end_slot, event,
      category_key, time_basis, secondary_note, origin
    ) values (
      v_reflection_id,
      p_user_id,
      (block->>'start_slot')::integer,
      (block->>'end_slot')::integer,
      block->>'event',
      block->>'category_key',
      (block->>'time_basis')::reflection_time_basis,
      nullif(block->>'secondary_note', ''),
      case when p_confirm then 'user'::reflection_block_origin else 'ai'::reflection_block_origin end
    );
  end loop;

  return v_reflection_id;
end;
$$;

create or replace function complete_weekly_retrospective(
  p_period_id uuid,
  p_user_id uuid,
  p_final jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row retro_periods%rowtype;
  rule_id uuid;
  user_timezone text;
begin
  select * into period_row
  from retro_periods
  where id = p_period_id
  for update;

  if period_row.id is null or period_row.user_id is distinct from p_user_id then
    raise exception '无权完成该周复盘';
  end if;
  if period_row.period_type <> 'weekly' then
    raise exception '复盘类型不是weekly';
  end if;
  if period_row.status = 'completed' then
    select id into rule_id from judgment_rules where source_period_id = p_period_id limit 1;
    return rule_id;
  end if;
  if coalesce(trim(p_final->>'rule'), '') = ''
    or coalesce(trim(p_final->>'commitment'), '') = ''
    or coalesce(trim(p_final->'prediction'->>'text'), '') = ''
    or coalesce(trim(p_final->'prediction'->>'due_date'), '') = '' then
    raise exception '周复盘缺少规则、行动或预测';
  end if;

  insert into judgment_rules (user_id, source_period_id, text)
  values (p_user_id, p_period_id, p_final->>'rule')
  returning id into rule_id;

  select coalesce(timezone, 'Asia/Tokyo') into user_timezone
  from reflection_settings where user_id = p_user_id;
  user_timezone := coalesce(user_timezone, 'Asia/Tokyo');

  insert into retro_commitments (user_id, period_id, text, due_at)
  values (
    p_user_id,
    p_period_id,
    p_final->>'commitment',
    ((p_final->'prediction'->>'due_date')::date + time '23:59:59') at time zone user_timezone
  );

  insert into retro_predictions (user_id, period_id, text, due_at)
  values (
    p_user_id,
    p_period_id,
    p_final->'prediction'->>'text',
    ((p_final->'prediction'->>'due_date')::date + time '23:59:59') at time zone user_timezone
  );

  update retro_periods
  set status = 'completed',
      final = p_final,
      completed_at = now(),
      updated_at = now()
  where id = p_period_id;

  return rule_id;
end;
$$;

create or replace function complete_monthly_retrospective(
  p_period_id uuid,
  p_user_id uuid,
  p_final jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row retro_periods%rowtype;
  old_rule judgment_rules%rowtype;
  result_rule_id uuid;
  action text;
begin
  select * into period_row
  from retro_periods
  where id = p_period_id
  for update;

  if period_row.id is null or period_row.user_id is distinct from p_user_id then
    raise exception '无权完成该月复盘';
  end if;
  if period_row.period_type <> 'monthly' then
    raise exception '复盘类型不是monthly';
  end if;
  if period_row.status = 'completed' then
    return null;
  end if;

  action := p_final->'rule_decision'->>'action';
  select * into old_rule
  from judgment_rules
  where id = nullif(p_final->'rule_decision'->>'rule_id', '')::uuid
    and user_id = p_user_id
  for update;
  if old_rule.id is null then
    raise exception '月复盘必须选择自己的判断规则';
  end if;

  if action = 'keep' then
    result_rule_id := old_rule.id;
  elsif action = 'retire' then
    update judgment_rules
    set status = 'retired', retired_at = now()
    where id = old_rule.id;
    result_rule_id := old_rule.id;
  elsif action = 'revise' then
    update judgment_rules
    set status = 'revised', retired_at = now()
    where id = old_rule.id;
    insert into judgment_rules (
      user_id, source_period_id, replaces_rule_id, text
    ) values (
      p_user_id,
      p_period_id,
      old_rule.id,
      p_final->'rule_decision'->>'text'
    ) returning id into result_rule_id;
  else
    raise exception '无效的规则操作';
  end if;

  update retro_periods
  set status = 'completed',
      final = p_final,
      completed_at = now(),
      updated_at = now()
  where id = p_period_id;

  return result_rule_id;
end;
$$;

revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from public;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from anon;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_weekly_retrospective(uuid, uuid, jsonb) to service_role;

revoke all on function complete_monthly_retrospective(uuid, uuid, jsonb) from public;
revoke all on function complete_monthly_retrospective(uuid, uuid, jsonb) from anon;
revoke all on function complete_monthly_retrospective(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_monthly_retrospective(uuid, uuid, jsonb) to service_role;
revoke all on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) from public;
revoke all on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) from anon;
revoke all on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) from authenticated;
grant execute on function save_daily_timeline(uuid, date, text, jsonb, jsonb, text, boolean) to service_role;
