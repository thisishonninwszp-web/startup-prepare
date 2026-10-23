# 早上的邮件变成一分钟清单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 早上的邮件最上面一框列出今天要他点的几件(最多 8 件),一个按钮点开一页不用登录的清单,每件点一下就记;练习的 AI 先判赶在邮件前出,到期判断的证据由后台先查好。

**Architecture:** 清单的取法(哪几种、什么顺序、各取几件、估几秒、邮件里那一行怎么写)是纯函数(`today-list-shared.ts`);
服务器端 `today-list.ts` 从现成的地方取候选(当天练习、预测题分组、到期判断、回想、实验先猜)交给纯函数挑,邮件和清单页用同一个函数。
清单页挂在现成的 `/a/<口令>` 下,口令多一种 `list`;每个按钮走一个 server action,先验口令,再调现成的函数(`setMyForecast`、`submitJudgment`、
`confirmResolution`、`resolveJudgment`、`rateRecall`、`saveExperimentForecast`),它们本来就会查"是不是这个账号的、还能不能点"。不加表。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase、vitest。

设计见 `docs/superpowers/specs/2026-10-23-one-minute-list-design.md`。每个任务本地提交,不 push。
验证:`npx tsc --noEmit`、`npm run lint`、`npm test`;dev server 开着时不 `npm run build`。提交信息用「」不用 ASCII 双引号。

## 写计划时定下的

- **"是不是清单里的"靠现成函数的检查**:设计写"每个动作都查这道题确实是这个账号今天清单里能点的"。现成的函数已经查了归属和状态
  (`setMyForecast` 查那一池、到期、跳过、表过态;`confirmResolution` 只认出题的主账号;`resolveJudgment` 按 user_id 且只改 pending;
  `saveExperimentForecast` 只认现成的提案)。另外要补的两处:**回想**(`rateRecall` 会给任意 signal_id 新建一行 → 先查这个账号有这条回想)、
  **练习**(只认那一天、主账号那份报告里的那道题,期限由服务器按题目算,不信浏览器)。
- **清单页不调 AI 出东西**:打开页面只读(AI 先判没出就写「还没判完」,不当场现出)。唯一会调 AI 的是练习改判 / 周一先判交了之后的挑刺 ——
  一天一道、同一道只记一次(`submitJudgment` 本来就去重),邮件被转发也刷不了钱。
- **`buildDailyEmailHtml` 的「给你的」**:有清单时,回想、预测、练习不再单列(都在清单里);没有清单时(没配 ACTION_SECRET/CRON_SECRET 或网址,拿不到口令)照旧。
- **到期判断的证据**:后台一步 `due`,查"到期了或 36 小时内到期、还没查过"的,每个账号一次最多 4 条,按时间预算。
- **工作目录**:沿用 `D:\projects\startup-prepare-visual` worktree,从 main 开新分支 `feat/one-minute-list`。

| # | 做什么 | 文件 | 测 |
|---|---|---|---|
| 0 | worktree 换新分支 | — | — |
| 1 | 口令多一种 list | `lib/action-links.ts` | action-links.test |
| 2 | 清单的纯函数 | `lib/domains/signals/today-list-shared.ts` | today-list-shared.test |
| 3 | 取清单、数这周点了几件 | `lib/domains/signals/today-list.ts`、`practice.ts`(加两个小查询) | tsc |
| 4 | 清单页的动作 | `app/a/[token]/list-actions.ts` | tsc |
| 5 | 清单页 | `app/a/[token]/list-view.tsx`、`app/a/[token]/page.tsx` | tsc/lint + 本机看 |
| 6 | 邮件最上面一框 | `lib/domains/signals/notify.ts`、`notify.test.ts` | notify.test |
| 7 | 练习的 AI 先判赶在邮件前 | `lib/domains/signals/brief.ts` | tsc |
| 8 | 到期判断的证据后台先查 | `lib/domains/signals/practice.ts`、`app/api/cron/jobs/[step]/route.ts`、`.github/workflows/signals-jobs.yml` | tsc |
| 9 | 宪法、全部验证、本机点一遍、合并 | `CLAUDE.md` | 全部 |

---

### Task 0: worktree 换新分支

- [ ] **Step 1**

```bash
cd /d/projects/startup-prepare-visual
git status --short
git switch -c feat/one-minute-list main
git log --oneline -1
npx tsc --noEmit && npx vitest run lib/domains/signals 2>&1 | tail -3
```

Expected:工作区干净(`scripts/tmp-platt.ts` 已删);新分支指向 main 最新(`1109c8f` 的下一条,也就是这份计划的提交);tsc 无输出;测试全过。
之后所有命令都在 `D:\projects\startup-prepare-visual` 里跑。

---

### Task 1: 口令多一种 list

**Files:**
- Modify: `lib/action-links.ts`
- Create or Modify: `lib/action-links.test.ts`(已有就加一条)

- [ ] **Step 1: 写测试**

```ts
it("清单的口令：认得出来，过期就不认", () => {
  const now = Date.parse("2026-10-24T00:00:00Z");
  const token = signAction({ u: "user-1", k: "list", t: "2026-10-24", v: "" }, "secret", now, LIST_TTL_DAYS);
  expect(verifyAction(token, "secret", now)?.k).toBe("list");
  expect(verifyAction(token, "secret", now + (LIST_TTL_DAYS + 1) * 86_400_000)).toBeNull();
});
```

- [ ] **Step 2: 实现**

```ts
export type ActionKind = "mark" | "forecast" | "recall" | "list";
/** 一分钟清单的链接几天内有效（单件的 7 天；清单能点的事更多，短一点）。 */
export const LIST_TTL_DAYS = 3;
```

`verifyAction` 里 `["mark", "forecast", "recall"]` 加上 `"list"`。文件头注释加一句「list:一分钟清单那一页,t 是哪一天」。

- [ ] **Step 3: 测试、提交**

```bash
npx vitest run lib/action-links 2>&1 | tail -3
git add lib/action-links.ts lib/action-links.test.ts
git commit -m "feat(signals): 一键链接多一种「一分钟清单」，3 天有效

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 清单的纯函数

**Files:**
- Create: `lib/domains/signals/today-list-shared.ts`
- Create: `lib/domains/signals/today-list-shared.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, expect, it } from "vitest";
import { LIST_CAPS, LIST_MAX, listSeconds, pickListItems, previewLine, type ListCandidates } from "./today-list-shared";

const fq = (id: string, blind = false, ai: number | null = 0.3) => ({ id, title: `题${id}`, kind: "market" as const, resolve_on: "2027-03-31", criteria: "", blind, ai, three: [] });
const base: ListCandidates = { practice: null, forecasts: [], confirms: [], dues: [], recalls: [], experiments: [] };

describe("一分钟清单", () => {
  it("按顺序取、各取几件、最多 8 件，剩下的数出来", () => {
    const c: ListCandidates = {
      ...base,
      practice: { kind: "practice", date: "2026-10-24", signalId: "s", question: "日银会不会加息？", mode: "draft", draft: { probability: 0.85, perspectives: [], made_at: "" }, horizon: "3m", deadline: "2026-12-31" },
      forecasts: [fq("a"), fq("b"), fq("c"), fq("d"), fq("blind", true, null)],
      recalls: [1, 2, 3].map((i) => ({ signalId: `r${i}`, title: `回想${i}`, reason: "你标过", dueOn: "2026-10-24" })),
    };
    const { items, more } = pickListItems(c);
    expect(items.map((i) => i.kind)).toEqual(["practice", "forecast", "forecast", "forecast", "recall", "recall"]);
    // 先判题排在预测题第一个
    expect(items[1]).toMatchObject({ kind: "forecast", q: { id: "blind" } });
    expect(more).toBe(3); // 预测题多 2 道、回想多 1 条
    expect(items.length).toBeLessThanOrEqual(LIST_MAX);
  });

  it("AI 没判的、又不是先判题的预测题不进清单", () => {
    expect(pickListItems({ ...base, forecasts: [fq("x", false, null)] }).items).toEqual([]);
  });

  it("估几秒：练习 10 秒，别的 6 秒", () => {
    const { items } = pickListItems({ ...base, practice: { kind: "practice", date: "d", signalId: "s", question: "q", mode: "blind", draft: null, horizon: "3m" }, forecasts: [fq("a")] });
    expect(listSeconds(items)).toBe(16);
  });

  it("邮件里那一行：哪一种、题目截短、AI 怎么说", () => {
    expect(previewLine({ kind: "forecast", q: fq("a") })).toEqual({ label: "预测", title: "题a", note: "AI：30%" });
    expect(previewLine({ kind: "forecast", q: fq("b", true, null) }).note).toBe("这道先自己判");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "draft", draft: { probability: 0.3, perspectives: [], made_at: "" }, horizon: "3m" }).note).toBe("AI：不会 · 有点把握");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "waiting", draft: null, horizon: "3m" }).note).toBe("AI 还没判完");
  });

  it("各种的上限", () => {
    expect(LIST_CAPS).toEqual({ practice: 1, forecast: 3, confirm: 2, due: 2, recall: 2, experiment: 1 });
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

- [ ] **Step 3: 实现**

```ts
/**
 * 一分钟清单（经用户同意，2026-10-23）：早上的邮件最上面一框 + 点开的那一页，今天要他点的都在这里，每件点一下。
 * 这里是不碰数据库的部分：有哪几种、什么顺序、各取几件、估几秒、邮件里那一行怎么写。邮件和清单页用同一套。
 */
import { pct, type ForecastKind } from "./forecast-shared";
import { CONFIDENCE_LEVELS, draftVerdict, type HorizonKey, type PracticeDraft } from "./practice-shared";
import type { Forecast, PendingResolution } from "./forecast-shared";
import type { InferenceEvidence } from "./inference-shared";

export type ListForecast = { id: string; title: string; kind: ForecastKind; resolve_on: string; criteria: string; blind: boolean; ai: number | null; three: Forecast[] };

export type ListItem =
  | {
      kind: "practice";
      date: string;
      signalId: string;
      question: string;
      /** draft：AI 先判了；blind：周一先自己判；waiting：AI 先判还没出（7:30 后台会补）。 */
      mode: "draft" | "blind" | "waiting";
      draft: PracticeDraft | null;
      horizon: HorizonKey;
      deadline?: string;
    }
  | { kind: "forecast"; q: ListForecast }
  | { kind: "confirm"; q: { id: string; title: string; criteria: string; resolve_on: string; pending: PendingResolution } }
  | { kind: "due"; j: { id: string; predictionId: string; question: string; judgment: string; dueAt: string; evidence: InferenceEvidence[] | null } }
  | { kind: "recall"; r: { signalId: string; title: string; reason: string; dueOn: string } }
  | { kind: "experiment"; p: { kind: string; targetId: string; platform: string; label: string; question: string; dueOn: string } };

export type ListCandidates = {
  practice: Extract<ListItem, { kind: "practice" }> | null;
  forecasts: ListForecast[];
  confirms: Extract<ListItem, { kind: "confirm" }>["q"][];
  dues: Extract<ListItem, { kind: "due" }>["j"][];
  recalls: Extract<ListItem, { kind: "recall" }>["r"][];
  experiments: Extract<ListItem, { kind: "experiment" }>["p"][];
};

/** 一天最多几件、每一种最多几件（多出来的留到明天，不堆）。 */
export const LIST_MAX = 8;
export const LIST_CAPS = { practice: 1, forecast: 3, confirm: 2, due: 2, recall: 2, experiment: 1 } as const;

/** 按顺序取：练习 → 预测题（先判题排第一；AI 没判又不是先判题的不放）→ 到期确认 → 到期的判断 → 回想 → 实验先猜。 */
export function pickListItems(c: ListCandidates): { items: ListItem[]; more: number } {
  const forecasts = [...c.forecasts.filter((q) => q.blind), ...c.forecasts.filter((q) => !q.blind && q.ai !== null)];
  const groups: ListItem[][] = [
    c.practice ? [c.practice] : [],
    forecasts.map((q) => ({ kind: "forecast" as const, q })),
    c.confirms.map((q) => ({ kind: "confirm" as const, q })),
    c.dues.map((j) => ({ kind: "due" as const, j })),
    c.recalls.map((r) => ({ kind: "recall" as const, r })),
    c.experiments.map((p) => ({ kind: "experiment" as const, p })),
  ];
  const caps = [LIST_CAPS.practice, LIST_CAPS.forecast, LIST_CAPS.confirm, LIST_CAPS.due, LIST_CAPS.recall, LIST_CAPS.experiment];
  const items: ListItem[] = [];
  let total = 0;
  groups.forEach((g, i) => {
    total += g.length;
    for (const it of g.slice(0, caps[i])) if (items.length < LIST_MAX) items.push(it);
  });
  return { items, more: total - items.length };
}

/** 估几秒（只是让他知道很短）：练习 10 秒，别的 6 秒。 */
export function listSeconds(items: ListItem[]): number {
  return items.reduce((s, i) => s + (i.kind === "practice" ? 10 : 6), 0);
}

const KIND_NAMES: Record<ListItem["kind"], string> = { practice: "练习", forecast: "预测", confirm: "到期确认", due: "到期的判断", recall: "回想", experiment: "你的实验" };

const clip = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 邮件里那一行：哪一种、题目（截短）、AI 或程序怎么说（回想不写答案）。 */
export function previewLine(item: ListItem): { label: string; title: string; note: string } {
  const label = KIND_NAMES[item.kind];
  switch (item.kind) {
    case "practice": {
      if (item.mode === "blind") return { label, title: clip(item.question), note: "周一：先自己判" };
      if (!item.draft) return { label, title: clip(item.question), note: "AI 还没判完" };
      const v = draftVerdict(item.draft.probability, item.question);
      return { label, title: clip(item.question), note: `AI：${v.will ? "会" : "不会"} · ${CONFIDENCE_LEVELS[v.confidence].label}` };
    }
    case "forecast":
      return { label, title: clip(item.q.title), note: item.q.blind || item.q.ai === null ? "这道先自己判" : `AI：${pct(item.q.ai)}` };
    case "confirm": {
      const s = item.q.pending.suggested;
      return { label, title: clip(item.q.title), note: `程序查到：${s === "yes" ? "看起来「会」" : s === "no" ? "看起来「不会」" : "说不清"}` };
    }
    case "due": {
      const ev = item.j.evidence ?? [];
      const sup = ev.filter((e) => e.stance === "supports").length;
      const con = ev.filter((e) => e.stance === "contradicts").length;
      return { label, title: clip(item.j.judgment), note: item.j.evidence === null ? "证据还没查" : `查到 ${sup} 条支持、${con} 条反对` };
    }
    case "recall":
      return { label, title: clip(item.r.title), note: item.r.reason };
    case "experiment":
      return { label, title: clip(item.p.label), note: "先猜一下" };
  }
}
```

(`previewLine` 测试里的 practice 用例,`draftVerdict(0.3)` 是「不会」、把握 mid =「有点把握」。)

- [ ] **Step 4: 测试、提交**

```bash
npx vitest run lib/domains/signals/today-list-shared.test.ts 2>&1 | tail -3 && npx tsc --noEmit
git add lib/domains/signals/today-list-shared.ts lib/domains/signals/today-list-shared.test.ts
git commit -m "feat(signals): 一分钟清单的取法 —— 哪几种、什么顺序、各取几件、估几秒、邮件里那一行

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 取清单、数这周点了几件

**Files:**
- Create: `lib/domains/signals/today-list.ts`
- Modify: `lib/domains/signals/practice.ts`(加 `pendingDueJudgments`)

- [ ] **Step 1: `practice.ts` 加一个查询**

```ts
/** 到期了、还没对账的判断（新的放后面），带着查过的证据；一分钟清单和后台查证据用。 */
export async function pendingDueJudgments(userId: string, withinHours = 0): Promise<JudgmentRow[]> {
  const rows = await listJudgments(userId);
  const cutoff = Date.now() + withinHours * 3_600_000;
  return rows.filter((r) => r.outcome === "pending" && new Date(r.due_at).getTime() <= cutoff).sort((a, b) => a.due_at.localeCompare(b.due_at));
}
```

(`listJudgments` 只取最近 200 条;到期的判断都在里面。)

- [ ] **Step 2: 写 `today-list.ts`**

```ts
import { supabaseAdmin } from "@/lib/supabase";
import { practiceHorizon, questionDeadline } from "@/lib/ai";
import { loadBriefPractice } from "./breakdown";
import { boardSections, displayedAi, loadForecastBoard } from "./forecast";
import { dueRecalls } from "./recall";
import { loadExperimentBoard } from "./experiments";
import { listJudgments, pendingDueJudgments } from "./practice";
import { HORIZONS, isBlindPracticeDate, type HorizonKey } from "./practice-shared";
import { weekStartOf } from "./issue-shared";
import { sharedViewFor } from "./users";
import { pickListItems, type ListCandidates, type ListItem } from "./today-list-shared";

export * from "./today-list-shared";

/**
 * 一分钟清单（经用户同意，2026-10-23）：今天要他点的，从现成的地方取 —— 当天的练习（主账号那份报告）、预测题分组、
 * 到期确认（只给出题的主账号）、到期的判断、回想、实验先猜；挑法在 today-list-shared.ts。邮件和清单页每次都现取。
 * 只读、不调 AI。哪一块取不到就当那一块是空的，不拦着别的。
 */
export async function loadTodayList(userId: string, today: string): Promise<{ items: ListItem[]; more: number }> {
  const view = await sharedViewFor(userId);
  const quiet = <T,>(what: string, fallback: T) => (e: unknown): T => {
    console.error(`today-list: ${what}`, e);
    return fallback;
  };
  const [practice, board, dues, recalls, experiments, judgments] = await Promise.all([
    loadBriefPractice(view.sourceUserId, today).catch(() => null),
    loadForecastBoard(userId).catch(quiet("forecast", null)),
    pendingDueJudgments(userId).catch(quiet("due", [])),
    dueRecalls(userId, view.shared, today, 5).catch(quiet("recall", null)),
    loadExperimentBoard(userId, today).catch(quiet("experiments", null)),
    listJudgments(userId).catch(quiet("judgments", [])),
  ]);

  const c: ListCandidates = { practice: null, forecasts: [], confirms: [], dues: [], recalls: [], experiments: [] };

  // 练习：他还没对这道题下过判断才放
  if (practice && !judgments.some((j) => j.signal_id === practice.signal_id && j.question === practice.question)) {
    const deadlineDate = questionDeadline(practice.question, today);
    const horizon: HorizonKey =
      practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, today);
    c.practice = {
      kind: "practice",
      date: today,
      signalId: practice.signal_id,
      question: practice.question,
      mode: isBlindPracticeDate(today) ? "blind" : practice.ai_draft ? "draft" : "waiting",
      draft: practice.ai_draft ?? null,
      horizon,
      deadline: deadlineDate ? deadlineDate.toISOString().slice(0, 10) : undefined,
    };
  }

  if (board && board !== "missing-schema") {
    const s = boardSections(board, today);
    const pool = view.sourceUserId;
    c.forecasts = await Promise.all(
      s.toForecast.map(async (q) => ({
        id: q.id,
        title: q.title,
        kind: q.kind,
        resolve_on: q.resolve_on,
        criteria: q.criteria,
        blind: s.blind.has(q.id),
        ai: s.blind.has(q.id) ? null : await displayedAi(q.id, pool).catch(() => null),
        three: board.forecasts.filter((f) => f.question_id === q.id && ["ai_outside", "ai_inside", "ai_devil"].includes(f.source)),
      }))
    );
    c.confirms = s.toConfirm.flatMap((q) => (q.pending ? [{ id: q.id, title: q.title, criteria: q.criteria, resolve_on: q.resolve_on, pending: q.pending }] : []));
  }

  c.dues = dues.map((j) => ({
    id: j.id,
    predictionId: j.prediction_id,
    question: j.question,
    judgment: j.judgment,
    dueAt: j.due_at,
    evidence: j.outcome_evidence ? j.outcome_evidence.evidence : null,
  }));
  c.recalls = (recalls?.items ?? []).map((r) => ({ signalId: r.signal_id, title: r.title ?? "（没有标题）", reason: r.reason, dueOn: r.due_on }));
  if (experiments && experiments !== "missing-schema") {
    c.experiments = experiments.proposals.map((p) => ({ kind: p.kind, targetId: p.targetId, platform: p.platform, label: p.label, question: p.question, dueOn: p.dueOn }));
  }
  return pickListItems(c);
}

/**
 * 这周他点了几件（只数次数）：从现成的时间戳数 —— 他的预测、判断、判断对账、回想、到期确认、实验先猜，不加表。
 * 哪张表没有（迁移没跑）就当 0。
 */
export async function tapsThisWeek(userId: string, today: string): Promise<number> {
  const since = `${weekStartOf(today)}T00:00:00+09:00`;
  const count = async (build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await build();
    return r.error ? 0 : r.count ?? 0;
  };
  const head = { count: "exact" as const, head: true };
  const view = await sharedViewFor(userId);
  const n = await Promise.all([
    count(() => supabaseAdmin.from("forecasts").select("question_id", head).eq("user_id", userId).eq("source", "me").gte("made_at", since)),
    count(() => supabaseAdmin.from("signal_judgments").select("id", head).eq("user_id", userId).gte("created_at", since)),
    count(() => supabaseAdmin.from("predictions").select("id", head).eq("user_id", userId).eq("source_type", "signal").neq("outcome", "pending").gte("resolved_at", since)),
    count(() => supabaseAdmin.from("recall_reviews").select("signal_id", head).eq("user_id", userId).gte("last_at", since)),
    count(() => supabaseAdmin.from("experiment_forecasts").select("id", head).eq("user_id", userId).gte("created_at", since)),
    // 到期确认只有出题的主账号点；生意题、到日本题对账都要他确认，所以按这两种数
    view.shared
      ? Promise.resolve(0)
      : count(() => supabaseAdmin.from("forecast_questions").select("id", head).eq("user_id", userId).in("kind", ["business", "arrival"]).neq("status", "open").gte("resolved_at", since)),
  ]);
  return n.reduce((a, b) => a + b, 0);
}
```

写之前对一下:`experiment_forecasts` 有没有 `id`、`created_at`、`user_id` 列(看 `supabase/migrations/095_experiment_forecasts.sql`);没有 `id` 就换成它的主键列。

- [ ] **Step 3: 验证、提交**

```bash
npx tsc --noEmit && npx eslint lib/domains/signals/today-list.ts lib/domains/signals/practice.ts 2>&1 | tail -3
git add lib/domains/signals/today-list.ts lib/domains/signals/practice.ts
git commit -m "feat(signals): 取一分钟清单（练习、预测、到期确认、到期判断、回想、实验先猜）和这周点了几件

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 清单页的动作

**Files:**
- Create: `app/a/[token]/list-actions.ts`

- [ ] **Step 1: 写**

```ts
"use server";

import { actionSecret, verifyAction } from "@/lib/action-links";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { loadBriefPractice } from "@/lib/domains/signals/breakdown";
import { confirmResolution, loadForecastBoard, MODE_LABELS, pct, revealQuestion, setMyForecast } from "@/lib/domains/signals/forecast";
import { resolveJudgment, submitJudgment } from "@/lib/domains/signals/practice";
import { recallReveal, rateRecall, type RecallReveal } from "@/lib/domains/signals/recall";
import { saveExperimentForecast } from "@/lib/domains/signals/experiments";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { HORIZONS, MISS_REASONS, type HorizonKey, type MissReason } from "@/lib/domains/signals/practice-shared";
import { practiceHorizon, questionDeadline } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase";
import type { RecallResult } from "@/lib/domains/signals/recall-shared";
import type { ExperimentKind } from "@/lib/domains/signals/experiments-shared";

/**
 * 一分钟清单那一页的按钮（不用登录，口令认人）：每个都先验口令（种类 list），做的是口令里那个账号的事。
 * 归属和"还能不能点"由下面调的现成函数查；另外两处在这里补：回想要先有这一条、练习只认那一天主账号报告里的那道题（期限服务器算）。
 */

type Result = { ok: true; message: string } | { ok: false; message: string };

function who(token: string): { u: string; day: string } {
  const secret = actionSecret();
  const p = secret ? verifyAction(token, secret) : null;
  if (!p || p.k !== "list") throw new Error("链接过期了或者不对：回网站上做吧");
  return { u: p.u, day: p.t };
}

const fail = (e: unknown, fallback: string): Result => ({ ok: false, message: e instanceof Error ? e.message : fallback });

export async function listForecastAction(token: string, questionId: string, choice: number | "agree", note = ""): Promise<Result> {
  try {
    const { u } = who(token);
    const r = await setMyForecast(u, questionId, choice === "agree" ? "agree" : Number(choice), tokyoToday(), String(note ?? ""));
    const board = await loadForecastBoard(u);
    const of = (s: string) => (board === "missing-schema" ? undefined : board.forecasts.find((f) => f.question_id === questionId && f.source === s));
    const market = of("market");
    const base = of("base");
    return { ok: true, message: [`记上了：你 ${pct(r.probability)}（${MODE_LABELS[r.mode]}）`, market && `市场 ${pct(market.probability)}`, base && `统计基准 ${pct(base.probability)}`].filter(Boolean).join(" · ") };
  } catch (e) {
    return fail(e, "没记上");
  }
}

export async function listSkipForecastAction(token: string, questionId: string): Promise<Result> {
  try {
    const { u } = who(token);
    await revealQuestion(u, questionId);
    return { ok: true, message: "跳过了。" };
  } catch (e) {
    return fail(e, "没跳过");
  }
}

/** 练习：agree / override（AI 先判的日子）、blind（周一自己写）。题目和期限都按那一天主账号报告里的算。 */
export async function listPracticeAction(token: string, mode: "agree" | "override" | "blind", judgment = ""): Promise<Result> {
  try {
    const { u, day } = who(token);
    const { sourceUserId } = await sharedViewFor(u);
    const practice = await loadBriefPractice(sourceUserId, day);
    const deadline = questionDeadline(practice.question, day);
    const horizon: HorizonKey =
      practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, day);
    await submitJudgment({
      userId: u,
      signalId: practice.signal_id,
      question: practice.question,
      judgment: mode === "agree" ? "" : judgment,
      horizon,
      confidence: null,
      dueDate: deadline ? deadline.toISOString().slice(0, 10) : undefined,
      draft: mode === "blind" ? undefined : { date: day, mode },
    });
    return { ok: true, message: mode === "agree" ? "记上了：你同意 AI 的判断。" : "记上了。AI 的挑刺在网站上的判断账本里。" };
  } catch (e) {
    return fail(e, "没记上");
  }
}

export async function listConfirmAction(token: string, questionId: string, verdict: "yes" | "no" | "void"): Promise<Result> {
  try {
    const { u } = who(token);
    await confirmResolution(u, questionId, verdict);
    return { ok: true, message: verdict === "void" ? "作废了，不算分。" : "对上账了。" };
  } catch (e) {
    return fail(e, "没记上");
  }
}

export async function listResolveAction(token: string, predictionId: string, outcome: "hit" | "miss", missReason?: MissReason): Promise<Result> {
  try {
    const { u } = who(token);
    await resolveJudgment(u, predictionId, outcome, "", missReason && missReason in MISS_REASONS ? missReason : undefined);
    return { ok: true, message: outcome === "hit" ? "记上了：看对了。" : "记上了：看错了。" };
  } catch (e) {
    return fail(e, "没记上");
  }
}

/** 回想：先查这个账号确实有这一条（rateRecall 会给任意一条新建一行）。 */
async function ownRecall(u: string, signalId: string): Promise<void> {
  const { data } = await supabaseAdmin.from("recall_reviews").select("signal_id").eq("user_id", u).eq("signal_id", signalId).maybeSingle();
  if (!data) throw new Error("这一条不在你的回想里");
}

export async function listRecallRevealAction(token: string, signalId: string): Promise<{ ok: true; reveal: RecallReveal } | { ok: false; message: string }> {
  try {
    const { u } = who(token);
    await ownRecall(u, signalId);
    return { ok: true, reveal: await recallReveal(u, signalId) };
  } catch (e) {
    return fail(e, "没取到") as { ok: false; message: string };
  }
}

export async function listRecallRateAction(token: string, signalId: string, result: RecallResult): Promise<Result> {
  try {
    const { u } = who(token);
    await ownRecall(u, signalId);
    const next = await rateRecall(u, signalId, result, tokyoToday());
    return { ok: true, message: `下一次 ${next} 再问你。` };
  } catch (e) {
    return fail(e, "没记上");
  }
}

export async function listExperimentAction(token: string, pick: { kind: ExperimentKind; targetId: string; platform: string }, probability: number): Promise<Result> {
  try {
    const { u } = who(token);
    await saveExperimentForecast(u, tokyoToday(), pick, Number(probability));
    return { ok: true, message: `记上了：你 ${pct(Number(probability))}。` };
  } catch (e) {
    return fail(e, "没记上");
  }
}
```

写之前对一下:`MISS_REASONS` 的导出名、`resolveJudgment` 的参数顺序(`userId, predictionId, outcome, note, missReason`)、
`recallReveal` 对朋友账号要不要用 `sharedViewFor`(看 `app/a/[token]/actions.ts` 的 `revealByTokenAction` 怎么调,照它)。

- [ ] **Step 2: 验证、提交**

```bash
npx tsc --noEmit && npx eslint "app/a" 2>&1 | tail -3
git add "app/a/[token]/list-actions.ts"
git commit -m "feat(signals): 一分钟清单那一页的按钮 —— 先验口令，再调现成的记法；回想先查有没有这一条，练习的题目和期限服务器算

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 清单页

**Files:**
- Create: `app/a/[token]/list-view.tsx`
- Modify: `app/a/[token]/page.tsx`

- [ ] **Step 1: `page.tsx` 认 list**

在 `if (p.k === "forecast")` 之前:

```tsx
  if (p.k === "list") {
    const [list, taps] = await Promise.all([loadTodayList(p.u, p.t), tapsThisWeek(p.u, p.t).catch(() => null)]);
    return shell(<TodayListView token={params.token} day={p.t} items={list.items} more={list.more} seconds={listSeconds(list.items)} taps={taps} />);
  }
```

`metadata` 已经是 noindex,不动。

- [ ] **Step 2: `list-view.tsx`(client)**

骨架:

```tsx
"use client";

/**
 * 一分钟清单那一页（经用户同意，2026-10-23）：今天要你点的，一件一张卡，点完当场收起成一行「记上了」，不刷新整页。
 * 不用登录（口令认人）；打开只是看，点了按钮才记。这一页是给他一个人的。
 */
export function TodayListView({ token, day, items, more, seconds, taps }: {...}) {
  const [done, setDone] = useState<Record<number, string>>({});
  ...
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">{formatReportDate(day)} · 一分钟清单</p>
        <h1 className="mt-1 text-lg font-semibold">{items.length === 0 ? "今天没有要你点的。" : `今天 ${items.length} 件 · 大约 ${seconds} 秒`}</h1>
        {more > 0 && <p className="text-xs text-muted-foreground">还有 {more} 件留到明天。</p>}
      </div>
      <ul className="space-y-3">{items.map((it, i) => <li key={i} className="rounded-lg border border-border bg-card p-4">{done[i] ? <p className="text-sm text-primary">{done[i]}</p> : <Card item={it} ... onDone={(m) => setDone({ ...done, [i]: m })} />}</li>)}</ul>
      <p className="text-xs text-muted-foreground">{taps !== null ? `这周你点了 ${taps} 件。` : ""}这一页是给你一个人的，别转发。</p>
      <Link href="/signals">回网站看今天的报告 →</Link>
    </div>
  );
}
```

每种卡(各写成一个小组件,按钮一律 `<Button>`,只用语义 token 类):

- **practice**
  - `draft`:题目;`AI：会 · 很有把握（到2026年12月底对账）`(用 `draftVerdict`、`CONFIDENCE_LEVELS`、`deadlineLabel` / `HORIZONS[horizon].label`);
    「为什么」折起来列三种思路(`SOURCE_LABELS` + `pct` + reason);按钮 行 / 不行，我觉得X / 跳过。
    「不行」展开一个 `Textarea`(预填 `draftVerdict(p, question, true).sentence`)+「改判，记下」→ `listPracticeAction(token, "override", text)`。
  - `blind`:题目 + 一句「周一这道先自己判：写一句几个月后说得清对错的话」+ `Textarea` +「写下」→ `listPracticeAction(token, "blind", text)`;
    小字「想先拆一拆、看历史上类似的事，去网站上做 →」(链接 `/signals`)。
  - `waiting`:题目 +「AI 还没判完，7:30 以后再打开这一页就有。」(不放按钮)。
- **forecast**:和 `ForecastCard` 一样的两种(先判题一排档;AI 先判:AI 的数 + 为什么 + 行 / 更高▸ / 更低▸ / 跳过 + 改判时可写一句),
  按钮调 `listForecastAction` / `listSkipForecastAction`。抽不出共用组件就照着写一份(`forecast-cards.tsx` 的 action 是登录态的,不能直接用)。
- **confirm**:题目、怎么才算「会」、程序查到的那一句和原文(折起来)、按钮「按程序的建议（会 / 不会）」「反过来」「作废」;
  程序说「说不清」时只给「会」「不会」「作废」三个。
- **due**:他当时写的那一句、几号到期;证据:「查到 x 条支持、y 条反对」,折起来列原文(fact + 来源链接);没查过写「证据还没查好，凭你知道的点」;
  按钮「看对了」「看错了」;点「看错了」先展开五类(`MISS_REASONS`)和「不选，直接记」。
- **recall**:标题 + 「先别往下看：当时你为什么在意？后来怎样了？在心里说一遍。」+「想好了，看答案」→ 展开他当时写的、后来的消息 + 记得 / 模糊 / 忘了。
  照 `tap.tsx` 的 `RecallTap` 写,换成 list 的两个 action。
- **experiment**:问题 + 一排档(`MY_TIERS`)。

每个按钮点下去:`startTransition` → action → `ok` 就 `onDone(message)`,否则卡上显示错误;网络断了显示「没连上服务器（网络断了一下），过一会儿再试。」

- [ ] **Step 3: 验证、提交**

```bash
npx tsc --noEmit && npx eslint "app/a" 2>&1 | tail -3
git add "app/a/[token]/list-view.tsx" "app/a/[token]/page.tsx"
git commit -m "feat(signals): 一分钟清单那一页 —— 一件一张卡，点完当场收起；练习、预测、到期确认、到期判断、回想、实验先猜

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 邮件最上面一框

**Files:**
- Modify: `lib/domains/signals/notify.ts`
- Modify: `lib/domains/signals/notify.test.ts`

- [ ] **Step 1: 写测试**(`notify.test.ts`)

```ts
describe("一分钟清单", () => {
  const base = { date: "2026-10-24", practice: { question: "日银会不会加息？", headline: "日银" }, overview: null, sections: [], dueCount: 1, freshQuestions: [], url: "https://app.example" };
  const list = {
    url: "https://app.example/a/list",
    seconds: 16,
    more: 2,
    lines: [
      { label: "练习", title: "日银会不会加息？", note: "AI：会 · 很有把握" },
      { label: "预测", title: "美元兑日元会不会高于 150？", note: "AI：30%" },
    ],
  };
  it("有清单：最上面一框、一个按钮，练习和预测不再单列", () => {
    const html = buildDailyEmailHtml({ ...base, list }, {});
    expect(html).toContain("今天要你点的 2 件");
    expect(html).toContain('href="https://app.example/a/list"');
    expect(html).toContain("还有 2 件留到明天");
    expect(html.indexOf("今天要你点的")).toBeLessThan(html.indexOf("头版") === -1 ? Infinity : html.indexOf("头版"));
    expect(html).not.toContain("先写下你的判断，再看 AI 怎么拆");
  });
  it("纯文字版开头也有这几行和链接", () => {
    const { text } = buildDailyEmail({ ...base, list });
    expect(text.startsWith("今天要你点的 2 件")).toBe(true);
    expect(text).toContain("https://app.example/a/list");
  });
  it("没有清单（拿不到口令）：照旧", () => {
    expect(buildDailyEmailHtml(base, {})).toContain("先写下你的判断，再看 AI 怎么拆");
  });
});
```

- [ ] **Step 2: 实现**

1. `DailyEmailInput` 加:

```ts
  /** 一分钟清单：今天要他点的几件（邮件里只给一眼）和那一页的链接。拿不到口令（没配密钥或网址）为 null，邮件照旧。 */
  list?: { url: string; seconds: number; more: number; lines: { label: string; title: string; note: string }[] } | null;
```

2. `buildDailyEmailHtml`:报头那一行之后、头版之前,有 `input.list && input.list.lines.length > 0` 就放一框:
   - 一行粗体「今天要你点的 N 件 · 大约 X 秒」,右边(或下一行)一个按钮样式的链接「一分钟点完 →」(行内样式,底色 `C.accent`、白字、圆角);
   - 每件一行:`· 练习：日银会不会加息？　AI：会 · 很有把握`(note 用 `C.muted`);
   - `more > 0` 时一行小字「还有 N 件留到明天。」
   有清单时,「给你的」里**不再放**回想、预测(forecastQuick 和 forecastTodo)、练习、到期判断那一句;在跟的事、在追的问题照旧。
   报头统计里「给你的 N 件」照旧数 `mine.length`。
3. `buildDailyEmail`(纯文字):有清单时开头先放「今天要你点的 N 件 · 大约 X 秒」、每件一行、「还有 N 件留到明天。」、链接、空行;
   后面的回想、练习、到期判断、预测那几段在有清单时不再放。
4. `personalParts`:多取清单 —— `loadTodayList(userId, date)`,有 `base && secret` 才拼口令
   (`signAction({ u: userId, k: "list", t: date, v: "" }, secret, Date.now(), LIST_TTL_DAYS)`),
   `lines = items.map(previewLine)`;取不到(出错)就是 null。返回值类型的 `Pick<...>` 加上 `"list"`。
   原来的 `forecastQuick` 照旧算(没有清单时还要用)。

- [ ] **Step 3: 测试、提交**

```bash
npx vitest run lib/domains/signals/notify.test.ts 2>&1 | tail -3 && npx tsc --noEmit
git add lib/domains/signals/notify.ts lib/domains/signals/notify.test.ts
git commit -m "feat(signals): 早上的邮件最上面一框 —— 今天要你点的几件、一个按钮点开清单；有清单时回想、预测、练习不再单列

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 练习的 AI 先判赶在邮件前

**Files:**
- Modify: `lib/domains/signals/brief.ts`

- [ ] **Step 1: `runDailySignals` 里,今日总览之后、算指纹之前**

```ts
/** 练习的 AI 先判：跑到这个时间以内才开始出（一道最多三四十秒，300 秒上限里留足发邮件的时间）。 */
const PRACTICE_DRAFT_BUDGET_MS = 200_000;
...
  // 练习的 AI 先判赶在邮件前出，邮件和清单里就有那一句；来不及就跳过，7:30 后台会补（周一先判，不出）
  if (userIds.length > 0 && Date.now() - startedAt < PRACTICE_DRAFT_BUDGET_MS) {
    try {
      await ensurePracticeDraft(userIds[0], tokyoToday());
    } catch (e) {
      failed.push(`练习的 AI 先判：${e instanceof Error ? e.message : String(e)}`);
    }
  }
```

import `ensurePracticeDraft` from `./practice-draft`(practice-draft 不 import brief,不会循环;写之前 `grep -n "from \"./brief\"" lib/domains/signals/practice-draft.ts lib/domains/signals/breakdown.ts` 确认只是 `import type`)。

- [ ] **Step 2: 验证、提交**

```bash
npx tsc --noEmit
git add lib/domains/signals/brief.ts
git commit -m "feat(signals): 早上 6 点出完报告就给练习出 AI 先判，赶在邮件前；来不及就跳过，7:30 后台补

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 到期判断的证据后台先查

**Files:**
- Modify: `lib/domains/signals/practice.ts`
- Modify: `app/api/cron/jobs/[step]/route.ts`
- Modify: `.github/workflows/signals-jobs.yml`

- [ ] **Step 1: `practice.ts`**

```ts
/**
 * 后台先查到期判断的证据（一分钟清单的卡上要摆着）：到期了或 36 小时内到期、还没查过的，按时间预算一条条查。
 * 查不到也存一份空的（不再反复查同一条）。
 */
export async function prefetchDueEvidence(userId: string, startBeforeMs: number, max = 4): Promise<{ did: number; remaining: number }> {
  const started = Date.now();
  const todo = (await pendingDueJudgments(userId, 36)).filter((j) => j.outcome_evidence === null);
  let did = 0;
  for (const j of todo.slice(0, max)) {
    if (did > 0 && Date.now() - started > startBeforeMs) break;
    await checkOutcomeEvidence(userId, j.id).catch((e) => console.error("due evidence", e));
    did += 1;
  }
  return { did, remaining: Math.max(0, todo.length - did) };
}
```

(`outcome_evidence === undefined` 是迁移 064 没跑:那就一条也不查,filter 只取 `=== null` 正好。)
`checkOutcomeEvidence` 查到一条都没有时存的是 `evidence: []`,不是 null,所以不会反复查。

- [ ] **Step 2: 后台一步 `due`**

```ts
  // 到期判断的证据先查好（一分钟清单的卡上要摆着；晚上 7 点那一轮查好，第二天早上就有）
  due: async (users) => {
    let did = 0;
    let remaining = 0;
    for (const u of users) {
      const r = await prefetchDueEvidence(u, START_BEFORE_MS);
      did += r.did;
      remaining += r.remaining;
    }
    return { done: remaining === 0 || did === 0, did, remaining };
  },
```

`signals-jobs.yml`:`... forecast practice; do` → `... forecast practice due; do`;文件头注释括号里加「到期判断的证据」。

- [ ] **Step 3: 验证、提交**

```bash
npx tsc --noEmit && npx vitest run lib/domains/signals 2>&1 | tail -3
git add lib/domains/signals/practice.ts "app/api/cron/jobs/[step]/route.ts" .github/workflows/signals-jobs.yml
git commit -m "feat(signals): 到期判断的证据由后台先查（到期了或 36 小时内到期的），清单卡上摆着

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 宪法、全部验证、本机点一遍、合并

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 宪法**

signals 那一格里「每天早上报告好了发一封提醒邮件(Gmail SMTP,环境变量没配就不发)」后面补:

`;**一分钟清单**(经用户同意,2026-10-23):邮件最上面一框列出今天要他点的(最多 8 件:练习 1、预测题 3、到期确认 2、到期的判断 2、回想 2、实验先猜 1,按这个顺序,多的留到明天),一个按钮点开 /a/<口令>(种类 list,3 天有效,不用登录)那一页,一件一张卡、点一下就记(调现成的记法,归属和"还能不能点"由它们查;回想先查有没有这一条,练习只认那一天主账号报告里的题、期限服务器算);不做"全都行";页面只读不调 AI(改判、周一先判交了之后的挑刺除外,一天一道);最下面数「这周你点了几件」(从现成的时间戳数,不加表);有清单时「给你的」里回想、预测、练习不再单列;6 点那一轮出完报告就给练习出 AI 先判(200 秒以内才开始);到期判断的证据由后台 due 一步先查(到期或 36 小时内到期、没查过的);规则在 lib/domains/signals/today-list-shared.ts`

- [ ] **Step 2: 全部验证**

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -2 && npm test 2>&1 | grep -E "Test Files|Tests "
```

- [ ] **Step 3: 本机点一遍**(dev server 3200,`ideaos-visual`;给 dev@ideaos.test 播测试数据,看完删)

1. 播:三道预测题(一道先判、两道 AI 判过)、今天一份最小报告(练习带 ai_draft,省得调 AI)、一条已到期的判断(带一份假证据)、一条到期的回想。
2. 用 `.env.local` 的密钥签一个 list 口令(和邮件同一套签法),打开 `/a/<口令>`:标题写几件几秒;每张卡点一下,当场收起成「记上了」;
   数据库里各记成对的来路;回想点「看答案」再点「记得」;到期判断点「看错了」再点一类。
3. 拿同一份数据跑 `buildDailyEmailHtml`(写一个临时脚本,或者在测试里打印)看最上面一框长什么样;截图给他。
4. 删掉测试数据(预测题、报告、判断、回想、页面自动写的今日总览)。

- [ ] **Step 4: 提交、合并**

```bash
git add CLAUDE.md
git commit -m "docs(signals): 宪法写进一分钟清单

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline main..HEAD
```

告诉他:分支上几个提交;不用新迁移;合回本地 main 要不要现在合(他说合才合),push 等他说。
