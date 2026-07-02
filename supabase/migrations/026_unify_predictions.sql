-- 合并两套预测对账系统：predictions（挂 idea）和 retro_predictions（挂周复盘）
-- 结构几乎相同，服务同一个校准回路目的。统一进 predictions 表，
-- 用 source_type 区分来源，idea_id / period_id 互斥。
-- 生产库两张表当前均为空，本迁移直接结构变更，不做数据搬迁风险评估。

alter table predictions
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists period_id uuid references retro_periods (id) on delete cascade,
  add column if not exists source_type text not null default 'idea'
    check (source_type in ('idea', 'retro'));

-- 回填 idea 来源行的 user_id（历史数据保护；当前生产库为空表，此步是幂等安全网）。
update predictions p
set user_id = i.user_id
from ideas i
where p.idea_id = i.id and p.user_id is null;

-- 迁移遗留的 retro_predictions 数据（若存在）。
insert into predictions (id, user_id, period_id, source_type, text, due_at, made_at, outcome, resolved_at, note)
select id, user_id, period_id, 'retro', text, due_at, created_at, outcome, resolved_at, note
from retro_predictions
on conflict (id) do nothing;

alter table predictions alter column idea_id drop not null;
alter table predictions alter column user_id set not null;

do $$ begin
  alter table predictions add constraint predictions_source_ref_check check (
    (source_type = 'idea' and idea_id is not null and period_id is null)
    or (source_type = 'retro' and period_id is not null and idea_id is null)
  );
exception when duplicate_object then null; end $$;

create unique index if not exists idx_predictions_period_uniq
  on predictions (period_id) where source_type = 'retro';
create index if not exists idx_predictions_user_source
  on predictions (user_id, source_type, outcome, due_at);

drop table if exists retro_predictions;

-- complete_weekly_retrospective 原本写入 retro_predictions，改写入统一后的 predictions。
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

  insert into predictions (user_id, period_id, source_type, text, due_at)
  values (
    p_user_id,
    p_period_id,
    'retro',
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

revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from public;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from anon;
revoke all on function complete_weekly_retrospective(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_weekly_retrospective(uuid, uuid, jsonb) to service_role;
