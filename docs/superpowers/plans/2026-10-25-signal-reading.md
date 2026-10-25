# Signal reading implementation plan

**Goal:** 实现已批准的每日新闻连续阅读七项能力。

**Architecture:** 保留公共报告及现有追踪/对账管道；新增用户级偏好、追加修正和阅读结束记录。领域函数与界面分离，复用 Supabase client 和已有 AI 网关。

**Tech Stack:** Next.js 14, TypeScript, Tailwind/shadcn, Supabase, Vitest.

- [x] 探索阅读、判断、个性化三个现有链路，确认共享正文/私人数据的边界。
- [x] 扩展 followups.ts 历史快照，测试已核验摘录差异和无依据时降级；实现 report-evidence.tsx。
- [x] 新增 102 偏好迁移、领域操作与测试；把显式关注/静音接入 followedSignals；提供按钮和管理组件。
- [x] 新增 103 判断修正迁移及所有权检查；统一 JudgmentView 挂载追加历史/主动反证检查面板，保留原预测基准。
- [x] 先测试阅读快照/新条目识别，再实现 104 阅读记录迁移、服务端操作、展开状态与主动结束组件。
- [x] 日报集成来源/推断层次、默认折叠分析、已展开/新条目、静音可恢复内容、偏好管理、阅读终点；详情页补充明确层次与可选行动文案。
- [x] 运行 npm test、npm run lint、npx tsc --noEmit、npm run build；复核差异和用户隔离。浏览器使用真实组件与模拟动作验证，未执行登录真实库的端到端流程。

运行 Vitest 时将 TEMP/TMP 指向本任务可写 visualization 目录，避免已确认的沙箱临时文件 EPERM。不修改用户已有 .claude/launch.json。用户已执行数据库迁移并明确授权上线，发布沿用 main 推送触发 Vercel Production 的现有流程。

## 复核与上线

已复核并修复：AI 背景对照绕过折叠、静音旧回想、事件标签最近300份截断、React18异步 transition提前解除忙碌、展开同步失败静默以及刷新覆盖本地进度。

本地浏览器夹具使用真实 React 组件和延迟的模拟 server actions，验证8项交互（来源/折叠、展开保存失败重试、刷新竞态、关注/查证/结束忙碌、阅读结束、手机无横向溢出、无脚本错误）。该夹具不等于已登录真实数据库端到端验收。

数据库迁移顺序为 `supabase/migrations/102_signal_reading_preferences.sql`、`103_signal_judgment_updates.sql`、`104_signal_reading_sessions.sql`，然后运行 `npm run db:check`（已包含三张新表）。用户已执行三份迁移，远端只读检查确认 50 项结构探针全部通过。

最终验证：167 个 Vitest 文件、1327 项测试通过；ESLint、TypeScript、生产构建通过；浏览器夹具8项检查通过。`git diff --check`无空白错误。生产构建保留既有 Edge Runtime 静态生成提示。

发布前重新运行全部 1327 项测试与 ESLint 均通过。远端 main 与本地基础提交一致；现有 GitHub Vercel 状态及 Production deployment 证实 main 自动发布流程。线上启用以新提交对应的部署成功为准。

浏览器验证命令：`node scripts/verify-signal-reading.mjs <可写输出目录>`。使用本机 Chrome/Edge；其它系统可设置 `CHROME_PATH`。截图是模拟新闻夹具，非真实用户数据。
