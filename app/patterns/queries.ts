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
  kills: {
    total: number;
    armchair_kills: number;
    no_pain_kills: number;
    no_pay_kills: number;
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

  // avg days in validation: ideas currently in "验证中" status
  const validatingIdeas = ideas.filter((i) => i.status === "验证中");
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
  const validationsByIdea = new Map<string, { has_pain: string; will_pay: string }[]>();
  for (const v of validations) {
    const id = v.idea_id as string;
    const arr = validationsByIdea.get(id) ?? [];
    arr.push({ has_pain: v.has_pain as string, will_pay: v.will_pay as string });
    validationsByIdea.set(id, arr);
  }
  let armchair_kills = 0;
  let no_pain_kills = 0;
  let no_pay_kills = 0;
  for (const id of killedIdeaIds) {
    const arr = validationsByIdea.get(id);
    if (!arr || arr.length === 0) {
      armchair_kills++;
      continue;
    }
    if (arr.some((v) => v.has_pain === "no")) no_pain_kills++;
    if (arr.some((v) => v.will_pay === "no")) no_pay_kills++;
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
    kills: { total: killedIdeaIds.length, armchair_kills, no_pain_kills, no_pay_kills },
    predictions: { total: predictions.length, hit, miss, pending },
    beliefs: { total: beliefTotal, avg_prior, avg_current_posterior, low_confidence_count },
    reframing: { top_marked_frames: top_marked_frames.slice(0, 5), sessions_total: reframingSessions.length },
    has_enough_data,
  };
}

// ── Survival Calendar ────────────────────────────────────────────────────────

export type SurvivalDay = {
  date: string; // YYYY-MM-DD in user's timezone
  realContactCount: number;
  armchairCount: number;
};

export type SurvivalCalendar = {
  days: SurvivalDay[];
  lateNightDayCount: number; // 过去30天里，有观察记录落在凌晨0-4点的天数
};

function dateKeyInTimezone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function hourInTimezone(iso: string, timezone: string): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return parseInt(hourStr, 10) % 24;
}

/** 存活日历 + 深夜自查：最近365天真实接触vs空想的分布，以及最近30天的凌晨记录天数。 */
export async function getSurvivalCalendar(
  userId: string,
  timezone: string
): Promise<SurvivalCalendar> {
  const since365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: ideaRows, error: ideaError } = await supabaseAdmin
    .from("ideas")
    .select("id")
    .eq("user_id", userId);
  if (ideaError) throw new Error(ideaError.message);
  const ideaIds = (ideaRows ?? []).map((i) => i.id as string);

  const [
    validationsResult,
    conclusionsResult,
    observationsResult,
    aiSessionsResult,
  ] = await Promise.all([
    ideaIds.length
      ? supabaseAdmin
          .from("validations")
          .select("contacted_at")
          .in("idea_id", ideaIds)
          .gte("contacted_at", since365)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("customer_conclusions")
      .select("id, created_at, customer_proxy_versions!inner(customer_cases!inner(user_id))")
      .eq("customer_proxy_versions.customer_cases.user_id", userId)
      .gte("created_at", since365),
    supabaseAdmin
      .from("observations")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since365),
    ideaIds.length
      ? supabaseAdmin
          .from("ai_sessions")
          .select("created_at")
          .in("idea_id", ideaIds)
          .gte("created_at", since365)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (validationsResult.error) throw new Error(validationsResult.error.message);
  if (conclusionsResult.error) throw new Error(conclusionsResult.error.message);
  if (observationsResult.error) throw new Error(observationsResult.error.message);
  if (aiSessionsResult.error) throw new Error(aiSessionsResult.error.message);

  const dayMap = new Map<string, SurvivalDay>();
  function bump(iso: string, real: boolean) {
    const key = dateKeyInTimezone(iso, timezone);
    const day = dayMap.get(key) ?? { date: key, realContactCount: 0, armchairCount: 0 };
    if (real) day.realContactCount += 1;
    else day.armchairCount += 1;
    dayMap.set(key, day);
  }

  for (const v of validationsResult.data ?? []) bump(v.contacted_at as string, true);
  for (const c of conclusionsResult.data ?? []) bump(c.created_at as string, true);
  for (const o of observationsResult.data ?? []) bump(o.created_at as string, false);
  for (const s of aiSessionsResult.data ?? []) bump(s.created_at as string, false);

  const lateNightDays = new Set<string>();
  for (const o of observationsResult.data ?? []) {
    const iso = o.created_at as string;
    if (iso < since30) continue;
    const hour = hourInTimezone(iso, timezone);
    if (hour >= 0 && hour < 4) {
      lateNightDays.add(dateKeyInTimezone(iso, timezone));
    }
  }

  return {
    days: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    lateNightDayCount: lateNightDays.size,
  };
}
