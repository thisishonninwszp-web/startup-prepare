# AI 先判、你点行不行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 预测题和每天的练习改成 AI 先判、他点「行 / 不行 / 跳过」;每周各留一道先判;记分分成 AI、他改判的、他先判的三份,点「行」的不算他的分。

**Architecture:** 预测题:AI 的中间值(有回测校准就用校准后的)直接摆在卡片上,他点「行」= 记成那个数(mode agree),
点「不行」= 在那一边挑一档(mode override);每周一道先判题由代码按「东京时间这一周最早进账本的那道」认,不加列。
练习:后台按预测题的同一套(上网查一次、三种思路、代码取中间)给当天练习题出 AI 先判,存在那天报告的 practice.ai_draft;
那一句由代码拼;他点「行」原样进判断账本、不挑刺,点「不行」方向反过来、照旧挑刺;每周一的练习照旧先判。
两张表各加一列 mode 记来路(迁移 099),mode 为空 = 迁移前的,一律当先判。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase、Gemini(经 `lib/ai-gateway.ts`)、vitest。

设计见 `docs/superpowers/specs/2026-10-23-ai-first-judgment-design.md`。每个任务本地提交,不 push。
验证:`npx tsc --noEmit`、`npm run lint`、`npm test`;dev server 开着时不 `npm run build`。提交信息用「」不用 ASCII 双引号。

## 写计划时定下的(和设计文档不一样或设计没写细的)

- **先判题不加 `forecast_questions.blind` 列**:改成代码按 created_at 认 ——「东京时间每一周(周一开始)里最早进账本的那一道,同时进的按 id」。
  五个进题的地方(市场、生意、到日本、数据、政策)都不用动,也不怕漏;页面(`blindQuestionIds`)和服务器(`isBlindQuestion`)按同一条规则认。
  迁移 099 因此只加三列:`forecasts.mode`、`signal_judgments.mode`、`signal_judgments.ai_draft`。Task 12 顺手改设计文档。
- **「行」记的数 = 卡片上显示的数**:有可用的回测校准(`aiCalibration()`,回测学到且确实更准)就是校准后的数,取两位小数;
  服务器自己重算,不信浏览器传来的数。点的档和显示的数差不到 0.005 也算「行」。
- **练习「不行」的「补一句为什么」**:不加新格子 —— 判断那一格预填「会:〔题目〕」,他在后面接着写就是理由;
  挑刺时 AI 原来判的哪边、三种思路的理由经 `reasoning` 那一格传给 `critiqueJudgment`(prompt 不用改)。
- **练习的「跳过」只在这一页收起**(不记库);刷新页面会再出现。预测题的「跳过」照旧记 forecast_reveals(和"先看答案"同一个动作)。
- **「想自己想一想」**:没判之前把"看历史上类似的事"和"先拆一拆"(只拆、不带表单)折在卡片下面;交判断一律走「行 / 不行」。
- **邮件里的练习不带 AI 那一句**:AI 先判在 7:30 后台出,邮件 6 点多就发了,多数时候还没有。只改预测题那一键。
- **后台用哪个账号**:练习的 AI 先判存在主账号那份报告上(朋友读主账号那份,`sharedViewFor`),提交时服务器从那份读。
- **工作目录**:沿用 `D:\projects\startup-prepare-visual` 那个 worktree(node_modules 联接、`.env.local`、`.claude/launch.json` 里的 `ideaos-visual` 3200 端口都现成),
  在里面从 main 开新分支。

| # | 做什么 | 文件 | 测 |
|---|---|---|---|
| 0 | worktree 换到新分支 | — | — |
| 1 | 迁移 099 | `supabase/migrations/099_ai_first_judgment.sql`、`supabase/schema.sql` | — |
| 2 | 预测题的纯函数:来路、先判题、显示的数、两边的档、记分过滤、分组 | `lib/domains/signals/forecast-shared.ts` | forecast-shared.test |
| 3 | 预测题的服务器:读写 mode、认先判题、「行」和「改判」 | `lib/domains/signals/forecast.ts`、`app/(app)/signals/memory-actions.ts` | tsc |
| 4 | 预测卡片和预测页(三份记分) | `app/(app)/signals/forecast/forecast-cards.tsx`、`forecast/page.tsx` | tsc/lint |
| 5 | 一起练只比先判和改判;「今天」的预测块 | `lib/domains/signals/compare.ts`、`today.ts`、`app/(app)/signals/today-blocks.tsx` | tsc |
| 6 | 邮件一键和落地页 | `lib/domains/signals/notify.ts`、`app/a/[token]/page.tsx`、`app/a/[token]/actions.ts` | notify.test |
| 7 | 练习的纯函数:AI 先判那一句、把握、周一先判、按来路数 | `lib/domains/signals/practice-shared.ts`、`brief.ts`(类型) | practice.test |
| 8 | 出练习的 AI 先判、后台一步 | `lib/domains/signals/practice-draft.ts`、`breakdown.ts`、`app/api/cron/jobs/[step]/route.ts`、`.github/workflows/signals-jobs.yml` | tsc |
| 9 | 交判断认「行 / 改判」 | `lib/domains/signals/practice.ts`、`app/(app)/signals/actions.ts` | tsc |
| 10 | 练习卡片 | `app/(app)/signals/practice-draft-card.tsx`、`practice-composer.tsx`、`judgment-forms.tsx`、`page.tsx` | tsc/lint |
| 11 | 判断账本按来路标、按来路数 | `app/(app)/signals/practice/page.tsx`、`judgment-view.tsx` | tsc |
| 12 | 宪法、设计文档、全部验证、本机看一遍 | `CLAUDE.md`、spec | 全部 |

---

### Task 0: worktree 换到新分支

- [ ] **Step 1: 确认旧分支已经合进 main、工作区干净,再开新分支**

```bash
cd /d/projects/startup-prepare-visual
git status --short
git branch --merged main | grep signals-visual
git switch -c feat/ai-first-judgment main
git log --oneline -1
npx tsc --noEmit && npx vitest run lib/domains/signals 2>&1 | tail -3
```

Expected:`git status` 空;`feat/signals-visual` 在 merged 列表里;新分支指向 main 最新(`309ec77` 或之后);tsc 无输出;测试全过。
**之后所有命令都在 `D:\projects\startup-prepare-visual` 里跑,文件路径也都指那边。**
(3200 的 dev server 如果还开着,先 `preview_list` 看一眼;切分支后它会热更新,不用重启。)

---

### Task 1: 迁移 099

**Files:**
- Create: `supabase/migrations/099_ai_first_judgment.sql`
- Modify: `supabase/schema.sql`(末尾追加同样内容)

- [ ] **Step 1: 写迁移**

```sql
-- 099：AI 先判、他点行不行（经用户明确裁决，2026-10-23）。
-- forecasts.mode（只有 source = 'me' 的行有）：blind 先判（看不到 AI）、agree 点了「行」、override 改了一档。
-- signal_judgments.mode 同义；ai_draft 是那道练习题 AI 先判的原样（三种思路和中间值），改判时挑刺要看。
-- mode 为空 = 迁移以前记的，一律当先判（那时看不到 AI）。先判题不加列：代码按「东京时间每周最早进账本的那道」认。

alter table forecasts add column if not exists mode text;
do $$ begin
  alter table forecasts add constraint forecasts_mode_check check (mode in ('blind', 'agree', 'override'));
exception when duplicate_object then null; end $$;

alter table signal_judgments add column if not exists mode text;
do $$ begin
  alter table signal_judgments add constraint signal_judgments_mode_check check (mode in ('blind', 'agree', 'override'));
exception when duplicate_object then null; end $$;

alter table signal_judgments add column if not exists ai_draft jsonb;
```

- [ ] **Step 2: 追加到 `supabase/schema.sql` 末尾**(同样内容,前面空一行)

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/099_ai_first_judgment.sql supabase/schema.sql
git commit -m "feat(signals): 迁移 099 —— 预测和判断记来路（先判 / 同意 AI / 改判），存练习的 AI 先判

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 预测题的纯函数

**Files:**
- Modify: `lib/domains/signals/forecast-shared.ts`
- Modify: `lib/domains/signals/forecast-shared.test.ts`

- [ ] **Step 1: 写测试**(加在 `forecast-shared.test.ts` 末尾;import 补上新名字)

```ts
describe("先判题和来路", () => {
  const q = (id: string, created_at: string) => ({ id, created_at });

  it("东京时间的周一 0 点", () => {
    // 2026-10-25 是周日；东京 10-26（周一）00:30 = UTC 10-25 15:30
    expect(tokyoWeekStart("2026-10-25T15:30:00Z")).toBe("2026-10-25T15:00:00.000Z");
    expect(tokyoWeekStart("2026-10-25T14:59:00Z")).toBe("2026-10-18T15:00:00.000Z");
  });

  it("每周最早进账本的那道是先判题，同时进的按 id", () => {
    const ids = blindQuestionIds([
      q("b", "2026-10-20T01:00:00Z"),
      q("a", "2026-10-20T01:00:00Z"),
      q("c", "2026-10-21T01:00:00Z"),
      q("d", "2026-10-27T01:00:00Z"),
    ]);
    expect(Array.from(ids).sort()).toEqual(["a", "d"]);
  });

  it("卡片上显示的 AI 数：有校准用校准后的，取两位", () => {
    expect(shownAi(0.333, null)).toBe(0.33);
    expect(shownAi(0.9, { a: 0.5, b: 0 })).toBeLessThan(0.9);
  });

  it("不行时只给那一边的档", () => {
    expect(tiersBeside(0.3, "higher")).toEqual([0.5, 0.7, 0.85, 0.95]);
    expect(tiersBeside(0.3, "lower")).toEqual([0.05, 0.15]);
    expect(tiersBeside(0.95, "higher")).toEqual([]);
  });

  it("记分时「你」只留某几种来路，别的方原样留", () => {
    const f = (source: Forecast["source"], mode?: Forecast["mode"]): Forecast => ({ question_id: "x", source, probability: 0.5, reason: null, made_at: "", mode });
    const all = [f("me", "agree"), f("ai"), f("market")];
    expect(withMyModes(all, ["blind", "override"]).map((x) => x.source)).toEqual(["ai", "market"]);
    expect(withMyModes([f("me", null)], ["blind"])).toHaveLength(1); // 迁移前的算先判
  });
});
```

`boardSections` 那一组原有的测试:等你判断的题现在要么是先判题、要么 AI 判过。给原测试的题补一条 `ai` 预测(或让它是那一周最早的一道),
再加一条:**AI 没判过、又不是先判题的,不进 toForecast**。

- [ ] **Step 2: 跑测试,确认新测试失败**

```bash
npx vitest run lib/domains/signals/forecast-shared.test.ts 2>&1 | tail -8
```

- [ ] **Step 3: 实现**(`forecast-shared.ts`)

文件头 import:`import { applyPlatt, type Platt } from "./calibration-shared";`(calibration-shared 不 import 别的文件,没有循环)。

`Forecast` 类型加 `mode`,在它旁边加:

```ts
/** 他那一条（source = me）怎么来的：blind 先判（看不到 AI）、agree 点了「行」、override 改了一档。迁移 099 以前的为空，算先判。 */
export type ForecastMode = "blind" | "agree" | "override";

export type Forecast = { question_id: string; source: ForecastSource; probability: number; reason: string | null; made_at: string; mode?: ForecastMode | null };

export function modeOf(f: Pick<Forecast, "mode">): ForecastMode {
  return f.mode ?? "blind";
}

export const MODE_LABELS: Record<ForecastMode, string> = { blind: "先判", agree: "同意 AI", override: "改判" };
```

`MY_TIERS` 后面加:

```ts
/** 东京时间那一周的周一 0 点（UTC 的 ISO）。created_at 是 UTC 的 ISO。 */
export function tokyoWeekStart(iso: string): string {
  const tokyo = new Date(Date.parse(iso) + 9 * 3_600_000);
  const offset = (tokyo.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate() - offset) - 9 * 3_600_000).toISOString();
}

/**
 * 每周一道先判题：东京时间每一周里最早进账本的那一道（同时进的按 id）。
 * 先判题照旧先点自己的几成、看不到 AI；别的题 AI 先判、他点行不行。服务器那边的 isBlindQuestion 按同一条规则认。
 */
export function blindQuestionIds(questions: Pick<ForecastQuestion, "id" | "created_at">[]): Set<string> {
  const first = new Map<string, Pick<ForecastQuestion, "id" | "created_at">>();
  for (const q of questions) {
    const week = tokyoWeekStart(q.created_at);
    const cur = first.get(week);
    const t = Date.parse(q.created_at);
    if (!cur || t < Date.parse(cur.created_at) || (t === Date.parse(cur.created_at) && q.id < cur.id)) first.set(week, q);
  }
  return new Set(Array.from(first.values()).map((q) => q.id));
}

/** 卡片上显示的 AI 数（他点「行」就记这个数）：有可用的回测校准就用校准后的，取两位小数。 */
export function shownAi(ai: number, platt: Platt | null): number {
  const p = platt ? applyPlatt(ai, platt) : ai;
  return Math.round(Math.min(0.99, Math.max(0.01, p)) * 100) / 100;
}

/** 点「不行，更高 / 更低」时给的档：只给那一边的。 */
export function tiersBeside(shown: number, side: "higher" | "lower"): number[] {
  return MY_TIERS.filter((p) => (side === "higher" ? p > shown + 0.005 : p < shown - 0.005));
}

/** 记分用：「你」那一方只留某几种来路（点「行」的不算你的分，那是 AI 的）；别的方原样留。 */
export function withMyModes(forecasts: Forecast[], modes: ForecastMode[]): Forecast[] {
  return forecasts.filter((f) => f.source !== "me" || modes.includes(modeOf(f)));
}
```

`BoardSections` 加一项:

```ts
  /** 哪几道是每周一道的先判题（blindQuestionIds）。 */
  blind: Set<string>;
```

`boardSections` 里:

```ts
  const blind = blindQuestionIds(questions);
  const withAi = new Set(forecasts.filter((f) => f.source === "ai").map((f) => f.question_id));
  // 先判题照旧先点；别的题等 AI 判完才放进来（后台一天两次，半天内判完）
  const toForecast = questions.filter(
    (q) => q.status === "open" && !q.revealed_at && !mine.has(q.id) && daysBetween(today, q.resolve_on) > 0 && (blind.has(q.id) || withAi.has(q.id))
  );
```

return 里加上 `blind`。注释「等他判断:还开着、他没判断过、没先看答案、还没到期」改成「……还没到期;不是先判题的要 AI 判过」。

- [ ] **Step 4: 跑测试,全过**

```bash
npx vitest run lib/domains/signals/forecast-shared.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: 提交**

```bash
git add lib/domains/signals/forecast-shared.ts lib/domains/signals/forecast-shared.test.ts
git commit -m "feat(signals): 预测题的来路、每周一道先判题、卡片上显示的 AI 数、改判的档、记分按来路过滤

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 预测题的服务器

**Files:**
- Modify: `lib/domains/signals/forecast.ts`
- Modify: `app/(app)/signals/memory-actions.ts`

- [ ] **Step 1: 读 forecasts 时带上 mode,099 没跑退回老列**

`loadForecastBoard` 里查 forecasts 的那一句改成先带 `mode` 查,报列不存在再不带:

```ts
const FORECAST_COLUMNS = "question_id, user_id, source, probability, reason, made_at";

/** 先带 mode 查（迁移 099），没跑就不带：老记录本来就全是先判。 */
async function selectForecasts(userIds: string[]) {
  const withMode = await supabaseAdmin.from("forecasts").select(`${FORECAST_COLUMNS}, mode`).in("user_id", userIds);
  if (!withMode.error || !/mode/.test(withMode.error.message)) return withMode;
  return supabaseAdmin.from("forecasts").select(FORECAST_COLUMNS).in("user_id", userIds);
}
```

`Promise.all` 里那一项换成 `selectForecasts(Array.from(new Set([pool, userId])))`;map 时 `mode` 原样带上(没有就是 undefined)。

加:

```ts
export const MODE_MISSING = "迁移 099 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/099_ai_first_judgment.sql，之后才能点「行 / 不行」。";
```

- [ ] **Step 2: `insertForecasts` 认 mode**

rows 的类型加 `mode?: ForecastMode`;payload 只在给了 mode 时带这一列(别的地方写 AI、市场、基准的照旧,099 没跑也不受影响):

```ts
  const payload = rows.map((r) => ({
    question_id: questionId, user_id: userId, source: r.source, probability: clamp(r.probability), reason: r.reason ?? null,
    ...(r.mode ? { mode: r.mode } : {}),
  }));
```

最后的报错改成:`if (error) throw new Error(missing(error) ? FORECAST_MISSING : /mode/.test(error.message) ? MODE_MISSING : error.message);`

- [ ] **Step 3: 服务器认先判题**

```ts
/** 这道是不是那一周的先判题：东京时间那一周里最早进这一池的那道（和 blindQuestionIds 同一条规则）。 */
async function isBlindQuestion(pool: string, q: ForecastQuestion): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("forecast_questions")
    .select("id")
    .eq("user_id", pool)
    .gte("created_at", tokyoWeekStart(q.created_at))
    .order("created_at")
    .order("id")
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as { id: string } | undefined)?.id === q.id;
}
```

- [ ] **Step 4: `setMyForecast` 改成认「行 / 一档」**

```ts
/**
 * 他对一道题表态：先判题点自己的几成（mode blind）；别的题 AI 先判，「行」= 记成卡片上显示的 AI 数（agree），
 * 点一档 = 改判（override，可以带一句为什么）。显示的数由服务器按回测校准重算，不信浏览器。
 * 题还开着、没到期、没跳过（没先看答案）、没表过态才行；表了不能改。
 */
export async function setMyForecast(
  userId: string,
  questionId: string,
  choice: number | "agree",
  today: string,
  note = ""
): Promise<{ probability: number; mode: ForecastMode }> {
  const { q, pool, shared } = await poolQuestion(userId, questionId);
  if (q.status !== "open" || daysBetween(today, q.resolve_on) <= 0) throw new Error("这道题已经到期了，不能再判断");
  if (await hasRevealed(userId, q, shared)) throw new Error("这道题你跳过了（或先看了答案），不能再判断");
  const { data } = await supabaseAdmin.from("forecasts").select("id").eq("question_id", questionId).eq("source", "me").eq("user_id", userId).maybeSingle();
  if (data) throw new Error("这道题你已经判断过了");

  if (await isBlindQuestion(pool, q)) {
    if (choice === "agree" || !(choice > 0 && choice < 1)) throw new Error("这道是每周一道的先判题：先点你自己觉得的几成");
    await insertForecasts(userId, questionId, [{ source: "me", probability: choice, mode: "blind" }]);
    return { probability: choice, mode: "blind" };
  }

  const { data: aiRow } = await supabaseAdmin.from("forecasts").select("probability").eq("question_id", questionId).eq("source", "ai").eq("user_id", pool).maybeSingle();
  if (!aiRow) throw new Error("AI 还没判这道题，过半天再来");
  const shown = shownAi(Number(aiRow.probability), await aiCalibration().catch(() => null));
  if (choice !== "agree" && !(choice > 0 && choice < 1)) throw new Error("概率不对");
  const agree = choice === "agree" || Math.abs(choice - shown) < 0.005;
  const probability = agree ? shown : (choice as number);
  const mode: ForecastMode = agree ? "agree" : "override";
  await insertForecasts(userId, questionId, [{ source: "me", probability, mode, reason: mode === "override" ? note.trim().slice(0, 200) || null : null }]);
  return { probability, mode };
}
```

import:`aiCalibration` 从 `./backtest`(backtest 只 import `./forecast-shared`,不 import 这个文件,没有循环 —— 写之前 `grep -n "from \"./forecast\"" lib/domains/signals/backtest.ts` 确认一遍,有的话改成由调用的地方传 platt 进来);
`tokyoWeekStart`、`shownAi`、`type ForecastMode` 从 `./forecast-shared`。
`revealQuestion` 的注释改成「他跳过这道(或先看了答案):记下来,这道题以后不能再判断」。

- [ ] **Step 5: action 跟着改**(`memory-actions.ts`)

```ts
export async function setMyForecastAction(questionId: string, choice: number | "agree", note = ""): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    await setMyForecast(userId, questionId, choice, tokyoToday(), note);
    revalidatePath("/signals/forecast");
    revalidatePath("/signals");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}
```

- [ ] **Step 6: 验证、提交**

```bash
npx tsc --noEmit
```

Expected:只剩 `app/a/[token]/actions.ts` 那一处调用(它传的是 number,签名兼容,应当无错;有错在 Task 6 改)。

```bash
git add lib/domains/signals/forecast.ts "app/(app)/signals/memory-actions.ts"
git commit -m "feat(signals): 预测题服务器认先判题、「行」记成显示的 AI 数、改判记一档；读写 mode，099 没跑照旧能先判

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 预测卡片和预测页

**Files:**
- Modify: `app/(app)/signals/forecast/forecast-cards.tsx`
- Modify: `app/(app)/signals/forecast/page.tsx`

- [ ] **Step 1: `ForecastCard` 分两种**

props 改成 `{ q, blind, ai, calibrated, three }`:`ai` 是卡片上显示的数(`shownAi` 算好的,AI 没判是 null),`calibrated` 是用没用校准,`three` 是这道题三种思路那三条。

- `blind || ai === null`:照现在的样子(一排档 + "先不判断,直接看 AI 和市场怎么说"),上面加一句
  `这道先自己判，判完再看 AI 的。每周一道，量的是你自己准不准。`(text-xs text-muted-foreground)。
- 否则:

```tsx
<p className="mt-3 text-sm">
  AI：<span className="font-mono">{pct(ai)}</span> 会{calibrated ? "（按回测校准）" : ""}
</p>
{three.length > 0 && (
  <details className="text-xs">
    <summary className="cursor-pointer text-muted-foreground">为什么（三种思路各说了几成）</summary>
    {/* 和 Answers 里那段同样的列表：SOURCE_LABELS + pct + reason */}
  </details>
)}
<div className="mt-2 flex flex-wrap gap-2">
  <Button size="sm" disabled={pending} onClick={() => act(() => setMyForecastAction(q.id, "agree"))}>行</Button>
  {tiersBeside(ai, "higher").length > 0 && <Button size="sm" variant="outline" onClick={() => setSide(side === "higher" ? null : "higher")}>不行，更高</Button>}
  {tiersBeside(ai, "lower").length > 0 && <Button size="sm" variant="outline" onClick={() => setSide(side === "lower" ? null : "lower")}>不行，更低</Button>}
  <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => revealQuestionAction(q.id))}>跳过</Button>
</div>
{side && (
  <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-1">
      {tiersBeside(ai, side).map((p) => (
        <Button key={p} size="sm" variant="outline" className="h-8 px-2 font-mono text-xs" disabled={pending} onClick={() => act(() => setMyForecastAction(q.id, p, note))}>
          {pct(p)}
        </Button>
      ))}
    </div>
    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句：你看到了什么 AI 没看到的（可以不写）" maxLength={200} />
  </div>
)}
<p className="mt-1 text-xs text-muted-foreground">市场怎么说，点完再给你看。</p>
```

三种思路那段列表抽成一个小组件 `ThreeViews({ three })`,`Answers` 和这里共用。

- [ ] **Step 2: `Answers` 标出你的来路**

`me && \`你 ${pct(me.probability)}\`` 改成 `me && \`你 ${pct(me.probability)}（${MODE_LABELS[modeOf(me)]}）\``。

- [ ] **Step 3: 预测页**

1. `const { toForecast, toConfirm, open, done, blind } = boardSections(board, today);`
2. 等你判断的列表:

```tsx
{toForecast.map((q) => {
  const raw = forecasts.find((f) => f.question_id === q.id && f.source === "ai")?.probability ?? null;
  return (
    <ForecastCard
      key={q.id}
      q={q}
      blind={blind.has(q.id)}
      ai={raw === null ? null : shownAi(raw, calibration)}
      calibrated={!!calibration}
      three={forecasts.filter((f) => f.question_id === q.id && ["ai_outside", "ai_inside", "ai_devil"].includes(f.source))}
    />
  );
})}
```

3. 列表下面那段说明换成:
   `AI 先判好了：同意就点「行」，觉得它高了低了就点「不行」改一档，不想判就跳过。每周有一道先自己判、判完再看 AI 的 —— 那道量的是你自己准不准。点「行」的不算你的分，那是 AI 的。表了态不能改。`(朋友账号那半句保留)
4. PageHeader 的 description 里「每道题你先说你觉得有几成可能会发生，再看 AI 和市场怎么说」改成
   「每道题 AI 先用三种思路各给一个、取中间，你看行不行；每周一道你先自己判」。
5. 记分换成三份:

```ts
const blindMine = withMyModes(forecasts, ["blind"]);
const overrideMine = withMyModes(forecasts, ["override"]);
const others = forecasts.filter((f) => f.source !== "me");
const rows = [
  { label: "你（先判的）", ...scoreBySource(questions, blindMine, ["me"])[0] },
  { label: "你（改判的）", ...scoreBySource(questions, overrideMine, ["me"])[0] },
  ...scoreBySource(questions, others, ["ai", "market", "base", "ai_outside", "ai_inside", "ai_devil"]).map((s) => ({ label: SOURCE_LABELS[s.source], ...s })),
];
const pairs = [
  { label: "你改判的那几次：你 对 AI", h: headToHead(questions, overrideMine, "me", "ai") },
  { label: "你先判的：你 对 AI", h: headToHead(questions, blindMine, "me", "ai") },
  { label: "AI 对 市场", h: headToHead(questions, others, "ai", "market") },
  { label: "你先判的：你 对 市场", h: headToHead(questions, blindMine, "me", "market") },
];
const bins = [
  { label: SOURCE_LABELS.ai, bins: calibrationBins(questions, forecasts, "ai") },
  { label: "你（先判的）", bins: calibrationBins(questions, blindMine, "me") },
];
const agreed = forecasts.filter((f) => f.source === "me" && modeOf(f) === "agree").length;
```

表格、两两比、校准表按 `label` 渲染(去掉 `PAIRS` 常量);两两比里「{SOURCE_LABELS[a]}更近」改成「前一方更近 a 道、后一方更近 b 道」的写法不好读,
直接写成「你更近 / AI 更近」:用 `h.a`、`h.b` 查 `{ me: "你", ai: "AI", market: "市场" }`。
表格下面加一行:`你点「行」同意 AI 的 {agreed} 道不算进上面任何一份「你」的分 —— 那是 AI 的分。改判的那一行最值得看：你出手改判时，比 AI 准还是比它差。`
6. 「判断过、还没对账的」里 `你没判断、先看了答案` 改成 `你跳过了这道`。

- [ ] **Step 4: 验证、提交**

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -5
git add "app/(app)/signals/forecast/forecast-cards.tsx" "app/(app)/signals/forecast/page.tsx"
git commit -m "feat(signals): 预测卡片 AI 先判、你点行 / 不行 / 跳过，每周一道先判；记分分成你先判的、你改判的、AI 三份

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 一起练、「今天」的预测块

**Files:**
- Modify: `lib/domains/signals/compare.ts`
- Modify: `lib/domains/signals/today.ts`
- Modify: `app/(app)/signals/today-blocks.tsx`

- [ ] **Step 1: 一起练只比先判和改判**

`compare.ts` 取「你」那一方时带上 `mode`,099 没跑退回不带;拿到后滤掉 `mode === "agree"` 的:

```ts
const mineQuery = (cols: string) => (a: number, b: number) =>
  supabaseAdmin.from("forecasts").select(cols).eq("source", "me").in("user_id", users).order("question_id").range(a, b);
// 点「行」同意 AI 的不算他的分（迁移 099 没跑时没有这一列，老记录全是先判）
let mine = await selectAll<{ user_id: string; question_id: string; probability: number; mode?: string | null }>(mineQuery("user_id, question_id, probability, mode"));
if (mine.error && /mode/.test(mine.error.message)) mine = await selectAll(mineQuery("user_id, question_id, probability"));
```

(从 `Promise.all` 里拿出来单独跑;`liveRows` 从 `mine.data.filter((f) => f.mode !== "agree")` 算。)按 `selectAll` 的实际签名调整写法。

- [ ] **Step 2: `today.ts` 带上邮件要的那一道**

`TodayForecast` 加:

```ts
  /** 邮件里一键的那一道：等判断的第一道、是不是先判题、卡片上显示的 AI 数（AI 没判是 null）。 */
  quick: { q: ForecastQuestion; blind: boolean; ai: number | null } | null;
```

`loadTodayPersonal` 里:

```ts
    const first = s.toForecast[0];
    const raw = first ? board.forecasts.find((f) => f.question_id === first.id && f.source === "ai")?.probability ?? null : null;
    const platt = raw === null ? null : await aiCalibration().catch(() => null);
    forecast = {
      ...,
      quick: first ? { q: first, blind: s.blind.has(first.id), ai: raw === null ? null : shownAi(raw, platt) } : null,
    };
```

(`aiCalibration` 从 `./backtest`,`shownAi` 从 `./forecast`。)

- [ ] **Step 3: 「今天」的提示语**

`today-blocks.tsx`:`先说你觉得几成，再看 AI 和市场` 改成 `AI 先判好了，你点行不行`。

- [ ] **Step 4: 验证、提交**

```bash
npx tsc --noEmit && npx vitest run lib/domains/signals 2>&1 | tail -3
git add lib/domains/signals/compare.ts lib/domains/signals/today.ts "app/(app)/signals/today-blocks.tsx"
git commit -m "feat(signals): 一起练只比先判和改判的题；「今天」的预测块改说 AI 先判好了

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 邮件一键和落地页

**Files:**
- Modify: `lib/domains/signals/notify.ts`
- Modify: `lib/domains/signals/notify.test.ts`
- Modify: `app/a/[token]/page.tsx`
- Modify: `app/a/[token]/actions.ts`

- [ ] **Step 1: `forecastQuick` 加一句开头**

类型改成 `forecastQuick?: { lead: string; title: string; links: { label: string; url: string }[] } | null;`。
HTML 里 `先说你的判断：${input.forecastQuick.title}` 改成 `${input.forecastQuick.lead}${input.forecastQuick.title}`。
notify.test 里用到 forecastQuick 的地方补上 `lead`,并加一条:lead 出现在 HTML 里。

- [ ] **Step 2: `personalParts` 按先判 / AI 先判拼链接**

```ts
    const quick = f?.quick;
    const links = !quick
      ? []
      : quick.blind || quick.ai === null
        ? MY_TIERS.map((p) => ({ label: pct(p), url: tap("forecast", quick.q.id, String(p)) }))
        : [
            { label: `行（${pct(quick.ai)}）`, url: tap("forecast", quick.q.id, "agree") },
            ...[...tiersBeside(quick.ai, "lower"), ...tiersBeside(quick.ai, "higher")].map((p) => ({ label: pct(p), url: tap("forecast", quick.q.id, String(p)) })),
          ];
    const lead = !quick ? "" : quick.blind || quick.ai === null ? "这道先自己判（每周一道）：" : `AI 说 ${pct(quick.ai)} 会，行不行？点「行」或者点你觉得的几成：`;
    ...
      forecastQuick: quick && links.every((x) => x.url) ? { lead, title: quick.q.title, links: links as { label: string; url: string }[] } : null,
```

原来的 `first` / `tiers` 两行删掉;`forecastTodo` 里的 `first` 改成 `f.toForecast[0]?.title`(不变)。`tiersBeside` 从 `./forecast-shared` import。

- [ ] **Step 3: 落地页认 `agree`**

`page.tsx` 的 forecast 分支:

```tsx
const agree = p.v === "agree";
...
<p className="mb-4 mt-4 text-sm">{agree ? "你点了「行」：同意 AI 的判断。" : `你的判断：${pct(Number(p.v))}。`}记上以后就不能改了。</p>
<ConfirmTap token={params.token} label={agree ? "同意，记上" : `就是 ${pct(Number(p.v))}，记上`} />
```

`actions.ts` 的 forecast 分支:

```ts
      const r = await setMyForecast(p.u, p.t, p.v === "agree" ? "agree" : Number(p.v), tokyoToday());
      ...
      message: [`记上了：你 ${pct(r.probability)}（${MODE_LABELS[r.mode]}）`, ai ? `AI ${pct(ai.probability)}` : "AI 还没判断", ...]
```

(`MODE_LABELS` 从 `@/lib/domains/signals/forecast` import。)

- [ ] **Step 4: 验证、提交**

```bash
npx tsc --noEmit && npx vitest run lib/domains/signals/notify.test.ts 2>&1 | tail -3
git add lib/domains/signals/notify.ts lib/domains/signals/notify.test.ts "app/a/[token]/page.tsx" "app/a/[token]/actions.ts"
git commit -m "feat(signals): 邮件里预测那一键改成 AI 说几成、点「行」或点你觉得的几成；先判题照旧一排档

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 练习的纯函数

**Files:**
- Modify: `lib/domains/signals/practice-shared.ts`
- Modify: `lib/domains/signals/practice.test.ts`
- Modify: `lib/domains/signals/brief.ts`(`BriefPracticeRow` 加 `ai_draft`)

- [ ] **Step 1: 写测试**(`practice.test.ts` 末尾)

```ts
describe("练习的 AI 先判", () => {
  it("把握按离五成多远分三档", () => {
    expect(confidenceFor(0.55)).toBe("low");
    expect(confidenceFor(0.3)).toBe("mid");
    expect(confidenceFor(0.1)).toBe("high");
  });

  it("那一句由代码拼：会 / 不会 + 题目；反过来就是改判预填的那句", () => {
    expect(draftVerdict(0.3, "日银会不会在 2027 年 3 月底前加息？")).toEqual({ will: false, sentence: "不会：日银会不会在 2027 年 3 月底前加息？", confidence: "mid" });
    expect(draftVerdict(0.3, "X？", true).sentence).toBe("会：X？");
  });

  it("周一的练习是先判题", () => {
    expect(isBlindPracticeDate("2026-10-26")).toBe(true);
    expect(isBlindPracticeDate("2026-10-27")).toBe(false);
  });

  it("按来路数，迁移前的算先判", () => {
    const t = tallyModes([
      { mode: "agree", outcome: "hit" },
      { mode: "override", outcome: "miss" },
      { mode: null, outcome: "pending" },
      { mode: undefined, outcome: "hit" },
    ]);
    expect(t.agree).toEqual({ n: 1, hit: 1, miss: 0 });
    expect(t.override).toEqual({ n: 1, hit: 0, miss: 1 });
    expect(t.blind).toEqual({ n: 2, hit: 1, miss: 0 });
  });

  it("改判时告诉挑刺 AI 原来判的哪边、为什么", () => {
    const r = overrideReasoning({ probability: 0.3, perspectives: [{ source: "ai_outside", probability: 0.3, reason: "这类事一般不发生" }], made_at: "" }, "X？");
    expect(r).toContain("AI 先判的是「不会」");
    expect(r).toContain("这类事一般不发生");
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
npx vitest run lib/domains/signals/practice.test.ts 2>&1 | tail -8
```

- [ ] **Step 3: 实现**(`practice-shared.ts`,放在 `CONFIDENCE_LEVELS` 后面)

```ts
/** 判断怎么来的：blind 先判（看不到 AI）、agree 点了「行」同意 AI、override 点了「不行」改判。迁移 099 以前的为空，算先判。 */
export type JudgmentMode = "blind" | "agree" | "override";

export const JUDGMENT_MODE_LABELS: Record<JudgmentMode, string> = { blind: "你自己先判的", agree: "你同意 AI 的", override: "你改判的" };

/** AI 先判、他表态的判断都带这个标签（账本按标签数的时候分得开）。 */
export const AI_FIRST_TAG = "AI 先判";

/** 练习题的 AI 先判：三种思路各说几成、代码取中间（存在那一天报告的 practice.ai_draft）。 */
export type PracticeDraft = {
  probability: number;
  perspectives: { source: "ai_outside" | "ai_inside" | "ai_devil"; probability: number; reason: string }[];
  made_at: string;
};

/** 几成可能换成三档把握：离五成越远越有把握。 */
export function confidenceFor(p: number): ConfidenceKey {
  const d = Math.max(p, 1 - p);
  return d < 0.63 ? "low" : d < 0.8 ? "mid" : "high";
}

/** AI 先判的那一句（代码拼，不让 AI 另写）；flip = 反过来，就是他点「不行」时预填的那句。 */
export function draftVerdict(p: number, question: string, flip = false): { will: boolean; sentence: string; confidence: ConfidenceKey } {
  const will = p >= 0.5 !== flip;
  return { will, sentence: `${will ? "会" : "不会"}：${question.trim()}`, confidence: confidenceFor(p) };
}

/** 每周一的练习是先判题（东京日期 YYYY-MM-DD）：照旧先自己判、可以先拆一拆。 */
export function isBlindPracticeDate(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

/** 判断账本按来路数：几条、看对几条、看错几条（只数次数，不算比率）。 */
export function tallyModes(rows: { mode?: JudgmentMode | null; outcome: JudgmentRow["outcome"] }[]): Record<JudgmentMode, { n: number; hit: number; miss: number }> {
  const out: Record<JudgmentMode, { n: number; hit: number; miss: number }> = {
    blind: { n: 0, hit: 0, miss: 0 },
    agree: { n: 0, hit: 0, miss: 0 },
    override: { n: 0, hit: 0, miss: 0 },
  };
  for (const r of rows) {
    const t = out[r.mode ?? "blind"];
    t.n += 1;
    if (r.outcome === "hit") t.hit += 1;
    if (r.outcome === "miss") t.miss += 1;
  }
  return out;
}

const PERSPECTIVE_NAMES: Record<PracticeDraft["perspectives"][number]["source"], string> = { ai_outside: "先看基准率", ai_inside: "只看这件事", ai_devil: "唱反调" };

/** 改判时交给挑刺的那一段（走 critiqueJudgment 的 reasoning）：AI 原来判的哪边、三种思路的理由。 */
export function overrideReasoning(draft: PracticeDraft, question: string): string {
  const v = draftVerdict(draft.probability, question);
  const views = draft.perspectives.map((x) => `${PERSPECTIVE_NAMES[x.source]}说 ${Math.round(x.probability * 100)}%：${x.reason}`).join("；");
  return `AI 先判的是「${v.will ? "会" : "不会"}」（${Math.round(draft.probability * 100)}%），他不同意、改判了。AI 的理由：${views}`;
}
```

`JudgmentRow` 加:

```ts
  /** 怎么来的（迁移 099 之前没有这一列：undefined，算先判）。 */
  mode?: JudgmentMode | null;
```

`brief.ts` 的 `BriefPracticeRow` 加(import `type PracticeDraft` from `./practice-shared`):

```ts
  /** AI 先判（后台 7:30 或第一次打开时出；周一的先判题没有）。见 practice-draft.ts。 */
  ai_draft?: PracticeDraft;
```

- [ ] **Step 4: 跑测试,全过;提交**

```bash
npx vitest run lib/domains/signals/practice.test.ts 2>&1 | tail -3 && npx tsc --noEmit
git add lib/domains/signals/practice-shared.ts lib/domains/signals/practice.test.ts lib/domains/signals/brief.ts
git commit -m "feat(signals): 练习的 AI 先判那一句由代码拼、把握三档、周一先判、判断账本按来路数

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 出练习的 AI 先判、后台一步

**Files:**
- Modify: `lib/domains/signals/breakdown.ts`(把读写那天练习的两个函数导出,写改成"读新的再合并")
- Create: `lib/domains/signals/practice-draft.ts`
- Modify: `lib/domains/signals/forecast.ts`(导出 `PERSPECTIVES`)
- Modify: `app/api/cron/jobs/[step]/route.ts`
- Modify: `.github/workflows/signals-jobs.yml`

- [ ] **Step 1: `breakdown.ts` 的读写给别处用**

`loadPractice` 改名导出为 `loadBriefPractice`;`savePractice` 换成只改一个字段、写之前重读最新的(拆解卡和 AI 先判可能前后脚写,免得互相冲掉):

```ts
/** 改那天练习的某几样：写之前重读最新的再合并（拆解卡和 AI 先判可能前后脚写，免得互相冲掉）。 */
export async function patchBriefPractice(userId: string, date: string, patch: Partial<BriefPracticeRow>): Promise<void> {
  const fresh = await loadBriefPractice(userId, date);
  const { error } = await supabaseAdmin
    .from("signal_briefs")
    .update({ practice: { ...fresh, ...patch } })
    .eq("user_id", userId)
    .eq("brief_date", date)
    .eq("kind", "news");
  if (error) throw new Error(error.message);
}
```

`ensurePracticeBreakdown` 里的 `savePractice(userId, date, { ...practice, breakdown })` 改成 `patchBriefPractice(userId, date, { breakdown })`;
`saveBreakdownLeans` 同理改成 `patchBriefPractice(userId, date, { breakdown: { ...practice.breakdown, leans: clean } })`。

- [ ] **Step 2: `forecast.ts` 导出三种思路**

`const PERSPECTIVES` 改成 `export const PERSPECTIVES`。

- [ ] **Step 3: 写 `practice-draft.ts`**

```ts
import { forecastFromPerspective, practiceHorizon, questionDeadline } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { getSignalDetail } from "./analysis";
import { loadBriefPractice, patchBriefPractice } from "./breakdown";
import { medianProbability, PERSPECTIVES } from "./forecast";
import { HORIZONS, isBlindPracticeDate, type HorizonKey, type PracticeDraft } from "./practice-shared";

/**
 * 每天练习题的 AI 先判（经用户明确裁决，2026-10-23）：和预测题同一套 —— 上网查一次资料，三种思路各说几成，
 * 至少两个说成了由代码取中间值；那一句（会 / 不会 + 题目）由代码拼（practice-shared.ts 的 draftVerdict）。
 * 存在那一天报告的 practice.ai_draft（不加表），后台 7:30 出（jobs 的 practice 一步），没出的第一次打开「今天」时补。
 * 周一的练习是先判题，不出。出不来返回 null，页面退回先判。
 */
export async function ensurePracticeDraft(userId: string, date: string): Promise<PracticeDraft | null> {
  if (isBlindPracticeDate(date)) return null;
  const practice = await loadBriefPractice(userId, date);
  if (practice.ai_draft) return practice.ai_draft;

  const detail = await getSignalDetail(practice.signal_id).catch(() => null);
  const usable = detail && detail !== "missing-schema" ? detail : null;
  const deadline = questionDeadline(practice.question, date);
  const horizon: HorizonKey =
    practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, date);
  const resolveOn = deadline
    ? deadline.toISOString().slice(0, 10)
    : new Date(Date.parse(`${date}T00:00:00Z`) + HORIZONS[horizon].days * 86_400_000).toISOString().slice(0, 10);

  const sources = (await webSearch(practice.question, 5).catch(() => [])).map((s) => ({ title: s.title, url: s.url, content: s.content }));
  const input = {
    title: practice.question,
    criteria: practice.check_how,
    resolveOn,
    today: date,
    context: usable ? [usable.title, usable.summary].filter(Boolean).join("。") : "",
    sources,
  };
  const results = await Promise.allSettled(PERSPECTIVES.map(({ p }) => forecastFromPerspective(p, input)));
  const perspectives = results.flatMap((r, i) =>
    r.status === "fulfilled" ? [{ source: PERSPECTIVES[i].source as PracticeDraft["perspectives"][number]["source"], probability: r.value.probability, reason: r.value.reason }] : []
  );
  if (perspectives.length < 2) return null;
  const probability = medianProbability(perspectives.map((x) => x.probability));
  if (probability === null) return null;
  const draft: PracticeDraft = { probability, perspectives, made_at: new Date().toISOString() };
  await patchBriefPractice(userId, date, { ai_draft: draft });
  return draft;
}
```

(`practiceHorizon` 返回的 `PracticeHorizon` 是 `HorizonKey` 的子集,直接能用;`getSignalDetail` 的返回类型写之前看一眼,summary 可能叫别的名字。)

- [ ] **Step 4: 后台加一步**

`route.ts` 的 STEPS 加(import `ensurePracticeDraft`):

```ts
  // 今天练习题的 AI 先判（周一的先判题不出；报告还没出来就记一句，下一轮再出）
  practice: async (users, today) => {
    let did = 0;
    const notes: string[] = [];
    for (const u of users) {
      try {
        if (await ensurePracticeDraft(u, today)) did += 1;
      } catch (e) {
        notes.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { done: true, did, note: notes.join("；") || undefined };
  },
```

`signals-jobs.yml`:`for step in embed indicators resolve markets business forecast; do` 改成 `... forecast practice; do`;
文件头注释的括号里加「练习题的 AI 先判」。

- [ ] **Step 5: 验证、提交**

```bash
npx tsc --noEmit && npx vitest run lib/domains/signals 2>&1 | tail -3
git add lib/domains/signals/breakdown.ts lib/domains/signals/practice-draft.ts lib/domains/signals/forecast.ts "app/api/cron/jobs/[step]/route.ts" .github/workflows/signals-jobs.yml
git commit -m "feat(signals): 练习题的 AI 先判 —— 上网查一次、三种思路取中，存在那天的练习里；后台 jobs 加 practice 一步

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 交判断认「行 / 改判」

**Files:**
- Modify: `lib/domains/signals/practice.ts`
- Modify: `app/(app)/signals/actions.ts`

- [ ] **Step 1: 账本读 mode**

```ts
const SELECT_MODE = `mode, ${SELECT}`;
const MISSING_COLUMN = /tags|question_id|miss_reason|outcome_evidence|mode/;
```

`selectJudgments` 的列表改成 `[SELECT_MODE, SELECT, SELECT_BASE, SELECT_LEGACY]`;`flatten` 加
`mode: "mode" in row ? ((row.mode as JudgmentRow["mode"]) ?? null) : undefined,`。

- [ ] **Step 2: `submitJudgment` 认 AI 先判**

input 加:

```ts
  /**
   * AI 先判的练习：agree 点了「行」、override 点了「不行」。服务器按那一天（主账号那份报告）的 AI 先判来记，
   * 不信浏览器传来的 AI 判断；agree 的句子和把握都照 AI 的，不挑刺（AI 挑自己的刺是车轱辘）。
   */
  draft?: { date: string; mode: "agree" | "override" };
```

开头改成:

```ts
  let judgment = input.judgment.trim();
  let confidence = input.confidence;
  let reasoning = input.reasoning?.trim() || undefined;
  let aiDraft: PracticeDraft | null = null;
  if (input.draft) {
    const { sourceUserId } = await sharedViewFor(input.userId);
    const practice = await loadBriefPractice(sourceUserId, input.draft.date);
    aiDraft = practice.ai_draft ?? null;
    if (!aiDraft) throw new Error("这道题 AI 还没判，刷新一下再看");
    if (input.draft.mode === "agree") {
      const v = draftVerdict(aiDraft.probability, practice.question);
      judgment = v.sentence;
      confidence = v.confidence;
    } else {
      reasoning = overrideReasoning(aiDraft, practice.question);
    }
  }
  if (judgment.length < 4) throw new Error("写一句完整的判断，哪怕很粗糙");
```

后面用到 `input.confidence` 的地方换成 `confidence`;`tags` 在有 draft 时补上 `AI_FIRST_TAG`(`normalizeTags([...(input.tags ?? []), ...(input.draft ? [AI_FIRST_TAG] : [])])`)。

插 signal_judgments 时:

```ts
  const needsNewColumns = tags.length > 0 || subject.questionId !== null;
  const row0 = needsNewColumns ? { ...base, tags, question_id: subject.questionId } : base;
  const insertRow = input.draft ? { ...row0, mode: input.draft.mode, ai_draft: aiDraft } : row0;
```

报错处理加一句:`if (/mode|ai_draft/.test(error.message)) throw new Error("迁移 099 还没跑：执行 supabase/migrations/099_ai_first_judgment.sql 之后才能点「行 / 不行」");`
(**这一步要先删掉刚插进 predictions 的那一行**,否则会留一条没有判断的预测:`await supabaseAdmin.from("predictions").delete().eq("id", prediction.id);` 放在 throw 之前。原来的 059 报错同样补上这一句。)

挑刺那段包一层:`if (input.draft?.mode !== "agree") { try { ... reasoning ... } catch {...} }`,把原来的 `input.reasoning?.trim().slice(0, 600)` 换成 `reasoning?.slice(0, 1200)`
(改判的理由里带三种思路,长一些)。长期判断另押苗头的递归调用不传 `draft`(苗头是他自己写的)。

import:`loadBriefPractice` 从 `./breakdown`、`sharedViewFor` 从 `./users`、`AI_FIRST_TAG, draftVerdict, overrideReasoning, type PracticeDraft` 从 `./practice-shared`。

- [ ] **Step 3: action 透传**

`submitJudgmentAction` 的 input 类型加 `draft?: { date: string; mode: "agree" | "override" }`,原样传给 `submitJudgment`;
mode 只认这两个值(`input.draft && !["agree", "override"].includes(input.draft.mode)` 就当没给)。

- [ ] **Step 4: 验证、提交**

```bash
npx tsc --noEmit && npx vitest run lib/domains/signals 2>&1 | tail -3
git add lib/domains/signals/practice.ts "app/(app)/signals/actions.ts"
git commit -m "feat(signals): 交判断认 AI 先判 —— 点「行」照 AI 的句子和把握记、不挑刺；改判照旧挑刺、带上 AI 原来的理由

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 练习卡片

**Files:**
- Create: `app/(app)/signals/practice-draft-card.tsx`
- Modify: `app/(app)/signals/practice-composer.tsx`(加 `withForm`)
- Modify: `app/(app)/signals/judgment-forms.tsx`(加 `draft`)
- Modify: `app/(app)/signals/page.tsx`(`PracticeCard`)

- [ ] **Step 1: `JudgmentForm` 透传 draft**

props 加 `draft?: { date: string; mode: "override" }`,提交时 `submitJudgmentAction({ ..., draft })`。

- [ ] **Step 2: `PracticeComposer` 可以只拆不写**

props 加 `withForm = true`;为 false 时不渲染底下的 `<JudgmentForm>`,说明文字「想清楚了再写下面那句」改成「想清楚了，回上面点行不行」。

- [ ] **Step 3: `practice-draft-card.tsx`**

```tsx
"use client";

/**
 * 每天的练习（经用户明确裁决，2026-10-23）：AI 先判好一句，他点「行」原样记进判断账本，
 * 点「不行」方向反过来、他可以改期限把握、在那句后面接着写为什么，交了照旧挑刺；「跳过」只在这一页收起。
 */
export function PracticeDraftCard({ date, signalId, question, draft, knownTags, defaultHorizon, deadline }: {...}) {
  const v = draftVerdict(draft.probability, question);
  const flipped = draftVerdict(draft.probability, question, true);
  const [mode, setMode] = useState<"idle" | "override" | "skipped">("idle");
  // 「行」：期限照页面替他选好的那档（题目里写了日子就按日子），句子和把握服务器照 AI 的
  const agree = () => startTransition(async () => {
    const r = await submitJudgmentAction({ signalId, question, judgment: "", horizon: defaultHorizon, confidence: null, tags: [], dueDate: deadline, draft: { date, mode: "agree" } });
    if (r.ok) router.refresh(); else setError(r.message);
  });
  ...
}
```

样子:

```
AI：不会 · 有点把握（到 2027年3月底 对账）
▸ 为什么（三种思路各说了几成）
[行]  [不行，我觉得会]  [跳过]
```

- 期限那段:有 `deadline` 用 `deadlineLabel(deadline)`,没有用 `HORIZONS[defaultHorizon].label`。
- 「为什么」列表:`SOURCE_LABELS[x.source]`(从 `@/lib/domains/signals/forecast-shared`)+ `pct` + reason。
- 「不行」:展开 `<JudgmentForm signalId question knownTags defaultHorizon deadline initialJudgment={flipped.sentence} submitLabel="改判，记下" draft={{ date, mode: "override" }} />`,
  上面一句小字:`句子替你反过来了，后面可以接着写为什么。交了 AI 会挑刺。`
- 「跳过」:收成一行 `今天这道不判了。想判的时候刷新一下页面。`
- 卡片下面一句小字:`点「行」不算你的分 —— 那是 AI 的判断，你认可了。周一那道你先自己判。`

- [ ] **Step 4: `PracticeCard` 分三种**

`PracticeCard` 加 props `poolUserId`(page 传 `view.sourceUserId`)和 `isToday`。还没判的时候:

```tsx
const blindDay = isBlindPracticeDate(date);
const draft = practice.ai_draft ?? null;
```

- 标题:`blindDay` →「今天的练习（周一）：先自己判，再看 AI 的」;否则 →「今天的练习：AI 先判了，你看行不行」。已经判过的照旧显示「你写了」那段,前面加 `JUDGMENT_MODE_LABELS[judgment.mode ?? "blind"]` 小标签。
- `blindDay`(或者不是今天、又没有 draft):原来的 `<details>开始写判断 →</details>` 整段不动。
- 有 draft:`<PracticeDraftCard ... />`,下面 `<details><summary>想自己想一想</summary>` 里放 `HistoryPanel` 和 `<PracticeComposer withForm={false} ... />`。
- 今天、没 draft、不是周一:放进 Suspense,现出:

```tsx
async function PracticeDraftLoader(props: {...}) {
  const draft = await ensurePracticeDraft(props.poolUserId, props.date).catch((e) => {
    console.error("practice draft", e);
    return null;
  });
  if (draft) return <PracticeDraftCard draft={draft} {...props} />;
  return (
    <>
      <p className="mt-4 text-xs text-muted-foreground">AI 这次没判出来，这道你自己判。</p>
      {/* 原来的「开始写判断」那段 */}
    </>
  );
}
// <Suspense fallback={<p className="mt-4 text-sm text-muted-foreground">AI 在查资料、判这道题……二三十秒</p>}>
```

把「开始写判断」那段抽成一个组件 `BlindPractice`,两处共用。

- [ ] **Step 5: 验证、提交**

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -5
git add "app/(app)/signals/practice-draft-card.tsx" "app/(app)/signals/practice-composer.tsx" "app/(app)/signals/judgment-forms.tsx" "app/(app)/signals/page.tsx"
git commit -m "feat(signals): 每天的练习 AI 先判一句，你点行 / 不行 / 跳过；周一照旧先自己判；拆解和历史参照折在「想自己想一想」

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 判断账本按来路

**Files:**
- Modify: `app/(app)/signals/practice/page.tsx`
- Modify: `app/(app)/signals/judgment-view.tsx`

- [ ] **Step 1: 账本顶上按来路数**(`tallyJudgments` 那段旁边)

```tsx
const modes = tallyModes(judgments);
// 「你同意 AI 的 3 条（看对 1、看错 0）· 你改判的 1 条（…）· 你自己先判的 5 条（…）」
```

下面一句小字:`同意 AI 的那几条，对了错了说的是 AI 准不准；你改判的和先判的，说的才是你。`

- [ ] **Step 2: 每条标来路**

`JudgmentView`(或账本列表每一行的标题旁)加一个小标签 `JUDGMENT_MODE_LABELS[judgment.mode ?? "blind"]`(text-xs text-muted-foreground,不用颜色)。
`mode === undefined`(099 没跑)时不显示标签。

- [ ] **Step 3: 验证、提交**

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -5
git add "app/(app)/signals/practice/page.tsx" "app/(app)/signals/judgment-view.tsx"
git commit -m "feat(signals): 判断账本按来路标、按来路数（同意 AI / 改判 / 先判）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 宪法、设计文档、全部验证、本机看一遍

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-23-ai-first-judgment-design.md`

- [ ] **Step 1: 宪法**

1. 原则 1 例外四的 ④ 换成:
   `④AI 先判、他点行不行(经用户明确裁决,2026-10-23):「行」记成卡片上显示的 AI 数(有回测校准用校准后的),「不行」在那一边改一档(可带一句为什么),也可以跳过;每周一道先判题(东京时间每周最早进账本的那道,代码认)照旧先押再看、先看了就不能再押;点「行」的不算他的分,他的分只从先判和改判里算(forecasts.mode),一起练也只比这两种;押了不能改。`
2. signals 那一格里「每天一道"先判断再看答案"的练习」那一句后面补:
   `(经用户明确裁决,2026-10-23,改成 AI 先判:后台 jobs 的 practice 一步按预测题同一套给练习题出 AI 先判(上网查一次、三种思路、代码取中间,那一句"会 / 不会:题目"由代码拼,存 practice.ai_draft,lib/domains/signals/practice-draft.ts),他点「行」原样记进判断账本、标签「AI 先判」、不挑刺,点「不行」方向反过来、照旧挑刺(AI 原来的理由一起给挑刺看);每周一的练习照旧先判断、可以先拆一拆;判断账本按来路数(signal_judgments.mode))`
3. 数据库 Schema 段末尾加一行:
   `forecasts.mode / signal_judgments.mode / signal_judgments.ai_draft(迁移 099):判断怎么来的 —— blind 先判、agree 同意 AI、override 改判;为空 = 迁移前的,算先判。`

- [ ] **Step 2: 设计文档补记**

「一、预测题」的「每周一道先判」改成按 created_at 认、不加列;「四、数据」的 SQL 去掉 `forecast_questions.blind`;
「二、每天的练习」补:「不行」的理由接在预填那句后面写;「跳过」只在页面上收起;邮件里的练习这次不带 AI 那一句(后台 7:30 才出)。

- [ ] **Step 3: 全部验证**

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npm test 2>&1 | tail -5
```

Expected:无类型错误、lint 无 error、测试全过(数比 main 多出这次加的几条)。

- [ ] **Step 4: 本机看一遍**(dev server 3200,`ideaos-visual`;用 dev@ideaos.test)

**要先请他跑迁移 099**(不跑也能看先判那条路;「行 / 不行」会提示跑 099)。

1. `/signals/forecast`:先判题是一排档 + 那句说明;别的题有 AI 的数、行 / 不行 / 跳过;点「不行,更高」只出比 AI 高的档。
   点一道「行」→ 进「判断过、还没对账的」,显示「你 xx%(同意 AI)」;记分里「你点「行」同意 AI 的 1 道」。
2. 「今天」:预测块的提示语;练习卡片(今天不是周一的话)出 AI 先判(没出过会转二三十秒),点「不行」展开预填好的表单。
3. `/signals/practice`:按来路的那一行、每条的小标签。
4. 截一张预测卡片和练习卡片的图给他。

- [ ] **Step 5: 提交,交给他**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-23-ai-first-judgment-design.md
git commit -m "docs(signals): 宪法写进 AI 先判、你点行不行（例外四 ④ 和每天的练习）；设计文档补记

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline main..HEAD
```

告诉他:分支 `feat/ai-first-judgment` 上 12 个提交、没合、没 push;迁移 099 要在 Supabase 跑;合并前要不要先在本机点几道。
