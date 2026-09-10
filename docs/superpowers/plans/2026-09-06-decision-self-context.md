# 决策关联自我记录 Implementation Plan

**Goal:** 用户在想法、梦想或现状工作台选择自己的记录，查看原始依据，并得到引用这些记录的质疑。

**Architecture:** 复用 decision_object_links，以 self_context 标识关系。领域层负责白名单、来源读取与归属校验；工作台提供关联面板；AI 模块产生经过来源校验的问题。既有想法角色质疑读取同一组已关联记录。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase、现有 UI 组件、Gemini gateway、Vitest。

## 已批准范围

- 支持 idea、dream_case、reality_case，不增加导航或新的决策状态。
- 来源为 self_hypotheses、self_deeds、self_skill_nodes、self_resources；不读取 self_declarations 或人格推断。
- 记录实时读取，展示日期、原文、适用范围及反证；删除后的来源明确提示失效。
- 新入口继承想法的三天锁定；关联操作不更新 last_activity_at。
- 第一轮不自动回写自我认识，不实现成长任务或复盘更新。

## 实施清单

- [x] 1. `lib/domains/decision-self/domain.ts` 与 `.test.ts`：校验对象与来源，构建带来源标识的上下文，拒绝未知引用。
- [x] 2. `lib/domains/decision-self/queries.ts` 与 `.test.ts`：所有查询限定 user_id；复用关系表；验证越权、失效来源、数据库错误和三天锁定。
- [x] 3. `lib/ai/decision-self.ts` 与 `.test.ts`：经现有 gateway 返回问题、来源和可改变判断的现实观察。
- [x] 4. `lib/domains/decision-self/actions.ts`、`panel.tsx`：关联/移除、搜索、原文入口、明确的保存及 AI 错误反馈。
- [x] 5. `app/(app)/self/records/[sourceType]/[sourceId]/page.tsx`：受认证保护的单条依据详情；工作台挂载面板，想法角色质疑共享来源。
- [x] 6. 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node node_modules/next/dist/bin/next lint`、`node node_modules/vitest/vitest.mjs run`，再审查权限、锁定、引用和错误反馈。

## 验收场景

1. 选择一条自己的记录后刷新，关系仍在；移除后新请求不再使用该记录。
2. 伪造其他用户的对象或来源 ID，服务端拒绝。
3. 来源删除后显示失效，不给 AI 发送旧副本；来源被推翻时携带推翻原因。
4. AI 返回未提供的来源编号时拒绝结果，禁止适合度评分和人格标签否决。
5. 验证中的想法超过三天无接触，旧、新 AI 入口均拒绝；关联记录不会解锁。
6. 每类最近 100 条用于选择，已关联的更早记录仍能读取；来源详情完整呈现。

## 基线

2026-09-06：60 个测试文件、496 项测试通过。系统 npm launcher 损坏，使用项目已安装 CLI 的 Node 入口进行等价验证。工作分支 codex/decision-self-context；保留用户已有 .claude/settings.local.json。

## 收尾验证（2026-09-11）

- 第一轮代码已完成，仍为本地未提交改动，未部署。
- 完整套件在最后代码改动后通过：65 文件、518 项；ESLint 无警告和错误。
- 本次重新运行 TypeScript 检查及新增 22 项测试，均通过。
- 浏览器确认登录后的梦想工作台、关联面板、空列表与禁用质疑按钮正常。当前账号四类候选来源为空，因此未对真实数据执行关联或 Gemini 调用；写入、移除、来源校验由自动化测试覆盖。
- 现有数据库缺少 self_custom_skills；仅对该可选名称表的明确缺失做兼容，其他查询错误继续显示。

