import { supabaseAdmin } from "@/lib/supabase";

export type CoreDecisionExport = {
  exported_at: string;
  ideas: Array<{
    id: string;
    title: string | null;
    status: string;
    tags: string[];
    hypothesis: unknown;
    created_at: string;
    last_activity_at: string;
    validations: Array<{
      has_pain: string;
      will_pay: string;
      note: string | null;
      contacted_at: string;
    }>;
    predictions: Array<{
      text: string;
      due_at: string;
      made_at: string;
      outcome: string;
      resolved_at: string | null;
      note: string | null;
    }>;
    decisions: Array<{
      verdict: string;
      reason: string | null;
      learned: string | null;
      decided_at: string;
    }>;
  }>;
};

/** 核心决策闭环导出：想法+假设+验证+预测+决策，按想法分组。不含AI对话、顾客研究等其他模块。 */
export async function getCoreDecisionExport(userId: string): Promise<CoreDecisionExport> {
  const { data: ideas, error: ideasError } = await supabaseAdmin
    .from("ideas")
    .select("id, title, status, tags, hypothesis, created_at, last_activity_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (ideasError) throw new Error(ideasError.message);

  const ideaIds = (ideas ?? []).map((i) => i.id as string);
  if (ideaIds.length === 0) {
    return { exported_at: new Date().toISOString(), ideas: [] };
  }

  const [validationsResult, predictionsResult, decisionsResult] = await Promise.all([
    supabaseAdmin
      .from("validations")
      .select("idea_id, has_pain, will_pay, note, contacted_at")
      .in("idea_id", ideaIds),
    supabaseAdmin
      .from("predictions")
      .select("idea_id, text, due_at, made_at, outcome, resolved_at, note")
      .eq("source_type", "idea")
      .in("idea_id", ideaIds),
    supabaseAdmin
      .from("decisions")
      .select("idea_id, verdict, reason, learned, decided_at")
      .in("idea_id", ideaIds),
  ]);
  if (validationsResult.error) throw new Error(validationsResult.error.message);
  if (predictionsResult.error) throw new Error(predictionsResult.error.message);
  if (decisionsResult.error) throw new Error(decisionsResult.error.message);

  const validationsByIdea = new Map<string, typeof validationsResult.data>();
  for (const v of validationsResult.data ?? []) {
    const list = validationsByIdea.get(v.idea_id as string) ?? [];
    list.push(v);
    validationsByIdea.set(v.idea_id as string, list);
  }
  const predictionsByIdea = new Map<string, typeof predictionsResult.data>();
  for (const p of predictionsResult.data ?? []) {
    const list = predictionsByIdea.get(p.idea_id as string) ?? [];
    list.push(p);
    predictionsByIdea.set(p.idea_id as string, list);
  }
  const decisionsByIdea = new Map<string, typeof decisionsResult.data>();
  for (const d of decisionsResult.data ?? []) {
    const list = decisionsByIdea.get(d.idea_id as string) ?? [];
    list.push(d);
    decisionsByIdea.set(d.idea_id as string, list);
  }

  return {
    exported_at: new Date().toISOString(),
    ideas: (ideas ?? []).map((idea) => ({
      id: idea.id as string,
      title: idea.title as string | null,
      status: idea.status as string,
      tags: (idea.tags ?? []) as string[],
      hypothesis: idea.hypothesis,
      created_at: idea.created_at as string,
      last_activity_at: idea.last_activity_at as string,
      validations: (validationsByIdea.get(idea.id as string) ?? []).map((v) => ({
        has_pain: v!.has_pain as string,
        will_pay: v!.will_pay as string,
        note: v!.note as string | null,
        contacted_at: v!.contacted_at as string,
      })),
      predictions: (predictionsByIdea.get(idea.id as string) ?? []).map((p) => ({
        text: p!.text as string,
        due_at: p!.due_at as string,
        made_at: p!.made_at as string,
        outcome: p!.outcome as string,
        resolved_at: p!.resolved_at as string | null,
        note: p!.note as string | null,
      })),
      decisions: (decisionsByIdea.get(idea.id as string) ?? []).map((d) => ({
        verdict: d!.verdict as string,
        reason: d!.reason as string | null,
        learned: d!.learned as string | null,
        decided_at: d!.decided_at as string,
      })),
    })),
  };
}
