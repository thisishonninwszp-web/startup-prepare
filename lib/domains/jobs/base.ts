import { supabaseAdmin } from "@/lib/supabase";
import { draftCareerEntry, type EntryDraft } from "@/lib/ai";
import { isCareerTopic, type CareerEntry, type CareerTopic } from "./shared";
import { isMissingJobTables, MISSING_MIGRATION } from "./profile";

/**
 * 底稿：一段经历一条。他用自己的话写（raw_text），AI 整理成日文（draft_ja，数字和英文词由代码核对），
 * 他改完点确认才算数。宪法：自述不进推理 —— 这里不读 /self 的任何表。
 */

const ENTRY_COLUMNS = "id, topic, org, period, raw_text, draft_ja, confirmed_at, created_at";

function toEntry(r: Record<string, unknown>): CareerEntry {
  return {
    id: r.id as string,
    topic: isCareerTopic(r.topic) ? r.topic : "work",
    org: (r.org as string | null) ?? "",
    period: (r.period as string | null) ?? "",
    raw_text: r.raw_text as string,
    draft_ja: (r.draft_ja as string | null) ?? null,
    confirmed_at: (r.confirmed_at as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

export async function listCareerEntries(userId: string): Promise<CareerEntry[] | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("career_entries")
    .select(ENTRY_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingJobTables(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => toEntry(r as Record<string, unknown>));
}

/** 对照和改简历只用确认过的。 */
export async function listConfirmedEntries(userId: string): Promise<CareerEntry[]> {
  const entries = await listCareerEntries(userId);
  if (entries === "missing-schema") throw new Error(MISSING_MIGRATION);
  return entries.filter((e) => e.confirmed_at !== null);
}

/** 写下（或改写）一条：存他的原话，请 AI 整理成日文；存下的这条回到"没确认"。 */
export async function draftEntry(
  userId: string,
  input: { id: string | null; topic: CareerTopic; question: string; org: string; period: string; raw: string }
): Promise<{ id: string } & EntryDraft> {
  const raw = input.raw.trim();
  if (raw.length < 10) throw new Error("多写几句：做了什么、结果怎样。");
  const org = input.org.trim().slice(0, 100);
  const period = input.period.trim().slice(0, 60);
  const draft = await draftCareerEntry(userId, { topic: input.topic, question: input.question, org, period, raw });
  const row = {
    topic: input.topic,
    org,
    period,
    raw_text: raw,
    draft_ja: draft.draft_ja,
    confirmed_at: null,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabaseAdmin.from("career_entries").update(row).eq("id", input.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { id: input.id, ...draft };
  }
  const { data, error } = await supabaseAdmin
    .from("career_entries")
    .insert({ user_id: userId, ...row })
    .select("id")
    .single();
  if (error) throw new Error(isMissingJobTables(error.message) ? MISSING_MIGRATION : error.message);
  return { id: data.id as string, ...draft };
}

/** 确认：他改过的日文稿原样存（他自己写的不核对）。 */
export async function confirmEntry(userId: string, input: { id: string; org: string; period: string; draftJa: string }): Promise<void> {
  const draftJa = input.draftJa.trim();
  if (!draftJa) throw new Error("日文稿是空的，写一句再确认。");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("career_entries")
    .update({
      org: input.org.trim().slice(0, 100),
      period: input.period.trim().slice(0, 60),
      draft_ja: draftJa,
      confirmed_at: now,
      updated_at: now,
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteEntry(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("career_entries").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
