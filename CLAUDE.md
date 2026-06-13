# IdeaOS 项目宪法

## 产品本质
IdeaOS 不是笔记工具，不是 AI 聊天工具。它是一个**对抗使用者认知偏误的决策系统**。
产品的敌人不是竞争对手，而是使用者自己的大脑。

## 一句话流程
记录观察 → 假设化 → AI 质疑 → 验证行动 → Go/Kill 决策

## 不可违背的设计原则（违反即为 bug）

1. **绝不加评分系统**。不要任何 1-10 分、星级、百分比的"想法打分"。
   理由：精确的数字会给主观判断穿上客观外衣（精确性偏误）。只允许二元决策。

2. **AI 必须是对抗性的，不许迎合**。所有 AI prompt 的目标是"找出这个想法会死的理由"，
   不是让用户感觉良好。禁止输出"很有潜力""不错的想法"这类话。

3. **捕捉必须 30 秒内完成**。不强制填标题、不强制分类。摩擦越低越好（蔡格尼克效应 / Fogg 行为模型）。

4. **证据只记录两个二元信号**：has_pain（有真实痛？）、will_pay（愿付钱？），值为 yes/no/unsure。
   不要做"事实/观点/弱信号/强信号"这种多级分类（认知负荷理论）。

5. **强制出口机制**：一个想法停留在"验证中"超过 3 天且没有新的 validation 记录，
   则锁定该想法的 AI 质疑功能，提示用户去做一次真实接触。这是产品灵魂，必须实现。

6. **状态只有 5 个**：观察 / 假设 / 验证中 / MVP候选 / 归档。
   绝不加"有潜力"这种模糊中间态（选择的悖论）。

7. **Kill 的界面语言用"学到了什么"，不用"失败/放弃"**（损失厌恶 / 认知重评）。

## 技术栈（不要替换）
- 前端：Next.js 14 App Router + TypeScript
- 样式：Tailwind CSS + shadcn/ui
- 数据库 & Auth：Supabase (PostgreSQL)
- AI：Google Gemini API（@google/genai），模型 gemini-2.5-flash（经 lib/ai.ts 封装，模型名读 AI_MODEL）
- 部署：Vercel

## 代码约定
- 所有 DB 查询用 Supabase client，RLS 先用 service role key 跑通（单用户阶段）
- AI 调用统一封装在 `lib/ai.ts`，模型名用环境变量 `AI_MODEL` 便于切换
- 提交前确保无 ESLint unused-variable 错误（Vercel build 会因此失败）
- 组件用函数式 + Hooks，不用 class 组件

## 数据库 Schema
- observations: id, user_id, raw_text, tags(text[]), created_at
- ideas: id, user_id, title, hypothesis(jsonb), status(enum), tags(text[]), created_at, last_activity_at
- validations: id, idea_id, has_pain(enum), will_pay(enum), note, contacted_at
- ai_sessions: id, idea_id, role(enum), messages(jsonb), created_at
- decisions: id, idea_id, verdict(enum), reason, learned, decided_at
