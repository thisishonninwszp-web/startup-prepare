-- 写法画像：Jev 读你写的字，给出四个维度的档位分布。
--
-- 量的是「你怎么讲自己」，不是「你做了什么」—— 同一件事换个口气写，数字就会动。
-- 所以每份画像都把当时读的原文一起存下来（sources），点得开；
-- 它不进任何台账推理（档位、特性、技能都不读这张表）。
--
-- 每生成一次存一份，能看三个月前和现在的写法差在哪。

create table if not exists self_portraits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  model         text not null,
  answers       jsonb not null,               -- { [axis]: { score, confidence, probabilities, evidence } }
  sources       jsonb not null,               -- [{ kind, date, text }]：这次实际读了的原文
  source_counts jsonb not null,               -- { retro, observation, declaration, learned }
  chars         integer not null check (chars >= 0),
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

create index if not exists idx_self_portraits_user
  on self_portraits (user_id, created_at desc);

alter table self_portraits enable row level security;

drop policy if exists "self_portraits_owner" on self_portraits;
create policy "self_portraits_owner" on self_portraits
  for all using (auth.uid() = user_id);
