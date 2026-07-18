-- 假方案（decoy）：思维陪练。AI 生成埋了 2-4 处错漏的"看似正确"方案，用户找茬 →
-- 揭底对照 → 用户写下自己的方案（主产物）→ AI 一次性对抗质疑 → 可选扩写定稿。
-- plan / reveal / own_plan_critique 的 JSON 结构见 app/(app)/decoy/types.ts。

create table if not exists decoy_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  idea_id           uuid references ideas (id) on delete set null,
  problem           text not null,
  plan              jsonb not null,          -- { sections: [...], planted_flaws: [...] }
  challenges        text,                    -- 用户质疑原文
  reveal            jsonb,                   -- { caught: [...], missed: [...], bonus: [...] }
  own_plan          text,                    -- 用户自己的方案（主产物，可修订覆盖）
  own_plan_critique jsonb,                   -- AI 对 own_plan 的一次性对抗质疑
  final_plan        text,                    -- AI 基于 own_plan 扩写的完整方案（可选）
  learned           text,                    -- 用户亲笔的一句总结（可空）
  status            text not null default 'drafted'
                    check (status in ('drafted', 'challenged', 'revealed',
                                      'drafting_own', 'concluded')),
  created_at        timestamptz not null default now(),
  revealed_at       timestamptz,
  concluded_at      timestamptz
);

create index if not exists idx_decoy_sessions_user
  on decoy_sessions (user_id, created_at desc);

alter table decoy_sessions enable row level security;

create policy "decoy_sessions_owner" on decoy_sessions
  for all using (auth.uid() = user_id);
