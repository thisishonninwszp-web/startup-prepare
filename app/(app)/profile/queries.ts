import { supabaseAdmin } from "@/lib/supabase";

export type ProfileRichData = {
  // 内容数据（用于性格推断）
  idea_snapshots: {
    title: string;
    tags: string[];
    target_user: string | null;
    pain: string | null;
    status: string;
  }[];
  dream_snapshots: {
    title: string;
    initial_desire: string | null;
    scene_title: string | null;
    inner_state: string | null;
  }[];
  reframing_topics: string[];
  decision_learned: string[];
  validation_notes: string[];
  belief_questions: string[];
  observation_texts: string[];

  // 行为统计
  stats: {
    total_ideas: number;
    by_status: Record<string, number>;
    armchair_kills: number;
    total_validations: number;
    has_pain_yes: number;
    has_pain_no: number;
    has_pain_unsure: number;
    will_pay_yes: number;
    will_pay_no: number;
    will_pay_unsure: number;
    total_decisions: number;
    go_count: number;
    kill_count: number;
    total_predictions: number;
    prediction_hit: number;
    prediction_miss: number;
    avg_prior: number | null;
    avg_posterior: number | null;
    top_reframing_frames: Array<{ frame_type: string; count: number }>;
    days_active: number;
  };
};

export async function getProfileData(userId: string): Promise<ProfileRichData> {
  const ideaIdsResult = await supabaseAdmin
    .from("ideas")
    .select("id")
    .eq("user_id", userId);
  const ideaIds = (ideaIdsResult.data ?? []).map((r) => r.id as string);

  const [
    ideasResult,
    dreamsResult,
    reframingResult,
    decisionsResult,
    validationsResult,
    beliefsResult,
    observationsResult,
    predictionsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("ideas")
      .select("title, tags, hypothesis, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("dream_cases")
      .select("title, initial_desire, dream_versions(vision, version_no)")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("reframing_sessions")
      .select("topic_text, reframing_frames(frame_type, is_marked)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    ideaIds.length > 0
      ? supabaseAdmin
          .from("decisions")
          .select("verdict, learned, idea_id")
          .in("idea_id", ideaIds)
      : Promise.resolve({ data: [], error: null }),
    ideaIds.length > 0
      ? supabaseAdmin
          .from("validations")
          .select("idea_id, has_pain, will_pay, note")
          .in("idea_id", ideaIds)
          .order("contacted_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("bayesian_beliefs")
      .select("question, prior, bayesian_updates(posterior)")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabaseAdmin
      .from("observations")
      .select("raw_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    ideaIds.length > 0
      ? supabaseAdmin
          .from("predictions")
          .select("outcome")
          .in("idea_id", ideaIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const ideas = ideasResult.data ?? [];
  const dreams = dreamsResult.data ?? [];
  const reframingSessions = reframingResult.data ?? [];
  const decisions = decisionsResult.data ?? [];
  const validations = validationsResult.data ?? [];
  const beliefs = beliefsResult.data ?? [];
  const observations = observationsResult.data ?? [];
  const predictions = predictionsResult.data ?? [];

  // Build idea snapshots
  const idea_snapshots = ideas.map((idea) => {
    const hyp = idea.hypothesis as Record<string, unknown> | null;
    return {
      title: idea.title as string,
      tags: Array.isArray(idea.tags) ? (idea.tags as string[]) : [],
      target_user: typeof hyp?.target_user === "string" ? hyp.target_user : null,
      pain: typeof hyp?.pain === "string" ? hyp.pain : null,
      status: idea.status as string,
    };
  });

  // Build dream snapshots
  const dream_snapshots = dreams.map((dc) => {
    const versions = Array.isArray(dc.dream_versions) ? dc.dream_versions : [];
    const latest = versions.sort(
      (a: { version_no: number }, b: { version_no: number }) =>
        b.version_no - a.version_no
    )[0];
    const vision = latest?.vision as Record<string, unknown> | null;
    const scene = vision?.scene as Record<string, unknown> | null;
    return {
      title: dc.title as string,
      initial_desire: typeof dc.initial_desire === "string" ? dc.initial_desire : null,
      scene_title: typeof scene?.title === "string" ? scene.title : null,
      inner_state: typeof vision?.inner_state === "string" ? vision.inner_state : null,
    };
  });

  // Reframing topics
  const reframing_topics = reframingSessions
    .map((s) => s.topic_text as string)
    .filter(Boolean);

  // Decision learned texts
  const decision_learned = decisions
    .map((d) => d.learned as string)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .slice(0, 12);

  // Validation notes
  const validation_notes = validations
    .map((v) => v.note as string)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .slice(0, 12);

  // Belief questions
  const belief_questions = beliefs
    .map((b) => b.question as string)
    .filter(Boolean);

  // Observations
  const observation_texts = observations
    .map((o) => o.raw_text as string)
    .filter(Boolean);

  // Behavioral stats
  const by_status: Record<string, number> = {};
  let earliest_created = Date.now();
  for (const idea of ideas) {
    const s = idea.status as string;
    by_status[s] = (by_status[s] ?? 0) + 1;
    const t = new Date(idea.created_at as string).getTime();
    if (t < earliest_created) earliest_created = t;
  }
  const days_active =
    ideas.length > 0
      ? Math.floor((Date.now() - earliest_created) / (1000 * 60 * 60 * 24))
      : 0;

  const killedIdeaIds = decisions
    .filter((d) => d.verdict === "Kill")
    .map((d) => d.idea_id as string);
  const validatedIdSet = new Set(validations.map((v) => v.idea_id as string));
  let armchair_kills = 0;
  for (const id of killedIdeaIds) {
    if (!validatedIdSet.has(id)) armchair_kills++;
  }

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

  const go_count = decisions.filter((d) => d.verdict === "Go").length;
  const kill_count = decisions.filter((d) => d.verdict === "Kill").length;

  let prediction_hit = 0, prediction_miss = 0;
  for (const p of predictions) {
    if (p.outcome === "hit") prediction_hit++;
    else if (p.outcome === "miss") prediction_miss++;
  }

  // Bayesian avg
  const beliefPriors = beliefs.map((b) => b.prior as number).filter((x) => typeof x === "number");
  const avg_prior =
    beliefPriors.length > 0
      ? Math.round((beliefPriors.reduce((a, b) => a + b, 0) / beliefPriors.length) * 100) / 100
      : null;

  const latestPosteriors = beliefs.map((b) => {
    const updates = Array.isArray(b.bayesian_updates) ? b.bayesian_updates : [];
    const sorted = updates.sort(
      (a: { posterior: number }, z: { posterior: number }) => z.posterior - a.posterior
    );
    return sorted[0]?.posterior ?? (b.prior as number);
  });
  const avg_posterior =
    latestPosteriors.length > 0
      ? Math.round(
          (latestPosteriors.reduce((a: number, b: number) => a + b, 0) / latestPosteriors.length) *
            100
        ) / 100
      : null;

  // Top reframing frames
  const frameCount = new Map<string, number>();
  for (const session of reframingSessions) {
    const frames = Array.isArray(session.reframing_frames)
      ? (session.reframing_frames as Array<{ frame_type: string; is_marked: boolean }>)
      : [];
    for (const f of frames) {
      if (f.is_marked) {
        frameCount.set(f.frame_type, (frameCount.get(f.frame_type) ?? 0) + 1);
      }
    }
  }
  const top_reframing_frames = Array.from(frameCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([frame_type, count]) => ({ frame_type, count }));

  return {
    idea_snapshots,
    dream_snapshots,
    reframing_topics,
    decision_learned,
    validation_notes,
    belief_questions,
    observation_texts,
    stats: {
      total_ideas: ideas.length,
      by_status,
      armchair_kills,
      total_validations: validations.length,
      has_pain_yes,
      has_pain_no,
      has_pain_unsure,
      will_pay_yes,
      will_pay_no,
      will_pay_unsure,
      total_decisions: decisions.length,
      go_count,
      kill_count,
      total_predictions: predictions.length,
      prediction_hit,
      prediction_miss,
      avg_prior,
      avg_posterior,
      top_reframing_frames,
      days_active,
    },
  };
}
