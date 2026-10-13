import { supabaseAdmin } from "@/lib/supabase";
import { EXTERNAL_TAG } from "@/app/(app)/ideas/types";
import type { AnalogCheck } from "@/lib/ai";
import type { BriefItem } from "./brief";
import {
  applyRechecks,
  collectJapanGaps,
  dueForRecheck,
  isGapObserved,
  type ArrivedGap,
  type GapRecheck,
  type GapSide,
  type JapanGap,
  type OpenGap,
} from "./gaps-shared";

/** 往回翻多少份（报告的"今天的世界"和每天专门扫的那一份，一天最多两份）。 */
const BRIEF_LOOKBACK = 240;

/** 差距从哪几种报告里挑：报告的"今天的世界"，和每天专门扫的那一份（见 gap-scan.ts）。 */
const GAP_KINDS = ["news", "gaps"];

export const GAP_SIDES: GapSide[] = ["japan", "us", "china"];

/** 从新到旧。同一天两份的先后不要紧：同一条只会在其中一份里问过。 */
export async function loadGapBriefs(userId: string): Promise<{ brief_date: string; items: BriefItem[] }[]> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, items")
    .eq("user_id", userId)
    .in("kind", GAP_KINDS)
    .order("brief_date", { ascending: false })
    .limit(BRIEF_LOOKBACK);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ brief_date: r.brief_date as string, items: (r.items as BriefItem[] | null) ?? [] }));
}

/** 重查记录。表还没建（迁移 063 没跑）时返回 null。 */
export async function loadGapRechecks(userId: string): Promise<GapRecheck[] | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_gap_rechecks")
    .select("signal_id, side, checked_on, verdict, japan, source_check, funded")
    .eq("user_id", userId)
    .order("checked_on", { ascending: false })
    .limit(2000);
  if (error) {
    if (/signal_gap_rechecks/.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    signal_id: r.signal_id as string,
    side: r.side as GapSide,
    checked_on: r.checked_on as string,
    verdict: r.verdict as GapRecheck["verdict"],
    japan: r.japan as string,
    source_check: (r.source_check as AnalogCheck | null) ?? null,
    funded: (r.funded as GapRecheck["funded"]) ?? null,
  }));
}

/** 每个方向上还开着的差距（贴好重查结果），带上方向。 */
export async function openGapsWithSide(userId: string, rechecks: GapRecheck[]): Promise<(OpenGap & { side: GapSide })[]> {
  const briefs = await loadGapBriefs(userId);
  return GAP_SIDES.flatMap((side) =>
    applyRechecks(collectJapanGaps(briefs, side), rechecks, side).open.map((g) => ({ ...g, side }))
  );
}

export type JapanGapRow = OpenGap & { observed: boolean };

export type GapBoard = {
  sides: Record<GapSide, { open: JapanGapRow[]; arrived: ArrivedGap[] }>;
  /** 迁移 063 跑过没有（重查表在不在）。没跑时不扫、不重查。 */
  ready: boolean;
  /** 满一个月该重查的有几条。 */
  dueCount: number;
  /** 今天已经重查过一批了（一天一批）。 */
  recheckedToday: boolean;
};

/** 三个方向的清单 + 每条是不是已经记成过观察 + 重查过的挪出来单列。 */
export async function listGapBoard(userId: string, today: string): Promise<GapBoard> {
  const [briefs, rechecks, observations] = await Promise.all([
    loadGapBriefs(userId),
    loadGapRechecks(userId),
    supabaseAdmin
      .from("observations")
      .select("raw_text")
      .eq("user_id", userId)
      .contains("tags", [EXTERNAL_TAG])
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (observations.error) throw new Error(observations.error.message);
  const texts = (observations.data ?? []).map((o) => o.raw_text as string);

  const sides = {} as GapBoard["sides"];
  const allOpen: (OpenGap & { side: GapSide })[] = [];
  for (const side of GAP_SIDES) {
    const { open, arrived } = applyRechecks(collectJapanGaps(briefs, side), rechecks ?? [], side);
    sides[side] = { open: open.map((g) => ({ ...g, observed: isGapObserved(g, texts) })), arrived };
    allOpen.push(...open.map((g) => ({ ...g, side })));
  }
  return {
    sides,
    ready: rechecks !== null,
    dueCount: dueForRecheck(allOpen, today, Number.MAX_SAFE_INTEGER).length,
    recheckedToday: (rechecks ?? []).some((r) => r.checked_on === today),
  };
}

export async function findJapanGap(userId: string, signalId: string, side: GapSide = "japan"): Promise<JapanGap | null> {
  return collectJapanGaps(await loadGapBriefs(userId), side).find((g) => g.signal_id === signalId) ?? null;
}
