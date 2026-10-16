import type { TavilyResult } from "@/app/(app)/ideas/types";

/**
 * 外部检索层：Tavily（为 LLM/agent 设计的搜索+抽取 API）。
 * 仅服务端使用。惰性读 key：缺 TAVILY_API_KEY 不崩，调用时才报错（被上层降级）。
 * 不自建爬虫——按需查询、自带真实来源、零爬虫基建。
 */

const TAVILY_BASE = "https://api.tavily.com";

/** 外部检索是否已配置（用于前端按钮置灰）。 */
export function externalConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

function authHeaders(): Record<string, string> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("未配置 TAVILY_API_KEY，外部检索暂不可用。");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

function toResults(data: unknown): TavilyResult[] {
  const results =
    data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)
      ? ((data as { results: unknown[] }).results as Record<string, unknown>[])
      : [];
  return results.map((r) => ({
    title: typeof r.title === "string" ? r.title : "",
    url: typeof r.url === "string" ? r.url : "",
    content:
      typeof r.content === "string"
        ? r.content
        : typeof r.raw_content === "string"
          ? r.raw_content
          : "",
  }));
}

/** 按主题联网搜索，返回带正文与真实链接的结果。includeDomains：只要这几个网站的页面。 */
export async function tavilySearch(
  query: string,
  maxResults = 6,
  includeDomains?: string[]
): Promise<TavilyResult[]> {
  const res = await fetch(`${TAVILY_BASE}/search`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
      ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Tavily 搜索失败（${res.status}）`);
  return toResults(await res.json());
}

/** 抽取单个 URL 的正文（粘贴链接路径）。 */
export async function tavilyExtract(url: string): Promise<TavilyResult> {
  const res = await fetch(`${TAVILY_BASE}/extract`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ urls: [url] }),
  });
  if (!res.ok) throw new Error(`Tavily 抽取失败（${res.status}）`);
  const results = toResults(await res.json());
  const first = results[0];
  return { title: first?.title || url, url, content: first?.content ?? "" };
}

/**
 * Tavily 这个账单周期用了多少次、上限多少（GET /usage）。没配 Key 返回 "unconfigured"，读不到返回 null。
 * 上限优先看这个 Key 的，没设就看账户套餐的。
 */
export async function tavilyUsage(): Promise<{ used: number; limit: number | null } | "unconfigured" | null> {
  if (!process.env.TAVILY_API_KEY) return "unconfigured";
  try {
    const res = await fetch(`${TAVILY_BASE}/usage`, { headers: authHeaders(), cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      key?: { usage?: number; limit?: number | null };
      account?: { plan_usage?: number; plan_limit?: number | null };
    };
    const used = data.key?.usage ?? data.account?.plan_usage;
    if (typeof used !== "number") return null;
    const limit = data.key?.limit ?? data.account?.plan_limit ?? null;
    return { used, limit: typeof limit === "number" ? limit : null };
  } catch {
    return null;
  }
}
