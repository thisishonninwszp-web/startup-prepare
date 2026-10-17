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
