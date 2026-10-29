# 每日一门生意 B期：可核对拆解与行动实施计划

> **For agentic workers:** 使用subagent-driven-development分工报告事务/桥接、AI校验与生成、阅读和授权UI；root做集成、独立复核及验收。A期已通过273文件1767测试、SQL及16项浏览器检查，乐天实机因缺Access Key未接通。当前继续用户已批准的A→B→C→D计划，不自动部署/远端迁移/启动任务。

**Goal:** 将A期冻结材料组织成一篇有来源、有竞争解释、有未知的经营拆解，支持用户确认后沉淀方法或预览保存验证动作。

**Architecture:** 120保存报告、输入清单、逐次许可、生成请求租约、发布指针、用户方法和桥接回执。AI统一经lib/ai入口/gateway，测试全部mock，不实际发送资料。报告revision独立于119的材料revision；发布时校验材料版本/原发布指针，旧报告始终可读。不开启自动AI许可或定时生成，C期再实现。

**Tech Stack:** 原Next14/TS/Supabase/Tailwind/shadcn/Gemini封装/Vitest/PGlite/Chrome。

## 固定契约

- 生成：`{caseId,materialRevision,expectedReportRevision,snapshotIds,comparisonSnapshotIds,consentId,requestId}`。选择项必须是当前案例本人材料，角色正确；只允许公开字段/去标识摘录。未选私人数据一律不读。
- 报告：12个既定section key；observations只指向已保存metricID，代码渲染价格/数量；interpretations保留text/refs/competingExplanation/distinguishingObservation；unknowns单独列出。无证据段落可以全部未知。
- 发布：`{caseId,reportId,expectedPublishedReportId,requestId}`。不悄悄替换旧已发布版本，不把材料准备完成称为完整拆解已发布。
- 方法：用户选定报告版本、写自己的方法/条件/未知后确认保存；AI报告不自动计入学习。
- 桥接：预览绑定report revision、目标idea owner和完整用户输入hash。观察保存用户确认的表述+本地出处，不自动复制原始摘录；实验要求用户填写原有109 schema字段，确认时原子调用既有RPC并存关联。无validation/status/activity写入。
- 失败语义：同request已完成先返回，不再请求模型；pending返回处理中；租约过期标记结果/用量未知，需要新确认而非无限自动重发。来源或许可改变时在途输出不发布。

## 1 报告事务与用户沉淀

- [x] 新增 `lib/domains/business-teardowns/report-domain.ts`、`report-commands.ts`、`report-queries.ts`、`report-postgres.integration.mjs`及测试；`120_business_teardown_research.sql`。
- [x] 实现逐次case/source范围许可、撤回、材料角色和input manifest、生成lease/receipt、不可覆盖报告、显式发布、用户方法。owner/service guard先于任何查询/写入，跨owner和未选ref拒绝。
- [x] 新增 `action-bridge.ts`、`app/(app)/business-lab/report-actions.ts`、`lesson-actions.ts`，预览和确认独立，request包含目标/版本/输入。确认观察或109实验与source ref在同一事务，目标失败则全回滚。
- [x] 观察只写用户确认的独立表述和案例链接，不拷贝原始材料；实验继续要求公开核对/原型等资源条件，不能填写需求已成立。
- [x] 来源/报告清除只作用本模块内容及关联AI请求输出正文，保留无原文回执/删除占位。用户独立写入的观察/实验不被静默改写，其出处标记失效；不从日志恢复删除内容。
- [x] SQL先红测试：旧许可/材料变更、租约过期、冲突request、publisher并发、观察/实验桥接失败回滚、删源后正文不可读取、无旧模块副作用。

## 2 AI校验与服务

- [x] 新增 `lib/ai/business-teardowns.ts`、`lib/domains/business-teardowns/report-validation.ts`、`ai-research.ts`及测试；统一从lib/ai/index出口，确有需要才扩gateway module枚举。
- [x] 提示要求找经营解释失效/不能迁移/可能做不下去的条件，不输出评分或迎合。来源内容是资料，不是可执行指令。
- [x] 严格校验12节、来源ID/metricID/逐字quote、选择范围、竞争解释与区分问题，数值事实只由已保存字段渲染；未提供的销量、总体顾客比例、真实利润均拒绝。
- [x] 自由文字不因JSON通过就视为事实。无引用的解释必须明确是假设待核对；纯未知可以发布为材料有限的章节，不能填满想象中的用户画像。
- [x] 服务端生成前和完成后均复核owner/许可/材料manifest；按SQL请求回执返回已完成结果，不在回执确认前重新调用模型。
- [x] 全部行为测试mock gateway；本轮不调用实际Google接口。用户在产品内明确授权后才允许真实调用，旧新闻许可不延伸。

## 3 阅读、授权和动作UI

- [x] 新增 `report-panel.tsx`、`report-view.tsx`、`ai-consent-panel.tsx`、`action-preview-panel.tsx`及测试，嵌入独立case页，今日页有入口，不挤占原捕捉。
- [x] 摘要/12节/原文抽屉渐进展开，价格/包装/评价/销量分开；对照未核对时不声称因果。方法/未知/最小行动固定在结尾。
- [x] 逐项选择公开材料并确认发送范围；默认无许可。许可撤回后生成按钮关闭，材料仍可读。
- [x] 切换case/版本清理旧响应；operation绑定材料revision/报告revision/许可/目标；保存成功刷新失败保留提示，不重复保存。
- [x] 浏览器覆盖先未许可拒绝、选择/授权、模型失败保选择、旧输入拒绝、草稿与发布分离、quote原样、方法确认、观察/实验预览和失败重试、手机布局。

## 4 验证与后续

- [x] 先观察关键测试失败再实现；target tests→独立规格/质量复核→PGlite119/120＋109联合→全量Vitest/lint/tsc/build→真实React/Chrome合成验收。
- [x] `BUSINESS_TEARDOWNS_AI_ENABLED`默认关闭，并依赖基础开关；无120时不影响A期材料页。
- [x] A期的Access Key缺项继续明确标记；没有公开销量也可拆解，但不称已证明热销。
- [x] C期自动候选/独立预算任务和D期后续追踪按总计划继续；不得将B期逐次生成当作每日后台已运行。

## 本地验收记录

2026-10-29：283文件1834测试、Lint/TS/build、109+119+120隔离SQL、18项Chrome检查及独立规格/质量复核通过。仅合成数据/mock，未触Google或乐天远端。详见2026-10-29-business-report-delivery.md。C继续实施，D随后。
