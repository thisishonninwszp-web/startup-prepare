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
   **唯一例外(self 模块)**:自我假设的触发率、命中率、把握度可以是数字,
   但必须同时满足三条 —— ①由代码从行为数据算出,AI 不得直接输出任何数值;
   ②每个数字都能点开看到分子分母,样本不足时只显示样本数、不显示比率;
   ③不得聚合成任何形式的总分(战力值、综合评分、雷达面积)。
   例外只对"关于自己的可证伪命题"成立,对想法/机会打分仍然禁止。
   **例外三(贝叶斯估计器,经用户明确裁决,2026-10)**:signals「往下推」的某一步上可以算出一个可能性数字,条件是 ——
   ①AI 只起粗档草稿(先验五档、证据强度五档),不得输出任何精确数字;
   ②用户确认或修改每一档后,数字由代码按贝叶斯公式算出,算式全部摊开(先验赔率 × 每条证据的倍数);
   ③页面标明"这是你确认过的估计",并提醒锚定;④只用于对世界事件的推论,对想法/机会仍然禁止打分。
   规则在 `lib/domains/signals/inference-shared.ts`。
   **例外二(写法画像,经用户明确裁决,2026-10)**:`/self` 的「写法」页可以原样显示
   Jev 对用户亲手写下的文字给出的档位与概率,条件是 ——
   ①页面必须写明它量的是"你怎么讲自己",不是"你做了什么";
   ②每份画像都能点开看到这次读了哪些原文,原文只取用户本人写的(AI 生成的复盘正文不送);
   ③不进任何台账推理(档位、特性、技能、档案都不读 `self_portraits`),不聚合成总分;
   ④只用于用户自己,对想法/机会仍然禁止。规则在 `lib/domains/self-model/portrait.ts`。

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
| 认识层(一级导航) | reality, customer-view, self, signals | self 是自我认知台账:自述不进推理,只记可证伪的条件命题;数值规则见原则 1 例外。**自述的唯一例外(经用户裁决,2026-10)**:signals 读新闻时可从自述里抽"处境事实"(工作、行业、在学、在做的事),自我评价一律不抽,每条事实必须能在原文里逐字找到出处(代码核对),只用于判断新闻跟他有没有关系,不进 self 台账的任何推理;写法画像仍不读。规则在 `lib/domains/signals/reader-facts.ts`。signals(外部信号,每日新闻)只读不写:新闻不直接进任何台账,被人挑中的那条连同用户写的一句"为什么在意"记成带「外部」标签的观察,进捕捉链条(痛点雷达、周复盘);详情页的 AI 报告第一次打开时生成并缓存;每天一道"先判断再看答案"的练习,判断进 predictions(source_type=signal)到期对账,账本只记次数不算比率;报告分四节:世界(news)、已经定了的未来(calendar,只收写明日期的变化)、谁在头疼什么(voices)、新工具(tools);"历史上类似的事"写判断前就能看,荐书必须在 Open Library / NDL 查到且不是小说;每节精选 5 条,AI 给每条标事件标签、代码按标签去重,多出的不同事件进"也值得一看"(只有标题);「往下推」每一步正反两个方向上网查证据(来源与原文摘录由代码核对),Jev 看证据判档、不看推论自己写的理由,任意一步可"押这一条"进判断账本;报告里"能找谁聊"可记成触达规划画布;到期的判断进今日行动收件箱;不打分、不给投资建议 |
| 档案层(低权重导航) | companies(含原 company-kb), knowledge | |
| 工具层(无一级导航) | reasoning 5 框架, council | 从 workbench/idea 上下文调用,/tools 聚合页兜底 |
| 设置区 | AI 诊断、导出、审计、profile | |
| 已杀死 | life(生活罗盘) | 不得复活;同类需求走 materials |

**禁止**:新增一级导航模块、新增独立闭环系统、新增独立输入口。导航固定 4 组 14 项 + 底栏。
新增一级模块必须先写进上表并同步 `components/app-navigation.test.ts`(该测试锁死组数与项数);
self 与 signals 是经用户明确裁决后加入的例外,不构成后续新增的先例。
(signals:原 /review 外部信号页,2026-10 经用户裁决以每日新闻形式复活于 `/signals`,
表沿用 004 的 external_signals,抓取逻辑在 `lib/domains/signals/`,每天由 Vercel Cron 跑一次。)

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
   **例外一(`/self` 揭晓时刻)**:`animate-self-reveal` / `animate-self-stamp` /
   `animate-self-sheen`,只挂在一次性的揭晓结果上(扫出新特性、结算涨档、盖修订章)。
   **例外二(`/self` 常驻)**:两处允许常驻动效 ——
   ①品级标签:史诗 / 传说 / 暗金 / 套装四档;
   ②技能格:**只有内核层与印记层**已点亮的格子(呼吸;印记再加一道慢扫光)。
   普通到稀有的标签、元件/回路/模组的格子必须保持安静 ——
   满屏都在动,深的那几格就不深了。常驻动效的资格由结构决定
   (前置必须跨领域),不由喜好决定。
   周期一律 ≥4.5 秒、低幅度:这一页是每周要看的东西,不是抽卡界面。
   两条例外都只在 `.self-sheet` 作用域内,且全部包在
   `prefers-reduced-motion: no-preference` 里。
8. **暂不支持暗色模式**:禁止写 `dark:` 类(待正式接入主题切换后再启用)。

## 文案铁律 —— 说人话

界面上的每一句都是**一个懂行的老同事坐在旁边说话**,不是系统提示,
也不是教练打鸡血。严谨和冷是两回事,别混成一件事。

1. **写场景,不写定义**。「连续七天每天写下一条发生了什么」是法条;
   「连着七天,每天睡前写一句今天发生了什么」能看见画面。判据一律用后者。
2. **不许把内部词汇搬到界面上**:触发窗口、分母、判据、节点、层级、
   契合度 —— 这些是给写代码的人用的。对人要说「那一次」「一共几次」
   「算不算数」「哪一格」。
3. **挫败的地方要承认处境**。空状态不许写成 404。
   「这个筛子下什么都没有」→「这里空着。」后面补一句为什么,以及下一步。
4. **第二人称,短句,允许一点体温**。
5. **但温度不等于迎合**:不许夸、不许打气、不许"你很棒"。
   原则 2(AI 对抗性)和这一条不冲突 —— 老同事会直说你哪里不行,
   他只是不用公文腔说。

新写的每一句界面文案都要过这五条。改老文案时顺手一起改。

## 技术栈(不要替换)

- 前端:Next.js 14 App Router + TypeScript
- 样式:Tailwind CSS + shadcn/ui
- 数据库 & Auth:Supabase (PostgreSQL)
- AI:Google Gemini API(@google/genai),模型 gemini-2.5-flash(经 lib/ai-gateway.ts 封装,模型名读 AI_MODEL)
- 判断模型:TypeSafe Jev(只回档位/概率,不生成文字),同样经 lib/ai-gateway.ts 的 `executeJev`,
  Key 读 JEV_API_KEY、模型名读 JEV_MODEL;用于写法画像,以及 signals「往下推」里给每一步判档位
  (写推论的 Gemini 和判档位的 Jev 分开;页面只显示五档(很可能/较可能/一半一半/不太可能/很不可能)和"拿不准",不显示 Jev 的数字)
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
- predictions: id, user_id, source_type(idea/retro/self/signal), idea_id(source_type=idea时必填), period_id(source_type=retro时必填), hypothesis_id(self 侧可选), confidence(0-100,用户自填的把握度), text, due_at, made_at, outcome(enum pending/hit/miss), resolved_at, note
  — 统一的预测对账表,idea 侧、周复盘侧、self 侧共用同一张表与同一套到期/命中逻辑
  (idea_id 与 period_id 互斥;source_type=self/signal 时两者皆空)。各侧同表是为了能横向比校准。
  signal 侧是"读新闻练判断":先写自己的判断再看 AI 的,上下文(新闻、问题、AI 挑刺)在 signal_judgments。
- self_hypotheses / self_windows / self_declarations: /self 台账。self_windows 记录每一次
  "符合触发条件的情境"含行为未发生的(outcome=miss)——它是触发率的分母,少了它数字就退回评分。
  档位升降规则在 lib/domains/self-model/tiers.ts,AI 只有提名权、无授予权。
- signal_profiles: 读新闻用的处境事实缓存(facts 带原文出处,facts_from 记抽取时用到的最新自述时间)。
- self_portraits: 写法画像快照(answers 原样存 Jev 输出,sources 存当次读的原文)。
  台账旁路,任何推理不得读它(原则 1 例外二)。
- idea_exit_criteria: id, idea_id, user_id, criterion, triggered(unreviewed/yes/no), reviewed_at, created_at

其余模块的表定义见 `supabase/migrations/`(按编号顺序执行,append-only);
`supabase/schema.sql` 是全新安装用的完整拼合版,新增迁移时必须同步追加到该文件末尾。
杀死模块的表用清理迁移显式 drop,并同步 schema.sql。
