create table council_personas (
  key text primary key,
  display_name text not null,
  is_builtin boolean not null default true,
  grounding_note text not null,
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint council_persona_custom_needs_owner
    check (is_builtin or owner_user_id is not null)
);

create table council_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references ideas(id) on delete cascade,
  title text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table council_session_personas (
  session_id uuid not null references council_sessions(id) on delete cascade,
  persona_key text not null references council_personas(key) on delete restrict,
  turns_since_last_spoke int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (session_id, persona_key)
);

create table council_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references council_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','persona')),
  persona_key text references council_personas(key),
  grounded_reference text not null default '',
  content text not null,
  sharpest_question text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint council_message_persona_role_check check (
    (role = 'user' and persona_key is null) or (role = 'persona' and persona_key is not null)
  )
);

create unique index idx_council_message_idempotency
  on council_messages (session_id, idempotency_key) where idempotency_key is not null;
create index idx_council_messages_session on council_messages (session_id, created_at);
create index idx_council_sessions_user on council_sessions (user_id, updated_at desc);

alter table council_personas enable row level security;
alter table council_sessions enable row level security;
alter table council_session_personas enable row level security;
alter table council_messages enable row level security;

create policy "council_persona_read_builtin_or_own" on council_personas
  for select using (is_builtin or owner_user_id = auth.uid());

create policy "council_persona_owner_write" on council_personas
  for insert with check (not is_builtin and owner_user_id = auth.uid());

create policy "council_persona_owner_update" on council_personas
  for update using (not is_builtin and owner_user_id = auth.uid());

create policy "council_persona_owner_delete" on council_personas
  for delete using (not is_builtin and owner_user_id = auth.uid());

create policy "council_session_owner" on council_sessions
  for all using (auth.uid() = user_id);

create policy "council_session_persona_owner" on council_session_personas
  for all using (
    session_id in (select id from council_sessions where user_id = auth.uid())
  );

create policy "council_message_owner" on council_messages
  for all using (auth.uid() = user_id);

insert into council_personas (key, display_name, is_builtin, grounding_note) values
  ('sunzi', '孙子', true,
   '《孙子兵法》：知己知彼，百战不殆；五事（道天地将法）——先判断根本条件是否具备，再谈具体打法；未战先算胜负，重视先胜后战而非边打边看。'),
  ('mao', '毛泽东', true,
   '实事求是；没有调查就没有发言权；矛盾论——抓主要矛盾和矛盾的主要方面，不要在次要问题上纠缠；群众路线——真实情况在一线，不在会议室。'),
  ('gates', '比尔·盖茨', true,
   '软件/平台护城河思维——先想清楚什么会形成难以复制的壁垒；"你最不满意的客户是你最大的学习来源"，重视负面反馈胜过正面反馈；长期主义的技术判断。'),
  ('munger', '查理·芒格', true,
   '多元思维模型——单一学科视角容易被误导；反过来想（逆向思维）——先想清楚怎样会失败，再避免那样做；能力圈原则——诚实划清自己真正懂的范围。'),
  ('drucker', '彼得·德鲁克', true,
   '"企业的目的是创造顾客"，而不是利润本身；管理者五个自问——我们的顾客是谁、顾客认为的价值是什么、我们的成果是什么、我们的计划是什么；重视成果而非活动量。'),
  ('christensen', '克莱顿·克里斯坦森', true,
   '颠覆式创新理论——新进入者常常从被忽视的低端或非消费市场切入；Jobs-to-be-Done框架——顾客"雇用"产品来完成一件具体任务，要问清楚那件任务是什么，而不是问顾客想要什么功能。'),
  ('graham', '保罗·格雷厄姆', true,
   'Make Something People Want——先确认真的有人需要，再谈规模；"先做不可规模化的事"——早期阶段应该亲自、笨拙地手动服务好第一批用户，而不是急于自动化。'),
  ('taleb', '纳西姆·塔勒布', true,
   '反脆弱——关注在不确定性中会变得更强还是更弱，而不是只关注平均情形；黑天鹅——警惕依赖"历史上没发生过"作为不会发生的证据；非对称风险（skin in the game）——问清楚谁在真正承担下行代价。');
