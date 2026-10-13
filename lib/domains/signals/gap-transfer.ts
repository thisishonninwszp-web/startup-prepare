import { supabaseAdmin } from "@/lib/supabase";
import { judgeTransferConditions, planTransferConditions } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { findJapanGap } from "./gaps";
import { gapPlaces, transferKey, type GapSide, type GapTransfer } from "./gaps-shared";

/**
 * 差距清单里的一条，能不能搬过来：它在那边做成靠哪几个条件，每个条件这边现在怎样（上网查、原文核对），
 * 有没有人试过把它带过来。点了才查（每条要搜四五次）。不打分、不下"值得做"的结论。
 */

const RESULTS_PER_CONDITION = 3;
const PRECEDENT_RESULTS = 4;

const MISSING_MIGRATION = "迁移 067 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/067_signal_gap_transfers.sql。";

export async function analyzeGapTransfer(userId: string, signalId: string, side: GapSide): Promise<GapTransfer> {
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const { there, here } = gapPlaces(side);
  const plan = await planTransferConditions({ headline: gap.headline, background: gap.background, hereNow: gap.japan, there, here });
  const [conditionSources, precedentSources] = await Promise.all([
    Promise.all(plan.conditions.map((c) => webSearch(c.query, RESULTS_PER_CONDITION).catch(() => []))),
    plan.precedentQuery ? webSearch(plan.precedentQuery, PRECEDENT_RESULTS).catch(() => []) : Promise.resolve([]),
  ]);
  const judged = await judgeTransferConditions(
    plan.conditions.map((condition, i) => ({ condition, sources: conditionSources[i] })),
    precedentSources,
    here
  );
  const analysis: GapTransfer = { ...judged, created_at: new Date().toISOString() };
  const { error } = await supabaseAdmin
    .from("signal_gap_transfers")
    .upsert({ user_id: userId, signal_id: signalId, side, analysis }, { onConflict: "user_id,signal_id,side" });
  if (error) {
    if (/signal_gap_transfers/.test(error.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return analysis;
}

/** 查过的那几条（键见 transferKey）。表还没建时返回空。 */
export async function loadGapTransfers(userId: string): Promise<Map<string, GapTransfer>> {
  const { data, error } = await supabaseAdmin.from("signal_gap_transfers").select("signal_id, side, analysis").eq("user_id", userId);
  if (error) {
    if (/signal_gap_transfers/.test(error.message)) return new Map();
    throw new Error(error.message);
  }
  return new Map((data ?? []).map((r) => [transferKey(r.side as GapSide, r.signal_id as string), r.analysis as GapTransfer]));
}
