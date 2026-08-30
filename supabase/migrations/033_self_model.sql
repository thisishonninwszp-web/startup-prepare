-- 自我模块（/self）第一阶段：押注与假设台账。
--
-- 目的：把"我是什么样的人"从不可证伪的形容词，降级为可证伪的条件命题。
-- 三条不可违背的约定：
--   1) 一切数值必须有分母。假设的强度 = 触发率（self_windows 的 hit / 总窗口），
--      不是评分。只记录"你做了什么"而不记录"符合条件但你没那么做"，分母就没了。
--   2) AI 只有提名权，没有授予权。档位升降规则写在 lib/domains/self-model/tiers.ts，
--      AI 不输出任何数字。
--   3) 自述（"我觉得我很有野心"）不是证据，进 self_declarations 单独存放，不进推理。
--
-- 预测不新建表：扩 predictions 的 source_type，复用 026 已统一的到期/命中逻辑，
-- 这样"对想法的预测"和"对自己的预测"能放在同一把尺子上比校准。

-- ---------------------------------------------------------------------------
-- 1. 自述：Declared Self。单独存放，永不进入推理。
-- ---------------------------------------------------------------------------
create table if not exists self_declarations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  text       text not null,
  stated_on  date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_self_declarations_user
  on self_declarations (user_id, stated_on desc);

-- ---------------------------------------------------------------------------
-- 2. 假设台账
-- ---------------------------------------------------------------------------
create table if not exists self_hypotheses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  code         text not null,                       -- H-001，永不复用
  kind         text not null default 'context_behavior'
               check (kind in (
                 'trait', 'state', 'context_behavior',
                 'skill', 'preference', 'value', 'motivation'
               )),
  -- statement 必须含"在什么条件下"，默认归入 context_behavior：
  -- 大多数被误标为 trait 的东西，真实身份是"在 X 条件下会 Y"。
  statement    text not null,
  scope_note   text,                                -- 已知适用/不适用范围
  tier         text not null default 'hunch'
               check (tier in (
                 'hunch',        -- 猜想：只能当问题
                 'working',      -- 工作假设：可以押注
                 'load_bearing', -- 可承重：能进人生决策
                 'refuted',      -- 已推翻（保留，不删）
                 'archived'      -- 12 个月无新证据自动归档
               )),
  -- [{ label, explanation, distinguishing_test }]
  -- 只列替代解释不够，必须写出"什么观察能区分它们"。
  alternative_explanations jsonb not null default '[]'::jsonb,
  first_observed  date not null default current_date,
  last_evidence_on date,
  refuted_at      timestamptz,
  refuted_reason  text,
  replaces_id     uuid references self_hypotheses (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint self_hypotheses_code_uniq unique (user_id, code),
  constraint self_hypotheses_refuted_reason_check check (
    refuted_at is null or coalesce(trim(refuted_reason), '') <> ''
  )
);

create index if not exists idx_self_hypotheses_user
  on self_hypotheses (user_id, tier, last_evidence_on desc nulls last);

-- ---------------------------------------------------------------------------
-- 3. 触发窗口 ★ 全模块命脉
--    每一次"符合触发条件的情境"都要记一行，不管行为有没有发生。
--    outcome='miss' 的行不是失败记录，是分母。
-- ---------------------------------------------------------------------------
create table if not exists self_windows (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  hypothesis_id uuid not null references self_hypotheses (id) on delete cascade,
  occurred_on   date not null default current_date,
  situation     text not null,                      -- 白描：当时符合条件的情境
  -- 情境归类标签（例："对上级" / "公司内部项目" / "自学"）。
  -- trait 级结论要求跨 ≥3 个不同 context_key —— 只在一类情境里重复出现的，
  -- 是"在 X 条件下的行为"，不是特质。
  context_key   text not null,
  outcome       text not null check (outcome in ('hit', 'miss')),
  cost_paid     text,                               -- 放弃了什么（区分 preference 与 value）
  third_party   text,                               -- 别人的原话（盲点的唯一来源）
  -- E1 事后回忆 / E2 有代价 / E3 有第三方或文档佐证 / E4 系统自动统计
  -- E5（事前预测被检验）不在本表，走 predictions。
  grade         text not null default 'E1'
                check (grade in ('E1', 'E2', 'E3', 'E4')),
  source_ref    jsonb,                              -- 关联 material / decision / validation
  created_at    timestamptz not null default now()
);

create index if not exists idx_self_windows_hypothesis
  on self_windows (hypothesis_id, occurred_on desc);
create index if not exists idx_self_windows_user
  on self_windows (user_id, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 4. predictions 接入 self（E5 级证据的唯一来源）
--    source_type='self' 时 idea_id 与 period_id 都为空，可选挂 hypothesis_id。
-- ---------------------------------------------------------------------------
alter table predictions
  drop constraint if exists predictions_source_ref_check;
alter table predictions
  drop constraint if exists predictions_source_type_check;

alter table predictions
  add column if not exists hypothesis_id uuid
    references self_hypotheses (id) on delete set null,
  -- 押注时的把握度，由用户自己填。不是 AI 给的分，也不是对人格的评分：
  -- 它的唯一用途是和实际命中率对账，算出你的校准偏移。
  add column if not exists confidence smallint
    check (confidence between 0 and 100);

do $$ begin
  alter table predictions add constraint predictions_source_type_check
    check (source_type in ('idea', 'retro', 'self'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table predictions add constraint predictions_source_ref_check check (
    (source_type = 'idea'  and idea_id is not null and period_id is null)
    or (source_type = 'retro' and period_id is not null and idea_id is null)
    or (source_type = 'self'  and idea_id is null and period_id is null)
  );
exception when duplicate_object then null; end $$;

create index if not exists idx_predictions_hypothesis
  on predictions (hypothesis_id, due_at) where source_type = 'self';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table self_declarations enable row level security;
alter table self_hypotheses   enable row level security;
alter table self_windows      enable row level security;

drop policy if exists "self_declarations_owner" on self_declarations;
create policy "self_declarations_owner" on self_declarations
  for all using (auth.uid() = user_id);

drop policy if exists "self_hypotheses_owner" on self_hypotheses;
create policy "self_hypotheses_owner" on self_hypotheses
  for all using (auth.uid() = user_id);

drop policy if exists "self_windows_owner" on self_windows;
create policy "self_windows_owner" on self_windows
  for all using (auth.uid() = user_id);
