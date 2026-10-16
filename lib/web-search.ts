import type { TavilyResult } from "@/app/(app)/ideas/types";
import { fetchPublicPage } from "@/app/(app)/materials/fetch-page";
import { AI_MODEL, executeAiGroundedSearch } from "@/lib/ai-gateway";
import { tavilySearch } from "@/lib/external";
import { extractSearchText } from "@/lib/domains/signals/rss";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * 上网搜资料：先用 Gemini 自带的 Google 搜索找网页，再自己去把网页读下来；找不到或出错才退回 Tavily。
 *
 * 为什么不直接用 AI 搜出来的那段话：整个系统靠"原文逐字核对"，AI 的总结没法核对。
 * 这里只借 Google 找到"哪几篇网页"，正文是代码自己抓的，后面的核对一行不用改。
 *
 * 为什么换：Tavily 免费版一个月一千次左右，往下推、差距清单、在追的问题每天都在搜，不够用；
 * Gemini 的 Google 搜索免费层一天五百次（付费层一天一千五百次免费）。
 * 代价是慢几秒（要多读一次网页），要登录或正文是脚本画出来的网页读不到，那一篇就不算。
 */

/** 每篇网页最多等多久（跳转加读取）。 */
const PAGE_TIMEOUT_MS = 8_000;
/**
 * Google 这条路一共最多等多久，超了就改用 Tavily（一两秒）。
 * 每天早上的报告和问题跟进都在 60 秒的定时任务里跑，一次搜索不能拖太久。
 */
const GOOGLE_BUDGET_MS = 12_000;
/** 每篇只留和搜索词最相关的这么多字，像 Tavily 给的摘录那样。 */
const EXCERPT_LENGTH = 1500;

/**
 * 从整篇正文里挑和搜索词最相关的几段（按段里出现了几个搜索词排），再按原来的顺序拼回去。
 * 读到的是整篇文章，直接截开头常常只是导语；后面拿去核对的人只看前一两千字。
 */
export function relevantExcerpt(body: string, query: string, maxLength = EXCERPT_LENGTH): string {
  const paragraphs = body.split("\n").map((t) => t.trim()).filter(Boolean);
  const terms = query
    .toLowerCase()
    .split(/[\s　、,，]+/)
    .filter((t) => t.length >= 2);
  const scored = paragraphs.map((text, i) => {
    const lower = text.toLowerCase();
    return { i, text, score: terms.filter((t) => lower.includes(t)).length };
  });
  const picked: typeof scored = [];
  let total = 0;
  // 放得下才放（第一段放不下就截断）：最后再截一刀的话，按原顺序排在后面的相关段会被切掉
  for (const p of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (picked.length > 0 && total + p.text.length + 1 > maxLength) continue;
    picked.push(p);
    total += p.text.length + 1;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((p) => p.text)
    .join("\n")
    .slice(0, maxLength);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** 让 Google 找网页，再一篇篇读下来。读不到正文的丢掉。 */
async function googleSearch(query: string, maxResults: number): Promise<TavilyResult[]> {
  const sources = await executeAiGroundedSearch(
    { operation: "web_search", module: "unknown", timeoutMs: 20_000, payloadLogging: "metadata_only" },
    {
      model: AI_MODEL,
      contents: `用 Google 搜：${query}\n找 ${maxResults} 篇左右最相关的网页（新闻、官方发布、公司页面都行），每篇一句话说它讲了什么。`,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1024,
      },
    }
  );
  // 多读两篇，抵掉读不到的
  const pages = await Promise.all(
    sources.slice(0, maxResults + 2).map((s) =>
      withTimeout(
        fetchPublicPage(s.uri, (html) => extractSearchText(html)).catch(() => ({ ok: false as const, reason: "读不了" })),
        PAGE_TIMEOUT_MS,
        { ok: false as const, reason: "超时" }
      )
    )
  );
  const seen = new Set<string>();
  const results: TavilyResult[] = [];
  pages.forEach((page, i) => {
    if (!page.ok || seen.has(page.finalUrl)) return;
    seen.add(page.finalUrl);
    results.push({ title: page.title || sources[i].title, url: page.finalUrl, content: relevantExcerpt(page.body, query) });
  });
  return results.slice(0, maxResults);
}

function inDomains(url: string, domains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * 和 tavilySearch 一样的用法和返回。两边都失败时抛 Tavily 的错（调用方本来就会降级）。
 * domains：只要这几个网站的页面。Gemini 的 Google 搜索不理会 site:（2026-10 试过，十条里只有一条在范围里），
 * 所以这时先用 Tavily 的 include_domains，没结果再用 Google 搜、按域名过滤。
 */
export async function webSearch(query: string, maxResults = 6, options: { domains?: string[] } = {}): Promise<TavilyResult[]> {
  const domains = options.domains ?? [];
  if (domains.length > 0) {
    const viaTavily = await tavilySearch(query, maxResults, domains).catch(() => [] as TavilyResult[]);
    const kept = viaTavily.filter((r) => inDomains(r.url, domains));
    if (kept.length > 0) return kept;
    const siteQuery = `${query} ${domains.map((d) => `site:${d}`).join(" OR ")}`;
    const viaGoogle = await withTimeout(googleSearch(siteQuery, maxResults), GOOGLE_BUDGET_MS, [] as TavilyResult[]).catch(() => [] as TavilyResult[]);
    return viaGoogle.filter((r) => inDomains(r.url, domains));
  }
  try {
    // 超时、限流（429）、一篇都没读到，都改用 Tavily
    const found = await withTimeout(googleSearch(query, maxResults), GOOGLE_BUDGET_MS, [] as TavilyResult[]);
    if (found.length > 0) return found;
  } catch (e) {
    console.error("google search failed, falling back to tavily", e);
  }
  return tavilySearch(query, maxResults);
}

/** 最近 24 小时用 Google 搜了几次、其中几次没成（没成的都改用了 Tavily）。从 AI 调用日志里数。 */
export async function googleSearchCount(): Promise<{ total: number; failed: number }> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const count = async (failedOnly: boolean) => {
    let q = supabaseAdmin.from("ai_calls").select("id", { count: "exact", head: true }).eq("operation", "web_search").gte("created_at", since);
    if (failedOnly) q = q.eq("status", "failed");
    const { count: n, error } = await q;
    if (error) throw new Error(error.message);
    return n ?? 0;
  };
  const [total, failed] = await Promise.all([count(false), count(true)]);
  return { total, failed };
}
