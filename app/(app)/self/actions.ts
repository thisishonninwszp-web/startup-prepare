"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  evaluateTier,
  SELF_HYPOTHESIS_KINDS,
  WINDOW_GRADES,
  type SelfHypothesisKind,
  type WindowGrade,
} from "@/lib/domains/self-model/tiers";
import { EMPTY_PANEL_INPUT, buildPanel } from "@/lib/domains/self-model/panel";
import {
  FEAT_DEFS,
  SKILL_DEFS,
  evaluateFeat,
  growthFor,
  skillCeiling,
  isSkillKey,
  rustFor,
} from "@/lib/domains/self-model/skills";
import {
  existingDispositionNames,
  decomposeSkill,
  nominateDispositions,
  type StageNomination,
  type DispositionNomination,
} from "@/lib/ai";
import { findDisposition } from "@/lib/domains/self-model/dispositions";
import { ALL_NODES, canUnlock } from "@/lib/domains/self-model/nodes";
import { isoWeekKey } from "@/lib/domains/self-model/quests";
import {
  scanCatalog,
  spectrumKeyOf,
} from "@/lib/domains/self-model/catalog";
import { getSelfPanel, getTraitCatalog, nextHypothesisCode } from "./queries";



type SelfEventKind =
  | "trait_granted"
  | "trait_faded"
  | "skill_up"
  | "skill_rust"
  | "feat_taken"
  | "title_earned"
  | "build_changed"
  | "hypothesis_refuted"
  | "tier_changed";

/**
 * 记一条事件。
 * dedupe_key 非空时靠唯一索引保证只记一次（称号、转职这种一次性的）；
 * 撞上重复直接吞掉 —— 事件流是旁路，永远不该因为它让主动作失败。
 */
async function recordEvent(
  userId: string,
  kind: SelfEventKind,
  title: string,
  detail?: string,
  dedupeKey?: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("self_events").insert({
    user_id: userId,
    kind,
    title,
    detail: detail ?? null,
    dedupe_key: dedupeKey ?? null,
  });
  if (error && error.code !== "23505") {
    console.error("self_events insert failed", error.message);
  }
}

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function required(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field}不能为空`);
  return trimmed;
}

/**
 * 按当前证据重算档位并落库。
 * 规则全部在 lib/domains/self-model/tiers.ts，这里只负责取数与写回。
 */
async function resyncTier(hypothesisId: string, userId: string) {
  const { data: hypothesis, error: hypothesisError } = await supabaseAdmin
    .from("self_hypotheses")
    .select("id, kind, tier")
    .eq("id", hypothesisId)
    .eq("user_id", userId)
    .maybeSingle();
  if (hypothesisError) throw new Error(hypothesisError.message);
  if (!hypothesis) throw new Error("假设不存在或无权访问");

  const [windowsResult, predictionsResult] = await Promise.all([
    supabaseAdmin
      .from("self_windows")
      .select("occurred_on, context_key, outcome, grade, cost_paid")
      .eq("hypothesis_id", hypothesisId),
    supabaseAdmin
      .from("predictions")
      .select("due_at, outcome, resolved_at")
      .eq("hypothesis_id", hypothesisId)
      .eq("source_type", "self"),
  ]);
  if (windowsResult.error) throw new Error(windowsResult.error.message);
  if (predictionsResult.error) throw new Error(predictionsResult.error.message);

  const windows = windowsResult.data ?? [];
  const evaluation = evaluateTier({
    kind: hypothesis.kind as SelfHypothesisKind,
    currentTier: hypothesis.tier,
    windows,
    predictions: predictionsResult.data ?? [],
    today: new Date().toISOString().slice(0, 10),
  });

  const lastEvidence = windows
    .map((w) => w.occurred_on as string)
    .sort()
    .at(-1);

  const { error } = await supabaseAdmin
    .from("self_hypotheses")
    .update({
      tier: evaluation.tier,
      last_evidence_on: lastEvidence ?? null,
    })
    .eq("id", hypothesisId);
  if (error) throw new Error(error.message);
}

export async function createSelfHypothesis(input: {
  statement: string;
  kind: SelfHypothesisKind;
  scopeNote?: string;
}): Promise<string> {
  const userId = await requireUserId();
  if (!SELF_HYPOTHESIS_KINDS.includes(input.kind)) {
    throw new Error("未知的假设类型");
  }
  const code = await nextHypothesisCode(userId);
  const { data, error } = await supabaseAdmin
    .from("self_hypotheses")
    .insert({
      user_id: userId,
      code,
      kind: input.kind,
      statement: required(input.statement, "假设"),
      scope_note: input.scopeNote?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/self");
  return data.id as string;
}

/**
 * 记录一个触发窗口。
 * outcome='miss'（符合条件但行为没发生）同样必须记 —— 它是分母。
 */
export async function logSelfWindow(input: {
  hypothesisId: string;
  situation: string;
  contextKey: string;
  outcome: "hit" | "miss";
  grade: WindowGrade;
  occurredOn?: string;
  costPaid?: string;
  thirdParty?: string;
  serendipity?: boolean;
}): Promise<void> {
  const userId = await requireUserId();
  if (!WINDOW_GRADES.includes(input.grade)) throw new Error("未知的证据等级");

  const { error } = await supabaseAdmin.from("self_windows").insert({
    user_id: userId,
    hypothesis_id: input.hypothesisId,
    situation: required(input.situation, "情境"),
    context_key: required(input.contextKey, "情境分类"),
    outcome: input.outcome,
    grade: input.grade,
    occurred_on: input.occurredOn || new Date().toISOString().slice(0, 10),
    cost_paid: input.costPaid?.trim() || null,
    third_party: input.thirdParty?.trim() || null,
    serendipity: input.serendipity ?? false,
  });
  if (error) throw new Error(error.message);

  await resyncTier(input.hypothesisId, userId);
  revalidatePath("/self");
}

/** 押注。到期日和把握度都在做出判断的当下写死，事后不可改。 */
export async function createSelfPrediction(input: {
  text: string;
  dueOn: string;
  confidence: number;
  hypothesisId?: string | null;
}): Promise<void> {
  const userId = await requireUserId();
  const confidence = Math.round(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    throw new Error("把握度要在 0–100 之间");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new Error("到期日格式不对");

  const { error } = await supabaseAdmin.from("predictions").insert({
    user_id: userId,
    source_type: "self",
    idea_id: null,
    period_id: null,
    hypothesis_id: input.hypothesisId || null,
    text: required(input.text, "预测"),
    due_at: `${input.dueOn}T23:59:59+09:00`,
    confidence,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/** 对账。这是唯一能推动档位上升的动作（E5）。 */
export async function resolveSelfPrediction(input: {
  id: string;
  outcome: "hit" | "miss";
  note?: string;
}): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("predictions")
    .update({
      outcome: input.outcome,
      resolved_at: new Date().toISOString(),
      note: input.note?.trim() || null,
    })
    .eq("id", input.id)
    .eq("user_id", userId)
    .eq("source_type", "self")
    .select("hypothesis_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("预测不存在或无权访问");

  if (data.hypothesis_id) {
    await resyncTier(data.hypothesis_id as string, userId);
  }
  revalidatePath("/self");
}

/** 推翻。记录保留，不删除 —— "我曾经这样看自己"是最有价值的时间序列。 */
export async function refuteSelfHypothesis(input: {
  id: string;
  reason: string;
}): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("self_hypotheses")
    .update({
      tier: "refuted",
      refuted_at: new Date().toISOString(),
      refuted_reason: required(input.reason, "推翻理由"),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await recordEvent(
    userId,
    "hypothesis_refuted",
    "推翻了一条自己写下的判断",
    input.reason
  );
  revalidatePath("/self");
}

/** 自述单独存放，永不进入推理。 */
export async function recordSelfDeclaration(text: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin.from("self_declarations").insert({
    user_id: userId,
    text: required(text, "自述"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/**
 * 记一条训练。刻意只要最少的字段：动作 + 重量 + 次数，或者时长。
 * 记录超过 20 秒就没人记了。
 */
export async function logBodyEntry(input: {
  kind: "lift" | "cardio";
  movement: string;
  weightKg?: number | null;
  reps?: number | null;
  sets?: number | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  loggedOn?: string;
}): Promise<void> {
  const userId = await requireUserId();
  const movement = required(input.movement, "动作");

  if (input.kind === "lift") {
    if (!input.weightKg || !input.reps) throw new Error("举铁要填重量和次数");
  } else if (!input.durationMin && !input.distanceKm) {
    throw new Error("有氧至少要填时长或距离");
  }

  const { error } = await supabaseAdmin.from("self_body_logs").insert({
    user_id: userId,
    kind: input.kind,
    movement,
    weight_kg: input.weightKg ?? null,
    reps: input.reps ?? null,
    sets: input.sets ?? null,
    distance_km: input.distanceKm ?? null,
    duration_min: input.durationMin ?? null,
    logged_on: input.loggedOn || new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/** 每天一个数字。同一天再记就覆盖，不留重复行。 */
export async function logSleep(hours: number): Promise<void> {
  const userId = await requireUserId();
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    throw new Error("睡眠时长要在 0–24 小时之间");
  }
  const { error } = await supabaseAdmin.from("self_daily").upsert(
    {
      user_id: userId,
      logged_on: new Date().toISOString().slice(0, 10),
      sleep_hours: hours,
    },
    { onConflict: "user_id,logged_on" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/**
 * 与他人的一次互动。
 * proposal 必须带结果 —— 只记"我提了"不记"有没有被采纳"，采纳率就没有分母。
 */
export async function logEncounter(input: {
  kind: "exposure" | "new_face" | "proposal";
  counterpart: string;
  detail?: string;
  outcome?: "accepted" | "rejected" | "pending";
}): Promise<void> {
  const userId = await requireUserId();
  if (input.kind === "proposal" && !input.outcome) {
    throw new Error("提议必须填结果，哪怕是「还没下文」");
  }
  const { error } = await supabaseAdmin.from("self_encounters").insert({
    user_id: userId,
    kind: input.kind,
    counterpart: required(input.counterpart, "对方"),
    detail: input.detail?.trim() || null,
    outcome: input.kind === "proposal" ? input.outcome : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/** 底牌快照。保留历史行，不覆盖 —— 跑道的变化曲线本身就是信息。 */
export async function logResources(input: {
  runwayMonths: number;
  allies: number;
  weeklyFreeHours: number;
  note?: string;
}): Promise<void> {
  const userId = await requireUserId();
  for (const [label, value] of [
    ["跑道", input.runwayMonths],
    ["能叫来的人", input.allies],
    ["每周自己的时间", input.weeklyFreeHours],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label}要是一个不小于 0 的数`);
    }
  }
  const { error } = await supabaseAdmin.from("self_resources").insert({
    user_id: userId,
    runway_months: input.runwayMonths,
    allies: Math.round(input.allies),
    weekly_free_hours: input.weeklyFreeHours,
    note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/**
 * 建一条特性。
 * 修正的 sub 必须是面板上真实存在的子属性 —— 挂到不存在的东西上，
 * 修正就永远不会被结算，等于写了一句没人看的形容词。
 */
export async function createSelfTrait(input: {
  name: string;
  spectrumKey: string;
  modifiers: { sub: string; sign: "plus" | "minus"; note: string }[];
  backfire?: string;
  equipNote?: string;
  setKey?: string;
  setEffect?: string;
  refusedOffer?: string;
  hypothesisId?: string | null;
}): Promise<void> {
  const userId = await requireUserId();
  const valid = new Set(
    buildPanel(EMPTY_PANEL_INPUT)
      .mains.flatMap((main) => main.subs)
      .map((sub) => sub.key)
  );
  const modifiers = input.modifiers.filter((item) => item.sub.trim().length > 0);
  if (modifiers.length === 0) throw new Error("至少要挂一条修正");
  for (const modifier of modifiers) {
    if (!valid.has(modifier.sub)) {
      throw new Error(`子属性 ${modifier.sub} 不存在`);
    }
  }

  const { error } = await supabaseAdmin.from("self_traits").insert({
    user_id: userId,
    name: required(input.name, "特性名"),
    spectrum_key: required(input.spectrumKey, "光谱"),
    modifiers,
    backfire: input.backfire?.trim() || null,
    equip_note: input.equipNote?.trim() || null,
    set_key: input.setKey?.trim() || null,
    set_effect: input.setEffect?.trim() || null,
    refused_offer: input.refusedOffer?.trim() || null,
    hypothesis_id: input.hypothesisId || null,
  });
  if (error) {
    // 唯一索引：同一根光谱上只能有一条持有中的特性。
    if (error.code === "23505") {
      throw new Error(
        `「${input.spectrumKey}」这根光谱上已经有一条特性了。同一根光谱只能占一个位置 —— 先让旧的褪色。`
      );
    }
    throw new Error(error.message);
  }
  revalidatePath("/self");
}

/** 褪色。不删除 —— 曾经持有过什么，本身就是记录。 */
export async function fadeSelfTrait(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("self_traits")
    .update({ status: "faded", faded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/**
 * 建卡：一次性给 45 项技能一个起始值。
 * 之后这些值只能靠打勾涨 —— 建卡是唯一一次可以直接写数字的机会，
 * 所以它只允许做一次。逐项过一遍那 45 个名字，这个过程本身就是一次自我认识。
 */
export async function createCharacter(
  entries: { key: string; value: number; passion: number }[]
): Promise<void> {
  const userId = await requireUserId();

  const { count, error: countError } = await supabaseAdmin
    .from("self_skills")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error("已经建过卡了。技能之后只能靠打勾涨，不能再直接改数字。");
  }

  const rows = entries.map((entry) => {
    if (!isSkillKey(entry.key)) throw new Error(`未知技能 ${entry.key}`);
    const value = Math.round(entry.value);
    const passion = Math.round(entry.passion);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error("技能值要在 0–100 之间");
    }
    if (![0, 1, 2].includes(passion)) throw new Error("激情只能是 0/1/2");
    return { user_id: userId, skill_key: entry.key, value, passion };
  });

  const { error } = await supabaseAdmin.from("self_skills").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/**
 * 打一个勾：这项技能实际用过，并且有结果。
 * note 必填 —— 说不出用在哪的勾，就是没用过。
 */
export async function tickSkill(input: {
  key: string;
  note: string;
  occurredOn?: string;
}): Promise<void> {
  const userId = await requireUserId();
  if (!isSkillKey(input.key)) throw new Error(`未知技能 ${input.key}`);

  const { error } = await supabaseAdmin.from("self_skill_ticks").insert({
    user_id: userId,
    skill_key: input.key,
    note: required(input.note, "用在哪"),
    occurred_on: input.occurredOn || new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/** 结算：把未结算的勾换成成长，并对久未使用的技能生锈。 */
export async function settleSkills(): Promise<string[]> {
  const userId = await requireUserId();
  const [stored, ticks] = await Promise.all([
    supabaseAdmin
      .from("self_skills")
      .select("id, skill_key, value, passion")
      .eq("user_id", userId),
    supabaseAdmin
      .from("self_skill_ticks")
      .select("id, skill_key, occurred_on, settled_at")
      .eq("user_id", userId),
  ]);
  if (stored.error) throw new Error(stored.error.message);
  if (ticks.error) throw new Error(ticks.error.message);

  const tickRows = (ticks.data ?? []) as {
    id: string;
    skill_key: string;
    occurred_on: string;
    settled_at: string | null;
  }[];
  const today = new Date().toISOString().slice(0, 10);
  const changes: string[] = [];

  for (const row of (stored.data ?? []) as {
    id: string;
    skill_key: string;
    value: number;
    passion: number;
  }[]) {
    const own = tickRows.filter((tick) => tick.skill_key === row.skill_key);
    const open = own.filter((tick) => tick.settled_at === null).length;
    const last = own.map((tick) => tick.occurred_on).sort().at(-1);
    const state = {
      key: row.skill_key,
      value: row.value,
      passion: row.passion,
      ticks: open,
      daysSinceTick: last
        ? Math.floor(
            (Date.parse(today) - Date.parse(last)) / 86_400_000
          )
        : null,
    };
    const valueByKey: Record<string, number> = Object.fromEntries(
      ((stored.data ?? []) as { skill_key: string; value: number }[]).map(
        (item) => [item.skill_key, item.value]
      )
    );
    const { ceiling } = skillCeiling(row.skill_key, valueByKey);
    const delta = growthFor(state, ceiling) + rustFor(state);
    if (delta === 0) continue;
    const next = Math.max(0, Math.min(100, row.value + delta));
    const { error } = await supabaseAdmin
      .from("self_skills")
      .update({ value: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    const name = SKILL_DEFS.find((def) => def.key === row.skill_key)?.name;
    changes.push(`${name ?? row.skill_key} ${row.value} → ${next}`);
    await recordEvent(
      userId,
      delta > 0 ? "skill_up" : "skill_rust",
      delta > 0
        ? `「${name ?? row.skill_key}」涨到 ${next}`
        : `「${name ?? row.skill_key}」生锈到 ${next}`,
      delta > 0 ? `打了 ${state.ticks} 个勾` : "久未使用"
    );
  }

  const openIds = tickRows
    .filter((tick) => tick.settled_at === null)
    .map((tick) => tick.id);
  if (openIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("self_skill_ticks")
      .update({ settled_at: new Date().toISOString() })
      .in("id", openIds);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/self");
  return changes;
}

/** 点一个专长。前置由 skills.ts 判定，这里只做最后一道校验。 */
export async function takeFeat(featKey: string): Promise<void> {
  const userId = await requireUserId();
  const def = FEAT_DEFS.find((item) => item.key === featKey);
  if (!def) throw new Error("未知专长");

  const [skills, feats] = await Promise.all([
    supabaseAdmin
      .from("self_skills")
      .select("skill_key, value")
      .eq("user_id", userId),
    supabaseAdmin.from("self_feats").select("feat_key").eq("user_id", userId),
  ]);
  if (skills.error) throw new Error(skills.error.message);
  if (feats.error) throw new Error(feats.error.message);

  const taken = ((feats.data ?? []) as { feat_key: string }[]).map(
    (row) => row.feat_key
  );
  const check = evaluateFeat(def, {
    skills: Object.fromEntries(
      ((skills.data ?? []) as { skill_key: string; value: number }[]).map(
        (row) => [row.skill_key, row.value]
      )
    ),
    // 特性与计数条件在页面上已经算过，这里只挡技能与前置专长；
    // 真正的授予门槛是数据库唯一索引 + 下面的专长点检查。
    traits: [],
    taken,
    settledForecasts: Number.MAX_SAFE_INTEGER,
    litDomains: Number.MAX_SAFE_INTEGER,
    featPointsLeft: 0,
  });
  if (check.missing.some((item) => !item.startsWith("需持有"))) {
    throw new Error(`前置没满足：${check.missing.join(" · ")}`);
  }

  const { error } = await supabaseAdmin
    .from("self_feats")
    .insert({ user_id: userId, feat_key: featKey });
  if (error) {
    if (error.code === "23505") throw new Error("这个专长已经点过了");
    throw new Error(error.message);
  }
  await recordEvent(
    userId,
    "feat_taken",
    `点上专长「${def.name}」`,
    def.effect,
    `feat:${featKey}`
  );
  revalidatePath("/self");
}

/**
 * 扫描特性库：该发的发，该撤的撤。
 * 纯规则驱动 —— 谁该拿到哪条特性，由 trait-library.ts 从面板数值算出来，
 * 这个函数只负责把结果落库。AI 不参与，用户也不能手动"给自己发一条库里的"。
 */
export async function syncLibraryTraits(): Promise<{
  granted: string[];
  faded: string[];
}> {
  const userId = await requireUserId();
  const [{ panel }, catalog] = await Promise.all([
    getSelfPanel(userId),
    getTraitCatalog(),
  ]);

  const { data, error } = await supabaseAdmin
    .from("self_traits")
    .select("id, spectrum_key, library_key")
    .eq("user_id", userId)
    .eq("status", "held");
  if (error) throw new Error(error.message);

  const held = ((data ?? []) as {
    id: string;
    spectrum_key: string;
    library_key: string | null;
  }[]).map((row) => ({
    id: row.id,
    libraryKey: row.library_key,
    spectrumKey: row.spectrum_key,
  }));

  const result = scanCatalog(panel, catalog, held);

  if (result.grant.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("self_traits")
      .insert(
        result.grant.map((entry) => ({
          user_id: userId,
          spectrum_key: spectrumKeyOf(entry),
          name: entry.name,
          modifiers: entry.modifiers,
          backfire: entry.backfire,
          equip_note: entry.alarm
            ? "⚠️ 报警型：集齐不是奖励，是提醒"
            : entry.equipNote,
          set_key: entry.setKey,
          source: "library",
          library_key: entry.key,
        }))
      );
    if (insertError) throw new Error(insertError.message);
    for (const entry of result.grant) {
      await recordEvent(
        userId,
        "trait_granted",
        `${entry.alarm ? "⚠️ " : ""}解锁「${entry.name}」`,
        entry.gloss
      );
    }
  }

  for (const item of result.fade) {
    const row = held.find((entry) => entry.libraryKey === item.key);
    if (!row) continue;
    const { error: fadeError } = await supabaseAdmin
      .from("self_traits")
      .update({ status: "faded", faded_at: new Date().toISOString() })
      .eq("id", row.id);
    if (fadeError) throw new Error(fadeError.message);
    await recordEvent(userId, "trait_faded", `「${item.name}」褪色`, item.reason);
  }

  revalidatePath("/self");
  return {
    granted: result.grant.map(
      (entry) => `${entry.alarm ? "⚠️ " : ""}${entry.name} —— ${entry.gloss}`
    ),
    faded: result.fade.map((item) => `${item.name}：${item.reason}`),
  };
}

/**
 * 点名：把这一周出现过的怪记一笔。
 * 一周只记一次（数据库唯一索引挡住），所以刷新页面不会把"出现周数"刷高。
 * 由客户端在页面挂载后调用一次 —— 渲染时写库会在每次预取时重复触发。
 */
export async function rollCallQuests(
  quests: { id: string; tier: "trash" | "elite" | "boss"; name: string }[]
): Promise<void> {
  if (quests.length === 0) return;
  const userId = await requireUserId();
  const weekKey = isoWeekKey(new Date());

  const { error } = await supabaseAdmin.from("self_quest_sightings").upsert(
    quests.map((quest) => ({
      user_id: userId,
      quest_id: quest.id,
      week_key: weekKey,
      tier: quest.tier,
      name: quest.name,
    })),
    { onConflict: "user_id,quest_id,week_key", ignoreDuplicates: true }
  );
  // 点名是旁路，失败不该影响任何事。
  if (error) console.error("quest roll call failed", error.message);
}

/**
 * 补录一条事迹。
 * class_key 必填 —— 进不了任何参照类的事迹，对基准率没有贡献，
 * 那它就只是回忆，不该占这张表。
 */
export async function recordDeed(input: {
  title: string;
  classKey: string;
  occurredOn: string;
  outcome: "done" | "abandoned" | "ongoing";
  domain?: "work" | "body" | "people" | "self";
  adopted?: boolean | null;
  durationDays?: number | null;
  whatHappened?: string;
  cost?: string;
}): Promise<void> {
  const userId = await requireUserId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    throw new Error("日期格式不对（补录旧事可以只填到月初）");
  }

  const { error } = await supabaseAdmin.from("self_deeds").insert({
    user_id: userId,
    title: required(input.title, "标题"),
    class_key: required(input.classKey, "参照类"),
    occurred_on: input.occurredOn,
    outcome: input.outcome,
    domain: input.domain ?? "work",
    adopted: input.adopted ?? null,
    duration_days: input.durationDays ?? null,
    what_happened: input.whatHappened?.trim() || null,
    cost: input.cost?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/**
 * 认领 / 取消一条气质。
 * 气质进 self_declarations —— 它没有分母，所以不进任何计算：
 * 不影响属性、不参与品级、不喂怪物清单。它唯一的去处是被翻译成
 * 一条可证伪的假设，然后走和别的特性一样的路。
 */
export async function claimDisposition(key: string): Promise<void> {
  const userId = await requireUserId();
  const def = findDisposition(key);
  if (!def) throw new Error("未知的气质");

  const { data } = await supabaseAdmin
    .from("self_declarations")
    .select("id")
    .eq("user_id", userId)
    .eq("text", `disposition:${key}`)
    .maybeSingle();

  if (data) {
    const { error } = await supabaseAdmin
      .from("self_declarations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("self_declarations").insert({
      user_id: userId,
      text: `disposition:${key}`,
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/self");
}

/** 把一条气质翻成可证伪的假设。翻完它就不再只是自述了。 */
export async function promoteDisposition(key: string): Promise<void> {
  const userId = await requireUserId();
  const def = findDisposition(key);
  if (!def) throw new Error("未知的气质");

  const code = await nextHypothesisCode(userId);
  const { error } = await supabaseAdmin.from("self_hypotheses").insert({
    user_id: userId,
    code,
    kind: "context_behavior",
    statement: `${def.claim}——${def.test}`,
    scope_note: `由气质「${def.name}」翻译而来`,
  });
  if (error) throw new Error(error.message);
  await recordEvent(
    userId,
    "tier_changed",
    `气质「${def.name}」立成了假设 ${code}`,
    def.test
  );
  revalidatePath("/self");
}

/**
 * 让 AI 提名几条你可能漏掉的气质。
 *
 * 这是整个 /self 里唯一一处 AI 参与的地方，能开这个口子是因为
 * 气质本来就没有分母 —— 它不进任何计算。属性、特性、档位、品级
 * 一律由代码算，AI 碰不到。
 *
 * 提名一律是候选：不写库，只返回给页面，你点了「认领」才算数。
 */
export async function suggestDispositions(): Promise<DispositionNomination[]> {
  const userId = await requireUserId();

  const { data, error } = await supabaseAdmin
    .from("self_declarations")
    .select("text")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as { text: string }[]).map((row) => row.text);
  const claimedKeys = rows
    .filter((text) => text.startsWith("disposition:"))
    .map((text) => text.replace("disposition:", ""));

  return nominateDispositions({
    claimed: claimedKeys
      .map((key) => findDisposition(key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({ name: item.name, claim: item.claim })),
    declarations: rows.filter((text) => !text.startsWith("disposition:")),
    existingNames: existingDispositionNames(),
  });
}

/**
 * 收下一条 AI 提名的气质。
 * 它进 self_declarations，和自己认领的走同一条路 ——
 * 来源是 AI 不改变它的性质：它仍然是一句没有分母的自述。
 */
export async function acceptNomination(input: {
  name: string;
  claim: string;
  test: string;
}): Promise<void> {
  const userId = await requireUserId();
  const name = required(input.name, "名字");
  const test = required(input.test, "怎么验");

  const { error } = await supabaseAdmin.from("self_declarations").insert({
    user_id: userId,
    text: `custom:${name}｜${input.claim.trim()}｜${test}`,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

/**
 * 点亮一个技能节点。
 *
 * proof 必填：写不出"什么时候、用它做成了什么"，这个节点就不该亮。
 * 这跟别处那条规矩是同一条 —— 看教程不算，读书不算，想明白了不算。
 */
export async function unlockSkillNode(input: {
  nodeKey: string;
  proof: string;
}): Promise<void> {
  const userId = await requireUserId();
  const proof = required(input.proof, "证据");

  const { data, error: readError } = await supabaseAdmin
    .from("self_skill_nodes")
    .select("node_key")
    .eq("user_id", userId);
  if (readError) throw new Error(readError.message);

  const unlockedKeys = new Set(
    ((data ?? []) as { node_key: string }[]).map((row) => row.node_key)
  );
  const check = canUnlock(input.nodeKey, unlockedKeys);
  if (!check.ok) throw new Error(check.reason ?? "现在还点不了");

  const node = ALL_NODES.find((item) => item.key === input.nodeKey)!;
  const { error } = await supabaseAdmin.from("self_skill_nodes").insert({
    user_id: userId,
    node_key: node.key,
    skill_key: node.skillKey,
    tier: node.tier,
    proof,
  });
  if (error) throw new Error(error.message);

  await recordEvent(
    userId,
    "skill_up",
    `点亮「${node.skillName} · ${node.name}」`,
    proof
  );
  revalidatePath("/self");
}


/**
 * 让 AI 拆开一项技能。**只提名，不写库。**
 *
 * 这一处放行 AI 的理由：用户说不出「要成为这个领域的专家，需要掌握哪些
 * 小技能」—— 那是他没有的知识量，正是模型该出力的地方。
 * 它给的是一张待办清单；哪一格亮、凭什么亮，仍然只由用户写下的 proof 决定。
 */
export async function proposeSkillStages(
  skillKey: string
): Promise<StageNomination[]> {
  const userId = await requireUserId();
  const def = SKILL_DEFS.find((item) => item.key === skillKey);
  if (!def) throw new Error("没有这项技能");

  // 拿他自己写下的自述当处境，让拆解落到他的行当里，而不是通用教科书。
  const { data } = await supabaseAdmin
    .from("self_declarations")
    .select("text")
    .eq("user_id", userId)
    .order("stated_on", { ascending: false })
    .limit(8);
  const context = ((data ?? []) as { text: string }[])
    .map((row) => row.text)
    .filter((text) => !text.startsWith("disposition:"))
    .join("；");

  return decomposeSkill({
    name: def.name,
    gloss: def.gloss,
    requires: (def.requires ?? [])
      .map((key) => SKILL_DEFS.find((item) => item.key === key)?.name ?? key)
      .filter(Boolean),
    context,
  });
}

/**
 * 收下一份拆解。四级必须齐 —— 收一半会让树卡在中间。
 *
 * 每个小技能在这里拿到一个稳定 id：以后改名、增删同级的小技能，
 * 已经点亮的证据不会跟着挪位。
 */
export async function acceptSkillStages(input: {
  skillKey: string;
  stages: { tier: number; standard: string; nodes: { name: string; test: string }[] }[];
}): Promise<void> {
  const userId = await requireUserId();
  const def = SKILL_DEFS.find((item) => item.key === input.skillKey);
  if (!def) throw new Error("没有这项技能");

  const tiers = new Set(input.stages.map((stage) => stage.tier));
  if (tiers.size !== 4) throw new Error("四级要齐：入门、基础、精通、专家");

  const rows = input.stages.map((stage) => {
    const nodes = stage.nodes
      .map((node) => ({
        name: node.name.trim(),
        test: node.test.trim(),
      }))
      .filter((node) => node.name && node.test);
    if (nodes.length === 0) {
      throw new Error(`第 ${stage.tier} 级一个小技能都没留下`);
    }
    return {
      user_id: userId,
      skill_key: input.skillKey,
      tier: stage.tier,
      stage_name: STAGE_NAMES[stage.tier - 1],
      standard: required(stage.standard, "这一级的标准"),
      nodes: nodes.map((node, index) => ({
        id: `n${stage.tier}${index + 1}`,
        ...node,
      })),
      source: "ai_nominated",
    };
  });

  const { error } = await supabaseAdmin
    .from("self_skill_stages")
    .upsert(rows, { onConflict: "user_id,skill_key,tier" });
  if (error) throw new Error(error.message);

  await recordEvent(
    userId,
    "skill_up",
    `拆开「${def.name}」`,
    `四级共 ${rows.reduce((sum, row) => sum + row.nodes.length, 0)} 个小技能`
  );
  revalidatePath("/self");
}

/** 拆得不对可以退回内置那份。已经点亮的节点不动 —— 证据不因换树而消失。 */
export async function resetSkillStages(skillKey: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("self_skill_stages")
    .delete()
    .eq("user_id", userId)
    .eq("skill_key", skillKey);
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}

const STAGE_NAMES = ["入门", "基础", "精通", "专家"];

/** 点错了可以熄掉。上层已经亮着的时候不许熄，否则树就断了。 */
export async function relockSkillNode(nodeKey: string): Promise<void> {
  const userId = await requireUserId();
  const node = ALL_NODES.find((item) => item.key === nodeKey);
  if (!node) throw new Error("没有这个节点");

  const { data } = await supabaseAdmin
    .from("self_skill_nodes")
    .select("node_key, skill_key, tier")
    .eq("user_id", userId);
  const rows = (data ?? []) as { skill_key: string; tier: number }[];
  const higher = rows.some(
    (row) => row.skill_key === node.skillKey && row.tier > node.tier
  );
  if (higher) throw new Error("上面还亮着，先熄掉上一档");

  const { error } = await supabaseAdmin
    .from("self_skill_nodes")
    .delete()
    .eq("user_id", userId)
    .eq("node_key", nodeKey);
  if (error) throw new Error(error.message);
  revalidatePath("/self");
}
