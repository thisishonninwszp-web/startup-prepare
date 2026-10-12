import { supabaseAdmin } from "@/lib/supabase";
import { EXTERNAL_TAG } from "@/app/(app)/ideas/types";
import type { BriefItem } from "./brief";
import { collectJapanGaps, isGapObserved, type GapSide, type JapanGap } from "./gaps-shared";

/** 往回翻多少份报告（一天一份）。 */
const BRIEF_LOOKBACK = 120;

async function loadGaps(userId: string, side: GapSide = "japan"): Promise<JapanGap[]> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, items")
    .eq("user_id", userId)
    .eq("kind", "news")
    .order("brief_date", { ascending: false })
    .limit(BRIEF_LOOKBACK);
  if (error) throw new Error(error.message);
  return collectJapanGaps(
    (data ?? []).map((r) => ({ brief_date: r.brief_date as string, items: (r.items as BriefItem[] | null) ?? [] })),
    side
  );
}

export type JapanGapRow = JapanGap & { observed: boolean };

/** 清单 + 每条是不是已经记成过观察。 */
export async function listJapanGaps(userId: string, side: GapSide = "japan"): Promise<JapanGapRow[]> {
  const gaps = await loadGaps(userId, side);
  if (gaps.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("raw_text")
    .eq("user_id", userId)
    .contains("tags", [EXTERNAL_TAG])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const texts = (data ?? []).map((o) => o.raw_text as string);
  return gaps.map((g) => ({ ...g, observed: isGapObserved(g, texts) }));
}

export async function findJapanGap(userId: string, signalId: string, side: GapSide = "japan"): Promise<JapanGap | null> {
  return (await loadGaps(userId, side)).find((g) => g.signal_id === signalId) ?? null;
}
