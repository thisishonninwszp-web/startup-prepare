# 「这家可能会问的 case」设计文档 —— /jobs 里练ケース面接

日期:2026-10-17
状态:待用户审阅本文档

## 背景

用户在找工作(数据分析、咨询、事业/经营企划、需要中文的岗位)。他问"是不是还可以做一个练 case 的内容,
这样去锻炼以后转职需要的能力"。咨询类的中途面试常有ケース面接,事业企划也常问フェルミ推定。

## 用户的选择(2026-10-17)

- 练 case:**做进 /jobs,题目从岗位来**(不做通用题库,不只给一段 ChatGPT 提示词)。
- 周刊:发 note,作品集放链接(另一件事,不在本文档)。

## 和以前的决定对不对得上

- 记忆里有一条:学习类(拆书、出题)评估后放弃,改用外部工具;"不接账本数据的功能不占导航位"。
  这个功能**接的是岗位数据**(题目从他点了「要这个」的岗位来),也**不占导航**(是岗位页里的一节),
  每道题同时就是那家公司的面试准备 —— 外部工具做不到这一点,所以做进来。
- 宪法原则 1:不打分。只记练了几道、每道卡在哪一步(次数),用了几分钟是事实不是分。
- 宪法原则 2:AI 当面试官要挑刺,不许夸。

## 练一道是什么样

1. 在岗位页(`/jobs/[id]`)点「出一道这家可能会问的 case」。
2. 跳到这道题的页面:上面是题目(日文,像面试官问的那样),下面一行「为什么出这道」(中文,附招聘页原话)。
   例:「この会社の EC 事業の売上を、3年で2倍にするにはどうしますか。」
   前提一栏写可以假设什么(例:「数字は自分で置いてかまいません。考え方を聞きたいです。」)。
3. 计时开始(页面上显示过了几分钟,建议 15 分钟,不强制)。他在框里用日文写结构,点「回答する」。
4. AI 当面试官,针对他写的追问 2–3 个问题(日文),每个问题对准一个具体的漏洞:哪块没拆、哪个假设没根据、数字从哪来、先做哪个为什么。
5. 他逐个回答,点「答え終わった」。
6. 复盘(中文写给他看,参考结构用日文):
   - **参考结构**:一个面试里说得出口的拆法(日文要点),标明「AI 写的参考,不是标准答案」;
   - **最容易被追问穿的两三处**:引用他写的原话,说为什么会被问穿;
   - **卡在哪一步**:AI 从五类里提名一类,他自己点确认或改(AI 只提名,记下的是他点的)。
7. 记下来。岗位页和 `/jobs` 上只显示次数。

### 卡在哪一步(五类,和判断账本"错在哪一步"一样只数次数)

| 键 | 他看到的说法 |
|---|---|
| define | 题目没问清就开始答 |
| split | 拆法有漏、有重 |
| numbers | 数字没根据、算不对 |
| prioritize | 方案没排先后 |
| conclude | 没先说结论 |

## 出题的规矩

- 输入:岗位的公司名、职位名、类别、招聘页正文(`job_postings.body`,前 6000 字)。
- AI 按岗位类别挑题型:数据分析 → 分析设计(某个数字变了怎么查原因);咨询 → 业务改善/利润改善;
  事业企划 → 新规事业/市场规模(フェルミ);需要中文 → 和中国市场有关的。四种题型都允许,AI 选最贴这家的。
- 题目里写到这家公司的事实(在做什么生意、卖给谁)必须在招聘页正文里:「为什么出这道」附一句**招聘页原话**,代码逐字核对(`quoteIn`),对不上就重出。
- 题目和前提里的数字必须在招聘页正文里(`unsupported`),防止编"御社の売上は100億円"。フェルミ题不需要数字。
- 每个岗位可以练很多道;同一岗位再出时,把已经出过的题目给 AI,不出重复的。

## 追问和复盘的规矩

- 追问:2 到 3 个,日文,每个都要引用他写的一句或一个数字(代码查:引用的片段在他的回答里);不许夸(日文、中文禁用词都查)。
  他写得很少(少于 80 字)时,追问的第一句就是「構造をもう少し書いてください」之类,不硬挑。
- 复盘:参考结构 3 到 6 条要点(日文);被问穿的地方 2 到 3 条,每条引用他的原话(代码查);卡在哪一步只能是五类之一。
- 都不打分、不写"答得不错/还差一点"这类评价。

## 页面

- 岗位页(`/jobs/[id]`)加一节「这家可能会问的 case」:按钮 + 这个岗位练过的几道(题目开头、日子、卡在哪一步)。
- 一道题的页面 `/jobs/case/[cid]`(在 `app/(app)/jobs/` 下,有导航壳;只有他自己用):按状态显示 ——
  出好题 → 写结构 → 回答追问 → 复盘。复盘页给「卡在哪一步」五个按钮,AI 提名的那个先选上。
- `/jobs` 首页「市场怎么看你」下面一行小字:练过几道 case,最近 10 道里各卡在哪一步几次(只数次数,点开看是哪几道)。
- 界面文案中文(他自己看);题目、前提、追问、参考结构是日文(面试是日文的)。

## 数据

迁移 `081_job_case_drills.sql`(追加到 `supabase/schema.sql`,CRLF):

```sql
create table if not exists job_case_drills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  posting_id   uuid not null references job_postings (id) on delete cascade,
  status       text not null default 'asked'
    check (status in ('asked', 'answered', 'reviewed')),
  question     jsonb not null,          -- type、prompt_ja、premise_ja、why（中文）、quote（招聘页原话）
  answer       text,                    -- 他写的结构
  answered_at  timestamptz,
  followups    jsonb,                   -- [{q_ja, cites, a}]：追问、引用的他的原话、他的回答
  review       jsonb,                   -- reference_ja[]、weak[{quote, why}]、suggested_step
  stuck_step   text check (stuck_step in ('define', 'split', 'numbers', 'prioritize', 'conclude')),
  started_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_job_case_drills_user on job_case_drills (user_id, created_at desc);
create index if not exists idx_job_case_drills_posting on job_case_drills (posting_id);
alter table job_case_drills enable row level security;
drop policy if exists "job_case_drills_owner" on job_case_drills;
create policy "job_case_drills_owner" on job_case_drills for all using (auth.uid() = user_id);
```

- 状态:asked(出好题)→ answered(交了结构、追问已生成)→ reviewed(答完追问、复盘已生成)。
  stuck_step 他点了才有;没点的复盘照样显示,`/jobs` 上不算进"卡在哪一步"的次数。
- 用了几分钟 = answered_at − started_at,代码算,不存。
- 迁移没跑时显示"迁移 081 还没跑"那句,岗位页其他部分照常。

## 文件

- `lib/ai/jobs-case.ts`:三步的提示词和解析器(`draftCaseQuestion`、`askFollowups`、`reviewCase`),经 `lib/ai/index.ts` 导出。
- `lib/domains/jobs/case-shared.ts`:类型、五类、题型、禁用词、字数门槛、计次(纯函数,可测)。
- `lib/domains/jobs/cases.ts`:出题/交结构/交追问/点卡在哪一步/列出(数据库读写)。
- `app/(app)/jobs/case/[cid]/page.tsx` + 客户端组件(写结构、回答追问、计时、点卡在哪一步)。
- `app/(app)/jobs/[id]/case-panel.tsx`:岗位页那一节。
- `app/(app)/jobs/page.tsx`:一行计数。
- `app/(app)/jobs/actions.ts`:四个 server action(各 60 秒内,每个只调一次 AI)。
- `supabase/migrations/081_job_case_drills.sql`、`supabase/schema.sql`、`CLAUDE.md`(jobs 那一行和 Schema 段)。

## 测试

- 解析器:原话不在招聘页里的题目报错重出;题目里多出招聘页没有的数字报错;追问不引用他原话的丢掉、少于 2 个报错;
  带夸奖的报错;复盘的被问穿处不引用原话的丢掉;卡在哪一步不在五类里报错。
- 计次:只数他点了的;最近 10 道;按五类数。
- 验证照项目约定:`npx tsc --noEmit` + `npm run lint` + `npm test`,dev server 开着时不 build。

## 用的时候会碰到什么、怎么算有用

- 用的时候:投一家之前、或者约到面试的前一晚,在那家的岗位页练一道;面试里真被问到 case,回来对一下当时卡在哪一步。
- 算有用:到 2026-11-16,至少练 5 道(其中至少 2 道是投了的公司);看得出自己最常卡在哪一步。
  练过的公司面试里真问了 case 的话,在投递记录里写一句"问了什么、答得顺不顺"。

## 不做的

- 不打分、不排名、不出"综合评价"。
- 不做语音、不做计时到点自动交卷。
- 不做通用题库(不跟岗位的题)。
- 不把练习内容给任何外人看。
