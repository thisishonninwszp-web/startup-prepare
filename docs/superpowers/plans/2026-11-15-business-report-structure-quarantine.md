# 每日生意报告：隔离模型多余字段

## 生产证据与范围

- 2026-11-15 Actions [43665835635](https://github.com/thisishonninwszp-web/startup-prepare/actions/runs/43665835635)，main `b2a7708`。每日生意步骤在 AI 响应后的结构校验失败：`unrecognized_keys`，位置 `sections[11]`，多余字段 `distinguishingObservation`。
- 昨日材料身份修复已让任务进入 AI 处理。此次不修改材料身份、SQL 约束、来源选择、日预算或仅主账号限制。
- 生产只读核对：run `67d69596-ea72-4d32-a24f-223b3edcf421`，cococimo:10001693，material ready，1 次 inspect completed、1 次 AI unknown，与 Actions 错误一致；无重置或额外请求。
- 原文日志策略是 `metadata_only`，原响应未归档；不声称能追回今天未保存的完整报告，不重置未知回执或重复付费请求。历史失败仍保留；新版本应用于后续正常执行。

## 修复行为

- [x] 回归测试重现与生产完全相同的 Zod 路径及错误。
- [x] 仅模型响应中的章节内多余字段可隔离；不移动字段、不推断缺失内容、不执行模型内容。严格结构校验再次执行。
- [x] 根字段、必填项缺失、错误类型/长度、章节/来源重复、模型伪造诊断/覆盖元数据均拒绝。已保存报告仍严格校验。
- [x] 合格正文沿用原规则逐条校验，错误原文及相对位置保留在单独诊断中，普通报告只显示缺口。每章合并为一组结构诊断，原文截到 32000 字符并标记截断，沿用整体归档上限。
- [x] 校验版本 v5；兼容旧版 v2/v3/v4 诊断。结构缺口自动存草稿，不自动发布，不增加 AI 重试。
- [x] 实际 119/120/121/123 PostgreSQL 迁移的集成测试验证结构诊断草稿保存、已发布版本不被替换、幂等回执、原资料删除时诊断同步清除。不增加迁移。
- [x] 全量 314 文件 2067 项测试、TypeScript、ESLint 均通过；独立只读审查无须修改项。
- [x] 实现 `1d35b34` 已反映 main；[Vercel 生产部署](https://vercel.com/forcus-wu-s-projects/startup-prepare/AajFSAVXh9Rci5wL8X7xDk7mTiZr) 返回 success。无认证 cron GET 返回 401，在执行前被拒绝。

## 验收边界

本次只读查证与离线测试不调用乐天或 Gemini，不重跑含其他付费步骤的整套 Actions。实际下一次定时生成结果要由下一次正常运行回执确认，不能用本次测试冒充线上报告生成成功。
