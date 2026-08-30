import { supabaseAdmin } from "@/lib/supabase";
import {
  buildPanel,
  estimateOneRepMax,
  specialization,
  type Panel,
  type PanelInput,
} from "@/lib/domains/self-model/panel";
import {
  SKILL_DEFS,
  evaluateFeats,
  featPointsFor,
  growthFor,
  rustFor,
  type FeatAvailability,
  type SkillGroup,
} from "@/lib/domains/self-model/skills";
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
    daily,
    encounters,
    resources,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

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
    ...summariseBody((bodyLogs.data ?? []) as BodyLogRow[]),
  };

  const panel = buildPanel(input);
  return {
    panel,
    spread: specialization(panel),
    bodyLogs: input.trainingLogs,
    concludedBattles: concludedBattles.length,
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
};

export type SelfTraits = {
  traits: Trait[];
  sets: ReturnType<typeof collectSets>;
};

const TRAIT_COLUMNS =
  "id, spectrum_key, name, modifiers, backfire, equip_note, set_key, set_effect, refused_offer, hypothesis_id, status, first_held_on";

export async function getSelfTraits(
  userId: string,
  ledger: SelfLedger
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

  return { traits, sets: collectSets(traits) };
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
  value: number;
  passion: number;
  /** 本季未结算的勾。 */
  ticks: number;
  daysSinceTick: number | null;
  /** 下次结算会涨多少（不含生锈）。 */
  pendingGrowth: number;
  rust: number;
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
    return {
      ...def,
      value: state.value,
      passion: state.passion,
      ticks: state.ticks,
      daysSinceTick: state.daysSinceTick,
      pendingGrowth: growthFor(state),
      rust: rustFor(state),
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
