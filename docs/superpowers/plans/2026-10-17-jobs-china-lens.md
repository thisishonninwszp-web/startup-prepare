# 面试演示「御社の商売、中国ではどうなっている？」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面试官说一句他们做什么生意,页面用中文查中国做同样生意的公司(原文逐字核对 + 日译),再查那边做成靠的条件日本有没有、中国同行来没来过日本;界面日文、无导航壳,他登录后共享屏幕给面试官看。

**Architecture:** 三步(搜索词 → 中国的公司 → 日本这边),每步一个 server action(各 60 秒内),做完存进 `job_china_runs`,浏览器按状态接着调下一步。AI 提示词与解析器在 `lib/ai/jobs-china.ts`,类型和纯规则在 `lib/domains/jobs/china-shared.ts`,流程和数据库在 `lib/domains/jobs/china.ts`;原文核对复用 `lib/ai/signals.ts` 的 `verifiedBasis`,数字核对复用 `provenance-shared.ts` 的 `unsupported`/`quoteIn`,同一门生意由 Jev 判。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase(service role)、Gemini(经 `executeAiJson`)、Jev(经 `executeJev`)、`webSearch`、vitest、Tailwind 语义 token。

设计见 `docs/superpowers/specs/2026-10-17-jobs-china-lens-design.md`。
在分支 `feat/china-lens` 上做,每个任务本地提交,不 push。验证:`npx tsc --noEmit`、`npm run lint`、`npm test`;dev server 开着时绝不 `npm run build`。
提交信息里不要用 ASCII 双引号(PowerShell here-string 里带空格会被拆开),用「」。

| # | 做什么 | 文件 | 测 |
|---|---|---|---|
| 1 | 迁移 080,追加到 schema.sql | `supabase/migrations/080_job_china_runs.sql`、`supabase/schema.sql` | — |
| 2 | 类型与纯规则 | `lib/domains/jobs/china-shared.ts` | china-shared.test |
| 3 | `verifiedBasis`、`secondOption` 改成导出 | `lib/ai/signals.ts` | tsc + 现有测试 |
| 4 | AI 第 1、2 步 + 同一门生意的裁判 | `lib/ai/jobs-china.ts`、`lib/ai/index.ts` | jobs-china.test |
| 5 | AI 第 3 步 | `lib/ai/jobs-china.ts` | jobs-china.test |
| 6 | 流程与数据库 | `lib/domains/jobs/china.ts` | tsc |
| 7 | 先试:三门生意跑一遍(脚本不进仓库) | `scripts/china-try.ts`(用完删) | 手动 |
| 8 | 无壳布局 + 输入页 + server actions | `app/(present)/...` | tsc/lint |
| 9 | 结果页 + 接着跑下一步 | `app/(present)/demo/china/[id]/...` | tsc/lint |
| 10 | `/jobs` 入口与记录;CLAUDE.md | `app/(app)/jobs/page.tsx`、`CLAUDE.md` | tsc/lint |
| 11 | 全部验证 | — | tsc/lint/test |

---

### Task 0: 开分支

- [ ] **Step 1: 从 main 开分支**

```bash
git switch -c feat/china-lens
```

Expected: `Switched to a new branch 'feat/china-lens'`

---

### Task 1: 迁移 080

**Files:**
- Create: `supabase/migrations/080_job_china_runs.sql`
- Modify: `supabase/schema.sql`(末尾追加)

- [ ] **Step 1: 写迁移**

`supabase/migrations/080_job_china_runs.sql`:

```sql
-- ============================================================================
-- 迁移 080：面试演示「御社の商売、中国ではどうなっている？」的记录
-- 每一次分三步跑（搜索词 → 中国的公司 → 日本这边），每步做完存进来，下一步从这里读上一步的结果。
-- status：planned（写好搜索词）→ companies（找到公司）→ done；一家都没找到 none_found；
--   中途失败 failed（失败的是哪一步，按 plan / companies / japan 哪几列是空的来认）。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists job_china_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  business    text not null,
  status      text not null default 'planned'
    check (status in ('planned', 'companies', 'done', 'none_found', 'failed')),
  plan        jsonb,
  companies   jsonb,
  japan       jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_job_china_runs_user on job_china_runs (user_id, created_at desc);

alter table job_china_runs enable row level security;
drop policy if exists "job_china_runs_owner" on job_china_runs;
create policy "job_china_runs_owner" on job_china_runs
  for all using (auth.uid() = user_id);
```

- [ ] **Step 2: 换成 CRLF,追加到 schema.sql**(两个文件都是 CRLF)

```bash
sed -i 's/$/\r/' supabase/migrations/080_job_china_runs.sql
printf '\r\n' >> supabase/schema.sql
cat supabase/migrations/080_job_china_runs.sql >> supabase/schema.sql
file supabase/migrations/080_job_china_runs.sql supabase/schema.sql
tail -n 5 supabase/schema.sql
```

Expected: 两个文件都是 `with CRLF line terminators`;schema.sql 末尾是 `for all using (auth.uid() = user_id);`。

- [ ] **Step 3: 提交**

```powershell
git add supabase/migrations/080_job_china_runs.sql supabase/schema.sql
git commit -m @'
feat(jobs): 迁移 080 面试演示的记录表 job_china_runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: 类型与纯规则

**Files:**
- Create: `lib/domains/jobs/china-shared.ts`
- Test: `lib/domains/jobs/china-shared.test.ts`

- [ ] **Step 1: 写失败的测试**

`lib/domains/jobs/china-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assertJapanese,
  assertNoHype,
  cleanBusiness,
  nextChinaStep,
  quoteLang,
  type ChinaCompanies,
  type ChinaJapan,
  type ChinaPlan,
} from "./china-shared";

const plan: ChinaPlan = { zh_business: "面向中小企业的考勤管理 SaaS", queries: ["中小企业 考勤 SaaS", "考勤打卡 软件 融资"] };
const one: ChinaCompanies = {
  read: 6,
  companies: [
    {
      name: "钉钉",
      what_ja: "中小企業向けに勤怠打刻の機能を提供している。",
      excerpt: "钉钉为中小企业提供考勤打卡、排班和请假审批功能",
      excerpt_ja: "釘釘は中小企業向けに勤怠打刻、シフト作成、休暇申請の承認機能を提供している",
      url: "https://example.cn/a",
      title: "钉钉发布新版考勤功能",
      same: true,
    },
  ],
};
const japan: ChinaJapan = { conditions: [], entrants: [] };

describe("下一步跑哪一步", () => {
  it("按哪几列是空的接着跑，失败的也一样", () => {
    expect(nextChinaStep({ status: "failed", plan: null, companies: null, japan: null })).toBe("plan");
    expect(nextChinaStep({ status: "planned", plan, companies: null, japan: null })).toBe("companies");
    expect(nextChinaStep({ status: "failed", plan, companies: null, japan: null })).toBe("companies");
    expect(nextChinaStep({ status: "companies", plan, companies: one, japan: null })).toBe("japan");
    expect(nextChinaStep({ status: "failed", plan, companies: one, japan: null })).toBe("japan");
  });

  it("跑完、没找到就不再跑", () => {
    expect(nextChinaStep({ status: "done", plan, companies: one, japan })).toBeNull();
    expect(nextChinaStep({ status: "none_found", plan, companies: { read: 3, companies: [] }, japan: null })).toBeNull();
  });
});

describe("日文和禁用词", () => {
  it("没有平假名的算没用日文", () => {
    expect(() => assertJapanese(["中小企業向けに勤怠打刻の機能を提供している。"])).not.toThrow();
    expect(() => assertJapanese(["为中小企业提供考勤打卡功能"])).toThrow(/没用日文/);
  });

  it("吹捧、下结论的词报错", () => {
    expect(() => assertNoHype(["日本でも有望な市場だ"])).toThrow(/有望/);
    expect(() => assertNoHype(["日本ではまだ導入が少ない"])).not.toThrow();
  });
});

describe("输入那一句", () => {
  it("去掉多余空白，太短的不收", () => {
    expect(cleanBusiness("  中小企業向けの   勤怠管理SaaS ")).toBe("中小企業向けの 勤怠管理SaaS");
    expect(() => cleanBusiness("ab")).toThrow();
  });
});

describe("原文是哪种语言", () => {
  it("有假名是日文，没有是中文", () => {
    expect(quoteLang("中小企業における勤怠管理システムの導入率は約4割にとどまる")).toBe("ja");
    expect(quoteLang("钉钉为中小企业提供考勤打卡功能")).toBe("zh-CN");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/domains/jobs/china-shared.test.ts`
Expected: FAIL,`Failed to resolve import "./china-shared"`。

- [ ] **Step 3: 写实现**

`lib/domains/jobs/china-shared.ts`:

```ts
/**
 * 面试演示「御社の商売、中国ではどうなっている？」的类型和纯规则（不碰数据库、不调 AI，可测）。
 * 界面给面试官看，是日文；AI 写的日文字段由这里查：要有平假名、不许有吹捧和"有机会"的词（宪法原则 1、2）。
 */

/** 一句带出处的原文：逐字在那篇网页的正文里（代码核对过）。 */
export type SourcedQuote = { url: string; title: string; excerpt: string };

export type ChinaPlan = {
  /** 这门生意在中国的说法（中文一句）。 */
  zh_business: string;
  /** 2–3 个中文搜索词。 */
  queries: string[];
};

export type ChinaCompany = {
  name: string;
  /** 它做什么（日文一句，AI 写的；数字和英文词在那篇资料里）。 */
  what_ja: string;
  /** 原文（中文，逐字在资料里）。 */
  excerpt: string;
  /** 原文的日文翻译（AI 写的；数字和英文词在原文里）。 */
  excerpt_ja: string;
  url: string;
  title: string;
  /** 另一个模型（Jev）判它是不是在做同一门生意：true = 判了"是"；null = 裁判没调通。判"不是"的不留。 */
  same: boolean | null;
};

export type ChinaCompanies = {
  companies: ChinaCompany[];
  /** 一共读到几篇资料。 */
  read: number;
};

export type Holds = "yes" | "no" | "unclear";

export const HOLDS_LABELS: Record<Holds, string> = { yes: "ある", no: "ない", unclear: "資料なし" };

export type JapanCondition = {
  name: string;
  /** 中国那边的情况：AI 写的、没有出处，所以不许有数字。 */
  there_ja: string;
  here_ja: string;
  /** 拿不出逐字对得上的日本资料原文时一律 unclear。 */
  holds: Holds;
  basis: SourcedQuote[];
};

export type JapanEntrant = { text_ja: string; basis: SourcedQuote[] };

export type ChinaJapan = { conditions: JapanCondition[]; entrants: JapanEntrant[] };

export const CHINA_RUN_STATUSES = ["planned", "companies", "done", "none_found", "failed"] as const;
export type ChinaRunStatus = (typeof CHINA_RUN_STATUSES)[number];

export type ChinaRun = {
  id: string;
  business: string;
  status: ChinaRunStatus;
  plan: ChinaPlan | null;
  companies: ChinaCompanies | null;
  japan: ChinaJapan | null;
  error: string | null;
  created_at: string;
};

export type ChinaRunSummary = Pick<ChinaRun, "id" | "business" | "status" | "created_at">;

export type ChinaStep = "plan" | "companies" | "japan";

/** 页面上说"停在哪一步"用的（日文，给面试官看）。 */
export const STEP_LABELS: Record<ChinaStep, string> = { plan: "検索語", companies: "中国の会社", japan: "日本の状況" };

/** /jobs 上列记录用的（中文，只有他自己看）。 */
export const RUN_STATUS_LABELS: Record<ChinaRunStatus, string> = {
  planned: "还没跑完",
  companies: "还没跑完",
  done: "跑完了",
  none_found: "没找到",
  failed: "停在半路",
};

/** 下一步该跑哪一步。跑完了（done）、没找到（none_found）返回 null；失败的按哪几列是空的接着跑。 */
export function nextChinaStep(run: Pick<ChinaRun, "status" | "plan" | "companies" | "japan">): ChinaStep | null {
  if (run.status === "done" || run.status === "none_found") return null;
  if (!run.plan) return "plan";
  if (!run.companies) return "companies";
  if (run.companies.companies.length === 0) return null;
  if (!run.japan) return "japan";
  return null;
}

const HIRAGANA = /[぀-ゟ]/;
const KANA = /[぀-ヿ]/;

/** AI 写的日文字段：每一段都要有平假名（模型会跟着中文资料写成中文）。 */
export function assertJapanese(texts: string[]): void {
  const bad = texts.find((t) => t.trim() && !HIRAGANA.test(t));
  if (bad) throw new Error(`没用日文：${bad.slice(0, 20)}`);
}

/** 不许吹捧、不许下"有机会"的结论。 */
export const JA_HYPE = [
  "有望",
  "チャンス",
  "ポテンシャル",
  "期待でき",
  "注目すべき",
  "注目の",
  "参考になる",
  "素晴らしい",
  "すばらしい",
  "大きな可能性",
  "間違いな",
];

export function assertNoHype(texts: string[]): void {
  const all = texts.join("\n");
  const hit = JA_HYPE.find((w) => all.includes(w));
  if (hit) throw new Error(`出现了不该出现的话：${hit}`);
}

/** 他输入的那一句：去掉多余空白，最多 100 字；太短的搜不出东西。报错是日文（显示在演示页上）。 */
export function cleanBusiness(input: string): string {
  const text = input.replace(/\s+/g, " ").trim().slice(0, 100);
  if (text.length < 4) throw new Error("もう少し具体的に書いてください（誰に・何を売っているか）。");
  return text;
}

/** 原文是日文还是中文：有假名就是日文。用来给原文标 lang，汉字才会用对的字形显示。 */
export function quoteLang(text: string): "ja" | "zh-CN" {
  return KANA.test(text) ? "ja" : "zh-CN";
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/domains/jobs/china-shared.test.ts`
Expected: PASS(4 个 describe、6 个 it 全过)。

- [ ] **Step 5: 提交**

```powershell
git add lib/domains/jobs/china-shared.ts lib/domains/jobs/china-shared.test.ts
git commit -m @'
feat(jobs): 面试演示的类型与纯规则（下一步、日文检查、禁用词、输入清理）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: `verifiedBasis`、`secondOption` 改成导出

**Files:**
- Modify: `lib/ai/signals.ts`(`function secondOption(` 约 2176 行;`function verifiedBasis(` 约 3193 行)

- [ ] **Step 1: 改两处声明**

把

```ts
function secondOption(answer: unknown): number {
```

改成

```ts
export function secondOption(answer: unknown): number {
```

把

```ts
function verifiedBasis(raw: unknown, sources: SearchSource[]): { url: string; title: string; excerpt: string }[] {
```

改成

```ts
export function verifiedBasis(raw: unknown, sources: SearchSource[]): { url: string; title: string; excerpt: string }[] {
```

(只加 `export`,函数体不动。)

- [ ] **Step 2: 确认没有同名导出撞车**

Run: `npx tsc --noEmit`
Expected: 没有输出(`lib/ai/index.ts` 是 `export *`,同名会报 TS2308)。

Run: `npx vitest run lib/ai/signals.test.ts`
Expected: PASS(行为没变)。

- [ ] **Step 3: 提交**

```powershell
git add lib/ai/signals.ts
git commit -m @'
refactor(ai): 导出 verifiedBasis 与 secondOption，给面试演示复用原文核对和裁判读数

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: AI 第 1、2 步 + 同一门生意的裁判

**Files:**
- Create: `lib/ai/jobs-china.ts`
- Modify: `lib/ai/index.ts`(加一行导出)
- Test: `lib/ai/jobs-china.test.ts`

- [ ] **Step 1: 写失败的测试**

`lib/ai/jobs-china.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseChinaCompanies, parseChinaPlan, parseSameBusiness } from "./jobs-china";

const CN = {
  title: "钉钉发布新版考勤功能",
  url: "https://example.cn/a",
  content: "钉钉是阿里巴巴旗下的企业协作平台。钉钉为中小企业提供考勤打卡、排班和请假审批功能，已服务超过2000万家企业组织。",
};

const good = {
  source: 1,
  name: "钉钉",
  what_ja: "中小企業向けに勤怠打刻やシフト管理の機能を提供している。",
  excerpt: "钉钉为中小企业提供考勤打卡、排班和请假审批功能",
  excerpt_ja: "釘釘は中小企業向けに勤怠打刻、シフト作成、休暇申請の承認機能を提供している",
};

describe("第 1 步：中文搜索词", () => {
  it("收中文的两到三个词", () => {
    const plan = parseChinaPlan({
      zh_business: "面向中小企业的考勤管理 SaaS",
      queries: ["中小企业 考勤 SaaS", "考勤打卡 软件 融资", "考勤 SaaS 排行"],
    });
    expect(plan.zh_business).toBe("面向中小企业的考勤管理 SaaS");
    expect(plan.queries).toHaveLength(3);
  });

  it("带日文假名的词不要，剩不到两个就报错", () => {
    expect(() =>
      parseChinaPlan({ zh_business: "面向中小企业的考勤管理 SaaS", queries: ["勤怠管理 クラウド", "中小企业 考勤 SaaS"] })
    ).toThrow(/不到两个/);
  });

  it("zh_business 写成日文就报错", () => {
    expect(() => parseChinaPlan({ zh_business: "中小企業向けの勤怠管理", queries: ["中小企业 考勤", "考勤 融资"] })).toThrow(/不是中文/);
  });
});

describe("第 2 步：中国的公司", () => {
  it("原文逐字在资料里、名字对得上的留下", () => {
    const out = parseChinaCompanies({ companies: [good] }, [CN]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "钉钉", url: CN.url, title: CN.title });
  });

  it("原文不在资料里的丢掉", () => {
    expect(parseChinaCompanies({ companies: [{ ...good, excerpt: "钉钉为所有企业提供考勤打卡功能和工资计算" }] }, [CN])).toEqual([]);
  });

  it("公司名不在原文和标题里的丢掉（防编名字）", () => {
    expect(parseChinaCompanies({ companies: [{ ...good, name: "企业微信" }] }, [CN])).toEqual([]);
  });

  it("译文里多出原文没有的数字就丢掉；说明里的数字只要在整篇资料里就行", () => {
    expect(parseChinaCompanies({ companies: [{ ...good, excerpt_ja: `${good.excerpt_ja}。2000万社が使っている` }] }, [CN])).toEqual([]);
    expect(parseChinaCompanies({ companies: [{ ...good, what_ja: "2000万以上の組織が使う勤怠打刻の機能がある。" }] }, [CN])).toHaveLength(1);
  });

  it("同名的只留一家", () => {
    expect(parseChinaCompanies({ companies: [good, { ...good }] }, [CN])).toHaveLength(1);
  });

  it("说明写成中文就报错（让它重写）", () => {
    expect(() => parseChinaCompanies({ companies: [{ ...good, what_ja: "为中小企业提供考勤功能" }] }, [CN])).toThrow(/没用日文/);
  });

  it("吹捧的词报错", () => {
    expect(() => parseChinaCompanies({ companies: [{ ...good, what_ja: "日本でも有望なサービスを提供している。" }] }, [CN])).toThrow(/有望/);
  });
});

describe("裁判：是不是同一门生意", () => {
  it("第二档概率过 0.5 才算是；没答的算不是", () => {
    const answers = {
      c_0: { probabilities: { "0": 0.2, "1": 0.8 } },
      c_1: { probabilities: { "0": 0.7, "1": 0.3 } },
    };
    expect(parseSameBusiness(answers, 3)).toEqual([true, false, false]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/ai/jobs-china.test.ts`
Expected: FAIL,`Failed to resolve import "./jobs-china"`。

- [ ] **Step 3: 写实现**

`lib/ai/jobs-china.ts`:

```ts
import { executeAiJson, executeJev, type JevQuestion } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { secondOption, type SearchSource } from "./signals";
import { quoteIn, unsupported } from "@/lib/domains/jobs/provenance-shared";
import { assertJapanese, assertNoHype, type ChinaCompany, type ChinaPlan } from "@/lib/domains/jobs/china-shared";

// ---------------------------------------------------------------------------
// 面试演示「御社の商売、中国ではどうなっている？」：面试官说一句生意 → 中文搜中国同行 → 那边做成靠的条件日本有没有。
// 界面给面试官看，AI 写的叙述一律日文；原文逐字核对，日文里的数字和英文词必须在原文里（代码查）。
// 宪法原则 1、2：不打分、不下"有机会"的结论，要特意找日本不具备的条件。
// ---------------------------------------------------------------------------

const MAX_COMPANIES = 4;
const SAME_ABOVE = 0.5;
const KANA = /[぀-ヿ]/;
const HAN = /[一-鿿]/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** 比公司名用：统一全半角、去空白、小写。 */
function squash(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function isChinese(text: string): boolean {
  return HAN.test(text) && !KANA.test(text);
}

// ---- 第 1 步：搜索词 -------------------------------------------------------------

const PLAN_PROMPT = `面试官用一句日文说了他们公司做什么生意。要用中文上网找"中国做同样生意的公司"。

写两样：
- zh_business：这门生意在中国的说法，一句中文，说清卖给谁、卖什么（例："面向中小企业的考勤管理 SaaS"）。不加评价。
- queries：2 到 3 个中文搜索词，每个 2 到 6 个词。用中国那边的叫法，不直译日文
  （例：勤怠管理 → 考勤；人材紹介 → 猎头 / 招聘平台；買取 → 回收；工務店 → 装修公司 / 家装；SaaS、App 这类照留）。
  其中一个带"融资""上市"或"排行"，容易搜到讲具体公司的报道。
全部用简体中文，不要日文假名。

只输出 JSON：{"zh_business":"…","queries":["…","…"]}`;

export function parseChinaPlan(value: unknown): ChinaPlan {
  const v = (value ?? {}) as Record<string, unknown>;
  const zh = str(v.zh_business, 80);
  if (!zh || !isChinese(zh)) throw new Error("zh_business 不是中文");
  const queries = (Array.isArray(v.queries) ? v.queries : []).map((q) => str(q, 40)).filter((q) => q && isChinese(q));
  const unique = Array.from(new Set(queries)).slice(0, 3);
  if (unique.length < 2) throw new Error("中文搜索词不到两个");
  return { zh_business: zh, queries: unique };
}

/** 第 1 步：这门生意在中国的说法和中文搜索词。 */
export async function planChinaQueries(userId: string, business: string): Promise<ChinaPlan> {
  return executeAiJson(
    { userId, operation: "china_lens_plan", module: "jobs", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: business + (attempt === 1 ? "\n\n上一次输出没通过校验：zh_business 和 queries 必须是简体中文（不要日文假名），queries 两到三个。" : ""),
      config: {
        systemInstruction: PLAN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 800,
      },
    }),
    parseChinaPlan
  );
}

// ---- 第 2 步：中国的公司 ----------------------------------------------------------

const companiesPrompt = (zhBusiness: string) => `下面是用中文搜到的资料（带编号）。要找在中国做"${zhBusiness}"这门生意的公司。

从资料里挑最多 ${MAX_COMPANIES} 家。必须是资料里写着它自己在做这门生意的；只是被顺带提到、做的是别的生意、或者只是这门生意的客户，都不算。每家写：
- source：资料编号。
- name：公司或服务名，照资料里的写法抄（中文就写中文）。
- what_ja：它做什么，一句日文，写给不懂中国的日本人看。只写资料里有的。
- excerpt：能说明它在做这门生意的那句原文，逐字照抄（不翻译、不改字、不拼接），15 到 150 字。
- excerpt_ja：这句原文的日文翻译，忠实，不加不减。

数字和英文词只能照资料写；资料里没有的数字、英文词不要写进 what_ja 和 excerpt_ja。
不评价好坏，不写"有望""チャンス""注目"这类词。what_ja 和 excerpt_ja 必须是日文。
资料里一家都没有，就给空数组。

只输出 JSON：{"companies":[{"source":1,"name":"…","what_ja":"…","excerpt":"…","excerpt_ja":"…"}]}`;

export type FoundCompany = Omit<ChinaCompany, "same">;

/**
 * 每家都要过代码核对，不过的那家丢掉（不重写）：原文逐字在那篇资料里、公司名在原文或标题里、
 * 译文的数字和英文词在原文里、说明的数字和英文词在那篇资料里。日文和禁用词不过就报错让它重写。
 */
export function parseChinaCompanies(value: unknown, sources: SearchSource[]): FoundCompany[] {
  const raw = (value as { companies?: unknown } | null)?.companies;
  if (!Array.isArray(raw)) throw new Error("缺少 companies");
  const out: FoundCompany[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const src = sources[(typeof v.source === "number" ? v.source : Number(v.source)) - 1];
    const name = str(v.name, 40);
    const what_ja = str(v.what_ja, 200);
    const excerpt = str(v.excerpt, 300);
    const excerpt_ja = str(v.excerpt_ja, 400);
    if (!src || !name || !what_ja || !excerpt || !excerpt_ja) continue;
    if (excerpt.replace(/\s+/g, "").length < 15 || !quoteIn(excerpt, src.content)) continue;
    if (!squash(`${excerpt}${src.title}`).includes(squash(name))) continue;
    if (unsupported(excerpt_ja, excerpt) || unsupported(what_ja, `${src.title}\n${src.content}`)) continue;
    if (out.some((o) => squash(o.name) === squash(name))) continue;
    out.push({ name, what_ja, excerpt, excerpt_ja, url: src.url, title: src.title });
    if (out.length >= MAX_COMPANIES) break;
  }
  const texts = out.flatMap((c) => [c.what_ja, c.excerpt_ja]);
  assertJapanese(texts);
  assertNoHype(texts);
  return out;
}

/** 第 2 步：从中文资料里挑做同一门生意的公司（原文核对）。 */
export async function extractChinaCompanies(userId: string, zhBusiness: string, sources: SearchSource[]): Promise<FoundCompany[]> {
  const contents = sources.map((s, i) => `[资料 ${i + 1}] ${s.title}\n${s.url}\n${s.content.slice(0, 1500)}`).join("\n\n");
  return executeAiJson(
    { userId, operation: "china_lens_companies", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：what_ja 和 excerpt_ja 必须是日文（要有平假名），不许有吹捧的词；excerpt 逐字照抄资料原文。" : ""),
      config: {
        systemInstruction: companiesPrompt(zhBusiness),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseChinaCompanies(value, sources)
  );
}

// ---- 裁判：是不是同一门生意 --------------------------------------------------------

export function parseSameBusiness(answers: Record<string, unknown>, count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => secondOption(answers[`c_${i}`]) > SAME_ABOVE);
}

/**
 * 另一个模型独立判：每家的原文写的是不是它自己在做这门生意。
 * 写公司的模型常把"被顺带提到的""做相邻生意的"也算进来；面试官一眼看出不对，比少一家更伤。
 * 裁判没调通返回 ok:false（调用方照留、标「別のAIの確認はまだ」）。
 */
export async function judgeSameBusiness(
  zhBusiness: string,
  companies: Pick<ChinaCompany, "name" | "excerpt">[]
): Promise<{ ok: true; same: boolean[] } | { ok: false }> {
  if (companies.length === 0) return { ok: true, same: [] };
  const questions: Record<string, JevQuestion> = {};
  companies.forEach((c, i) => {
    questions[`c_${i}`] = {
      type: "score",
      instructions: `[${i}] 这句原文，写的是不是「${c.name}」自己在做上面这门生意（卖给同一类客户的同一类东西）？只是被顺带提到、做的是相邻的别的生意、或者只是这门生意的客户，都算不是。`,
      criteria: ["不是：说的是别的生意，或者它没在做这门生意", "是：它自己在做这门生意"],
    };
  });
  const state = [`这门生意：${zhBusiness}`, ...companies.map((c, i) => `[${i}] ${c.name}：「${c.excerpt}」`)].join("\n");
  try {
    const same = await executeJev({ operation: "china_lens_judge", module: "jobs", timeoutMs: 25_000 }, { state, questions }, (result) =>
      parseSameBusiness(result.answers, companies.length)
    );
    return { ok: true, same };
  } catch (e) {
    console.error("china lens judge failed", e);
    return { ok: false };
  }
}
```

- [ ] **Step 4: 加进桶导出**

`lib/ai/index.ts` 里 `export * from "./jobs";` 下面加一行:

```ts
export * from "./jobs-china";
```

- [ ] **Step 5: 跑测试确认通过,并查同名导出**

Run: `npx vitest run lib/ai/jobs-china.test.ts`
Expected: PASS(11 个 it 全过)。

Run: `npx tsc --noEmit`
Expected: 没有输出。

- [ ] **Step 6: 提交**

```powershell
git add lib/ai/jobs-china.ts lib/ai/jobs-china.test.ts lib/ai/index.ts
git commit -m @'
feat(jobs): 面试演示 AI 第 1、2 步——中文搜索词、挑中国同行（原文逐字、公司名、日译数字由代码核对），Jev 判是不是同一门生意

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: AI 第 3 步(日本这边)

**Files:**
- Modify: `lib/ai/jobs-china.ts`(末尾追加;顶部 import 换三处)
- Test: `lib/ai/jobs-china.test.ts`(末尾追加)

- [ ] **Step 1: 追加失败的测试**

`lib/ai/jobs-china.test.ts` 顶部的 import 改成:

```ts
import { parseChinaCompanies, parseChinaPlan, parseJapanJudgment, parseJapanPlan, parseSameBusiness } from "./jobs-china";
```

文件末尾追加:

```ts
const CONDITIONS = [
  { name: "スマホ打刻が当たり前", there_ja: "中国では従業員がスマホで出退勤を打刻するのが当たり前になっている。", query_ja: "スマホ 打刻 普及率 中小企業" },
  { name: "中小企業がITにお金を払う習慣", there_ja: "中国の中小企業は無料の業務アプリを使い慣れている。", query_ja: "中小企業 IT投資 調査" },
  { name: "勤怠の記録の決まり", there_ja: "中国では勤怠の記録方法に細かい決まりが少ない。", query_ja: "勤怠管理 客観的記録 義務" },
];

describe("第 3 步：日本这边要查的条件", () => {
  it("收两到五个条件和两个先例搜索词", () => {
    const plan = parseJapanPlan({ conditions: CONDITIONS, entrant_queries: ["中国 勤怠管理 日本進出 撤退", "考勤 SaaS 出海 日本"] });
    expect(plan.conditions).toHaveLength(3);
    expect(plan.entrant_queries).toHaveLength(2);
  });

  it("中国那边的说明写了数字就报错（没有出处）", () => {
    const withNumber = [{ ...CONDITIONS[0], there_ja: "中国では8割の企業がスマホで打刻している。" }, CONDITIONS[1]];
    expect(() => parseJapanPlan({ conditions: withNumber, entrant_queries: [] })).toThrow(/数字/);
  });

  it("条件不到两个报错", () => {
    expect(() => parseJapanPlan({ conditions: [CONDITIONS[0]], entrant_queries: [] })).toThrow(/不到两个/);
  });

  it("说明写成中文报错", () => {
    const chinese = [{ ...CONDITIONS[0], there_ja: "中国企业普遍用手机打卡" }, CONDITIONS[1]];
    expect(() => parseJapanPlan({ conditions: chinese, entrant_queries: [] })).toThrow(/没用日文/);
  });
});

const JP = {
  title: "勤怠管理システムの導入率",
  url: "https://example.jp/a",
  content: "中小企業における勤怠管理システムの導入率は約4割にとどまる。紙のタイムカードを使い続ける企業も多い。",
};
const ENTRANT = {
  title: "中国の勤怠SaaSが日本進出",
  url: "https://example.jp/b",
  content: "2019年、中国の勤怠管理サービスA社が日本法人を設立した。2022年に日本から撤退した。",
};
const inputs = [
  { condition: CONDITIONS[0], sources: [JP] },
  { condition: CONDITIONS[1], sources: [] },
];
const judged = {
  i: 0,
  here_ja: "日本の中小企業では勤怠管理システムの導入は約4割にとどまる。",
  holds: "no",
  basis: [{ source: 1, excerpt: "中小企業における勤怠管理システムの導入率は約4割にとどまる" }],
};

describe("第 3 步：日本这边有没有", () => {
  it("有原文的照收；没原文的一律資料なし", () => {
    const out = parseJapanJudgment({ items: [judged, { i: 1, here_ja: "日本でも払う習慣がある。", holds: "yes", basis: [] }], entrants: [] }, inputs, []);
    expect(out.conditions[0]).toMatchObject({ holds: "no", here_ja: judged.here_ja });
    expect(out.conditions[0].basis).toHaveLength(1);
    expect(out.conditions[1]).toMatchObject({ holds: "unclear", here_ja: "日本側の資料が見つかりませんでした。", basis: [] });
  });

  it("日文里的数字原文里没有，就算資料なし", () => {
    const out = parseJapanJudgment({ items: [{ ...judged, here_ja: "導入は約5割にとどまる。" }], entrants: [] }, inputs, []);
    expect(out.conditions[0].holds).toBe("unclear");
  });

  it("来过日本的：原文对得上才留，数字要在原文里", () => {
    const entrant = {
      text_ja: "中国のA社が2019年に日本法人を設立し、2022年に撤退した。",
      basis: [
        { source: 1, excerpt: "2019年、中国の勤怠管理サービスA社が日本法人を設立した" },
        { source: 1, excerpt: "2022年に日本から撤退した" },
      ],
    };
    const out = parseJapanJudgment({ items: [judged], entrants: [entrant, { text_ja: "B社も来ていた。", basis: [] }] }, inputs, [ENTRANT]);
    expect(out.entrants).toHaveLength(1);
    expect(out.entrants[0].basis).toHaveLength(2);
  });

  it("叙述写成中文报错", () => {
    expect(() => parseJapanJudgment({ items: [{ ...judged, here_ja: "日本中小企业约4割在用考勤系统" }], entrants: [] }, inputs, [])).toThrow(/没用日文/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/ai/jobs-china.test.ts`
Expected: FAIL,`parseJapanPlan is not a function`(或 `does not provide an export named`)。

- [ ] **Step 3: 写实现**

`lib/ai/jobs-china.ts` 顶部从 `./signals`、`provenance-shared`、`china-shared` 来的三处 import 换成(`ai-gateway` 和 `./shared` 那两行不动):

```ts
import { secondOption, verifiedBasis, type SearchSource } from "./signals";
import { numbersIn, quoteIn, unsupported } from "@/lib/domains/jobs/provenance-shared";
import {
  assertJapanese,
  assertNoHype,
  type ChinaCompany,
  type ChinaJapan,
  type ChinaPlan,
  type Holds,
  type JapanCondition,
  type JapanEntrant,
} from "@/lib/domains/jobs/china-shared";
```

`const SAME_ABOVE = 0.5;` 下面加:

```ts
const MAX_CONDITIONS = 5;
const MAX_ENTRANTS = 3;
const DEFAULT_HERE = "日本側の資料が見つかりませんでした。";
```

文件末尾追加:

```ts
// ---- 第 3 步：日本这边 -------------------------------------------------------------

const JAPAN_PLAN_PROMPT = `下面是在中国做某门生意的几家公司（附资料原文）。想知道：这门生意在中国做成靠的条件，日本有没有。
很多东西在日本没有，不是因为没人想到，而是它在中国做成靠的条件，日本不具备。
要特意找日本可能不具备的条件，不要只列对日本有利的。

列 3 到 ${MAX_CONDITIONS} 个条件，每个写：
- name：条件的短名字，日文（例：「スマホ決済の普及」「人件費の安さ」「規制で認められている」「中小企業がITにお金を払う習慣」）。
- there_ja：这一条在中国是什么情况，一句日文。不许写任何数字 —— 这句没有出处，面试官会当成事实。
- query_ja：查"日本现在这一条怎样"的日文搜索词，3 到 8 个词，具体，最好能搜到统计或调查。
再写 entrant_queries：两个搜索词，查"有没有中国的同行来过日本、结果怎样"：第一个日文（例："中国 勤怠管理 日本進出 撤退"），第二个中文（例："考勤 SaaS 出海 日本"）。

不写空话，不评价好坏，不写"有望""チャンス"这类词。

只输出 JSON：{"conditions":[{"name":"…","there_ja":"…","query_ja":"…"}],"entrant_queries":["…","…"]}`;

export type JapanPlan = {
  conditions: { name: string; there_ja: string; query_ja: string }[];
  entrant_queries: string[];
};

export function parseJapanPlan(value: unknown): JapanPlan {
  const v = (value ?? {}) as Record<string, unknown>;
  const conditions = (Array.isArray(v.conditions) ? v.conditions : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({ name: str(c.name, 30), there_ja: str(c.there_ja, 200), query_ja: str(c.query_ja, 120) }))
    .filter((c) => c.name && c.there_ja && c.query_ja)
    .slice(0, MAX_CONDITIONS);
  if (conditions.length < 2) throw new Error("条件不到两个");
  // 中国那边的说明没有出处，写了数字面试官会当成事实
  const withNumber = conditions.find((c) => numbersIn(c.there_ja).length > 0);
  if (withNumber) throw new Error(`中国那边的说明写了数字：${withNumber.there_ja.slice(0, 20)}`);
  assertJapanese(conditions.map((c) => c.there_ja));
  assertNoHype(conditions.flatMap((c) => [c.name, c.there_ja]));
  const entrant_queries = (Array.isArray(v.entrant_queries) ? v.entrant_queries : [])
    .map((q) => str(q, 80))
    .filter(Boolean)
    .slice(0, 2);
  return { conditions, entrant_queries };
}

/** 第 3 步前半：那边做成靠的条件、查日本用的日文搜索词、查中国同行来没来过的搜索词。 */
export async function planJapanConditions(
  userId: string,
  zhBusiness: string,
  companies: Pick<ChinaCompany, "name" | "excerpt">[]
): Promise<JapanPlan> {
  const contents = [`这门生意：${zhBusiness}`, ...companies.map((c) => `- ${c.name}：「${c.excerpt}」`)].join("\n");
  return executeAiJson(
    { userId, operation: "china_lens_japan_plan", module: "jobs", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验：there_ja 必须是日文、不许写数字，条件至少两个，不许有吹捧的词。" : ""),
      config: {
        systemInstruction: JAPAN_PLAN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 3000,
      },
    }),
    parseJapanPlan
  );
}

const JAPAN_JUDGE_PROMPT = `你在看一门在中国做成的生意，它靠的条件日本有没有。下面每个条件附了上网搜到的、关于日本现在情况的资料；最后附了"中国同行来没来过日本"的资料。

每个条件输出：
- i：编号。
- here_ja：日本现在这一条怎样，一句日文，只写资料里有的。
- holds："yes"（日本也有）/"no"（日本没有，要做先得解决它）/"unclear"（资料说不清）。
- basis：支撑 here_ja 的资料原文，逐字照抄（不翻译、不改字，15 到 150 字），附这个条件下面的资料编号 source。资料里没有就给空数组，holds 写 "unclear"。
here_ja 里的数字和英文词必须在 basis 的原文里。

再写 entrants：资料里写着的、来过日本的中国同行，最多 ${MAX_ENTRANTS} 件，每件
{"text_ja":"谁、什么时候、结果怎样（退出了、没做起来也照写），一句日文","basis":[{"source":资料编号,"excerpt":"逐字原文"}]}；
text_ja 里的数字必须在 basis 的原文里。没有就给空数组。

不要打分，不要下"值得做 / 不值得做""有机会"的结论。叙述用日文（basis 照抄原文）。

只输出 JSON：{"items":[{"i":0,"here_ja":"…","holds":"no","basis":[{"source":1,"excerpt":"…"}]}],"entrants":[]}`;

type ConditionInput = { condition: JapanPlan["conditions"][number]; sources: SearchSource[] };

/** 拿不出逐字对得上的原文，或者日文里的数字、英文词原文里没有，就不许说有没有（一律資料なし）；来过日本的同理，对不上就丢。 */
export function parseJapanJudgment(value: unknown, inputs: ConditionInput[], entrantSources: SearchSource[]): ChinaJapan {
  const v = (value ?? {}) as Record<string, unknown>;
  const items = Array.isArray(v.items) ? v.items : [];
  const conditions = inputs.map(({ condition, sources }, i): JapanCondition => {
    const it = items.find((r) => r && typeof r === "object" && Number((r as Record<string, unknown>).i) === i) as
      | Record<string, unknown>
      | undefined;
    const basis = verifiedBasis(it?.basis, sources);
    const here = str(it?.here_ja, 200);
    if (basis.length === 0 || !here || unsupported(here, basis.map((b) => b.excerpt).join("\n"))) {
      return { name: condition.name, there_ja: condition.there_ja, here_ja: DEFAULT_HERE, holds: "unclear", basis: [] };
    }
    const holds: Holds = it?.holds === "yes" || it?.holds === "no" ? it.holds : "unclear";
    return { name: condition.name, there_ja: condition.there_ja, here_ja: here, holds, basis };
  });
  const entrants: JapanEntrant[] = (Array.isArray(v.entrants) ? v.entrants : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ text_ja: str(e.text_ja, 200), basis: verifiedBasis(e.basis, entrantSources) }))
    .filter((e) => e.text_ja && e.basis.length > 0 && !unsupported(e.text_ja, e.basis.map((b) => b.excerpt).join("\n")))
    .slice(0, MAX_ENTRANTS);
  const texts = [...conditions.map((c) => c.here_ja), ...entrants.map((e) => e.text_ja)];
  assertJapanese(texts);
  assertNoHype(texts);
  return { conditions, entrants };
}

/** 第 3 步后半：拿日本的资料判每个条件有没有，再看中国同行来没来过。 */
export async function judgeJapanConditions(userId: string, inputs: ConditionInput[], entrantSources: SearchSource[]): Promise<ChinaJapan> {
  const block = (sources: SearchSource[]) =>
    sources.length > 0
      ? sources.map((s, j) => `  [资料 ${j + 1}] ${s.title}\n  ${s.url}\n  ${s.content.slice(0, 1000)}`).join("\n")
      : "  （没搜到资料）";
  const contents = [
    ...inputs.map(({ condition, sources }, i) => `【${i}】${condition.name}（中国那边：${condition.there_ja}）\n${block(sources)}`),
    `【中国同行来没来过日本】\n${block(entrantSources)}`,
  ].join("\n\n");
  return executeAiJson(
    { userId, operation: "china_lens_japan_judge", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验：叙述必须是日文（要有平假名），不许有吹捧的词；basis 逐字照抄那个条件下面资料的原文，source 是资料编号。"
          : ""),
      config: {
        systemInstruction: JAPAN_JUDGE_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseJapanJudgment(value, inputs, entrantSources)
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/ai/jobs-china.test.ts`
Expected: PASS(19 个 it 全过)。

Run: `npx tsc --noEmit`
Expected: 没有输出。

- [ ] **Step 5: 提交**

```powershell
git add lib/ai/jobs-china.ts lib/ai/jobs-china.test.ts
git commit -m @'
feat(jobs): 面试演示 AI 第 3 步——那边做成靠的条件（中国那边不许写数字）、日本有没有（原文核对，没原文一律資料なし）、中国同行来没来过日本

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: 流程与数据库

**Files:**
- Create: `lib/domains/jobs/china.ts`

- [ ] **Step 1: 写实现**

`lib/domains/jobs/china.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase";
import { webSearch } from "@/lib/web-search";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import {
  extractChinaCompanies,
  judgeJapanConditions,
  judgeSameBusiness,
  planChinaQueries,
  planJapanConditions,
  type SearchSource,
} from "@/lib/ai";
import {
  cleanBusiness,
  nextChinaStep,
  STEP_LABELS,
  type ChinaCompanies,
  type ChinaCompany,
  type ChinaJapan,
  type ChinaPlan,
  type ChinaRun,
  type ChinaRunStatus,
  type ChinaRunSummary,
} from "./china-shared";

/**
 * 面试演示「御社の商売、中国ではどうなっている？」：三步，每步一个请求（Vercel 一个请求最多 60 秒，整个流程要一分钟多）。
 * 每步做完存进 job_china_runs，下一步从数据库读上一步的结果，不信浏览器传回来的东西。
 */

export const MISSING_CHINA_MIGRATION =
  "还差一步：迁移 080 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/080_job_china_runs.sql 之后再来。";

const COMPANY_RESULTS = 6;
const CONDITION_RESULTS = 3;
const ENTRANT_RESULTS = 4;
const HISTORY = 20;

function isMissingTable(message: string): boolean {
  return /job_china_runs/.test(message);
}

function dedupeByUrl(results: SearchSource[][]): SearchSource[] {
  const seen = new Set<string>();
  return results.flat().filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/** 第 2 步：中文搜 → 挑公司（原文核对）→ 另一个模型判是不是同一门生意。 */
export async function findChinaCompanies(userId: string, plan: ChinaPlan): Promise<ChinaCompanies> {
  const sources = dedupeByUrl(await Promise.all(plan.queries.map((q) => webSearch(q, COMPANY_RESULTS).catch(() => []))));
  if (sources.length === 0) return { companies: [], read: 0 };
  const found = await extractChinaCompanies(userId, plan.zh_business, sources);
  const verdict = await judgeSameBusiness(plan.zh_business, found);
  const companies: ChinaCompany[] = verdict.ok
    ? found.filter((_, i) => verdict.same[i]).map((c) => ({ ...c, same: true }))
    : found.map((c) => ({ ...c, same: null }));
  return { companies, read: sources.length };
}

/** 第 3 步：那边做成靠的条件 → 日文搜日本现在怎样 → 判有没有（日本原文核对）；顺带查中国同行来没来过日本。 */
export async function checkJapan(userId: string, plan: ChinaPlan, companies: ChinaCompany[]): Promise<ChinaJapan> {
  const jp = await planJapanConditions(userId, plan.zh_business, companies);
  const [conditionSources, entrantResults] = await Promise.all([
    Promise.all(jp.conditions.map((c) => webSearch(c.query_ja, CONDITION_RESULTS).catch(() => []))),
    Promise.all(jp.entrant_queries.map((q) => webSearch(q, ENTRANT_RESULTS).catch(() => []))),
  ]);
  return judgeJapanConditions(
    userId,
    jp.conditions.map((condition, i) => ({ condition, sources: conditionSources[i] })),
    dedupeByUrl(entrantResults)
  );
}

function toRun(row: Record<string, unknown>): ChinaRun {
  return {
    id: row.id as string,
    business: row.business as string,
    status: row.status as ChinaRunStatus,
    plan: (row.plan as ChinaPlan | null) ?? null,
    companies: (row.companies as ChinaCompanies | null) ?? null,
    japan: (row.japan as ChinaJapan | null) ?? null,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

async function save(userId: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("job_china_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** 新开一次：先写搜索词（第 1 步），再存一行。返回这一次的 id。 */
export async function startChinaRun(userId: string, input: string): Promise<string> {
  const business = cleanBusiness(input);
  // 表还没建就别先花一次 AI
  const probe = await supabaseAdmin.from("job_china_runs").select("id").limit(1);
  if (probe.error) throw new Error(isMissingTable(probe.error.message) ? MISSING_CHINA_MIGRATION : probe.error.message);
  const plan = await planChinaQueries(userId, business);
  const { data, error } = await supabaseAdmin
    .from("job_china_runs")
    .insert({ user_id: userId, business, plan, status: "planned" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function getChinaRun(userId: string, id: string): Promise<ChinaRun | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("job_china_runs").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return data ? toRun(data) : null;
}

/** 最近 20 次（列在 /jobs 上，不列在演示页上：面试官会看到他还查过别家）。 */
export async function listChinaRuns(userId: string): Promise<ChinaRunSummary[] | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("job_china_runs")
    .select("id, business, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  if (error) {
    if (isMissingTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    business: r.business as string,
    status: r.status as ChinaRunStatus,
    created_at: r.created_at as string,
  }));
}

/** 接着跑下一步，存好，返回新的状态。失败时把"哪一步：为什么"存进 error，再抛出去。 */
export async function advanceChinaRun(userId: string, id: string): Promise<ChinaRunStatus> {
  const run = await getChinaRun(userId, id);
  if (run === "missing-schema") throw new Error(MISSING_CHINA_MIGRATION);
  if (!run) throw new Error("この記録は見つかりませんでした。");
  const step = nextChinaStep(run);
  if (!step) return run.status;
  try {
    const { plan, companies } = run;
    let patch: { status: ChinaRunStatus } & Record<string, unknown>;
    if (step === "plan" || !plan) {
      patch = { plan: await planChinaQueries(userId, run.business), status: "planned" };
    } else if (step === "companies" || !companies) {
      const found = await findChinaCompanies(userId, plan);
      patch = { companies: found, status: found.companies.length > 0 ? "companies" : "none_found" };
    } else {
      patch = { japan: await checkJapan(userId, plan, companies.companies), status: "done" };
    }
    await save(userId, id, { ...patch, error: null });
    return patch.status;
  } catch (e) {
    const message = e instanceof AiGatewayError ? humanAiErrorMessage(e.code) : e instanceof Error ? e.message : "うまくいきませんでした";
    await save(userId, id, { status: "failed", error: `${STEP_LABELS[step]}：${message.slice(0, 200)}` });
    throw e;
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

- [ ] **Step 3: 提交**

```powershell
git add lib/domains/jobs/china.ts
git commit -m @'
feat(jobs): 面试演示的流程与数据库——三步各存一次，失败记哪一步，下一步按哪几列是空的接着跑

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 7: 先试——三门生意跑一遍(脚本不进仓库)

这一步决定后面的页面值不值得做。不用迁移 080(不碰 `job_china_runs`)。

**Files:**
- Create(用完删,不提交): `scripts/china-try.ts`

- [ ] **Step 1: 写试跑脚本**

`scripts/china-try.ts`:

```ts
/** 试跑面试演示的三步（不存数据库）：看每门生意留下几家、几条条件有原文、每步几秒。用完删掉，不进仓库。 */
import { planChinaQueries } from "@/lib/ai";
import { checkJapan, findChinaCompanies } from "@/lib/domains/jobs/china";
import { HOLDS_LABELS } from "@/lib/domains/jobs/china-shared";
import { listJobProfileUsers } from "@/lib/domains/jobs/profile";
import { patchDns } from "./dns-patch";

const BUSINESSES = ["中小企業向けの勤怠管理SaaS", "地方の工務店", "中古ブランド品の買取"];

const seconds = (since: number) => Math.round((Date.now() - since) / 1000);

async function main(): Promise<void> {
  patchDns();
  const [userId] = await listJobProfileUsers();
  if (!userId) throw new Error("没有 job_profiles 的用户");
  for (const business of BUSINESSES) {
    let t = Date.now();
    const plan = await planChinaQueries(userId, business);
    console.log(`\n■ ${business}\n  第 1 步 ${seconds(t)} 秒：${plan.zh_business}｜${plan.queries.join(" / ")}`);

    t = Date.now();
    const found = await findChinaCompanies(userId, plan);
    console.log(`  第 2 步 ${seconds(t)} 秒：读了 ${found.read} 篇，留下 ${found.companies.length} 家`);
    for (const c of found.companies) {
      console.log(`    - ${c.name}（裁判：${c.same === null ? "没调通" : "是"}）${c.what_ja}\n      「${c.excerpt}」\n      ${c.excerpt_ja}\n      ${c.url}`);
    }
    if (found.companies.length === 0) continue;

    t = Date.now();
    const japan = await checkJapan(userId, plan, found.companies);
    const sourced = japan.conditions.filter((c) => c.basis.length > 0).length;
    console.log(`  第 3 步 ${seconds(t)} 秒：条件 ${japan.conditions.length} 条，有原文 ${sourced} 条；来过日本 ${japan.entrants.length} 件`);
    for (const c of japan.conditions) console.log(`    - [${HOLDS_LABELS[c.holds]}] ${c.name}：${c.here_ja}`);
    for (const e of japan.entrants) console.log(`    - 来过：${e.text_ja}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 2: 跑**

Run: `npx tsx --env-file=.env.local scripts/china-try.ts`(要两三分钟)

过关标准(三条都要):
1. 三门生意里至少两门留下 ≥2 家公司;
2. 第 2 步、第 3 步每步 ≤45 秒(60 秒的请求上限留余量);
3. 条件里至少有一半带日本原文。

- [ ] **Step 3: 没过关时先调,再往下做**

按卡在哪调(改完重跑 Step 2):
- 留下的公司少、`read` 也少(中国网页读不到):`lib/domains/jobs/china.ts` 的 `COMPANY_RESULTS` 6 → 8;
- `read` 不少但公司少:看是哪条核对丢的(临时在 `parseChinaCompanies` 里 `console.log` 丢的原因,调完删掉),多半是公司名不在原文里或原文不逐字,改 `companiesPrompt` 的说法;
- 第 2 步超 45 秒:`COMPANY_RESULTS` 降到 5,或 `PLAN_PROMPT` 改成只要 2 个搜索词;
- 条件原文少:改 `JAPAN_PLAN_PROMPT` 里 query_ja 的写法要求("带「調査」「割合」「統計」")。

调过的话把改动单独提交(提交信息写清改了什么、为什么,附试跑的数字)。

- [ ] **Step 4: 删掉试跑脚本,把三门生意的结果(数字)讲给他听**

```bash
rm scripts/china-try.ts
git status --short
```

Expected: `scripts/china-try.ts` 不在列表里(没提交过,删掉即可)。

---

### Task 8: 无壳布局 + 输入页 + server actions

**Files:**
- Create: `app/(present)/layout.tsx`
- Create: `app/(present)/demo/china/actions.ts`
- Create: `app/(present)/demo/china/start-form.tsx`
- Create: `app/(present)/demo/china/page.tsx`

- [ ] **Step 1: 无壳布局**

`app/(present)/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "御社の商売、中国ではどうなっている？",
  robots: { index: false, follow: false },
};

/**
 * 面试时共享屏幕给对方看的页面：不挂导航壳（侧边栏里是他私人的东西），界面是日文。
 * 根布局的 <html lang> 是 zh-CN，这里包一层 lang="ja"，汉字才会用日文字形显示（中文原文另标 zh-CN）。
 */
export default function PresentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="ja" className="min-h-screen bg-background py-10">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: server actions**

`app/(present)/demo/china/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import { advanceChinaRun, startChinaRun } from "@/lib/domains/jobs/china";
import type { ChinaRunStatus } from "@/lib/domains/jobs/china-shared";

type Fail = { ok: false; message: string };
type Result<T extends object = object> = ({ ok: true } & T) | Fail;

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function errorMessage(error: unknown): string {
  if (error instanceof AiGatewayError) return humanAiErrorMessage(error.code);
  return error instanceof Error ? error.message : "うまくいきませんでした";
}

/** 新开一次：写好搜索词、存一行，返回 id（页面跳到结果页，在那里接着跑）。 */
export async function startChinaRunAction(business: string): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  try {
    return { ok: true, id: await startChinaRun(userId, business) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/** 接着跑下一步（一步一个请求）。 */
export async function advanceChinaRunAction(id: string): Promise<Result<{ status: ChinaRunStatus }>> {
  const userId = await requireUserId();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "この記録は見つかりませんでした。" };
  try {
    return { ok: true, status: await advanceChinaRun(userId, id) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}
```

- [ ] **Step 3: 输入框**

`app/(present)/demo/china/start-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startChinaRunAction } from "./actions";

export function StartForm() {
  const router = useRouter();
  const [business, setBusiness] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await startChinaRunAction(business);
      if (!r.ok) setError(r.message);
      else router.push(`/demo/china/${r.id}`);
    });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Label htmlFor="business">御社の商売をひとことで</Label>
      <Input
        id="business"
        value={business}
        onChange={(e) => setBusiness(e.target.value)}
        placeholder="例：中小企業向けの勤怠管理SaaS"
        maxLength={100}
      />
      <Button type="submit" disabled={pending || business.trim().length === 0}>
        {pending ? "中国語の検索語を考えています…" : "中国で調べる"}
      </Button>
      {error && <p className="text-sm leading-7 text-muted-foreground">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: 输入页**

`app/(present)/demo/china/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { StartForm } from "./start-form";

export const dynamic = "force-dynamic";
// 新开一次时在 server action 里先写搜索词（几秒到十几秒）
export const maxDuration = 60;

/** 只有输入框；跑过的记录列在 /jobs（这一页会共享给面试官看）。 */
export default async function ChinaLensPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  return (
    <PageContainer>
      <p className="mb-6 text-right text-xs">
        <Link href="/jobs" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          戻る
        </Link>
      </p>
      <PageHeader
        eyebrow="Demo"
        title="御社の商売、中国ではどうなっている？"
        description="御社の商売をひとことで書くと、中国で同じ商売をしている会社を中国語で探して、原文と訳を並べます。そのあと、中国でうまくいった条件が日本にもあるかを、日本の資料で確かめます。"
      />
      <StartForm />
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

```powershell
git add "app/(present)"
git commit -m @'
feat(jobs): 面试演示的无壳布局（lang=ja）、输入页与 server actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 9: 结果页 + 接着跑下一步

**Files:**
- Create: `app/(present)/demo/china/[id]/run-panel.tsx`
- Create: `app/(present)/demo/china/[id]/result-view.tsx`
- Create: `app/(present)/demo/china/[id]/page.tsx`

- [ ] **Step 1: 接着跑的面板**

`app/(present)/demo/china/[id]/run-panel.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STEP_LABELS, type ChinaRunStatus, type ChinaStep } from "@/lib/domains/jobs/china-shared";
import { advanceChinaRunAction } from "../actions";

const RUNNING_TEXT: Record<ChinaStep, string> = {
  plan: "中国語の検索語を考えています…",
  companies: "中国語で検索して、見つかったページを読んでいます…（30秒ほど）",
  japan: "日本でも同じ条件がそろっているか、日本の資料で調べています…（30秒ほど）",
};

/**
 * 还有没跑的步骤就接着跑（一步一个请求）；跑完一步刷新页面显示结果，新的状态再触发下一步。
 * 停在半路的不自动重跑，等他点「もう一度」（从停下的那一步接着跑）。
 */
export function RunPanel({ id, status, step, error }: { id: string; status: ChinaRunStatus; step: ChinaStep | null; error: string | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const run = async () => {
    setRunning(true);
    setMessage(null);
    const r = await advanceChinaRunAction(id);
    setRunning(false);
    if (!r.ok) setMessage(r.message);
    router.refresh();
  };

  useEffect(() => {
    const key = `${status}:${step}`;
    if (!step || status === "failed" || started.current === key) return;
    started.current = key;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, step]);

  if (!step) return null;
  const stopped = !running && (status === "failed" || message !== null);
  return (
    <div className="text-sm leading-7 text-muted-foreground">
      {stopped ? (
        <>
          <p>途中で止まりました（{STEP_LABELS[step]}）。もう一度押すと、止まったところから続けます。</p>
          {(message ?? error) && <p className="text-xs">{message ?? error}</p>}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void run()}>
            もう一度
          </Button>
        </>
      ) : (
        <p>{RUNNING_TEXT[step]}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 结果**

`app/(present)/demo/china/[id]/result-view.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { HOLDS_LABELS, quoteLang, type ChinaRun, type Holds, type SourcedQuote } from "@/lib/domains/jobs/china-shared";

const HOLDS_VARIANT: Record<Holds, "secondary" | "outline" | "muted"> = { yes: "secondary", no: "outline", unclear: "muted" };

function Quote({ quote }: { quote: SourcedQuote }) {
  return (
    <div className="text-sm leading-7">
      <blockquote lang={quoteLang(quote.excerpt)} className="border-l-2 border-border pl-3">
        {quote.excerpt}
      </blockquote>
      <a
        href={quote.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
      >
        {quote.title || quote.url}
      </a>
    </div>
  );
}

/** 三块结果：中国的公司、条件日本有没有、中国同行来没来过。没跑到的那块不显示。不打分、不下结论。 */
export function ResultView({ run }: { run: ChinaRun }) {
  const found = run.companies;
  const japan = run.japan;
  return (
    <div className="space-y-10">
      {found && (
        <section>
          <h2 className="text-base font-semibold">中国で同じ商売をしている会社</h2>
          {found.companies.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              見つかりませんでした（読んだページ {found.read} 件）。もう少し具体的に書くと（誰に・何を売っているか）、見つかることがあります。
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {found.companies.map((c) => (
                <div key={`${c.url}-${c.name}`} className="rounded-lg border border-border p-4">
                  <p className="font-medium" lang={quoteLang(c.name)}>
                    {c.name}
                  </p>
                  <p className="mt-1 text-sm leading-7">{c.what_ja}</p>
                  <p className="mt-3 text-xs text-muted-foreground">原文（このページにそのまま載っていることを確認済み）</p>
                  <Quote quote={{ url: c.url, title: c.title, excerpt: c.excerpt }} />
                  <p className="mt-3 text-xs text-muted-foreground">AI訳</p>
                  <p className="text-sm leading-7">{c.excerpt_ja}</p>
                  <div className="mt-3">
                    <Badge variant={c.same ? "secondary" : "muted"}>
                      {c.same ? "同じ商売かどうか、別のAIでも確認済み" : "別のAIの確認はまだ"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {japan && (
        <section>
          <h2 className="text-base font-semibold">中国でうまくいった条件は、日本にもあるか</h2>
          <div className="mt-4 space-y-4">
            {japan.conditions.map((c, i) => (
              <div key={i} className="rounded-lg border border-border p-4 text-sm leading-7">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{c.name}</p>
                  <Badge variant={HOLDS_VARIANT[c.holds]}>{HOLDS_LABELS[c.holds]}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">中国では（AIの説明・出典なし）</p>
                <p>{c.there_ja}</p>
                <p className="mt-2 text-xs text-muted-foreground">日本では</p>
                <p>{c.here_ja}</p>
                {c.basis.map((b) => (
                  <div key={`${b.url}-${b.excerpt}`} className="mt-2">
                    <Quote quote={b} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {japan && (
        <section>
          <h2 className="text-base font-semibold">中国の同業は日本に来たか</h2>
          {japan.entrants.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">見つかった資料の中には出てきませんでした。来ていないとは限りません。</p>
          ) : (
            <div className="mt-4 space-y-4">
              {japan.entrants.map((e, i) => (
                <div key={i} className="rounded-lg border border-border p-4 text-sm leading-7">
                  <p>{e.text_ja}</p>
                  {e.basis.map((b) => (
                    <div key={`${b.url}-${b.excerpt}`} className="mt-2">
                      <Quote quote={b} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 结果页**

`app/(present)/demo/china/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getChinaRun, MISSING_CHINA_MIGRATION } from "@/lib/domains/jobs/china";
import { nextChinaStep } from "@/lib/domains/jobs/china-shared";
import { ResultView } from "./result-view";
import { RunPanel } from "./run-panel";

export const dynamic = "force-dynamic";
// 第 2、3 步在这一页的 server action 里跑，各要三四十秒
export const maxDuration = 60;

export default async function ChinaRunPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const run = await getChinaRun(user.id, params.id);
  if (run === "missing-schema") {
    return (
      <PageContainer>
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_CHINA_MIGRATION}</p>
      </PageContainer>
    );
  }
  if (!run) notFound();

  return (
    <PageContainer>
      <p className="mb-6 text-right text-xs">
        <Link href="/demo/china" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          別の商売で調べる
        </Link>
      </p>
      <PageHeader
        eyebrow="Demo"
        title={run.business}
        description={
          run.plan ? (
            <>
              中国での呼び方：<span lang="zh-CN">{run.plan.zh_business}</span>
              <br />
              中国語の検索語：<span lang="zh-CN">{run.plan.queries.join(" ／ ")}</span>
            </>
          ) : undefined
        }
      />
      <div className="space-y-10">
        <RunPanel id={run.id} status={run.status} step={nextChinaStep(run)} error={run.error} />
        <ResultView run={run} />
        <p className="text-xs leading-6 text-muted-foreground">
          検索で見つかったページだけを読んでいます。読めなかったページの会社は出てきません。同じ言葉で調べても、毎回少し結果が変わります。良し悪しの判断はしていません。
        </p>
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 4: 检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 5: 提交**

```powershell
git add "app/(present)/demo/china/[id]"
git commit -m @'
feat(jobs): 面试演示的结果页——按状态一步步接着跑，停在半路给「もう一度」；原文标 lang，页脚写明只读了搜到的页面

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 10: `/jobs` 入口与记录;CLAUDE.md

**Files:**
- Modify: `app/(app)/jobs/page.tsx`
- Modify: `CLAUDE.md`(jobs 那一行;Schema 段)

- [ ] **Step 1: `/jobs` 加 import**

`app/(app)/jobs/page.tsx` 的 import 区加两行(放在 `listPostings` 那行附近):

```ts
import { listChinaRuns, MISSING_CHINA_MIGRATION } from "@/lib/domains/jobs/china";
import { RUN_STATUS_LABELS } from "@/lib/domains/jobs/china-shared";
```

- [ ] **Step 2: 一起取记录**

把

```ts
  const [{ picked, candidates }, apps, entries] = await Promise.all([
    listPostings(user.id),
    listMarketApps(user.id),
    listCareerEntries(user.id),
  ]);
```

改成

```ts
  const [{ picked, candidates }, apps, entries, chinaRuns] = await Promise.all([
    listPostings(user.id),
    listMarketApps(user.id),
    listCareerEntries(user.id),
    listChinaRuns(user.id),
  ]);
```

- [ ] **Step 3: 加一节**(放在「你在看的岗位」那个 `<section>` 后面、`</div>` 之前)

```tsx
          <section>
            <h2 className="text-base font-semibold">面试时给对方当场用</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              面试官说一句他们做什么生意，当场用中文查中国做同样生意的公司，原文、日文翻译、出处摆在一起。页面是日文、没有侧边栏，可以直接共享屏幕。面试前一晚先拿那家的生意跑一次，现场跑不出来就打开那次的。
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/demo/china">打开「御社の商売、中国ではどうなっている？」</Link>
            </Button>
            {chinaRuns === "missing-schema" ? (
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{MISSING_CHINA_MIGRATION}</p>
            ) : (
              chinaRuns.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {chinaRuns.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm leading-7">
                      <span className="font-mono text-xs text-muted-foreground">{tokyoDate(new Date(r.created_at))}</span>
                      <Link href={`/demo/china/${r.id}`} className="underline-offset-4 hover:underline">
                        {r.business}
                      </Link>
                      <Badge variant="muted">{RUN_STATUS_LABELS[r.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
```

(`tokyoDate`、`Badge`、`Button`、`Link` 这一页已经 import 过。)

- [ ] **Step 4: CLAUDE.md 的 jobs 那一行**

在 jobs 那一行里,把

```
规则在 `fill-shared.ts`;收发邮件是下一块 |
```

换成

```
规则在 `fill-shared.ts`;**面试演示「御社の商売、中国ではどうなっている？」**(/demo/china,无导航壳、界面日文、要登录、只有他操作;迁移 080 job_china_runs):面试官说一句生意 → 中文搜索中国同行(原文逐字核对、公司名必须在原文或标题里、日译的数字和英文词必须在原文里、Jev 判是不是同一门生意,判"不是"的丢掉、裁判没调通照留并标出)→ 那边做成靠的条件日本有没有(要特意找日本不具备的;日本资料原文核对,没原文一律資料なし;中国那边的说明没有出处、不许写数字)→ 中国同行来没来过日本(含退出);三步各一个请求、各存一次;不打分不下结论;跑过的记录只列在 /jobs(演示页会共享给面试官);收发邮件是下一块 |
```

- [ ] **Step 5: CLAUDE.md 的 Schema 段**

在 `job_postings.fill_status / fill_requested_at / fill_note(迁移 079)...` 那一段的最后一行(`只在 lib/domains/jobs/fill.ts 单独读写,不进岗位的列表查询(079 没跑时岗位其他功能照常)。`)后面加:

```
  job_china_runs(迁移 080):面试演示每一次的三步结果(plan / companies / japan 各一列 jsonb),status planned → companies → done,
  一家都没找到 none_found,失败 failed(哪一步按哪几列是空的认);只在 lib/domains/jobs/china.ts 读写。
```

- [ ] **Step 6: 检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 7: 提交**

```powershell
git add "app/(app)/jobs/page.tsx" CLAUDE.md
git commit -m @'
feat(jobs): /jobs 加面试演示的入口和跑过的记录；宪法写进面试演示

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 11: 全部验证

- [ ] **Step 1: 三项检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

Run: `npm test`
Expected: 全部通过(偶尔 materials `domain.test.ts` 冷启动超时,重跑一次就过;别的失败要查)。

- [ ] **Step 2: 交给他**

告诉他:
1. 在 Supabase 的 SQL Editor 里跑 `supabase/migrations/080_job_china_runs.sql`;
2. 登录后打开 `/jobs` 最下面的「面试时给对方当场用」→ 拿第 7 步试过的一门生意跑一次;
3. 看完决定要不要把 `feat/china-lens` 合回 main(不 push)。

浏览器验证要登录,测试账号密码不在项目文件里,所以这一步由他自己在浏览器里点;他登录后可以在内置浏览器里一起看。

---

## 自查(写计划时做过)

- 设计里的每一条都有任务:三步(4、5、6)、原文/公司名/数字核对(4、5)、Jev(4)、中国那边不许数字(5)、无壳日文页(8)、结果页与「もう一度」(9)、记录在 /jobs(10)、迁移(1)、宪法(10)、先试(7)、页脚说明(9)。
- 类型名前后一致:`ChinaPlan` / `ChinaCompany` / `ChinaCompanies` / `JapanCondition` / `JapanEntrant` / `ChinaJapan` / `ChinaRun` / `ChinaRunSummary` / `ChinaStep` / `FoundCompany` / `JapanPlan`;函数 `planChinaQueries` / `extractChinaCompanies` / `judgeSameBusiness` / `planJapanConditions` / `judgeJapanConditions` / `findChinaCompanies` / `checkJapan` / `startChinaRun` / `getChinaRun` / `listChinaRuns` / `advanceChinaRun`。
