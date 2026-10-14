import { supabaseAdmin } from "@/lib/supabase";
import { tokyoToday } from "./brief";
import { loadGapRechecks } from "./gaps";
import { decideIssueBet, type IssueContent, type IssueRecordedBet } from "./issue-shared";

/**
 * 周刊上公开押过的判断，能自动对账的自动对账（规则见 decideIssueBet：只在有出处的时候替他对）。
 * 每月重查跑完后调一次。对过的就不再动（只改还在等的）。返回这次对了几条。
 */
export async function autoResolveIssueBets(userId: string): Promise<number> {
  const [issues, rechecks] = await Promise.all([
    supabaseAdmin.from("signal_issues").select("content").eq("user_id", userId),
    loadGapRechecks(userId),
  ]);
  if (issues.error || rechecks === null) return 0;
  const bets: IssueRecordedBet[] = (issues.data ?? []).flatMap((r) => (r.content as IssueContent).recorded ?? []);
  if (bets.length === 0) return 0;

  const { data: pending, error } = await supabaseAdmin
    .from("predictions")
    .select("id")
    .eq("user_id", userId)
    .eq("outcome", "pending")
    .in(
      "id",
      bets.map((b) => b.prediction_id)
    );
  if (error) throw new Error(error.message);
  const pendingIds = new Set((pending ?? []).map((p) => p.id as string));

  const today = tokyoToday();
  let resolved = 0;
  for (const bet of bets) {
    if (!pendingIds.has(bet.prediction_id)) continue;
    const decision = decideIssueBet(bet, rechecks, today);
    if (!decision) continue;
    const { error: updateError } = await supabaseAdmin
      .from("predictions")
      .update({ outcome: decision.outcome, note: decision.note, resolved_at: new Date().toISOString() })
      .eq("id", bet.prediction_id)
      .eq("user_id", userId)
      .eq("outcome", "pending");
    if (updateError) throw new Error(updateError.message);
    resolved += 1;
  }
  return resolved;
}
