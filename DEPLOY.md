# 部署到 Vercel

IdeaOS 是标准的 Next.js 14 App Router 项目，Vercel 零配置即可构建。

## 1. 准备 Supabase（生产）

在要用于生产的 Supabase 项目里，按顺序执行：

1. `supabase/schema.sql`（建 5 张表 + 枚举 + 索引 + RLS）
2. `supabase/migrations/001_ai_sessions_observation.sql`
3. `supabase/migrations/002_ideas_tags.sql`
4. `supabase/migrations/003_predictions.sql`

> 说明：`schema.sql` 是幂等的、面向全新数据库的全量脚本，已包含 ai_sessions/ideas 的最新结构；
> 两个 migration 用于「已经跑过旧版 schema.sql 的库」做增量补齐。全新库只跑 schema.sql 也可以。

在 Authentication → Providers → Email 里，单用户阶段建议关闭 "Confirm email"，或手动在
Authentication → Users 里建好账号。

## 2. 推到 Git 并导入 Vercel

1. 把仓库推到 GitHub / GitLab。
2. Vercel → New Project → 导入该仓库。Framework 会自动识别为 Next.js，构建命令 `next build`，无需改。

## 3. 配置环境变量（Vercel → Project → Settings → Environment Variables）

| 变量 | 说明 | 暴露给浏览器？ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 | 是（NEXT_PUBLIC_） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key（**仅服务端**） | 否 |
| `GEMINI_API_KEY` | Google Gemini API key | 否 |
| `AI_MODEL` | 模型名，默认 `gemini-2.5-flash` | 否 |
| `BUSINESS_PLAN_HMAC_KEY` | 经营计划供应商别名 HMAC 密钥，base64 编码的 32 字节随机值 | 否 |
| `TAVILY_API_KEY` | 外部雷达联网检索（可选；不填则该功能置灰） | 否 |

非 `NEXT_PUBLIC_` 的变量只在服务端使用，**不要**加 `NEXT_PUBLIC_` 前缀，否则会泄露到浏览器。
为 Production / Preview / Development 三个环境都填上。

生成经营计划 HMAC 密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

密钥只用于把供应商名称转换为不可逆标识，不用于解密数据。轮换后历史脱敏数据仍可读取，
但同一供应商跨新旧版本的稳定别名关联会中断。

## 4. 部署 & 验证

Deploy 后：
- 访问站点根路径应跳转到 `/login`
- 登录后进入 `/dashboard`，导航能在 捕捉 / 想法库 / 复盘 之间切换
- 捕捉一条观察能触发 AI 三问（说明 `GEMINI_API_KEY` 生效）

## 本地开发

```bash
cp .env.local.example .env.local   # 填入真实值
npm install
npm run dev                         # http://localhost:3000（被占用时自动用 3001）
```

提交前自检（不会污染 dev server 的 .next 缓存）：

```bash
npx tsc --noEmit
npm run lint
```
