import { supabaseAdmin } from "@/lib/supabase";
import { listBayesianBeliefs, getMarkedFramePatterns, listReframingSessions } from "@/app/reasoning/queries";

export type PatternsInput = {
  ideas: {
    total: number;
    by_status: Record<string, number>;
    avg_days_in_validation: number | null;
    armchair_kills: number;
  };
  validations: {
    total: number;
    has_pain_yes: number;
    has_pain_no: number;
    has_pain_unsure: number;
    will_pay_yes: number;
    will_pay_no: number;
    will_pay_unsure: number;
  };
  decisions: {
    total: number;
    by_verdict: Record<string, number>;
    kill_learned_sample: string[];
  };
  predictions: {
    total: number;
    hit: number;
    miss: number;
    pending: number;
  };
  beliefs: {
    total: number;
    avg_prior: number | null;
    avg_current_posterior: number | null;
    low_confidence_count: number;
  };
  reframing: {
    top_marked_frames: Array<{ frame_type: string; count: number }>;
    sessions_total: number;
  };
};

export type PatternsSnapshot = PatternsInput & {
  has_enough_data: boolean;
};

export async function getPatternsSnapshot(userId: string): Promise<PatternsSnapshot> {
  const [
    ideasResult,
    validationsResult,
    decisionsResult,
    predictionsResult,
    beliefs,
    reframingSessions,
  ] = await Promise.all([
    supabaseAdmin
      .from("ideas")
      .select("id, status, created_at, last_activity_at")
      .eq("user_id", userId),
    supabaseAdmin
      .from("validations")
      .select("idea_id, has_pain, will_pay")
      .in(
        "idea_id",
        (await supabaseAdmin.from("ideas").select("id").eq("user_id", userId)).data?.map((r) => r.id) ?? []
      ),
    supabaseAdmin
      .from("decisions")
      .select("verdict, learned, idea_id")
      .in(
        "idea_id",
        (await supabaseAdmin.from("ideas").select("id").eq("user_id", userId)).data?.map((r) => r.id) ?? []
      ),
    supabaseAdmin
      .from("predictions")
      .select("outcome")
      .in(
        "idea_id",
        (await supabaseAdmin.from("ideas").select("id").eq("user_id", userId)).data?.map((r) => r.id) ?? []
      ),
    listBayesianBeliefs(userId),
    listReframingSessions(userId),
  ]);

  if (ideasResult.error) throw new Error(ideasResult.error.message);

  const ideas = ideasResult.data ?? [];
  const validations = validationsResult.data ?? [];
  const decisions = decisionsResult.data ?? [];
  const predictions = predictionsResult.data ?? [];

  // Ideas stats
  const by_status: Record<string, number> = {};
  for (const idea of ideas) {
    by_status[idea.status] = (by_status[idea.status] ?? 0) + 1;
  }

  // avg days in validation: ideas currently in "validating" status
  const validatingIdeas = ideas.filter((i) => i.status === "validating");
  let avg_days_in_validation: number | null = null;
  if (validatingIdeas.length > 0) {
    const now = Date.now();
    const totalDays = validatingIdeas.reduce((sum, idea) => {
      const created = new Date(idea.created_at).getTime();
      return sum + (now - created) / (1000 * 60 * 60 * 24);
    }, 0);
    avg_days_in_validation = Math.round(totalDays / validatingIdeas.length);
  }

  // armchair kills: killed ideas that have no validation records
  const killedIdeaIds = decisions
    .filter((d) => d.verdict === "Kill")
    .map((d) => d.idea_id as string);
  const validatedIdeaIdSet = new Set(validations.map((v) => v.idea_id as string));
  let armchair_kills = 0;
  for (const id of killedIdeaIds) {
    if (!validatedIdeaIdSet.has(id)) armchair_kills++;
  }

  // Validations stats
  let has_pain_yes = 0, has_pain_no = 0, has_pain_unsure = 0;
  let will_pay_yes = 0, will_pay_no = 0, will_pay_unsure = 0;
  for (const v of validations) {
    if (v.has_pain === "yes") has_pain_yes++;
    else if (v.has_pain === "no") has_pain_no++;
    else has_pain_unsure++;
    if (v.will_pay === "yes") will_pay_yes++;
    else if (v.will_pay === "no") will_pay_no++;
    else will_pay_unsure++;
  }

  // Decisions stats
  const by_verdict: Record<string, number> = {};
  const kill_learned_sample: string[] = [];
  for (const d of decisions) {
    by_verdict[d.verdict] = (by_verdict[d.verdict] ?? 0) + 1;
    if (d.verdict === "Kill" && d.learned && kill_learned_sample.length < 5) {
      kill_learned_sample.push(d.learned as string);
    }
  }

  // Predictions stats
  let hit = 0, miss = 0, pending = 0;
  for (const p of predictions) {
    if (p.outcome === "hit") hit++;
    else if (p.outcome === "miss") miss++;
    else pending++;
  }

  // Beliefs stats
  const beliefTotal = beliefs.length;
  const avg_prior = beliefTotal > 0
    ? Math.round((beliefs.reduce((s, b) => s + b.prior, 0) / beliefTotal) * 100) / 100
    : null;
  const avg_current_posterior = beliefTotal > 0
    ? Math.round((beliefs.reduce((s, b) => s + b.current_posterior, 0) / beliefTotal) * 100) / 100
    : null;
  const low_confidence_count = beliefs.filter((b) => b.current_posterior < 0.3).length;

  // Reframing stats
  const sessionIds = reframingSessions.map((s) => s.id);
  const top_marked_frames = await getMarkedFramePatterns(sessionIds);

  const ideasSnap = {
    total: ideas.length,
    by_status,
    avg_days_in_validation,
    armchair_kills,
  };

  const has_enough_data = ideas.length >= 3 || validations.length >= 5;

  return {
    ideas: ideasSnap,
    validations: { total: validations.length, has_pain_yes, has_pain_no, has_pain_unsure, will_pay_yes, will_pay_no, will_pay_unsure },
    decisions: { total: decisions.length, by_verdict, kill_learned_sample },
    predictions: { total: predictions.length, hit, miss, pending },
    beliefs: { total: beliefTotal, avg_prior, avg_current_posterior, low_confidence_count },
    reframing: { top_marked_frames: top_marked_frames.slice(0, 5), sessions_total: reframingSessions.length },
    has_enough_data,
  };
}
