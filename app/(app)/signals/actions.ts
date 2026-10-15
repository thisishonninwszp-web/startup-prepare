"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import { fetchDailyNews } from "@/lib/domains/signals/daily-news";
import { ensureSignalAnalysis, getSignalDetail, type StoredHistory } from "@/lib/domains/signals/analysis";
import { ensureSignalHistory } from "@/lib/domains/signals/history";
import { draftNodeBayes, expandInference, flagNode, rejudgeLayer, saveNodeBayes } from "@/lib/domains/signals/inference";
import type { BayesState, InferenceNode } from "@/lib/domains/signals/inference-shared";
import { generateBrief } from "@/lib/domains/signals/brief";
import { newsSourceLabel, type SignalKind } from "@/lib/domains/signals/feeds";
import { contactPerson } from "@/lib/domains/signals/format";
import { fetchGithubTools } from "@/lib/domains/signals/github";
import { findJapanGap } from "@/lib/domains/signals/gaps";
import { runGapRechecks, runGapScan } from "@/lib/domains/signals/gap-scan";
import { chooseLabVariant, runSelectionLab, type LabVariantKey } from "@/lib/domains/signals/lab";
import {
  answerDrill,
  flagDrill,
  generateDrills,
  markReasonMatch,
  setDrillMissReason,
  type AnsweredDrill,
  type DrillFlag,
} from "@/lib/domains/signals/drills";
import { analyzeGapTransfer, loadGapTransfers } from "@/lib/domains/signals/gap-transfer";
import {
  addIssuePublish,
  addIssueResponse,
  composeAndSaveIssue,
  describeResponse,
  loadOwnIssue,
  type Issue,
  type IssuePlatform,
  type ResponseSignal,
} from "@/lib/domains/signals/issue";
import { disablePublicRecord, enablePublicRecord } from "@/lib/domains/signals/public-record";
import { ensurePracticeBreakdown, saveBreakdownLeans, type Breakdown, type Lean } from "@/lib/domains/signals/breakdown";
import {
  recheckTransferCase,
  rejudgeTransferCases,
  researchTransferCases,
  setCaseOutcome,
  type AtlasOutcome,
  type RecheckResult,
} from "@/lib/domains/signals/atlas";
import type { GapTransfer } from "@/lib/domains/signals/gaps-shared";
import { generateDigest, generateDigestDetail } from "@/lib/domains/signals/digest";
import { generateWeekly } from "@/lib/domains/signals/weekly";
import { setFeedback, type FeedbackKind } from "@/lib/domains/signals/feedback";
import { sendDailyEmail } from "@/lib/domains/signals/notify";
import {
  addUserAnalog,
  addView,
  archiveQuestion,
  createQuestion,
  removeUserAnalog,
  researchQuestion,
  updateCriterion,
} from "@/lib/domains/signals/questions";
import { gapIdeaDraft, gapObservationText, transferKey, type GapSide } from "@/lib/domains/signals/gaps-shared";
import { createIdeaFromTheme } from "../ideas/actions";
import {
  checkOutcomeEvidence,
  resolveJudgment,
  retryJudgmentFeedback,
  submitJudgment,
  type ConfidenceKey,
  type HorizonKey,
  type MissReason,
} from "@/lib/domains/signals/practice";
import { createObservation } from "../capture/actions";
import { EXTERNAL_TAG } from "../ideas/types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function getPendingSignal(id: string) {
  const { data: row, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, status, source, title, url")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (row.status !== "pending") throw new Error("这条已经处理过了");
  return {
    title: (row.title as string | null) ?? "",
    source: newsSourceLabel(row.source as string),
    url: (row.url as string | null) ?? "",
  };
}

export async function refreshSignals(
  kind: SignalKind
): Promise<{ inserted: number; failed: string[] }> {
  await requireUserId();
  if (kind === "tools") {
    const { inserted } = await fetchGithubTools();
    revalidatePath("/signals");
    return { inserted, failed: [] };
  }
  const { inserted, failed } = await fetchDailyNews();
  revalidatePath("/signals");
  return { inserted, failed };
}

/**
 * 记一笔：新闻 + 你为什么在意 → 一条带"外部"标签的观察。
 * 走观察而不是材料箱，是为了让它和平时的观察一起进痛点雷达、进周复盘。
 * 你的那句话放最前面 —— 新闻本身不是信号，你对它的反应才是。
 */
export async function keepSignal(id: string, note: string): Promise<string> {
  await requireUserId();
  const signal = await getPendingSignal(id);

  const text = [
    note.trim(),
    `读到：${signal.title}（${signal.source}）`,
    signal.url,
  ]
    .filter(Boolean)
    .join("\n");

  const observation = await createObservation(text, [EXTERNAL_TAG]);

  const { error: updateError } = await supabaseAdmin
    .from("external_signals")
    .update({ status: "promoted", promoted_observation_id: observation.id })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/signals");
  revalidatePath("/capture");
  return observation.id;
}

/**
 * 「中国有、日本还没有」里的一条记成观察。内容从存下的报告里重新读，不信前端传来的文字。
 * 进观察而不是另开一套：它会跟平时的观察一起进痛点雷达、进周复盘。
 */
export async function recordJapanGapAction(signalId: string, note: string, side: GapSide = "japan"): Promise<string> {
  const userId = await requireUserId();
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const observation = await createObservation(gapObservationText(gap, note, side), [EXTERNAL_TAG]);
  revalidatePath("/signals/gaps");
  revalidatePath("/capture");
  return observation.id;
}

export async function dismissSignal(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabaseAdmin
    .from("external_signals")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  revalidatePath("/signals");
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AiGatewayError) return humanAiErrorMessage(error.code);
  return error instanceof Error ? error.message : fallback;
}

/** 详情页的深读：第一次生成并存下，之后直接读。 */
export async function analyzeSignal(
  id: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await ensureSignalAnalysis(userId, id);
    revalidatePath(`/signals/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "深读没生成出来") };
  }
}

/** 页面上手动生成今天的精选（cron 没跑、或者刚写了背景想马上看）。 */
export async function generateBriefNow(
  kind: SignalKind
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    let items = await generateBrief(userId, kind);
    if (items === null) {
      // 还没抓过这一类（比如刚加的源、或 cron 还没跑）：先抓一轮再挑
      if (kind === "tools") await fetchGithubTools();
      else await fetchDailyNews();
      items = await generateBrief(userId, kind);
    }
    revalidatePath("/signals");
    return { ok: true, count: items?.length ?? 0 };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "精选没生成出来") };
  }
}

// ── 读新闻练判断 ───────────────────────────────────────────────────────────

/** 先写判断：存进 predictions + signal_judgments，再让 AI 挑刺。 */
export async function submitJudgmentAction(input: {
  signalId?: string;
  questionId?: string;
  question: string;
  judgment: string;
  horizon: HorizonKey;
  confidence: ConfidenceKey | null;
  tags?: string[];
  milestone?: string;
  dueDate?: string;
  /** 拆解卡上对每个因素点的偏向（给挑刺看）。 */
  reasoning?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await submitJudgment({ userId, ...input });
    revalidatePath("/signals");
    if (input.signalId) revalidatePath(`/signals/${input.signalId}`);
    if (input.questionId) revalidatePath(`/signals/questions/${input.questionId}`);
    revalidatePath("/signals/practice");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "判断没存上") };
  }
}

/** 时差图谱：查一批、只存核实过的（三四十秒）。seed：从十件样例开始；more：再找几件。 */
export async function researchAtlasAction(
  mode: "seed" | "more"
): Promise<
  { ok: true; tried: number; kept: number; dropped: { thing: string; why: string }[]; corrected: number } | { ok: false; message: string }
> {
  const userId = await requireUserId();
  try {
    const result = await researchTransferCases(userId, mode === "seed" ? "seed" : "more");
    revalidatePath("/signals/atlas");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没查成") };
  }
}

/** 时差图谱：已经收进来、还没请裁判看过的，请裁判再看一遍。 */
export async function rejudgeAtlasAction(): Promise<
  { ok: true; judged: number; failed: number; unavailable: number; left: number; error: string | null } | { ok: false; message: string }
> {
  const userId = await requireUserId();
  try {
    const result = await rejudgeTransferCases(userId);
    revalidatePath("/signals/atlas");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没判成") };
  }
}

/** 时差图谱：补查一件（专门找日本最早的同类、补裁判没认的那几样，三四十秒）。 */
export async function recheckAtlasCaseAction(id: string): Promise<({ ok: true } & RecheckResult) | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const result = await recheckTransferCase(userId, id);
    revalidatePath("/signals/atlas");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没补查成") };
  }
}

/** 时差图谱：他手动改一件的"在日本的结果"。 */
export async function setCaseOutcomeAction(id: string, outcome: AtlasOutcome): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await setCaseOutcome(userId, id, outcome);
    revalidatePath("/signals/atlas");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没改成") };
  }
}

/** 每日练习：先拆一拆（拆过就直接返回，没拆现在拆，二三十秒）。 */
export async function ensureBreakdownAction(date: string): Promise<{ ok: true; breakdown: Breakdown } | { ok: false; message: string }> {
  const userId = await requireUserId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "日期不对" };
  try {
    return { ok: true, breakdown: await ensurePracticeBreakdown(userId, date) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没拆出来") };
  }
}

/** 每日练习：记下他对每个因素点的偏向。 */
export async function saveBreakdownLeansAction(date: string, leans: (Lean | null)[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await saveBreakdownLeans(userId, date, leans);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/** 到期对账：看对了 / 看错了，可以补一句为什么。 */
export async function resolveJudgmentAction(
  predictionId: string,
  outcome: "hit" | "miss",
  note: string,
  missReason?: MissReason
): Promise<void> {
  const userId = await requireUserId();
  await resolveJudgment(userId, predictionId, outcome, note, missReason);
  revalidatePath("/signals");
  revalidatePath("/signals/practice");
}

export async function retryJudgmentFeedbackAction(
  judgmentId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await retryJudgmentFeedback(userId, judgmentId);
    revalidatePath("/signals");
    revalidatePath("/signals/practice");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "挑刺没生成出来") };
  }
}

// ── 历史上类似的事 ─────────────────────────────────────────────────────────

/** 第一次点开时生成并存下，之后直接读。写判断之前就能看。 */
export async function ensureHistoryAction(
  signalId: string
): Promise<{ ok: true; history: StoredHistory } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, history: await ensureSignalHistory(signalId) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "历史参照没生成出来") };
  }
}

// ── 往下推 ─────────────────────────────────────────────────────────────────

/** 推某一步的下一层（parentId 为 null 时推第一层）。给了 direction 就按方向另推一组。 */
export async function expandInferenceAction(
  signalId: string,
  parentId: string | null,
  direction?: string
): Promise<{ ok: true; nodes: InferenceNode[] } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, nodes: await expandInference(signalId, parentId, direction) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没推出来") };
  }
}

/** 贝叶斯草稿：AI 只给粗档，返回给页面让用户改，不落库。 */
export async function draftBayesAction(
  signalId: string,
  nodeId: string
): Promise<{ ok: true; state: BayesState } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, state: await draftNodeBayes(signalId, nodeId) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "草稿没起出来") };
  }
}

export async function saveBayesAction(
  signalId: string,
  nodeId: string,
  state: BayesState
): Promise<{ ok: true; nodes: InferenceNode[] } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, nodes: await saveNodeBayes(signalId, nodeId, state) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没存上") };
  }
}

// ── 能找谁聊 → 触达规划画布 ────────────────────────────────────────────────

/**
 * 把具体报告里的"能找谁聊"记成一张触达规划画布：人和要问的那句话填好，
 * 剩下的（在哪儿找到他、什么时候、怎么开口）去画布上想，AI 在那边当挑战者。
 * 同一条新闻同一个人只建一张，重复点直接回到那张。
 */
export async function createContactPlanAction(
  signalId: string
): Promise<{ ok: true; canvasId: string } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const detail = await getSignalDetail(signalId);
    if (!detail || detail === "missing-schema") throw new Error("这条已经不在了");
    if (detail.analysis?.kind !== "news") throw new Error("这条还没有具体报告，先打开它让报告生成出来");
    const { who, question } = detail.analysis;
    const title = `找${contactPerson(who)}聊`;
    const scenario = `读到：${detail.title}${detail.url ? `\n${detail.url}` : ""}`;

    const { data: existing, error: findError } = await supabaseAdmin
      .from("outreach_canvases")
      .select("id")
      .eq("user_id", userId)
      .eq("title", title)
      .eq("scenario", scenario)
      .limit(1)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing) return { ok: true, canvasId: existing.id as string };

    const { data, error } = await supabaseAdmin
      .from("outreach_canvases")
      .insert({
        user_id: userId,
        title,
        use_case: "other",
        scenario,
        person_notes: who,
        message_draft: question,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/outreach");
    return { ok: true, canvasId: data.id as string };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没建上") };
  }
}

// ── 问题驱动 ────────────────────────────────────────────────────────────────

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export async function createQuestionAction(question: string, criterion: string): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  try {
    const id = await createQuestion(userId, question, criterion);
    revalidatePath("/signals/questions");
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "问题没存上") };
  }
}

export async function updateCriterionAction(questionId: string, criterion: string): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await updateCriterion(userId, questionId, criterion);
    revalidatePath(`/signals/questions/${questionId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没存上") };
  }
}

export async function addViewAction(questionId: string, view: string, reason: string): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await addView(userId, questionId, view, reason);
    revalidatePath(`/signals/questions/${questionId}`);
    revalidatePath("/signals/questions");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "看法没存上") };
  }
}

/** 查一轮：拆小问题、分头上网查、列关键因素、附历史参照。要花半分钟左右。 */
export async function researchQuestionAction(questionId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await researchQuestion(userId, questionId);
    revalidatePath(`/signals/questions/${questionId}`);
    revalidatePath("/signals/questions");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这一轮没查成") };
  }
}

export async function archiveQuestionAction(questionId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await archiveQuestion(userId, questionId);
    revalidatePath("/signals/questions");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没收起来") };
  }
}

/** 自己想到的类比：AI 展开、上网核实，挂在这个问题上。 */
export async function addUserAnalogAction(questionId: string, text: string): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await addUserAnalog(userId, questionId, text);
    revalidatePath(`/signals/questions/${questionId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这条类比没加上") };
  }
}

export async function removeUserAnalogAction(questionId: string, index: number): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await removeUserAnalog(userId, questionId, index);
    revalidatePath(`/signals/questions/${questionId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没删掉") };
  }
}

/** 请裁判重判某一层里 AI 自评的那几步。 */
export async function rejudgeLayerAction(
  signalId: string,
  parentId: string | null
): Promise<{ ok: true; nodes: InferenceNode[] } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, nodes: await rejudgeLayer(signalId, parentId) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没重判成") };
  }
}

/** 现在就把今天的报告发一封到邮箱，试试配好了没有。 */
export async function sendTestEmailAction(): Promise<{ ok: true; to: string } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const outcome = await sendDailyEmail(userId);
    return outcome.sent ? { ok: true, to: outcome.to } : { ok: false, message: outcome.reason };
  } catch (error) {
    return { ok: false, message: `没发出去：${errorMessage(error, "不知道为什么")}。多半是应用专用密码不对。` };
  }
}

/** "这是车轱辘"：他标出裁判漏掉的车轱辘话（或取消标记）。 */
export async function flagNodeAction(
  signalId: string,
  nodeId: string,
  circular: boolean
): Promise<{ ok: true; nodes: InferenceNode[] } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, nodes: await flagNode(signalId, nodeId, circular) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没标上") };
  }
}

/** 今日总览：还没生成就现在生成（报告页第一次打开时自动调）。 */
export async function generateDigestAction(date: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await generateDigest(userId, date);
    revalidatePath("/signals");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "总览没写出来") };
  }
}

/** 中日差距清单里的一条，变成想法模块里的一个想法（状态"观察"，预填有依据的两格）。返回想法 id。 */
export async function gapToIdeaAction(
  signalId: string,
  side: GapSide = "japan"
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const [gap, transfers] = await Promise.all([findJapanGap(userId, signalId, side), loadGapTransfers(userId)]);
    if (!gap) throw new Error("清单里找不到这一条了");
    const draft = gapIdeaDraft(gap, side, transfers.get(transferKey(side, signalId)));
    const idea = await createIdeaFromTheme(draft.title, draft.hypothesis, draft.tags);
    revalidatePath("/ideas");
    return { ok: true, id: idea.id };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没变成想法") };
  }
}

/** 周刊：按他挑的几条和写的判断，生成四个版本的稿子（二三十秒）。 */
export async function composeIssueAction(input: {
  picks: { side: GapSide; signal_id: string; stance: unknown; note: string }[];
  betIds: string[];
  opening: string;
}): Promise<{ ok: true; issue: Issue } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const issue = await composeAndSaveIssue(userId, input);
    revalidatePath("/signals/issue");
    return { ok: true, issue };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "稿子没写出来") };
  }
}

/** 周刊：记一笔发在了哪（第一次记时，押了会 / 不会的几条押进判断账本，返回押了几条）。 */
export async function addIssuePublishAction(
  issueId: string,
  platform: IssuePlatform,
  url: string
): Promise<{ ok: true; issue: Issue; bets: number } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const result = await addIssuePublish(userId, issueId, platform, url);
    revalidatePath("/signals/practice");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/**
 * 周刊：记一条读者回应。正文记成带「读者回应」标签的观察（材料还是从一个口子进）；
 * 说想要的加「有痛」、问哪里买的加「愿付钱」、想聊的加「想聊」。回应的是第几篇也记下 —— 每篇笔记就是那一条的需求测试。
 */
export async function addIssueResponseAction(
  issueId: string,
  text: string,
  wantsTalk: boolean,
  pick?: number,
  signal?: ResponseSignal
): Promise<{ ok: true; issue: Issue } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const body = text.trim();
    if (body.length < 2) throw new Error("把读者说的话贴进来");
    const issue = await loadOwnIssue(userId, issueId);
    const { where, tags } = describeResponse(issue, pick, signal);
    const observation = await createObservation(`读者回应（${where}）：${body}`, [
      EXTERNAL_TAG,
      "读者回应",
      ...tags,
      ...(wantsTalk ? ["想聊"] : []),
    ]);
    revalidatePath("/capture");
    revalidatePath("/signals/gaps");
    return { ok: true, issue: await addIssueResponse(userId, issueId, observation.id, wantsTalk, pick, signal) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/** 公开对账页：打开（返回口令）/ 关掉（旧链接立刻失效）。 */
export async function setPublicRecordAction(on: boolean): Promise<{ ok: true; token: string | null } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    if (on) return { ok: true, token: await enablePublicRecord(userId) };
    await disablePublicRecord(userId);
    return { ok: true, token: null };
  } catch (error) {
    return { ok: false, message: errorMessage(error, on ? "没打开" : "没关掉") };
  }
}

/** 差距清单里的一条：能不能搬过来（二三十秒）。 */
export async function analyzeGapTransferAction(
  signalId: string,
  side: GapSide
): Promise<{ ok: true; analysis: GapTransfer } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    return { ok: true, analysis: await analyzeGapTransfer(userId, signalId, side) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没查成") };
  }
}

/** 历史题：出一批、核实、存下核实到出处的（三四十秒）。 */
export async function generateDrillsAction(): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const count = await generateDrills(userId);
    revalidatePath("/signals/drill");
    return { ok: true, count };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没出成题") };
  }
}

/** 历史题：这题出得不好，跳过。 */
export async function flagDrillAction(id: string, flag: DrillFlag): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await flagDrill(userId, id, flag);
    revalidatePath("/signals/drill");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没跳过去") };
  }
}

/** 历史题：揭晓后标"我当时的理由对上了没有"，返回裁判独立判的看法（只提名）。 */
export async function markReasonMatchAction(
  id: string,
  match: boolean
): Promise<{ ok: true; judge: boolean | null } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const judge = await markReasonMatch(userId, id, match);
    revalidatePath("/signals/drill");
    return { ok: true, judge };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/** 历史题：猜错时选"错在哪一步"。 */
export async function setDrillMissReasonAction(id: string, reason: MissReason): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await setDrillMissReason(userId, id, reason);
    revalidatePath("/signals/drill");
    revalidatePath("/signals/practice");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/** 历史题：答一道，马上揭晓。 */
export async function answerDrillAction(
  id: string,
  guess: boolean,
  confidence: ConfidenceKey | null,
  reasoning: string
): Promise<{ ok: true; drill: AnsweredDrill } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const drill = await answerDrill(userId, id, guess, confidence, reasoning);
    return { ok: true, drill };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/** 挑法盲测：拿今天的候选，几种挑法各挑一遍（三四十秒）。 */
export async function runSelectionLabAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await runSelectionLab(userId);
    revalidatePath("/signals/lab");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没测成") };
  }
}

/** 挑法盲测：他选了哪一组。 */
export async function chooseLabVariantAction(runId: string, key: LabVariantKey): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await chooseLabVariant(userId, runId, key);
    revalidatePath("/signals/lab");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/** 到期的判断：对账之前先上网查现在实际怎样了。 */
export async function checkOutcomeEvidenceAction(judgmentId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await checkOutcomeEvidence(userId, judgmentId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没查成") };
  }
}

/** 差距清单：今天专门扫一轮中文、美国的消息（清单页第一次打开时自动调）。 */
export async function runGapScanAction(): Promise<{ ok: true; picked: number; gaps: number } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const result = await runGapScan(userId);
    revalidatePath("/signals/gaps");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "今天没扫成") };
  }
}

/** 差距清单：进清单满一个月的，重查"这边现在有没有"。 */
export async function runGapRechecksAction(): Promise<{ ok: true; rechecked: number; arrived: number } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const result = await runGapRechecks(userId);
    revalidatePath("/signals/gaps");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "这次没重查成") };
  }
}

/** 这一节今天有没有用。 */
export async function setFeedbackAction(
  date: string,
  kind: string,
  useful: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  if (!["news", "calendar", "voices", "money", "tools"].includes(kind)) return { ok: false, message: "不认识这一节" };
  try {
    await setFeedback(userId, date, kind as FeedbackKind, useful);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

/** 生成（或重新生成）某一周的周报。 */
export async function generateWeeklyAction(weekStart: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { ok: false, message: "日期不对" };
  try {
    const weekly = await generateWeekly(userId, weekStart);
    if (!weekly) return { ok: false, message: "那一周有报告的日子不到两天，连不起来" };
    revalidatePath("/signals/week");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "周报没写出来") };
  }
}

/** 写今天的详细报告（点了才写，二三十秒）。 */
export async function generateDigestDetailAction(date: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await generateDigestDetail(userId, date);
    revalidatePath("/signals");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "详细报告没写出来") };
  }
}
