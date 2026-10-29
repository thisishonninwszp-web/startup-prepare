# P4 反馈、跨想法学习与归档条件执行计划

> **For agentic workers:** 用subagent-driven-development分工反馈后端、归档条件后端和UI；root负责观察调整与接触提纲桥接。先观察测试失败再实现，分别做规格和质量复核。沿用当前有依赖的功能分支，不提交旧变更、不部署、不执行远端迁移。

**Goal:** 将真实接触与既有验证明确关联到假设，在限定范围内跨想法复用，经过预览确认调整观察任务，并在归档条件得到人工核对后提供一次性复查提示。

**Architecture:** 复用现有validations和outreach，新增owner隔离、可追溯的反馈/适用关系、归档条件与观察调整日志。新模块不代填二元验证信号，不修改想法状态或last_activity_at，不发送消息或调用AI。私有反馈原话与用户解释分开保存。

**Tech Stack:** Next.js14、TypeScript、Tailwind/shadcn、Supabase PostgreSQL和现有UI/请求身份工具，不替换技术栈。

## 单元A：反馈记录与适用关系（迁移111）

- [x] `lib/domains/observations/feedback/{domain,commands,queries,scope}.ts`，`app/(app)/ideas/feedback-actions.ts`。
- [x] 反馈锚定本人想法，可引用该想法的既有validation（从服务器复制备注、has_pain/will_pay和时间）或手动记录接触/无回复；可关联本人outreach画布。
- [x] 手动记录保留原话/接触笔记、角色/情境与用户解释；“逐字原话”仅是用户明确声明，不把validation.note自动称为客户原话。无回复不是无需求。
- [x] 既有validation的信号只读，手动笔记不自动创建validation，不自动刷新真实接触计时；录入信号仍走原有入口和规则。
- [x] 确认一项反馈适用于其他本人想法时，必须写假设、适用群体/情境、局限与反例/未知；来源信号不复制成目标想法信号。
- [x] 关系确认/撤回追加历史，带预期关系版本；撤回不删除原记录。原始来源快照不可覆盖。
- [x] 按单调序号分页；可查旧反馈/想法/验证，不只显示固定前N项。owner、请求冲突、撤回并发和无验证副作用实际SQL测试。

## 单元B：归档条件与一次性复查提示（迁移112）

- [x] `lib/domains/observations/feedback/reconsideration-{domain,queries,commands}.ts`，`app/(app)/ideas/reconsideration-actions.ts`。
- [x] 仅给本人已归档想法保存条件版本：学到了什么、什么变化值得再看、如何核对、适用范围；明确当前status仍为归档。
- [x] 条件核对由用户执行，支持met/not_met/unknown；逐字引用新的真实材料并注明覆盖。已知合成/AI输入不能升级为实际触发证据。
- [x] 支持手动材料与本人观察运行/企业记录，引用实际记录字段和quote，不在任意JSON字段中搜索字符串就当作证据。
- [x] 每版条件只产生一次复查提示，重复核对保留历史但不刷屏；确认已看后追加回执。修改条件生成新版本，可重新提醒。
- [x] 工作台只提示仍归档且条件被人工核对满足的对象；不自动恢复想法、不自动Go/Kill，不创建后台通知/自动化。
- [x] 触发、确认、条件撤回及版本关系均owner隔离、幂等、不可覆盖；重复触发和无status/activity修改实际SQL测试。

## 单元C：反馈驱动观察调整（迁移113）

- [x] `lib/domains/observations/feedback/{task-adjustments,task-diff}.ts`、`app/(app)/workbench/feedback-task-actions.ts`、`feedback-task-panel.tsx`。
- [x] 用户选择本人反馈与观察任务，写调整理由，编辑来源、固定/探索词组、停止条件。无AI推测，不扫描私人邮件。
- [x] 从数据库读取冻结原配置，逐项展示新增/移除/修改；地域、语言、时间、过滤变化提示不可拼接旧趋势。
- [x] 反馈必须属于任务想法，或有当前有效的跨想法确认关系；撤回后不可继续沿用旧提案。
- [x] 确认时锁任务并核对baseVersionId，原子调用108的save_decision_observation_version并保存提案采用记录；过期配置拒绝，不覆盖新版本。
- [x] 失联重试返回已保存结果，不能重复建版本；不因保存提案修改验证或想法计时。

## UI与既有模块

- [x] `app/(app)/workbench/feedback-impact-panel.tsx`：既有验证引用、手动接触笔记、解释/适用范围、跨想法确认与撤回。
- [x] `app/(app)/ideas/[id]/reconsideration-panel.tsx`：归档条件与材料核对历史。
- [x] 工作台、学习页和想法详情显示当前关联和归档复查提示；关闭功能/缺迁移保留原页面。
- [x] 扩展已有outreach/new与createCanvas的来源桥接，只由用户确认创建私人画布，保留反馈或观察出处，服务器重查归属；不发送信息、不调用Gemini。
- [x] `FEEDBACK_LEARNING_ENABLED`默认关闭；观察调整还需要DECISION_OBSERVATIONS_ENABLED。新API只服务端，私人反馈不会因既有新闻AI许可而自动发送。

## 验证与发布

运行Vitest、ESLint、TypeScript、生产build；SQL测试真实引擎中111/112/113及108调用的联合行为。浏览器覆盖：原话/解释分离、无回复保留未知、验证只读来源、跨想法确认/撤回、词组差异及过期配置拒绝、归档条件/触发/回执、防重复和手机布局。

迁移顺序111→112→113；113需要108，使用企业来源的112需要110（可选来源不可用时明确提示，不假装已查证）。未完成迁移时不打开新开关。远端迁移、真实账号验收和部署独立记录，不把本地夹具通过当成上线。

本地交付完成：见[交付说明](2026-10-27-feedback-learning-delivery.md)。生产迁移、实际账号验收与部署仍待执行，以上勾选仅指本地实现与验证。
