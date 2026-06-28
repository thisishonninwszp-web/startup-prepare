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

三种触发方式，按省事程度从高到低：

**A. 网页按钮（最省事，日常用）**：打开 IdeaOS 发现页 → "外部待审" → 输入关键词点「抓取」。
这条路在主应用 server action 里**自动把关键词翻成中/英/日**，分别抓各市场，**不用本子项目、不用终端**。
默认只跑 8 个 API 源；若按第五节部署了云端 worker，按钮还会顺带后台触发 Playwright 重型源。

**B. 双击 `crawl.bat`**（不想开网页时）：双击后输入关键词回车即可；直接回车则跑监控列表。
注意：本子项目**不翻译**，抓到的是你给的原词。要多语言请用网页按钮，或在 `config.ts` 里配多语言关键词。

**C. 命令行 / 定时**：
```bash
# 单源单关键词
npm run crawl -- --source hackernews --query "founder burnout"

# 所有 API 源一起抓一个关键词（不含 web）
npm run crawl -- --source all --query "founder burnout"

# 全量监控（config.ts 里的 ENABLED_SOURCES × WATCHLIST）
npm run watchlist
```

可用源与地区：

| 源 | 地区 | 接入 |
|---|---|---|
| `hackernews` | 🇺🇸 英语圈 | HN Algolia API，免认证 |
| `reddit` | 🇺🇸 英语圈 | **需 OAuth**（填 `REDDIT_CLIENT_ID/SECRET`，否则自动跳过） |
| `devto` | 🇺🇸 英语圈 | Dev.to API，免认证 |
| `lobsters` | 🇺🇸 英语圈 | Lobste.rs 搜索 API，免认证 |
| `producthunt` | 🇺🇸 英语圈 | Playwright 渲染搜索结果 |
| `indiehackers` | 🇺🇸 英语圈 | Playwright 渲染搜索结果 |
| `v2ex` | 🇨🇳 中文圈 | V2EX API，免认证 |
| `zhihu` | 🇨🇳 中文圈 | 知乎非官方搜索接口，免认证（可能限速） |
| `xiaohongshu` | 🇨🇳 中文圈 | Playwright 渲染搜索结果 |
| `qiita` | 🇯🇵 日本 | Qiita API，免认证 |
| `chiebukuro` | 🇯🇵 日本 | Yahoo知恵袋 API，**需 `YAHOO_JAPAN_APP_ID`**（否则自动跳过） |
| `rakuten` | 🇯🇵 日本 | 楽天商品 API，**需 `RAKUTEN_APP_ID`**（否则自动跳过） |
| `amazon_jp` | 🇯🇵 日本 | Playwright 渲染商品评论页 |
| `web` | 🌐 任意网页 | Playwright 兜底 |

`all` = `config.ts` 的 `ENABLED_SOURCES`（免认证/已配 key 的轻量 API 源）。
Playwright 重型源（`xiaohongshu` / `producthunt` / `indiehackers` / `amazon_jp` / `web`）不在 `all` 里，需单独 `--source` 指定，避免每次全量都启动浏览器、被目标站限速。

> 网页按钮只覆盖免认证/已配 key 的 API 源；Playwright 渲染的源与无人值守的定时全量，仍走本子项目（B/C）。

- `web` 是兜底：query 传一个 URL，用 Playwright 渲染后抽正文；`xiaohongshu`/`producthunt`/`indiehackers`/`amazon_jp` 的 query 是搜索关键词。
  五者都需先装 Playwright：
  ```bash
  npm i playwright && npx playwright install chromium
  ```
  这几个源对目标站做真实浏览器请求，限速/选择器变动都可能导致失败——失败只影响该源，不拖垮其它源（见 `pipeline.ts` 的 try/catch 隔离）。

抓到的条目去重写入 `external_signals`（唯一约束 `source + source_id`，**重复跑不会产生重复**）。
"哪个国家"由 `source` 决定，主应用收件箱按它显示地区徽章。

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
  纯 API 源能跑在轻量 runner 上；用到 Playwright 源才需要装浏览器。

## 五、云端 worker（让网页按钮也能跑 Playwright 源）

Vercel 是 serverless、没浏览器，跑不了 Playwright 源（亚马逊评论/小红书/Product Hunt/Indie Hackers）。
把本子项目部署成一个常驻 **Railway** 服务即可解决——它**一个进程同时**：

- **内置定时器**（`CRON_SCHEDULE`，默认每天 8:00）自动跑「全量监控 + Playwright 重型源」。
- **HTTP 接口** `POST /crawl`（带 `CRAWLER_SECRET` 鉴权）供主应用按需触发外部抓取；传入 `customerTopicId` 时只运行该顾客研究主题。
- **顾客研究调度** 每次 cron 同时读取到期的 `customer_research_topics`，按市场抓取公开来源，并写入对应课题的候选材料收件箱。

抓的结果仍写同一张 `external_signals` 表，照常出现在主应用「外部待审」收件箱。

### 部署步骤（Railway）

1. 把本仓库推到 GitHub。
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → 选本仓库。
3. **Settings → Root Directory** 填 `crawler`（让 Railway 只构建子项目，用其中的 `Dockerfile`）。
4. **Variables** 里填环境变量（与 `.env.example` 同名）：
   - `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（必填）
   - `CRAWLER_SECRET`：随便生成一串长随机字符（**主应用 Vercel 里要填同一个值**）
   - 可选：`YAHOO_JAPAN_APP_ID`、`RAKUTEN_APP_ID`、`REDDIT_CLIENT_ID/SECRET`、`CRON_SCHEDULE`
   - `PORT` 不用填，Railway 自动注入。
5. **Settings → Networking → Generate Domain**，拿到形如 `https://xxx.up.railway.app` 的公开域名。
6. 回主应用（Vercel 的环境变量）填：
   - `CRAWLER_WORKER_URL` = 上一步的域名
   - `CRAWLER_SECRET` = 与 worker 里**完全一致**
   重新部署 Vercel 后，网页「抓取」按钮就会在跑 8 个 API 源的同时，把 Playwright 重型源推给 worker 后台抓。

### 本地起 worker（调试用）

```bash
cd crawler
# .env 里填好 SUPABASE_*、CRAWLER_SECRET，装好 Playwright
npm run serve         # 启动在 http://localhost:8080
curl http://localhost:8080/health   # → {"ok":true}
```

## 六、之后

到主应用 `/review`（发现页）的"外部待审"收件箱里审阅 pending 条目，
逐条"提升"（→ 经 `digestExternal` 合成为带"外部"标签的观察）或"忽略"。
