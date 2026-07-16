# IdeaOS 项目宪法 v2

> v2(2026-07)重新定义:项目经多轮增量开发后整合性崩坏,本宪法在保留反偏误灵魂的前提下,
> 重新划定产品边界、目录结构与 UI 规范。与旧代码冲突时,以本宪法为准。

## 产品本质(双轴)

IdeaOS 不是笔记工具,不是 AI 聊天工具。它是一个服务于"用户真正创业"的系统,由两条轴构成:

1. **决策轴 — 对抗认知偏误的决策系统**:捕捉 → 材料箱 → 想法 → 验证 → Go/Kill。
   产品的敌人不是竞争对手,而是使用者自己的大脑。
2. **成长轴 — 成为经营者的养成系统**:梦想(愿景) → 周复盘(判断力校准) → 学到了(认知沉淀)。
   验证想法是手段,长成能经营的人是目的。

任何新功能必须能回答:它推动了"下一次真实接触",或让用户离"经营者"更近。两者都不沾的,不做。

## 不可违背的设计原则(违反即为 bug)

1. **绝不加评分系统**。不要任何 1-10 分、星级、百分比的"想法打分"。
   理由:精确的数字会给主观判断穿上客观外衣(精确性偏误)。只允许二元决策。

2. **AI 必须是对抗性的,不许迎合**。所有 AI prompt 的目标是"找出这个想法会死的理由",
   不是让用户感觉良好。禁止输出"很有潜力""不错的想法"这类话。

3. **捕捉必须 30 秒内完成**。不强制填标题、不强制分类。摩擦越低越好(蔡格尼克效应 / Fogg 行为模型)。

4. **证据只记录两个二元信号**:has_pain(有真实痛?)、will_pay(愿付钱?),值为 yes/no/unsure。
   不要做"事实/观点/弱信号/强信号"这种多级分类(认知负荷理论)。

5. **强制出口机制**:一个想法停留在"验证中"超过 3 天且没有新的 validation 记录,
   则锁定该想法的 AI 质疑功能,提示用户去做一次真实接触。这是产品灵魂,必须实现。

6. **状态只有 5 个**:观察 / 假设 / 验证中 / MVP候选 / 归档。
   绝不加"有潜力"这种模糊中间态(选择的悖论)。

7. **Kill 的界面语言用"学到了什么",不用"失败/放弃"**(损失厌恶 / 认知重评)。

## 模块分层与命运表(新功能必须归入某一层)

| 层 | 模块 | 说明 |
|---|---|---|
| 决策轴(一级导航) | dashboard, capture, materials, ideas, workbench, learnings | materials 是唯一统一输入口;collide/concept/outreach 是 idea 详情内的工具入口,不独立铺导航 |
| 成长轴(一级导航) | dreams, retrospectives(周为主), learnings | dreams 保持可编辑一级模块;日/月复盘是周复盘页内的次级视图;patterns 报告是 learnings 的视图 |
| 认识层(一级导航) | reality, customer-view | customer-view 的证据输入走 materials |
| 档案层(低权重导航) | companies(含原 company-kb), knowledge | |
| 工具层(无一级导航) | reasoning 5 框架, council | 从 workbench/idea 上下文调用,/tools 聚合页兜底 |
| 设置区 | AI 诊断、导出、审计、profile | |
| 已杀死 | life(生活罗盘), /review(外部信号页) | 不得复活;同类需求走 materials |

**禁止**:新增一级导航模块、新增独立闭环系统、新增独立输入口。导航固定 4 组 12 项 + 底栏。

## 目录规范

```
app/(app)/...        所有需要导航壳的页面;AppShell 只在 app/(app)/layout.tsx 挂载一次,
                     页面/分区 layout 禁止再引 AppShell
app/(auth)/login/    无壳页面
lib/ai/<module>.ts   各模块 AI prompt 与解析器(经 lib/ai/index.ts 桶导出);
                     传输层唯一入口 lib/ai-gateway.ts(加密日志、AI_MODEL env)
lib/domains/closures/  唯一的决策闭环系统(workbench/028 模型);禁止模块自建闭环
lib/domains/concepts/  价值设计图共享领域
components/ui/       共享原子组件(shadcn 模式);页面禁止手搓 button/badge/dialog
```

`app/` 下禁止放非路由的领域目录(伪路由目录),领域逻辑进 `lib/domains/`。

## UI 铁律 —「田野笔记 Field Notes」设计语言

隐喻:创业者的野外考察笔记本。暖纸白底、暖墨文字、朱砂唯一强调色。

1. **页面代码禁止 Tailwind palette 类(`bg-orange-50`、`text-zinc-500` 等)与 hex 颜色**,
   只许语义 token 类(`bg-background`、`text-muted-foreground`、`bg-primary`、状态色见下)。
2. **状态色只有一套**,定义在 globals.css,经 `components/ui/status-badge.tsx` 使用:
   observe(灰)/hypothesis(蓝)/validating(琥珀)/mvp(绿)/archived(浅灰);
   verdict-go(绿)/verdict-learned(紫——Kill 不用红,原则 7)。禁止页面自建颜色映射表。
3. **圆角统一 `--radius: 0.5rem`**(rounded-md/lg 由 token 派生),禁止 rounded-2xl/3xl。
4. **容器只用 `PageContainer` 三档**:narrow(表单/访谈)/ default(列表/详情)/ wide(看板)。
   禁止页面自写 max-w-*。
5. **按钮只用 `<Button variant>`**,禁止裸 `<button className="...">`。
   不可逆动作(Go/Kill/删除)用 `ConfirmButton`。
6. **中文排版**:正文行高 1.75;CJK 文本禁止 `tracking-*`(仅 ASCII mono 小标签可用);
   标题只有 3 级。数据/编号用 Geist Mono。
7. **动效**:首屏 `animate-fade-up` 一次 + 交互 `transition-colors duration-150`,仅此两种。
8. **暂不支持暗色模式**:禁止写 `dark:` 类(待正式接入主题切换后再启用)。

## 技术栈(不要替换)

- 前端:Next.js 14 App Router + TypeScript
- 样式:Tailwind CSS + shadcn/ui
- 数据库 & Auth:Supabase (PostgreSQL)
- AI:Google Gemini API(@google/genai),模型 gemini-2.5-flash(经 lib/ai-gateway.ts 封装,模型名读 AI_MODEL)
- 部署:Vercel

## 代码约定

- 所有 DB 查询用 Supabase client,RLS 先用 service role key 跑通(单用户阶段)
- AI 业务函数放 `lib/ai/<module>.ts`,传输走 `lib/ai-gateway.ts`;禁止直接 new GoogleGenAI
- 提交前确保无 ESLint unused-variable 错误(Vercel build 会因此失败)
- 组件用函数式 + Hooks,不用 class 组件
- **验证方式:`npx tsc --noEmit` + `npm run lint` + `npm test`;绝不在 dev server 运行时执行 `npm run build`**(会毁 .next 缓存)

## 数据库 Schema(核心决策闭环)

- observations: id, user_id, raw_text, tags(text[]), created_at
- ideas: id, user_id, title, hypothesis(jsonb), status(enum), tags(text[]), created_at, last_activity_at
- validations: id, idea_id, has_pain(enum), will_pay(enum), note, contacted_at
- ai_sessions: id, idea_id, role(enum), messages(jsonb), created_at
- decisions: id, idea_id, verdict(enum), reason, learned, decided_at
- predictions: id, user_id, source_type(idea/retro), idea_id(source_type=idea时必填), period_id(source_type=retro时必填), text, due_at, made_at, outcome(enum pending/hit/miss), resolved_at, note
  — 统一的预测对账表,idea 侧和周复盘侧共用同一张表、同一套到期/命中逻辑(idea_id 与 period_id 互斥)
- idea_exit_criteria: id, idea_id, user_id, criterion, triggered(unreviewed/yes/no), reviewed_at, created_at

其余模块的表定义见 `supabase/migrations/`(按编号顺序执行,append-only);
`supabase/schema.sql` 是全新安装用的完整拼合版,新增迁移时必须同步追加到该文件末尾。
杀死模块的表用清理迁移显式 drop,并同步 schema.sql。
