-- 自我面板的身体组。
--
-- 加它不是"顺便做个健身功能"。原因有两条，都和这个模块的方法论直接相关：
--   1) 目前关于用户的全部证据都长在"工作"这一类情境里，而 self_hypotheses
--      要升到 trait 需要跨 ≥3 类 context_key。身体是第二类真实情境。
--   2) 这是唯一一处叙述无法参与的数据。杠铃举不起来就是举不起来，
--      不存在"我觉得我其实挺强的"。
--
-- 一条记录 = 一组，或一次有氧。刻意不做训练计划、不做动作库、不做打卡奖励：
-- 记录必须在 20 秒内完成，否则两周后就没人记了（宪法原则 3 的同一条理由）。

create table if not exists self_body_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  logged_on    date not null default current_date,
  kind         text not null check (kind in ('lift', 'cardio')),
  -- lift: 深蹲 / 卧推 / 硬拉…；cardio: 跑步 / 骑行 / 游泳…
  movement     text not null,
  weight_kg    numeric(6, 2),
  reps         smallint check (reps is null or reps > 0),
  sets         smallint check (sets is null or sets > 0),
  distance_km  numeric(6, 2),
  duration_min numeric(6, 1),
  note         text,
  created_at   timestamptz not null default now(),
  -- 力量记录必须能算出估算 1RM，否则它进不了"力"这项的分子。
  constraint self_body_logs_shape_check check (
    (kind = 'lift' and weight_kg is not null and reps is not null)
    or (kind = 'cardio' and (duration_min is not null or distance_km is not null))
  )
);

create index if not exists idx_self_body_logs_user
  on self_body_logs (user_id, logged_on desc);

alter table self_body_logs enable row level security;

drop policy if exists "self_body_logs_owner" on self_body_logs;
create policy "self_body_logs_owner" on self_body_logs
  for all using (auth.uid() = user_id);
