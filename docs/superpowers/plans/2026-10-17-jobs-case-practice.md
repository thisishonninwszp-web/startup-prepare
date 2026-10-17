# 「这家可能会问的 case」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在岗位页按这家公司的生意出一道ケース面接的题,他限时写结构 → AI 面试官追问两三个 → 复盘(参考结构、最容易被问穿的地方、卡在哪一步),只记次数不打分。

**Architecture:** 一道题一行 `job_case_drills`(迁移 081),状态 asked → answered → reviewed;三次 AI 调用各在一个 server action 里(各 60 秒内)。提示词与解析器在 `lib/ai/jobs-case.ts`,类型与纯规则在 `lib/domains/jobs/case-shared.ts`,数据库读写在 `lib/domains/jobs/cases.ts`;招聘页原话用 `quoteIn` 逐字核对、题目里大于 10 的数字必须在招聘页里、追问和复盘必须引用他写的原话。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase(service role)、Gemini(`executeAiJson`)、vitest、shadcn 组件。

设计见 `docs/superpowers/specs/2026-10-17-jobs-case-practice-design.md`。
在分支 `feat/case-practice` 上做,每个任务本地提交,不 push。验证:`npx tsc --noEmit`、`npm run lint`、`npm test`;dev server 开着时不 `npm run build`。提交信息里用「」不用 ASCII 双引号。

| # | 做什么 | 文件 | 测 |
|---|---|---|---|
| 1 | 迁移 081,追加到 schema.sql | `supabase/migrations/081_job_case_drills.sql`、`supabase/schema.sql` | — |
| 2 | 类型与纯规则 | `lib/domains/jobs/case-shared.ts` | case-shared.test |
| 3 | AI:出题、追问、复盘 | `lib/ai/jobs-case.ts`、`lib/ai/index.ts` | jobs-case.test |
| 4 | 数据库读写 | `lib/domains/jobs/cases.ts` | tsc |
| 5 | server actions | `app/(app)/jobs/actions.ts` | tsc/lint |
| 6 | 一道题的页面 | `app/(app)/jobs/case/[cid]/...` | tsc/lint |
| 7 | 岗位页那一节、/jobs 那一行 | `app/(app)/jobs/[id]/case-panel.tsx`、`[id]/page.tsx`、`app/(app)/jobs/page.tsx` | tsc/lint |
| 8 | 宪法 | `CLAUDE.md` | — |
| 9 | 全部验证 | — | tsc/lint/test |

---

### Task 0: 开分支

- [ ] **Step 1**

```bash
git switch -c feat/case-practice
```

Expected: `Switched to a new branch 'feat/case-practice'`

---

### Task 1: 迁移 081

**Files:**
- Create: `supabase/migrations/081_job_case_drills.sql`
- Modify: `supabase/schema.sql`(末尾追加)

- [ ] **Step 1: 写迁移**

`supabase/migrations/081_job_case_drills.sql`:

```sql
-- ============================================================================
-- 迁移 081：「这家可能会问的 case」—— 在岗位页按这家公司出一道ケース面接的题
-- status：asked（出好题）→ answered（交了结构、追问已生成）→ reviewed（答完追问、复盘已生成）。
-- stuck_step：他自己点的"卡在哪一步"（AI 只提名，存在 review.suggested_step）。不打分。
-- 要先跑 078。幂等，可重复执行。
-- ============================================================================

create table if not exists job_case_drills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  posting_id   uuid not null references job_postings (id) on delete cascade,
  status       text not null default 'asked'
    check (status in ('asked', 'answered', 'reviewed')),
  question     jsonb not null,
  answer       text,
  answered_at  timestamptz,
  followups    jsonb,
  review       jsonb,
  stuck_step   text check (stuck_step in ('define', 'split', 'numbers', 'prioritize', 'conclude')),
  started_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_job_case_drills_user on job_case_drills (user_id, created_at desc);
create index if not exists idx_job_case_drills_posting on job_case_drills (posting_id);

alter table job_case_drills enable row level security;
drop policy if exists "job_case_drills_owner" on job_case_drills;
create policy "job_case_drills_owner" on job_case_drills
  for all using (auth.uid() = user_id);
```

- [ ] **Step 2: CRLF,追加到 schema.sql**

```bash
sed -i 's/$/\r/' supabase/migrations/081_job_case_drills.sql
printf '\r\n' >> supabase/schema.sql
cat supabase/migrations/081_job_case_drills.sql >> supabase/schema.sql
file supabase/migrations/081_job_case_drills.sql supabase/schema.sql
tail -n 3 supabase/schema.sql
```

Expected: 两个文件都是 `with CRLF line terminators`;schema.sql 末尾是 `for all using (auth.uid() = user_id);`。

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/081_job_case_drills.sql supabase/schema.sql
git commit -m "feat(jobs): 迁移 081 练 case 的记录表 job_case_drills" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 类型与纯规则

**Files:**
- Create: `lib/domains/jobs/case-shared.ts`
- Test: `lib/domains/jobs/case-shared.test.ts`

- [ ] **Step 1: 写失败的测试**

`lib/domains/jobs/case-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertNoPraiseJa, isCaseType, isStuckStep, minutesTaken, stuckCounts } from "./case-shared";

describe("用了几分钟", () => {
  it("至少 1 分钟，没交是 null", () => {
    expect(minutesTaken("2026-10-17T10:00:00Z", "2026-10-17T10:12:20Z")).toBe(12);
    expect(minutesTaken("2026-10-17T10:00:00Z", "2026-10-17T10:00:10Z")).toBe(1);
    expect(minutesTaken("2026-10-17T10:00:00Z", null)).toBeNull();
  });
});

describe("卡在哪一步的次数", () => {
  it("只数他点了的、最近 10 道；total 是一共练了几道", () => {
    const drills = [
      ...Array.from({ length: 11 }, (_, i) => ({
        stuck_step: "numbers" as const,
        created_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })),
      { stuck_step: "split" as const, created_at: "2026-10-20T00:00:00Z" },
      { stuck_step: null, created_at: "2026-10-21T00:00:00Z" },
    ];
    const r = stuckCounts(drills);
    expect(r.total).toBe(13);
    expect(r.recent).toBe(10);
    expect(r.counts).toEqual({ define: 0, split: 1, numbers: 9, prioritize: 0, conclude: 0 });
  });
});

describe("类型守卫", () => {
  it("只认五类、五种题型，不认原型上的键", () => {
    expect(isStuckStep("numbers")).toBe(true);
    expect(isStuckStep("toString")).toBe(false);
    expect(isCaseType("sizing")).toBe(true);
    expect(isCaseType("other")).toBe(false);
  });
});

describe("日文不许夸", () => {
  it("带夸奖报错", () => {
    expect(() => assertNoPraiseJa(["素晴らしい構造ですね。では次に"])).toThrow(/夸奖/);
    expect(() => assertNoPraiseJa(["その数字はどこから来ましたか。"])).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/domains/jobs/case-shared.test.ts`
Expected: FAIL,`Failed to resolve import "./case-shared"`。

- [ ] **Step 3: 写实现**

`lib/domains/jobs/case-shared.ts`:

```ts
/**
 * 「这家可能会问的 case」的类型和纯规则（不碰数据库、不调 AI，可测）。
 * 宪法原则 1：不打分，只数练了几道、卡在哪一步几次；用了几分钟是事实，由代码算。
 */

export const CASE_TYPES = {
  analysis: "分析設計",
  improvement: "業務・利益の改善",
  new_business: "新規事業",
  sizing: "市場規模の推定",
  china: "中国市場",
} as const;
export type CaseType = keyof typeof CASE_TYPES;

/** 卡在哪一步：和判断账本"错在哪一步"一样只数次数。AI 只提名，记下的是他点的。 */
export const STUCK_STEPS = {
  define: "题目没问清就开始答",
  split: "拆法有漏、有重",
  numbers: "数字没根据、算不对",
  prioritize: "方案没排先后",
  conclude: "没先说结论",
} as const;
export type StuckStep = keyof typeof STUCK_STEPS;

export const CASE_STATUSES = ["asked", "answered", "reviewed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  asked: "还没写",
  answered: "在回答追问",
  reviewed: "复盘好了",
};

export type CaseQuestion = {
  type: CaseType;
  /** 题目（日文，像面试官当面问的）。 */
  prompt_ja: string;
  /** 前提（日文：能不能自己假设数字、要答到什么程度）。 */
  premise_ja: string;
  /** 为什么出这道（中文一句）。 */
  why: string;
  /** 支撑 why 的招聘页原话（代码逐字核对过）。 */
  quote: string;
};

/** 追问：q_ja 日文；cites 是被追问的他写的原话（核对过）；a 是他的回答（没答为空）。 */
export type CaseFollowup = { q_ja: string; cites: string; a: string };

export type CaseReview = {
  /** 参考结构（日文要点，AI 写的一种拆法，不是标准答案）。 */
  reference_ja: string[];
  /** 最容易被问穿的地方：quote 是他写的原话（核对过），why 中文。 */
  weak: { quote: string; why: string }[];
  /** AI 提名的"卡在哪一步"。 */
  suggested_step: StuckStep;
};

export type CaseDrill = {
  id: string;
  posting_id: string;
  status: CaseStatus;
  question: CaseQuestion;
  answer: string | null;
  answered_at: string | null;
  followups: CaseFollowup[] | null;
  review: CaseReview | null;
  stuck_step: StuckStep | null;
  started_at: string;
  reviewed_at: string | null;
  created_at: string;
};

export type CaseDrillSummary = Pick<CaseDrill, "id" | "posting_id" | "status" | "stuck_step" | "created_at"> & { prompt_ja: string };

/** 交结构至少写这么多字（太短的没东西可追问）。 */
export const MIN_ANSWER_CHARS = 20;
/** /jobs 上"最近几道"的那个几。 */
export const RECENT_DRILLS = 10;

export function isCaseType(v: unknown): v is CaseType {
  return typeof v === "string" && Object.hasOwn(CASE_TYPES, v);
}

export function isStuckStep(v: unknown): v is StuckStep {
  return typeof v === "string" && Object.hasOwn(STUCK_STEPS, v);
}

/** 从出题到交结构用了几分钟（至少 1 分钟）；还没交返回 null。 */
export function minutesTaken(startedAt: string, answeredAt: string | null): number | null {
  if (!answeredAt) return null;
  const ms = Date.parse(answeredAt) - Date.parse(startedAt);
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 60_000)) : null;
}

/** 最近 RECENT_DRILLS 道他点了"卡在哪一步"的，各卡了几次；total 是一共练了几道（出过题的都算）。 */
export function stuckCounts(drills: Pick<CaseDrill, "stuck_step" | "created_at">[]): {
  total: number;
  recent: number;
  counts: Record<StuckStep, number>;
} {
  const counts = Object.fromEntries(Object.keys(STUCK_STEPS).map((k) => [k, 0])) as Record<StuckStep, number>;
  const marked = drills
    .filter((d): d is Pick<CaseDrill, "created_at"> & { stuck_step: StuckStep } => d.stuck_step !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, RECENT_DRILLS);
  for (const d of marked) counts[d.stuck_step] += 1;
  return { total: drills.length, recent: marked.length, counts };
}

/** 对他说的日文里不许夸（宪法原则 2）。 */
export const JA_PRAISE = ["素晴らしい", "すばらしい", "よくできて", "良い回答", "いい回答", "いいですね", "完璧", "さすが", "見事"];

export function assertNoPraiseJa(texts: string[]): void {
  const all = texts.join("\n");
  const hit = JA_PRAISE.find((w) => all.includes(w));
  if (hit) throw new Error(`出现了夸奖：${hit}`);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/domains/jobs/case-shared.test.ts`
Expected: PASS(4 个 it)。

- [ ] **Step 5: 提交**

```bash
git add lib/domains/jobs/case-shared.ts lib/domains/jobs/case-shared.test.ts
git commit -m "feat(jobs): 练 case 的类型与纯规则（五类卡点、计次、用时、日文不许夸）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: AI——出题、追问、复盘

**Files:**
- Create: `lib/ai/jobs-case.ts`
- Modify: `lib/ai/index.ts`(`export * from "./jobs-china";` 下面加一行)
- Test: `lib/ai/jobs-case.test.ts`

- [ ] **Step 1: 写失败的测试**

`lib/ai/jobs-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCaseQuestion, parseFollowups, parseReview } from "./jobs-case";

const BODY =
  "株式会社サンプルは、中小企業向けにECサイトの構築と運用代行を行っています。年商は約30億円。マーケティング担当として、広告とサイト改善のデータ分析を担当していただきます。";

describe("出题", () => {
  const good = {
    type: "improvement",
    prompt_ja: "この会社のEC運用代行の売上を3年で2倍にするにはどうしますか。",
    premise_ja: "数字は自分で置いてかまいません。考え方を聞きたいです。",
    why: "这家给中小企业做EC代运营，岗位要做广告和网站改善的分析。",
    quote: "中小企業向けにECサイトの構築と運用代行を行っています",
  };

  it("原话在招聘页里、数字是出题用的小数字，照收", () => {
    expect(parseCaseQuestion(good, BODY).type).toBe("improvement");
  });

  it("原话不在招聘页里报错", () => {
    expect(() => parseCaseQuestion({ ...good, quote: "大手企業向けにコンサルティングを行っています" }, BODY)).toThrow(/原话/);
  });

  it("编了招聘页没有的大数字报错；招聘页里有的可以", () => {
    expect(() => parseCaseQuestion({ ...good, prompt_ja: "年商100億円のこの会社の売上を伸ばすには？" }, BODY)).toThrow(/100/);
    expect(parseCaseQuestion({ ...good, prompt_ja: "年商30億円のこの会社の売上を伸ばすには？" }, BODY).prompt_ja).toContain("30億円");
  });

  it("题型不对报错", () => {
    expect(() => parseCaseQuestion({ ...good, type: "other" }, BODY)).toThrow(/题型/);
  });

  it("题目不是日文报错", () => {
    expect(() => parseCaseQuestion({ ...good, prompt_ja: "如何让这家公司销售额翻倍" }, BODY)).toThrow(/没用日文/);
  });
});

const ANSWER = "売上を客数×客単価に分解します。客数は新規顧客の獲得を増やし、客単価は追加サービスで上げます。";

describe("追问", () => {
  it("引用他原话的留下，不引用的丢掉", () => {
    const out = parseFollowups(
      {
        followups: [
          { q_ja: "新規顧客はどのチャネルで増やしますか。", cites: "新規顧客の獲得を増やし" },
          { q_ja: "追加サービスとは具体的に何ですか。", cites: "追加サービスで上げます" },
          { q_ja: "競合はどうですか。", cites: "競合が多い" },
        ],
      },
      ANSWER
    );
    expect(out).toHaveLength(2);
  });

  it("不到两个报错", () => {
    expect(() =>
      parseFollowups({ followups: [{ q_ja: "新規顧客はどのチャネルで増やしますか。", cites: "新規顧客の獲得を増やし" }] }, ANSWER)
    ).toThrow(/不到两个/);
  });

  it("夸了报错", () => {
    expect(() =>
      parseFollowups(
        {
          followups: [
            { q_ja: "素晴らしい分解ですね。新規はどう増やしますか。", cites: "新規顧客の獲得を増やし" },
            { q_ja: "追加サービスとは何ですか。", cites: "追加サービスで上げます" },
          ],
        },
        ANSWER
      )
    ).toThrow(/夸奖/);
  });
});

describe("复盘", () => {
  const good = {
    reference_ja: [
      "まず目標を確認する（3年で2倍）",
      "売上＝顧客数×顧客あたり売上に分ける",
      "顧客数は新規と継続に分ける",
      "打ち手を効果と手間で並べて、先にやるものを決める",
    ],
    weak: [{ quote: "新規顧客の獲得を増やし", why: "没说靠什么渠道、要花多少成本，面试官一定会问。" }],
    suggested_step: "split",
  };

  it("照收", () => {
    expect(parseReview(good, ANSWER).suggested_step).toBe("split");
  });

  it("被问穿处不引用他的原话就丢；一条都没有报错", () => {
    expect(() => parseReview({ ...good, weak: [{ quote: "競合が多い", why: "没说清。" }] }, ANSWER)).toThrow(/原话/);
  });

  it("卡在哪一步不在五类里报错", () => {
    expect(() => parseReview({ ...good, suggested_step: "logic" }, ANSWER)).toThrow(/五类/);
  });

  it("参考结构不到三条报错", () => {
    expect(() => parseReview({ ...good, reference_ja: ["売上を分解する"] }, ANSWER)).toThrow(/三条/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/ai/jobs-case.test.ts`
Expected: FAIL,`Failed to resolve import "./jobs-case"`。

- [ ] **Step 3: 写实现**

`lib/ai/jobs-case.ts`:

```ts
import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertNoPraise } from "./jobs";
import { assertJapanese } from "@/lib/domains/jobs/china-shared";
import { numbersIn, quoteIn } from "@/lib/domains/jobs/provenance-shared";
import { categoryLabel, type PostingCategory } from "@/lib/domains/jobs/shared";
import {
  assertNoPraiseJa,
  isCaseType,
  isStuckStep,
  type CaseFollowup,
  type CaseQuestion,
  type CaseReview,
} from "@/lib/domains/jobs/case-shared";

// ---------------------------------------------------------------------------
// 「这家可能会问的 case」：按岗位出ケース面接的题 → AI 面试官追问 → 复盘。
// 宪法原则 1：不打分；原则 2：追问专挑漏洞、不许夸。
// 题目里写到这家公司的事要有招聘页原话（代码核对），追问和复盘要引用他写的原话（代码核对）。
// ---------------------------------------------------------------------------

const BODY_CHARS = 6000;
/** 题目里大于这个的数字必须在招聘页里（「3年で2倍」这种出题用的小数字可以，营业额、人数这类事实不许编）。 */
const FRAMING_NUMBER_MAX = 10;
const MAX_FOLLOWUPS = 3;
const KANA = /[぀-ヿ]/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// ---- 出题 -------------------------------------------------------------------

const QUESTION_PROMPT = `他在日本找工作，要练ケース面接。下面是他在看的一个岗位（公司、职位、类别、招聘页正文）。
出一道这家公司面试里可能会问的 case 题。

- type：analysis（分析设计：某个数字变了怎么查原因、怎么设计分析）/ improvement（业务或利润改善）/ new_business（新规事业）/ sizing（市场规模的费米估算）/ china（和中国市场有关）。
  按岗位类别挑最贴这家的：数据分析多半 analysis，咨询多半 improvement，事业/经营企划多半 new_business 或 sizing，需要中文多半 china。
- prompt_ja：题目，日文，像面试官当面问的一两句，具体到这家公司在做的生意（例：「この会社の EC 事業の売上を、3年で2倍にするにはどうしますか。」）。
- premise_ja：前提，日文一两句：能不能自己假设数字、有什么数据可以用、要答到什么程度。
- why：为什么出这道，中文一句（这家在做什么、这个岗位要做什么）。
- quote：招聘页正文里支撑 why 的一句原话，逐字照抄（10 到 120 字）。

题目和前提里不要写招聘页里没有的数字（不要编这家公司的营业额、人数）；费米题本来就不需要数字。
不要和"已经出过的题"重复。不夸、不评价这家公司。

只输出 JSON：{"type":"…","prompt_ja":"…","premise_ja":"…","why":"…","quote":"…"}`;

export function parseCaseQuestion(value: unknown, body: string): CaseQuestion {
  const v = (value ?? {}) as Record<string, unknown>;
  if (!isCaseType(v.type)) throw new Error("题型不对");
  const prompt_ja = str(v.prompt_ja, 300);
  const premise_ja = str(v.premise_ja, 300);
  const why = str(v.why, 200);
  const quote = str(v.quote, 200);
  if (!prompt_ja || !premise_ja || !why || !quote) throw new Error("缺字段");
  assertJapanese([prompt_ja, premise_ja]);
  if (!quoteIn(quote, body)) throw new Error("「为什么出这道」引的不是招聘页原话");
  const bodyNumbers = new Set(numbersIn(body));
  const invented = numbersIn(`${prompt_ja}\n${premise_ja}`).find((n) => Number(n) > FRAMING_NUMBER_MAX && !bodyNumbers.has(n));
  if (invented) throw new Error(`题目里有招聘页没有的数字：${invented}`);
  assertNoPraiseJa([prompt_ja, premise_ja]);
  assertNoPraise(why);
  return { type: v.type, prompt_ja, premise_ja, why, quote };
}

/** 按这个岗位出一道（previous：这个岗位已经出过的题目，不重复）。 */
export async function draftCaseQuestion(
  userId: string,
  posting: { company_name: string; title: string; category: PostingCategory; body: string },
  previous: string[]
): Promise<CaseQuestion> {
  const contents = [
    `公司：${posting.company_name}`,
    `职位：${posting.title}`,
    `类别：${categoryLabel(posting.category)}`,
    previous.length > 0 ? `已经出过的题：\n${previous.map((p) => `- ${p}`).join("\n")}` : "",
    `招聘页正文：\n${posting.body.slice(0, BODY_CHARS)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return executeAiJson(
    { userId, operation: "job_case_question", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：quote 必须逐字照抄招聘页正文；题目里不要写招聘页没有的数字；prompt_ja 和 premise_ja 用日文。" : ""),
      config: {
        systemInstruction: QUESTION_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => parseCaseQuestion(value, posting.body)
  );
}

// ---- 追问 -------------------------------------------------------------------

const FOLLOWUP_PROMPT = `你是日本咨询公司的面试官，正在做ケース面接。下面是题目、前提，和应聘者写的回答（结构）。
追问 2 到 3 个问题，日文，每个对准他回答里一个具体的漏洞：哪块没拆到、哪个假设没有根据、数字从哪来、为什么先做这个。

每个问题写：
- q_ja：追问，日文，一句，像面试官当面问的。
- cites：他回答里被追问的那句话或那个数字，逐字照抄（4 到 60 字）。

不夸、不鼓励（不写「いいですね」「素晴らしい」这类），不给答案、不提示该怎么改。
他写得很少的话，第一个问题就请他把结构写完整（cites 照抄他写的开头）。

只输出 JSON：{"followups":[{"q_ja":"…","cites":"…"}]}`;

export function parseFollowups(value: unknown, answer: string): Omit<CaseFollowup, "a">[] {
  const raw = (value as { followups?: unknown } | null)?.followups;
  if (!Array.isArray(raw)) throw new Error("缺少 followups");
  const out = raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({ q_ja: str(f.q_ja, 200), cites: str(f.cites, 120) }))
    .filter((f) => f.q_ja && quoteIn(f.cites, answer))
    .slice(0, MAX_FOLLOWUPS);
  if (out.length < 2) throw new Error("追问不到两个（或没引用他写的原话）");
  assertJapanese(out.map((f) => f.q_ja));
  assertNoPraiseJa(out.map((f) => f.q_ja));
  return out;
}

/** 看他写的结构，追问 2–3 个。 */
export async function askFollowups(userId: string, question: CaseQuestion, answer: string): Promise<Omit<CaseFollowup, "a">[]> {
  const contents = [`题目：${question.prompt_ja}`, `前提：${question.premise_ja}`, `应聘者的回答：\n${answer}`].join("\n\n");
  return executeAiJson(
    { userId, operation: "job_case_followups", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：要 2 到 3 个追问，cites 必须逐字照抄他回答里的话（4 字以上），q_ja 用日文，不许夸。" : ""),
      config: {
        systemInstruction: FOLLOWUP_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => parseFollowups(value, answer)
  );
}

// ---- 复盘 -------------------------------------------------------------------

const REVIEW_PROMPT = `下面是一道ケース面接的题目、应聘者写的结构、面试官的追问和他的回答。给他写复盘。
他是中国人，日语能做商务沟通：说明用中文，参考结构用日文（面试是日文的）。

- reference_ja：参考结构，3 到 6 条日文要点，是面试里说得出口的一种拆法（先确认题目和目标，再拆，再排先后，最后说结论）。这只是一种参考，不是唯一答案。
- weak：最容易被追问穿的 2 到 3 处，每处 {"quote":"他写的原话（他的结构或对追问的回答里的，逐字照抄，4 到 60 字）","why":"为什么会被问穿，中文一两句"}。
- suggested_step：他主要卡在哪一步，只能是下面五个之一：
  define（题目没问清就开始答）/ split（拆法有漏、有重）/ numbers（数字没根据、算不对）/ prioritize（方案没排先后）/ conclude（没先说结论）。

不打分，不写"答得不错""还差一点"这类评价，不夸。

只输出 JSON：{"reference_ja":["…"],"weak":[{"quote":"…","why":"…"}],"suggested_step":"…"}`;

export function parseReview(value: unknown, his: string): CaseReview {
  const v = (value ?? {}) as Record<string, unknown>;
  const reference_ja = (Array.isArray(v.reference_ja) ? v.reference_ja : [])
    .map((r) => str(r, 200))
    .filter(Boolean)
    .slice(0, 6);
  if (reference_ja.length < 3) throw new Error("参考结构不到三条");
  if (!KANA.test(reference_ja.join(""))) throw new Error("参考结构没用日文");
  const weak = (Array.isArray(v.weak) ? v.weak : [])
    .filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
    .map((w) => ({ quote: str(w.quote, 120), why: str(w.why, 300) }))
    .filter((w) => w.why && quoteIn(w.quote, his))
    .slice(0, 3);
  if (weak.length === 0) throw new Error("被问穿的地方没引用他写的原话");
  if (!isStuckStep(v.suggested_step)) throw new Error("卡在哪一步不在五类里");
  assertNoPraiseJa(reference_ja);
  for (const w of weak) assertNoPraise(w.why);
  return { reference_ja, weak, suggested_step: v.suggested_step };
}

/** 他答完追问以后写复盘。 */
export async function reviewCase(userId: string, question: CaseQuestion, answer: string, followups: CaseFollowup[]): Promise<CaseReview> {
  const his = [answer, ...followups.map((f) => f.a)].join("\n");
  const contents = [
    `题目：${question.prompt_ja}`,
    `前提：${question.premise_ja}`,
    `他写的结构：\n${answer}`,
    ...followups.map((f, i) => `追问 ${i + 1}：${f.q_ja}\n他的回答：${f.a || "（没答）"}`),
  ].join("\n\n");
  return executeAiJson(
    { userId, operation: "job_case_review", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验：reference_ja 至少 3 条日文；weak 的 quote 必须逐字照抄他写的话；suggested_step 只能是五个之一；不许夸。"
          : ""),
      config: {
        systemInstruction: REVIEW_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseReview(value, his)
  );
}
```

- [ ] **Step 4: 加进桶导出**

`lib/ai/index.ts` 里 `export * from "./jobs-china";` 下面加一行:

```ts
export * from "./jobs-case";
```

- [ ] **Step 5: 跑测试、查同名导出**

Run: `npx vitest run lib/ai/jobs-case.test.ts`
Expected: PASS(12 个 it)。

Run: `npx tsc --noEmit`
Expected: 没有输出。

- [ ] **Step 6: 提交**

```bash
git add lib/ai/jobs-case.ts lib/ai/jobs-case.test.ts lib/ai/index.ts
git commit -m "feat(jobs): 练 case 的 AI——按岗位出题（招聘页原话、数字核对）、追问（引用他原话、不许夸）、复盘（五类卡点只提名）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 数据库读写

**Files:**
- Create: `lib/domains/jobs/cases.ts`

- [ ] **Step 1: 写实现**

`lib/domains/jobs/cases.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase";
import { askFollowups, draftCaseQuestion, reviewCase } from "@/lib/ai";
import { getPosting } from "./postings";
import {
  isStuckStep,
  MIN_ANSWER_CHARS,
  type CaseDrill,
  type CaseDrillSummary,
  type CaseFollowup,
  type CaseQuestion,
  type CaseReview,
  type CaseStatus,
} from "./case-shared";
import type { JobPosting } from "./shared";

/**
 * 「这家可能会问的 case」：一道题一行，出题 → 交结构（生成追问）→ 答追问（生成复盘）→ 他点卡在哪一步。
 * 每一步只调一次 AI，各在一个请求里（Vercel 60 秒）。
 */

export const MISSING_CASE_MIGRATION =
  "还差一步：迁移 081 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/081_job_case_drills.sql 之后再来。";

function isMissingCaseTable(message: string): boolean {
  return /job_case_drills/.test(message);
}

function toDrill(row: Record<string, unknown>): CaseDrill {
  return {
    id: row.id as string,
    posting_id: row.posting_id as string,
    status: row.status as CaseStatus,
    question: row.question as CaseQuestion,
    answer: (row.answer as string | null) ?? null,
    answered_at: (row.answered_at as string | null) ?? null,
    followups: (row.followups as CaseFollowup[] | null) ?? null,
    review: (row.review as CaseReview | null) ?? null,
    stuck_step: isStuckStep(row.stuck_step) ? row.stuck_step : null,
    started_at: row.started_at as string,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

async function loadDrill(userId: string, id: string): Promise<CaseDrill> {
  const { data, error } = await supabaseAdmin.from("job_case_drills").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new Error(isMissingCaseTable(error.message) ? MISSING_CASE_MIGRATION : error.message);
  if (!data) throw new Error("这道题找不到了");
  return toDrill(data);
}

async function update(userId: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from("job_case_drills").update(patch).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

/** 按这个岗位出一道（这个岗位出过的不重复），存好，返回 id。计时从这一刻开始（started_at）。 */
export async function createCaseDrill(userId: string, postingId: string): Promise<string> {
  const posting = await getPosting(userId, postingId);
  if (!posting) throw new Error("这个岗位找不到了");
  const { data: prev, error: prevError } = await supabaseAdmin
    .from("job_case_drills")
    .select("question")
    .eq("user_id", userId)
    .eq("posting_id", postingId);
  if (prevError) throw new Error(isMissingCaseTable(prevError.message) ? MISSING_CASE_MIGRATION : prevError.message);
  const previous = (prev ?? []).map((r) => (r.question as CaseQuestion).prompt_ja);
  const question = await draftCaseQuestion(userId, posting, previous);
  const { data, error } = await supabaseAdmin
    .from("job_case_drills")
    .insert({ user_id: userId, posting_id: postingId, question })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function getCaseDrill(
  userId: string,
  id: string
): Promise<{ drill: CaseDrill; posting: JobPosting | null } | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("job_case_drills").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingCaseTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  if (!data) return null;
  const drill = toDrill(data);
  return { drill, posting: await getPosting(userId, drill.posting_id) };
}

/** 交结构：生成追问。 */
export async function submitCaseAnswer(userId: string, id: string, input: string): Promise<void> {
  const drill = await loadDrill(userId, id);
  if (drill.status !== "asked") throw new Error("这道已经交过了");
  const answer = input.trim().slice(0, 4000);
  if (answer.length < MIN_ANSWER_CHARS) throw new Error(`至少写 ${MIN_ANSWER_CHARS} 个字的结构，面试官才有东西可问。`);
  const followups = await askFollowups(userId, drill.question, answer);
  await update(userId, id, {
    answer,
    answered_at: new Date().toISOString(),
    followups: followups.map((f) => ({ ...f, a: "" })),
    status: "answered",
  });
}

/** 回答追问：生成复盘。没答的那个留空，复盘里照样写。 */
export async function submitFollowupAnswers(userId: string, id: string, answers: string[]): Promise<void> {
  const drill = await loadDrill(userId, id);
  if (drill.status !== "answered" || !drill.followups || !drill.answer) throw new Error("现在不是回答追问的时候");
  const followups = drill.followups.map((f, i) => ({ ...f, a: (answers[i] ?? "").trim().slice(0, 2000) }));
  if (followups.every((f) => !f.a)) throw new Error("至少回答一个追问。");
  const review = await reviewCase(userId, drill.question, drill.answer, followups);
  await update(userId, id, { followups, review, reviewed_at: new Date().toISOString(), status: "reviewed" });
}

/** 他点的"卡在哪一步"（AI 只提名）。 */
export async function setCaseStuckStep(userId: string, id: string, step: string): Promise<void> {
  if (!isStuckStep(step)) throw new Error("没有这一类");
  const drill = await loadDrill(userId, id);
  if (drill.status !== "reviewed") throw new Error("复盘好了才能点");
  await update(userId, id, { stuck_step: step });
}

/** 练过的题（新的在前）。给 postingId 就只要这个岗位的。表还没建时返回 "missing-schema"。 */
export async function listCaseDrills(userId: string, postingId?: string): Promise<CaseDrillSummary[] | "missing-schema"> {
  let query = supabaseAdmin
    .from("job_case_drills")
    .select("id, posting_id, status, stuck_step, created_at, question")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (postingId) query = query.eq("posting_id", postingId);
  const { data, error } = await query;
  if (error) {
    if (isMissingCaseTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    posting_id: r.posting_id as string,
    status: r.status as CaseStatus,
    stuck_step: isStuckStep(r.stuck_step) ? r.stuck_step : null,
    created_at: r.created_at as string,
    prompt_ja: (r.question as CaseQuestion).prompt_ja,
  }));
}
```

- [ ] **Step 2: 检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

- [ ] **Step 3: 提交**

```bash
git add lib/domains/jobs/cases.ts
git commit -m "feat(jobs): 练 case 的数据库读写（出题、交结构、答追问、点卡在哪一步、列出）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: server actions

**Files:**
- Modify: `app/(app)/jobs/actions.ts`

- [ ] **Step 1: 加 import**

在 `import { requestFill } from "@/lib/domains/jobs/fill";` 下面加:

```ts
import { createCaseDrill, setCaseStuckStep, submitCaseAnswer, submitFollowupAnswers } from "@/lib/domains/jobs/cases";
```

- [ ] **Step 2: 文件末尾加四个 action**

```ts
/** 按这个岗位出一道 case（十几秒）。 */
export async function createCaseDrillAction(postingId: string): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  try {
    const id = await createCaseDrill(userId, postingId);
    revalidatePath(`/jobs/${postingId}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没出成题") };
  }
}

/** 交结构，生成追问。 */
export async function submitCaseAnswerAction(id: string, answer: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await submitCaseAnswer(userId, id, answer);
    revalidatePath(`/jobs/case/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没交上") };
  }
}

/** 回答追问，生成复盘。 */
export async function submitFollowupAnswersAction(id: string, answers: string[]): Promise<Result> {
  const userId = await requireUserId();
  try {
    await submitFollowupAnswers(userId, id, answers);
    revalidatePath(`/jobs/case/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "复盘没写成") };
  }
}

/** 他点的"卡在哪一步"。 */
export async function setCaseStuckStepAction(id: string, step: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await setCaseStuckStep(userId, id, step);
    revalidatePath(`/jobs/case/${id}`);
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}
```

- [ ] **Step 3: 检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 4: 提交**

```bash
git add "app/(app)/jobs/actions.ts"
git commit -m "feat(jobs): 练 case 的四个 server action" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 一道题的页面

**Files:**
- Create: `app/(app)/jobs/case/[cid]/page.tsx`、`answer-form.tsx`、`followup-form.tsx`、`stuck-picker.tsx`

- [ ] **Step 1: 写结构的表单**

`app/(app)/jobs/case/[cid]/answer-form.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MIN_ANSWER_CHARS } from "@/lib/domains/jobs/case-shared";
import { submitCaseAnswerAction } from "../../actions";

/** 写结构。上面显示从出题起过了几分钟（建议 15 分钟，不强制）。 */
export function AnswerForm({ id, startedAt }: { id: string; startedAt: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const tick = () => setMinutes(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 60_000)));
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await submitCaseAnswerAction(id, text);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">写你的结构</h2>
      <p className="text-xs leading-6 text-muted-foreground">
        过了 {minutes} 分钟{minutes >= 15 ? "，已经超过建议的 15 分钟，面试里这时候该先把结论说出来了。" : "，建议 15 分钟内写完。"}
        用日文写，像在面试里说的那样：先说怎么理解这道题，再说怎么拆、先做什么。
      </p>
      <Textarea
        lang="ja"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例：まず目標を確認します。売上は顧客数×顧客あたり売上に分けて…"
      />
      <div className="flex items-center gap-3">
        <Button disabled={pending || text.trim().length < MIN_ANSWER_CHARS} onClick={submit}>
          {pending ? "面试官在看你写的…" : "回答する"}
        </Button>
        <span className="text-xs text-muted-foreground">{text.trim().length} 字</span>
      </div>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: 回答追问的表单**

`app/(app)/jobs/case/[cid]/followup-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CaseFollowup } from "@/lib/domains/jobs/case-shared";
import { submitFollowupAnswersAction } from "../../actions";

/** 面试官的追问，一个个答；答不上来的可以空着（至少答一个）。 */
export function FollowupForm({ id, followups }: { id: string; followups: CaseFollowup[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<string[]>(followups.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await submitFollowupAnswersAction(id, answers);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">面试官追问</h2>
      <p className="text-xs leading-6 text-muted-foreground">像当面被问到那样，一个个答。答不上来的可以空着，复盘里会说。</p>
      {followups.map((f, i) => (
        <div key={i} className="space-y-2">
          <p className="font-medium" lang="ja">
            {f.q_ja}
          </p>
          <p className="text-xs text-muted-foreground">针对你写的：「{f.cites}」</p>
          <Textarea
            lang="ja"
            rows={4}
            value={answers[i]}
            onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
          />
        </div>
      ))}
      <Button disabled={pending || answers.every((a) => !a.trim())} onClick={submit}>
        {pending ? "在写复盘…（二三十秒）" : "答え終わった"}
      </Button>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 3: 点卡在哪一步**

`app/(app)/jobs/case/[cid]/stuck-picker.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STUCK_STEPS, type StuckStep } from "@/lib/domains/jobs/case-shared";
import { setCaseStuckStepAction } from "../../actions";

/** AI 只提名，他点了才算数（只数次数）。 */
export function StuckPicker({ id, suggested, current }: { id: string; suggested: StuckStep; current: StuckStep | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pick = (step: StuckStep) =>
    startTransition(async () => {
      setError(null);
      const r = await setCaseStuckStepAction(id, step);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">这道主要卡在哪一步</h2>
      <p className="text-xs leading-6 text-muted-foreground">
        {current ? "记下了。想改就再点一个。" : `面试官觉得是「${STUCK_STEPS[suggested]}」。你自己点一个才算数。`}
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STUCK_STEPS) as StuckStep[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={current === s ? "default" : !current && s === suggested ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => pick(s)}
          >
            {STUCK_STEPS[s]}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 4: 页面**

`app/(app)/jobs/case/[cid]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { CASE_TYPES, minutesTaken } from "@/lib/domains/jobs/case-shared";
import { getCaseDrill, MISSING_CASE_MIGRATION } from "@/lib/domains/jobs/cases";
import { AnswerForm } from "./answer-form";
import { FollowupForm } from "./followup-form";
import { StuckPicker } from "./stuck-picker";

export const dynamic = "force-dynamic";
// 交结构、回答追问都在这一页的 server action 里调 AI，各要十几到三十秒
export const maxDuration = 60;

export default async function CaseDrillPage({ params }: { params: { cid: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.cid)) notFound();

  const found = await getCaseDrill(user.id, params.cid);
  if (found === "missing-schema") {
    return (
      <PageContainer width="narrow">
        <PageHeader title="练 case" />
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_CASE_MIGRATION}</p>
      </PageContainer>
    );
  }
  if (!found) notFound();
  const { drill, posting } = found;
  const q = drill.question;
  const minutes = minutesTaken(drill.started_at, drill.answered_at);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href={`/jobs/${drill.posting_id}`} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← {posting ? `${posting.company_name} · ${posting.title}` : "岗位"}
        </Link>
      </p>
      <PageHeader eyebrow={`练 case · ${CASE_TYPES[q.type]}`} title={q.prompt_ja} description={q.premise_ja} />
      <div className="space-y-10 text-sm leading-7">
        <p className="text-muted-foreground">
          为什么出这道：{q.why}
          <br />
          <span className="text-xs">招聘页原话：「{q.quote}」</span>
        </p>

        {drill.status === "asked" && <AnswerForm id={drill.id} startedAt={drill.started_at} />}

        {drill.answer && (
          <section>
            <h2 className="text-base font-semibold">
              你写的结构
              {minutes !== null && <span className="ml-2 text-xs font-normal text-muted-foreground">用了 {minutes} 分钟</span>}
            </h2>
            <p className="mt-2 whitespace-pre-wrap" lang="ja">
              {drill.answer}
            </p>
          </section>
        )}

        {drill.status === "answered" && drill.followups && <FollowupForm id={drill.id} followups={drill.followups} />}

        {drill.status === "reviewed" && drill.followups && drill.review && (
          <>
            <section>
              <h2 className="text-base font-semibold">面试官追问</h2>
              <ol className="mt-2 space-y-4">
                {drill.followups.map((f, i) => (
                  <li key={i}>
                    <p className="font-medium" lang="ja">
                      {f.q_ja}
                    </p>
                    <p className="text-xs text-muted-foreground">针对你写的：「{f.cites}」</p>
                    <p className="mt-1 whitespace-pre-wrap" lang="ja">
                      {f.a || "（没答）"}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h2 className="text-base font-semibold">复盘</h2>
              <p className="mt-1 text-xs text-muted-foreground">参考结构是 AI 写的一种拆法，不是标准答案。</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5" lang="ja">
                {drill.review.reference_ja.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
              <h3 className="mt-6 font-medium">最容易被追问穿的地方</h3>
              <ul className="mt-2 space-y-3">
                {drill.review.weak.map((w, i) => (
                  <li key={i}>
                    <p className="text-xs text-muted-foreground">你写的：「{w.quote}」</p>
                    <p>{w.why}</p>
                  </li>
                ))}
              </ul>
            </section>

            <StuckPicker id={drill.id} suggested={drill.review.suggested_step} current={drill.stuck_step} />
          </>
        )}
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 5: 检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 6: 提交**

```bash
git add "app/(app)/jobs/case"
git commit -m "feat(jobs): 练 case 的题目页——计时写结构、回答追问、复盘、点卡在哪一步" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 岗位页那一节、/jobs 那一行

**Files:**
- Create: `app/(app)/jobs/[id]/case-panel.tsx`
- Modify: `app/(app)/jobs/[id]/page.tsx`、`app/(app)/jobs/page.tsx`

- [ ] **Step 1: 岗位页那一节**

`app/(app)/jobs/[id]/case-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CASE_STATUS_LABELS, STUCK_STEPS, type CaseDrillSummary } from "@/lib/domains/jobs/case-shared";
import { tokyoDate } from "@/lib/domains/jobs/shared";
import { createCaseDrillAction } from "../actions";

export function CasePanel({
  postingId,
  drills,
  missingMigration,
}: {
  postingId: string;
  drills: CaseDrillSummary[];
  missingMigration: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      setError(null);
      const r = await createCaseDrillAction(postingId);
      if (!r.ok) setError(r.message);
      else router.push(`/jobs/case/${r.id}`);
    });

  return (
    <section className="space-y-3 text-sm leading-7">
      <h2 className="text-base font-semibold">这家可能会问的 case</h2>
      <p className="text-muted-foreground">按这家的生意出一道ケース面接的题，限时写结构，再被面试官追问两三个。投之前、或者面试前一晚练一道。</p>
      {missingMigration ? (
        <p className="text-muted-foreground">{missingMigration}</p>
      ) : (
        <>
          <Button size="sm" disabled={pending} onClick={create}>
            {pending ? "在按这家出题…（十几秒）" : drills.length > 0 ? "再出一道" : "出一道这家可能会问的 case"}
          </Button>
          {drills.length > 0 && (
            <ul className="space-y-1">
              {drills.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{tokyoDate(new Date(d.created_at))}</span>
                  <Link href={`/jobs/case/${d.id}`} className="underline-offset-4 hover:underline" lang="ja">
                    {d.prompt_ja.length > 40 ? `${d.prompt_ja.slice(0, 40)}…` : d.prompt_ja}
                  </Link>
                  <Badge variant="muted">{d.stuck_step ? STUCK_STEPS[d.stuck_step] : CASE_STATUS_LABELS[d.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="text-muted-foreground">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: 放进岗位页**

`app/(app)/jobs/[id]/page.tsx`:

import 区加:

```ts
import { listCaseDrills, MISSING_CASE_MIGRATION } from "@/lib/domains/jobs/cases";
import { CasePanel } from "./case-panel";
```

把

```ts
  const [profile, entries, resume, application, fill] = await Promise.all([
    getJobProfile(user.id),
    listCareerEntries(user.id),
    latestResume(user.id, posting.id),
    getApplicationForPosting(user.id, posting.id),
    getFillState(user.id, posting.id),
  ]);
```

改成

```ts
  const [profile, entries, resume, application, fill, cases] = await Promise.all([
    getJobProfile(user.id),
    listCareerEntries(user.id),
    latestResume(user.id, posting.id),
    getApplicationForPosting(user.id, posting.id),
    getFillState(user.id, posting.id),
    listCaseDrills(user.id, posting.id),
  ]);
```

在 `<ResumePanel ... />` 后面那个 `<Separator />` 之后、`<FillPanel` 之前加:

```tsx
        <CasePanel
          postingId={posting.id}
          drills={cases === "missing-schema" ? [] : cases}
          missingMigration={cases === "missing-schema" ? MISSING_CASE_MIGRATION : null}
        />
        <Separator />
```

- [ ] **Step 3: /jobs 那一行**

`app/(app)/jobs/page.tsx`:

import 区加:

```ts
import { listCaseDrills } from "@/lib/domains/jobs/cases";
import { RECENT_DRILLS, STUCK_STEPS, stuckCounts, type StuckStep } from "@/lib/domains/jobs/case-shared";
```

把

```ts
  const [{ picked, candidates }, apps, entries, chinaRuns] = await Promise.all([
    listPostings(user.id),
    listMarketApps(user.id),
    listCareerEntries(user.id),
    listChinaRuns(user.id),
  ]);
```

改成

```ts
  const [{ picked, candidates }, apps, entries, chinaRuns, caseDrills] = await Promise.all([
    listPostings(user.id),
    listMarketApps(user.id),
    listCareerEntries(user.id),
    listChinaRuns(user.id),
    listCaseDrills(user.id),
  ]);
  const caseStats = caseDrills === "missing-schema" ? null : stuckCounts(caseDrills);
  const companyOf = new Map([...picked, ...candidates].map((p) => [p.id, p.company_name]));
```

在「市场怎么看你」那一节里 `<BetForm />` 那个 `</div>` 后面加:

```tsx
            {caseStats && caseDrills !== "missing-schema" && caseStats.total > 0 && (
              <details className="mt-4 text-xs leading-6 text-muted-foreground">
                <summary className="cursor-pointer">
                  练过 {caseStats.total} 道 case
                  {caseStats.recent > 0 &&
                    `；最近 ${caseStats.recent} 道里：${(Object.keys(STUCK_STEPS) as StuckStep[])
                      .filter((k) => caseStats.counts[k] > 0)
                      .map((k) => `${STUCK_STEPS[k]} ${caseStats.counts[k]} 次`)
                      .join("、")}`}
                </summary>
                <ul className="mt-2 space-y-1">
                  {caseDrills.slice(0, RECENT_DRILLS).map((d) => (
                    <li key={d.id}>
                      <Link href={`/jobs/case/${d.id}`} className="underline-offset-4 hover:underline">
                        {companyOf.get(d.posting_id) ?? "岗位"}：{d.prompt_ja.length > 30 ? `${d.prompt_ja.slice(0, 30)}…` : d.prompt_ja}
                      </Link>
                      {d.stuck_step && ` · ${STUCK_STEPS[d.stuck_step]}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
```

- [ ] **Step 4: 检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 5: 提交**

```bash
git add "app/(app)/jobs/[id]/case-panel.tsx" "app/(app)/jobs/[id]/page.tsx" "app/(app)/jobs/page.tsx"
git commit -m "feat(jobs): 岗位页加「这家可能会问的 case」，/jobs 加练过几道、卡在哪一步几次" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 宪法

**Files:**
- Modify: `CLAUDE.md`(jobs 那一行;Schema 段)。文件是 CRLF,用 Edit 工具改(保持换行)。

- [ ] **Step 1: jobs 那一行**

把 jobs 那一行末尾的

```
;收发邮件是下一块 |
```

换成

```
;**练 case(经用户同意,2026-10-17;迁移 081 job_case_drills)**:岗位页「这家可能会问的 case」按这家公司的生意出一道ケース面接的题(题型随岗位类别:分析设计/业务利润改善/新规事业/市场规模费米/中国市场;写到这家公司的事要附招聘页原话、代码逐字核对;题目里大于 10 的数字必须在招聘页里,不许编营业额人数)→ 他计时写结构(建议 15 分钟,不强制)→ AI 面试官追问 2–3 个(日文,每个引用他写的原话、代码核对,不许夸、不给答案)→ 复盘(参考结构日文、标明不是标准答案;最容易被问穿的 2–3 处引用他的原话;卡在哪一步五类 AI 只提名、他点了才算);不打分,只数练了几道、最近 10 道各卡在哪一步几次,用了几分钟由代码算;收发邮件是下一块 |
```

- [ ] **Step 2: Schema 段**

在 `job_china_runs(迁移 080):...` 那两行后面加:

```
  job_case_drills(迁移 081):练 case,一道题一行;status asked → answered → reviewed;question/followups/review 各一列 jsonb;
  stuck_step 是他点的卡在哪一步(五类),AI 的提名在 review.suggested_step;只在 lib/domains/jobs/cases.ts 读写。
```

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md
git commit -m "docs(jobs): 宪法写进练 case" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 全部验证

- [ ] **Step 1: 三项检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

Run: `npm test`
Expected: 全部通过(materials `domain.test.ts` 冷启动偶尔超时,重跑就过;别的失败要查)。

- [ ] **Step 2: 交给他**

告诉他:
1. 在 Supabase 的 SQL Editor 里跑 `supabase/migrations/081_job_case_drills.sql`;
2. 登录后打开一个你点了「要这个」的岗位,往下找「这家可能会问的 case」,出一道、写结构、答追问、点卡在哪一步;
3. 看完决定要不要把 `feat/case-practice` 合回 main(不 push)。

浏览器验证要登录,测试账号密码不在项目文件里,这一步由他自己点。

---

## 自查(写计划时做过)

- 设计里的每一条都有任务:题型随类别、招聘页原话核对、数字门槛(3);追问引用原话不许夸、少于 2 个报错(3);复盘三样、五类只提名(3、6);计时与用时(2、6);岗位页一节(7);/jobs 计数与点开看哪几道(7);迁移(1);宪法(8);不打分(全篇)。
- 名字前后一致:`CaseType`/`StuckStep`/`CaseStatus`/`CaseQuestion`/`CaseFollowup`/`CaseReview`/`CaseDrill`/`CaseDrillSummary`;`draftCaseQuestion`/`askFollowups`/`reviewCase`;`createCaseDrill`/`getCaseDrill`/`submitCaseAnswer`/`submitFollowupAnswers`/`setCaseStuckStep`/`listCaseDrills`;action 名加 `Action` 后缀。
- `MIN_ANSWER_CHARS`、`RECENT_DRILLS`、`STUCK_STEPS`、`CASE_STATUS_LABELS`、`stuckCounts`、`minutesTaken` 都在 Task 2 定义。
