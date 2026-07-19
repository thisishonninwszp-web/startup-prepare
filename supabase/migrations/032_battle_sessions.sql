-- 心魔（battle）：AI 用用户口吻护盘一个用户想信的主张（暗中使用 decoy 的 18 类谬误），
-- 用户多回合进攻拆穿；词穷/收兵后强制复盘三栏，主产物是用户亲笔的 final_position。
-- messages / recap 的 JSON 结构见 app/(app)/battle/types.ts。

create table if not exists battle_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  idea_id        uuid references ideas (id) on delete set null,
  claim          text not null,           -- 用户想信的主张
  messages       jsonb not null default '[]'::jsonb,
  -- [{ role: 'user' | 'demon', content, fallacies?: [{type, quote}], out_of_excuses? }]
  recap          jsonb,                   -- { caught: [...], missed: [...], bonus: [...] }
  final_position text,                    -- 亲笔：现在还信吗/改成什么样（主产物）
  learned        text,                    -- 亲笔一句总结（可空）
  status         text not null default 'active'
                 check (status in ('active', 'concluded')),
  created_at     timestamptz not null default now(),
  concluded_at   timestamptz
);

create index if not exists idx_battle_sessions_user
  on battle_sessions (user_id, created_at desc);

alter table battle_sessions enable row level security;

create policy "battle_sessions_owner" on battle_sessions
  for all using (auth.uid() = user_id);
