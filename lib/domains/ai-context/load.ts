import { supabaseAdmin } from "@/lib/supabase";
import type { ContextData, ContextDecision, ContextExit, ContextIdea, ContextPrediction, ContextValidation } from "./render";

/**
 * 从数据库读出给外面的 AI 看的那几类记录。导出脚本和 MCP 服务都在本机跑，用 .env.local 里的 service role key。
 * 某张表还没建（迁移没跑）就当它是空的，不让整个导出失败。
 */

/** 系统内部用的标签（"__ideaos_self_archive__" 这种）不给外面看。 */
function visibleTags(tags: unknown): string[] {
  return ((tags as string[] | null) ?? []).filter((t) => !t.startsWith("__"));
}

/** 用哪个账号：IDEAOS_USER_EMAIL 指定；没指定就挑记录最多的那个。 */
export async function resolveContextUser(email = process.env.IDEAOS_USER_EMAIL): Promise<{ id: string; email: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  const users = data.users.filter((u) => u.email);
  if (email) {
    const u = users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error(`找不到账号 ${email}`);
    return { id: u.id, email: u.email! };
  }
  const counts = await Promise.all(
    users.map(async (u) => {
      const [o, i] = await Promise.all([
        supabaseAdmin.from("observations").select("id", { count: "exact", head: true }).eq("user_id", u.id),
        supabaseAdmin.from("ideas").select("id", { count: "exact", head: true }).eq("user_id", u.id),
      ]);
      return (o.count ?? 0) + (i.count ?? 0);
    })
  );
  const best = users.map((u, i) => ({ u, n: counts[i] })).sort((a, b) => b.n - a.n)[0];
  if (!best) throw new Error("一个账号都没有");
  return { id: best.u.id, email: best.u.email! };
}

export async function loadContext(userId: string): Promise<ContextData> {
  const [ideas, observations, materials, judgments, questions] = await Promise.all([
    supabaseAdmin
      .from("ideas")
      .select("id, title, status, tags, hypothesis, created_at, last_activity_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("observations").select("id, raw_text, tags, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    supabaseAdmin
      .from("reality_materials")
      .select("id, title, source_type, sanitized_text, created_at")
      .eq("user_id", userId)
      .not("status", "in", "(deleted,rejected,failed)")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("signal_judgments")
      .select("id, news_title, question, judgment, created_at, tags, miss_reason, predictions(due_at, outcome)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("signal_questions")
      .select("id, question, created_at, signal_question_views(view, reason, created_at)")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (ideas.error) throw new Error(ideas.error.message);

  const ideaRows = ideas.data ?? [];
  const ids = ideaRows.map((i) => i.id as string);
  const [validations, predictions, decisions, exits] = ids.length
    ? await Promise.all([
        supabaseAdmin.from("validations").select("idea_id, has_pain, will_pay, note, contacted_at").in("idea_id", ids).order("contacted_at"),
        supabaseAdmin.from("predictions").select("idea_id, text, due_at, outcome, note").in("idea_id", ids).order("made_at"),
        supabaseAdmin.from("decisions").select("idea_id, verdict, reason, learned, decided_at").in("idea_id", ids).order("decided_at"),
        supabaseAdmin.from("idea_exit_criteria").select("idea_id, criterion, triggered").in("idea_id", ids).order("created_at"),
      ])
    : [null, null, null, null];
  const of = <T,>(rows: unknown, id: string): T[] => ((rows as (T & { idea_id: string })[] | null) ?? []).filter((r) => r.idea_id === id);

  return {
    exported_at: new Date().toISOString(),
    ideas: ideaRows.map(
      (i): ContextIdea => ({
        id: i.id as string,
        title: i.title as string | null,
        status: i.status as string,
        tags: visibleTags(i.tags),
        hypothesis: (i.hypothesis as Record<string, unknown>) ?? {},
        created_at: i.created_at as string,
        last_activity_at: i.last_activity_at as string,
        validations: of<ContextValidation>(validations?.data, i.id as string),
        predictions: of<ContextPrediction>(predictions?.data, i.id as string),
        decisions: of<ContextDecision>(decisions?.data, i.id as string),
        exits: of<ContextExit>(exits?.data, i.id as string),
      })
    ),
    observations: (observations.error ? [] : observations.data ?? []).map((o) => ({
      id: o.id as string,
      raw_text: o.raw_text as string,
      tags: visibleTags(o.tags),
      created_at: o.created_at as string,
    })),
    materials: (materials.error ? [] : materials.data ?? []).map((m) => ({
      id: m.id as string,
      title: m.title as string | null,
      source_type: m.source_type as string,
      text: (m.sanitized_text as string | null) ?? "",
      created_at: m.created_at as string,
    })),
    judgments: (judgments.error ? [] : judgments.data ?? []).map((j) => {
      const p = (Array.isArray(j.predictions) ? j.predictions[0] : j.predictions) as { due_at: string; outcome: string } | null;
      return {
        id: j.id as string,
        news_title: (j.news_title as string) ?? "",
        question: (j.question as string) ?? "",
        judgment: (j.judgment as string) ?? "",
        created_at: j.created_at as string,
        due_at: p?.due_at ?? null,
        outcome: p?.outcome ?? null,
        miss_reason: (j.miss_reason as string | null) ?? null,
        tags: visibleTags(j.tags),
      };
    }),
    questions: (questions.error ? [] : questions.data ?? []).map((q) => ({
      id: q.id as string,
      question: q.question as string,
      created_at: q.created_at as string,
      views: ((q.signal_question_views as { view: string; reason: string | null; created_at: string }[] | null) ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      ),
    })),
  };
}
