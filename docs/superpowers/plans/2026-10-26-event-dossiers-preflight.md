# 2026-10-26 上线前检查

检查对象：本地分支 codex/event-dossiers-phase-a；当前HEAD a42ead5，事件档案变更尚未提交。未执行远端迁移、推送或部署。

## 通过

- Vitest：186文件、1438测试通过。
- ESLint、TypeScript（不使用增量缓存）、git diff --check通过。
- Next.js生产构建退出码0。
- 三套PGlite实际PostgreSQL迁移/权限/引用/回放集成通过。
- Chrome合成数据夹具12项交互检查通过。
- 已配置Supabase原有50项核心结构检查通过，可选concept结构可用。

## 尚未满足的发布条件

配置目标：yozyjvurjcqsvxovbjeq.supabase.co。`npm run db:check -- --events`退出码1：六张受检事件表及12个受检RPC均不在PostgREST schema cache中。这说明远端事件功能结构当前不可用，需执行迁移后复查。

迁移依次为：

1. supabase/migrations/105_signal_event_dossiers.sql
2. supabase/migrations/106_signal_event_research.sql
3. supabase/migrations/107_signal_event_replay.sql

每个文件完整执行，前一个成功再执行下一个；不是可随意重复执行的幂等脚本。没有删除原有业务表或清空数据的语句。执行后运行 `npm run db:check -- --events`。

本地 `SIGNAL_EVENTS_ENABLED` 未设置，入口默认关闭；未核验Vercel生产变量。当前工作区没有.vercel/project.json链接配置。发布前还需提交事件功能变更（排除用户已有.claude/launch.json修改）、确认Vercel项目与生产环境开关。真实双账号/三个事件人工验收、真实Gemini选择范围与引用检查仍未执行。

推荐顺序：迁移→远端结构复查→部署→真实账号验收→开启入口。回退关闭 SIGNAL_EVENTS_ENABLED，保留数据。
