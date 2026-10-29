# 事件档案：五期实施路线图

> 执行状态更新（2026-10-25）：用户已要求完成全部A–E，本地实现和回归已推进至全阶段。下文为原始规划时点记录；当前实现、收敛调整及尚未执行的远端验收统一见[交付说明](2026-10-25-event-dossiers-delivery.md)。

> **For agentic workers:** 使用 executing-plans 按期执行；需要并行实施时，先读取 subagent-driven-development 并按已批准的文件边界分工。本轮只编写计划，不启动实施。

**Goal:** 将持续读新闻积累为可追踪来源、解释和个人理解变化的事件档案。

**Architecture:** 以私有、稳定UUID的事件档案为中心，复用现有新闻库、来源抓取、判断账本、个人关注和周报。先建立不可覆盖的材料快照和时间边界，再接AI研究，最后实现历史回放。

**Tech Stack:** Next.js 14 App Router、TypeScript、Tailwind/shadcn、Supabase PostgreSQL、Gemini（统一经 `@/lib/ai` / ai-gateway），Vercel。

设计依据：[完整设计](../specs/2026-10-25-event-dossiers-design.md)。第一期执行步骤：[A期计划](2026-10-25-event-dossiers-phase-a.md)。

## 0. 范围与交付方式

- 不改或增加锁定机制，不引入评分、星级、百分比的想法评价。
- 保留外部信号一级入口；不为十一项能力新增十一项导航。
- 每期一个可用结果，迁移采用新增表/列与明确降级；不删除既有数据，不把新功能发布与历史全量回填绑在一起。
- 后续迁移文件编号从105起只是本路线图的建议；实施前先检查最新序号，不能覆盖并行工作。
- 下列任务复选框代表未来实施，当前全部未开始。用户批准本计划后，优先执行A期；本轮不提交产品代码、不执行SQL、不部署。

## 1. 可复用能力与必须补的边界

| 现有代码 | 复用 | 必须补的边界 |
|---|---|---|
| `lib/domains/signals/memory.ts` / `same-story.ts` | 报道检索、前后报道候选 | 当前相似度与标题匹配不等于稳定事件归属 |
| `lib/domains/signals/followups.ts` | 报告之间的事件提示、前后摘录 | 短标签不作为永久ID，旧报告不能回写 |
| `lib/domains/signals/article.ts` / `sources.ts` | 抓取、清理、来源集合 | 保存每次实际获得的版本与抓取范围 |
| `lib/domains/signals/reading-insight-shared.ts` | 来源边界、摘录核验说明 | 不把不同措辞直接宣称为事实变化 |
| `lib/domains/signals/reading-preferences.ts` | viewer偏好、静音 | 新事件ID与旧标签偏好需显式过渡，不能重置用户设置 |
| `questions.ts` / `questions-shared.ts` | 问题、研究、追加看法 | 一个解释的证据不能自动替其他解释背书 |
| `practice.ts` / `judgment-updates.ts` | 预测、正反材料、追加修正 | 原判断及原到期条件保持，不用新解释覆盖旧账 |
| `weekly.ts` | 周报入口 | 当前周报可重写，个人理解变化须引用冻结的本人记录 |
| `opens.ts` / `reading-session.ts` | 首次记录打开、阅读结束 | 日志只说明被记录的打开，不能冒充真正首次知晓 |
| `lib/ai/index.ts` / `ai-gateway.ts` | AI模型、错误、日志、引用核验 | 新prompt独立文件，显式userId/module/operation，按输入版本缓存 |

## 2. 总体结构

```text
新闻/公告/原始窗口
  → 来源快照（何时发布、何时捕获、当时的内容）
  → 用户确认归入事件（稳定ID、可移出、修订留痕）
  → 事件档案
      ├─ 时间线与带引用概览
      ├─ 来源家谱与未知
      ├─ 竞争解释、预期与换位问题
      ├─ 原始观察与跨事件暗线
      └─ 本人判断/笔记变化 → 周报
  → 截止时刻的冻结材料包 → 历史回放
```

共同准则：AI的草稿可以为空；私有笔记、判断和解释只属于viewer；时间缺失不猜；抓取失败不算未发生；用户仍可只阅读后结束。

## 3. A期：让一件事跨天持续可读

覆盖 F01、F07。首先交付可读、可修正的事件时间线，不依赖新的AI摘要。

- [ ] 新增事件档案、来源快照、追加归属记录三个领域对象。
- [ ] 新闻详情“加入事件”、追踪区“查看事件”、记忆页“事件档案”索引。
- [ ] 按日期分页呈现材料；切换“报道发布顺序 / 已有出处的事件发生顺序 / 系统收录顺序”。无发生日期的材料单列，绝不丢弃。
- [ ] 显示系统记录的首次打开时间；显示回溯补录标签和时间来源。
- [ ] 相似报道作为待确认候选；支持归入、移出和单独新建，操作幂等。
- [ ] 接旧关注/静音：旧设置保留，事件页按已确认成员解释偏好冲突；个人整体事件偏好在B期引入显式eventId后再迁移，不能依短标签自动覆盖。

**入口及文件：** `app/(app)/signals/events/page.tsx`、`events/[eventId]/page.tsx`、`events/actions.ts`；`lib/domains/signals/events/{domain,queries,commands}.ts`、`snapshots.ts`。详情和记忆页仅挂载入口，新逻辑不塞回已有大页面。

**新增数据：** `signal_events`、`signal_source_snapshots`、`signal_event_memberships`。完整字段、SQL与测试见A期计划。

**验收：** 同名不同事件不混合；一个事件包含不同日期报道；用户移出误归项后当前时间线消失，旧归属记录仍在；没有发布日期不误用抓取日期；共享读者互相看不到档案、名称或操作历史。新增数据库不可用时既有新闻可读。

**上线门槛：** 用3个用户主动选定的事件完成真实阅读，至少覆盖一个同主题但应拆开的例子。只有用户确认的归属进入正式时间线。

## 4. B期：看清来源和未知，生成可靠档案概览

覆盖 F06、F11，补全 F01概览。依赖A期稳定身份与来源快照。

- [ ] 新建 `source-lineage.ts` / `source-lineage-shared.ts`：从已捕获文档显式链接、转载声明和原文引用提出关系；写入时记录关系依据的快照和摘录。
- [ ] `signal_source_links` 保存 `from_snapshot_id,to_snapshot_id,relation,quote,confirmed_by,created_at`；relation限定原始发布/明确引用/明确转载，未确认候选另存AI草稿，不伪装成已知关系。
- [ ] 来源家谱先用可展开列表呈现，可见“原公告→报道→转载”；第二份独立材料的身份可人工更正，不凭域名数推断。
- [ ] 新建 `unknowns.ts` / `unknowns-shared.ts` 和 `signal_event_unknowns`、`signal_event_unknown_updates`：保存问题、怎样算答上、首次提出时间及追加答案/来源；只有用户确认才标已补齐。重新出现疑问时追加重开记录。
- [ ] 从原材料生成未知问题草稿，用户可编辑/接受/删除草稿；没有足够依据不强行凑数量。
- [ ] `signal_event_notes` 保存本人随手笔记：user_id、event_id、text、created_at、client_request_id；只追加，修正用新记录关联原笔记。它不要求预测期限、不作为事实来源；供D期回看引用本人原话。
- [ ] 新建 `dossiers.ts` 和 `signal_event_dossier_versions`：概览含事件范围、已报道变化、分歧、未知、下个有出处节点；固定引用已确认成员快照，记录输入哈希、prompt版本、生成时间、成员版本号。
- [ ] 新建基于eventId的个人偏好覆盖；旧标签偏好不批量推断归并，用户确认事件成员后提供“沿用此设置”，冲突明确展示并允许恢复。

**目标文件：** `lib/domains/signals/events/{source-lineage,unknowns,dossiers,preferences}.ts`及各自`*-shared.ts`/测试；`lib/ai/signal-events.ts`；`app/(app)/signals/events/[eventId]/{sources-panel,unknowns-panel,dossier-summary}.tsx`；AI出口为`lib/ai/index.ts`。

**关键输入输出：**

```ts
type SourceRef = { snapshotId: string; quote: string };
type DossierDraft = {
  scope: string;
  reportedChanges: { text: string; refs: SourceRef[] }[];
  disagreements: { text: string; refs: SourceRef[] }[];
  unknownQuestions: string[];
  nextNodes: { text: string; on: string | null; refs: SourceRef[] }[];
};
```

**验收测试：**

```ts
it('不把十篇明确转载当十份独立材料', () => {
  expect(independentRoots(lineageWithTenReprints)).toEqual(['original-release']);
});
it('禁止把不属于本档案的摘录发布成概览', () => {
  expect(() => validateDossierRefs(draft, allowedSnapshots)).toThrow();
});
it('追加答案不改变最初问题和旧答案', async () => {
  await answerUnknown(userId, unknownId, answer);
  expect(await readUnknownHistory(userId, unknownId)).toHaveLength(2);
});
```

上述测试夹具由对应测试文件内创建：十篇转述指向同一公告；越界草稿引用另一个viewer快照；unknown历史包含创建记录与本次答案。不得用空mock替代真实引用校验函数。

**门槛：** 概览每个事实性段落可回到快照原文；无法识别来源链就显示未知，循环引用会被检测而不是无限展开；失败生成不覆盖上一版概览。

## 5. C期：用材料区分解释，而不是不断生成分析

覆盖 F03、F02、F10。依赖B期引用与未知管理。

- [ ] `explanations.ts` / `explanations-shared.ts`：每事件默认展示最多3条解释，用户可继续添加；保存文字、前提、可区分观察及提出时间，不强制三个解释，不打胜率分。
- [ ] `signal_event_explanations` 与 `signal_event_explanation_updates` 追加解释版本；引用边写入 `signal_event_explanation_evidence`，记录材料、相对哪一版解释、用户确认状态。AI关联先是草稿。
- [ ] `expectations.ts`：保存预期、截止时刻、具体判定口径和适用解释版本。到期呈现发生/未发生/尚不知道；确认结果由用户明确写入现有预测的hit/miss，未知则保持pending，不改变想法状态。
- [ ] 预期若可映射现有预测，保留其 `prediction_id`；对于只记录未知的观察条件不强行新建预测。未发生结论必须有满足判定口径的材料或用户明确记录，没新闻/抓取失败不能自动判否。
- [ ] `perspectives.ts`：读取同一组允许快照，顾客/员工/经营者/供应商四种视角按需生成问题和约束；事实性条目必须有引用，没有材料就输出“需要问的问题”。
- [ ] 页面只在用户展开区域时呈现；不是另一组聊天室，也不显示人格化代言人的假想对话。

**目标文件：** `lib/domains/signals/events/{explanations,expectations,perspectives}.ts`和shared/tests；`app/(app)/signals/events/[eventId]/{explanations-panel,expectations-panel,perspective-tabs}.tsx`；`lib/ai/signal-events.ts`按操作拆prompt。

**验收：** 同一证据可以支持A、挑战B，但不能只有一个全局立场；解释修订后旧引用仍指旧版；到期没查到材料显示未知；换位输出不会出现“员工认为……”这种没有当事人出处的归因。

**测试输入与断言：**

```ts
expect(resolveExpectation({ deadlinePassed: true, check: 'fetch_failed' })).toBe('unknown');
expect(resolveExpectation({ deadlinePassed: true, check: 'no_report' })).toBe('unknown');
expect(explanationEvidence('A-v1', sourceId).targetVersion).toBe('A-v1');
expect(() => validatePerspectiveClaim({ text: '员工愿意降薪', refs: [] })).toThrow();
```

`resolveExpectation`只分类检查结果是否足以交给用户确认，不自动落库hit/miss；真实判定依赖用户确认及原先保存的条件。

## 6. D期：把持续研究接回现实与本人理解

覆盖 F09、F04、F05。依赖A–C的稳定版本和可引用证据。

### D1 现实观察窗口

- [ ] `windows.ts` / `window-checks.ts`：窗口保存公开HTTP(S)来源、要观察的字段、来源时区、预期更新节奏；节奏只是数据，创建窗口不擅自开启定时任务或通知。
- [ ] `signal_observation_windows` + `signal_observation_window_checks`：每次检查保存时间、内容哈希、捕获范围、提取值、出处及成功/失败状态；失败不写“无变化”，禁止覆盖历史成功快照。
- [ ] 优先复用已有来源适配器（RSS/官报/招聘等），普通网页先手动检查；遇登录墙/抓取限制显示不可检查，不绕过。
- [ ] 用户明确开启自动检查后才接定时调度；同一公开URL共享抓取缓存，私人解释仍各自保存。只在有可核对变化、失败需处理或用户要求时提醒。
- [ ] 服务器URL检查阻止本机、内网、云元数据地址和重定向到这些地址；限制超时、响应体、重定向次数。来源内容仅作数据，不执行页面里的指令。

### D2 新闻暗线

- [ ] `connections.ts`：关系两端必须是用户可见事件，保存中间主张、每条边的依据、推断、反证和替代解释。
- [ ] `signal_event_connections` + `signal_event_connection_versions`；AI只提出草稿，用户选择留存后进入自己的事件网络。
- [ ] 首次用户点“找联系”时只比较本人选定的2–5个事件，不后台全库两两组合；输入边界固定、引用验证复用B期。
- [ ] 关系卡先展示可读推理链，再考虑图形；不能因为存在图形连线就给人已证明因果的印象。

### D3 理解变化

- [ ] `understanding.ts` 读取本人的原判断、`signal_judgment_updates`、问题看法及事件笔记，统一成带时间和记录ID的只读流。
- [ ] `signal_understanding_reviews` 缓存用户选择生成的周期回看：写出原判断→新增材料→后来判断，并逐一引用本人记录。无判断记录时不推测用户心态。
- [ ] 在 `signals/week/page.tsx` 增加“我的理解变化”，保留现有公共周报。公共报告生成器、共用邮件不得自动带入私人回看。
- [ ] 引用原记录后来被删除时明确失效，不能用今天的新文本替换过去原文。

**目标文件：** `lib/domains/signals/events/{windows,window-checks,connections,understanding}.ts`及测试；`events/[eventId]/{windows-panel,connections-panel}.tsx`；`signals/week/understanding-review.tsx`；仅在用户开启自动检查时新增对应cron路由。

**验收：** 同一网页检查失败不抹掉旧值；相同输入不重复发AI；无本人记录不会输出“你以前以为”；私有网络URL和重定向被拒；未启用自动检查不会产生后台请求或提醒。

## 7. E期：能解释边界的历史回放

覆盖 F08。依赖A–D版本数据，但可以只对A/B已有材料回放，不要求每个事件具备所有高级模块。

- [ ] `replay.ts` / `replay-shared.ts`：创建冻结包时固定 viewer、eventId、cutoff、模式、快照ID与内容哈希。
- [ ] `signal_replay_sessions` + `signal_replay_packets`：系统当时档案与回溯补录两种模式，前者必须满足 captured_at <= cutoff，后者明确允许后来捕获但必须有过去发布日期凭据。
- [ ] 截止条件在数据库查询层应用，再构造标题、计数、摘要、搜索结果和导出；禁止先取最新摘要再在浏览器隐藏未来段落。
- [ ] 回放链接进入独立 `events/[eventId]/replay/[sessionId]`；时间步进只在用户点击揭晓后从服务器获取下一个允许包，不把未来数据预埋HTML或RSC payload。
- [ ] 旧网页链接默认显示保存版本，明确提示原站可能已更新；未揭晓前不自动打开实时原文。
- [ ] 用户先写下判断，单独标为回放练习，不混进真实预测成绩。现代AI只做引用整理，第一版不提供“AI当时预测有多准”的排行榜。
- [ ] 材料稀疏时如实显示覆盖范围，不用当前搜索悄悄填满。

**目标文件：** `lib/domains/signals/events/{replay,replay-shared}.ts`、对应测试；`app/(app)/signals/events/[eventId]/replay/[sessionId]/page.tsx`、`replay-actions.ts`；新SQL函数按userId与cutoff读快照，不授予客户端任意读全部版本的能力。

**核心断言：**

```ts
expect(visibleAt(snapshotCapturedAfterCutoff, cutoff, 'archived')).toBe(false);
expect(visibleAt(snapshotPublishedBeforeButCapturedAfter, cutoff, 'recovered')).toBe(true);
expect(await replayHtml(sessionId)).not.toContain(futureOutcomeTitle);
expect(await replayExport(sessionId)).not.toContain(futureOutcomeText);
```

以上分别覆盖“当时系统不知道”“后补材料模式”“HTML泄露”“导出泄露”。还需浏览器检查网络响应和预取，不只检查页面可见文字。

## 8. 跨期接口、成本和发布

### 领域调用边界

```ts
type OperationContext = { viewerId: string; eventId: string; requestId: string };
type FrozenInput = { memberRevision: string; snapshotIds: string[]; inputHash: string };
type GeneratedVersion = { id: string; input: FrozenInput; promptVersion: string; createdAt: string };
```

客户端不提供可信viewerId/快照正文；服务端会话生成上下文并重新读取允许输入。输入成员变化时旧分析标为“基于上一版材料”，重新生成另存版本，不悄悄更新引用。

### 性能与成本

- 事件页先返回缓存元数据和首屏20条时间线，历史游标加载；SQL索引包含user_id、event_id和排序键。
- 新快照保存即返回；抓取和AI以独立操作执行，使用请求ID避免双击重复任务。
- 首期候选每次最多20条，档案分析每次最多选12份快照；超出时让用户选择范围并明确覆盖，不能静默截断成“已分析全部”。后续根据真实耗时调整。
- AI成本记录用户、操作、输入快照数、token、耗时和失败；这是运维数据，不是用户评分。
- 同一输入哈希和prompt版本复用结果；主动刷新明确是重新请求。每个阶段上线后查看真实请求量，再决定是否自动化。

### 通用验收命令

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm run db:check
```

数据库检查只能验证部署结构，不能代替RLS和事务测试。新增RPC需要用两个用户和service role测试越权、重复请求、并发、失败回滚。浏览器至少覆盖手机、空数据、长标题、来源失效、缺迁移、AI失败、分页和回放网络边界。

### 发布和回退

每期新增单独功能开关，默认关闭；先执行兼容迁移，跑远端检查，再部署代码，最后仅为试用用户开启。旧阅读路径一直保留。发现问题时关闭新入口，保留用户已保存档案，不执行删表回滚。

本计划不预估精确工期。A期原型与3个真实事件验证完成后，再按误归率的实际案例、页面等待和AI请求成本确定下一期范围；不把功能数量或AI调用量当作产品价值。

## 9. 最终覆盖核对

| 需求 | 所在期 | 依赖 |
|---|---|---|
| 跨天事件档案 F01 | A基础、B概览 | 新闻库与快照 |
| 预期落空 F02 | C | 判定口径、时间、原预测 |
| 竞争解释 F03 | C | 来源引用、版本 |
| 新闻暗线 F04 | D | 多个已存在事件 |
| 理解变化 F05 | D | 本人真实判断/修正记录 |
| 来源家谱 F06 | B | 快照与明确引用 |
| 两只时钟 F07 | A | 原始时间与打开日志 |
| 时光机 F08 | E | 冻结版本与完整时间门 |
| 现实窗口 F09 | D | 公开来源、抓取适配器 |
| 换位阅读 F10 | C | 同一材料集及引用约束 |
| 未知清单 F11 | B | 事件身份与追加历史 |

执行优先级：A → B → C → D → E。任何一期未通过真实事件验收，都先修该期，不靠继续增加模块弥补。
