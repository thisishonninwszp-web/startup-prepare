# 外部信号质量第一步:去掉空话 + 「一条讲透」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 报告条目收尾的空话由代码删掉(删掉的留着查);每条差距有一页「一条讲透」,把八样料放在一起、缺的按顺序补;周刊每条带上这些料。

**Architecture:** 去空话是一个纯函数(`lib/domains/signals/filler.ts`),生成报告时删一遍、读报告和差距清单时再删一遍。
「一条讲透」:核对规则和类型在 `deep-shared.ts`(纯函数),AI 提示词在新文件 `lib/ai/signals-deep.ts`,
数据库和「那边查一查」在 `deep.ts`,页面拼料在 `deep-page.ts`(它要读周刊,周刊又要读 `deep.ts`,分开免得互相引用),
页面在 `app/(app)/signals/gaps/deep/`。周刊的 `buildPick` 多带四样料,AI 写的十以上的数字必须在料里。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase(service role)、Gemini(`executeAiJson`)、`webSearch`、vitest。

设计见 `docs/superpowers/specs/2026-10-17-signals-depth-design.md`。在分支 `feat/signals-depth` 上做,每个任务本地提交,不 push。
验证:`npx tsc --noEmit`、`npm run lint`、`npm test`;dev server 开着时不 `npm run build`。提交信息用「」不用 ASCII 双引号。
CRLF 的文件(`CLAUDE.md`、`supabase/schema.sql`、`app/(app)/signals/actions.ts` 等)用 Edit 工具改会保留换行;追加大段时用 Python 按字节写、换成 `\r\n`。

## 写计划时定下的(设计文档里没写到的)

- **去空话的函数放 `lib/domains/signals/filler.ts`**(纯函数),不放 `lib/ai/signals.ts`:报告、差距清单、核对「那边查一查」的事实都要用,领域层和 lib/ai 都能引它。
- **「那边查一查」的提示词放新文件 `lib/ai/signals-deep.ts`**(signals.ts 已经 4800 多行),经 `lib/ai/index.ts` 桶导出;要用的 `assertNoBanned` 从 signals.ts 导出。
- **数字核对只核阿拉伯数字**(全角也认,`numbersIn` 复用 `lib/domains/jobs/provenance-shared.ts`);「两成」这种汉字数字不核,提示词要求照抄原文的阿拉伯数字。
- **周刊的数字核对只查大于 10 的**(和练 case 同一个规矩):「三个条件」「第 1 条」是计数。
- **表的主键用 (user_id, signal_id, side)**,和 067 `signal_gap_transfers` 一样,不另加 id。
- **差距(JapanGap)加 `basis`**:报告里核对过的原文依据,① 里显示。
- **官报对名单**用「中国那边的名字原样出现在这条文字里」(`mentionedNames`),两个字以下的名字不认。
- **浏览器验证**:页面要登录,测试账号的密码不在项目文件里,不代登录。验证靠 tsc/lint/test + 干跑脚本;迁移 083 跑完后请他自己打开一条看。

| # | 做什么 | 文件 | 测 |
|---|---|---|---|
| 0 | 开分支 | — | — |
| 1 | 去空话的规则 | `lib/domains/signals/filler.ts`、`brief.ts`(类型) | filler.test |
| 2 | 生成时删 + 提示词 | `lib/domains/signals/brief.ts`、`lib/ai/signals.ts` | 全部测试 |
| 3 | 显示时删 + 干跑看删了什么 | `app/(app)/signals/queries.ts`、`lib/domains/signals/gaps.ts` | 干跑脚本 |
| 4 | 信息源体检「删了几句」 | `filler.ts`、`source-health.ts`、`sources/page.tsx` | filler.test |
| 5 | 迁移 083 | `supabase/migrations/083_signal_gap_deep.sql`、`supabase/schema.sql` | — |
| 6 | 一条讲透的类型和核对规则 | `lib/domains/signals/deep-shared.ts` | deep-shared.test |
| 7 | 那边查一查的提示词 | `lib/ai/signals-deep.ts`、`lib/ai/signals.ts`、`lib/ai/index.ts` | signals-deep.test |
| 8 | 数据库、那边查一查、官报、拼料 | `kanpo-shared.ts`(`noticeSummary`)、`deep.ts`、`deep-page.ts`、`gaps-shared.ts`(basis) | kanpo-shared.test、tsc |
| 9 | server actions | `app/(app)/signals/actions.ts` | tsc |
| 10 | 一条讲透页 | `app/(app)/signals/gaps/deep/*`、`issue/option-row.tsx` | tsc/lint |
| 11 | 入口 | `gaps/page.tsx`、`issue/issue-composer.tsx` | tsc/lint |
| 12 | 周刊:材料和数字核对 | `lib/ai/signals.ts` | signals.test |
| 13 | 周刊:带上料、从一条讲透跳过来 | `issue-shared.ts`、`issue.ts`、`issue/page.tsx`、`issue-composer.tsx` | tsc |
| 14 | 宪法、设计文档、全部验证 | `CLAUDE.md`、spec | 全部 |

---

### Task 0: 开分支

- [ ] **Step 1:** 

```bash
git checkout -b feat/signals-depth
```

---

### Task 1: 去空话的规则

**Files:**
- Create: `lib/domains/signals/filler.ts`
- Create: `lib/domains/signals/filler.test.ts`
- Modify: `lib/domains/signals/brief.ts`(`BriefItem` 加 `dropped`)

- [ ] **Step 1: `BriefItem` 加一个字段**

`lib/domains/signals/brief.ts`,在 `BriefItem` 的 `related_question?: …;` 那一行后面加:

```ts
  /** 代码删掉的空话（「这表明……」「，这意味着……」），留着在信息源体检页查删得对不对。早期数据没有。 */
  dropped?: string[];
```

- [ ] **Step 2: 写测试**

`lib/domains/signals/filler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BriefItem } from "./brief";
import { cleanBriefItem, dropEmptyConclusions, isCommentSentence } from "./filler";

describe("去掉只给前面下结论的空话", () => {
  it("整句只是在评论上一句：删掉", () => {
    const r = dropEmptyConclusions("个人信息保护委员会要求各企业检查。这表明日本政府高度重视个人信息保护问题，并敦促各企业加强防范。");
    expect(r.text).toBe("个人信息保护委员会要求各企业检查。");
    expect(r.dropped).toEqual(["这表明日本政府高度重视个人信息保护问题，并敦促各企业加强防范。"]);
  });

  it("前半句是事实、后半句「，这意味着……」：只删后半句", () => {
    const r = dropEmptyConclusions("调查还显示，不到两成的令牌支出能证明与量化财务成果相关联，这意味着许多AI投资未能带来明确的业务效益。");
    expect(r.text).toBe("调查还显示，不到两成的令牌支出能证明与量化财务成果相关联。");
    expect(r.dropped).toEqual(["这意味着许多AI投资未能带来明确的业务效益"]);
  });

  it("「，并凸显了……」「，并预示了……」也删", () => {
    expect(dropEmptyConclusions("虽然信用卡信息未受影响，但大规模的个人信息泄露仍可能损害用户信任，并凸显了移动应用平台的数据安全风险。").text).toBe(
      "虽然信用卡信息未受影响，但大规模的个人信息泄露仍可能损害用户信任。"
    );
    expect(dropEmptyConclusions("这满足了消费者对便捷茶饮的需求，并预示了O2O服务的整合趋势。").text).toBe("这满足了消费者对便捷茶饮的需求。");
  });

  it("「这些事件共同说明了」「这一变化标志着」「此举意味着」「这也反映了」都算", () => {
    for (const s of ["这些事件共同说明了行业结构正在快速变化。", "这一变化标志着货币政策进入新阶段。", "此举意味着竞争加剧。", "这也反映了 Rust 的影响力。"]) {
      expect(isCommentSentence(s)).toBe(true);
    }
  });

  it("句子里有具体的人和事的不动：宁可漏删，不删事实", () => {
    const kept = [
      "这种国际趋势可能会影响日本央行（BOJ）的货币政策，促使日本银行调整利率，例如瑞穗银行已开始上调其储蓄存款利率。",
      "植田总裁在会上，表明了继续加息的态度。",
      "丰田公布财报，并表明将增加投资。",
      "这家公司表明将在明年上市。",
    ];
    for (const s of kept) expect(dropEmptyConclusions(s)).toEqual({ text: s, dropped: [] });
  });

  it("全是空话就原样返回（交给上游）；删过的再跑一遍不变", () => {
    expect(dropEmptyConclusions("这表明行业在变。")).toEqual({ text: "这表明行业在变。", dropped: [] });
    const once = dropEmptyConclusions("日银加息到 0.75%。这表明货币政策进入新阶段。").text;
    expect(dropEmptyConclusions(once)).toEqual({ text: once, dropped: [] });
  });
});

describe("一条报告条目", () => {
  const item = {
    signal_id: "s",
    title: "t",
    url: null,
    source: "x",
    headline: "h",
    background: "日银加息到 0.75%。这表明货币政策进入新阶段。",
    for_you: "地方银行要重算贷款利率，这意味着中小企业利息变重。",
    precedent: "DiDi Food 在日本撤退过，这也反映出外卖难做。",
  } as BriefItem;

  it("背景、主要影响谁、先例都删一遍，删掉的记在 dropped", () => {
    const c = cleanBriefItem(item);
    expect(c.background).toBe("日银加息到 0.75%。");
    expect(c.for_you).toBe("地方银行要重算贷款利率。");
    expect(c.precedent).toBe("DiDi Food 在日本撤退过。");
    expect(c.dropped).toEqual(["这表明货币政策进入新阶段。", "这意味着中小企业利息变重", "这也反映出外卖难做"]);
  });

  it("再删一遍不变（存下的 dropped 留着，不重复）", () => {
    const c = cleanBriefItem(item);
    expect(cleanBriefItem(c)).toEqual(c);
  });

  it("「也值得一看」那几条原样返回", () => {
    const extra = { ...item, extra: true, background: "", for_you: "" };
    expect(cleanBriefItem(extra)).toBe(extra);
  });
});
```

- [ ] **Step 3: 跑一下,确认失败**

Run: `npx vitest run lib/domains/signals/filler.test.ts`
Expected: FAIL(`Cannot find module './filler'` 或类似)

- [ ] **Step 4: 写实现**

`lib/domains/signals/filler.ts`:

```ts
import type { BriefItem } from "./brief";

/**
 * 去掉条目收尾的空话：只是给前面的事下结论、不带新事实的那一句（「这表明……」「，这意味着……」）。
 * 宁可漏删，也不删事实：句子里有具体的人和事、只是用了「趋势」「日益」的，不动。
 * 生成报告时删一遍，显示旧报告时再删一遍；删过的再跑一遍不会变。纯函数。
 */

/** 整句只是在评论上一句：「这/此 +（举、也、一…、些…、种…）+ 表明/意味着/反映/体现/凸显/标志着/预示/说明」开头。 */
const COMMENT_SENTENCE =
  /^(?:这|此)(?:举|也|一[^，,。！？]{0,6}?|些[^，,。！？]{0,6}?|种[^，,。！？]{0,6}?)?也?(?:表明|意味着|反映|体现|凸显|标志着|预示|说明)/;

/** 句尾那半句：「，这意味着……」「，并凸显了……」。「并 / 也」后面只认下结论的动词（「并表明将……」常常是事实）。 */
const COMMENT_CLAUSE =
  /[，,]\s*(?:(?:这|此举|这也|从而|进而)也?(?:表明|意味着|反映出|反映了|体现出|体现了|凸显了|凸显出|标志着|预示着|预示了)|(?:并|也)(?:反映出|反映了|体现出|体现了|凸显了|凸显出|标志着|预示着|预示了))[^。！？]*/;

export function isCommentSentence(sentence: string): boolean {
  return COMMENT_SENTENCE.test(sentence.trim());
}

/** 删掉的整句或半句放在 dropped 里。一句都没删就原样返回；全删光也原样返回（交给上游决定要不要重写）。 */
export function dropEmptyConclusions(text: string): { text: string; dropped: string[] } {
  const sentences = text.match(/[^。！？]+[。！？]?/g) ?? [];
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (isCommentSentence(s)) {
      dropped.push(s);
      continue;
    }
    const m = COMMENT_CLAUSE.exec(s);
    if (m && m.index > 0) {
      const end = /[。！？]$/.test(s) ? s.slice(-1) : "";
      dropped.push(s.slice(m.index + 1, end ? -1 : undefined).trim());
      kept.push(s.slice(0, m.index) + end);
      continue;
    }
    kept.push(s);
  }
  if (dropped.length === 0 || kept.length === 0) return { text, dropped: [] };
  return { text: kept.join(""), dropped };
}

/** 一条报告条目：背景、「主要影响谁」那一句、先例都删一遍，删掉的接在 dropped 后面。「也值得一看」那几条没有背景，不动。 */
export function cleanBriefItem(item: BriefItem): BriefItem {
  if (item.extra) return item;
  const background = dropEmptyConclusions(item.background);
  const forYou = dropEmptyConclusions(item.for_you);
  const precedent = item.precedent ? dropEmptyConclusions(item.precedent) : null;
  const dropped = [...(item.dropped ?? []), ...background.dropped, ...forYou.dropped, ...(precedent?.dropped ?? [])];
  return {
    ...item,
    background: background.text,
    for_you: forYou.text,
    ...(precedent ? { precedent: precedent.text } : {}),
    ...(dropped.length > 0 ? { dropped } : {}),
  };
}
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run lib/domains/signals/filler.test.ts`
Expected: PASS(9 个)

- [ ] **Step 6: 提交**

```bash
git add lib/domains/signals/filler.ts lib/domains/signals/filler.test.ts lib/domains/signals/brief.ts
git commit -m "feat(signals): 去空话的规则——整句只在评论上一句的删掉，「，这意味着……」只删后半句，有具体人和事的不动；删掉的记在条目上

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 生成时删 + 提示词

**Files:**
- Modify: `lib/domains/signals/brief.ts`(`generateBrief` 拼 items 那一段)
- Modify: `lib/ai/signals.ts:318`(`SIGNAL_SHARED_RULES`)

- [ ] **Step 1: 生成时删**

`lib/domains/signals/brief.ts` 顶上 import 区加:

```ts
import { cleanBriefItem } from "./filler";
```

`generateBrief` 里拼精选条目的那一段,结尾从

```ts
      opportunity: p.opportunity,
      precedent: p.precedent,
    };
  });
  // "也值得一看"跟精选存在同一个数组里，用 extra 标出来，不用加列
```

改成

```ts
      opportunity: p.opportunity,
      precedent: p.precedent,
    };
  }).map(cleanBriefItem);
  // "也值得一看"跟精选存在同一个数组里，用 extra 标出来，不用加列
```

- [ ] **Step 2: 提示词加一条**

`lib/ai/signals.ts` 的 `SIGNAL_SHARED_RULES`,在 `- 不夸、不打气、不说"值得关注""很有潜力"。` 那一行后面加一行:

```
- 不许用"这表明""这意味着""反映了""预示着""标志着""凸显了"给前面的事下结论。背景的最后一句写事实（谁做了什么、数字、日期）；想说影响，就写具体谁会做什么。
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit && npx vitest run lib/ai lib/domains/signals`
Expected: 无类型错误;测试全过(提示词改动不影响解析器)

- [ ] **Step 4: 提交**

```bash
git add lib/domains/signals/brief.ts lib/ai/signals.ts
git commit -m "feat(signals): 生成报告时删一遍空话，提示词要求背景最后一句写事实

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 显示时删 + 干跑看删了什么

**Files:**
- Modify: `app/(app)/signals/queries.ts`(`getDailyReport` 里的 `section`)
- Modify: `lib/domains/signals/gaps.ts`(`loadGapBriefs`)

- [ ] **Step 1: 读报告时删**

`app/(app)/signals/queries.ts` 顶上加:

```ts
import { cleanBriefItem } from "@/lib/domains/signals/filler";
```

`section` 里

```ts
          items: row.items as BriefItem[],
```

改成

```ts
          items: (row.items as BriefItem[]).map(cleanBriefItem),
```

- [ ] **Step 2: 读差距清单时删(差距清单、一条讲透、周刊取料都走这里)**

`lib/domains/signals/gaps.ts` 顶上加:

```ts
import { cleanBriefItem } from "./filler";
```

`loadGapBriefs` 的 return 从

```ts
  return (data ?? []).map((r) => ({ brief_date: r.brief_date as string, items: (r.items as BriefItem[] | null) ?? [] }));
```

改成

```ts
  return (data ?? []).map((r) => ({ brief_date: r.brief_date as string, items: ((r.items as BriefItem[] | null) ?? []).map(cleanBriefItem) }));
```

- [ ] **Step 3: 干跑:拿最近两周的真实条目看删了什么(临时脚本,不提交)**

`scripts/tmp-filler-dry.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase";
import type { BriefItem } from "@/lib/domains/signals/brief";
import { cleanBriefItem } from "@/lib/domains/signals/filler";
import { patchDns } from "./dns-patch";

const FILLER = /表明|意味着|反映了|反映出|标志着|预示着|凸显/;

async function main(): Promise<void> {
  patchDns();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, kind, items")
    .gte("brief_date", since)
    .in("kind", ["news", "tools", "voices", "calendar", "money"]);
  if (error) throw error;
  let n = 0;
  let before = 0;
  let after = 0;
  const dropped: string[] = [];
  for (const b of data ?? []) {
    for (const item of (b.items as BriefItem[] | null) ?? []) {
      if (item.extra || !item.background) continue;
      n++;
      const last = (t: string) => (t.match(/[^。！？]+[。！？]?/g) ?? []).at(-1) ?? "";
      if (FILLER.test(last(item.background))) before++;
      const c = cleanBriefItem(item);
      if (FILLER.test(last(c.background))) after++;
      dropped.push(...(c.dropped ?? []).map((s) => `[${b.kind}] ${s}`));
    }
  }
  console.log(`条目 ${n}；背景最后一句是空话：删之前 ${before}，删之后 ${after}；一共删了 ${dropped.length} 句`);
  console.log(dropped.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run: `npx tsx --env-file=.env.local scripts/tmp-filler-dry.ts`
Expected:「删之后」明显少于「删之前」(之前量过 72/309)。**逐句看删掉的那些**:有没有删掉了事实(人名、公司、数字、日期)的。
有的话,把那一句加进 `filler.test.ts` 的「不动」那一组,改 `COMMENT_SENTENCE` / `COMMENT_CLAUSE` 让它通过,再干跑一次。

- [ ] **Step 4: 删掉临时脚本**

```bash
rm scripts/tmp-filler-dry.ts
```

- [ ] **Step 5: 验证并提交**

Run: `npx tsc --noEmit && npx vitest run lib/domains/signals`
Expected: 全过

```bash
git add "app/(app)/signals/queries.ts" lib/domains/signals/gaps.ts lib/domains/signals/filler.ts lib/domains/signals/filler.test.ts
git commit -m "feat(signals): 显示旧报告和差距清单时也删一遍空话

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 信息源体检「删了几句」

**Files:**
- Modify: `lib/domains/signals/filler.ts`、`lib/domains/signals/filler.test.ts`
- Modify: `lib/domains/signals/source-health.ts`
- Modify: `app/(app)/signals/sources/page.tsx`

- [ ] **Step 1: 写测试**

`lib/domains/signals/filler.test.ts` 顶上的 import 改成:

```ts
import { cleanBriefItem, collectDropped, dropEmptyConclusions, isCommentSentence } from "./filler";
```

文件末尾加:

```ts
describe("信息源体检：这几天删了哪些", () => {
  it("存下的和现删的都算，新的在前", () => {
    const base = { signal_id: "s", title: "t", url: null, source: "x", headline: "h", for_you: "" };
    const rows = [
      { brief_date: "2026-10-15", kind: "news", items: [{ ...base, background: "日银加息。", dropped: ["这表明进入新阶段。"] } as BriefItem] },
      { brief_date: "2026-10-16", kind: "money", items: [{ ...base, background: "A 社融资 10 亿日元。这说明投资人看好。" } as BriefItem] },
      { brief_date: "2026-10-16", kind: "tools", items: null },
    ];
    expect(collectDropped(rows)).toEqual([
      { date: "2026-10-16", kind: "money", sentence: "这说明投资人看好。" },
      { date: "2026-10-15", kind: "news", sentence: "这表明进入新阶段。" },
    ]);
  });
});
```

- [ ] **Step 2: 跑一下,确认失败**

Run: `npx vitest run lib/domains/signals/filler.test.ts`
Expected: FAIL(`collectDropped` 不存在)

- [ ] **Step 3: 写实现**

`lib/domains/signals/filler.ts` 末尾加:

```ts
export type DroppedLine = { date: string; kind: string; sentence: string };

/** 这几天的报告里删掉了哪些（新报告存在条目上，旧报告现删的也算），新的在前。 */
export function collectDropped(rows: { brief_date: string; kind: string; items: BriefItem[] | null }[]): DroppedLine[] {
  return rows
    .flatMap((r) =>
      (r.items ?? []).flatMap((item) => (cleanBriefItem(item).dropped ?? []).map((sentence) => ({ date: r.brief_date, kind: r.kind, sentence })))
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}
```

`lib/domains/signals/source-health.ts`:顶上加 `import { collectDropped, type DroppedLine } from "./filler";`,文件末尾加:

```ts
export const DROPPED_DAYS = 7;

/** 最近一周删掉的空话（信息源体检页看删得对不对）。 */
export async function droppedSentences(userId: string): Promise<DroppedLine[]> {
  const since = new Date(Date.now() - DROPPED_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, kind, items")
    .eq("user_id", userId)
    .in("kind", REPORT_SECTION_KINDS)
    .gte("brief_date", since);
  if (error) throw new Error(error.message);
  return collectDropped(
    (data ?? []).map((r) => ({ brief_date: r.brief_date as string, kind: r.kind as string, items: (r.items as BriefItem[] | null) ?? null }))
  );
}
```

- [ ] **Step 4: 页面加一节**

`app/(app)/signals/sources/page.tsx`:

import 那一行改成

```ts
import { DROPPED_DAYS, droppedSentences, HEALTH_DAYS, sourceHealth, type SourceHealth } from "@/lib/domains/signals/source-health";
```

`Promise.all` 改成

```ts
  const [feedback, health, google, tavily, dropped] = await Promise.all([
    tallyFeedback(user.id, HEALTH_DAYS),
    sourceHealth(user.id),
    googleSearchCount().catch(() => null),
    tavilyUsage(),
    droppedSentences(user.id).catch(() => []),
  ]);
```

在「上网搜索用了多少」那个 `<section className="mb-10">` 前面插一节:

```tsx
      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">删掉的空话</h2>
        <p className="text-sm leading-7 text-muted-foreground">
          最近 {DROPPED_DAYS} 天，报告里删了 {dropped.length} 句只给前面下结论的话（「这表明……」「，这意味着……」）。
          点开看删了哪些 —— 要是里面有人名、公司、数字、日期，就是规则删错了，记下来改。
        </p>
        {dropped.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">看删了哪些</summary>
            <ul className="mt-2 space-y-1">
              {dropped.map((d, i) => (
                <li key={i} className="leading-7">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {d.date} · {SECTION_NAMES[d.kind] ?? d.kind}
                  </span>
                  {d.sentence}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
```

- [ ] **Step 5: 验证**

Run: `npx tsc --noEmit && npm run lint && npx vitest run lib/domains/signals/filler.test.ts`
Expected: 全过

- [ ] **Step 6: 提交**

```bash
git add lib/domains/signals/filler.ts lib/domains/signals/filler.test.ts lib/domains/signals/source-health.ts "app/(app)/signals/sources/page.tsx"
git commit -m "feat(signals): 信息源体检页显示最近一周删了几句空话，点开看删了哪些

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 迁移 083

**Files:**
- Create: `supabase/migrations/083_signal_gap_deep.sql`
- Modify: `supabase/schema.sql`(末尾追加,CRLF)

- [ ] **Step 1: 写迁移**

`supabase/migrations/083_signal_gap_deep.sql`:

```sql
-- ============================================================================
-- 迁移 083：差距的「一条讲透」
-- signal_gap_deep：差距清单里一条，攒在一页上的几样新东西 ——
--   there：「那边查一查」查到的事实（谁在做、做到多大、怎么收钱、哪年开始），每条附原文，代码核对过；
--   category：他点的这条属于时差图谱哪一类（看同类先例用）；
--   stance：他点的判断三下和补的那句（到周刊页还在；押进判断账本仍是第一次记"发了"的时候）。
-- 不打分、不下"值得做"的结论。幂等，可重复执行。
-- ============================================================================

create table if not exists signal_gap_deep (
  user_id     uuid not null references auth.users (id) on delete cascade,
  signal_id   uuid not null,
  side        text not null check (side in ('japan', 'us', 'china')),
  there       jsonb,
  category    text,
  stance      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, signal_id, side)
);

alter table signal_gap_deep enable row level security;

drop policy if exists "signal_gap_deep_owner" on signal_gap_deep;
create policy "signal_gap_deep_owner" on signal_gap_deep
  for all using (auth.uid() = user_id);
```

- [ ] **Step 2: 追加到 schema.sql(CRLF)**

```bash
python - <<'EOF'
src = open("supabase/migrations/083_signal_gap_deep.sql", "rb").read().decode("utf-8").replace("\r\n", "\n")
dst = open("supabase/schema.sql", "rb").read()
if not dst.endswith(b"\r\n"):
    dst += b"\r\n"
dst += b"\r\n" + src.replace("\n", "\r\n").encode("utf-8")
open("supabase/schema.sql", "wb").write(dst)
EOF
tail -3 supabase/schema.sql | cat -A | cut -c1-60
```

Expected: 最后几行以 `^M$` 结尾

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/083_signal_gap_deep.sql supabase/schema.sql
git commit -m "feat(signals): 迁移 083 signal_gap_deep——一条讲透里存的那边查一查、类别、判断

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 一条讲透的类型和核对规则

**Files:**
- Create: `lib/domains/signals/deep-shared.ts`
- Create: `lib/domains/signals/deep-shared.test.ts`

- [ ] **Step 1: 写测试**

`lib/domains/signals/deep-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkThereFacts, mentionedNames, missingSteps, thereLanguage, validCategory, validDeepStance } from "./deep-shared";

const page = {
  title: "美团无人机配送",
  url: "https://example.cn/a",
  content: "美团无人机已在深圳、上海等地开通 53 条航线，2021 年开始试运营，累计完成订单超过 45 万单。每单收取配送费。",
};
const excerpt = "美团无人机已在深圳、上海等地开通 53 条航线，2021 年开始试运营，累计完成订单超过 45 万单";

describe("那边查一查：只收对得上原文的事实", () => {
  it("原文在页上、数字和公司名都在原文里的收下", () => {
    const facts = checkThereFacts([{ source: 1, fact: "美团无人机开通了 53 条航线，累计完成订单超过 45 万单。", company: "美团", excerpt }], [page]);
    expect(facts).toEqual([
      { text: "美团无人机开通了 53 条航线，累计完成订单超过 45 万单。", company: "美团", excerpt, url: page.url, title: page.title },
    ]);
  });

  it("原文不在页上、数字不在原文里、公司不在原文里、资料编号不对的都丢掉", () => {
    expect(checkThereFacts([{ source: 1, fact: "美团开通了 100 条航线。", excerpt: "美团无人机已开通 100 条航线" }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 1, fact: "美团无人机开通了 60 条航线。", excerpt }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 1, fact: "饿了么开通了 53 条航线。", company: "饿了么", excerpt }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 2, fact: "美团无人机开通了 53 条航线。", excerpt }], [page])).toEqual([]);
  });

  it("「这说明……」式的结论不收；全角数字也认", () => {
    expect(checkThereFacts([{ source: 1, fact: "这说明无人机配送前景广阔。", excerpt }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 1, fact: "美团无人机开通了 ５３ 条航线。", excerpt }], [page])).toHaveLength(1);
  });

  it("同一句原文只收一次，最多 6 条", () => {
    const content = Array.from({ length: 8 }, (_, i) => `第${i}句：美团在城市${i}开通了航线。`).join("");
    const many = Array.from({ length: 8 }, (_, i) => ({ source: 1, fact: `美团在城市${i}开通了航线。`, excerpt: `第${i}句：美团在城市${i}开通了航线` }));
    expect(checkThereFacts(many, [{ ...page, content }])).toHaveLength(6);
    expect(checkThereFacts([many[0], many[0]], [{ ...page, content }])).toHaveLength(1);
  });

  it("那边用什么语言搜", () => {
    expect([thereLanguage("japan"), thereLanguage("us"), thereLanguage("china")]).toEqual(["中文", "英文", "日文"]);
  });
});

describe("官报名单：名字原样出现在这条里才算", () => {
  it("两个字以下的名字不认", () => {
    expect(mentionedNames(["谭仔国际在日本开了新店"], ["谭仔", "蜜雪冰城", "a", " "])).toEqual(["谭仔"]);
  });
});

describe("浏览器传来的只认合法的", () => {
  it("类别", () => {
    expect(validCategory("food")).toBe("food");
    expect(validCategory("toString")).toBeNull();
    expect(validCategory(3)).toBeNull();
  });

  it("判断：第一问必点，补的那句去掉首尾空白、最多 200 字", () => {
    expect(validDeepStance({ will: "will", blocker: "law" }, " 先在离岛 ")).toEqual({ stance: { will: "will", blocker: "law" }, note: "先在离岛" });
    expect(validDeepStance({ blocker: "law" }, "")).toBeNull();
    expect(validDeepStance({ will: "wont" }, "长".repeat(201))).toBeNull();
  });

  it("「把缺的都查一遍」按顺序跑没查过的", () => {
    expect(missingSteps({ there: true, transfer: false, voices: false })).toEqual(["transfer", "voices"]);
    expect(missingSteps({ there: true, transfer: true, voices: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑一下,确认失败**

Run: `npx vitest run lib/domains/signals/deep-shared.test.ts`
Expected: FAIL(找不到 `./deep-shared`)

- [ ] **Step 3: 写实现**

`lib/domains/signals/deep-shared.ts`:

```ts
import { numbersIn } from "@/lib/domains/jobs/provenance-shared";
import { ATLAS_CATEGORIES, type AtlasCategory } from "./atlas-shared";
import { isCommentSentence } from "./filler";
import type { GapSide } from "./gaps-shared";
import { ISSUE_NOTE_MAX, validStance, type PickStance } from "./issue-shared";

/**
 * 差距的「一条讲透」：一条差距攒在一页上的几样新东西，和它们的核对规则（纯函数，不碰数据库）。
 * 那边查一查：事实必须有原文、原文必须在网页上、数字和公司名必须在那句原文里 —— AI 只能摘，不能编。
 */

export const THERE_MAX_FACTS = 6;

export type ThereFact = {
  /** 一句中文：谁、什么、多少、什么时候。 */
  text: string;
  /** 这条讲的是哪家公司（照原文写法）；不是讲某一家的没有。 */
  company?: string;
  /** 原文（代码核对过逐字在那一页上）。 */
  excerpt: string;
  url: string;
  title: string;
};

export type GapThere = {
  facts: ThereFact[];
  /** 用了哪两个搜索词（一条没摘到时，页面上请他自己去搜）。 */
  queries: string[];
  /** 读了几篇（一条都没摘到时，分得清是没搜到还是搜到了对不上）。 */
  searched: { pages: number };
  checked_at: string;
};

/** 他在这一页点的判断：周刊那三下 + 补的那句。 */
export type DeepStance = { stance: PickStance; note: string };

export type GapDeep = {
  there: GapThere | null;
  category: AtlasCategory | null;
  stance: DeepStance | null;
  updated_at: string;
};

/** 「那边」用什么语言搜：中国那边中文、美国那边英文、日本那边（反方向）日文。 */
export function thereLanguage(side: GapSide): "中文" | "英文" | "日文" {
  return side === "china" ? "日文" : side === "us" ? "英文" : "中文";
}

function squash(t: string): string {
  return t.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * AI 摘的事实，只收对得上原文的：资料编号对得上、原文逐字在那一页上、事实里的数字都在那句原文里、
 * 点名的公司在那句原文里、不是「这说明……」式的结论。同一句原文只收一次，最多 6 条。
 */
export function checkThereFacts(raw: unknown, sources: { title: string; url: string; content: string }[]): ThereFact[] {
  const out: ThereFact[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= THERE_MAX_FACTS) break;
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const src = sources[(typeof v.source === "number" ? v.source : Number(v.source)) - 1];
    const text = typeof v.fact === "string" ? v.fact.trim() : "";
    const excerpt = typeof v.excerpt === "string" ? v.excerpt.trim() : "";
    const company = typeof v.company === "string" ? v.company.trim() : "";
    if (!src || !text || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) continue;
    if (isCommentSentence(text)) continue;
    const allowed = new Set(numbersIn(excerpt));
    if (numbersIn(text).some((n) => !allowed.has(n))) continue;
    if (company && !squash(excerpt).includes(squash(company))) continue;
    if (out.some((f) => squash(f.excerpt) === squash(excerpt))) continue;
    out.push({ text, ...(company ? { company } : {}), excerpt: excerpt.slice(0, 300), url: src.url, title: src.title });
  }
  return out;
}

/** 名单里中国那边的名字，原样出现在这条文字里的那几个（不让 AI 猜是哪家）。两个字以下的名字不认。 */
export function mentionedNames(texts: string[], names: string[]): string[] {
  const all = texts.join("\n");
  return names.filter((n) => n.trim().length >= 2 && all.includes(n.trim()));
}

export function validCategory(raw: unknown): AtlasCategory | null {
  return typeof raw === "string" && Object.hasOwn(ATLAS_CATEGORIES, raw) ? (raw as AtlasCategory) : null;
}

/** 浏览器传来的判断：选项只认合法的，第一问必点；补的那句去掉首尾空白、最多 200 字。不合格返回 null。 */
export function validDeepStance(raw: unknown, note: unknown): DeepStance | null {
  const stance = validStance(raw);
  const text = typeof note === "string" ? note.trim() : "";
  if (!stance || text.length > ISSUE_NOTE_MAX) return null;
  return { stance, note: text };
}

export type DeepStep = "there" | "transfer" | "voices";

/** 「把缺的都查一遍」要跑哪几步，按这个顺序。 */
export function missingSteps(has: Record<DeepStep, boolean>): DeepStep[] {
  return (["there", "transfer", "voices"] as const).filter((s) => !has[s]);
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run lib/domains/signals/deep-shared.test.ts`
Expected: PASS(9 个)

- [ ] **Step 5: 提交**

```bash
git add lib/domains/signals/deep-shared.ts lib/domains/signals/deep-shared.test.ts
git commit -m "feat(signals): 一条讲透的类型和核对规则——事实的原文要在网页上、数字和公司名要在那句原文里，名单名字原样出现才算对上

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 那边查一查的提示词

**Files:**
- Create: `lib/ai/signals-deep.ts`
- Create: `lib/ai/signals-deep.test.ts`
- Modify: `lib/ai/signals.ts`(导出 `assertNoBanned`)
- Modify: `lib/ai/index.ts`

- [ ] **Step 1: 写测试**

`lib/ai/signals-deep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseThereFacts, parseThereQueries } from "./signals-deep";

const sources = [{ title: "美团无人机", url: "https://example.cn/a", content: "美团无人机已在深圳、上海等地开通 53 条航线，2021 年开始试运营。" }];
const excerpt = "美团无人机已在深圳、上海等地开通 53 条航线";

describe("那边查一查", () => {
  it("搜索词最多两个、去掉空的；一个都没有就重来", () => {
    expect(parseThereQueries({ queries: [" 美团 无人机 配送 规模 ", "", "美团 无人机 收费", "多余"] })).toEqual(["美团 无人机 配送 规模", "美团 无人机 收费"]);
    expect(() => parseThereQueries({ queries: [] })).toThrow();
  });

  it("对不上原文的丢掉，对得上的留下；一条都没有不算错", () => {
    const facts = parseThereFacts(
      {
        facts: [
          { source: 1, fact: "美团无人机开通了 53 条航线。", company: "美团", excerpt },
          { source: 1, fact: "美团无人机开通了 99 条航线。", company: "美团", excerpt: "美团无人机已在深圳、上海等地开通 99 条航线" },
        ],
      },
      sources
    );
    expect(facts.map((f) => f.text)).toEqual(["美团无人机开通了 53 条航线。"]);
    expect(parseThereFacts({ facts: [] }, sources)).toEqual([]);
  });

  it("夸的话、用日文写的不收（整次重来）", () => {
    expect(() => parseThereFacts({ facts: [{ source: 1, fact: "美团无人机很有潜力，开通了 53 条航线。", excerpt }] }, sources)).toThrow();
    expect(() => parseThereFacts({ facts: [{ source: 1, fact: "美団のドローンは53路線を開設しています。", excerpt }] }, sources)).toThrow();
  });
});
```

- [ ] **Step 2: 跑一下,确认失败**

Run: `npx vitest run lib/ai/signals-deep.test.ts`
Expected: FAIL(找不到 `./signals-deep`)

- [ ] **Step 3: 导出 `assertNoBanned`**

`lib/ai/signals.ts` 里

```ts
function assertNoBanned(texts: string[]): void {
```

改成

```ts
export function assertNoBanned(texts: string[]): void {
```

(先 `grep -rn "assertNoBanned" lib/ai` 确认别的模块没有同名导出,免得桶导出冲突。)

- [ ] **Step 4: 写实现**

`lib/ai/signals-deep.ts`:

```ts
import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertChineseAllowingNames, assertNoBanned, type SearchSource } from "./signals";
import { checkThereFacts, THERE_MAX_FACTS, type ThereFact } from "@/lib/domains/signals/deep-shared";

// ---------------------------------------------------------------------------
// 差距的「一条讲透」：那边查一查。
// 一条差距在那边到底是什么：谁在做、做到多大、怎么收钱、哪年开始。AI 先写那边语言的搜索词，搜完再摘事实；
// 每条事实的原文、数字、公司名由代码核对（deep-shared.ts），对不上的丢掉。不写结论、不打分。
// ---------------------------------------------------------------------------

export type ThereInput = { there: string; language: "中文" | "英文" | "日文"; headline: string; background: string };

const thereQueryPrompt = (input: ThereInput) => `下面是${input.there}已经有的一样东西（一条新闻里讲到的）。想把它在${input.there}的情况查清楚：谁在做、做到多大、怎么收钱、从哪一年开始。

写两个${input.language}搜索词：
- 第一个查"谁在做、做到多大"（公司名、用户数、门店数、营业额）；
- 第二个查"怎么收钱、哪一年开始"。
- 用${input.there}本地人会搜的说法，不要带"日本"，不要写成一句话，3 到 8 个词。

只输出 JSON：{"queries":["…","…"]}`;

export function parseThereQueries(value: unknown): string[] {
  const raw = (value as { queries?: unknown } | null)?.queries;
  const queries = (Array.isArray(raw) ? raw : [])
    .filter((q): q is string => typeof q === "string" && !!q.trim())
    .map((q) => q.trim().slice(0, 120))
    .slice(0, 2);
  if (queries.length === 0) throw new Error("一个搜索词都没写");
  return queries;
}

export async function planThereQueries(input: ThereInput): Promise<string[]> {
  return executeAiJson(
    { operation: "gap_there_queries", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    (attempt) => ({
      model: MODEL,
      contents: `${input.headline}\n${input.background}` + (attempt === 1 ? "\n\n上一次输出没通过校验。只输出 JSON，queries 里两个搜索词。" : ""),
      config: {
        systemInstruction: thereQueryPrompt(input),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 500,
      },
    }),
    parseThereQueries
  );
}

const thereFactsPrompt = (there: string) => `你在帮一个人把${there}那边的一样东西查清楚。给你这样东西是什么，和几篇上网搜到的资料。
从资料里摘出最多 ${THERE_MAX_FACTS} 条事实，只要这几类：谁在做（具体公司）、做到多大（用户数、门店数、营业额、融资额）、怎么收钱、哪一年开始。

每条写：
- source：资料编号（数字）。
- fact：一句简体中文，写清谁、什么、多少、什么时候。数字照原文的阿拉伯数字写，不换算、不四舍五入、不改成汉字。
- company：这条讲的是哪家公司，照原文写法；不是讲某一家公司就写空字符串。
- excerpt：资料里支撑这条的原文，逐字照抄（不翻译、不改字，20 到 150 字）。

铁律：
- 只摘资料里写了的。没写的不要补，不要推测。讲的是别的东西、别的国家的，跳过。
- 不写"这说明""意味着""前景广阔"这类结论，只写事实。不夸。
- 一条都没有就给空数组，不要凑。

只输出 JSON：{"facts":[{"source":1,"fact":"…","company":"…","excerpt":"…"}]}`;

/** 核对见 checkThereFacts；剩下的事实里有夸的话、写成了日文，整次重来。 */
export function parseThereFacts(value: unknown, sources: SearchSource[]): ThereFact[] {
  const facts = checkThereFacts((value as { facts?: unknown } | null)?.facts, sources);
  const texts = facts.map((f) => f.text);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return facts;
}

export async function extractThereFacts(input: ThereInput, sources: SearchSource[]): Promise<ThereFact[]> {
  const block = sources.map((s, i) => `[资料 ${i + 1}] ${s.title}\n${s.url}\n${s.content.slice(0, 1500)}`).join("\n\n");
  return executeAiJson(
    { operation: "gap_there_facts", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        `【这样东西】${input.headline}\n${input.background}\n\n${block}` +
        (attempt === 1 ? "\n\n上一次输出没通过校验。excerpt 必须逐字照抄资料原文；fact 用简体中文、只写事实。" : ""),
      config: {
        systemInstruction: thereFactsPrompt(input.there),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseThereFacts(value, sources)
  );
}
```

`lib/ai/index.ts` 在 `export * from "./signals";` 后面加一行:

```ts
export * from "./signals-deep";
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run lib/ai/signals-deep.test.ts && npx tsc --noEmit`
Expected: PASS(3 个);无类型错误

- [ ] **Step 6: 提交**

```bash
git add lib/ai/signals-deep.ts lib/ai/signals-deep.test.ts lib/ai/signals.ts lib/ai/index.ts
git commit -m "feat(signals): 那边查一查的提示词——先写那边语言的两个搜索词，再摘最多 6 条事实，代码核对原文

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 数据库、那边查一查、官报、拼料

**Files:**
- Modify: `lib/domains/signals/kanpo-shared.ts`、`lib/domains/signals/kanpo-shared.test.ts`(`noticeSummary`)
- Modify: `lib/domains/signals/gaps-shared.ts`(`JapanGap` 加 `basis`)
- Create: `lib/domains/signals/deep.ts`
- Create: `lib/domains/signals/deep-page.ts`

- [ ] **Step 0a: 决算公告说成一行字 —— 写测试**

`lib/domains/signals/kanpo-shared.test.ts` 的 import 加 `noticeSummary`,文件末尾加:

```ts
describe("决算公告说成一行字（周刊的材料）", () => {
  const n = {
    company_name: "株式会社譚仔日本",
    issue_date: "2026-10-16",
    period: "第3期",
    fiscal_end: "令和８年３月31日現在",
    total_assets: 320_000_000,
    net_income: -160_000_000,
    retained_earnings: -1_440_000_000,
    complete: true,
  };
  it("总资产、当期纯损失、累计亏损", () => {
    expect(noticeSummary(n)).toBe("株式会社譚仔日本（2026-10-16 官报，第3期 令和８年３月31日現在）：总资产 3.2亿円，当期纯损失 1.6亿円，累计亏损 14.4亿円");
  });
  it("没抽全的只说登了", () => {
    expect(noticeSummary({ ...n, complete: false })).toBe("株式会社譚仔日本：2026-10-16 的官报登了决算公告，数字没抽全");
  });
});
```

Run: `npx vitest run lib/domains/signals/kanpo-shared.test.ts`
Expected: FAIL(`noticeSummary` 不存在)

- [ ] **Step 0b: 写实现**

`lib/domains/signals/kanpo-shared.ts` 末尾(`formatYen` 后面)加:

```ts
/** 一条决算公告说成一行字（周刊的材料用；页面上用 NoticeLine）。没抽全的只说登了。 */
export function noticeSummary(
  n: Pick<KanpoNotice, "company_name" | "issue_date" | "period" | "fiscal_end" | "total_assets" | "net_income" | "retained_earnings" | "complete">
): string {
  const name = n.company_name ?? "这家公司";
  if (!n.complete) return `${name}：${n.issue_date} 的官报登了决算公告，数字没抽全`;
  const parts = [
    n.total_assets !== null ? `总资产 ${formatYen(n.total_assets)}` : null,
    n.net_income !== null ? `${n.net_income < 0 ? "当期纯损失" : "当期纯利益"} ${formatYen(Math.abs(n.net_income))}` : null,
    n.retained_earnings !== null
      ? n.retained_earnings < 0
        ? `累计亏损 ${formatYen(Math.abs(n.retained_earnings))}`
        : `利益剰余金 ${formatYen(n.retained_earnings)}`
      : null,
  ].filter(Boolean);
  const when = [n.period, n.fiscal_end].filter(Boolean).join(" ");
  return `${name}（${n.issue_date} 官报${when ? `，${when}` : ""}）：${parts.join("，")}`;
}
```

Run: `npx vitest run lib/domains/signals/kanpo-shared.test.ts`
Expected: PASS

- [ ] **Step 1: 差距带上原文依据**

`lib/domains/signals/gaps-shared.ts` 的 `JapanGap` 里,`funded?: …;` 后面加:

```ts
  /** 报告里核对过的原文依据（读到正文的条目才有）。 */
  basis?: string[];
```

`collectJapanGaps` 里 `out.push({ … funded: s.funded, });` 改成

```ts
        funded: s.funded,
        ...(item.basis && item.basis.length > 0 ? { basis: item.basis } : {}),
      });
```

- [ ] **Step 2: 数据库和那边查一查**

`lib/domains/signals/deep.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase";
import { extractThereFacts, planThereQueries } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { mentionedNames, thereLanguage, validCategory, validDeepStance, type GapDeep, type GapThere } from "./deep-shared";
import { findJapanGap } from "./gaps";
import { gapPlaces, transferKey, type GapSide, type JapanGap } from "./gaps-shared";
import { ISSUE_NOTE_MAX } from "./issue-shared";
import { latestNoticeFor, watchBoard, type WatchRow } from "./kanpo";
import { noticeSummary, type KanpoNotice } from "./kanpo-shared";

export * from "./deep-shared";

/**
 * 差距的「一条讲透」：signal_gap_deep 的读写、「那边查一查」、这条对上的官报决算。
 * 页面拼料在 deep-page.ts（它要读周刊，周刊又要读这里，分开免得互相引用）。
 */

export const MISSING_DEEP_MIGRATION =
  "还差一步：迁移 083 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/083_signal_gap_deep.sql 之后再来。";

/** 每个搜索词读几篇。 */
const THERE_RESULTS = 4;

function isMissingDeep(message: string): boolean {
  return /signal_gap_deep/.test(message);
}

function toDeep(row: Record<string, unknown>): GapDeep {
  return {
    there: (row.there as GapThere | null) ?? null,
    category: validCategory(row.category),
    stance: (row.stance as GapDeep["stance"]) ?? null,
    updated_at: row.updated_at as string,
  };
}

/** 这一条存过的（没存过为 null）；表还没建返回 "missing-schema"。 */
export async function loadGapDeep(userId: string, side: GapSide, signalId: string): Promise<GapDeep | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_gap_deep")
    .select("there, category, stance, updated_at")
    .eq("user_id", userId)
    .eq("side", side)
    .eq("signal_id", signalId)
    .maybeSingle();
  if (error) {
    if (isMissingDeep(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return data ? toDeep(data) : null;
}

/** 全部存过的（键见 transferKey）；表还没建时返回空。周刊拼料用。 */
export async function loadGapDeeps(userId: string): Promise<Map<string, GapDeep>> {
  const { data, error } = await supabaseAdmin
    .from("signal_gap_deep")
    .select("signal_id, side, there, category, stance, updated_at")
    .eq("user_id", userId);
  if (error) {
    if (isMissingDeep(error.message)) return new Map();
    throw new Error(error.message);
  }
  return new Map((data ?? []).map((r) => [transferKey(r.side as GapSide, r.signal_id as string), toDeep(r)]));
}

/** 只更新给了的那几列（upsert 合并，别的列不动）。 */
async function upsertDeep(userId: string, side: GapSide, signalId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_gap_deep")
    .upsert({ user_id: userId, side, signal_id: signalId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,signal_id,side" });
  if (error) throw new Error(isMissingDeep(error.message) ? MISSING_DEEP_MIGRATION : error.message);
}

/** 那边查一查：AI 写两个那边语言的搜索词 → 上网搜 → AI 摘事实、代码核对原文。一条没摘到也存（页面上写没查到）。 */
export async function runThereCheck(userId: string, signalId: string, side: GapSide): Promise<GapThere> {
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const input = { there: gapPlaces(side).there, language: thereLanguage(side), headline: gap.headline, background: gap.background };
  const queries = await planThereQueries(input);
  const results = await Promise.all(queries.map((q) => webSearch(q, THERE_RESULTS).catch(() => [])));
  const seen = new Set<string>();
  const sources = results.flat().filter((r) => r.url && !seen.has(r.url) && seen.add(r.url));
  const facts = sources.length > 0 ? await extractThereFacts(input, sources) : [];
  const there: GapThere = { facts, queries, searched: { pages: sources.length }, checked_at: new Date().toISOString() };
  await upsertDeep(userId, side, signalId, { there });
  return there;
}

export async function saveDeepCategory(userId: string, signalId: string, side: GapSide, raw: unknown): Promise<void> {
  const category = validCategory(raw);
  if (!category) throw new Error("没有这一类");
  await upsertDeep(userId, side, signalId, { category });
}

export async function saveDeepStance(userId: string, signalId: string, side: GapSide, rawStance: unknown, rawNote: unknown): Promise<void> {
  if (typeof rawNote === "string" && rawNote.trim().length > ISSUE_NOTE_MAX) throw new Error(`补的那句最多 ${ISSUE_NOTE_MAX} 字`);
  const stance = validDeepStance(rawStance, rawNote);
  if (!stance) throw new Error("先点一下：两年内会不会出现");
  await upsertDeep(userId, side, signalId, { stance });
}

export type GapKanpo = { fundedNotice: KanpoNotice | null; watchRows: WatchRow[]; ready: boolean };

/**
 * 这条对上的官报决算：日本拉到投资的那家（公司名归一化后完全相同才算），
 * 和名单里中国那边的名字原样出现在这条文字里的那几家。不让 AI 猜日本法人叫什么。迁移 082 没跑时 ready=false。
 */
export async function gapKanpo(userId: string, gap: Pick<JapanGap, "headline" | "background" | "funded">, deep: GapDeep | null): Promise<GapKanpo> {
  const board = await watchBoard(userId);
  if (board === "missing-schema") return { fundedNotice: null, watchRows: [], ready: false };
  const texts = [gap.headline, gap.background, ...(deep?.there?.facts ?? []).flatMap((f) => [f.text, f.company ?? ""])];
  const names = new Set(mentionedNames(texts, board.map((r) => r.watch.name_zh)));
  const fundedNotice = gap.funded ? await latestNoticeFor(gap.funded.company).catch(() => null) : null;
  return { fundedNotice, watchRows: board.filter((r) => names.has(r.watch.name_zh)), ready: true };
}

/** 周刊的材料：对上的决算，一条一行（名单上的只取最近一条）。 */
export function kanpoLines(k: GapKanpo): string[] {
  return [
    ...(k.fundedNotice ? [noticeSummary(k.fundedNotice)] : []),
    ...k.watchRows.flatMap((r) => (r.notices[0] ? [noticeSummary(r.notices[0])] : [])),
  ];
}
```

- [ ] **Step 3: 页面拼料**

`lib/domains/signals/deep-page.ts`:

```ts
import { countedCases, listTransferCases, type TransferCase } from "./atlas";
import { tokyoToday } from "./brief";
import { gapKanpo, loadGapDeep, type GapKanpo } from "./deep";
import type { GapDeep } from "./deep-shared";
import { loadFakeDoorStats, type FakeDoorStats } from "./fake-door";
import { loadGapTransfers } from "./gap-transfer";
import { listGapBoard, loadGapRechecks, type JapanGapRow } from "./gaps";
import { gapPlaces, transferKey, type ArrivedGap, type GapRecheck, type GapSide, type GapTransfer } from "./gaps-shared";
import { gapDemand, listIssues, type GapDemand } from "./issue";
import { caseNotices } from "./kanpo";
import type { KanpoNotice } from "./kanpo-shared";
import { loadGapVoices, type GapVoices } from "./voices";

export type DeepPage = {
  side: GapSide;
  there: string;
  here: string;
  /** 还开着的（带最近一次重查），或者重查发现这边有了的，二选一。 */
  open: JapanGapRow | null;
  arrived: ArrivedGap | null;
  /** 这一条的每月重查，新的在前。 */
  rechecks: GapRecheck[];
  /** 迁移 083 没跑为 "missing-schema"。 */
  deep: GapDeep | null | "missing-schema";
  transfer: GapTransfer | null;
  voices: GapVoices | null;
  /** 时差图谱里算进统计的先例（图谱没建为 null）。 */
  cases: TransferCase[] | null;
  /** 先例 id → 对上的官报决算。 */
  caseNotices: Record<string, KanpoNotice>;
  kanpo: GapKanpo;
  door: FakeDoorStats | null;
  demand: GapDemand | null;
};

/** 一条讲透那一页要的全部料；这条在清单里找不到了返回 null。 */
export async function loadDeepPage(userId: string, side: GapSide, signalId: string): Promise<DeepPage | null> {
  const key = transferKey(side, signalId);
  const [board, rechecks, deep, transfers, voices, cases, notices, doors, issues] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapRechecks(userId),
    loadGapDeep(userId, side, signalId),
    loadGapTransfers(userId),
    loadGapVoices(userId),
    listTransferCases(userId).catch(() => "missing-schema" as const),
    caseNotices(userId).catch(() => new Map<string, KanpoNotice>()),
    loadFakeDoorStats(userId),
    listIssues(userId).catch(() => []),
  ]);
  const open = board.sides[side].open.find((g) => g.signal_id === signalId) ?? null;
  const arrived = board.sides[side].arrived.find((g) => g.signal_id === signalId) ?? null;
  const gap = open ?? arrived;
  if (!gap) return null;
  return {
    side,
    ...gapPlaces(side),
    open,
    arrived,
    rechecks: (rechecks ?? []).filter((r) => r.side === side && r.signal_id === signalId),
    deep,
    transfer: transfers.get(key) ?? null,
    voices: voices.get(key) ?? null,
    cases: cases === "missing-schema" ? null : countedCases(cases),
    caseNotices: Object.fromEntries(notices),
    kanpo: await gapKanpo(userId, gap, deep === "missing-schema" ? null : deep),
    door: doors.get(key) ?? null,
    demand: gapDemand(issues).get(key) ?? null,
  };
}
```

- [ ] **Step 4: 验证**

Run: `npx tsc --noEmit && npx vitest run lib/domains/signals`
Expected: 无类型错误(`listIssues` 返回 `Issue[]`,`gapDemand` 收 `Pick<Issue, "content" | "responses">[]`);测试全过

- [ ] **Step 5: 提交**

```bash
git add lib/domains/signals/kanpo-shared.ts lib/domains/signals/kanpo-shared.test.ts lib/domains/signals/gaps-shared.ts lib/domains/signals/deep.ts lib/domains/signals/deep-page.ts
git commit -m "feat(signals): 一条讲透的数据库读写、那边查一查、对上的官报决算、页面拼料

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: server actions

**Files:**
- Modify: `app/(app)/signals/actions.ts`(CRLF;用 Edit 工具)

- [ ] **Step 1: import**

在 import 区加:

```ts
import { runThereCheck, saveDeepCategory, saveDeepStance, type GapThere } from "@/lib/domains/signals/deep";
```

- [ ] **Step 2: 三个 action**

接在 `analyzeGapVoicesAction` 后面:

```ts
/** 一条讲透：那边查一查（搜两次、摘事实，三四十秒）。 */
export async function runThereAction(
  signalId: string,
  side: GapSide
): Promise<{ ok: true; there: GapThere } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    return { ok: true, there: await runThereCheck(userId, signalId, side) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没查成") };
  }
}

/** 一条讲透：这条属于时差图谱哪一类。 */
export async function saveDeepCategoryAction(
  signalId: string,
  side: GapSide,
  category: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await saveDeepCategory(userId, signalId, side, category);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没存上") };
  }
}

/** 一条讲透：判断三下 + 补的那句（到周刊页还在）。 */
export async function saveDeepStanceAction(
  signalId: string,
  side: GapSide,
  stance: unknown,
  note: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await saveDeepStance(userId, signalId, side, stance, note);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没存上") };
  }
}
```

- [ ] **Step 3: 验证并提交**

Run: `npx tsc --noEmit && npm run lint`
Expected: 全过;`file "app/(app)/signals/actions.ts"` 仍是 CRLF(混了 LF 就用 `sed -i 's/\r*$/\r/'` 统一)

```bash
git add "app/(app)/signals/actions.ts"
git commit -m "feat(signals): 一条讲透的三个 action——那边查一查、存类别、存判断

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 一条讲透页

**Files:**
- Create: `app/(app)/signals/issue/option-row.tsx`(从 issue-composer 挪出来)
- Modify: `app/(app)/signals/issue/issue-composer.tsx`
- Create: `app/(app)/signals/gaps/deep/page.tsx`
- Create: `app/(app)/signals/gaps/deep/there-view.tsx`
- Create: `app/(app)/signals/gaps/deep/fill-missing.tsx`
- Create: `app/(app)/signals/gaps/deep/deep-judgment.tsx`

- [ ] **Step 1: 把 OptionRow 挪成共用组件**

`app/(app)/signals/issue/option-row.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

/** 一排可以点的选项；required 的点了就不能取消，其余点第二下取消。 */
export function OptionRow<K extends string>({
  label,
  options,
  value,
  onChange,
  required = false,
}: {
  label: string;
  options: Record<K, string>;
  value: K | undefined;
  onChange: (v: K | undefined) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(options) as K[]).map((k) => (
          <Button key={k} size="sm" variant={value === k ? "secondary" : "ghost"} onClick={() => onChange(value === k && !required ? undefined : k)}>
            {options[k]}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

`issue-composer.tsx`:删掉文件里的 `/** 一排可以点的选项；… */ function OptionRow<…>(…) { … }` 整个函数,import 区加 `import { OptionRow } from "./option-row";`。

- [ ] **Step 2: ① 那边查一查**

`app/(app)/signals/gaps/deep/there-view.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { GapThere } from "@/lib/domains/signals/deep-shared";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { runThereAction } from "../../actions";

/** ① 那边查一查：谁在做、做到多大、怎么收钱、哪年开始。每条附原文。disabled 是迁移没跑时的那句话。 */
export function ThereView({
  signalId,
  side,
  there,
  initial,
  disabled,
}: {
  signalId: string;
  side: GapSide;
  there: string;
  initial: GapThere | null;
  disabled?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await runThereAction(signalId, side);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  return (
    <div className="space-y-3">
      {initial && initial.facts.length > 0 && (
        <ul className="space-y-2">
          {initial.facts.map((f, i) => (
            <li key={i} className="text-sm leading-7">
              {f.text}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">原文</summary>
                <p className="mt-1 text-muted-foreground">
                  「{f.excerpt}」
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                    {f.title || "来源"} ↗
                  </a>
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}
      {initial && initial.facts.length === 0 && (
        <p className="text-sm leading-7 text-muted-foreground">
          {initial.searched.pages === 0 ? "上次一篇都没搜到。" : `上次读了 ${initial.searched.pages} 篇，没有一句能和原文对上，所以一条都没留。`}
          过几天再查，或者拿这两个词自己去搜：{initial.queries.map((q) => `「${q}」`).join("")}
        </p>
      )}
      {initial && (
        <p className="font-mono text-xs text-muted-foreground">
          {initial.checked_at.slice(0, 10)} 查的 · 读了 {initial.searched.pages} 篇
        </p>
      )}
      {disabled ? (
        <p className="text-sm leading-7 text-muted-foreground">{disabled}</p>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={run}>
          {pending ? `在${there}那边查（三四十秒）…` : initial ? "重查一遍" : `去${there}那边查一查`}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: 把缺的都查一遍**

`app/(app)/signals/gaps/deep/fill-missing.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { DeepStep } from "@/lib/domains/signals/deep-shared";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { analyzeGapTransferAction, analyzeGapVoicesAction, runThereAction } from "../../actions";

const STEP_NAMES: Record<DeepStep, string> = { there: "那边查一查", transfer: "能不能搬过来", voices: "这边有人在头疼吗" };

/** 没查过的几步按顺序跑：一步一个请求（各自 60 秒内），跑完一步刷新一次；失败的那步写原因，后面的照跑。 */
export function FillMissing({ signalId, side, steps }: { signalId: string; side: GapSide; steps: DeepStep[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [log, setLog] = useState<string[]>([]);
  const run = () =>
    startTransition(async () => {
      setLog([]);
      for (const step of steps) {
        setLog((prev) => [...prev, `${STEP_NAMES[step]}：在查…`]);
        const result =
          step === "there"
            ? await runThereAction(signalId, side)
            : step === "transfer"
              ? await analyzeGapTransferAction(signalId, side)
              : await analyzeGapVoicesAction(signalId, side);
        setLog((prev) => [...prev.slice(0, -1), `${STEP_NAMES[step]}：${result.ok ? "查完了" : `没查成 —— ${result.message}`}`]);
        router.refresh();
      }
    });
  if (steps.length === 0 && log.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {steps.length > 0 && (
        <>
          <p className="text-sm leading-7">
            还有 {steps.length} 步没查：{steps.map((s) => STEP_NAMES[s]).join("、")}。一步三四十秒，按顺序跑，跑完一步就显示一步。
          </p>
          <Button className="mt-2" size="sm" disabled={pending} onClick={run}>
            {pending ? "在查…" : "把缺的都查一遍"}
          </Button>
        </>
      )}
      {log.length > 0 && (
        <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: ⑤ 类别 和 ⑧ 判断**

`app/(app)/signals/gaps/deep/deep-judgment.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ATLAS_CATEGORIES, type AtlasCategory } from "@/lib/domains/signals/atlas-shared";
import type { DeepStance } from "@/lib/domains/signals/deep-shared";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import {
  BLOCKER_OPTIONS,
  FIRST_MOVER_OPTIONS,
  ISSUE_NOTE_MAX,
  STANCE_OPTIONS,
  STANCE_YEARS,
  stanceSentence,
  type PickStance,
} from "@/lib/domains/signals/issue-shared";
import { OptionRow } from "../../issue/option-row";
import { saveDeepCategoryAction, saveDeepStanceAction } from "../../actions";

/** ⑤ 这条属于哪一类：点了就存，页面按这一类列先例。 */
export function CategoryPicker({ signalId, side, initial }: { signalId: string; side: GapSide; initial: AtlasCategory | null }) {
  const router = useRouter();
  const [value, setValue] = useState<AtlasCategory | undefined>(initial ?? undefined);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (v: AtlasCategory | undefined) => {
    if (!v || pending) return;
    setValue(v);
    startTransition(async () => {
      setError(null);
      const result = await saveDeepCategoryAction(signalId, side, v);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  };
  return (
    <div>
      <OptionRow label="这属于哪一类？" options={ATLAS_CATEGORIES} value={value} onChange={pick} required />
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** ⑧ 你的判断：周刊那三下 + 补一句。存在这一页，到周刊页还在；押进判断账本照旧是第一次记"发了"的时候。 */
export function DeepJudgment({
  signalId,
  side,
  here,
  initial,
}: {
  signalId: string;
  side: GapSide;
  here: string;
  initial: DeepStance | null;
}) {
  const [stance, setStance] = useState<Partial<PickStance>>(initial?.stance ?? {});
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(!!initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Partial<PickStance>) => {
    setStance((s) => ({ ...s, ...patch }));
    setSaved(false);
  };
  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveDeepStanceAction(signalId, side, stance, note);
      if (result.ok) setSaved(true);
      else setError(result.message);
    });
  return (
    <div className="space-y-2">
      <OptionRow label={`${STANCE_YEARS} 年内${here}会不会出现？`} options={STANCE_OPTIONS} value={stance.will} onChange={(v) => change({ will: v })} required />
      <OptionRow label="最大的阻碍？" options={BLOCKER_OPTIONS} value={stance.blocker} onChange={(v) => change({ blocker: v })} />
      <OptionRow label="谁最可能先做？" options={FIRST_MOVER_OPTIONS} value={stance.firstMover} onChange={(v) => change({ firstMover: v })} />
      <Textarea
        value={note}
        maxLength={ISSUE_NOTE_MAX}
        rows={2}
        placeholder="想多说一句？原样接在后面（可以不写）"
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
      />
      {stance.will && (
        <p className="text-sm leading-7">
          <span className="text-muted-foreground">发出去的是：</span>
          {stanceSentence(stance as PickStance, here, note)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending || !stance.will || saved} onClick={save}>
          {saved ? "存好了" : "存下"}
        </Button>
        {saved && (
          <Link href={`/signals/issue?pick=${side}:${signalId}`} className="text-sm text-primary underline-offset-4 hover:underline">
            用这一条写一期 →
          </Link>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: 页面**

`app/(app)/signals/gaps/deep/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { formatReportDate } from "@/lib/domains/signals/format";
import { ATLAS_OUTCOMES, baseSentence, categoryBase } from "@/lib/domains/signals/atlas-shared";
import { missingSteps } from "@/lib/domains/signals/deep-shared";
import { loadDeepPage } from "@/lib/domains/signals/deep-page";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { SourceCheckView } from "../../check-view";
import { NoticeLine } from "../../kanpo/notice-line";
import { TransferView } from "../transfer-view";
import { VoicesView } from "../voices-view";
import { CategoryPicker, DeepJudgment } from "./deep-judgment";
import { FillMissing } from "./fill-missing";
import { ThereView } from "./there-view";

export const dynamic = "force-dynamic";
// 「那边查一查」「把缺的都查一遍」由这一页的 server action 跑，每步三四十秒
export const maxDuration = 60;

const SIDES: GapSide[] = ["japan", "us", "china"];
const MISSING_083 = "还差一步：迁移 083 没跑。执行 supabase/migrations/083_signal_gap_deep.sql 之后，这一格才能用。";

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="text-base font-semibold">
        <span className="mr-2 font-mono text-sm text-muted-foreground">{n}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default async function DeepGapPage({ searchParams }: { searchParams: { side?: string; id?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const side = SIDES.find((s) => s === searchParams.side);
  const signalId = searchParams.id ?? "";
  if (!side || !/^[0-9a-f-]{36}$/i.test(signalId)) notFound();

  const page = await loadDeepPage(user.id, side, signalId);
  const back = (
    <p className="mb-4 text-sm">
      <Link href="/signals/gaps" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
        ← 差距清单
      </Link>
    </p>
  );
  if (!page) {
    return (
      <PageContainer width="narrow">
        {back}
        <p className="text-sm leading-7 text-muted-foreground">这条找不到了：存下的报告里已经没有它（太久以前的会被翻过去）。回差距清单挑一条现在还在的。</p>
      </PageContainer>
    );
  }

  const gap = page.open ?? page.arrived!;
  const deep = page.deep === "missing-schema" ? null : page.deep;
  const steps = missingSteps({ there: page.deep === "missing-schema" || !!deep?.there, transfer: !!page.transfer, voices: !!page.voices });
  const category = deep?.category ?? null;
  const sameKind = category && page.cases ? page.cases.filter((c) => c.category === category) : [];

  return (
    <PageContainer width="narrow">
      {back}
      <PageHeader
        eyebrow="One gap, in depth"
        title={gap.headline}
        description={`${page.there}有、${page.here}还没有 · ${formatReportDate(gap.brief_date)} · ${gap.source}。这一条能查的都摆在这一页：缺的点一下就查，查完写判断，再拿去写一期。`}
      />
      <div className="space-y-8">
        <FillMissing signalId={signalId} side={side} steps={steps} />

        <Section n="①" title={`${page.there}那边是怎么回事`}>
          <p className="text-sm leading-7">{gap.background}</p>
          {gap.basis && gap.basis.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">报告里核对过的原文</summary>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {gap.basis.map((b, i) => (
                  <li key={i}>「{b}」</li>
                ))}
              </ul>
            </details>
          )}
          {gap.url && (
            <a href={gap.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
              原文 ↗
            </a>
          )}
          <ThereView
            signalId={signalId}
            side={side}
            there={page.there}
            initial={deep?.there ?? null}
            disabled={page.deep === "missing-schema" ? MISSING_083 : undefined}
          />
        </Section>

        <Section n="②" title={`${page.here}这边现在怎样`}>
          {page.arrived ? (
            <>
              <p className="text-sm leading-7">
                <span className="text-muted-foreground">{formatReportDate(page.arrived.arrivedOn)}重查发现这边有了：</span>
                {page.arrived.now}
              </p>
              <SourceCheckView check={page.arrived.nowCheck ?? undefined} searchQuery={`${page.here} ${gap.headline}`} unverifiedText="没查到出处。" uncheckedText="没上网查过。" />
              <p className="text-xs leading-6 text-muted-foreground">进清单时查过是：{gap.japan}</p>
            </>
          ) : (
            <>
              <p className="text-sm leading-7">{gap.japan}</p>
              <SourceCheckView
                check={gap.check}
                searchQuery={`${page.here} ${gap.headline}`}
                unverifiedText="没查到出处，这句是 AI 凭印象说的。"
                uncheckedText="这句是 AI 凭印象说的，没上网查过。"
              />
            </>
          )}
          {gap.whyNow && (
            <p className="text-sm leading-7">
              <span className="text-muted-foreground">为什么是现在：</span>
              {gap.whyNow}
            </p>
          )}
          {page.rechecks.length > 0 && (
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              {page.rechecks.map((r) => (
                <li key={r.checked_on}>
                  {r.checked_on} 重查：{r.verdict === "arrived" ? "有了" : r.verdict === "still" ? "还是没有" : "没查清"} —— {r.japan}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section n="③" title="能不能搬过来">
          <TransferView key={page.transfer?.created_at ?? "none"} signalId={signalId} side={side} here={page.here} there={page.there} initial={page.transfer} />
        </Section>

        <Section n="④" title={`${page.here}这边有人在为这个头疼吗`}>
          <VoicesView key={page.voices?.created_at ?? "none"} signalId={signalId} side={side} here={page.here} initial={page.voices} />
        </Section>

        <Section n="⑤" title="同类东西以前来日本的结果">
          {page.here !== "日本" ? (
            <p className="text-sm leading-7 text-muted-foreground">时差图谱只记「那边先有、后来到日本」的，反方向（日本有、中国还没有）还没有，这一格先空着。</p>
          ) : page.cases === null ? (
            <p className="text-sm leading-7 text-muted-foreground">时差图谱还没建（迁移 073 没跑）。</p>
          ) : page.deep === "missing-schema" ? (
            <p className="text-sm leading-7 text-muted-foreground">{MISSING_083}</p>
          ) : (
            <>
              <CategoryPicker signalId={signalId} side={side} initial={category} />
              {category && (
                <>
                  <p className="text-sm leading-7">{baseSentence(category, categoryBase(sameKind))}</p>
                  <ul className="space-y-2">
                    {sameKind.map((c) => (
                      <li key={c.id} className="text-sm leading-7">
                        {c.thing}：{c.origin === "china" ? "中国" : "美国"} {c.origin_date} → 日本 {c.japan_date ?? "至今没到"} · {ATLAS_OUTCOMES[c.outcome]}
                        {page.caseNotices[c.id] && (
                          <p className="text-xs text-muted-foreground">
                            官报决算：<NoticeLine notice={page.caseNotices[c.id]} />
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signals/atlas" className="text-sm text-primary underline-offset-4 hover:underline">
                    去时差图谱看全部 →
                  </Link>
                </>
              )}
            </>
          )}
        </Section>

        <Section n="⑥" title="官报里看得到的">
          {!page.kanpo.ready ? (
            <p className="text-sm leading-7 text-muted-foreground">官报决算还没建（迁移 082 没跑）。</p>
          ) : (
            <>
              {gap.funded && (
                <p className="text-sm leading-7">
                  <span className="text-muted-foreground">{gap.funded.company}：</span>
                  {page.kanpo.fundedNotice ? <NoticeLine notice={page.kanpo.fundedNotice} /> : "官报里没对上。"}
                </p>
              )}
              {page.kanpo.watchRows.map((r) => (
                <p key={r.watch.id} className="text-sm leading-7">
                  <span className="text-muted-foreground">{r.watch.name_zh}（你的名单）：</span>
                  {r.notices[0] ? <NoticeLine notice={r.notices[0]} /> : "官报里还没对上它的日本法人。"}
                </p>
              ))}
              <p className="text-xs leading-6 text-muted-foreground">
                只认公司名完全相同的，没对上不代表没登。想盯哪家中国公司，加进
                <Link href="/signals/kanpo" className="mx-1 text-primary underline-offset-4 hover:underline">
                  在日本的中国公司
                </Link>
                名单。
              </p>
            </>
          )}
        </Section>

        <Section n="⑦" title="有没有人掏钱">
          {gap.funded ? (
            <p className="text-sm leading-7">
              <span className="text-muted-foreground">{page.here}已经有人拿到钱在做：</span>
              {gap.funded.company}
              <a href={gap.funded.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                来源 ↗
              </a>
            </p>
          ) : (
            <p className="text-sm leading-7 text-muted-foreground">{page.here}这边还没查到有公司为这件事拉到投资。</p>
          )}
          <p className="text-sm">
            <Link href={`/signals/gaps/door?side=${side}&signal=${signalId}`} className="text-primary underline-offset-4 hover:underline">
              {page.door
                ? `假门测试${page.door.open ? "" : "（关着）"}：看了 ${page.door.views} 次 · 留了邮箱 ${page.door.signups} 人 →`
                : `还没做假门测试：${page.here}的陌生人看到价格，愿不愿意留邮箱 →`}
            </Link>
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {page.demand
              ? `周刊上：说想要 ${page.demand.pain} · 问哪里买 ${page.demand.pay} · 想聊 ${page.demand.wantsTalk}`
              : "周刊上还没人回应过这一条。"}
          </p>
        </Section>

        <Section n="⑧" title="你的判断">
          {page.deep === "missing-schema" ? (
            <p className="text-sm leading-7 text-muted-foreground">{MISSING_083}</p>
          ) : (
            <DeepJudgment signalId={signalId} side={side} here={page.here} initial={deep?.stance ?? null} />
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 6: 验证**

Run: `npx tsc --noEmit && npm run lint`
Expected: 全过(`TransferView` / `VoicesView` 的 props 和差距清单页里用法一样;`SourceCheckView` 的 `check` 收 `AnalogCheck | undefined`)

- [ ] **Step 7: 提交**

```bash
git add "app/(app)/signals/issue/option-row.tsx" "app/(app)/signals/issue/issue-composer.tsx" "app/(app)/signals/gaps/deep"
git commit -m "feat(signals): 一条讲透页——八样料一页，缺的按顺序补，类别和判断存在这一页

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 入口

**Files:**
- Modify: `app/(app)/signals/gaps/page.tsx`
- Modify: `app/(app)/signals/issue/issue-composer.tsx`

- [ ] **Step 1: 差距清单每条**

`GapList` 底部那个 `<div className="mt-3 flex flex-wrap items-center gap-4">` 里,`<GapActions … />` 前面加:

```tsx
              <Link href={`/signals/gaps/deep?side=${side}&id=${g.signal_id}`} className="text-sm text-primary underline-offset-4 hover:underline">
                一条讲透 →
              </Link>
```

`ArrivedList` 每条最后(`{g.url && (<a …>{t.there}那边的原文 ↗</a>)}` 后面、`</li>` 前面)加:

```tsx
            <Link
              href={`/signals/gaps/deep?side=${side}&id=${g.signal_id}`}
              className="mt-2 ml-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              一条讲透 →
            </Link>
```

- [ ] **Step 2: 周刊挑条时每条**

`issue-composer.tsx` 候选列表里,`<p className="text-sm leading-7 text-muted-foreground">{g.hereNow}</p>` 后面加:

```tsx
                  <a
                    href={`/signals/gaps/deep?side=${g.side}&id=${g.signal_id}`}
                    target="_blank"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    一条讲透 ↗
                  </a>
```

- [ ] **Step 3: 验证并提交**

Run: `npx tsc --noEmit && npm run lint`
Expected: 全过

```bash
git add "app/(app)/signals/gaps/page.tsx" "app/(app)/signals/issue/issue-composer.tsx"
git commit -m "feat(signals): 差距清单和周刊挑条时每条都能点进一条讲透

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 周刊:材料和数字核对

**Files:**
- Modify: `lib/ai/signals.ts`(`IssueComposeInput`、`issueInputText`、`ISSUE_SHARED_RULES`、`parseIssueZh`、`parseIssueJa`、`composeIssue`)
- Modify: `lib/ai/signals.test.ts`

- [ ] **Step 1: 写测试**

`lib/ai/signals.test.ts` 顶上的 import 列表里加 `issueInputText`。「日文版要真是日文」那个 it 里两处 `parseIssueJa(ja)` / `parseIssueJa({ ...ja, … })` 改成多传一个 `input`:

```ts
    expect(parseIssueJa(ja, input).jaLong).toBe(ja.jaLong);
    expect(() => parseIssueJa({ ...ja, jaLong: "这周看到三件事。" }, input)).toThrow("不是日文");
```

同一个 describe 末尾加:

```ts
  it("十以上的数字必须在材料里：AI 自己加的不收，计数的小数字不查", () => {
    expect(() => parseIssueZh({ ...ok, zhLong: ok.zhLong + "\n美团已经送了 450000 单。" }, input)).toThrow("450000");
    const rich = { ...input, picks: [{ ...input.picks[0], thereFacts: [{ text: "美团无人机累计完成订单超过 45 万单。" }] }] };
    expect(parseIssueZh({ ...ok, zhLong: ok.zhLong + "\n美团无人机累计完成订单超过 45 万单。" }, rich).zhLong).toContain("45 万单");
    expect(parseIssueZh({ ...ok, zhLong: ok.zhLong + "\n卡在 3 个条件上。" }, input).zhLong).toContain("3 个条件");
    expect(() => parseIssueJa({ jaLong: "美団は 450000 件を配送しました。", jaTitles: ["t"] }, input)).toThrow("450000");
  });

  it("新料写进给 AI 的材料：那边查到的、头疼的原话、同类先例、官报", () => {
    const text = issueInputText({
      ...input,
      picks: [
        {
          ...input.picks[0],
          thereFacts: [{ text: "美团开通 53 条航线。" }],
          voices: { pain: "药送不到离岛", counts: { complain: 2, seek: 1, workaround: 0 }, quotes: ["離島で薬を買うのが大変"] },
          benchmark: "图谱里「外卖、餐饮」有 2 件。",
          kanpo: ["株式会社譚仔日本（2026-10-16 官报，第3期）：总资产 3.2亿円"],
        },
      ],
    });
    for (const s of ["美团开通 53 条航线。", "药送不到离岛", "離島で薬を買うのが大変", "图谱里「外卖、餐饮」有 2 件。", "株式会社譚仔日本"]) {
      expect(text).toContain(s);
    }
  });
```

- [ ] **Step 2: 跑一下,确认失败**

Run: `npx vitest run lib/ai/signals.test.ts -t "周刊"`
Expected: FAIL(`issueInputText` 没导出 / 没有数字核对)

- [ ] **Step 3: 写实现**

文件顶上加:

```ts
import { numbersIn } from "@/lib/domains/jobs/provenance-shared";
```

`IssueComposeInput` 的 picks 里,`judgment: string;` 前面加(字段叫 `thereFacts`,因为 `there` 已经是"那边"的地名):

```ts
    /** 「那边查一查」查到的事实（一条讲透里查过才有）。 */
    thereFacts?: { text: string }[];
    /** 这边有没有人在头疼：那件麻烦、三种各几句、最多 3 句原话（日文）。 */
    voices?: { pain: string; counts: { complain: number; seek: number; workaround: number }; quotes: string[] };
    /** 同类东西以前来日本的结果（时差图谱的一句基准）。 */
    benchmark?: string;
    /** 对上的官报决算，一条一行。 */
    kanpo?: string[];
```

`function issueInputText(input: IssueComposeInput): string {` 改成 `export function issueInputText(input: IssueComposeInput): string {`,
picks 那个数组里,`p.conditions && …` 那一项后面、`` `【他的判断】${p.judgment}` `` 前面加:

```ts
      p.thereFacts && p.thereFacts.length > 0 ? `${p.there}那边查到的：${p.thereFacts.map((f) => f.text).join("；")}` : "",
      p.voices
        ? `${p.here}这边有没有人在头疼「${p.voices.pain}」：网上的原话里，在抱怨 ${p.voices.counts.complain} 句、在找办法 ${p.voices.counts.seek} 句、已经在花钱花力气绕路 ${p.voices.counts.workaround} 句${
            p.voices.quotes.length > 0 ? `；例（日文原话，引用时译成中文）：${p.voices.quotes.map((q) => `「${q}」`).join("")}` : ""
          }。网上抱怨的人不等于会掏钱的人。`
        : "",
      p.benchmark ? `以前同类的东西来日本：${p.benchmark}` : "",
      p.kanpo && p.kanpo.length > 0 ? `官报决算公告：${p.kanpo.join("；")}` : "",
```

`ISSUE_SHARED_RULES` 里

```
- 长文的结构：开头一两句说这一期讲什么（他写了开头就用他的）；每条一个小标题，下面依次写那边是什么、这边现在怎样、为什么是现在、能不能搬过来（给了才写），最后一段是他的判断；最后是对账（给了才写）：他押过什么、结果对了 / 错了 / 还在等，照实写，错了也写。`;
```

改成

```
- 长文的结构：开头一两句说这一期讲什么（他写了开头就用他的）；每条一个小标题，下面依次写那边是什么（给了"那边查到的"就用上）、这边现在怎样、为什么是现在、能不能搬过来、这边有没有人在头疼、以前同类的东西来日本的结果、官报决算（这几样给了才写，没给的不提），最后一段是他的判断；最后是对账（给了才写）：他押过什么、结果对了 / 错了 / 还在等，照实写，错了也写。
- 数字只能用下面材料里出现过的（代码会核对，十以上的数字对不上就作废重写）。`;
```

在 `parseIssueZh` 前面加:

```ts
/** AI 写的部分里，大于 10 的数字必须在给它的材料里出现过（小数字是"三个条件""第 1 条"这类计数）。返回第一个对不上的。 */
export function unsupportedIssueNumber(aiTexts: string[], material: string): string | null {
  const allowed = new Set(numbersIn(material));
  for (const t of aiTexts) for (const n of numbersIn(t)) if (Number(n) > 10 && !allowed.has(n)) return n;
  return null;
}
```

`parseIssueZh` 里 `assertChineseAllowingNames(aiTexts);` 后面加:

```ts
  const bad = unsupportedIssueNumber(aiTexts, issueInputText(input));
  if (bad) throw new Error(`数字「${bad}」在材料里找不到`);
```

`parseIssueJa` 改成:

```ts
export function parseIssueJa(value: unknown, input: IssueComposeInput): { jaLong: string; jaTitles: string[] } {
  const v = (value ?? {}) as Record<string, unknown>;
  const jaLong = typeof v.jaLong === "string" ? v.jaLong.trim() : "";
  const jaTitles = titlesOf(v.jaTitles);
  if (!jaLong || jaTitles.length === 0) throw new Error("缺字段");
  // 有平假名才是日文（整篇写成中文的不收）
  if (!/[぀-ゟ]/.test(jaLong)) throw new Error("不是日文");
  const bad = unsupportedIssueNumber([jaLong, ...jaTitles], `${issueInputText(input)}\n${issuePhrasesText(input)}`);
  if (bad) throw new Error(`数字「${bad}」在材料里找不到`);
  return { jaLong, jaTitles };
}
```

`composeIssue` 里 `call("signal_issue_ja", ISSUE_JA_PROMPT, parseIssueJa, …)` 改成 `call("signal_issue_ja", ISSUE_JA_PROMPT, (v) => parseIssueJa(v, input), …)`,
两个 retryHint 末尾各加一句「十以上的数字只能用材料里有的。」

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run lib/ai/signals.test.ts && npx tsc --noEmit`
Expected: PASS;无类型错误

- [ ] **Step 5: 提交**

```bash
git add lib/ai/signals.ts lib/ai/signals.test.ts
git commit -m "feat(signals): 周刊的材料多四样（那边查到的、头疼的原话、同类先例、官报），AI 写的十以上的数字必须在材料里

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 周刊:带上料、从一条讲透跳过来

**Files:**
- Modify: `lib/domains/signals/issue-shared.ts`(`IssuePick` 新字段)
- Modify: `lib/domains/signals/issue.ts`(`buildPick`、`composeAndSaveIssue`、`issueCandidates`)
- Modify: `app/(app)/signals/issue/page.tsx`、`app/(app)/signals/issue/issue-composer.tsx`

这一步的逻辑都在数据库和页面上(`buildPick` 读 Supabase),没有新的纯函数要测;靠 tsc、已有测试和他打开页面验证。

- [ ] **Step 1: `IssuePick` 新字段**

`lib/domains/signals/issue-shared.ts` 顶上加 `import type { VoiceKind } from "./voices-shared";`,`IssuePick` 里 `searchPhrases?: string[];` 后面加:

```ts
  /** 「那边查一查」查到的事实（一条讲透里查过才有）。 */
  thereFacts?: { text: string; url: string; title: string }[];
  /** 这边有没有人在为这件麻烦头疼（查过才有）：那件麻烦、三种各几句、最多 3 句原话。 */
  voices?: { pain: string; counts: Record<VoiceKind, number>; quotes: string[] };
  /** 同类东西以前来日本的结果（他在一条讲透里点了类别才有）。 */
  benchmark?: string;
  /** 对上的官报决算，一条一行。 */
  kanpo?: string[];
```

- [ ] **Step 2: `buildPick` 和 `composeAndSaveIssue`**

`lib/domains/signals/issue.ts` import 区加:

```ts
import { baseSentence, categoryBase, countedCases, listTransferCases } from "./atlas";
import { gapKanpo, kanpoLines, loadGapDeeps } from "./deep";
import type { GapDeep } from "./deep-shared";
import { voiceCounts } from "./voices-shared";
```

`buildPick` 前面加一个找差距的小函数,`buildPick` 改用它,并多收一个 `extra` 参数:

```ts
function findBoardGap(board: Awaited<ReturnType<typeof listGapBoard>>, side: GapSide, signalId: string) {
  const arrived = board.sides[side].arrived.find((g) => g.signal_id === signalId);
  const open = board.sides[side].open.find((g) => g.signal_id === signalId);
  return { arrived, gap: (arrived ?? open) as JapanGap | undefined };
}

type PickExtra = { deep: GapDeep | undefined; benchmark: string | undefined; kanpo: string[] };
```

`buildPick` 的签名末尾加 `extra: PickExtra`;开头的

```ts
  const arrived = board.sides[side].arrived.find((g) => g.signal_id === signalId);
  const open = board.sides[side].open.find((g) => g.signal_id === signalId);
  const gap: JapanGap | undefined = arrived ?? open;
```

换成

```ts
  const { arrived, gap } = findBoardGap(board, side, signalId);
```

`const phrases = …` 前面加 `const v = voices.get(transferKey(side, signalId));`,`phrases` 改用 `v?.queries ?? []`;再加 `const facts = extra.deep?.there?.facts ?? [];`。
`sources` 数组末尾加:

```ts
    ...facts.map((f) => ({ title: f.title, url: f.url })),
    ...(v?.quotes ?? []).slice(0, 3).map((q) => ({ title: q.title, url: q.url })),
```

return 的对象末尾(`...(phrases.length > 0 ? … : {}),` 后面)加:

```ts
    ...(facts.length > 0 ? { thereFacts: facts.map((f) => ({ text: f.text, url: f.url, title: f.title })) } : {}),
    ...(v && v.quotes.length > 0 ? { voices: { pain: v.pain, counts: voiceCounts(v.quotes), quotes: v.quotes.slice(0, 3).map((q) => q.excerpt) } } : {}),
    ...(extra.benchmark ? { benchmark: extra.benchmark } : {}),
    ...(extra.kanpo.length > 0 ? { kanpo: extra.kanpo } : {}),
```

`composeAndSaveIssue` 里

```ts
  const [board, transfers, candidates, voices] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapTransfers(userId),
    issueCandidates(userId),
    loadGapVoices(userId),
  ]);
  const picks = input.picks.map((p, i) => buildPick(board, transfers, voices, p.side, p.signal_id, stances[i]!, p.note));
```

换成

```ts
  const [board, transfers, candidates, voices, deeps, cases] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapTransfers(userId),
    issueCandidates(userId, input.picks),
    loadGapVoices(userId),
    loadGapDeeps(userId),
    listTransferCases(userId).catch(() => "missing-schema" as const),
  ]);
  // 一条讲透里攒的料：类别 → 同类基准；对上的官报决算（查不到就少这一样，不拦着写）
  const extras = await Promise.all(
    input.picks.map(async (p): Promise<PickExtra> => {
      const deep = deeps.get(transferKey(p.side, p.signal_id));
      const { gap } = findBoardGap(board, p.side, p.signal_id);
      const kanpo = gap ? await gapKanpo(userId, gap, deep ?? null).catch(() => null) : null;
      const benchmark =
        deep?.category && cases !== "missing-schema" && gapPlaces(p.side).here === "日本"
          ? baseSentence(deep.category, categoryBase(countedCases(cases).filter((c) => c.category === deep.category)))
          : undefined;
      return { deep, benchmark, kanpo: kanpo ? kanpoLines(kanpo) : [] };
    })
  );
  const picks = input.picks.map((p, i) => buildPick(board, transfers, voices, p.side, p.signal_id, stances[i]!, p.note, extras[i]));
```

`composeIssue({ … picks: picks.map((p) => { … return { … searchPhrases: p.searchPhrases, }; }) })` 的 return 里加:

```ts
        thereFacts: p.thereFacts,
        voices: p.voices,
        benchmark: p.benchmark,
        kanpo: p.kanpo,
```

`issueCandidates` 多收一个参数,让从一条讲透跳过来的那条(可能超过两周)也在候选里:

```ts
export async function issueCandidates(
  userId: string,
  include: { side: GapSide; signal_id: string }[] = []
): Promise<{ gaps: IssueCandidate[]; bets: IssueBet[] }> {
```

两个 `.filter((g) => g.arrivedOn >= since)` / `.filter((g) => g.brief_date >= since)` 分别改成

```ts
      .filter((g) => g.arrivedOn >= since || include.some((x) => x.side === side && x.signal_id === g.signal_id))
```

```ts
      .filter((g) => g.brief_date >= since || include.some((x) => x.side === side && x.signal_id === g.signal_id))
```

- [ ] **Step 3: 周刊页接住 `?pick=`**

`app/(app)/signals/issue/page.tsx`:

import 区加:

```ts
import { loadGapDeep } from "@/lib/domains/signals/deep";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
```

`export default async function IssuePage() {` 改成

```ts
export default async function IssuePage({ searchParams }: { searchParams: { pick?: string } }) {
```

`const weekStart = …` 后面加:

```ts
  // 从一条讲透点「用这一条写一期」过来：预选那一条，带上在那一页点的判断和类别
  const [pickSide, pickId] = (searchParams.pick ?? "").split(":");
  const include =
    (["japan", "us", "china"] as GapSide[]).includes(pickSide as GapSide) && /^[0-9a-f-]{36}$/i.test(pickId ?? "")
      ? { side: pickSide as GapSide, signal_id: pickId }
      : null;
```

`Promise.all` 里 `issueCandidates(user.id),` 改成 `issueCandidates(user.id, include ? [include] : []),`,并在数组末尾加一项
`include ? loadGapDeep(user.id, include.side, include.signal_id).catch(() => null) : Promise.resolve(null),`,
解构那一行末尾加 `, pickedDeep`。`<IssueComposer` 加一个 prop:

```tsx
            preselect={
              include
                ? {
                    ...include,
                    stance: pickedDeep && pickedDeep !== "missing-schema" ? (pickedDeep.stance?.stance ?? {}) : {},
                    note: pickedDeep && pickedDeep !== "missing-schema" ? (pickedDeep.stance?.note ?? "") : "",
                    category: pickedDeep && pickedDeep !== "missing-schema" ? (pickedDeep.category ?? undefined) : undefined,
                  }
                : null
            }
```

- [ ] **Step 4: 编辑器预选**

`issue-composer.tsx`:`IssueComposer` 的 props 类型加

```ts
  /** 从一条讲透跳过来的那一条：预选上，带着在那一页点的判断。 */
  preselect: { side: string; signal_id: string; stance: Partial<PickStance>; note: string; category?: AtlasCategory } | null;
```

解构里加 `preselect,`;`picked` 的初始值改成:

```ts
  const [picked, setPicked] = useState<Record<string, PickInput>>(() => {
    const base: Record<string, PickInput> = Object.fromEntries(
      (initial?.content.picks ?? []).map((p) => [keyOf(p), { stance: p.stance ?? {}, note: p.note ?? "" }])
    );
    if (preselect && !(keyOf(preselect) in base) && Object.keys(base).length < ISSUE_MAX_PICKS) {
      base[keyOf(preselect)] = { stance: preselect.stance, note: preselect.note, category: preselect.category };
    }
    return base;
  });
```

- [ ] **Step 5: 验证并提交**

Run: `npx tsc --noEmit && npm run lint && npx vitest run lib/domains/signals lib/ai`
Expected: 全过

```bash
git add lib/domains/signals/issue-shared.ts lib/domains/signals/issue.ts "app/(app)/signals/issue/page.tsx" "app/(app)/signals/issue/issue-composer.tsx"
git commit -m "feat(signals): 周刊每条带上一条讲透的料；从一条讲透点「用这一条写一期」预选那一条、带着判断

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 宪法、设计文档、全部验证

**Files:**
- Modify: `CLAUDE.md`(CRLF,Python 按字节改)
- Modify: `docs/superpowers/specs/2026-10-17-signals-depth-design.md`

- [ ] **Step 1: 宪法**

```bash
python - <<'EOF'
p = "CLAUDE.md"
s = open(p, "rb").read().decode("utf-8")
old = "不打分、不写趋势评语;不打分、不给投资建议 |"
assert s.count(old) == 1
new = ("不打分、不写趋势评语;**一条讲透**(/signals/gaps/deep,从差距清单和周刊每条进;迁移 083 signal_gap_deep):"
       "一条差距的八样料放一页(那边是怎么回事、这边现在怎样、能不能搬过来、这边有人头疼吗、同类先例、官报、有没有人掏钱、你的判断),"
       "缺的一步一个请求按顺序补;新的「那边查一查」用那边的语言搜两次,AI 最多摘 6 条事实(谁在做、做到多大、怎么收钱、哪年开始),"
       "原文逐字核对、数字和公司名必须在那句原文里;类别和判断存在这一页,到周刊页还在;周刊每条带上这些料,AI 写的十以上的数字必须在料里;"
       "**去空话**:条目收尾只给前面下结论的话(「这表明……」「,这意味着……」)由代码删掉(lib/domains/signals/filler.ts,生成时和显示时各删一遍),"
       "删掉的存在条目上,信息源体检页能看删了哪些;不打分、不给投资建议 |")
s = s.replace(old, new)
old2 = "  抓取在本机(lib/domains/signals/kanpo-fetch.ts、kanpo-pdf.ts,页面不 import),读写在 lib/domains/signals/kanpo.ts。\r\n"
assert s.count(old2) == 1
s = s.replace(old2, old2 + "  signal_gap_deep(迁移 083):一条讲透里存的那边查一查(there)、他点的类别(category)、判断(stance);主键 (user_id, signal_id, side);读写在 lib/domains/signals/deep.ts。\r\n")
open(p, "wb").write(s.encode("utf-8"))
EOF
file CLAUDE.md
```

Expected: `with CRLF line terminators`

- [ ] **Step 2: 设计文档补记**

在 `docs/superpowers/specs/2026-10-17-signals-depth-design.md` 末尾加一节「## 写计划时定下的」,把本计划开头那一节的几条照搬过去(函数位置、新 AI 文件、数字核对只核阿拉伯数字、周刊只查十以上、表主键、JapanGap 加 basis、官报名单匹配、浏览器验证由他来)。

- [ ] **Step 3: 全部验证**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全过(之前 976 个,这次多出 filler、deep-shared、signals-deep、kanpo-shared、signals 的新测试)

- [ ] **Step 4: 提交**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-17-signals-depth-design.md
git commit -m "docs(signals): 宪法写进一条讲透和去空话；设计文档补记写计划时定下的几条

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 交给他**

告诉他:迁移 083 要在 Supabase SQL Editor 里跑;跑完以后打开差距清单随便一条点「一条讲透」,点「把缺的都查一遍」看三步能不能跑完(每步三四十秒)。
分支 `feat/signals-depth` 还没合回 main,等他说。
再提醒设计文档里那两条对账(10 月 31 日前发出第一期;两周后背景最后一句是空话的降到 5% 以下),他改了以后可以押进判断账本。
