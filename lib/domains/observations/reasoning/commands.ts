import { supabaseAdmin } from "@/lib/supabase";
import { validateUuid } from "@/lib/domains/signals/events/domain";
import { normalizeReasoning, validateRevision, type ReasoningEntry, type ReasoningInput } from "./domain";
export async function saveReasoning(userId: string, eventId: string, input: ReasoningInput): Promise<ReasoningEntry> {
  validateUuid(userId); validateUuid(eventId); validateUuid(input.requestId); validateRevision(input.expectedRevision);
  const payload = normalizeReasoning(input.kind, input.payload);
  const { data, error } = await supabaseAdmin.rpc("append_event_reasoning", { p_user_id: userId, p_event_id: eventId, p_kind: input.kind, p_payload: payload, p_request_id: input.requestId, p_expected_revision: input.expectedRevision });
  if (error) throw new Error(error.message); if (!data?.id) throw new Error("推理记录尚未保存，请重试。"); return data as ReasoningEntry;
}
