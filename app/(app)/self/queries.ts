import { supabaseAdmin } from "@/lib/supabase";
import {
  buildPanel,
  estimateOneRepMax,
  specialization,
  type MainKey,
  type Panel,
  type PanelInput,
} from "@/lib/domains/self-model/panel";
import {
  SKILL_DEFS,
  evaluateFeats,
  milestoneOf,
  skillCeiling,
  featPointsFor,
  growthFor,
  rustFor,
  type FeatAvailability,
  type SkillGroup,
} from "@/lib/domains/self-model/skills";
import { traitStrength } from "@/lib/domains/self-model/trait-library";
import {
  referenceClasses,
  type Deed,
  type ReferenceClass,
} from "@/lib/domains/self-model/deeds";
import {
  assignRarities,
  collectSets,
  type Trait,
  type TraitModifier,
} from "@/lib/domains/self-model/traits";
import {
  computeIntensity,
  contextCount,
  evaluateTier,
  type SelfHypothesisKind,
  type SelfTier,
  type WindowGrade,
} from "@/lib/domains/self-model/tiers";

export type SelfAlternative = {
  label: string;
  explanation?: string;
  distinguishing_test?: string;
};

export type SelfHypothesisRow = {
  id: string;
  code: string;
  kind: SelfHypothesisKind;
  statement: string;
  scope_note: string | null;
  tier: SelfTier;
  alternative_explanations: SelfAlternative[];
  first_observed: string;
  last_evidence_on: string | null;
  refuted_at: string | null;
  refuted_reason: string | null;
};

export type SelfWindowRow = {
  id: string;
  hypothesis_id: string;
  occurred_on: string;
  situation: string;
  context_key: string;
  outcome: "hit" | "miss";
  grade: WindowGrade;
  cost_paid: string | null;
  third_party: string | null;
};

export type SelfPredictionRow = {
  id: string;
  hypothesis_id: string | null;
  text: string;
  due_at: string;
  made_at: string | null;
  outcome: "pending" | "hit" | "miss";
  resolved_at: string | null;
  note: string | null;
  confidence: number | null;
};

export type SelfLedgerEntry = {
  hypothesis: SelfHypothesisRow;
  windows: SelfWindowRow[];
  predictions: SelfPredictionRow[];
  intensity: ReturnType<typeof computeIntensity>;
  contexts: number;
  /** 按当前证据重算的档位。与库里存的不一致时，页面显示这个。 */
  evaluation: ReturnType<typeof evaluateTier>;
};

export type SelfCalibration = {
  settled: number;
  hits: number;
  /** 命中率。样本 <5 时为 null —— 没有分母就不给数字。 */
  hitRate: number | null;
  /** 平均把握度减去实际命中率：正数=系统性高估自己。 */
  offset: number | null;
};

export type SelfLedger = {
  entries: SelfLedgerEntry[];
  pending: SelfPredictionRow[];
  looseSettled: SelfPredictionRow[];
  calibration: SelfCalibration;
};

const HYPOTHESIS_COLUMNS =
  "id, code, kind, statement, scope_note, tier, alternative_explanations, first_observed, last_evidence_on, refuted_at, refuted_reason";
const WINDOW_COLUMNS =
  "id, hypothesis_id, occurred_on, situation, context_key, outcome, grade, cost_paid, third_party";
const PREDICTION_COLUMNS =
  "id, hypothesis_id, text, due_at, made_at, outcome, resolved_at, note, confidence";
const BODY_LOG_COLUMNS =
  "id, logged_on, kind, movement, weight_kg, reps, sets, distance_km, duration_min";

const MIN_SAMPLES_FOR_CALIBRATION = 5;
const DAY_MS = 86_400_000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeCalibration(predictions: SelfPredictionRow[]): SelfCalibration {
  const settled = predictions.filter((p) => p.outcome !== "pending");
  const hits = settled.filter((p) => p.outcome === "hit").length;
  if (settled.length < MIN_SAMPLES_FOR_CALIBRATION) {
    return { settled: settled.length, hits, hitRate: null, offset: null };
  }
  const hitRate = Math.round((hits / settled.length) * 100);
  const withConfidence = settled.filter((p) => p.confidence !== null);
  const offset =
    withConfidence.length >= MIN_SAMPLES_FOR_CALIBRATION
      ? Math.round(
          withConfidence.reduce((sum, p) => sum + (p.confidence ?? 0), 0) /
            withConfidence.length -
            hitRate
        )
      : null;
  return { settled: settled.length, hits, hitRate, offset };
}

export async function getSelfLedger(userId: string): Promise<SelfLedger> {
  const [hypothesesResult, windowsResult, predictionsResult] = await Promise.all(
    [
      supabaseAdmin
        .from("self_hypotheses")
        .select(HYPOTHESIS_COLUMNS)
        .eq("user_id", userId)
        .order("code", { ascending: true }),
      supabaseAdmin
        .from("self_windows")
        .select(WINDOW_COLUMNS)
        .eq("user_id", userId)
        .order("occurred_on", { ascending: false }),
      supabaseAdmin
        .from("predictions")
        .select(PREDICTION_COLUMNS)
        .eq("user_id", userId)
        .eq("source_type", "self")
        .order("due_at", { ascending: true }),
    ]
  );

  if (hypothesesResult.error) throw new Error(hypothesesResult.error.message);
  if (windowsResult.error) throw new Error(windowsResult.error.message);
  if (predictionsResult.error) throw new Error(predictionsResult.error.message);

  const hypotheses = (hypothesesResult.data ?? []) as SelfHypothesisRow[];
  const windows = (windowsResult.data ?? []) as SelfWindowRow[];
  const predictions = (predictionsResult.data ?? []) as SelfPredictionRow[];
  const today = todayIso();

  const entries: SelfLedgerEntry[] = hypotheses.map((hypothesis) => {
    const own = windows.filter((w) => w.hypothesis_id === hypothesis.id);
    const forecasts = predictions.filter(
      (p) => p.hypothesis_id === hypothesis.id
    );
    return {
      hypothesis,
      windows: own,
      predictions: forecasts,
      intensity: computeIntensity(own),
      contexts: contextCount(own),
      evaluation: evaluateTier({
        kind: hypothesis.kind,
        currentTier: hypothesis.tier,
        windows: own,
        predictions: forecasts,
        today,
      }),
    };
  });

  return {
    entries,
    pending: predictions.filter((p) => p.outcome === "pending"),
    looseSettled: predictions.filter(
      (p) => p.outcome !== "pending" && p.hypothesis_id === null
    ),
    calibration: computeCalibration(predictions),
  };
}

/** 下一个假设编号。code 永不复用，即使旧假设被推翻或归档。 */
export async function nextHypothesisCode(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("self_hypotheses")
    .select("code")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const max = (data ?? []).reduce((highest, row) => {
    const parsed = Number.parseInt(String(row.code).replace(/^H-/, ""), 10);
    return Number.isFinite(parsed) && parsed > highest ? parsed : highest;
  }, 0);
  return `H-${String(max + 1).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// 角色面板：九主属性 / 二十六子属性 / 四个生活域。
// 全部来自已有的行为数据，不需要额外输入，也不经过 AI。
// 采集口还没建的子属性诚实地空着 —— 暗着的域正是要去点的地方。
// ---------------------------------------------------------------------------

export type SelfPanel = {
  panel: Panel;
  spread: ReturnType<typeof specialization>;
  /** 击杀换算需要的原始计数（都是已经发生过的动作，不额外记账）。 */
  bodyLogs: number;
  concludedBattles: number;
  /** 原始聚合。称号与流派要用到面板没有暴露的那些计数。 */
  raw: PanelInput;
};

export type BodyLogRow = {
  id: string;
  logged_on: string;
  kind: "lift" | "cardio";
  movement: string;
  weight_kg: number | null;
  reps: number | null;
  sets: number | null;
  distance_km: number | null;
  duration_min: number | null;
};

type IdeaRow = {
  id: string;
  status: string;
  created_at: string;
  last_activity_at: string;
};

type DecisionJoin = {
  verdict: string;
  learned: string | null;
  decided_at: string;
  ideas: { user_id: string; created_at: string } | null;
};

type ValidationJoin = {
  idea_id: string;
  has_pain: string;
  contacted_at: string;
  ideas: { user_id: string; created_at: string } | null;
};

function daysApart(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, (end - start) / DAY_MS);
}

/** 从最早一条记录到今天的月数，最小 1 —— 免得刚开张就除出天文数字。 */
function monthsSince(dates: string[]): number {
  if (dates.length === 0) return 1;
  const earliest = dates.reduce((a, b) =>
    Date.parse(a) <= Date.parse(b) ? a : b
  );
  return Math.max(1, daysApart(earliest, new Date().toISOString()) / 30);
}

/**
 * 力量的分子分母：每个至少记过两次的动作，取"最早一次"和"历史最好"的估算 1RM。
 * 只跟自己的起点比 —— 没有可信的人群分布，编一个出来就成了跨人比较。
 */
function summariseBody(logs: BodyLogRow[]) {
  const lifts = logs.filter((row) => row.kind === "lift");
  const cardio = logs.filter((row) => row.kind === "cardio");

  const byMovement = new Map<
    string,
    { first: { on: string; oneRm: number } | null; best: number; count: number }
  >();
  for (const row of lifts) {
    const oneRm = estimateOneRepMax(row.weight_kg ?? 0, row.reps ?? 0);
    if (oneRm === null) continue;
    const key = row.movement.trim();
    const entry = byMovement.get(key) ?? { first: null, best: 0, count: 0 };
    entry.count += 1;
    entry.best = Math.max(entry.best, oneRm);
    if (!entry.first || row.logged_on < entry.first.on) {
      entry.first = { on: row.logged_on, oneRm };
    }
    byMovement.set(key, entry);
  }

  let strengthStart = 0;
  let strengthNow = 0;
  for (const entry of byMovement.values()) {
    if (entry.count < 2 || !entry.first) continue;
    strengthStart += entry.first.oneRm;
    strengthNow += entry.best;
  }

  const since = (days: number) =>
    new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
  const consistencyFloor = since(56);
  const recentFloor = since(28);

  const tonnage = lifts
    .filter((row) => row.logged_on >= recentFloor)
    .reduce(
      (sum, row) =>
        sum + (row.weight_kg ?? 0) * (row.reps ?? 0) * (row.sets ?? 1),
      0
    );

  return {
    liftSessions: lifts.length,
    strengthStart,
    strengthNow,
    weeklyTonnage: tonnage / 4,
    trainingDays: new Set(
      logs
        .filter((row) => row.logged_on >= consistencyFloor)
        .map((row) => row.logged_on)
    ).size,
    trainingLogs: logs.length,
    cardioSessions: cardio.length,
    cardioMinutes: cardio
      .filter((row) => row.logged_on >= recentFloor)
      .reduce((sum, row) => sum + (row.duration_min ?? 0), 0),
  };
}

export async function listBodyLogs(userId: string): Promise<BodyLogRow[]> {
  const { data, error } = await supabaseAdmin
    .from("self_body_logs")
    .select(BODY_LOG_COLUMNS)
    .eq("user_id", userId)
    .order("logged_on", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as BodyLogRow[];
}

export async function getSelfPanel(userId: string): Promise<SelfPanel> {
  const [
    predictions,
    ideas,
    decisions,
    validations,
    commitments,
    battles,
    windows,
    bodyLogs,
    decoys,
    exitCriteria,
    timeBlocks,
    daily,
    encounters,
    resources,
  ] = await Promise.all([
    supabaseAdmin.from("predictions").select("outcome").eq("user_id", userId),
    supabaseAdmin
      .from("ideas")
      .select("id, status, created_at, last_activity_at")
      .eq("user_id", userId),
    supabaseAdmin
      .from("decisions")
      .select("verdict, learned, decided_at, ideas!inner(user_id, created_at)")
      .eq("ideas.user_id", userId),
    supabaseAdmin
      .from("validations")
      .select("idea_id, has_pain, contacted_at, ideas!inner(user_id, created_at)")
      .eq("ideas.user_id", userId),
    supabaseAdmin
      .from("retro_commitments")
      .select("completed_at")
      .eq("user_id", userId),
    supabaseAdmin
      .from("battle_sessions")
      .select("status, final_position")
      .eq("user_id", userId),
    supabaseAdmin
      .from("self_windows")
      .select("context_key, serendipity")
      .eq("user_id", userId),
    supabaseAdmin
      .from("self_body_logs")
      .select(BODY_LOG_COLUMNS)
      .eq("user_id", userId),
    supabaseAdmin
      .from("decoy_sessions")
      .select("reveal, status")
      .eq("user_id", userId),
    supabaseAdmin
      .from("idea_exit_criteria")
      .select("triggered, reviewed_at")
      .eq("user_id", userId),
    supabaseAdmin
      .from("daily_time_blocks")
      .select("category_key")
      .eq("user_id", userId),
    supabaseAdmin
      .from("self_daily")
      .select("logged_on, sleep_hours")
      .eq("user_id", userId),
    supabaseAdmin
      .from("self_encounters")
      .select("kind, outcome, occurred_on")
      .eq("user_id", userId),
    supabaseAdmin
      .from("self_resources")
      .select("runway_months, allies, weekly_free_hours, recorded_on")
      .eq("user_id", userId)
      .order("recorded_on", { ascending: false })
      .limit(1),
  ]);

  for (const result of [
    predictions,
    ideas,
    decisions,
    validations,
    commitments,
    battles,
    windows,
    bodyLogs,
    decoys,
    exitCriteria,
    timeBlocks,
    daily,
    encounters,
    resources,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  // 诱饵测试：reveal 里 caught / missed 是被设计出来的分母 ——
  // 那些坑是故意埋的，识破率不用推断。
  const decoyRows = (decoys.data ?? []) as {
    reveal: { caught?: unknown[]; missed?: unknown[] } | null;
    status: string;
  }[];
  const decoyCaught = decoyRows.reduce(
    (sum, row) => sum + (row.reveal?.caught?.length ?? 0),
    0
  );
  const decoyMissed = decoyRows.reduce(
    (sum, row) => sum + (row.reveal?.missed?.length ?? 0),
    0
  );

  const exitRows = (exitCriteria.data ?? []) as {
    triggered: string;
    reviewed_at: string | null;
  }[];

  const blockRows = (timeBlocks.data ?? []) as { category_key: string }[];

  const dailyRows = (daily.data ?? []) as {
    logged_on: string;
    sleep_hours: number;
  }[];
  const encounterRows = (encounters.data ?? []) as {
    kind: "exposure" | "new_face" | "proposal";
    outcome: "accepted" | "rejected" | "pending" | null;
    occurred_on: string;
  }[];
  const latestResources = ((resources.data ?? []) as {
    runway_months: number;
    allies: number;
    weekly_free_hours: number;
  }[])[0];
  const windowRows = (windows.data ?? []) as {
    context_key: string;
    serendipity: boolean;
  }[];
  const ninetyDaysAgo = new Date(Date.now() - 90 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const recentEncounters = encounterRows.filter(
    (row) => row.occurred_on >= ninetyDaysAgo
  );
  const settledProposals = encounterRows.filter(
    (row) => row.kind === "proposal" && row.outcome !== "pending"
  );

  const settled = (predictions.data ?? []).filter(
    (row) => row.outcome !== "pending"
  );
  const ideaRows = (ideas.data ?? []) as IdeaRow[];
  const decisionRows = (decisions.data ?? []) as unknown as DecisionJoin[];
  const validationRows = (validations.data ?? []) as unknown as ValidationJoin[];
  const battleRows = (battles.data ?? []) as {
    status: string;
    final_position: string | null;
  }[];

  // 每个想法的验证次数，以及从想法创建到第一次真实接触的间隔。
  const countByIdea = new Map<string, number>();
  const firstContactByIdea = new Map<string, { at: string; born: string }>();
  for (const row of validationRows) {
    countByIdea.set(row.idea_id, (countByIdea.get(row.idea_id) ?? 0) + 1);
    const born = row.ideas?.created_at;
    if (!born) continue;
    const seen = firstContactByIdea.get(row.idea_id);
    if (!seen || Date.parse(row.contacted_at) < Date.parse(seen.at)) {
      firstContactByIdea.set(row.idea_id, { at: row.contacted_at, born });
    }
  }

  const concludedBattles = battleRows.filter(
    (row) => row.status === "concluded"
  );

  const input: PanelInput = {
    predictionsSettled: settled.length,
    predictionsHit: settled.filter((row) => row.outcome === "hit").length,
    ideaLifespans: decisionRows
      .filter((row) => row.ideas?.created_at)
      .map((row) => daysApart(row.ideas?.created_at ?? "", row.decided_at)),
    longestSpanDays: ideaRows.reduce(
      (max, row) =>
        Math.max(max, daysApart(row.created_at, row.last_activity_at)),
      0
    ),
    activeIdeas: ideaRows.filter((row) => row.status !== "归档").length,
    ideasTotal: ideaRows.length,
    ideasPerMonth:
      ideaRows.length / monthsSince(ideaRows.map((row) => row.created_at)),
    decisionsTotal: decisionRows.length,
    validationsPerIdea: [...countByIdea.values()],
    validationsPerMonth:
      validationRows.length /
      monthsSince(validationRows.map((row) => row.contacted_at)),
    painNo: validationRows.filter((row) => row.has_pain === "no").length,
    painTotal: validationRows.length,
    firstContactDelays: [...firstContactByIdea.values()].map((entry) =>
      daysApart(entry.born, entry.at)
    ),
    learnedTexts: decisionRows
      .map((row) => (row.learned ?? "").trim())
      .filter((text) => text.length > 0),
    battlesConcluded: concludedBattles.length,
    battlesWithNewPosition: concludedBattles.filter(
      (row) => (row.final_position ?? "").trim().length > 0
    ).length,
    commitmentsTotal: (commitments.data ?? []).length,
    commitmentsDone: (commitments.data ?? []).filter(
      (row) => row.completed_at !== null
    ).length,
    distinctContexts: new Set(
      windowRows
        .map((row) => row.context_key.trim())
        .filter((key) => key.length > 0)
    ).size,
    sleepDays: dailyRows.length,
    sleepEnoughDays: dailyRows.filter((row) => row.sleep_hours >= 7).length,
    exposures: recentEncounters.filter((row) => row.kind === "exposure").length,
    proposalsTotal: settledProposals.length,
    proposalsAccepted: settledProposals.filter(
      (row) => row.outcome === "accepted"
    ).length,
    newFaces: recentEncounters.filter((row) => row.kind === "new_face").length,
    serendipities: windowRows.filter((row) => row.serendipity).length,
    runwayMonths: latestResources ? Number(latestResources.runway_months) : null,
    allies: latestResources ? Number(latestResources.allies) : null,
    weeklyFreeHours: latestResources
      ? Number(latestResources.weekly_free_hours)
      : null,
    decoyCaught,
    decoyMissed,
    exitCriteriaTotal: exitRows.length,
    exitCriteriaReviewed: exitRows.filter((row) => row.reviewed_at !== null)
      .length,
    timeBlocksTotal: blockRows.length,
    timeBlocksGray: blockRows.filter((row) => row.category_key === "gray")
      .length,
    ...summariseBody((bodyLogs.data ?? []) as BodyLogRow[]),
  };

  const panel = buildPanel(input);
  return {
    panel,
    spread: specialization(panel),
    bodyLogs: input.trainingLogs,
    concludedBattles: concludedBattles.length,
    raw: input,
  };
}

// ---------------------------------------------------------------------------
// 特性：挂在子属性上的带符号修正。
// 品级由 lib/domains/self-model/traits.ts 从修正结构 + 证据强度算出来。
// 证据从关联的假设那边借 —— 特性不自建证据链，避免同一件事记两遍。
// ---------------------------------------------------------------------------

type TraitRow = {
  id: string;
  spectrum_key: string;
  name: string;
  modifiers: TraitModifier[];
  backfire: string | null;
  equip_note: string | null;
  set_key: string | null;
  set_effect: string | null;
  refused_offer: string | null;
  hypothesis_id: string | null;
  status: "held" | "faded";
  first_held_on: string;
  library_key: string | null;
};

export type SelfTraits = {
  traits: (Trait & { strength: number | null; libraryKey: string | null })[];
  sets: ReturnType<typeof collectSets>;
};

const TRAIT_COLUMNS =
  "id, spectrum_key, name, modifiers, backfire, equip_note, set_key, set_effect, refused_offer, hypothesis_id, status, first_held_on, library_key";

export async function getSelfTraits(
  userId: string,
  ledger: SelfLedger,
  subValues: Record<string, number | null> = {}
): Promise<SelfTraits> {
  const { data, error } = await supabaseAdmin
    .from("self_traits")
    .select(TRAIT_COLUMNS)
    .eq("user_id", userId)
    .order("first_held_on", { ascending: true });
  if (error) throw new Error(error.message);

  const byHypothesis = new Map(
    ledger.entries.map((entry) => [entry.hypothesis.id, entry])
  );

  const traits = assignRarities(
    ((data ?? []) as TraitRow[]).map((row) => {
      const entry = row.hypothesis_id
        ? byHypothesis.get(row.hypothesis_id)
        : undefined;
      return {
        id: row.id,
        name: row.name,
        spectrumKey: row.spectrum_key,
        modifiers: Array.isArray(row.modifiers) ? row.modifiers : [],
        backfire: row.backfire,
        equipNote: row.equip_note,
        setKey: row.set_key,
        setEffect: row.set_effect,
        refusedOffer: row.refused_offer,
        evidence: {
          windows: entry?.windows.length ?? 0,
          contexts: entry?.contexts ?? 0,
          forecastHits:
            entry?.predictions.filter((p) => p.outcome === "hit").length ?? 0,
        },
        status: row.status,
      };
    })
  );

  const withStrength = traits.map((trait) => {
    const row = ((data ?? []) as TraitRow[]).find((item) => item.id === trait.id);
    return {
      ...trait,
      libraryKey: row?.library_key ?? null,
      strength: row?.library_key
        ? traitStrength(row.library_key, subValues)
        : null,
    };
  });
  return { traits: withStrength, sets: collectSets(traits) };
}

// ---------------------------------------------------------------------------
// 技能与专长。
// 定义（45 项技能 / 12 个专长）在 lib/domains/self-model/skills.ts，
// 这里只取用户状态：当前值、未结算的勾、已点的专长。
// ---------------------------------------------------------------------------

export type SkillRow = {
  key: string;
  name: string;
  group: SkillGroup;
  main: MainKey;
  value: number;
  passion: number;
  /** 本季未结算的勾。 */
  ticks: number;
  daysSinceTick: number | null;
  /** 下次结算会涨多少（不含生锈）。 */
  pendingGrowth: number;
  rust: number;
  /** 当前上限，以及被哪根地基拖着。 */
  ceiling: number;
  limitedBy: { key: string; name: string; value: number } | null;
  /** 已跨过的里程碑与下一档。 */
  passed: ReturnType<typeof milestoneOf>["passed"];
  nextMilestone: ReturnType<typeof milestoneOf>["next"];
};

export type SelfSkills = {
  skills: SkillRow[];
  /** 有没有开过局。false 时页面只显示建卡。 */
  started: boolean;
  feats: FeatAvailability[];
  featPointsLeft: number;
};

export async function getSelfSkills(
  userId: string,
  input: { level: number; traits: string[]; settledForecasts: number; litDomains: number }
): Promise<SelfSkills> {
  const [stored, ticks, feats] = await Promise.all([
    supabaseAdmin
      .from("self_skills")
      .select("skill_key, value, passion")
      .eq("user_id", userId),
    supabaseAdmin
      .from("self_skill_ticks")
      .select("skill_key, occurred_on, settled_at")
      .eq("user_id", userId),
    supabaseAdmin.from("self_feats").select("feat_key").eq("user_id", userId),
  ]);
  if (stored.error) throw new Error(stored.error.message);
  if (ticks.error) throw new Error(ticks.error.message);
  if (feats.error) throw new Error(feats.error.message);

  const storedRows = (stored.data ?? []) as {
    skill_key: string;
    value: number;
    passion: number;
  }[];
  const tickRows = (ticks.data ?? []) as {
    skill_key: string;
    occurred_on: string;
    settled_at: string | null;
  }[];
  const byKey = new Map(storedRows.map((row) => [row.skill_key, row]));
  const today = new Date().toISOString().slice(0, 10);

  const valueByKey: Record<string, number> = Object.fromEntries(
    SKILL_DEFS.map((def) => [
      def.key,
      byKey.get(def.key)?.value ?? 0,
    ])
  );

  const skills: SkillRow[] = SKILL_DEFS.map((def) => {
    const row = byKey.get(def.key);
    const own = tickRows.filter((tick) => tick.skill_key === def.key);
    const open = own.filter((tick) => tick.settled_at === null).length;
    const last = own
      .map((tick) => tick.occurred_on)
      .sort()
      .at(-1);
    const state = {
      key: def.key,
      value: row?.value ?? 0,
      passion: row?.passion ?? 0,
      ticks: open,
      daysSinceTick: last ? Math.floor(daysApart(last, today)) : null,
    };
    const { ceiling, limitedBy } = skillCeiling(def.key, valueByKey);
    const { passed, next } = milestoneOf(def, state.value);
    return {
      ...def,
      value: state.value,
      passion: state.passion,
      ticks: state.ticks,
      daysSinceTick: state.daysSinceTick,
      pendingGrowth: growthFor(state, ceiling),
      rust: rustFor(state),
      ceiling,
      limitedBy,
      passed,
      nextMilestone: next,
    };
  });

  const takenFeats = ((feats.data ?? []) as { feat_key: string }[]).map(
    (row) => row.feat_key
  );
  const featPointsLeft = featPointsFor(input.level, takenFeats.length);

  return {
    skills,
    started: storedRows.length > 0,
    featPointsLeft,
    feats: evaluateFeats({
      skills: Object.fromEntries(skills.map((skill) => [skill.key, skill.value])),
      traits: input.traits,
      taken: takenFeats,
      settledForecasts: input.settledForecasts,
      litDomains: input.litDomains,
      featPointsLeft,
    }),
  };
}

// ---------------------------------------------------------------------------
// 周战报：同一批数据，换个语气。
// 不新增任何采集 —— 只把最近 7 天已经发生过的事捞出来重讲一遍。
// 它的全部作用是让人愿意每周打开这一页，所以只统计"你做了什么"，
// 不统计"你还差什么"（那是怪物清单的活）。
// ---------------------------------------------------------------------------

export type WeeklyReport = {
  from: string;
  contacts: number;
  contactHits: number;
  windows: number;
  windowMisses: number;
  serendipities: number;
  settled: number;
  settledHits: number;
  ticks: number;
  lifts: number;
  cardioMinutes: number;
  encounters: number;
  sleepNights: number;
  sleepEnough: number;
  /** 这一周一件事都没发生。 */
  quiet: boolean;
};

export async function getWeeklyReport(userId: string): Promise<WeeklyReport> {
  const from = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
  const fromTs = `${from}T00:00:00Z`;

  const [windows, predictions, ticks, body, encounters, daily, validations] =
    await Promise.all([
      supabaseAdmin
        .from("self_windows")
        .select("outcome, serendipity")
        .eq("user_id", userId)
        .gte("occurred_on", from),
      supabaseAdmin
        .from("predictions")
        .select("outcome")
        .eq("user_id", userId)
        .eq("source_type", "self")
        .not("resolved_at", "is", null)
        .gte("resolved_at", fromTs),
      supabaseAdmin
        .from("self_skill_ticks")
        .select("id")
        .eq("user_id", userId)
        .gte("occurred_on", from),
      supabaseAdmin
        .from("self_body_logs")
        .select("kind, duration_min")
        .eq("user_id", userId)
        .gte("logged_on", from),
      supabaseAdmin
        .from("self_encounters")
        .select("id")
        .eq("user_id", userId)
        .gte("occurred_on", from),
      supabaseAdmin
        .from("self_daily")
        .select("sleep_hours")
        .eq("user_id", userId)
        .gte("logged_on", from),
      supabaseAdmin
        .from("validations")
        .select("has_pain, ideas!inner(user_id)")
        .eq("ideas.user_id", userId)
        .gte("contacted_at", fromTs),
    ]);

  for (const result of [
    windows,
    predictions,
    ticks,
    body,
    encounters,
    daily,
    validations,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const windowRows = (windows.data ?? []) as {
    outcome: string;
    serendipity: boolean;
  }[];
  const predictionRows = (predictions.data ?? []) as { outcome: string }[];
  const bodyRows = (body.data ?? []) as {
    kind: string;
    duration_min: number | null;
  }[];
  const dailyRows = (daily.data ?? []) as { sleep_hours: number }[];
  const validationRows = (validations.data ?? []) as { has_pain: string }[];

  const report: WeeklyReport = {
    from,
    contacts: validationRows.length,
    contactHits: validationRows.filter((row) => row.has_pain === "yes").length,
    windows: windowRows.length,
    windowMisses: windowRows.filter((row) => row.outcome === "miss").length,
    serendipities: windowRows.filter((row) => row.serendipity).length,
    settled: predictionRows.length,
    settledHits: predictionRows.filter((row) => row.outcome === "hit").length,
    ticks: (ticks.data ?? []).length,
    lifts: bodyRows.filter((row) => row.kind === "lift").length,
    cardioMinutes: bodyRows
      .filter((row) => row.kind === "cardio")
      .reduce((sum, row) => sum + (row.duration_min ?? 0), 0),
    encounters: (encounters.data ?? []).length,
    sleepNights: dailyRows.length,
    sleepEnough: dailyRows.filter((row) => row.sleep_hours >= 7).length,
    quiet: false,
  };

  report.quiet =
    report.contacts === 0 &&
    report.windows === 0 &&
    report.settled === 0 &&
    report.ticks === 0 &&
    report.lifts === 0 &&
    report.cardioMinutes === 0 &&
    report.encounters === 0 &&
    report.sleepNights === 0;

  return report;
}

// ---------------------------------------------------------------------------
// NPC 图鉴。
//
// self_encounters 里一直有 counterpart 字段，但从来没人看过它。
// 按人聚合一下，"人际域"就从一个数字变成了几张具体的脸。
//
// 里面最扎的是**对某个人的采纳率**：你预判的从来不是"别人"，
// 是某个具体的人 —— 那就该按人算账。分母不够时照例不给比率。
// ---------------------------------------------------------------------------

export type NpcRow = {
  name: string;
  encounters: number;
  lastSeen: string;
  exposures: number;
  proposals: number;
  accepted: number;
  rejected: number;
  pending: number;
  /** 采纳率。已有结果的提议 <3 条时为 null。 */
  adoptionRate: number | null;
  firstMet: string;
};

const MIN_PROPOSALS_FOR_RATE = 3;

export async function getNpcs(userId: string): Promise<NpcRow[]> {
  const { data, error } = await supabaseAdmin
    .from("self_encounters")
    .select("counterpart, kind, outcome, occurred_on")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    counterpart: string;
    kind: "exposure" | "new_face" | "proposal";
    outcome: "accepted" | "rejected" | "pending" | null;
    occurred_on: string;
  }[];

  const byName = new Map<string, NpcRow>();
  for (const row of rows) {
    const name = row.counterpart.trim();
    if (!name) continue;
    const entry =
      byName.get(name) ??
      ({
        name,
        encounters: 0,
        lastSeen: row.occurred_on,
        firstMet: row.occurred_on,
        exposures: 0,
        proposals: 0,
        accepted: 0,
        rejected: 0,
        pending: 0,
        adoptionRate: null,
      } satisfies NpcRow);

    entry.encounters += 1;
    if (row.occurred_on > entry.lastSeen) entry.lastSeen = row.occurred_on;
    if (row.occurred_on < entry.firstMet) entry.firstMet = row.occurred_on;
    if (row.kind === "exposure") entry.exposures += 1;
    if (row.kind === "proposal") {
      entry.proposals += 1;
      if (row.outcome === "accepted") entry.accepted += 1;
      if (row.outcome === "rejected") entry.rejected += 1;
      if (row.outcome === "pending") entry.pending += 1;
    }
    byName.set(name, entry);
  }

  return [...byName.values()]
    .map((entry) => {
      const settled = entry.accepted + entry.rejected;
      return {
        ...entry,
        adoptionRate:
          settled >= MIN_PROPOSALS_FOR_RATE
            ? Math.round((entry.accepted / settled) * 100)
            : null,
      };
    })
    .sort((a, b) => b.encounters - a.encounters);
}

// ---------------------------------------------------------------------------
// 事件流：变化发生的那一刻。
// 其余所有东西都是"现在的状态"，只有这里记得"什么时候变的"。
// ---------------------------------------------------------------------------

export type SelfEventRow = {
  id: string;
  occurred_at: string;
  kind: string;
  title: string;
  detail: string | null;
};

export async function getSelfEvents(
  userId: string,
  limit = 12
): Promise<SelfEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("self_events")
    .select("id, occurred_at, kind, title, detail")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SelfEventRow[];
}

/**
 * 补记称号与转职。这两样是派生的，没有天然的写入时机 ——
 * 每次扫描时把"现在满足条件的"和"已经记过的"一比，差值就是新解锁。
 */
export async function recordDerivedEvents(
  userId: string,
  input: { earnedTitleKeys: string[]; buildKey: string | null; buildName: string | null }
): Promise<void> {
  const rows = [
    ...input.earnedTitleKeys.map((key) => ({
      user_id: userId,
      kind: "title_earned",
      title: `获得称号「${key}」`,
      dedupe_key: `title:${key}`,
    })),
    ...(input.buildKey && input.buildName
      ? [
          {
            user_id: userId,
            kind: "build_changed",
            title: `转职：${input.buildName}`,
            dedupe_key: `build:${input.buildKey}`,
          },
        ]
      : []),
  ];
  if (rows.length === 0) return;
  // 撞上唯一索引说明早就记过了，忽略即可。
  await supabaseAdmin.from("self_events").upsert(rows, {
    onConflict: "user_id,dedupe_key",
    ignoreDuplicates: true,
  });
}

/** 每只怪出现过多少周。用来算"你从它面前走开过几次"。 */
export async function getQuestSightings(
  userId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin
    .from("self_quest_sightings")
    .select("quest_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { quest_id: string }[]) {
    counts.set(row.quest_id, (counts.get(row.quest_id) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// 事迹与参照类。
// 没有历史就没有参照类，没有参照类，"未来预想"永远只能靠想象。
// ---------------------------------------------------------------------------

export type SelfDeeds = {
  deeds: Deed[];
  classes: ReferenceClass[];
};

export async function getSelfDeeds(userId: string): Promise<SelfDeeds> {
  const { data, error } = await supabaseAdmin
    .from("self_deeds")
    .select(
      "id, occurred_on, title, class_key, outcome, adopted, duration_days, cost"
    )
    .eq("user_id", userId)
    .order("occurred_on", { ascending: false });
  if (error) throw new Error(error.message);

  const deeds: Deed[] = (
    (data ?? []) as {
      id: string;
      occurred_on: string;
      title: string;
      class_key: string;
      outcome: "done" | "abandoned" | "ongoing";
      adopted: boolean | null;
      duration_days: number | null;
      cost: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    occurredOn: row.occurred_on,
    title: row.title,
    classKey: row.class_key,
    outcome: row.outcome,
    adopted: row.adopted,
    durationDays: row.duration_days,
    cost: row.cost,
  }));

  return { deeds, classes: referenceClasses(deeds) };
}
