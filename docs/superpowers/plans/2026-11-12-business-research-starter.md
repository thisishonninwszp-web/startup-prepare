# 生意研究输入减负与本番验收实施计划

**Goal:** 从每日案例直接接着研究，复用现有报告解释和逐字出处；完成正常登录后的实际操作检查。
**Architecture:** 纯 starter + owner-scoped uncached query + 显式采用面板；复用 124 保存/擦除，不新增 AI 或迁移。
**Tech Stack:** Next.js 14 / React / Supabase / Vitest。

用户已要求执行。按 executing-plans 在当前会话实施，保留原有其他未提交文件。

- [x] 确认生产当前未登录，并向用户请求在 Chrome 正常登录；独立继续实现。
- [x] 先写 starter 纯逻辑的失败测试：已发布报告与仍有效引用、缺口、最大数量、无默认确认、候选与当前商家隔离。运行 Vitest 确认 RED。
- [x] 实现 `lib/domains/business-teardowns/research/starter.ts`：`ResearchStarter`、`ResearchDraft`、`buildResearchStarter`、`adoptResearchDraft`，合格解释才能进入下稿，未确认引用不附上。
- [x] 为 `starter-queries.ts` 写 owner/无效输入/缺案/正文清除/有限查询测试并确认 RED。实现 `loadResearchStarter(owner,{caseIds,kind})`，actions 由 auth 取得 owner。
- [x] 更新研究入口与 page 的 kind、caseId 解析；加入 `research-starter.tsx`，明确确认后替换新研究草稿，传递限定案例资料给 SourcePicker，保留手动检索。
- [x] 浏览器合成测试：对照下稿、引用许可、输入保留与替换、失败、切换案例、手机布局；全量 Vitest / TypeScript / lint。
- [x] 正常登录后生产验收并记录真实覆盖/缺口；只提交本次路径，发布并核对生产 Ready。

关键行为命令：`npx vitest run lib/domains/business-teardowns/research/starter.test.ts lib/domains/business-teardowns/research/starter-queries.test.ts "app/(app)/business-lab/research/research-panel.test.tsx" "app/(app)/business-lab/research/actions.test.ts"`。最终运行 `npm test`、`npx tsc --noEmit`、`npm run lint`。开发服务器运行时不执行本地 next build，以 Vercel 实际构建确认生产包。


## 验证记录

- 最终全量 314 文件、2056 项通过；TypeScript、ESLint 无错误或警告。新查询独立 7 项、实现/规格及质量复核完成。
- 规格审查发现：案例切换后再切回会使旧下稿重新可保存。已增加粘性失效，先观察回归失败再修复；浏览器实测切回原组合仍禁止保存，显式重新采用后恢复。
- Chrome 合成流程确认：从案例 A 自动读取材料与候选、选择 B 后保留输入；逐条确认一条引文后仅附一条，右案引文保持未确认；第一次替换点击未改变原输入，第二次才替换；保存并回读、编辑后版本 2；资料读取失败保留输入，重读恢复。约 390 CSS px 和更窄视口均无横向溢出。
- 用户已通过正常入口完成生产登录。以实际案例完成保存、页面重新读取、编辑及第 2 版回读；未把合成资料、虚构退出事实、顾客验证或本人能力写入生产。
- 生产零行字段检查发现报告章节实际在 `payload.sections`，初次查询错误地读成顶层列。已将 Supabase 查询改为 `sections:payload->sections`，补 RED/GREEN 回归，并把五项实际来源字段契约加入 `scripts/check-schema.mjs --business-research`，防止仅靠 mock 误判数据库字段。修正后的生产零行检查通过；未读取任何生产正文。

## 2026-11-12 正常登录后的生产验收

- 实现及 JSON 投影修正版 `7f2d539` 已生产部署成功。正常登录后从 2026-11-12 楽天ブックス案例进入经营结构对照，caseId 和类型正确；从不同商家候选选择 2026-11-10 防災グッズ アットレスキュー。
- 两案当前均无可逐字摘录的冻结正文、无仍可读取的已发布报告；页面明确留空并列出缺口，没有把官方价格/评价字段编成原文。因真实数据不足，生产未覆盖“从合格报告解释中采用真实引文”的正向路径，该路径此前已做合成浏览器与 SQL/领域测试。
- 仅保存一份明确标注的 `待核对｜楽天ブックス × 防災グッズ（操作确认记录）`。各维度均写未知/待核对，假设、反例和下一步围绕补充用途、配送条款、购买单位原文；0 条已确认引文。页面重载后仍为版本 1，编辑下一步后为版本 2，回读内容一致。
- 其他三类在生产检查显示与边界：退出披露确认未勾选；需求矛盾必须分别选择两侧原文；学徒路线当前无已确认经历，资源限制与确认保持未填写。未制造假的退出/矛盾或代确认本人时间费用，未保存这些三类空记录。生产永久删除未操作，保留这一份操作记录供用户查看；擦除流程已有合成及 SQL 验收。
- 实际体验发现不足清单显示内部章节名且在没有报告时重复四次。改为中文名称、缺报告时统一解释，并将“可读冻结材料”准确改为“可逐字摘录的冻结正文”，避免与已有官方字段混淆。
- 本次只用已有资料；没有触发新的乐天请求、Gemini 生成、任务设置变更或真实验证记录。
