import { supabaseAdmin } from "@/lib/supabase";
import { validateUuid } from "@/lib/domains/signals/events/domain";
import { validateRevision, type ReasoningEntry, type CorrectionImpact } from "./domain";
export type ReasoningState = { available: boolean; entries: ReasoningEntry[]; impacts: CorrectionImpact[]; nextRevision: number | null; currentRevision: number };
type Page = ReasoningState & { nextImpactRevision: number | null };
export async function loadReasoning(userId: string, eventId: string, afterRevision = 0, limit = 50): Promise<ReasoningState> {
  validateUuid(userId); validateUuid(eventId); validateRevision(afterRevision);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("分页数量无效");
  const page = async (impactAfter: number): Promise<Page | null> => {
    const { data, error } = await supabaseAdmin.rpc("list_event_reasoning", { p_user_id: userId, p_event_id: eventId, p_after_revision: afterRevision, p_after_impact_revision: impactAfter, p_limit: limit });
    if (error) {
      if ((error.code === "PGRST202" || /does not exist|schema cache|Could not find/.test(error.message)) && /list_event_reasoning/.test(error.message)) return null;
      throw new Error(error.message);
    }
    if (!data || !Array.isArray(data.entries) || !Array.isArray(data.impacts)) throw new Error("推理记录加载结果无效"); return data as Page;
  };
  const first = await page(0); if (!first) return { available: false, entries: [], impacts: [], currentRevision: 0, nextRevision: null };
  const impacts = [...first.impacts]; let cursor = first.nextImpactRevision;
  while (cursor !== null) {
    validateRevision(cursor); const previous = cursor; const next = await page(cursor); if (!next) throw new Error("纠错影响加载中断，请重试。");
    impacts.push(...next.impacts); cursor = next.nextImpactRevision; if (cursor !== null && cursor <= previous) throw new Error("纠错影响分页版本无效");
  }
  return { available: true, entries: first.entries, impacts, currentRevision: first.currentRevision, nextRevision: first.nextRevision };
}
