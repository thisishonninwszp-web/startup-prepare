# A期：事件档案与跨天时间线实施计划

> **For agentic workers:** 使用 executing-plans 在本会话逐项执行；获得并行实施授权后可使用 subagent-driven-development。先验证本期，再进入B期；本文件是执行说明，不是已经实施的记录。

**Goal:** 用户能将多天报道归入一个可修正的事件，按可靠的时间阅读，并看清来源时间与系统记录时间的区别。

**Architecture:** 新增私有事件、不可覆盖来源快照和追加归属记录；已有相似检索只给候选。Supabase事务RPC处理归属变更、幂等和版本号，页面分区读取，不调用新AI生成。

**Tech Stack:** Next.js 14 App Router、TypeScript、Tailwind/shadcn、Supabase、Vitest、Playwright。

设计：[事件档案设计](../specs/2026-10-25-event-dossiers-design.md)。范围：F01基础、F07。暂不做AI概览、来源家谱、自动定时追踪或锁定功能。

## 1. 进入条件与文件边界

- [ ] 执行 `git status --short`、`git log -1 --oneline`，确认没有覆盖别人的工作；`.claude/launch.json` 的本机改动保持原样。
- [ ] 读取仓库最新 AGENTS.md，检查当前迁移最高序号；建议新迁移名为 `105_signal_event_dossiers.sql`，如被占用则顺延并同步文档/测试。
- [ ] 跑既有 `npm test` 和 `npm run db:check` 记录基线；没有通过则先定位基线问题，不能把已有错误混作本期成功。

新增路径：

```text
lib/domains/signals/events/domain.ts
lib/domains/signals/events/domain.test.ts
lib/domains/signals/events/queries.ts
lib/domains/signals/events/queries.test.ts
lib/domains/signals/events/commands.ts
lib/domains/signals/events/commands.test.ts
lib/domains/signals/events/snapshots.ts
lib/domains/signals/events/snapshots.test.ts
app/(app)/signals/events/page.tsx
app/(app)/signals/events/actions.ts
app/(app)/signals/events/actions.test.ts
app/(app)/signals/events/event-picker.tsx
app/(app)/signals/events/[eventId]/page.tsx
app/(app)/signals/events/[eventId]/event-timeline.tsx
app/(app)/signals/events/[eventId]/event-candidates.tsx
app/(app)/signals/events/event-timeline.test.tsx
supabase/migrations/105_signal_event_dossiers.sql
scripts/verify-event-dossiers.mjs
```

修改挂载点：`signals/[id]/page.tsx`、`signals/memory/page.tsx`、`signals/today-blocks.tsx`、`scripts/check-schema.mjs`。不把既有整套新闻模块重构纳入本期。

## 2. 领域契约：先让时间说实话

- [ ] 在 `domain.test.ts` 先写排序和边界测试，运行 `npx vitest run lib/domains/signals/events/domain.test.ts` 观察未实现失败。

```ts
type TimelineMode = 'published' | 'occurred' | 'captured';
type TimelineEntry = {
  signalId: string;
  snapshotId: string;
  title: string;
  publishedAt: string | null;
  capturedAt: string;
  occurred: { from: string; to: string | null; precision: 'day' | 'month' | 'year'; quote: string } | null;
  firstRecordedOpenAt: string | null;
};
```

对外纯函数定义为 `timelineKey(entry,mode)`、`groupTimeline(entries,mode)`、`validateOccurrence(occurred,capturedText)`、`snapshotHash(payload)`。`groupTimeline`返回 `{ dated: TimelineEntry[], undated: TimelineEntry[] }`，不把无日期材料删掉。

```ts
it('发布日未知时不退回抓取日冒充', () => {
  const entry = makeEntry({ publishedAt: null, capturedAt: '2026-10-25T01:00:00Z' });
  expect(groupTimeline([entry], 'published').undated).toEqual([entry]);
});
it('发生日期必须能引用所存材料，月级日期不显示伪造的某一天', () => {
  expect(() => validateOccurrence({ from:'2026-10', to:null, precision:'month', quote:'文中没有的话' }, '原文')).toThrow();
});
it('排序时间相同时用快照ID稳定打破平局', () => {
  const entries = [makeEntry({ snapshotId:'b' }), makeEntry({ snapshotId:'a' })];
  expect(groupTimeline(entries, 'captured').dated.map(x => x.snapshotId)).toEqual(['a','b']);
});
```

`makeEntry`只在测试中创建上述完整DTO，默认各时间合法、occurred为空。时间展示统一通过Tokyo formatter；数据库缺失值保持null，不补“今天”。

- [ ] 实现纯函数：合法日期/区间/精度校验；发生日期的quote逐字存在于捕获文本；归一化后计算SHA-256哈希。哈希负载包含标题、最终URL、发布时刻、捕获范围和捕获文本，避免正文相同却元数据不同被误复用。
- [ ] 重跑上述测试通过，加入时区跨日、无效日期、未来发布日期原样显示并标来源异常、同日分页不重不漏的边界。

## 3. 数据库：私有事件和不可覆盖的材料

- [ ] 在迁移文件中创建以下三表，不改已有 `external_signals` 的语义。

```sql
create table signal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  scope_note text not null default '' check (char_length(scope_note) <= 1000),
  revision bigint not null default 0 check (revision >= 0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, user_id),
  unique (user_id, client_request_id)
);

create table signal_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null references external_signals(id) on delete restrict,
  title text not null,
  source_name text not null,
  source_url text,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  source_fetched_at timestamptz,
  capture_scope text not null check (capture_scope in ('summary','excerpt','body')),
  captured_text text not null check (char_length(captured_text) between 1 and 100000),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  unique (id, user_id),
  unique (id, user_id, signal_id),
  unique (user_id, signal_id, payload_hash)
);

create table signal_event_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  signal_id uuid not null references external_signals(id) on delete restrict,
  snapshot_id uuid,
  action text not null check (action in ('include','exclude')),
  revision bigint not null check (revision > 0),
  client_request_id uuid not null,
  note text not null default '' check (char_length(note) <= 1000),
  occurred_from text,
  occurred_to text,
  occurred_precision text check (occurred_precision in ('day','month','year')),
  occurred_quote text,
  created_at timestamptz not null default now(),
  foreign key (event_id,user_id) references signal_events(id,user_id) on delete cascade,
  foreign key (snapshot_id,user_id,signal_id) references signal_source_snapshots(id,user_id,signal_id),
  check (action <> 'include' or snapshot_id is not null),
  check (num_nonnulls(occurred_from, occurred_precision, occurred_quote) in (0,3)),
  unique (event_id,revision),
  unique (user_id,client_request_id)
);
create index signal_event_memberships_current_idx
  on signal_event_memberships(user_id,event_id,signal_id,revision desc);
create index signal_events_owner_idx on signal_events(user_id,created_at desc,id);
create index signal_snapshots_owner_time_idx on signal_source_snapshots(user_id,published_at,id);
```

这里的capture_scope只描述保存了多少原文，不是证据等级。occurred_*放在归属修订里，允许对同一篇报道选择与本事件有关的不同节点；不能修改原始快照。

- [ ] 开启三表RLS，每张表的读取和事件自身元数据修改都限制 `auth.uid() = user_id`。撤销anon/authenticated对快照、归属表的直接INSERT/UPDATE/DELETE；快照只由服务端受控插入，归属只经RPC。增加不可覆盖触发器，父账号/事件生命周期删除的级联路径需单独验证。
- [ ] 快照插入触发器用数据库时间写captured_at，拒绝客户端/普通写入伪造过去捕获时刻；`source_fetched_at`明确只保存旧新闻元数据，不把它当新快照的历史捕获时间。
- [ ] 设计两个事务RPC：`create_signal_event(p_user_id,p_title,p_scope_note,p_request_id)` 与 `revise_signal_event_member(p_user_id,p_event_id,p_signal_id,p_snapshot_id,p_action,p_request_id,p_note,p_occurrence)`。
- [ ] RPC使用SECURITY DEFINER、固定search_path，撤销PUBLIC执行权限，仅授予authenticated和service_role。authenticated调用必须检查auth.uid与p_user_id一致；service role路径由服务端会话传userId，并仍验证event、snapshot、signal三者归属关系。参数中的occurred_quote必须与对应snapshot核验，不能只信客户端已校验。
- [ ] 成员RPC先检查同user请求ID是否已执行；相同负载返回原结果，不同负载报冲突。随后锁event行，验证所有权，revision递增一次，插入对应归属记录。单事务失败不得增加revision。
- [ ] 提供读取当前归属的SQL查询：按event_id+signal_id取最大revision后，只保留action='include'。不能先过滤include再取最新，否则已移出报道会复活。

数据库集成验收：用户A不能读取/关联B的event或snapshot；service role把A快照写进B事件被外键拒绝；同请求重复返回同记录；两个并发include分配不同revision；exclude后当前视图无该条但历史仍在；失败不留下半个事件变更。

## 4. 服务端快照和命令

- [ ] `snapshots.test.ts` 先测试：仅有简介时capture_scope='summary'、抓不到正文不虚构body、同输入复用快照、后来补抓产生新快照、客户端不能提供可信captured_at。
- [ ] `snapshots.ts` 定义 `captureSignal(viewerId,signalId): Promise<{snapshotId:string;payloadHash:string}>`：从当前可见新闻读取资料，优先用已存摘录；需要新抓取时经已有article管道，限制长度与超时；保存失败向用户报错，不返回虚假ID。
- [ ] 复用`sharedViewFor(viewerId)`处理新闻资料的可见范围；新闻共用不意味着用户能访问其他人的快照。服务器重新读source，不接受浏览器上传“原文”。
- [ ] `commands.test.ts` 先验证事务RPC参数、归属检查、重试冲突与异常传递。
- [ ] `commands.ts` 暴露：

```ts
createEvent(viewerId: string, input: { title:string; scopeNote:string; requestId:string }): Promise<{id:string}>;
includeSignal(viewerId: string, input: { eventId:string; signalId:string; requestId:string; note:string; occurred:TimelineEntry['occurred'] }): Promise<{revision:number}>;
excludeSignal(viewerId: string, input: { eventId:string; signalId:string; requestId:string; note:string }): Promise<{revision:number}>;
```

实现顺序固定：校验输入→确认事件归属/来源可见→获取快照→RPC原子提交→返回版本。快照保存成功但成员事务失败时可保留未引用快照，不能伪造“已加入事件”；后续清理按明确保留策略单独处理。

- [ ] `actions.test.ts` 验证未登录无DB/抓取、伪造userId无效、跨用户操作失败、网络失败保留输入。
- [ ] `events/actions.ts` 从会话取得viewerId，传入上述命令；操作成功仅失效该事件和记忆页缓存，返回明确的成功/失败结果。React18界面使用显式busy+ref守卫，不依赖async useTransition维持请求锁。

## 5. 读取与候选，不把相似当归属

- [ ] `queries.test.ts` 先写分页、私有查询、移出后不复活、时间缺失和共享owner分离测试。
- [ ] `queries.ts` 定义 `listEvents(viewerId,cursor?)`、`getEvent(viewerId,eventId)`、`listTimeline(viewerId,eventId,{mode,cursor,limit})`、`suggestMembers(viewerId,eventId,{limit})`。
- [ ] `listTimeline`每页20项，按模式时间+快照ID稳定排序，日期缺失独立游标组；查询层取已确认当前归属，不能先拉全库再浏览器过滤。首屏不抓取网页、不生成AI。
- [ ] 首次打开记录按viewer与signal从signal_opens取min(first_at)，分页扫描或SQL聚合，不受PostgREST默认1000行截断；标签显示“系统记录首次打开”。
- [ ] `suggestMembers`复用storyAround/已有匹配候选，排除已归入、已明确移出的项；最多20项，展示为什么可能有关，允许无候选。候选服务不可用时档案仍可读，并显示无法查找；不能自动写正式归属。
- [ ] 同主题不同事件的夹具必须涵盖“日银加息”和“某企业因自身经营问题提价”，不能因同时谈成本就合并。

## 6. 页面与入口

- [ ] 先写 `event-timeline.test.tsx`：来源链接有出处、空日期标签、回溯补录标签、旧成员移出、AI失败不影响原始时间线。用当前Vitest oxc JSX配置渲染真实组件，不写只匹配实现字符串的测试。
- [ ] 实现`events/page.tsx`：本人事件列表、搜索标题、创建事件；没有数据时允许从任意新闻开始，不要求先填分类。
- [ ] 实现`event-picker.tsx`：新闻详情中“加入事件”，搜索已有事件或输入标题新建；默认原标题只作可编辑建议，不必经过AI。提交中防双击，失败不清空输入。
- [ ] 实现`events/[eventId]/page.tsx`：标题/范围、时间排序切换、当前报道、候选区；没有高级分析时不显示占位大面板。
- [ ] 实现`event-timeline.tsx`：手机先显示日期、标题、来源和一段允许摘录，详细时间按需展开。发生时间缺失明确提示，不把整段AI背景当事实节点。
- [ ] 实现`event-candidates.tsx`：候选单独分区，每项有加入/不属于这件事；用户确认后才进入时间线。保留记录作为后续纠错输入，不把用户反馈自动推广到所有读者。
- [ ] 新闻详情、记忆页、TodayBlocks追踪卡挂载入口；已有关注静音按钮保持原义。事件成员内存在静音项时折叠显示并给恢复入口，不删除归属。

## 7. 浏览器与真实事件验收

- [ ] `scripts/verify-event-dossiers.mjs` 使用真实组件+延迟模拟server actions复核基础交互，沿用已有verify-signal-reading脚本的本地夹具方式；它不代替数据库端到端验收。
- [ ] 在测试环境建立两个测试账号，实际执行创建→加入两天报道→刷新→移出→刷新→查看历史→另一账号拒绝访问。
- [ ] 测试双击只产生一次成员修订；保存期间切换页面/网络失败后重试不会重复归入；长标题和390px宽度没有横向溢出。
- [ ] 选3个真实事件：持续更新事件、同主题但应拆开的事件、只有转载且时间不清的事件。逐项检查归属、原文、时间与未知展示，不用AI自我评价替代人工验收。
- [ ] 检查事件页首屏请求：不含实时网页抓取或AI调用，首批时间线限定20项；候选区失败不导致整页500。

## 8. 发布门槛与回退

- [ ] 在`scripts/check-schema.mjs`加入三表字段及必要RPC的可执行探针；仅表存在不等于事务/权限正确，保留数据库集成测试结果。
- [ ] 跑全部Vitest、ESLint、TypeScript、生产build和浏览器脚本；本期无新AI调用，既有信号页测试必须继续通过。
- [ ] 仅提交本期明确文件，附实际验证结果。执行新迁移前核对目标Supabase项目与备份策略；首次发布新入口默认关闭。
- [ ] 用户授权部署后，迁移→远端结构检查→部署→测试账号验收→为本人开启事件入口。不能只凭Vercel成功就宣称真实数据流程完成。
- [ ] 回退关闭事件入口，保留三表和用户快照，旧信号页继续运行。已保存私人数据不通过删表回滚清掉。

本期完成的产品标准：隔一周回到一个事件，能找到当时和后来的报道、看清时间来路、修正误归项；用户不需要先理解来源图谱、解释模型或历史回放。
> 执行状态更新（2026-10-25）：当前范围已扩展至A–E；本文保留原始A期任务定义，实际完成情况与部署边界见[交付说明](2026-10-25-event-dossiers-delivery.md)。

