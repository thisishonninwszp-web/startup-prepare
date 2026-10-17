import { supabaseAdmin } from "@/lib/supabase";
import type { BriefItem } from "./brief";
import { collectDropped, type DroppedLine } from "./filler";
import { CN_APP_SOURCE, GITHUB_SOURCE, newsSourceLabel, REPORT_SECTION_KINDS, RSS_FEEDS, rssSource, signalKindOf, type SignalKind } from "./feeds";

/**
 * 信息源体检：最近两周每个源抓进来几条、被挑进报告几条。
 * 抓进来是零的，多半是源坏了（改版、被拦）；抓了很多却一条没被挑中的，是在占候选的位置。
 * 只数次数 —— 撤不撤是他看着清单决定，不是按某个比例自动砍。
 */

export type SourceHealth = { source: string; label: string; kind: SignalKind; fetched: number; picked: number };

export const HEALTH_DAYS = 14;

/** 现在还在用的源（撤掉的不列）。 */
export function currentSources(): string[] {
  return [...RSS_FEEDS.map(rssSource), GITHUB_SOURCE, CN_APP_SOURCE];
}

/** 精选里每个源出现了几次（"也值得一看"那几条不算挑中）。报告条目里存的 source 是显示名，按显示名数。 */
export function countPicks(items: Pick<BriefItem, "source" | "extra">[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) if (!i.extra && i.source) out.set(i.source, (out.get(i.source) ?? 0) + 1);
  return out;
}

/** 坏了的排最前，再是从没被挑中的，最后按挑中次数从多到少。 */
export function sortHealth(rows: SourceHealth[]): SourceHealth[] {
  const rank = (r: SourceHealth) => (r.fetched === 0 ? 0 : r.picked === 0 ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.picked - a.picked || b.fetched - a.fetched);
}

export async function sourceHealth(userId: string): Promise<SourceHealth[]> {
  const sinceIso = new Date(Date.now() - HEALTH_DAYS * 86_400_000).toISOString();
  const sources = currentSources();
  const [fetchedCounts, briefs] = await Promise.all([
    Promise.all(
      sources.map(async (source) => {
        const { count } = await supabaseAdmin
          .from("external_signals")
          .select("id", { count: "exact", head: true })
          .eq("source", source)
          .gte("fetched_at", sinceIso);
        return count ?? 0;
      })
    ),
    supabaseAdmin
      .from("signal_briefs")
      .select("items")
      .eq("user_id", userId)
      .in("kind", REPORT_SECTION_KINDS)
      .gte("brief_date", sinceIso.slice(0, 10)),
  ]);
  const picks = countPicks((briefs.data ?? []).flatMap((r) => (r.items as BriefItem[] | null) ?? []));
  return sortHealth(
    sources.map((source, i) => {
      const label = newsSourceLabel(source);
      return { source, label, kind: signalKindOf(source), fetched: fetchedCounts[i], picked: picks.get(label) ?? 0 };
    })
  );
}

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
