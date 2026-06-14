# IdeaOS 爬虫子项目

IdeaOS 的独立爬虫。**独立进程、独立依赖、独立调度**，与主应用只通过 Supabase 的
`external_signals` 表松耦合——爬虫只往里写，主应用审阅后把好的条目"提升"为观察。

它**不调 AI、不碰 Auth、不读 observations**。机器抓的批量噪音绝不直接进捕捉入口，
而是先落 staging、由人在主应用里一键提升（保护痛点雷达信号纯净，见根目录 CLAUDE.md 第 3 条）。

## 一、准备

1. 先在主库跑迁移 `supabase/migrations/004_external_signals.sql`（Supabase SQL Editor 整段执行）。
2. 安装依赖：
   ```bash
   cd crawler
   npm install
   ```
3. 配置环境变量：
   ```bash
   cp .env.example .env
   # 填 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY（与主应用 .env.local 同值）
   ```

## 二、跑

```bash
# 单源单关键词
npm run crawl -- --source hackernews --query "founder burnout"

# 全量监控（config.ts 里的 ENABLED_SOURCES × WATCHLIST）
npm run watchlist
```

可用源：`hackernews`、`reddit`、`v2ex`、`web`。

- `hackernews` / `reddit` / `v2ex` 走官方 JSON API，免登录免反爬。
- `web` 是兜底：query 传一个 URL，用 Playwright 渲染后抽正文。需先装：
  ```bash
  npm i playwright && npx playwright install chromium
  ```

抓到的条目去重写入 `external_signals`（唯一约束 `source + source_id`，**重复跑不会产生重复**）。

## 三、加一个新源

在 `src/sources/` 下新建一个文件，导出一个 `SourceFetcher`（`(query) => Promise<RawSignal[]>`），
然后在 `src/sources/index.ts` 的 `SOURCES` 注册表里加一行。每个源互相隔离，
单源失败（限速/反爬/网络）只打日志、不拖垮整轮（见 `pipeline.ts`）。

## 四、定时调度

爬虫与主应用解耦，调度自己挑：

- **本地 / 服务器 cron**（每天一次全量监控）：
  ```cron
  0 8 * * *  cd /path/to/startup-prepare/crawler && npm run watchlist >> crawl.log 2>&1
  ```
- **GitHub Actions / Vercel Cron**（可选）：用 secrets 注入两个 env，定时调 `npm run watchlist`。
  纯 API 源能跑在轻量 runner 上；用到 `web` 源才需要装 Playwright 浏览器。

## 五、之后

到主应用 `/review`（发现页）的"外部待审"收件箱里审阅 pending 条目，
逐条"提升"（→ 经 `digestExternal` 合成为带"外部"标签的观察）或"忽略"。
