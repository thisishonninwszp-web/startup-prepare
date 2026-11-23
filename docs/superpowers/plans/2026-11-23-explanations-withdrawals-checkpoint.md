# 续做检查点：解释比较与撤退教材

用户在2026-11-23说「之后继续」，本轮保存进度，暂不推进实现或发布。方向与具体设计均已获得批准，恢复时无需重复征求功能范围许可。新增付费自动采集仍不得启用。

## 工作区与提交

- 工作区：`C:/Users/pc/.codex/worktrees/business-practice-release/startup-prepare`。
- 分支：`codex/explanations-withdrawals`；最近已提交计划为 `a2944ad`，设计为 `72bb3a4`。
- 实现仍在工作区，尚未提交或发布。不要丢弃现有改动，也不要把 `.tmp/` 合成材料提交。
- 已发布的上一轮功能是确认历史与本人方法（应用提交 `16d7858`）。本轮146之后的迁移尚未上生产，`schema.sql`尚未追加。
- 设计：`docs/superpowers/specs/2026-11-20-explanations-and-withdrawals-design.md`；执行计划：`docs/superpowers/plans/2026-11-20-explanations-withdrawals-delivery.md`。

## 已有实现与证据

1. **146撤退教材基础**：显式 `case_kind=shop|withdrawal`，真实case UUID，官方发布者与对象绑定、逐字来源、确认队列、日次不重复选出、物理擦除和幂等回执。原店铺查询及同日选择保持shop-only。交接在 `lib/domains/business-teardowns/withdrawals/HANDOFF.md`。独立规格与质量审查通过，17项局部测试与实际SQL、原jobs SQL回归通过；审查者另跑57项相关测试。
2. **147解释比较核心与页面**：保存报告版/章/位置/hash或教材版的锚点，独立填写A/B事前预期；复用137回执、139计划版本/结果。原计划擦除会删除各版预期，独立结果保留。修复exact-origin CHECK的SQL NULL漏洞，零出自/多出自负例RED→GREEN。局部核心与实际147 SQL通过，独立规格/质量审查通过。
3. **解释比较UI**：报告入口、独立输入与预览、版固定、同请求重试、focus/props变更后隐藏未核对正文、擦除tombstone、只核对单条时不复活旧列表。审查中发现的信任恢复路径均已有RED→GREEN回归；A UI独立审查通过92项相关测试。
4. **真实React合成浏览器验收A已做**：报告→比较计划→丢响应后重试仍只有1件→编辑第2版→结果选择第1版显示旧预测→结果保存。focus读取失败隐藏源文与保存正文；源报告擦除后独立预测保留；计划擦除后旧/新版预测都不见，独立结果仍在。391px无横向溢出，console无error/warn。截图 `.tmp/explanations-withdrawals/explanation-mobile.jpg`，浏览器标签已关闭、viewport已reset。全程无生产或provider写入。
5. **148撤退教材UI/研究接入**：页面、确认/草稿、今日/历史/详情、显式发布者确认；existing research新增official来源/business范围，复用记录存储，按所选owned withdrawal case解析官方源，逐字offset/hash与擦除失效沿用。workspace使用subject标题。实现者报告79项测试、TS/lint及148实际SQL、原124 SQL回归通过。独立审查者已另跑89项测试及SQL。撤退open已改为全量refresh后才打开全局gate。
6. **研究分页已修复**：focus核对失败后不能继续分页并合并旧记录。`research/workflow.test.tsx`已覆盖；RED→GREEN3项测试。

## 恢复时优先处理的两个明确问题

### 1. 研究创建的未确认请求必须冻结完整body

独立审查者仍有一项未关闭发现：`research-panel.tsx` focus会清空`sources`，但`pending.current`仅保存`{key,requestId}`。若新建研究已落库、响应丢失，再focus后重试仍填着的表单，来源变化会生成新requestId，可能重复创建。comparison/apprenticeship允许空来源，此路径能通过parse。需要冻结完整ResearchInput及requestId，提供原请求重放，未核对期间不得悄悄新建；保持源码/来源读取fail-closed。添加实际hook生命周期RED→GREEN回归并请审查者复查。不要仅删掉focus隐藏逻辑。

### 2. 组合SQL在教材擦除后漏掉独立工作

`lib/domains/business-teardowns/explanations/combined-postgres.integration.mjs`已写并运行，146+147+148+150组合当前FAIL：教材擦除后 `business_subject_context` 返回null，workspace_read过滤掉整个case，导致保留的独立计划/结果/方法消失。最后错误为读取undefined.sourceAvailable。

建议在150的workspace_read对**仍存在且属本人的withdrawal case**使用不含旧正文的通用标题（例如「已清除的退出教材」）作metadata fallback；不要恢复已擦除的名称或来源，也不要全局放宽simulation context。然后重跑组合SQL，确保源不可用但独立工作保留、无重复kind。146 helper原本的live-source语义可以维持。

## 尚未完成的任务

- **149新增采集任务尚未实现**。目录 `withdrawals/collection` 与迁移149在本次检查中均不存在。曾派发 `/root/withdrawal_collection`，当前工具inventory无运行子代理，不能假设它完成了工作。恢复时检查实际文件，再继续。
- 149范围：主账号限定、默认关闭、每日实际请求上限2搜索/3页面取得/1Gemini，持久lease/ticket/receipt，停止/撤销/应答不明不自动重试，官方host白名单、来源逐字校验、有效部分/剔除原文诊断，候选自动采集只能存未确认草稿。独立设置页说明新增预算与公开原文发送范围，不复用原乐天许可。
- 推荐直接Tavily搜索，避免`webSearch`隐藏的Google/回退/额外抓取。复用fetchPublicPage时须给每一跳增加可选beforeRequest guard，在真正fetch前扣配额并限制准确官方HTTPS host，默认旧调用行为不变。AI仍由lib/ai facade/gateway，单次、仅公开字段。
- 新 `/api/cron/business-withdrawals` 复用CRON_SECRET与主账号；确认队列日次选择无需provider。接入原GitHub workflow一步，不新增Vercel cron。新收集env和账户设置保持off。
- **150工作台解释比较投影**已存在：新kind `explanation_check`、simulation-only旧计划筛选、正确定向explanations编辑器。尚需上述擦除后metadata fallback与组合SQL验证。此文件暂未通过最终验证。
- 撤退教材真实浏览器全流程仍需做。测试数据在 `app/(app)/business-lab/withdrawals/test-fixtures.ts`，只用于合成验收，不入生产。
- 全量测试/TypeScript/lint、全部最终SQL、独立最终审查、schema.sql逐字追加146–150、fetch main/编号检查、生产advisor/ACL/read-only探针、迁移与部署、登录本番页面和截图均未做。
- 起始基线388文件/2511测试通过；不可把这个基线当成本轮最终全量结果。

## 工具与安全边界

- PGlite模块：`C:/Users/pc/.codex/visualizations/2026/10/25/01a17228-5263-75d0-96db-ac39e7f31278/event-db-test/node_modules/@electric-sql/pglite/dist/index.js`。
- `.tmp/explanations-withdrawals`有build/serve/fixture/entry与RED日志；自己的合成服务使用4341，历史exec session14158。用户ambient页面4333/cash不是本任务服务，勿关闭。
- 不要对生产制造合成报告、教材、真实接触或方法。不要新增评分、想法状态、接触时刻或锁定行为。
- 后续浏览器工具结束协议已更新：最终CUA结果观察后，下一项应输出独立commentary `::browser-complete{title="..."}`，不再使用旧completion_summary参数。
