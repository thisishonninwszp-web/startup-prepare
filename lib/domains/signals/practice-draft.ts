import { practiceHorizon, questionDeadline } from "@/lib/ai";
import { getSignalDetail } from "./analysis";
import type { BriefPracticeRow } from "./brief";
import { ensurePracticeBreakdown, loadBriefPractice, patchBriefPractice, type Breakdown } from "./breakdown";
import { forecastViews, medianProbability } from "./forecast";
import { HORIZONS, isBlindPracticeDate, type HorizonKey, type PracticeDraft } from "./practice-shared";

/**
 * 每天练习题的 AI 先判（经用户明确裁决，2026-10-23）：和预测题同一套 —— 三种思路各搜各的、各说几成，
 * 至少两个说成了由代码取中间值；那一句（会 / 不会 + 题目）由代码拼（practice-shared.ts 的 draftVerdict）。
 * 存在那一天报告的 practice.ai_draft（不加表），后台 7:30 出（jobs 的 practice 一步），没出的第一次打开「今天」时补。
 * 周一的练习是先判题，不出。出不来返回 null，页面退回先判。
 */
export async function ensurePracticeDraft(userId: string, date: string): Promise<PracticeDraft | null> {
  if (isBlindPracticeDate(date)) return null;
  const practice = await loadBriefPractice(userId, date);
  if (practice.ai_draft) return practice.ai_draft;

  const detail = await getSignalDetail(practice.signal_id).catch(() => null);
  const usable = detail && detail !== "missing-schema" ? detail : null;
  const deadline = questionDeadline(practice.question, date);
  const horizon: HorizonKey =
    practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, date);
  const resolveOn = deadline
    ? deadline.toISOString().slice(0, 10)
    : new Date(Date.parse(`${date}T00:00:00Z`) + HORIZONS[horizon].days * 86_400_000).toISOString().slice(0, 10);

  // 三种思路各搜各的（和预测题同一套，见 forecastViews）
  const views = await forecastViews(
    { title: practice.question, criteria: practice.check_how, resolveOn, today: date, context: usable ? [usable.title, usable.summary].filter(Boolean).join("。") : "" },
    practice.question
  );
  const perspectives = views.map((v) => ({ source: v.source as PracticeDraft["perspectives"][number]["source"], probability: v.probability, reason: v.reason }));
  if (perspectives.length < 2) return null;
  const probability = medianProbability(perspectives.map((x) => x.probability));
  if (probability === null) return null;
  const draft: PracticeDraft = { probability, perspectives, made_at: new Date().toISOString() };
  await patchBriefPractice(userId, date, { ai_draft: draft });
  return draft;
}

/**
 * 今天的练习两样一起备好（2026-10-24）：AI 先判、拆解卡（「从这几样想起」，周一的先判题也拆 —— 拆解卡不带方向）。
 * 两样并排出，写的是同一格 practice：前后脚写偶尔会冲掉一样，所以都好了以后再看一眼，缺的补写回去。
 */
export async function preparePractice(userId: string, date: string): Promise<{ draft: PracticeDraft | null; breakdown: Breakdown | null; errors: string[] }> {
  const [draft, breakdown] = await Promise.allSettled([ensurePracticeDraft(userId, date), ensurePracticeBreakdown(userId, date)]);
  const errors = [draft, breakdown].flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
  const fresh = await loadBriefPractice(userId, date).catch(() => null);
  if (fresh) {
    const patch: Partial<BriefPracticeRow> = {};
    if (draft.status === "fulfilled" && draft.value && !fresh.ai_draft) patch.ai_draft = draft.value;
    if (breakdown.status === "fulfilled" && !fresh.breakdown) patch.breakdown = breakdown.value;
    if (Object.keys(patch).length > 0) await patchBriefPractice(userId, date, patch);
  }
  return { draft: draft.status === "fulfilled" ? draft.value : null, breakdown: breakdown.status === "fulfilled" ? breakdown.value : null, errors };
}
