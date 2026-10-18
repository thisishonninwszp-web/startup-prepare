# 外部信号看得更快 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每条精选有一张代码画的「一图看懂」(起因 → 发生了什么 → 谁受影响 → 接下来盯什么),报告页和邮件都显示;邮件改成带图的 HTML;一条讲透页和周刊每条可以点「出一张配图」用 Gemini 出示意图。

**Architecture:** 四个框的字在「读正文重写」那一步由 AI 顺手写(`groundBrief`),规则在 `flow-shared.ts`(纯函数,数字必须在正文里)。
报告页用 HTML 画;邮件用 Edge 路由 `/api/flow-card` 画 PNG(和小红书封面同一套 `ImageResponse`),发邮件时服务器签名取图、当附件嵌进去。
示意图走 `lib/ai-gateway.ts` 新的出图入口,存进 Supabase Storage(迁移 085),页面用签名的临时链接显示。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase(含 Storage)、Gemini(`gemini-2.5-flash-image`)、`next/og`、nodemailer、vitest。

设计见 `docs/superpowers/specs/2026-10-18-signals-visual-design.md`。每个任务本地提交,不 push。
验证:`npx tsc --noEmit`、`npm run lint`、`npm test`;dev server 开着时不 `npm run build`。提交信息用「」不用 ASCII 双引号。

## 写计划时试出来的

- **Gemini 出图能用**:`gemini-2.5-flash-image`,用现在的 GEMINI_API_KEY,`config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } }`,
  8 秒一张,PNG 约 1.9MB,输出 1290 个图片 token。**提示词说了不要任何文字,它还是画了一个「BUY」** —— 图下面必须标明、他看过才用,
  页面上提醒"冒出了字或 logo 就重出一张"。
- **`next/og` 在本机用 tsx 直接跑会坏**(Windows 下它找自带英文字体时把路径拼成 `.\file:\D:\...`)。所以邮件的 PNG 不在定时任务里画,
  而是放一个 Edge 路由画(和 `/api/issue-card` 一样,那条已经在线上跑通),定时任务签好名去取。
- **中间件会把没登录的请求跳到 /login**:`/api/flow-card` 要加进 `middleware.ts` 的 `TOKEN_AUTH_PREFIXES`(靠签名认,不靠登录)。
- **这个目录里另一个会话正在跑**(「职业转换帮助功能」,cwd 同一个 `D:\projects\startup-prepare`),工作区里有它没提交的求职改动,
  还占了迁移 084(`084_job_hiring_contexts.sql`)。**不在这个目录切分支**:开一个独立的 git worktree 做(Task 0),迁移用 085。
  合回 main 的时候,`supabase/schema.sql`、`lib/ai/index.ts`、`CLAUDE.md` 可能和它的改动挨着,到时候再处理冲突。
- 邮件里图片显示(Gmail 认不认 `cid:`)要真发一封才知道 —— 发邮件要他同意,放在最后一步问他。

| # | 做什么 | 文件 | 测 |
|---|---|---|---|
| 0 | 开独立 worktree | — | — |
| 1 | 四个框的规则 | `lib/domains/signals/flow-shared.ts`、`brief.ts`(类型) | flow-shared.test |
| 2 | 读正文重写时写四个框 | `lib/ai/signals.ts`、`lib/domains/signals/brief.ts` | signals.test |
| 3 | 报告页显示一图看懂 | `app/(app)/signals/flow-view.tsx`、`page.tsx` | tsc/lint |
| 4 | 字体共用、卡片签名 | `lib/og-font.ts`、`lib/domains/signals/flow-card-shared.ts`、`app/api/issue-card/[id]/route.tsx` | flow-card-shared.test |
| 5 | 画 PNG 的 Edge 路由 | `app/api/flow-card/route.tsx`、`middleware.ts` | 本机起 dev server 取图看 |
| 6 | 邮件:纯文字版加内容、HTML 版 | `lib/domains/signals/notify.ts` | notify.test |
| 7 | 邮件:最值得点开的三条、取图当附件 | `lib/domains/signals/notify.ts` | tsc |
| 8 | 迁移 085(表 + bucket) | `supabase/migrations/085_signal_images.sql`、`supabase/schema.sql` | — |
| 9 | 出图入口和提示词 | `lib/ai-gateway.ts`、`lib/ai/signals-image.ts`、`lib/ai/index.ts` | signals-image.test |
| 10 | 出图、存图、签链接、action | `lib/domains/signals/images.ts`、`app/(app)/signals/actions.ts` | tsc |
| 11 | 「出一张配图」按钮 | `app/(app)/signals/gaps/illustration.tsx`、一条讲透页、周刊 | tsc/lint |
| 12 | 宪法、设计文档、全部验证、交给他 | `CLAUDE.md`、spec | 全部 |

---

### Task 0: 开独立 worktree

- [ ] **Step 1: 建 worktree 和分支(从现在的 main)**

```bash
cd /d/projects/startup-prepare
git worktree add ../startup-prepare-visual -b feat/signals-visual main
```

- [ ] **Step 2: 借用 node_modules、带上环境变量**

```bash
cmd //c mklink /J "D:\projects\startup-prepare-visual\node_modules" "D:\projects\startup-prepare\node_modules"
cp /d/projects/startup-prepare/.env.local /d/projects/startup-prepare-visual/.env.local
cd /d/projects/startup-prepare-visual && git status --short && npx tsc --noEmit && npx vitest run lib/domains/signals 2>&1 | tail -3
```

Expected:`git status` 干净(`node_modules`、`.env.local` 都在 .gitignore 里);tsc 无输出;测试全过。
**之后所有命令都在 `D:\projects\startup-prepare-visual` 里跑,文件路径也都指那边。**

---

### Task 1: 四个框的规则

**Files:**
- Create: `lib/domains/signals/flow-shared.ts`
- Create: `lib/domains/signals/flow-shared.test.ts`
- Modify: `lib/domains/signals/brief.ts`(`BriefItem` 加 `flow`)

- [ ] **Step 1: 写测试**

`lib/domains/signals/flow-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkFlow } from "./flow-shared";

const body = "日本银行10月30日决定把政策利率提高到0.75%。地方银行表示下周起上调贷款利率，中小企业的利息负担会加重。";
const ok = { cause: "物价连续上涨", event: "日银加息到0.75%", affected: "靠借款周转的中小企业", watch: "地方银行下周的贷款利率。" };

describe("一图看懂：四个框", () => {
  it("四个框都合格才画；句末的句号去掉", () => {
    expect(checkFlow(ok, body)).toEqual({ ...ok, watch: "地方银行下周的贷款利率" });
  });

  it("数字不在正文里、缺一个框、太长、不是对象：整张不画", () => {
    expect(checkFlow({ ...ok, event: "日银加息到1%" }, body)).toBeNull();
    expect(checkFlow({ ...ok, watch: "" }, body)).toBeNull();
    expect(checkFlow({ ...ok, affected: "长".repeat(25) }, body)).toBeNull();
    expect(checkFlow("x", body)).toBeNull();
  });

  it("「值得关注」「持续观察」、下结论的话：整张不画", () => {
    expect(checkFlow({ ...ok, watch: "值得持续关注" }, body)).toBeNull();
    expect(checkFlow({ ...ok, event: "这表明利率进入新阶段" }, body)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑一下,确认失败**

Run: `npx vitest run lib/domains/signals/flow-shared.test.ts`
Expected: FAIL(找不到 `./flow-shared`)

- [ ] **Step 3: 写实现**

`lib/domains/signals/flow-shared.ts`:

```ts
import { numbersIn } from "@/lib/domains/jobs/provenance-shared";
import { isCommentSentence } from "./filler";

/**
 * 一图看懂：每条精选四个框 —— 起因 → 发生了什么 → 谁受影响 → 接下来盯什么。
 * 字由 AI 在读正文重写那一步写，代码核对：四个框都要有、每框够短、数字都在正文里、不许下结论或"值得关注"。
 * 有一样不合格整张不画（返回 null），不拦报告。纯函数：报告页、邮件、Edge 画图路由都能引。
 */
export const FLOW_STEPS = { cause: "起因", event: "发生了什么", affected: "谁受影响", watch: "接下来盯什么" } as const;
export type FlowStep = keyof typeof FLOW_STEPS;
export type ItemFlow = Record<FlowStep, string>;

/** 提示词要每框 18 个字以内；核对放宽到 24 个字，免得多两个字就整张丢掉。 */
export const FLOW_PROMPT_CHARS = 18;
export const FLOW_MAX_CHARS = 24;

const VAGUE = /值得关注|值得注意|持续观察|持续关注|有待观察|拭目以待|密切关注|进一步观察/;

export function checkFlow(raw: unknown, body: string): ItemFlow | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const allowed = new Set(numbersIn(body));
  const out = {} as ItemFlow;
  for (const step of Object.keys(FLOW_STEPS) as FlowStep[]) {
    const text = typeof v[step] === "string" ? (v[step] as string).trim().replace(/[。！？]+$/, "") : "";
    if (!text || Array.from(text).length > FLOW_MAX_CHARS) return null;
    if (isCommentSentence(text) || VAGUE.test(text)) return null;
    if (numbersIn(text).some((n) => !allowed.has(n))) return null;
    out[step] = text;
  }
  return out;
}
```

`lib/domains/signals/brief.ts`:顶上加 `import type { ItemFlow } from "./flow-shared";`,`BriefItem` 的 `dropped?: string[];` 后面加:

```ts
  /** 一图看懂的四个框（读到正文、四个框都过了核对才有）。早期数据没有。 */
  flow?: ItemFlow;
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run lib/domains/signals/flow-shared.test.ts && npx tsc --noEmit`
Expected: PASS(3 个);无类型错误

- [ ] **Step 5: 提交**

```bash
git add lib/domains/signals/flow-shared.ts lib/domains/signals/flow-shared.test.ts lib/domains/signals/brief.ts
git commit -m "feat(signals): 一图看懂四个框的规则——数字要在正文里、不许下结论和「值得关注」，有一样不合格整张不画

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 读正文重写时写四个框

**Files:**
- Modify: `lib/ai/signals.ts`(`GROUND_PROMPT`、`GroundedPick`、`parseGroundedBrief`)
- Modify: `lib/ai/signals.test.ts`
- Modify: `lib/domains/signals/brief.ts`(`generateBrief` 带上 `flow`)

- [ ] **Step 1: 写测试**

`lib/ai/signals.test.ts` 文件末尾加(`parseGroundedBrief` 已经在顶上的 import 里):

```ts
describe("一图看懂：读正文重写时顺手写四个框", () => {
  const body = "日本银行10月30日决定把政策利率提高到0.75%。地方银行表示下周起上调贷款利率，中小企业的利息负担会加重。";
  const inputs = [{ index: 0, title: "t", summary: "s", body, draft: { headline: "h", background: "b", forYou: "f" } }];
  const item = (flow: unknown) => ({
    index: 0,
    headline: "日银加息到0.75%",
    background: "日本银行10月30日决定把政策利率提高到0.75%。",
    forYou: "中小企业的利息负担会加重。",
    basis: ["日本银行10月30日决定把政策利率提高到0.75%。"],
    flow,
  });

  it("四个框合格的留下", () => {
    const r = parseGroundedBrief(
      { overview: "日银加息。", items: [item({ cause: "物价连续上涨", event: "日银加息到0.75%", affected: "靠借款周转的中小企业", watch: "地方银行下周的贷款利率" })] },
      inputs
    );
    expect(r.items[0].flow?.event).toBe("日银加息到0.75%");
  });

  it("数字对不上就不画，条目照留", () => {
    const r = parseGroundedBrief(
      { overview: "日银加息。", items: [item({ cause: "物价连续上涨", event: "日银加息到1%", affected: "中小企业", watch: "地方银行下周的贷款利率" })] },
      inputs
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].flow).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑一下,确认失败**

Run: `npx vitest run lib/ai/signals.test.ts -t "一图看懂"`
Expected: FAIL(`flow` 是 undefined)

- [ ] **Step 3: 写实现**

`lib/ai/signals.ts` 顶上加:

```ts
import { checkFlow, FLOW_PROMPT_CHARS, type ItemFlow } from "@/lib/domains/signals/flow-shared";
```

`GroundedPick` 的 `basis: string[];` 后面加:

```ts
  /** 一图看懂的四个框（过了核对才有）。 */
  flow?: ItemFlow;
```

`GROUND_PROMPT` 里 `- basis：1 到 3 句正文原文……是 background 里事实的出处。` 那一行后面加:

```
- flow：一图看懂的四个框，每框一句、${FLOW_PROMPT_CHARS} 个字以内：
  cause（起因：为什么会发生）、event（发生了什么）、affected（谁受影响，具体到哪类人或企业）、watch（接下来盯什么：一件看得见的事，谁、做什么、什么时候）。
  框里的数字必须是正文里写了的；不许写"值得关注""持续观察"这类话，不许下结论。写不出来就不写 flow。
```

同一个提示词最后的 JSON 那一行改成:

```
只输出 JSON：{"overview":"…","items":[{"index":序号,"headline":"…","background":"…","forYou":"…","basis":["…"],"flow":{"cause":"…","event":"…","affected":"…","watch":"…"}}]}`;
```

`parseGroundedBrief` 里 `items.push({ … basis: basis.map((b) => b.slice(0, 200)), });` 改成:

```ts
    const flow = checkFlow(it.flow, input.body);
    items.push({
      index,
      headline: requireString(it, "headline"),
      background: requireString(it, "background"),
      forYou: requireString(it, "forYou"),
      basis: basis.map((b) => b.slice(0, 200)),
      ...(flow ? { flow } : {}),
    });
```

`lib/domains/signals/brief.ts` 的 `generateBrief` 里:

```ts
  const grounded = new Map<number, { headline: string; background: string; forYou: string; basis: string[] }>();
```

改成

```ts
  const grounded = new Map<number, { headline: string; background: string; forYou: string; basis: string[]; flow?: ItemFlow }>();
```

拼条目那一段 `basis: grounded.get(p.index)?.basis,` 后面加一行:

```ts
      flow: grounded.get(p.index)?.flow,
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run lib/ai/signals.test.ts && npx tsc --noEmit`
Expected: PASS;无类型错误

- [ ] **Step 5: 提交**

```bash
git add lib/ai/signals.ts lib/ai/signals.test.ts lib/domains/signals/brief.ts
git commit -m "feat(signals): 读正文重写时顺手写一图看懂的四个框，过了核对才存进条目

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 报告页显示一图看懂

**Files:**
- Create: `app/(app)/signals/flow-view.tsx`
- Modify: `app/(app)/signals/page.tsx`(`ReportItem`)

- [ ] **Step 1: 组件**

`app/(app)/signals/flow-view.tsx`:

```tsx
import { FLOW_STEPS, type FlowStep, type ItemFlow } from "@/lib/domains/signals/flow-shared";

/** 一图看懂：起因 → 发生了什么 → 谁受影响 → 接下来盯什么。手机上竖着排，宽屏横着排；「接下来盯什么」那一框用朱砂描边。 */
export function FlowView({ flow }: { flow: ItemFlow }) {
  const steps = Object.keys(FLOW_STEPS) as FlowStep[];
  return (
    <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch" aria-label="一图看懂">
      {steps.map((step, i) => (
        <li key={step} className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center">
          <div className={"flex-1 rounded-md border px-3 py-2 " + (step === "watch" ? "border-primary" : "border-border bg-card")}>
            <p className="text-xs text-muted-foreground">{FLOW_STEPS[step]}</p>
            <p className="text-sm leading-7">{flow[step]}</p>
          </div>
          {i < steps.length - 1 && (
            <span aria-hidden className="text-center text-muted-foreground">
              <span className="sm:hidden">↓</span>
              <span className="hidden sm:inline">→</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: 放进报告条目**

`app/(app)/signals/page.tsx`:import 区加 `import { FlowView } from "./flow-view";`。`ReportItem` 里

```tsx
              <p className="mt-2 text-base leading-8">{item.background}</p>
```

改成

```tsx
              {item.flow && <FlowView flow={item.flow} />}
              <p className="mt-2 text-base leading-8">{item.background}</p>
```

- [ ] **Step 3: 验证并提交**

Run: `npx tsc --noEmit && npm run lint`
Expected: 全过

```bash
git add "app/(app)/signals/flow-view.tsx" "app/(app)/signals/page.tsx"
git commit -m "feat(signals): 报告页点开一条，背景上面先是一图看懂的四个框

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 字体共用、卡片签名

**Files:**
- Create: `lib/og-font.ts`
- Modify: `app/api/issue-card/[id]/route.tsx`(改用共用的字体函数)
- Create: `lib/domains/signals/flow-card-shared.ts`
- Create: `lib/domains/signals/flow-card-shared.test.ts`

- [ ] **Step 1: 字体函数挪出来**

`lib/og-font.ts`:

```ts
/**
 * 画图（next/og 的 ImageResponse）用的中文字体：只下这张图用到的那几个字（Google Fonts 按 text 参数切子集），整包太大。
 * 只用 fetch，Edge 能用。拿不到返回 null —— 调用方别出一张全是方块的图。
 */
export async function loadOgFont(weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}
```

`app/api/issue-card/[id]/route.tsx`:删掉文件里的 `/** 只下这张图用到的那几个字……*/ async function loadFont(…) { … }` 整个函数,
import 区加 `import { loadOgFont } from "@/lib/og-font";`,两处 `loadFont(400, text), loadFont(700, text)` 改成 `loadOgFont(400, text), loadOgFont(700, text)`。

- [ ] **Step 2: 签名的测试**

`lib/domains/signals/flow-card-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFlowCard, signFlowCard } from "./flow-card-shared";

const card = { headline: "日银加息到0.75%", flow: { cause: "物价连续上涨", event: "日银加息到0.75%", affected: "中小企业", watch: "地方银行下周的贷款利率" } };

describe("邮件里的一图看懂：签了名才画", () => {
  it("签名对得上就原样读回来（中文不乱）", async () => {
    const { d, s } = await signFlowCard(card, "secret");
    expect(await readFlowCard(d, s, "secret")).toEqual(card);
  });

  it("内容被改过、密钥不对、缺参数：不画", async () => {
    const { d, s } = await signFlowCard(card, "secret");
    const other = await signFlowCard({ ...card, headline: "别的" }, "secret");
    expect(await readFlowCard(other.d, s, "secret")).toBeNull();
    expect(await readFlowCard(d, s, "wrong")).toBeNull();
    expect(await readFlowCard("", s, "secret")).toBeNull();
    expect(await readFlowCard(d, s, "")).toBeNull();
  });
});
```

Run: `npx vitest run lib/domains/signals/flow-card-shared.test.ts`
Expected: FAIL(找不到模块)

- [ ] **Step 3: 签名的实现**

`lib/domains/signals/flow-card-shared.ts`:

```ts
import type { ItemFlow } from "./flow-shared";

/**
 * 邮件里的一图看懂：发邮件的那一边（定时任务，Node）把标题和四个框签上名，交给 Edge 路由 /api/flow-card 画成 PNG。
 * 路由只画签过名的内容，免得谁都能拿它画任意文字。签名用 CRON_SECRET 做 HMAC-SHA256（Web Crypto，Node 和 Edge 都有）。
 */
export type FlowCardData = { headline: string; flow: ItemFlow };

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function signFlowCard(data: FlowCardData, secret: string): Promise<{ d: string; s: string }> {
  const d = toBase64Url(new TextEncoder().encode(JSON.stringify(data)));
  return { d, s: await hmac(secret, d) };
}

/** 签名对不上、内容不像一张卡片，都返回 null。 */
export async function readFlowCard(d: string, s: string, secret: string): Promise<FlowCardData | null> {
  if (!d || !s || !secret || (await hmac(secret, d)) !== s) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(fromBase64Url(d))) as FlowCardData;
    return typeof v?.headline === "string" && v.flow && typeof v.flow.event === "string" ? v : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 验证并提交**

Run: `npx vitest run lib/domains/signals/flow-card-shared.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS(2 个);无类型错误、无 lint 问题

```bash
git add lib/og-font.ts "app/api/issue-card/[id]/route.tsx" lib/domains/signals/flow-card-shared.ts lib/domains/signals/flow-card-shared.test.ts
git commit -m "feat(signals): 画图字体挪成共用函数；邮件里的一图看懂先签名（HMAC），路由只画签过名的

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 画 PNG 的 Edge 路由

**Files:**
- Create: `app/api/flow-card/route.tsx`
- Modify: `middleware.ts`

- [ ] **Step 1: 路由**

`app/api/flow-card/route.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { loadOgFont } from "@/lib/og-font";
import { FLOW_STEPS, type FlowStep } from "@/lib/domains/signals/flow-shared";
import { readFlowCard } from "@/lib/domains/signals/flow-card-shared";

// 邮件里的「一图看懂」：标题 + 四个框加箭头，画成 1200×560 的 PNG。只画定时任务签过名的内容（见 flow-card-shared.ts）。
// 和 /api/issue-card 一样用 Edge runtime（next/og 在本机 Node 下找字体会出错）。
export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 560;

// 颜色取自 app/globals.css 的语义 token（图片里用不了 CSS 变量），和封面图同一套。
const COLOR = {
  paper: "hsl(40, 20%, 97.5%)",
  card: "hsl(0, 0%, 100%)",
  ink: "hsl(30, 8%, 12%)",
  accent: "hsl(16, 84%, 47%)",
  muted: "hsl(30, 5%, 42%)",
  rule: "hsl(40, 10%, 87%)",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const card = await readFlowCard(params.get("d") ?? "", params.get("s") ?? "", process.env.CRON_SECRET ?? "");
  if (!card) return new Response("签名对不上", { status: 403 });

  const steps = Object.keys(FLOW_STEPS) as FlowStep[];
  const text = ["一图看懂→", card.headline, ...steps.flatMap((s) => [FLOW_STEPS[s], card.flow[s]])].join("");
  const [regular, bold] = await Promise.all([loadOgFont(400, text), loadOgFont(700, text)]);
  if (!regular || !bold) return new Response("字体没下载下来", { status: 503 });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: COLOR.paper, padding: 48, fontFamily: "Noto Sans SC" }}>
        <div style={{ display: "flex", fontSize: 22, color: COLOR.accent }}>一图看懂</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 34, fontWeight: 700, color: COLOR.ink, lineHeight: 1.4 }}>{card.headline}</div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", marginTop: 24 }}>
          {steps.map((step, i) => (
            <div key={step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 220,
                  padding: "18px 20px",
                  borderRadius: 12,
                  background: COLOR.card,
                  border: `3px solid ${step === "watch" ? COLOR.accent : COLOR.rule}`,
                }}
              >
                <div style={{ display: "flex", fontSize: 22, color: COLOR.muted }}>{FLOW_STEPS[step]}</div>
                <div style={{ display: "flex", marginTop: 10, fontSize: 28, color: COLOR.ink, lineHeight: 1.5 }}>{card.flow[step]}</div>
              </div>
              {i < steps.length - 1 && <div style={{ display: "flex", padding: "0 10px", fontSize: 34, color: COLOR.muted }}>→</div>}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Noto Sans SC", data: regular, weight: 400 },
        { name: "Noto Sans SC", data: bold, weight: 700 },
      ],
    }
  );
}
```

- [ ] **Step 2: 中间件放行(靠签名,不靠登录)**

`middleware.ts`:

```ts
const TOKEN_AUTH_PREFIXES = ["/api/cron/", "/api/share", "/record/", "/soon/"];
```

改成

```ts
const TOKEN_AUTH_PREFIXES = ["/api/cron/", "/api/share", "/api/flow-card", "/record/", "/soon/"];
```

上面那段注释末尾补一句:`一图看懂的卡片（/api/flow-card）靠 CRON_SECRET 签名，发邮件时由服务器去取，也没有登录 cookie。`

- [ ] **Step 3: 本机看一眼画出来的图**

worktree 里起 dev server 需要在 `.claude/launch.json`(主目录那份)加一条 —— **先问他**:

```json
{ "name": "ideaos-visual", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "D:/projects/startup-prepare-visual", "run", "dev", "--", "-p", "3200"], "port": 3200 }
```

他同意后 `preview_start` 起 `ideaos-visual`,签一张卡片的地址(临时脚本,不提交):

`scripts/tmp-sign-card.ts`:

```ts
import { signFlowCard } from "@/lib/domains/signals/flow-card-shared";
async function main(): Promise<void> {
  const { d, s } = await signFlowCard(
    { headline: "日银加息到0.75%，地方银行下周跟进", flow: { cause: "物价连续上涨", event: "日银加息到0.75%", affected: "靠借款周转的中小企业", watch: "地方银行下周的贷款利率" } },
    process.env.CRON_SECRET!
  );
  console.log(`http://localhost:3200/api/flow-card?d=${d}&s=${s}`);
}
main();
```

```bash
URL=$(npx tsx --env-file=.env.local scripts/tmp-sign-card.ts) && curl -s -o "$TEMP/flow-card.png" -w "%{http_code} %{content_type}\n" "$URL" && curl -s -o /dev/null -w "%{http_code}\n" "${URL%s=*}s=wrong"
rm scripts/tmp-sign-card.ts
```

Expected:第一行 `200 image/png`,第二行 `403`。用 Read 打开 `$TEMP/flow-card.png` 看:四个框、箭头、中文没有方块、「接下来盯什么」是朱砂边。
他不同意加 launch 配置的话,这一步改到合回 main 以后、用主目录的 dev server 做。

- [ ] **Step 4: 验证并提交**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add app/api/flow-card/route.tsx middleware.ts
git commit -m "feat(signals): /api/flow-card 把签过名的一图看懂画成 PNG（Edge），中间件放行

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 邮件:纯文字版加内容、HTML 版

**Files:**
- Modify: `lib/domains/signals/notify.ts`(`DailyEmailInput`、`buildDailyEmail`、新 `buildDailyEmailHtml`、`firstSentence`)
- Modify: `lib/domains/signals/notify.test.ts`

- [ ] **Step 1: 写测试**

`lib/domains/signals/notify.test.ts` 顶上的 import 改成:

```ts
import { buildDailyEmail, buildDailyEmailHtml, emailConfig, firstSentence, isFriday, isMonday } from "./notify";
```

文件末尾加:

```ts
describe("邮件更丰富：最值得点开的几条带背景，各条带一句话", () => {
  const input = {
    date: "2026-10-13",
    digest: "今天最重要的是日银加息。",
    top: [
      {
        signal_id: "s1",
        headline: "日银加息到0.75%",
        background: "日本银行决定把政策利率提高到0.75%。地方银行下周跟进。",
        flow: { cause: "物价连续上涨", event: "日银加息到0.75%", affected: "中小企业", watch: "地方银行下周的贷款利率" },
      },
    ],
    practice: null,
    overview: null,
    sections: [{ title: "今天的世界", items: [{ headline: "物流业招外国司机", background: "人手不足越来越严重。好几家公司开始招外国司机。" }] }],
    dueCount: 0,
    freshQuestions: [],
    url: "https://app.example",
  };

  it("纯文字版：总览之后是最值得点开的几条（带背景），各条下面一句话", () => {
    const { text } = buildDailyEmail(input);
    expect(text.indexOf("最值得点开的几条")).toBeGreaterThan(text.indexOf("今天最重要的是日银加息"));
    expect(text).toContain("日本银行决定把政策利率提高到0.75%。地方银行下周跟进。");
    expect(text).toContain("  人手不足越来越严重。");
    expect(text).not.toContain("好几家公司开始招外国司机");
  });

  it("HTML 版：有图的嵌 cid 图片，没图只有文字；正文里的尖括号转义", () => {
    const html = buildDailyEmailHtml({ ...input, digest: "A<B" }, { s1: "flow-s1@ideaos" });
    expect(html).toContain('src="cid:flow-s1@ideaos"');
    expect(html).toContain("日银加息到0.75%");
    expect(html).toContain("A&lt;B");
    expect(buildDailyEmailHtml(input, {})).not.toContain("cid:");
    expect(html).toContain("https://app.example/signals");
  });

  it("一句话就是第一句", () => {
    expect(firstSentence("第一句。第二句。")).toBe("第一句。");
    expect(firstSentence("没有句号")).toBe("没有句号");
  });
});
```

- [ ] **Step 2: 跑一下,确认失败**

Run: `npx vitest run lib/domains/signals/notify.test.ts`
Expected: FAIL(`buildDailyEmailHtml`、`firstSentence` 不存在)

- [ ] **Step 3: 写实现**

`lib/domains/signals/notify.ts` 顶上加 `import type { ItemFlow } from "./flow-shared";`。

`DailyEmailInput` 里:

```ts
  /** 每一节的精选（只要标题和两种提示）。 */
  sections: { title: string; items: Pick<BriefItem, "headline" | "related_question" | "surprise">[] }[];
```

改成

```ts
  /** 今日总览挑的最值得点开的几条（最多 3 条）：标题、背景、一图看懂。 */
  top?: { signal_id: string; headline: string; background: string; flow?: ItemFlow }[];
  /** 每一节的精选：标题、背景（邮件里只放第一句）、两种提示。 */
  sections: { title: string; items: (Pick<BriefItem, "headline" | "related_question" | "surprise"> & { background?: string })[] }[];
```

`buildDailyEmail` 前面加:

```ts
/** 一段话的第一句（邮件里各条只放一句）。 */
export function firstSentence(text: string): string {
  return text.match(/^[^。！？]+[。！？]?/)?.[0] ?? text;
}
```

`buildDailyEmail` 里 `if (input.digest) lines.push(input.digest, "");` 后面加:

```ts
  if (input.top && input.top.length > 0) {
    lines.push("最值得点开的几条");
    for (const t of input.top) lines.push(`· ${t.headline}`, `  ${t.background}`);
    lines.push("");
  }
```

各节那一段 `lines.push(`· ${item.headline}`);` 后面加:

```ts
      if (item.background) lines.push(`  ${firstSentence(item.background)}`);
```

`buildDailyEmail` 后面加 HTML 版(和纯文字版同一个顺序 —— 改一个记得改另一个):

```ts
/** 邮件颜色：由 app/globals.css 的语义 token 换算成 hex（邮件客户端不一定认 hsl() 和 CSS 变量）。 */
const EMAIL_COLOR = { paper: "#faf9f7", card: "#ffffff", ink: "#211f1c", accent: "#dd4913", muted: "#706b66", rule: "#e1dfdb" };

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * HTML 版邮件：最值得点开的几条带背景和一图看懂（images：signal_id → 附件的 cid，没有的就不放图），各节每条标题 + 一句话。
 * 只用行内样式（邮件客户端不认外部样式和 flex）。和纯文字版同一个顺序。
 */
export function buildDailyEmailHtml(input: DailyEmailInput, images: Record<string, string>): string {
  const C = EMAIL_COLOR;
  const para = (text: string, style = "") => `<p style="margin:0 0 12px;font-size:15px;line-height:1.75;color:${C.ink};${style}">${esc(text)}</p>`;
  const head = (text: string) => `<p style="margin:28px 0 8px;font-size:13px;color:${C.muted};">${esc(text)}</p>`;
  const link = (href: string, text: string) => `<p style="margin:0 0 12px;font-size:14px;"><a href="${esc(href)}" style="color:${C.accent};">${esc(text)}</a></p>`;
  const parts: string[] = [];
  if (input.digest) parts.push(para(input.digest));
  if (input.top && input.top.length > 0) {
    parts.push(head("最值得点开的几条"));
    for (const t of input.top) {
      parts.push(`<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${C.rule};border-radius:8px;background:${C.card};">`);
      parts.push(para(t.headline, "font-weight:600;"), para(t.background));
      const cid = images[t.signal_id];
      if (cid) parts.push(`<img src="cid:${esc(cid)}" alt="一图看懂" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:6px;" />`);
      parts.push("</div>");
    }
  }
  if (input.practice) {
    parts.push(head("今天的练习"), para(`读这一条：${input.practice.headline}`), para(`问题：${input.practice.question}`), para("先写下你的判断，再看 AI 怎么拆。", `color:${C.muted};`));
  }
  if (input.fastAlerts && input.fastAlerts.length > 0) parts.push(head("这一周动得不寻常的"), ...input.fastAlerts.map((a) => para(`· ${a}`)));
  if (input.dueCount > 0) parts.push(para(`有 ${input.dueCount} 条判断到期了，去对一下账。`));
  for (const q of input.freshQuestions) parts.push(para(`你在追的「${q.question}」：和上一轮比，新冒出来 ${q.freshCount} 条证据。`));
  if (input.overview) parts.push(para(input.overview));
  for (const s of input.sections) {
    if (s.items.length === 0) continue;
    parts.push(head(`【${s.title}】`));
    for (const item of s.items) {
      parts.push(para(`· ${item.headline}`, "margin-bottom:2px;"));
      if (item.background) parts.push(para(firstSentence(item.background), `font-size:14px;color:${C.muted};`));
      if (item.surprise) parts.push(para(`↳ 意外：原本以为${item.surprise.expected}，结果${item.surprise.actual}。为什么？`, "font-size:14px;"));
      if (item.related_question) parts.push(para(`↳ 跟你在追的「${item.related_question.question}」有关`, "font-size:14px;"));
    }
  }
  if (input.issueReminder) {
    parts.push(
      para(
        input.issueReminder === "unwritten"
          ? "今天周五，这周的周刊还没写。挑一两条、每条点三下就是判断，十分钟的事。"
          : "今天周五，这周的周刊写好了，还没发出去。"
      )
    );
    if (input.url) parts.push(link(`${input.url}/signals/issue`, "去写周刊"));
  }
  if (isMonday(input.date)) {
    parts.push(para("今天是周一，看一眼慢变量：人口、劳动年龄人口、物价、汇率，这一周又往哪边挪了一点。"));
    if (input.url) parts.push(link(`${input.url}/signals/slow`, "慢变量"), link(`${input.url}/signals/week`, "上一周的周报"));
  }
  if (input.url) parts.push(link(`${input.url}/signals`, "打开今天的报告"));
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:${C.paper};font-family:-apple-system,'PingFang SC','Hiragino Sans','Noto Sans SC',sans-serif;"><div style="max-width:600px;margin:0 auto;">${parts.join("")}</div></body></html>`;
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run lib/domains/signals/notify.test.ts && npx tsc --noEmit`
Expected: PASS(原来的和新加的都过)

- [ ] **Step 5: 提交**

```bash
git add lib/domains/signals/notify.ts lib/domains/signals/notify.test.ts
git commit -m "feat(signals): 邮件更丰富——最值得点开的几条带背景，各条带一句话；加 HTML 版（一图看懂用 cid 嵌图）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 邮件:最值得点开的三条、取图当附件

**Files:**
- Modify: `lib/domains/signals/notify.ts`(`loadEmailInput`、`sendDailyEmail`)

- [ ] **Step 1: 读出最值得点开的三条**

`notify.ts` 顶上加:

```ts
import type { DigestPick } from "./digest";
import { cleanBriefItem } from "./filler";
import { signFlowCard } from "./flow-card-shared";
```

`loadEmailInput` 里 `const practiceItem = …` 后面加:

```ts
  // 今日总览挑的那几条：标题、背景、一图看懂（练习题那一条不剧透）
  const allItems = ["news", "calendar", "voices", "money", "tools"].flatMap((k) =>
    ((byKind.get(k)?.items as BriefItem[] | null) ?? []).filter((i) => !i.extra).map(cleanBriefItem)
  );
  const top = ((byKind.get("digest")?.items as DigestPick[] | null) ?? []).slice(0, 3).flatMap((p) => {
    const item = allItems.find((i) => i.signal_id === p.signal_id);
    if (!item || item.signal_id === practiceRow?.signal_id) return [];
    return [{ signal_id: item.signal_id, headline: item.headline, background: item.background, ...(item.flow ? { flow: item.flow } : {}) }];
  });
```

return 的对象里 `digest,` 后面加 `top,`;`sections` 那一段的 `items:` 末尾链上 `.map(cleanBriefItem)`(背景也去一遍空话):

```ts
      items: ((byKind.get(kind)?.items as BriefItem[] | null) ?? [])
        .filter((i) => !i.extra)
        // 练习题那一条不在列表里剧透
        .filter((i) => i.signal_id !== practiceRow?.signal_id)
        .map(cleanBriefItem),
```

- [ ] **Step 2: 取图当附件**

`sendDailyEmail` 前面加:

```ts
/**
 * 最值得点开的几条里有一图看懂的，签好名去 Edge 路由取 PNG，当附件嵌进邮件（cid）。
 * 网址或 CRON_SECRET 没配、路由取不到、超过 10 秒，就只发文字 —— 不拦着发邮件。
 */
async function flowCardAttachments(input: DailyEmailInput): Promise<{ signalId: string; filename: string; content: Buffer; cid: string }[]> {
  const secret = process.env.CRON_SECRET;
  if (!input.url || !secret) return [];
  const results = await Promise.all(
    (input.top ?? []).map(async (t) => {
      if (!t.flow) return null;
      try {
        const { d, s } = await signFlowCard({ headline: t.headline, flow: t.flow }, secret);
        const res = await fetch(`${input.url}/api/flow-card?d=${d}&s=${s}`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        return { signalId: t.signal_id, filename: `flow-${t.signal_id}.png`, content: Buffer.from(await res.arrayBuffer()), cid: `flow-${t.signal_id}@ideaos` };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}
```

`sendDailyEmail` 里:

```ts
  const { subject, text } = buildDailyEmail(input);
```

后面加

```ts
  const attachments = await flowCardAttachments(input);
  const html = buildDailyEmailHtml(input, Object.fromEntries(attachments.map((a) => [a.signalId, a.cid])));
```

`sendMail` 那一行改成:

```ts
  await transport.sendMail({
    from: `IdeaOS <${config.from}>`,
    to: config.to,
    subject,
    text,
    html,
    attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, cid: a.cid })),
  });
```

- [ ] **Step 3: 验证并提交**

Run: `npx tsc --noEmit && npm run lint && npx vitest run lib/domains/signals/notify.test.ts`
Expected: 全过

```bash
git add lib/domains/signals/notify.ts
git commit -m "feat(signals): 邮件里放今日总览挑的三条（带背景和一图看懂），图签名后去 Edge 路由取、当附件嵌进去

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 迁移 085(表 + bucket)

**Files:**
- Create: `supabase/migrations/085_signal_images.sql`
- Modify: `supabase/schema.sql`(末尾追加,CRLF)

- [ ] **Step 1: 先确认 085 没被占**

```bash
ls supabase/migrations | tail -3; ls /d/projects/startup-prepare/supabase/migrations | tail -3
```

Expected:两边都没有 085。被占了就顺延,下面的文件名、宪法里的编号一起改。

- [ ] **Step 2: 写迁移**

`supabase/migrations/085_signal_images.sql`:

```sql
-- ============================================================================
-- 迁移 085：外部信号的 AI 示意图
-- signal_images：差距清单里一条（一条讲透页、周刊挑条时）点「出一张配图」出的图，一张一行；同一条可以重出，旧的留着。
--   图本身存在 Storage 的 signal-images bucket（不公开，页面用服务器签的临时链接显示）。
--   图下面固定标「AI 生成的示意图」；模型不一定全听"不要文字"，他看过才拿去用。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_images (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  side          text not null check (side in ('japan', 'us', 'china')),
  signal_id     uuid not null,
  storage_path  text not null,
  prompt        text not null,
  model         text not null,
  created_at    timestamptz not null default now()
);

create index if not exists signal_images_lookup on signal_images (user_id, side, signal_id, created_at desc);

alter table signal_images enable row level security;

drop policy if exists "signal_images_owner" on signal_images;
create policy "signal_images_owner" on signal_images
  for all using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signal-images', 'signal-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 3: 追加到 schema.sql(CRLF)**

```bash
python - <<'EOF'
src = open("supabase/migrations/085_signal_images.sql", "rb").read().decode("utf-8").replace("\r\n", "\n")
dst = open("supabase/schema.sql", "rb").read()
if not dst.endswith(b"\r\n"):
    dst += b"\r\n"
dst += b"\r\n" + src.replace("\n", "\r\n").encode("utf-8")
open("supabase/schema.sql", "wb").write(dst)
EOF
tail -3 supabase/schema.sql | cat -A | cut -c1-60
```

- [ ] **Step 4: 提交**

```bash
git add supabase/migrations/085_signal_images.sql supabase/schema.sql
git commit -m "feat(signals): 迁移 085 signal_images 和 signal-images bucket——AI 示意图

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 出图入口和提示词

**Files:**
- Modify: `lib/ai-gateway.ts`(`executeAiCall` 多一个参数、新 `executeAiImage`)
- Create: `lib/ai/signals-image.ts`
- Create: `lib/ai/signals-image.test.ts`
- Modify: `lib/ai/index.ts`

- [ ] **Step 1: 提示词的测试**

`lib/ai/signals-image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IMAGE_RULES, illustrationPrompt } from "./signals-image";

describe("出图提示词", () => {
  it("那边的东西 + 这一类 + 固定规矩；数字一律拿掉", () => {
    const p = illustrationPrompt({ there: "中国", headline: "淘宝直播 GMV 超过 4000 亿元，点淘冲上免费榜第 3", category: "短剧直播购物 App" });
    expect(p).toContain("中国");
    expect(p).toContain("短剧直播购物 App");
    expect(p).toContain(IMAGE_RULES);
    expect(p).not.toMatch(/[0-9]/);
  });

  it("没有这一类的叫法也能拼", () => {
    expect(illustrationPrompt({ there: "日本", headline: "豆芽生产商越来越少" })).not.toContain("这一类东西");
  });
});
```

Run: `npx vitest run lib/ai/signals-image.test.ts`
Expected: FAIL(找不到模块)

- [ ] **Step 2: 网关多一个出图入口**

`lib/ai-gateway.ts`:`executeAiCall` 的签名

```ts
async function executeAiCall<T>(
  context: AiCallContext,
  request: AiGenerateContentRequest,
  read: (response: unknown, text: string) => T
): Promise<T> {
```

改成

```ts
async function executeAiCall<T>(
  context: AiCallContext,
  request: AiGenerateContentRequest,
  read: (response: unknown, text: string) => T,
  /** 从响应里取"有没有输出"的那段文字（记日志用、空了就当失败）；出图时是一句"一张图、多大"。 */
  output: (response: unknown) => string = (response) => ((response as { text?: string }).text ?? "").trim()
): Promise<T> {
```

函数体里 `const text = (response.text ?? "").trim();` 改成 `const text = output(response);`。

`executeAiGroundedSearch` 后面加:

```ts
type InlineImage = { mimeType: string; data: string };

function firstImage(response: unknown): InlineImage | null {
  const parts = (response as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] })
    .candidates?.[0]?.content?.parts ?? [];
  const hit = parts.find((p) => p.inlineData?.data);
  return hit?.inlineData?.data ? { mimeType: hit.inlineData.mimeType ?? "image/png", data: hit.inlineData.data } : null;
}

/** 出图（Gemini 的图片模型）：返回第一张图的字节。日志里只记"一张图、多大"，不存图本身。 */
export async function executeAiImage(
  context: AiCallContext,
  request: AiGenerateContentRequest
): Promise<{ mimeType: string; data: Buffer }> {
  return executeAiCall(
    context,
    request,
    (response) => {
      const image = firstImage(response)!;
      return { mimeType: image.mimeType, data: Buffer.from(image.data, "base64") };
    },
    (response) => {
      const image = firstImage(response);
      return image ? `[image ${image.mimeType} ${Math.round((image.data.length * 3) / 4)} bytes]` : "";
    }
  );
}
```

- [ ] **Step 3: 提示词和出图函数**

`lib/ai/signals-image.ts`:

```ts
import { executeAiImage } from "@/lib/ai-gateway";

// ---------------------------------------------------------------------------
// 外部信号的 AI 示意图（配图用，点了才出）。提示词由代码拼，固定规矩代码加。
// 模型不一定全听：试的时候说了不要任何文字，它还是画了一个「BUY」—— 图下面标明、他看过才用。
// ---------------------------------------------------------------------------

export const IMAGE_MODEL = process.env.AI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

export const IMAGE_RULES =
  "扁平插画风格，暖色纸张底色，竖图。画面里不要出现任何文字、数字、字母、logo、产品界面或截图，不要画真人的脸，不要画国旗。";

/** 出图提示词：那边的这样东西 + 这一类东西的叫法 + 固定规矩。数字一律拿掉（标题里的「4000 亿」不能进图）。 */
export function illustrationPrompt(input: { there: string; headline: string; category?: string }): string {
  const strip = (t: string) => t.replace(/[0-9０-９][0-9０-９.,，%％]*/g, "").replace(/\s+/g, " ").trim();
  return [
    `一张示意插画，画${input.there}的这样东西：${strip(input.headline)}`,
    input.category ? `（这一类东西：${strip(input.category)}）` : "",
    `。${IMAGE_RULES}`,
  ].join("");
}

export async function drawIllustration(prompt: string): Promise<{ mimeType: string; data: Buffer }> {
  return executeAiImage(
    { operation: "signal_illustration", module: "unknown", timeoutMs: 60_000 },
    { model: IMAGE_MODEL, contents: prompt, config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } } }
  );
}
```

`lib/ai/index.ts`:`export * from "./signals-deep";` 后面加一行 `export * from "./signals-image";`。

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run lib/ai/signals-image.test.ts lib/ai && npx tsc --noEmit && npm run lint`
Expected: PASS;无类型错误(网关的改动不影响已有调用:`output` 有默认值)

- [ ] **Step 5: 提交**

```bash
git add lib/ai-gateway.ts lib/ai/signals-image.ts lib/ai/signals-image.test.ts lib/ai/index.ts
git commit -m "feat(signals): 网关加出图入口（只记一张图多大）；示意图的提示词由代码拼，数字拿掉、固定规矩代码加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 出图、存图、签链接、action

**Files:**
- Create: `lib/domains/signals/images.ts`
- Modify: `app/(app)/signals/actions.ts`(CRLF,用 Edit 工具)

- [ ] **Step 1: 领域层**

`lib/domains/signals/images.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase";
import { drawIllustration, illustrationPrompt, IMAGE_MODEL } from "@/lib/ai";
import { loadGapDeep } from "./deep";
import { findJapanGap } from "./gaps";
import { gapPlaces, type GapSide } from "./gaps-shared";

/**
 * 差距的 AI 示意图：出图、存进 Storage（signal-images，不公开）、记一行（signal_images），页面拿签过名的临时链接显示。
 * 出不来时把提示词给他，自己贴进网页版 GPT（不替他操作网页版）。
 */

export const IMAGE_BUCKET = "signal-images";
export const MISSING_IMAGE_MIGRATION =
  "还差一步：迁移 085 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/085_signal_images.sql 之后再来。";
/** 临时链接管一个小时：够他看、够下载。 */
const SIGNED_SECONDS = 60 * 60;

export type GapImage = { url: string; created_at: string };

function isMissing(message: string): boolean {
  return /signal_images|bucket/i.test(message);
}

/** 这一条最新的一张（没有为 null）；表没建返回 "missing-schema"。 */
export async function latestGapImage(userId: string, side: GapSide, signalId: string): Promise<GapImage | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_images")
    .select("storage_path, created_at")
    .eq("user_id", userId)
    .eq("side", side)
    .eq("signal_id", signalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissing(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  if (!data) return null;
  const { data: signed, error: signError } = await supabaseAdmin.storage.from(IMAGE_BUCKET).createSignedUrl(data.storage_path as string, SIGNED_SECONDS);
  if (signError || !signed) return null;
  return { url: signed.signedUrl, created_at: data.created_at as string };
}

/** 出图提示词（出不来时页面给他复制）。 */
export async function gapImagePrompt(userId: string, side: GapSide, signalId: string): Promise<string> {
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const deep = await loadGapDeep(userId, side, signalId).catch(() => null);
  const category = deep && deep !== "missing-schema" ? deep.there?.category : undefined;
  return illustrationPrompt({ there: gapPlaces(side).there, headline: gap.headline, category });
}

/** 出一张、存进 Storage、记一行，返回签过名的临时链接。 */
export async function drawGapImage(userId: string, side: GapSide, signalId: string): Promise<GapImage> {
  const prompt = await gapImagePrompt(userId, side, signalId);
  const image = await drawIllustration(prompt);
  const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
  const path = `${userId}/${side}/${signalId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(IMAGE_BUCKET).upload(path, image.data, { contentType: image.mimeType });
  if (uploadError) throw new Error(isMissing(uploadError.message) ? MISSING_IMAGE_MIGRATION : uploadError.message);
  const { error } = await supabaseAdmin
    .from("signal_images")
    .insert({ user_id: userId, side, signal_id: signalId, storage_path: path, prompt, model: IMAGE_MODEL });
  if (error) throw new Error(isMissing(error.message) ? MISSING_IMAGE_MIGRATION : error.message);
  const latest = await latestGapImage(userId, side, signalId);
  if (!latest || latest === "missing-schema") throw new Error("存上了，但取不到链接，刷新一下");
  return latest;
}
```

- [ ] **Step 2: action**

`app/(app)/signals/actions.ts` import 区加:

```ts
import { drawGapImage, gapImagePrompt, type GapImage } from "@/lib/domains/signals/images";
```

接在 `saveDeepStanceAction` 后面:

```ts
/** 差距的一条：出一张示意图（十秒左右）。出不来就把提示词给他，自己贴进网页版 GPT。 */
export async function drawGapImageAction(
  signalId: string,
  side: GapSide
): Promise<{ ok: true; image: GapImage } | { ok: false; message: string; prompt?: string }> {
  const userId = await requireUserId();
  try {
    return { ok: true, image: await drawGapImage(userId, side, signalId) };
  } catch (error) {
    const prompt = await gapImagePrompt(userId, side, signalId).catch(() => undefined);
    return { ok: false, message: errorMessage(error, "这次没出成"), prompt };
  }
}
```

- [ ] **Step 3: 验证并提交**

Run: `npx tsc --noEmit && npm run lint`(`file "app/(app)/signals/actions.ts"` 仍是 CRLF)

```bash
git add lib/domains/signals/images.ts "app/(app)/signals/actions.ts"
git commit -m "feat(signals): 差距的示意图——出图、存 Storage、签一小时的临时链接；出不来给提示词

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 「出一张配图」按钮

**Files:**
- Create: `app/(app)/signals/gaps/illustration.tsx`
- Modify: `lib/domains/signals/deep-page.ts`(`DeepPage.image`)
- Modify: `app/(app)/signals/gaps/deep/page.tsx`(①那一节)
- Modify: `app/(app)/signals/issue/page.tsx`、`issue-composer.tsx`(挑上的每条)

- [ ] **Step 1: 组件**

`app/(app)/signals/gaps/illustration.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import type { GapImage } from "@/lib/domains/signals/images";
import { drawGapImageAction } from "../actions";

/** 出一张配图：AI 生成的示意图，点了才出；出不来就给出图提示词，他自己贴进网页版 GPT。disabled 是迁移没跑时的那句话。 */
export function Illustration({
  signalId,
  side,
  initial,
  disabled,
}: {
  signalId: string;
  side: GapSide;
  initial: GapImage | null;
  disabled?: string;
}) {
  const [image, setImage] = useState<GapImage | null>(initial);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const draw = () =>
    startTransition(async () => {
      setError(null);
      const result = await drawGapImageAction(signalId, side);
      if (result.ok) {
        setImage(result.image);
        setPrompt(null);
      } else {
        setError(result.message);
        setPrompt(result.prompt ?? null);
      }
    });
  if (disabled) return <p className="text-sm leading-7 text-muted-foreground">{disabled}</p>;
  return (
    <div className="space-y-2">
      {image && (
        <div className="space-y-1">
          <Image src={image.url} alt="AI 生成的示意图" width={240} height={320} unoptimized className="rounded-md border border-border" />
          <p className="text-xs leading-6 text-muted-foreground">
            AI 生成的示意图，不是实拍、不是产品截图。图里要是冒出了字或 logo，别拿去用，重出一张。
            <a href={image.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
              打开原图（右键保存）↗
            </a>
          </p>
        </div>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={draw}>
        {pending ? "在出图（十秒左右）…" : image ? "再出一张" : "出一张配图"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {prompt && (
        <div className="space-y-1">
          <p className="text-sm leading-7 text-muted-foreground">这次没出成。把下面这段复制进网页版 GPT，自己出一张：</p>
          <Textarea readOnly value={prompt} rows={4} />
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(prompt);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "复制好了" : "复制"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 一条讲透页①**

`lib/domains/signals/deep-page.ts`:import 加 `import { latestGapImage, type GapImage } from "./images";`;`DeepPage` 加:

```ts
  /** 最新的一张 AI 示意图（迁移 085 没跑为 "missing-schema"）。 */
  image: GapImage | null | "missing-schema";
```

`Promise.all` 数组末尾加 `latestGapImage(userId, side, signalId).catch(() => null),`,解构末尾加 `, image`,return 的对象末尾加 `image,`。

`app/(app)/signals/gaps/deep/page.tsx`:import 加 `import { Illustration } from "../illustration";`,顶上常量加
`const MISSING_085 = "还差一步：迁移 085 没跑。执行 supabase/migrations/085_signal_images.sql 之后才能出图。";`,
①那一节 `<ThereView … />` 后面加:

```tsx
          <Illustration
            signalId={signalId}
            side={side}
            initial={page.image === "missing-schema" ? null : page.image}
            disabled={page.image === "missing-schema" ? MISSING_085 : undefined}
          />
```

- [ ] **Step 3: 周刊挑上的每条**

`app/(app)/signals/issue/page.tsx`:import 加 `import { latestGapImage, type GapImage } from "@/lib/domains/signals/images";`,`Promise.all` 之后加:

```ts
  // 挑条时每条已经出过的示意图（没出过、迁移没跑的不放）
  const images: Record<string, GapImage> = Object.fromEntries(
    (
      await Promise.all(
        candidates.gaps.map(async (g) => [`${g.side}:${g.signal_id}`, await latestGapImage(user.id, g.side, g.signal_id).catch(() => null)] as const)
      )
    ).filter((e): e is readonly [string, GapImage] => !!e[1] && e[1] !== "missing-schema")
  );
```

`<IssueComposer` 加 `images={images}`。

`issue-composer.tsx`:import 加 `import type { GapImage } from "@/lib/domains/signals/images";` 和 `import { Illustration } from "../gaps/illustration";`;
props 类型加 `/** 每条已经出过的示意图（键见 keyOf）。 */ images: Record<string, GapImage>;`,解构加 `images,`;
挑上的那一条展开的 `<div className="mt-3 space-y-2">` 里,`OptionRow`(谁最可能先做)和 `Input` 后面、「发出去的是」前面加:

```tsx
                      <Illustration signalId={g.signal_id} side={g.side} initial={images[k] ?? null} />
```

- [ ] **Step 4: 验证并提交**

Run: `npx tsc --noEmit && npm run lint && npx vitest run lib/domains/signals lib/ai`
Expected: 全过(`next/image` 加 `unoptimized` 不用配远程域名)

```bash
git add "app/(app)/signals/gaps/illustration.tsx" lib/domains/signals/deep-page.ts "app/(app)/signals/gaps/deep/page.tsx" "app/(app)/signals/issue/page.tsx" "app/(app)/signals/issue/issue-composer.tsx"
git commit -m "feat(signals): 一条讲透和周刊挑条时每条可以「出一张配图」，图下标明 AI 生成；出不来给提示词

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 宪法、设计文档、全部验证、交给他

**Files:**
- Modify: `CLAUDE.md`(CRLF,Python 按字节改)
- Modify: `docs/superpowers/specs/2026-10-18-signals-visual-design.md`

- [ ] **Step 1: 宪法**

```bash
python - <<'EOF'
p = "CLAUDE.md"
s = open(p, "rb").read().decode("utf-8")
old = "删掉的存在条目上,信息源体检页能看删了哪些;不打分、不给投资建议 |"
assert s.count(old) == 1
new = ("删掉的存在条目上,信息源体检页能看删了哪些;**一图看懂**:每条精选四个框(起因→发生了什么→谁受影响→接下来盯什么),"
       "字由 AI 在读正文重写那一步写,数字必须在正文里、不许下结论和「值得关注」(lib/domains/signals/flow-shared.ts),有一样不合格整张不画;"
       "报告页用 HTML 画,邮件用 Edge 路由 /api/flow-card 画 PNG(只画 CRON_SECRET 签过名的),不让 AI 画任何带字带数字的图;"
       "**邮件**改成 HTML(纯文字版一起发):今日总览挑的三条带背景和一图看懂(cid 附件),各条标题加一句话;"
       "**AI 示意图**(迁移 085 signal_images + Storage bucket signal-images):一条讲透和周刊挑条时点了才出(Gemini 图片模型,读 AI_IMAGE_MODEL),"
       "提示词由代码拼、数字拿掉,图下固定标「AI 生成的示意图」,模型不一定全听「不要文字」、他看过才用;出不来给出图提示词让他自己贴进网页版 GPT,不自动操作网页版;"
       "不打分、不给投资建议 |")
s = s.replace(old, new)
old2 = "  signal_gap_deep(迁移 083):一条讲透里存的那边查一查(there)、他点的类别(category)、判断(stance);主键 (user_id, signal_id, side);读写在 lib/domains/signals/deep.ts。\r\n"
assert s.count(old2) == 1
s = s.replace(old2, old2 + "  signal_images(迁移 085):差距的 AI 示意图,一张一行(图在 Storage 的 signal-images bucket,不公开,页面用签名的临时链接);读写在 lib/domains/signals/images.ts。\r\n")
open(p, "wb").write(s.encode("utf-8"))
EOF
file CLAUDE.md
```

- [ ] **Step 2: 设计文档补记**

在设计文档末尾加一节「## 写计划和做的时候定下的」:照搬本计划开头「写计划时试出来的」几条(Gemini 8 秒一张、画了「BUY」、next/og 本机 Node 会坏所以走 Edge 路由、中间件放行、独立 worktree、迁移 085),
再加做的过程中改过的地方。

- [ ] **Step 3: 全部验证**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全过

- [ ] **Step 4: 提交**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-18-signals-visual-design.md
git commit -m "docs(signals): 宪法写进一图看懂、带图的邮件、AI 示意图；设计文档补记

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 交给他**

告诉他:
1. 迁移 085 要在 Supabase SQL Editor 里跑(表和 bucket 一起建);
2. 想看邮件里的图显示得怎么样,要真发一封测试邮件给他自己 —— **问他同意了再发**(信息源体检页 / 报告页的「发一封测试邮件」,或者我调 `sendTestEmailAction`);
   Gmail 里图没出来就说明 `cid:` 不行,再换办法;
3. 一图看懂从明天早上的报告开始才有(旧报告不补);
4. 分支 `feat/signals-visual` 在独立 worktree `D:\projects\startup-prepare-visual` 里,合回 main 要等另一个会话(求职)把它的改动提交了,
   `schema.sql`、`lib/ai/index.ts`、`CLAUDE.md` 可能要手动合;
5. 对账草稿:到 11 月 1 日,有至少 5 个早上只看邮件就决定了点开哪一条(或者一条都不点),他改了再押。
