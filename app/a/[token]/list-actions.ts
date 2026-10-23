"use server";

import { actionSecret, verifyAction } from "@/lib/action-links";
import { practiceHorizon, questionDeadline } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { loadBriefPractice } from "@/lib/domains/signals/breakdown";
import { confirmResolution, loadForecastBoard, MODE_LABELS, pct, revealQuestion, setMyForecast } from "@/lib/domains/signals/forecast";
import { resolveJudgment, submitJudgment } from "@/lib/domains/signals/practice";
import { HORIZONS, MISS_REASONS, type HorizonKey, type MissReason } from "@/lib/domains/signals/practice-shared";
import { recallReveal, rateRecall, type RecallReveal } from "@/lib/domains/signals/recall";
import { RECALL_LABELS, type RecallResult } from "@/lib/domains/signals/recall-shared";
import { saveExperimentForecast } from "@/lib/domains/signals/experiments";
import type { ExperimentKind } from "@/lib/domains/signals/experiments-shared";
import { sharedViewFor } from "@/lib/domains/signals/users";

/**
 * 一分钟清单那一页的按钮（不用登录，口令认人）：每个都先验口令（种类 list），做的是口令里那个账号的事。
 * 归属和"还能不能点"由下面调的现成函数查（预测题查那一池和状态、到期确认只认出题的主账号、对账只改他自己 pending 的、
 * 实验先猜只认现成的提案）；另外两处在这里补：回想要先有这一条、练习只认那一天主账号报告里的那道题（期限服务器算）。
 */

type Result = { ok: true; message: string } | { ok: false; message: string };

function who(token: string): { u: string; day: string } {
  const secret = actionSecret();
  const p = secret ? verifyAction(token, secret) : null;
  if (!p || p.k !== "list") throw new Error("链接过期了或者不对：回网站上做吧");
  return { u: p.u, day: p.t };
}

function fail(error: unknown, fallback: string): { ok: false; message: string } {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

/** 预测题：「行」（agree）或点的那一档；改判可以带一句为什么。记上以后给出市场的数和统计基准（和预测页一样，点完才给看）。 */
export async function listForecastAction(token: string, questionId: string, choice: number | "agree", note = ""): Promise<Result> {
  try {
    const { u } = who(token);
    const r = await setMyForecast(u, questionId, choice === "agree" ? "agree" : Number(choice), tokyoToday(), String(note ?? ""));
    const board = await loadForecastBoard(u);
    const of = (s: string) => (board === "missing-schema" ? undefined : board.forecasts.find((f) => f.question_id === questionId && f.source === s));
    const market = of("market");
    const base = of("base");
    return {
      ok: true,
      message: [`记上了：你 ${pct(r.probability)}（${MODE_LABELS[r.mode]}）`, market && `市场 ${pct(market.probability)}`, base && `统计基准 ${pct(base.probability)}`]
        .filter(Boolean)
        .join(" · "),
    };
  } catch (error) {
    return fail(error, "没记上");
  }
}

export async function listSkipForecastAction(token: string, questionId: string): Promise<Result> {
  try {
    const { u } = who(token);
    await revealQuestion(u, questionId);
    return { ok: true, message: "跳过了。" };
  } catch (error) {
    return fail(error, "没跳过");
  }
}

/** 练习：agree / override（AI 先判的日子）、blind（周一自己写）。题目和期限都按那一天主账号报告里的算，不信浏览器。 */
export async function listPracticeAction(token: string, mode: "agree" | "override" | "blind", judgment = ""): Promise<Result> {
  try {
    const { u, day } = who(token);
    if (!["agree", "override", "blind"].includes(mode)) throw new Error("链接不对");
    const { sourceUserId } = await sharedViewFor(u);
    const practice = await loadBriefPractice(sourceUserId, day);
    const deadline = questionDeadline(practice.question, day);
    const horizon: HorizonKey =
      practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, day);
    await submitJudgment({
      userId: u,
      signalId: practice.signal_id,
      question: practice.question,
      judgment: mode === "agree" ? "" : String(judgment ?? ""),
      horizon,
      confidence: null,
      dueDate: deadline ? deadline.toISOString().slice(0, 10) : undefined,
      draft: mode === "blind" ? undefined : { date: day, mode },
    });
    return { ok: true, message: mode === "agree" ? "记上了：你同意 AI 的判断。" : "记上了。AI 的挑刺在网站的判断账本里。" };
  } catch (error) {
    return fail(error, "没记上");
  }
}

/** 生意题、到日本题到期：按程序的建议、反过来、或作废（只有出题的主账号能点，confirmResolution 会查）。 */
export async function listConfirmAction(token: string, questionId: string, verdict: "yes" | "no" | "void"): Promise<Result> {
  try {
    const { u } = who(token);
    if (!["yes", "no", "void"].includes(verdict)) throw new Error("链接不对");
    await confirmResolution(u, questionId, verdict);
    return { ok: true, message: verdict === "void" ? "作废了，不算分。" : verdict === "yes" ? "对上账了：会（发生了）。" : "对上账了：不会（没发生）。" };
  } catch (error) {
    return fail(error, "没记上");
  }
}

/** 到期的判断：看对了 / 看错了（看错可以带错在哪一步）。 */
export async function listResolveAction(token: string, predictionId: string, outcome: "hit" | "miss", missReason?: MissReason): Promise<Result> {
  try {
    const { u } = who(token);
    if (outcome !== "hit" && outcome !== "miss") throw new Error("链接不对");
    await resolveJudgment(u, predictionId, outcome, "", missReason && missReason in MISS_REASONS ? missReason : undefined);
    return { ok: true, message: outcome === "hit" ? "记上了：看对了。" : `记上了：看错了${missReason && missReason in MISS_REASONS ? `（${MISS_REASONS[missReason].split("：")[0]}）` : ""}。` };
  } catch (error) {
    return fail(error, "没记上");
  }
}

/** 回想：先查这个账号确实有这一条（rateRecall 会给任意一条新建一行）。 */
async function ownRecall(u: string, signalId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from("recall_reviews").select("signal_id").eq("user_id", u).eq("signal_id", signalId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("这一条不在你的回想里");
}

export async function listRecallRevealAction(token: string, signalId: string): Promise<{ ok: true; reveal: RecallReveal } | { ok: false; message: string }> {
  try {
    const { u } = who(token);
    await ownRecall(u, signalId);
    return { ok: true, reveal: await recallReveal(u, signalId) };
  } catch (error) {
    return fail(error, "没取到");
  }
}

export async function listRecallRateAction(token: string, signalId: string, result: RecallResult): Promise<Result> {
  try {
    const { u } = who(token);
    if (!(result in RECALL_LABELS)) throw new Error("链接不对");
    await ownRecall(u, signalId);
    const next = await rateRecall(u, signalId, result, tokyoToday());
    return { ok: true, message: `记上了：${RECALL_LABELS[result]}。${next} 再问你一次。` };
  } catch (error) {
    return fail(error, "没记上");
  }
}

/** 自己的实验先猜：saveExperimentForecast 只认现成的提案。 */
export async function listExperimentAction(token: string, pick: { kind: ExperimentKind; targetId: string; platform: string }, probability: number): Promise<Result> {
  try {
    const { u } = who(token);
    await saveExperimentForecast(u, tokyoToday(), pick, Number(probability));
    return { ok: true, message: `记上了：你 ${pct(Number(probability))}。` };
  } catch (error) {
    return fail(error, "没记上");
  }
}
