import { supabaseAdmin } from "@/lib/supabase";
import { CN_APP_SOURCE } from "./feeds";

/**
 * 中国 App Store 免费榜：新上榜的 App 往往比新闻更早说明"中国人开始用什么了"。
 * 每天取前 50，以前没在榜上见过的记成一条，当中文媒体的候选进"今天的世界"，
 * 被挑中的话照样会问"日本这边有没有"。用的是苹果旧版的公开 RSS（带简介和分类，新版没有简介）。
 */

const CHART_URL = "https://itunes.apple.com/cn/rss/topfreeapplications/limit=50/json";

export type ChartApp = { id: string; name: string; category: string; summary: string; url: string; rank: number };

type Label = { label?: string; attributes?: Record<string, string> };
type Entry = {
  "im:name"?: Label;
  summary?: Label;
  category?: Label;
  id?: Label;
  link?: Label | Label[];
};

export function parseChart(json: unknown): ChartApp[] {
  const entries = ((json as { feed?: { entry?: Entry[] } } | null)?.feed?.entry ?? []) as Entry[];
  return entries
    .map((e, i) => {
      const links = Array.isArray(e.link) ? e.link : e.link ? [e.link] : [];
      return {
        id: e.id?.attributes?.["im:id"] ?? "",
        name: e["im:name"]?.label?.trim() ?? "",
        category: e.category?.attributes?.label ?? "",
        summary: (e.summary?.label ?? "").replace(/\s+/g, " ").trim(),
        url: links.find((l) => l.attributes?.rel === "alternate")?.attributes?.href ?? links[0]?.attributes?.href ?? "",
        rank: i + 1,
      };
    })
    .filter((a) => a.id && a.name);
}

/** 取榜单，把没见过的 App 记进 external_signals。返回新记了几条。失败返回 0，不影响别的抓取。 */
export async function fetchCnAppChart(): Promise<number> {
  try {
    const res = await fetch(CHART_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ideaos/1.0)" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const apps = parseChart(await res.json());
    if (apps.length === 0) return 0;
    // 第一次抓：榜上这 50 个都是老面孔，只记成"见过"（dismissed，不当候选）；之后进来的才是真的新上榜
    const { count, error: countError } = await supabaseAdmin
      .from("external_signals")
      .select("id", { count: "exact", head: true })
      .eq("source", CN_APP_SOURCE);
    if (countError) throw new Error(countError.message);
    const seeding = (count ?? 0) === 0;
    const rows = apps.map((a) => ({
      source: CN_APP_SOURCE,
      source_id: a.id,
      url: a.url || null,
      title: `中国 App Store 免费榜新上榜（第 ${a.rank} 名）：${a.name}（${a.category}）`,
      raw_text: a.summary.slice(0, 600),
      published_at: new Date().toISOString(),
      ...(seeding ? { status: "dismissed" } : {}),
    }));
    // 同一个 App 已经在表里（见过）就跳过，只有新上榜的才进来；这一类不参与两周清理，见过的一直记着
    const { data, error } = await supabaseAdmin
      .from("external_signals")
      .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  } catch (e) {
    console.error("cn app chart failed", e);
    return 0;
  }
}
