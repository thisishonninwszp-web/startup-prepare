import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { planInfoGaps } from "@/lib/ai";
import { HYPOTHESIS_FIELDS, type Hypothesis, type IdeaStatus } from "@/app/(app)/ideas/types";
import { touchIdea } from "./touch";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { FOUNDER_FACTS_MAX, hasLegacyActivityEvidence, type GapEvidence, type GapStatus, type IdeaFit, type InfoGap, type OpenGapOption } from "./info-gaps-shared";

export * from "./info-gaps-shared";

/**
 * 想法的信息缺口（迁移 088）：从最关键假设和退出条件出发，列出"继续还是 Kill"还缺哪几样信息；
 * 每样能标"拿到了 / 拿不到"，外部信号的某一条可以"补进"某个缺口。
 * 约束和优势只用他自己写的事实，AI 只能照抄（经用户同意，2026-10-20）。
 */

const MISSING_MIGRATION = "迁移 088 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/088_idea_info_gaps.sql。";

function missing(error: { message: string }): boolean {
  return /founder_facts|idea_info_gaps|idea_fits/.test(error.message);
}

const GAP_COLUMNS = "id, idea_id, question, matters, disconfirm, routes, due_on, status, evidence, note, created_at";

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export async function getFounderFacts(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("founder_facts").select("text").eq("user_id", userId).maybeSingle();
  if (error) {
    if (missing(error)) return "";
    throw new Error(error.message);
  }
  return (data?.text as string | undefined) ?? "";
}

export async function saveFounderFacts(userId: string, text: string): Promise<void> {
  const clean = text.trim().slice(0, FOUNDER_FACTS_MAX);
  const { error } = await supabaseAdmin
    .from("founder_facts")
    .upsert({ user_id: userId, text: clean, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    if (missing(error)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
}

/** 这个想法的缺口和"是不是你的机会"。表还没建返回 "missing-schema"。 */
export async function loadIdeaGaps(userId: string, ideaId: string): Promise<{ gaps: InfoGap[]; fit: IdeaFit | null } | "missing-schema"> {
  const [gaps, fit] = await Promise.all([
    supabaseAdmin.from("idea_info_gaps").select(GAP_COLUMNS).eq("user_id", userId).eq("idea_id", ideaId).order("created_at"),
    supabaseAdmin.from("idea_fits").select("analysis").eq("user_id", userId).eq("idea_id", ideaId).maybeSingle(),
  ]);
  const error = gaps.error ?? fit.error;
  if (error) {
    if (missing(error)) return "missing-schema";
    throw new Error(error.message);
  }
  return { gaps: (gaps.data ?? []) as InfoGap[], fit: (fit.data?.analysis as IdeaFit | undefined) ?? null };
}

async function ownIdea(userId: string, ideaId: string) {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, hypothesis, status, last_activity_at")
    .eq("id", ideaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("找不到这个想法");
  return data as { id: string; user_id: string; title: string | null; hypothesis: Hypothesis | null; status: IdeaStatus; last_activity_at: string };
}

/**
 * 列（或重列）缺口：已经拿到了、标了拿不到、或者补进过信息的留着；还缺、什么都没补进来的换成新的。
 * "是不是你的机会"每次一起重写。
 */
export async function generateIdeaGaps(userId: string, ideaId: string): Promise<{ gaps: InfoGap[]; fit: IdeaFit | null }> {
  const idea = await ownIdea(userId, ideaId);
  // 列缺口不受强制出口机制的锁：它列出来的是"去哪拿现实的数据"，是把人推出椅子的工具（经用户同意，2026-10-20）
  const [exits, validations, facts, existing] = await Promise.all([
    supabaseAdmin.from("idea_exit_criteria").select("criterion").eq("idea_id", ideaId).eq("user_id", userId),
    supabaseAdmin.from("validations").select("id", { count: "exact", head: true }).eq("idea_id", ideaId),
    getFounderFacts(userId),
    loadIdeaGaps(userId, ideaId),
  ]);
  if (existing === "missing-schema") throw new Error(MISSING_MIGRATION);
  const h = (idea.hypothesis ?? {}) as Hypothesis;
  const extra: { key: keyof Hypothesis; label: string }[] = [
    { key: "riskiest_assumption", label: "最关键假设" },
    { key: "unfair_advantage", label: "你凭什么" },
    { key: "distribution", label: "前 10 个用户怎么找到它" },
    { key: "smallest_test", label: "最小实验" },
  ];
  const hypothesis = [...HYPOTHESIS_FIELDS.map((f) => ({ key: f.key as keyof Hypothesis, label: f.label })), ...extra]
    .map((f) => ({ label: f.label, text: (h[f.key] ?? "").trim() }))
    .filter((f) => f.text);

  const draft = await planInfoGaps({
    title: idea.title ?? "（没有标题）",
    hypothesis,
    exitCriteria: (exits.data ?? []).map((e) => e.criterion as string),
    validations: validations.count ?? 0,
    founderFacts: facts,
  });

  const today = tokyoToday();
  const stale = existing.gaps.filter((g) => g.status === "open" && g.evidence.length === 0).map((g) => g.id);
  if (stale.length > 0) {
    // Delete each candidate separately: RESTRICT preserves experiment/observation references,
    // including a reference saved concurrently after the initial gap read.
    for (const id of stale) {
      const { error } = await supabaseAdmin.from("idea_info_gaps").delete().eq("id", id).eq("user_id", userId);
      if (error && error.code !== "23503") throw new Error(error.message);
    }
  }
  const { error: insertError } = await supabaseAdmin.from("idea_info_gaps").insert(
    draft.gaps.map((g) => ({
      idea_id: ideaId,
      user_id: userId,
      question: g.question,
      matters: g.matters,
      disconfirm: g.disconfirm,
      routes: g.routes,
      due_on: addDays(today, g.days),
    }))
  );
  if (insertError) throw new Error(insertError.message);
  if (draft.fit) {
    const { error } = await supabaseAdmin
      .from("idea_fits")
      .upsert({ idea_id: ideaId, user_id: userId, analysis: { ...draft.fit, created_at: new Date().toISOString() } }, { onConflict: "idea_id" });
    if (error) throw new Error(error.message);
  }
  const fresh = await loadIdeaGaps(userId, ideaId);
  if (fresh === "missing-schema") throw new Error(MISSING_MIGRATION);
  return fresh;
}

/**
 * 标"拿到了 / 拿不到 / 还缺"，可以带一句（拿到了什么、为什么拿不到）。
 * 标了拿到了、而且补进过至少一条信息的，算间接碰到了现实：刷新想法的"最近活动"，AI 质疑跟着恢复。
 */
export async function setGapStatus(userId: string, gapId: string, status: GapStatus, note: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("idea_info_gaps")
    .update({ status, note: note.trim().slice(0, 300) || null, updated_at: new Date().toISOString() })
    .eq("id", gapId)
    .eq("user_id", userId)
    .select("idea_id, evidence")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (status === "got" && data && hasLegacyActivityEvidence((data.evidence as GapEvidence[] | null) ?? [])) {
    await touchIdea(userId, data.idea_id as string);
  }
}

/** 补进一条信息（从外部信号的某一条，或者他自己记的）。只追加。 */
export async function addGapEvidence(userId: string, gapId: string, item: Omit<GapEvidence, "at">, requestId = randomUUID()): Promise<void> {
  if (item.experiment_id || item.experiment_run_id || item.observation_run_id) throw new Error("来源引用须通过专用保存入口");
  async function legacyAppend() {
    const { data, error } = await supabaseAdmin.from("idea_info_gaps").select("evidence").eq("id", gapId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("找不到这个缺口");
    const { error: updateError } = await supabaseAdmin.from("idea_info_gaps").update({ evidence: [...((data.evidence as GapEvidence[] | null) ?? []), { ...item, at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", gapId).eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
  }
  if (process.env.IDEA_EXPERIMENTS_ENABLED !== "true") return legacyAppend();
  const { error } = await supabaseAdmin.rpc("append_idea_gap_evidence", { p_user_id: userId, p_gap_id: gapId, p_item: item, p_request_id: requestId });
  // Before migration 109, keep the existing plain-note path available. Derived references
  // always use their dedicated RPC; other database failures never fall back.
  if (error?.code === "PGRST202" && /append_idea_gap_evidence/.test(error.message)) return legacyAppend();
  if (error) throw new Error(error.message);
}
/** 外部信号"补进想法的缺口"要选的：没归档的想法里还缺的那几个缺口。表还没建返回空。 */
export async function listOpenGapOptions(userId: string): Promise<OpenGapOption[]> {
  const { data, error } = await supabaseAdmin
    .from("idea_info_gaps")
    .select("id, idea_id, question, ideas!inner(title, status)")
    .eq("user_id", userId)
    .eq("status", "open")
    .neq("ideas.status", "归档")
    .order("created_at");
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  const byIdea = new Map<string, OpenGapOption>();
  for (const r of (data ?? []) as unknown as { id: string; idea_id: string; question: string; ideas: { title: string | null } | { title: string | null }[] }[]) {
    const idea = Array.isArray(r.ideas) ? r.ideas[0] : r.ideas;
    const o = byIdea.get(r.idea_id) ?? { idea_id: r.idea_id, idea_title: idea?.title ?? "（没有标题）", gaps: [] };
    o.gaps.push({ id: r.id, question: r.question });
    byIdea.set(r.idea_id, o);
  }
  return Array.from(byIdea.values());
}

/** 本周行动要用的：没归档的想法里还缺的缺口（截止早的在前）。表还没建返回空。 */
export async function listOpenGapsForAct(userId: string): Promise<{ id: string; idea_id: string; idea_title: string; question: string; due_on: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("idea_info_gaps")
    .select("id, idea_id, question, due_on, ideas!inner(title, status)")
    .eq("user_id", userId)
    .eq("status", "open")
    .neq("ideas.status", "归档")
    .order("due_on");
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown as { id: string; idea_id: string; question: string; due_on: string; ideas: { title: string | null } | { title: string | null }[] }[]).map(
    (r) => {
      const idea = Array.isArray(r.ideas) ? r.ideas[0] : r.ideas;
      return { id: r.id, idea_id: r.idea_id, idea_title: idea?.title ?? "（没有标题）", question: r.question, due_on: r.due_on };
    }
  );
}

/** 信息源体检要用的：补进过缺口的外部信号（signal_id 去重）。表还没建返回空。 */
export async function routedSignalIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("idea_info_gaps").select("evidence").eq("user_id", userId);
  if (error) {
    if (missing(error)) return new Set();
    throw new Error(error.message);
  }
  return new Set(
    (data ?? []).flatMap((r) => ((r.evidence as GapEvidence[] | null) ?? []).flatMap((e) => (e.signal_id ? [e.signal_id] : [])))
  );
}
