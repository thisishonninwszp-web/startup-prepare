import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { validateUuid } from "./domain";

export type UnderstandingChange = { id: string; at: string; title: string; before: string | null; after: string; reason: string; href: string };
export async function understandingChanges(viewerId: string, start: string, endExclusive: string): Promise<{ available: boolean; changes: UnderstandingChange[] }> {
  validateUuid(viewerId);
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(endExclusive)) || start >= endExclusive) throw new Error("回看时间范围无效。");
  type Journal = { id: string; event_id: string; subject_id: string | null; kind: string; payload: Record<string, unknown>; created_at: string; signal_events: { title: string } };
  const [notes, judgments] = await Promise.all([
    selectAll<Journal>(async (from, to) => {
      const result = await supabaseAdmin.from("signal_event_research_entries").select("id,event_id,subject_id,kind,payload,created_at,signal_events!inner(title)").eq("user_id", viewerId).in("kind", ["note", "explanation", "unknown_answer", "expectation_resolution"]).gte("created_at", start).lt("created_at", endExclusive).order("created_at").order("id").range(from, to);
      return { data: result.data as unknown as Journal[] | null, error: result.error };
    }),
    selectAll<{ id: string; judgment_id: string; judgment: string; reason: string; created_at: string; signal_judgments: { judgment: string; news_title: string; signal_id: string | null } }>(async (from, to) => {
      const result = await supabaseAdmin.from("signal_judgment_updates").select("id,judgment_id,judgment,reason,created_at,signal_judgments!inner(judgment,news_title,signal_id)").eq("user_id", viewerId).gte("created_at", start).lt("created_at", endExclusive).order("created_at").order("id").range(from, to);
      return { data: result.data as unknown as { id: string; judgment_id: string; judgment: string; reason: string; created_at: string; signal_judgments: { judgment: string; news_title: string; signal_id: string | null } }[] | null, error: result.error };
    }),
  ]);
  if (notes.error) { if (/signal_event_research_entries/.test(notes.error.message) && /does not exist|Could not find|schema cache/.test(notes.error.message)) return { available: false, changes: [] }; throw new Error(notes.error.message); }
  if (judgments.error) throw new Error(judgments.error.message);
  const parentIds = [...new Set(notes.data.flatMap((row) => row.subject_id ? [row.subject_id] : []))];
  const parents = new Map<string, string>();
  for (let at = 0; at < parentIds.length; at += 100) {
    const { data, error } = await supabaseAdmin.from("signal_event_research_entries").select("id,payload").eq("user_id", viewerId).in("id", parentIds.slice(at, at + 100));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) parents.set(row.id, String((row.payload as Record<string, unknown>).text ?? (row.payload as Record<string, unknown>).question ?? ""));
  }
  const changes: UnderstandingChange[] = notes.data.map((row) => ({ id: row.id, at: row.created_at, title: row.signal_events.title, before: row.subject_id ? parents.get(row.subject_id) ?? null : null, after: String(row.payload.text ?? ""), reason: row.kind === "unknown_answer" ? `未知清单：${row.payload.status}` : row.kind === "expectation_resolution" ? `预期核对：${row.payload.result}` : row.subject_id ? "本人追加修正" : "本人首次记录", href: `/signals/events/${row.event_id}` }));
  changes.push(...judgments.data.map((row) => ({ id: row.id, at: row.created_at, title: row.signal_judgments.news_title, before: row.signal_judgments.judgment, after: row.judgment, reason: row.reason, href: row.signal_judgments.signal_id ? `/signals/${row.signal_judgments.signal_id}` : "/signals/practice" })));
  return { available: true, changes: changes.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)) };
}
