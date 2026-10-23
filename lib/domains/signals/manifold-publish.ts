/**
 * 把他的题放到 Manifold（https://manifold.markets，用游戏币 mana 的预测市场），让陌生人也来判断。
 * 要 MANIFOLD_API_KEY（他在 Manifold 注册后在个人设置里生成，放进 Vercel）；出一道二选一的题花 50 mana（不是真钱）。
 * 他每点一次才发一道（发出去是公开的）。到期由这边对账以后替他在 Manifold 上结算。
 */

const API = "https://api.manifold.markets/v0";

export function manifoldKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.MANIFOLD_API_KEY || null;
}

async function call(path: string, key: string | null, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Key ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new Error(`Manifold：${json?.message ?? res.status}`);
  return json;
}

/** 出一道二选一的题（开盘五成，免得用 AI 或他的数带偏别人），到截止那天日本时间晚上关。 */
export async function createManifoldMarket(input: { question: string; description: string; closeOn: string }, key: string): Promise<{ id: string; url: string }> {
  const r = (await call(
    "/market",
    key,
    {
      outcomeType: "BINARY",
      question: input.question,
      descriptionMarkdown: input.description,
      closeTime: Date.parse(`${input.closeOn}T23:59:00+09:00`),
      initialProb: 50,
    }
  )) as { id?: string; url?: string; slug?: string };
  if (!r?.id) throw new Error("Manifold 没回题目的编号");
  return { id: r.id, url: r.url ?? `https://manifold.markets/market/${r.id}` };
}

/** 现在大家给的几成（0–1）；取不到返回 null。 */
export async function manifoldProbability(id: string): Promise<number | null> {
  try {
    const r = (await call(`/market/${encodeURIComponent(id)}`, null)) as { probability?: number };
    return typeof r.probability === "number" ? r.probability : null;
  } catch {
    return null;
  }
}

/** 这边对完账，替他在 Manifold 上结算。 */
export async function resolveManifoldMarket(id: string, outcome: "YES" | "NO" | "CANCEL", key: string): Promise<void> {
  await call(`/market/${encodeURIComponent(id)}/resolve`, key, { outcome });
}
