import { supabaseAdmin } from "@/lib/supabase";
import { cleanSnippet } from "./memory-shared";

/**
 * 领先指标（迁移 096）：存档里「说要进日本」的新闻 —— 中国、美国公司宣布进日本、在日本设法人、在日本上线。
 * 按字找（日文、中文、英文几种说法），不调 AI。和 App 来日本的迹象一起放在「领先指标」页。
 */

const ENTRY_WORDS = [
  "日本進出",
  "日本上陸",
  "日本市場に参入",
  "日本市場へ参入",
  "日本法人",
  "日本でサービス開始",
  "日本で提供開始",
  "进军日本",
  "进入日本",
  "登陆日本",
  "出海日本",
  "日本市场",
  "launches in Japan",
  "launch in Japan",
  "expands to Japan",
  "enters Japan",
  "Japanese market",
];

export type EntryNews = { id: string; title: string; source: string; url: string | null; fetched_at: string };

/** 最近几天存档里说要进日本的（标题里有这些说法的），新的在前。 */
export async function japanEntryNews(days = 30, limit = 40): Promise<EntryNews[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, title, source, url, fetched_at")
    .gte("fetched_at", since)
    .or(ENTRY_WORDS.map((w) => `title.ilike.%${w.replace(/[,()%_]/g, "")}%`).join(","))
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  return ((data ?? []) as EntryNews[])
    .map((r) => ({ ...r, title: cleanSnippet(r.title) }))
    .filter((r) => {
      const key = r.title.slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
