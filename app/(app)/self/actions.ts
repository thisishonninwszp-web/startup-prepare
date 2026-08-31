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
  isSkillKey,
  rustFor,
} from "@/lib/domains/self-model/skills";
import {
  comboSpectrumKey,
  scanLibrary,
} from "@/lib/domains/self-model/trait-library";
import { getSelfPanel, nextHypothesisCode } from "./queries";



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
    const delta = growthFor(state) + rustFor(state);
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
  const { panel } = await getSelfPanel(userId);

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

  const result = scanLibrary(panel, held);

  if (result.grant.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("self_traits")
      .insert(
        result.grant.map((def) => ({
          user_id: userId,
          spectrum_key: def.spectrumKey,
          name: def.name,
          modifiers: def.modifiers,
          backfire: def.backfire ?? null,
          equip_note: def.equipNote ?? null,
          source: "library",
          library_key: def.key,
        }))
      );
    if (insertError) throw new Error(insertError.message);
    for (const def of result.grant) {
      await recordEvent(userId, "trait_granted", `解锁「${def.name}」`, def.gloss);
    }
  }

  if (result.combos.length > 0) {
    const { error: comboError } = await supabaseAdmin
      .from("self_traits")
      .insert(
        result.combos.map((combo) => ({
          user_id: userId,
          spectrum_key: comboSpectrumKey(combo),
          name: combo.name,
          modifiers: combo.modifiers,
          backfire: combo.backfire ?? null,
          equip_note: combo.alarm ? "⚠️ 报警型：集齐不是奖励，是提醒" : null,
          source: "library",
          library_key: combo.key,
        }))
      );
    if (comboError) throw new Error(comboError.message);
    for (const combo of result.combos) {
      await recordEvent(
        userId,
        "trait_granted",
        `${combo.alarm ? "⚠️ " : ""}解锁组合「${combo.name}」`,
        combo.gloss
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
    granted: [
      ...result.grant.map((def) => `${def.name} —— ${def.gloss}`),
      ...result.combos.map(
        (combo) => `${combo.alarm ? "⚠️ " : ""}${combo.name} —— ${combo.gloss}`
      ),
    ],
    faded: result.fade.map((item) => `${item.name}：${item.reason}`),
  };
}
