# 官报決算公告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 他电脑上每天抓官报的会社決算公告(第一次补最近 90 天),全部存下,数字只用规则抽;维护一份「在日本的中国公司」名单,把找到的决算显示在新页、时差图谱、岗位页三处。

**Architecture:** 纯函数(切条、抽字段、归一化、金额显示)在 `lib/domains/signals/kanpo-shared.ts`,拿 10 月 16 日真实的 13 条当测试样本;
只在本机脚本里用的两层:`kanpo-pdf.ts`(pdfjs 抽字)和 `kanpo-fetch.ts`(读官报首页、目次、下载页 PDF);数据库在 `kanpo.ts`(页面和脚本都用);
`scripts/kanpo-run.ts` 把它们串起来,`npm run kanpo:fetch` 和填表助手都调它。页面不 import 本机那两层。

**Tech Stack:** Next.js 14、TypeScript、Supabase(service role)、`pdfjs-dist` 6.3.289(devDependency)、vitest、tsx。

设计见 `docs/superpowers/specs/2026-10-17-signals-kanpo-design.md`。在分支 `feat/kanpo` 上做,每个任务本地提交,不 push。
验证:`npx tsc --noEmit`、`npm run lint`、`npm test`;dev server 开着时不 `npm run build`。提交信息用「」不用 ASCII 双引号。

## 写计划时试出来的(设计文档里没写全的)

- **负号不是「△」**:官报字体把 △ 映射到私用区,横排是 U+E888,竖排是 U+E6F0(pdfjs 和 PyMuPDF 都原样给出)。不认它,累计亏损全会被读成正数。
- **竖排的决算公告**:数字是汉字(「四〇、八五二」= 40,852,「、」是千位分隔),标题「第二期決算公告」,资产合计写「資産の部合計」,公司名在表的后面。
- **公司名折行**:上一行以「・」结尾(「カーティス・インスツルメンツ・」+「パシフィック株式会社」),或上一行全是英文(「Ericsson Enterprise Wireless」+「Solutions Japan株式会社」)。
- **pdfjs 给标签的每个字之间加空格**(「利 益 剰 余 金」「第 81 期 決 算 公 告」):只去掉两边都不是 ASCII 的空格,英文名里的空格留着。
- **「負債・純資産合計」不是纯资产合计**。
- 按上面这些规则,10 月 16 日第 80–83 页 13 条全部切出,公司名、单位、资产合计、当期纯损益四样都抽到,负数正确(scratchpad 里跑过)。
- **官报首页**列着最近 90 天每一份的整份链接,文件名带页码范围(`…g00227full00010104f.html` = 第 1–104 页;大的分几段,取最大的那个结尾);
  **当天的全体目次** `/{日期}/{日期}.fullcontents.html` 里「会社決算公告」的链接带起始页(`20261016g00227/20261016g002270080f.html` = 号外第 227 号第 80 页);
  **每页 PDF**:`/{日期}/{号}/pdf/{号}{4位页码}.pdf`。
- **时差图谱的每一件没有"日本法人名"这一格**(日本那边写在一句话里),所以"从时差图谱加进名单"时记下那一件的 id(`kanpo_watch.case_id`),图谱按 id 显示,不按名字猜;
  差距清单的条目是产品不是公司,只放一个进新页的链接。

| # | 做什么 | 文件 | 测 |
|---|---|---|---|
| 1 | 迁移 082,追加到 schema.sql | `supabase/migrations/082_kanpo_notices.sql`、`supabase/schema.sql` | — |
| 2 | pdfjs 依赖、抽字、生成测试样本 | `package.json`、`lib/domains/signals/kanpo-pdf.ts`、`lib/domains/signals/__fixtures__/kanpo-20261016-p80-83.txt` | tsc |
| 3 | 切条、抽字段、归一化、金额显示 | `lib/domains/signals/kanpo-shared.ts` | kanpo-shared.test |
| 4 | 读官报首页、目次、下载页 | `lib/domains/signals/kanpo-fetch.ts` | kanpo-fetch.test(只测解析 HTML) |
| 5 | 数据库 | `lib/domains/signals/kanpo.ts` | tsc |
| 6 | 抓取命令和填表助手 | `scripts/kanpo-run.ts`、`scripts/kanpo-fetch.ts`、`scripts/kanpo-state.ts`、`scripts/jobs-helper.ts`、`package.json` | tsc |
| 7 | 新页 /signals/kanpo | `app/(app)/signals/kanpo/...` | tsc/lint |
| 8 | 时差图谱、差距清单、岗位页 | atlas、gaps、jobs/[id] | tsc/lint |
| 9 | 宪法、设计文档补记 | `CLAUDE.md`、spec | — |
| 10 | 全部验证 + 真跑一天 | — | tsc/lint/test + 他跑 082 |

---

### Task 0: 开分支

- [ ] **Step 1**

```bash
git switch -c feat/kanpo
```

---

### Task 1: 迁移 082

**Files:**
- Create: `supabase/migrations/082_kanpo_notices.sql`
- Modify: `supabase/schema.sql`(末尾追加)

- [ ] **Step 1: 写迁移**

`supabase/migrations/082_kanpo_notices.sql`:

```sql
-- ============================================================================
-- 迁移 082：官报決算公告（外部信号的一手数据第一步）
-- kanpo_notices：每天官报里的会社決算公告，全部存；公开数据，不分用户（单用户阶段只用 service role 读写）。
--   字段由规则从原文截出，金额按单位换成日元；四样（公司名、单位、资产合计、当期纯损益）都抽到才算 complete。
-- kanpo_fetch_days：哪天抓过（几页、几条、几条没抽全）。
-- kanpo_watch：他的「在日本的中国公司」名单；case_id 是从时差图谱加进来时那一件的 id。
-- 要先跑 073（signal_transfer_cases）。幂等，可重复执行。
-- ============================================================================

create table if not exists kanpo_notices (
  id                uuid primary key default gen_random_uuid(),
  notice_key        text not null unique,
  issue_date        date not null,
  issue             text not null,
  page              int not null,
  pdf_url           text not null,
  company_name      text,
  company_key       text,
  address           text,
  period            text,
  fiscal_end        text,
  unit              text,
  total_assets      bigint,
  net_assets        bigint,
  retained_earnings bigint,
  net_income        bigint,
  complete          boolean not null default false,
  raw_text          text not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_kanpo_notices_company on kanpo_notices (company_key);
create index if not exists idx_kanpo_notices_date on kanpo_notices (issue_date desc);
alter table kanpo_notices enable row level security;

create table if not exists kanpo_fetch_days (
  issue_date  date primary key,
  pages       int not null,
  notices     int not null,
  incomplete  int not null,
  fetched_at  timestamptz not null default now()
);
alter table kanpo_fetch_days enable row level security;

create table if not exists kanpo_watch (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name_zh     text not null,
  aliases     text[] not null,
  rejected    text[] not null default '{}',
  note        text not null default '',
  case_id     uuid references signal_transfer_cases (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table kanpo_watch enable row level security;
drop policy if exists "kanpo_watch_owner" on kanpo_watch;
create policy "kanpo_watch_owner" on kanpo_watch
  for all using (auth.uid() = user_id);
```

- [ ] **Step 2: CRLF,追加到 schema.sql**

```bash
sed -i 's/$/\r/' supabase/migrations/082_kanpo_notices.sql
printf '\r\n' >> supabase/schema.sql
cat supabase/migrations/082_kanpo_notices.sql >> supabase/schema.sql
file supabase/migrations/082_kanpo_notices.sql supabase/schema.sql
tail -n 2 supabase/schema.sql
```

Expected: 两个文件都是 CRLF;schema.sql 末尾是 `for all using (auth.uid() = user_id);`。

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/082_kanpo_notices.sql supabase/schema.sql
git commit -m "feat(signals): 迁移 082 官报決算公告、抓取日子、在日中国公司名单" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: pdfjs 依赖、抽字、生成测试样本

**Files:**
- Modify: `package.json`(devDependencies)
- Create: `lib/domains/signals/kanpo-pdf.ts`
- Create: `lib/domains/signals/__fixtures__/kanpo-20261016-p80-83.txt`(用临时脚本生成,脚本不提交)

- [ ] **Step 1: 装依赖**

```bash
npm install --save-dev --save-exact pdfjs-dist@6.3.289
```

Expected: `package.json` 的 devDependencies 里有 `"pdfjs-dist": "6.3.289"`。

- [ ] **Step 2: 抽字**

`lib/domains/signals/kanpo-pdf.ts`:

```ts
import { join } from "node:path";

/**
 * 官报 PDF 抽文字（只在本机脚本里用，页面不 import）。
 * pdfjs 的 legacy 构建能在 Node 里跑；日文要给 cMap 的文件系统路径（不是 file:// 地址，Windows 上 file:// 读不到）。
 * 按 hasEOL 拼成行：标签的字和字之间会有空格，切条前用 kanpo-shared 的 squashCjk 去掉。
 */
export async function pdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const base = join(process.cwd(), "node_modules", "pdfjs-dist");
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: join(base, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(base, "standard_fonts") + "/",
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join(""));
    }
    return pages.join("\n");
  } finally {
    await doc.destroy();
  }
}
```

- [ ] **Step 3: 生成测试样本(临时脚本,用完删)**

`scripts/tmp-kanpo-fixture.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { pdfText } from "@/lib/domains/signals/kanpo-pdf";
import { patchDns } from "./dns-patch";

async function main(): Promise<void> {
  patchDns();
  const pages: string[] = [];
  for (const p of ["0080", "0081", "0082", "0083"]) {
    const res = await fetch(`https://www.kanpo.go.jp/20261016/20261016g00227/pdf/20261016g00227${p}.pdf`);
    if (!res.ok) throw new Error(`第 ${p} 页 ${res.status}`);
    pages.push(await pdfText(new Uint8Array(await res.arrayBuffer())));
  }
  mkdirSync("lib/domains/signals/__fixtures__", { recursive: true });
  writeFileSync("lib/domains/signals/__fixtures__/kanpo-20261016-p80-83.txt", pages.join("\n"), "utf8");
  console.log("写好了", pages.map((t) => t.length).join(" / "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run: `npx tsx --env-file=.env.local scripts/tmp-kanpo-fixture.ts`
Expected: `写好了` 后面四个数字(每页几千字);`grep -c "決" lib/domains/signals/__fixtures__/kanpo-20261016-p80-83.txt` 大于 0。

然后删掉脚本:

```bash
rm scripts/tmp-kanpo-fixture.ts
```

- [ ] **Step 4: 检查、提交**

Run: `npx tsc --noEmit`
Expected: 没有输出。

```bash
git add package.json package-lock.json lib/domains/signals/kanpo-pdf.ts lib/domains/signals/__fixtures__/kanpo-20261016-p80-83.txt
git commit -m "feat(signals): pdfjs 抽官报文字；10 月 16 日第 80–83 页当测试样本" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 切条、抽字段、归一化、金额显示

**Files:**
- Create: `lib/domains/signals/kanpo-shared.ts`
- Test: `lib/domains/signals/kanpo-shared.test.ts`

- [ ] **Step 1: 写失败的测试**

`lib/domains/signals/kanpo-shared.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { companyKey, formatYen, parseNotice, splitNotices, watchKeys } from "./kanpo-shared";

const FIXTURE = readFileSync(fileURLToPath(new URL("./__fixtures__/kanpo-20261016-p80-83.txt", import.meta.url)), "utf8");
const parsed = splitNotices(FIXTURE).map((b) => parseNotice(b.block));
const byName = (name: string) => parsed.find((p) => p.company_name === name);

describe("切条", () => {
  it("10 月 16 日第 80–83 页切出 13 条决算公告（包括竖排那条）", () => {
    expect(parsed).toHaveLength(13);
  });

  it("13 条的四样都抽到", () => {
    expect(parsed.filter((p) => !p.complete).map((p) => p.company_name)).toEqual([]);
  });
});

describe("抽字段", () => {
  it("横排、資産合計：菊池食品工业", () => {
    expect(byName("菊池食品工業株式会社")).toMatchObject({
      period: "第81期",
      fiscal_end: "令和８年６月30日現在",
      unit: "千円",
      total_assets: 4_610_959_000,
      net_assets: 1_805_105_000,
      retained_earnings: 1_766_015_000,
      net_income: 19_973_000,
    });
    expect(byName("菊池食品工業株式会社")?.address).toMatch(/^東京都板橋区/);
  });

  it("「合計」当资产合计、负号是私用区字符 U+E888：さくらPORT・TOWN", () => {
    expect(byName("さくらＰＯＲＴ・ＴＯＷＮ株式会社")).toMatchObject({
      total_assets: 4_476_065_000,
      retained_earnings: -221_950_000,
      net_income: -17_483_000,
    });
  });

  it("竖排：汉字数字、「資産の部合計」、负号 U+E6F0、公司名在表后面", () => {
    expect(byName("株式会社創友建設")).toMatchObject({
      period: "第二期",
      fiscal_end: "令和八年七月三十一日現在",
      unit: "千円",
      total_assets: 40_852_000,
      retained_earnings: -3_659_000,
      net_income: -31_000,
    });
  });

  it("单位百万円；公司名折行（上一行以「・」结尾）", () => {
    expect(byName("カーティス・インスツルメンツ・パシフィック株式会社")).toMatchObject({
      unit: "百万円",
      total_assets: 448_000_000,
      net_income: 1_000_000,
    });
  });

  it("公司名折行（上一行全是英文）；英文名里的空格留着", () => {
    expect(byName("Ericsson Enterprise Wireless Solutions Japan株式会社")?.net_income).toBe(4_469_000);
    expect(byName("Mott MacDonald Japan株式会社")?.retained_earnings).toBe(-92_206_000);
  });

  it("「負債・純資産合計」不当纯资产合计", () => {
    expect(byName("株式会社ＸＡＩＯＮＤＡＴＡ")).toMatchObject({ net_assets: null, total_assets: 384_290_000 });
  });

  it("抽到的资产合计和当期纯损益，原单位下的数字都在原文里", () => {
    const factor = { 円: 1, 千円: 1000, 百万円: 1_000_000 } as const;
    for (const p of parsed.filter((x) => x.period !== "第二期")) {
      const raw = p.raw_text.replace(/\s/g, "");
      for (const v of [p.total_assets, p.net_income]) {
        if (v === null || p.unit === null) continue;
        expect(raw).toContain((Math.abs(v) / factor[p.unit]).toLocaleString("en-US"));
      }
    }
  });
});

describe("公司名归一化与名单", () => {
  it("株式会社的前后、（株）、全角半角、空格都归成同一个", () => {
    const key = companyKey("株式会社譚仔日本");
    expect(companyKey("譚仔日本株式会社")).toBe(key);
    expect(companyKey("（株）譚仔日本")).toBe(key);
    expect(companyKey("株式会社 譚仔日本")).toBe(key);
    expect(companyKey("mott macdonald japan株式会社")).toBe(companyKey("Mott MacDonald Japan株式会社"));
  });

  it("名单的写法归一化，解除过的不算", () => {
    const keys = watchKeys({ aliases: ["株式会社譚仔日本", "譚仔ジャパン株式会社"], rejected: [companyKey("譚仔ジャパン株式会社")] });
    expect(keys).toEqual([companyKey("株式会社譚仔日本")]);
  });
});

describe("金额显示", () => {
  it("亿円、万円、円，负数带减号", () => {
    expect(formatYen(4_610_959_000)).toBe("46.1亿円");
    expect(formatYen(11_497_503_000)).toBe("115亿円");
    expect(formatYen(19_973_000)).toBe("1,997万円");
    expect(formatYen(-31_000)).toBe("−3万円");
    expect(formatYen(1_000_000)).toBe("100万円");
    expect(formatYen(500)).toBe("500円");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/domains/signals/kanpo-shared.test.ts`
Expected: FAIL,`Failed to resolve import "./kanpo-shared"`。

- [ ] **Step 3: 写实现**

`lib/domains/signals/kanpo-shared.ts`:

```ts
/**
 * 官报決算公告：切条、抽字段、公司名归一化、金额显示（纯函数，可测；页面和本机脚本都用）。
 * 规矩：数字只用规则从原文里截，不让 AI 猜；四样（公司名、单位、资产合计、当期纯损益）抽不全的标出来，原文留着给他自己看。
 */

export type KanpoUnit = "円" | "千円" | "百万円";

export type ParsedNotice = {
  company_name: string | null;
  address: string | null;
  period: string | null;
  fiscal_end: string | null;
  unit: KanpoUnit | null;
  /** 以下金额都换成日元（整数）。 */
  total_assets: number | null;
  net_assets: number | null;
  retained_earnings: number | null;
  /** 亏损为负。 */
  net_income: number | null;
  complete: boolean;
  raw_text: string;
};

/** 抓下来、准备存进数据库的一条。 */
export type KanpoNoticeInput = ParsedNotice & {
  notice_key: string;
  issue_date: string;
  issue: string;
  page: number;
  pdf_url: string;
};

export type KanpoNotice = KanpoNoticeInput & { id: string; company_key: string | null };

export type KanpoWatch = {
  id: string;
  name_zh: string;
  aliases: string[];
  rejected: string[];
  note: string;
  case_id: string | null;
  created_at: string;
};

const UNIT_FACTOR: Record<KanpoUnit, number> = { 円: 1, 千円: 1000, 百万円: 1_000_000 };
const KANJI_DIGITS = "〇一二三四五六七八九";
/** 官报字体把「△」映射到私用区：横排 U+E888，竖排 U+E6F0。 */
const MINUS = "[△▲−\\-\\uE888\\uE6F0]";
const DIGIT = "[0-9０-９〇一二三四五六七八九]";
const NUMBER = `(${MINUS})?\\s*(${DIGIT}(?:${DIGIT}|[,，、])*)`;
const PERIOD = /第\s*[0-9０-９〇一二三四五六七八九十百]+\s*期/;
const HEADER = /第\s*[0-9０-９〇一二三四五六七八九十百]+\s*期\s*決算公告|^決算公告$/gm;
const COMPANY = /(株式会社|有限会社|合同会社|（株）|\(株\))/;
const PREFECTURE = /(東京都|北海道|大阪府|京都府|[^\s\d０-９]{2,3}県)[^\n]*/;

function toInt(sign: string | undefined, token: string): number | null {
  const ascii = [...token]
    .map((c) => {
      const k = KANJI_DIGITS.indexOf(c);
      if (k >= 0) return String(k);
      const code = c.charCodeAt(0);
      if (code >= 0xff10 && code <= 0xff19) return String(code - 0xff10);
      return c;
    })
    .join("")
    .replace(/[,，、]/g, "");
  if (!/^\d+$/.test(ascii)) return null;
  const n = Number(ascii);
  return sign ? -n : n;
}

function numberAfter(label: string, block: string): number | null {
  const m = new RegExp(label + "\\s*[(（]?\\s*" + NUMBER).exec(block);
  return m ? toInt(m[1], m[2]) : null;
}

/** pdfjs 给标签的每个字之间加了空格：两边都不是 ASCII 的空格去掉，英文名里的空格留着。 */
export function squashCjk(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/(?<=[^\x00-\x7f])[ 　\t]+(?=[^\x00-\x7f])/g, "").trim())
    .join("\n");
}

/** 切成一条条决算公告（start 是在去空格以后的文字里的位置，抓取时用来算在第几页）。没有「貸借対照表」的不算。 */
export function splitNotices(text: string, alreadySquashed = false): { start: number; block: string }[] {
  const squashed = alreadySquashed ? text : squashCjk(text);
  const starts = [...squashed.matchAll(HEADER)].map((m) => m.index ?? 0);
  return starts
    .map((start, i) => ({ start, block: squashed.slice(start, i + 1 < starts.length ? starts[i + 1] : start + 4000) }))
    .filter((n) => n.block.includes("貸借対照表"));
}

/** 公司名长了会折成两行：上一行以「・」结尾，或者全是英文。 */
function companyName(lines: string[]): string | null {
  const i = lines.findIndex((l) => COMPANY.test(l));
  if (i < 0) return null;
  const prev = lines[i - 1] ?? "";
  if (prev.endsWith("・")) return prev + lines[i];
  if (/^[A-Za-z][A-Za-z0-9 .,&'-]*$/.test(prev)) return `${prev} ${lines[i]}`;
  return lines[i];
}

export function parseNotice(block: string): ParsedNotice {
  const lines = block.split("\n");
  const unitMatch = /単位[：:・]?\s*(千円|百万円|円)|金額\s*[(（](千円|百万円|円)[)）]/.exec(block);
  const unit = (unitMatch ? unitMatch[1] ?? unitMatch[2] : null) as KanpoUnit | null;
  const bs = block.slice(block.indexOf("貸借対照表"));
  let assets = numberAfter("(?<!純)資産合計", bs) ?? numberAfter("資産の部合計", bs);
  if (assets === null) assets = numberAfter("合計", bs.slice(Math.max(0, bs.indexOf("資産"))));
  const netAssets = numberAfter("(?<![・び])純資産合計", bs);
  const retained = numberAfter("(?<!その他)利益剰余金", bs);
  const ni = new RegExp("[(（]うち当期純(利益|損失)(?:金額)?[)）]\\s*[(（]?\\s*" + NUMBER).exec(bs);
  let netIncome = ni ? toInt(ni[2], ni[3]) : null;
  if (ni && ni[1] === "損失" && netIncome !== null) netIncome = -Math.abs(netIncome);
  const company = companyName(lines);
  const factor = unit ? UNIT_FACTOR[unit] : null;
  const yen = (v: number | null) => (v === null || factor === null ? null : v * factor);
  return {
    company_name: company,
    address: PREFECTURE.exec(block)?.[0].trim() ?? null,
    period: PERIOD.exec(block)?.[0].replace(/\s/g, "") ?? null,
    fiscal_end: /([^\n()（）]*現在)/.exec(block)?.[1].trim() ?? null,
    unit,
    total_assets: yen(assets),
    net_assets: yen(netAssets),
    retained_earnings: yen(retained),
    net_income: yen(netIncome),
    complete: Boolean(company && unit && assets !== null && netIncome !== null),
    raw_text: block,
  };
}

/** 公司名归一化：全半角统一、去掉株式会社/有限会社/合同会社/(株)、去空格、英文大写。 */
export function companyKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/株式会社|有限会社|合同会社|\(株\)/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** 名单里一家的几种写法 → 匹配用的 key（他点过「不是这家」的去掉）。 */
export function watchKeys(watch: Pick<KanpoWatch, "aliases" | "rejected">): string[] {
  return Array.from(new Set(watch.aliases.map(companyKey).filter((k) => k && !watch.rejected.includes(k))));
}

/** 金额显示：一亿以上写亿円（一百亿以上不带小数），一万以上写万円，其余写円。 */
export function formatYen(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)}亿円`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString("ja-JP")}万円`;
  return `${sign}${a.toLocaleString("ja-JP")}円`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/domains/signals/kanpo-shared.test.ts`
Expected: PASS(12 个 it)。

Run: `npx tsc --noEmit`
Expected: 没有输出。

- [ ] **Step 5: 提交**

```bash
git add lib/domains/signals/kanpo-shared.ts lib/domains/signals/kanpo-shared.test.ts
git commit -m "feat(signals): 官报决算公告切条与抽字段（私用区负号、竖排汉字数字、折行公司名），公司名归一化，金额显示" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 读官报首页、目次、下载页

**Files:**
- Create: `lib/domains/signals/kanpo-fetch.ts`
- Test: `lib/domains/signals/kanpo-fetch.test.ts`(只测解析 HTML,不联网)

- [ ] **Step 1: 写失败的测试**

`lib/domains/signals/kanpo-fetch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { issueLabel, pageUrl, parseIssueIndex, parseSettlementSections } from "./kanpo-fetch";

const INDEX = `
<a href="20261016/20261016h01809/20261016h01809full00010032f.html">1-32頁</a>
<a href="20261016/20261016g00227/20261016g00227full00010104f.html">1-104頁</a>
<a href="20261016/20261016g00228/20261016g00228full00010320f.html">1-320頁</a>
<a href="20261016/20261016g00228/20261016g00228full03210640f.html">321-640頁</a>
<a href="20261016/20261016g00228/20261016g00228full06410680f.html">641-680頁</a>
<a href="20261015/20261015g00226/20261015g00226full00010144f.html">1-144頁</a>`;

const CONTENTS = `
<a href="20261016g00227/20261016g002270072f.html">
  <span class="text">会社その他</span>
  <span class="date">72</span>
</a>
<a href="20261016g00227/20261016g002270080f.html">
  <span class="text">会社決算公告</span>
  <span class="date">80</span>
</a>
<a href="20261016h01809/20261016h018090010f.html">
  <span class="text">会社決算公告</span>
  <span class="date">10</span>
</a>
<a href="20261016h01809/20261016h018090028f.html">
  <span class="text">会社その他</span>
  <span class="date">28</span>
</a>`;

describe("官报首页", () => {
  it("每一份取最后一页（分几段的取最大的结尾）", () => {
    const issues = parseIssueIndex(INDEX);
    expect(issues.find((i) => i.code === "20261016g00228")?.lastPage).toBe(680);
    expect(issues.find((i) => i.code === "20261016g00227")?.lastPage).toBe(104);
    expect(issues.find((i) => i.code === "20261015g00226")?.date).toBe("20261015");
  });
});

describe("全体目次", () => {
  it("会社決算公告到这一份的最后一页；同一份后面还有栏目的，到下一栏之前", () => {
    const sections = parseSettlementSections(CONTENTS, parseIssueIndex(INDEX));
    expect(sections).toEqual([
      { code: "20261016g00227", from: 80, to: 104 },
      { code: "20261016h01809", from: 10, to: 27 },
    ]);
  });
});

describe("地址和名字", () => {
  it("每页 PDF 的地址；份的名字", () => {
    expect(pageUrl("20261016g00227", 80)).toBe("https://www.kanpo.go.jp/20261016/20261016g00227/pdf/20261016g002270080.pdf");
    expect(issueLabel("20261016g00227")).toBe("号外第227号");
    expect(issueLabel("20261016h01809")).toBe("本紙第1809号");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/domains/signals/kanpo-fetch.test.ts`
Expected: FAIL,`Failed to resolve import "./kanpo-fetch"`。

- [ ] **Step 3: 写实现**

`lib/domains/signals/kanpo-fetch.ts`:

```ts
import { pdfText } from "./kanpo-pdf";
import { parseNotice, splitNotices, squashCjk, type KanpoNoticeInput } from "./kanpo-shared";

/**
 * 从 kanpo.go.jp 抓一天的会社決算公告（只在本机脚本里用，页面不 import）。
 * 首页列着最近 90 天每一份的整份链接（文件名带页码范围）；当天的全体目次里「会社決算公告」的链接带起始页；每页有单独的 PDF。
 * 一页一页下，间隔 0.5 秒，别给官网添负担。
 */

const SITE = "https://www.kanpo.go.jp";
const PAGE_GAP_MS = 500;
const KINDS: Record<string, string> = { h: "本紙", g: "号外", t: "特別号外", c: "政府調達" };

export type KanpoIssue = { date: string; code: string; lastPage: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`读不到 ${url}（${res.status}）`);
  return res;
}

/** 首页：每一份（本纸 h、号外 g、特别号外 t、政府调达 c）取最后一页。 */
export function parseIssueIndex(html: string): KanpoIssue[] {
  const last = new Map<string, number>();
  for (const m of html.matchAll(/(\d{8})\/(\d{8}[a-z]\d{5})\/\2full(\d{4})(\d{4})f\.html/g)) {
    last.set(m[2], Math.max(last.get(m[2]) ?? 0, Number(m[4])));
  }
  return [...last].map(([code, lastPage]) => ({ date: code.slice(0, 8), code, lastPage }));
}

/** 全体目次：「会社決算公告」从哪份第几页起；同一份里后面还有栏目就到下一栏之前，没有就到这一份最后一页。 */
export function parseSettlementSections(html: string, issues: KanpoIssue[]): { code: string; from: number; to: number }[] {
  const entries = [...html.matchAll(/href="(\d{8}[a-z]\d{5})\/\1(\d{4})f\.html">\s*<span class="text">([^<]*)<\/span>/g)].map((m) => ({
    code: m[1],
    page: Number(m[2]),
    label: m[3].trim(),
  }));
  return entries
    .filter((e) => e.label === "会社決算公告")
    .map((e) => {
      const next = entries.filter((x) => x.code === e.code && x.page > e.page).map((x) => x.page);
      const lastPage = issues.find((i) => i.code === e.code)?.lastPage ?? e.page;
      return { code: e.code, from: e.page, to: next.length > 0 ? Math.min(...next) - 1 : lastPage };
    });
}

export function pageUrl(code: string, page: number): string {
  return `${SITE}/${code.slice(0, 8)}/${code}/pdf/${code}${String(page).padStart(4, "0")}.pdf`;
}

/** 20261016g00227 → 号外第227号。 */
export function issueLabel(code: string): string {
  return `${KINDS[code[8]] ?? "官報"}第${Number(code.slice(9))}号`;
}

export async function listIssues(): Promise<KanpoIssue[]> {
  return parseIssueIndex(await (await get(`${SITE}/`)).text());
}

/** 抓一天（YYYY-MM-DD）：这天没出官报（休息日）就是 0 页 0 条。一页下载失败整天算没抓成（下次重来）。 */
export async function fetchDay(date: string, issues: KanpoIssue[]): Promise<{ pages: number; notices: KanpoNoticeInput[] }> {
  const ymd = date.replace(/-/g, "");
  const dayIssues = issues.filter((i) => i.date === ymd);
  if (dayIssues.length === 0) return { pages: 0, notices: [] };
  const contents = await (await get(`${SITE}/${ymd}/${ymd}.fullcontents.html`)).text();
  let pages = 0;
  const notices: KanpoNoticeInput[] = [];
  for (const section of parseSettlementSections(contents, dayIssues)) {
    const texts: { page: number; text: string }[] = [];
    for (let page = section.from; page <= section.to; page++) {
      const res = await get(pageUrl(section.code, page));
      texts.push({ page, text: squashCjk(await pdfText(new Uint8Array(await res.arrayBuffer()))) });
      pages += 1;
      await sleep(PAGE_GAP_MS);
    }
    // 一条公告可能跨页：整段连起来切，再按起点算在第几页
    const offsets: number[] = [];
    let at = 0;
    for (const t of texts) {
      offsets.push(at);
      at += t.text.length + 1;
    }
    const joined = texts.map((t) => t.text).join("\n");
    const perPage = new Map<number, number>();
    for (const n of splitNotices(joined, true)) {
      const idx = offsets.findLastIndex((o) => o <= n.start);
      const page = texts[Math.max(0, idx)].page;
      const order = (perPage.get(page) ?? 0) + 1;
      perPage.set(page, order);
      notices.push({
        ...parseNotice(n.block),
        notice_key: `${ymd}_${section.code}_${page}_${order}`,
        issue_date: date,
        issue: issueLabel(section.code),
        page,
        pdf_url: pageUrl(section.code, page),
      });
    }
  }
  return { pages, notices };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/domains/signals/kanpo-fetch.test.ts`
Expected: PASS(3 个 it)。

Run: `npx tsc --noEmit`
Expected: 没有输出(`findLastIndex` 在 tsconfig 的 `lib: esnext` 里)。

- [ ] **Step 5: 提交**

```bash
git add lib/domains/signals/kanpo-fetch.ts lib/domains/signals/kanpo-fetch.test.ts
git commit -m "feat(signals): 从官报首页和全体目次找会社決算公告的页，逐页下载切条" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 数据库

**Files:**
- Create: `lib/domains/signals/kanpo.ts`

- [ ] **Step 1: 写实现**

`lib/domains/signals/kanpo.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase";
import { companyKey, watchKeys, type KanpoNotice, type KanpoNoticeInput, type KanpoWatch } from "./kanpo-shared";

/**
 * 官报决算公告的数据库读写（页面和本机脚本都用）。决算公告是公开数据、不分用户；名单按用户。
 */

export const MISSING_KANPO_MIGRATION =
  "还差一步：迁移 082 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/082_kanpo_notices.sql 之后再来。";

const NOTICE_COLUMNS =
  "id, notice_key, issue_date, issue, page, pdf_url, company_name, company_key, address, period, fiscal_end, unit, total_assets, net_assets, retained_earnings, net_income, complete, raw_text";

function isMissingKanpo(message: string): boolean {
  return /kanpo_/.test(message);
}

function fail(message: string): never {
  throw new Error(isMissingKanpo(message) ? MISSING_KANPO_MIGRATION : message);
}

export async function saveNotices(notices: KanpoNoticeInput[]): Promise<void> {
  if (notices.length === 0) return;
  const rows = notices.map((n) => ({ ...n, company_key: n.company_name ? companyKey(n.company_name) : null }));
  const { error } = await supabaseAdmin.from("kanpo_notices").upsert(rows, { onConflict: "notice_key" });
  if (error) fail(error.message);
}

export async function markFetched(issueDate: string, pages: number, notices: number, incomplete: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("kanpo_fetch_days")
    .upsert({ issue_date: issueDate, pages, notices, incomplete, fetched_at: new Date().toISOString() }, { onConflict: "issue_date" });
  if (error) fail(error.message);
}

export async function fetchedDays(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("kanpo_fetch_days").select("issue_date");
  if (error) fail(error.message);
  return new Set((data ?? []).map((r) => r.issue_date as string));
}

export type KanpoStatus = { lastDay: string | null; notices: number; incomplete: number };

/** 页脚那一行：抓到哪天了、一共几条、几条没抽全。表还没建返回 "missing-schema"。 */
export async function kanpoStatus(): Promise<KanpoStatus | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("kanpo_fetch_days").select("issue_date, notices, incomplete");
  if (error) {
    if (isMissingKanpo(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  const days = (data ?? []).map((r) => r.issue_date as string).sort();
  return {
    lastDay: days.at(-1) ?? null,
    notices: (data ?? []).reduce((n, r) => n + (r.notices as number), 0),
    incomplete: (data ?? []).reduce((n, r) => n + (r.incomplete as number), 0),
  };
}

function toWatch(row: Record<string, unknown>): KanpoWatch {
  return {
    id: row.id as string,
    name_zh: row.name_zh as string,
    aliases: (row.aliases as string[] | null) ?? [],
    rejected: (row.rejected as string[] | null) ?? [],
    note: (row.note as string | null) ?? "",
    case_id: (row.case_id as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export async function listWatch(userId: string): Promise<KanpoWatch[]> {
  const { data, error } = await supabaseAdmin.from("kanpo_watch").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) fail(error.message);
  return (data ?? []).map(toWatch);
}

export async function addWatch(userId: string, input: { name_zh: string; aliases: string[]; note: string; case_id: string | null }): Promise<void> {
  const name_zh = input.name_zh.trim().slice(0, 80);
  const aliases = Array.from(new Set(input.aliases.map((a) => a.trim()).filter(Boolean))).slice(0, 8);
  if (!name_zh) throw new Error("写一下中国那边的名字。");
  if (aliases.length === 0) throw new Error("至少写一个日本法人名（官报上登的那个名字）。");
  const { error } = await supabaseAdmin
    .from("kanpo_watch")
    .insert({ user_id: userId, name_zh, aliases, note: input.note.trim().slice(0, 200), case_id: input.case_id });
  if (error) fail(error.message);
}

export async function removeWatch(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("kanpo_watch").delete().eq("user_id", userId).eq("id", id);
  if (error) fail(error.message);
}

/** 他点「不是这家」：把这个公司名记进 rejected，下次同名不再挂到这一家。 */
export async function rejectMatch(userId: string, id: string, key: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from("kanpo_watch").select("rejected").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail(error.message);
  if (!data) throw new Error("名单里没有这一家了");
  const rejected = Array.from(new Set([...((data.rejected as string[] | null) ?? []), key]));
  const { error: updateError } = await supabaseAdmin.from("kanpo_watch").update({ rejected }).eq("user_id", userId).eq("id", id);
  if (updateError) fail(updateError.message);
}

async function noticesForKeys(keys: string[]): Promise<KanpoNotice[]> {
  if (keys.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("kanpo_notices")
    .select(NOTICE_COLUMNS)
    .in("company_key", keys)
    .order("issue_date", { ascending: false });
  if (error) fail(error.message);
  return (data ?? []) as unknown as KanpoNotice[];
}

export type WatchRow = { watch: KanpoWatch; notices: KanpoNotice[] };

/** 名单每一家和对上的决算公告（新的在前）。表还没建返回 "missing-schema"。 */
export async function watchBoard(userId: string): Promise<WatchRow[] | "missing-schema"> {
  try {
    const list = await listWatch(userId);
    const notices = await noticesForKeys(list.flatMap((w) => watchKeys(w)));
    return list.map((watch) => {
      const keys = new Set(watchKeys(watch));
      return { watch, notices: notices.filter((n) => n.company_key && keys.has(n.company_key)) };
    });
  } catch (e) {
    if (e instanceof Error && e.message === MISSING_KANPO_MIGRATION) return "missing-schema";
    throw e;
  }
}

/** 在全部决算公告里按公司名搜（名单之外的也能搜）。 */
export async function searchNotices(q: string): Promise<KanpoNotice[]> {
  const text = q.trim().slice(0, 40);
  if (!text) return [];
  const { data, error } = await supabaseAdmin
    .from("kanpo_notices")
    .select(NOTICE_COLUMNS)
    .ilike("company_name", `%${text.replace(/[%_]/g, "")}%`)
    .order("issue_date", { ascending: false })
    .limit(30);
  if (error) fail(error.message);
  return (data ?? []) as unknown as KanpoNotice[];
}

/** 岗位页：这家公司最近一次决算公告。表还没建、没对上都返回 null。 */
export async function latestNoticeFor(companyName: string): Promise<KanpoNotice | null> {
  const { data, error } = await supabaseAdmin
    .from("kanpo_notices")
    .select(NOTICE_COLUMNS)
    .eq("company_key", companyKey(companyName))
    .order("issue_date", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingKanpo(error.message)) return null;
    throw new Error(error.message);
  }
  return ((data ?? [])[0] as unknown as KanpoNotice) ?? null;
}

/** 时差图谱：从图谱加进名单的那几家，各自最近一次决算公告（按 case_id）。表还没建返回空。 */
export async function caseNotices(userId: string): Promise<Map<string, KanpoNotice>> {
  const board = await watchBoard(userId);
  const out = new Map<string, KanpoNotice>();
  if (board === "missing-schema") return out;
  for (const row of board) {
    if (row.watch.case_id && row.notices[0]) out.set(row.watch.case_id, row.notices[0]);
  }
  return out;
}
```

- [ ] **Step 2: 检查、提交**

Run: `npx tsc --noEmit`
Expected: 没有输出。

```bash
git add lib/domains/signals/kanpo.ts
git commit -m "feat(signals): 官报决算公告的数据库读写（存、抓过哪天、名单、匹配、搜索、岗位页和图谱的查询）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 抓取命令和填表助手

**Files:**
- Create: `scripts/kanpo-run.ts`、`scripts/kanpo-fetch.ts`、`scripts/kanpo-state.ts`
- Modify: `scripts/jobs-helper.ts`、`package.json`

- [ ] **Step 1: 串起来的那一层**

`scripts/kanpo-run.ts`:

```ts
import { fetchDay, listIssues } from "@/lib/domains/signals/kanpo-fetch";
import { fetchedDays, markFetched, saveNotices } from "@/lib/domains/signals/kanpo";

/**
 * 抓官报的会社決算公告：默认把首页上最近 90 天里还没抓过的日子补齐（新的在后）；给 only 就只抓那一天（重抓也行）。
 * 一天抓完才记"抓过"，中途断了下次从那天接着。
 */
export async function runKanpoFetch(only?: string, log: (line: string) => void = console.log): Promise<{ days: number; notices: number; incomplete: number }> {
  const issues = await listIssues();
  const dates = Array.from(new Set(issues.map((i) => `${i.date.slice(0, 4)}-${i.date.slice(4, 6)}-${i.date.slice(6, 8)}`))).sort();
  const done = await fetchedDays();
  const todo = only ? [only] : dates.filter((d) => !done.has(d));
  let notices = 0;
  let incomplete = 0;
  for (const day of todo) {
    const r = await fetchDay(day, issues);
    await saveNotices(r.notices);
    const bad = r.notices.filter((n) => !n.complete).length;
    await markFetched(day, r.pages, r.notices.length, bad);
    notices += r.notices.length;
    incomplete += bad;
    log(`${day}：读了 ${r.pages} 页，决算公告 ${r.notices.length} 条${bad > 0 ? `（${bad} 条没抽全，原文留着）` : ""}`);
  }
  return { days: todo.length, notices, incomplete };
}
```

- [ ] **Step 2: 手动命令**

`scripts/kanpo-fetch.ts`:

```ts
/**
 * 抓官报的会社決算公告：
 *   npm run kanpo:fetch              把最近 90 天里还没抓过的日子补齐（第一次要跑一阵子）
 *   npm run kanpo:fetch -- 2026-10-16  只抓那一天
 * 填表助手每天第一次开起来时也会跑一次。
 */
import { markKanpoFetched } from "./kanpo-state";
import { runKanpoFetch } from "./kanpo-run";
import { patchDns } from "./dns-patch";
import { tokyoDate } from "@/lib/domains/jobs/shared";

async function main(): Promise<void> {
  patchDns();
  const only = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const started = Date.now();
  const r = await runKanpoFetch(only);
  if (!only) markKanpoFetched(tokyoDate());
  console.log(
    r.days === 0
      ? "都抓过了，没有新的日子。"
      : `抓完了（${Math.round((Date.now() - started) / 60000)} 分钟）：${r.days} 天，决算公告 ${r.notices} 条，没抽全 ${r.incomplete} 条。去 /signals/kanpo 看。`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 3: 今天抓过没有**

`scripts/kanpo-state.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** 今天抓过官报没有，记在这台电脑上：填表助手自动跑的、npm run kanpo:fetch 手动跑的，算同一件事。 */
const STATE = join(tmpdir(), "ideaos-jobs", "last-kanpo-fetch.txt");

export function kanpoFetchedOn(): string {
  try {
    return readFileSync(STATE, "utf8").trim();
  } catch {
    return "";
  }
}

export function markKanpoFetched(day: string): void {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, day, "utf8");
}
```

- [ ] **Step 4: 填表助手每天顺手跑一次**

`scripts/jobs-helper.ts`:

import 区(`import { markBigSearched` 那一行附近)加:

```ts
import { kanpoFetchedOn, markKanpoFetched } from "./kanpo-state";
import { runKanpoFetch } from "./kanpo-run";
```

`let bigSearching` 那一行(找 `bigSearching` 的声明)下面加一行:

```ts
let kanpoFetching = false;
```

`async function maybeBigSearch()` 整个函数后面加:

```ts
/** 助手开着时每天第一次顺手抓一次官报（在后台跑，不挡着填表；第一次要补 90 天，会跑一阵子）。 */
async function maybeKanpo(): Promise<void> {
  if (kanpoFetching) return;
  const today = tokyoDate();
  if (kanpoFetchedOn() === today) return;
  kanpoFetching = true;
  try {
    console.log("今天还没抓官报，开始抓会社決算公告（不挡着填表）……");
    const r = await runKanpoFetch(undefined, (line) => console.log(`官报 ${line}`));
    markKanpoFetched(today);
    if (r.days > 0) console.log(`官报抓完了：${r.days} 天，决算公告 ${r.notices} 条。去 /signals/kanpo 看。`);
  } catch (e) {
    console.error(`官报没抓成：${e instanceof Error ? e.message : String(e)}（过一会儿会再试）`);
  } finally {
    kanpoFetching = false;
  }
}
```

主循环里 `void maybeBigSearch();` 下面加一行:

```ts
    void maybeKanpo();
```

- [ ] **Step 5: package.json 的命令**

`"jobs:search": "tsx --env-file=.env.local scripts/jobs-search.ts"` 那一行后面加(注意前一行补逗号):

```json
    "kanpo:fetch": "tsx --env-file=.env.local scripts/kanpo-fetch.ts"
```

- [ ] **Step 6: 检查、提交**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

```bash
git add scripts/kanpo-run.ts scripts/kanpo-fetch.ts scripts/kanpo-state.ts scripts/jobs-helper.ts package.json
git commit -m "feat(signals): npm run kanpo:fetch 补齐最近 90 天的官报决算公告，填表助手每天顺手抓一次" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 新页 /signals/kanpo

**Files:**
- Create: `app/(app)/signals/kanpo/page.tsx`、`actions.ts`、`watch-form.tsx`、`watch-actions.tsx`、`notice-line.tsx`

- [ ] **Step 1: server actions**

`app/(app)/signals/kanpo/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addWatch, rejectMatch, removeWatch } from "@/lib/domains/signals/kanpo";

type Result = { ok: true } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function addWatchAction(input: { name_zh: string; aliases: string; note: string; case_id: string | null }): Promise<Result> {
  const userId = await requireUserId();
  try {
    await addWatch(userId, { name_zh: input.name_zh, aliases: input.aliases.split(/\r?\n/), note: input.note, case_id: input.case_id });
    revalidatePath("/signals/kanpo");
    revalidatePath("/signals/atlas");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没加上") };
  }
}

export async function removeWatchAction(id: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await removeWatch(userId, id);
    revalidatePath("/signals/kanpo");
    revalidatePath("/signals/atlas");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没删掉") };
  }
}

export async function rejectMatchAction(id: string, key: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await rejectMatch(userId, id, key);
    revalidatePath("/signals/kanpo");
    revalidatePath("/signals/atlas");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没解除") };
  }
}
```

- [ ] **Step 2: 一条决算公告的那一行(三处共用)**

`app/(app)/signals/kanpo/notice-line.tsx`:

```tsx
import { formatYen, type KanpoNotice } from "@/lib/domains/signals/kanpo-shared";

/** 一条决算公告：第几期、决算日、总资产、当期纯损益、利益剰余金（负数写成累计亏损），附官报那一页的链接。没抽全的只给原文链接。 */
export function NoticeLine({ notice }: { notice: KanpoNotice }) {
  const link = (
    <a href={notice.pdf_url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
      官报 {notice.issue_date} {notice.issue} 第 {notice.page} 页 ↗
    </a>
  );
  if (!notice.complete) {
    return (
      <span>
        {notice.company_name ?? "这一条"}没抽全，数字看原文：{link}
      </span>
    );
  }
  const parts = [
    `${notice.period ?? ""}${notice.fiscal_end ? `（${notice.fiscal_end}）` : ""}`,
    notice.total_assets !== null ? `总资产 ${formatYen(notice.total_assets)}` : null,
    notice.net_income !== null ? `${notice.net_income < 0 ? "当期纯损失" : "当期纯利益"} ${formatYen(Math.abs(notice.net_income))}` : null,
    notice.retained_earnings !== null
      ? notice.retained_earnings < 0
        ? `累计亏损 ${formatYen(Math.abs(notice.retained_earnings))}`
        : `利益剰余金 ${formatYen(notice.retained_earnings)}`
      : null,
    notice.unit ? `（原单位${notice.unit}）` : null,
  ].filter(Boolean);
  return (
    <span>
      {parts.join(" · ")} · {link}
    </span>
  );
}
```

- [ ] **Step 3: 加一家**

`app/(app)/signals/kanpo/watch-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addWatchAction } from "./actions";

/** 加一家：中国那边的名字 + 日本法人名（一行一种写法）。从时差图谱点进来时带着那一件的 id 和备注。 */
export function WatchForm({ caseId, note: initialNote }: { caseId: string | null; note: string }) {
  const router = useRouter();
  const [nameZh, setNameZh] = useState("");
  const [aliases, setAliases] = useState("");
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await addWatchAction({ name_zh: nameZh, aliases, note, case_id: caseId });
      if (!r.ok) setError(r.message);
      else {
        setNameZh("");
        setAliases("");
        setNote("");
        router.replace("/signals/kanpo");
        router.refresh();
      }
    });

  return (
    <div className="space-y-3 text-sm">
      <Input value={nameZh} onChange={(e) => setNameZh(e.target.value)} placeholder="中国那边的名字，例：谭仔国际" />
      <Textarea
        rows={3}
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder={"日本法人名，一行一种写法（官报上登的那个名字），例：\n株式会社譚仔日本"}
      />
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（选填）" />
      <Button size="sm" disabled={pending || !nameZh.trim() || !aliases.trim()} onClick={submit}>
        {pending ? "在加…" : "加进名单"}
      </Button>
      {caseId && <p className="text-xs text-muted-foreground">从时差图谱点进来的：加好以后，图谱那一件旁边会显示它的官报决算。</p>}
      {error && <p className="text-xs text-muted-foreground">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: 删掉、解除匹配**

`app/(app)/signals/kanpo/watch-actions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { rejectMatchAction, removeWatchAction } from "./actions";

export function RemoveWatchButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      size="sm"
      variant="ghost"
      confirmLabel="再点一次删掉"
      onClick={async () => {
        const r = await removeWatchAction(id);
        if (r.ok) router.refresh();
      }}
    >
      从名单删掉
    </ConfirmButton>
  );
}

/** 「不是这家」：同名但不是名单里那一家（例如同名的日本公司），以后不再挂上来。 */
export function RejectMatchButton({ id, companyKey }: { id: string; companyKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await rejectMatchAction(id, companyKey);
            if (!r.ok) setError(r.message);
            else router.refresh();
          })
        }
      >
        不是这家
      </Button>
      {error && <span className="text-xs text-muted-foreground">{error}</span>}
    </>
  );
}
```

- [ ] **Step 5: 页面**

`app/(app)/signals/kanpo/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoDate } from "@/lib/domains/jobs/shared";
import { kanpoStatus, MISSING_KANPO_MIGRATION, searchNotices, watchBoard } from "@/lib/domains/signals/kanpo";
import { NoticeLine } from "./notice-line";
import { RejectMatchButton, RemoveWatchButton } from "./watch-actions";
import { WatchForm } from "./watch-form";

export const dynamic = "force-dynamic";

const STALE_DAYS = 3;

export default async function KanpoPage({ searchParams }: { searchParams: { q?: string; case?: string; note?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [status, board] = await Promise.all([kanpoStatus(), watchBoard(user.id)]);
  const q = (searchParams.q ?? "").trim();
  const caseId = searchParams.case && /^[0-9a-f-]{36}$/i.test(searchParams.case) ? searchParams.case : null;

  if (status === "missing-schema" || board === "missing-schema") {
    return (
      <PageContainer width="narrow">
        <PageHeader title="在日本的中国公司" />
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_KANPO_MIGRATION}</p>
      </PageContainer>
    );
  }
  const results = q ? await searchNotices(q) : [];
  const staleDays = status.lastDay ? Math.floor((Date.parse(tokyoDate()) - Date.parse(status.lastDay)) / 86_400_000) : null;

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/atlas" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 时差图谱
        </Link>
      </p>
      <PageHeader
        eyebrow="Kanpo"
        title="在日本的中国公司"
        description="进了日本以后成绩怎样，看它登在官报上的决算公告：总资产、当期赚了还是亏了、累计亏损多少。数字是从官报原文里按规则截的，每条都附官报那一页。只摆数字，不评好坏。"
      />

      <div className="space-y-10 text-sm leading-7">
        <section>
          <h2 className="text-base font-semibold">名单（{board.length} 家）</h2>
          {board.length === 0 ? (
            <p className="mt-2 text-muted-foreground">这里空着。在下面加一家：写上中国那边的名字，和它在日本登记的公司名。</p>
          ) : (
            <ul className="mt-3 space-y-5">
              {board.map(({ watch, notices }) => (
                <li key={watch.id} className="border-b border-border pb-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {watch.name_zh}
                      <span className="ml-2 font-normal text-muted-foreground">{watch.aliases.join(" / ")}</span>
                    </p>
                    <RemoveWatchButton id={watch.id} />
                  </div>
                  {watch.note && <p className="text-xs text-muted-foreground">{watch.note}</p>}
                  {notices.length === 0 ? (
                    <p className="mt-1 text-muted-foreground">抓到的官报里还没找到它登决算。可能登在自己网站上、不登，或者日本法人名的写法不一样。</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {notices.map((n) => (
                        <li key={n.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">{n.company_name}：</span>
                          <NoticeLine notice={n} />
                          {n.company_key && <RejectMatchButton id={watch.id} companyKey={n.company_key} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-base font-semibold">加一家</h2>
          <p className="mt-1 text-xs text-muted-foreground">日本法人名要写官报上登的那个（例：株式会社〇〇ジャパン）。不让 AI 猜 —— 猜错了会把别家的决算挂到它头上。</p>
          <div className="mt-3">
            <WatchForm caseId={caseId} note={searchParams.note ?? ""} />
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold">搜官报决算</h2>
          <form method="get" className="mt-3 flex gap-2">
            <Input name="q" defaultValue={q} placeholder="公司名的一部分，例：ジャパン" className="h-9" />
            <Button type="submit" size="sm" variant="outline">
              搜
            </Button>
          </form>
          {q && (
            <ul className="mt-3 space-y-1">
              {results.length === 0 ? (
                <li className="text-muted-foreground">抓到的官报里没有名字里带「{q}」的决算公告。</li>
              ) : (
                results.map((n) => (
                  <li key={n.id}>
                    <span className="text-xs text-muted-foreground">{n.company_name}：</span>
                    <NoticeLine notice={n} />
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        <footer className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
          <p>
            {status.lastDay ? `抓到 ${status.lastDay} 的官报，一共存了 ${status.notices} 条决算公告，其中 ${status.incomplete} 条没抽全（原文留着）。` : "还没抓过官报。"}
            {(staleDays === null || staleDays > STALE_DAYS) && " 在你电脑上跑一下 npm run kanpo:fetch（或者开着填表助手，它每天会顺手抓）。"}
          </p>
          <p>只有在官报登决算公告的公司才查得到；很多公司登在自己网站上或者不登。官报免费的只有最近 90 天，这里从开始抓的那天往后攒。</p>
        </footer>
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 6: 检查、提交**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

```bash
git add "app/(app)/signals/kanpo"
git commit -m "feat(signals): /signals/kanpo 在日本的中国公司——名单、对上的官报决算、加一家、搜索、抓到哪天" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 时差图谱、差距清单、岗位页

**Files:**
- Modify: `app/(app)/signals/atlas/page.tsx`、`app/(app)/signals/gaps/page.tsx`、`app/(app)/jobs/[id]/page.tsx`

- [ ] **Step 1: 时差图谱**

`app/(app)/signals/atlas/page.tsx`:

import 区加:

```ts
import { caseNotices } from "@/lib/domains/signals/kanpo";
import type { KanpoNotice } from "@/lib/domains/signals/kanpo-shared";
import { NoticeLine } from "../kanpo/notice-line";
```

`function CaseRow({ c }: { c: TransferCase })` 改成:

```tsx
function CaseRow({ c, notice }: { c: TransferCase; notice: KanpoNotice | undefined }) {
```

在 CaseRow 里 `<p className="text-sm leading-7">` 写「日本…」那一段(`{c.japan_event ?? "至今没有"}` 所在的 `</p>`)后面加:

```tsx
      {notice ? (
        <p className="text-xs leading-6">
          <span className="text-muted-foreground">官报：</span>
          <NoticeLine notice={notice} />
        </p>
      ) : (
        <p className="text-xs leading-6">
          <Link
            href={`/signals/kanpo?case=${c.id}&note=${encodeURIComponent(`时差图谱：${c.thing}`)}`}
            className="text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
          >
            把带进来的公司加进官报名单，看它在日本的决算 →
          </Link>
        </p>
      )}
```

`const cases = await listTransferCases(user.id);` 下面加:

```ts
  const notices = await caseNotices(user.id);
```

把 `<CaseRow key={c.id} c={c} />` 改成:

```tsx
                          <CaseRow key={c.id} c={c} notice={notices.get(c.id)} />
```

`PageHeader` 前面那个 `← 差距清单` 的 `<p>` 里,`</Link>` 后面加:

```tsx
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/signals/kanpo" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          在日本的中国公司（官报决算）
        </Link>
```

- [ ] **Step 2: 差距清单**

`app/(app)/signals/gaps/page.tsx`:把

```tsx
        <Link href="/signals/atlas" className="text-primary underline-offset-4 hover:underline">
          时差图谱：这类东西以前多久到日本 →
        </Link>
```

改成

```tsx
        <Link href="/signals/atlas" className="text-primary underline-offset-4 hover:underline">
          时差图谱：这类东西以前多久到日本 →
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/signals/kanpo" className="text-primary underline-offset-4 hover:underline">
          在日本的中国公司：官报上的决算 →
        </Link>
```

- [ ] **Step 3: 岗位页**

`app/(app)/jobs/[id]/page.tsx`:

import 区加:

```ts
import { latestNoticeFor } from "@/lib/domains/signals/kanpo";
import { NoticeLine } from "../../signals/kanpo/notice-line";
```

把 `Promise.all([` 那一组(现在是 `const [profile, entries, resume, application, fill, cases] = await Promise.all([`)末尾加一项,变成:

```ts
  const [profile, entries, resume, application, fill, cases, kanpo] = await Promise.all([
    getJobProfile(user.id),
    listCareerEntries(user.id),
    latestResume(user.id, posting.id),
    getApplicationForPosting(user.id, posting.id),
    getFillState(user.id, posting.id),
    listCaseDrills(user.id, posting.id),
    latestNoticeFor(posting.company_name),
  ]);
```

把 `<PostingFacts posting={posting} profile={profile === "missing-schema" ? null : profile} />` 改成:

```tsx
        <div className="space-y-2">
          <PostingFacts posting={posting} profile={profile === "missing-schema" ? null : profile} />
          {kanpo && (
            <p className="text-xs leading-6">
              <span className="text-muted-foreground">官报决算：</span>
              <NoticeLine notice={kanpo} />
              <span className="ml-1 text-muted-foreground">（只查得到在官报登过、最近抓到的；查不到不代表没登）</span>
            </p>
          )}
        </div>
```

- [ ] **Step 4: 检查、提交**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

```bash
git add "app/(app)/signals/atlas/page.tsx" "app/(app)/signals/gaps/page.tsx" "app/(app)/jobs/[id]/page.tsx"
git commit -m "feat(signals): 时差图谱显示带进来的公司的官报决算，差距清单加入口，岗位页显示那家公司的官报决算" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 宪法、设计文档补记

**Files:**
- Modify: `CLAUDE.md`(CRLF,用 Python 按字节改,保持换行)、`docs/superpowers/specs/2026-10-17-signals-kanpo-design.md`

- [ ] **Step 1: CLAUDE.md**

signals 那一行末尾的 `;不打分、不给投资建议 |` 换成:

```
;**官报决算公告**(一手数据第一步,经用户同意 2026-10-17;迁移 082):他电脑上每天抓当天官报的会社決算公告(`npm run kanpo:fetch`,填表助手每天开起来时也跑;第一次补最近 90 天;从官报首页和全体目次找到那几页,一页一页下 PDF、pdfjs 抽字、间隔 0.5 秒),全部存;字段只用规则抽、不让 AI 猜数字(官报的负号是私用区字符 U+E888/U+E6F0,竖排是汉字数字),抽不全标出来留原文;金额按单位换成日元存;「在日本的中国公司」名单他自己维护(日本法人名不让 AI 猜),公司名归一化后完全相同才算对上,他可以点"不是这家"解除;从时差图谱加进名单时记下那一件(case_id),图谱那一件旁显示官报决算(只显示不改档);/signals/kanpo 显示名单、对上的决算、搜全部决算、抓到哪天;岗位页显示那家公司最近一次官报决算(查不到不代表没登);不打分、不写趋势评语;不打分、不给投资建议 |
```

Schema 段 `job_case_drills(迁移 081)…` 那两行后面加:

```
  kanpo_notices / kanpo_fetch_days / kanpo_watch(迁移 082):官报决算公告(公开数据,不分用户,金额换成日元,complete=四样都抽到)、哪天抓过、他的在日中国公司名单(aliases 原样存、匹配时归一化,rejected 是他解除过的,case_id 指向时差图谱那一件);
  抓取在本机(lib/domains/signals/kanpo-fetch.ts、kanpo-pdf.ts,页面不 import),读写在 lib/domains/signals/kanpo.ts。
```

用 Python 改(按字节读写,保持 CRLF):

```bash
python - <<'EOF'
p = 'CLAUDE.md'
s = open(p, 'rb').read().decode('utf8')
old_row = ';不打分、不给投资建议 |'
assert s.count(old_row) == 1
new_row = (';**官报决算公告**(一手数据第一步,经用户同意 2026-10-17;迁移 082):他电脑上每天抓当天官报的会社決算公告(`npm run kanpo:fetch`,填表助手每天开起来时也跑;第一次补最近 90 天;'
           '从官报首页和全体目次找到那几页,一页一页下 PDF、pdfjs 抽字、间隔 0.5 秒),全部存;字段只用规则抽、不让 AI 猜数字(官报的负号是私用区字符 U+E888/U+E6F0,竖排是汉字数字),抽不全标出来留原文;'
           '金额按单位换成日元存;「在日本的中国公司」名单他自己维护(日本法人名不让 AI 猜),公司名归一化后完全相同才算对上,他可以点"不是这家"解除;'
           '从时差图谱加进名单时记下那一件(case_id),图谱那一件旁显示官报决算(只显示不改档);/signals/kanpo 显示名单、对上的决算、搜全部决算、抓到哪天;'
           '岗位页显示那家公司最近一次官报决算(查不到不代表没登);不打分、不写趋势评语;不打分、不给投资建议 |')
s = s.replace(old_row, new_row)
anchor = '只在 lib/domains/jobs/cases.ts 读写。'
assert s.count(anchor) == 1
s = s.replace(anchor, anchor
    + '
  kanpo_notices / kanpo_fetch_days / kanpo_watch(迁移 082):官报决算公告(公开数据,不分用户,金额换成日元,complete=四样都抽到)、哪天抓过、他的在日中国公司名单(aliases 原样存、匹配时归一化,rejected 是他解除过的,case_id 指向时差图谱那一件);'
    + '
  抓取在本机(lib/domains/signals/kanpo-fetch.ts、kanpo-pdf.ts,页面不 import),读写在 lib/domains/signals/kanpo.ts。')
open(p, 'wb').write(s.encode('utf8'))
EOF
file CLAUDE.md
git diff --stat CLAUDE.md
```

Expected: `with CRLF line terminators`;`CLAUDE.md | 4 +++-`。

- [ ] **Step 2: 设计文档补记**

在 `docs/superpowers/specs/2026-10-17-signals-kanpo-design.md` 末尾追加一节:

```markdown
## 写计划时补的(2026-10-17)

- 官报的负号是私用区字符:横排 U+E888、竖排 U+E6F0,按负号认;不认的话累计亏损全被读成正数。
- 竖排的决算公告用汉字数字(「四〇、八五二」)、「資産の部合計」、公司名在表后面;公司名会折成两行(上一行以「・」结尾或全是英文)。
- 时差图谱的每一件没有日本法人名那一格,所以从图谱加进名单时记下那一件的 id(`kanpo_watch.case_id`),图谱按 id 显示;差距清单的条目是产品不是公司,只放入口链接。
- 官报首页列着最近 90 天每一份的整份链接(文件名带页码范围),当天全体目次里「会社決算公告」的链接带起始页,一天只要读首页和目次两个网页再加那几页 PDF。
```

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-17-signals-kanpo-design.md
git commit -m "docs(signals): 宪法写进官报决算公告；设计文档补记写计划时试出来的几条" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 全部验证 + 真跑一天

- [ ] **Step 1: 三项检查**

Run: `npx tsc --noEmit`
Expected: 没有输出。

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

Run: `npm test`
Expected: 全部通过(materials `domain.test.ts` 冷启动偶尔超时,重跑就过)。

- [ ] **Step 2: 请他跑迁移 082**

告诉他在 Supabase 的 SQL Editor 里执行 `supabase/migrations/082_kanpo_notices.sql`。没跑之前,下一步会报"迁移 082 还没跑"。

- [ ] **Step 3: 真跑一天**

Run: `npm run kanpo:fetch -- 2026-10-16`(两三分钟)
Expected: 一行 `2026-10-16：读了 N 页，决算公告 M 条…`;M 应在几十条以上;没抽全的占比如果超过两成,先看那几条的原文(`raw_text`)补规则,再继续。

- [ ] **Step 4: 交给他**

告诉他:
1. 第一次补 90 天:`npm run kanpo:fetch`(几千页,跑一阵子,中途断了再跑会接着);
2. 打开 `/signals/kanpo`,往名单里加 10 到 20 家在日本的中国公司(例:谭仔 → 株式会社譚仔日本),看找到了几家;
3. 看完决定要不要把 `feat/kanpo` 合回 main(不 push)。

---

## 自查(写计划时做过)

- 设计五条都有任务:全存(5、6)、本机跑与补 90 天(4、6)、规则抽不让 AI 猜(3)、名单与归一化匹配与解除(3、5、7)、三处显示(7、8)。
- 名字前后一致:`ParsedNotice`/`KanpoNoticeInput`/`KanpoNotice`/`KanpoWatch`/`KanpoUnit`;`squashCjk`/`splitNotices`(返回 `{start, block}`)/`parseNotice`/`companyKey`/`watchKeys`/`formatYen`;
  `parseIssueIndex`/`parseSettlementSections`/`pageUrl`/`issueLabel`/`listIssues`/`fetchDay`;`saveNotices`/`markFetched`/`fetchedDays`/`kanpoStatus`/`listWatch`/`addWatch`/`removeWatch`/`rejectMatch`/`watchBoard`/`searchNotices`/`latestNoticeFor`/`caseNotices`;`runKanpoFetch`;`kanpoFetchedOn`/`markKanpoFetched`。
- 测试里 `splitNotices(FIXTURE).map((b) => parseNotice(b.block))`,和实现的返回形状一致。
