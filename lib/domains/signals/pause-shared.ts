/**
 * 停掉没人点的那几样（经用户同意，2026-11-16；迁移 127）：AI 先做好、要他点一下才往前走的几种东西，
 * 两周里谁都没点过，就先不做新的 —— 不再花 AI 的钱，也不再往一分钟清单里堆（11-16 那天清单写着「还有 104 件留到明天」）。
 * 数据题、政策题、市场题由程序或平台对账，不停：AI 照样记分，攒着能校准。
 * 刚开始做的头两周不停（还没给过机会）。点一次就恢复；也可以直接点「恢复」，再看两周。这里不碰数据库。
 */

export type PauseKind = "practice" | "business" | "arrival" | "door";

export const PAUSE_KINDS: PauseKind[] = ["practice", "business", "arrival", "door"];

export const PAUSE_LABELS: Record<PauseKind, string> = {
  practice: "练习的 AI 先判",
  business: "生意题",
  arrival: "到日本题",
  door: "假门先做好",
};

/** 练习停了时，网站上题目下面那一句。 */
export const PRACTICE_PAUSED_NOTE = "两周多没人写判断，AI 先判先停了。这道你自己判；写了一条，第二天起 AI 照旧先判。";

/** 多少天没人点就停。 */
export const IDLE_DAYS = 14;

/** firstMade：这一种第一次做出来的时候；lastTouch：最后一次有人点它；resumedAt：最后一次点「恢复」。 */
export type PauseFacts = { firstMade: string | null; lastTouch: string | null; resumedAt: string | null };

export type PauseState = { kind: PauseKind; paused: boolean; lastTouch: string | null };

const at = (s: string | null) => (s ? Date.parse(s) : NaN);

/** 做出来满两周、这两周里没人点过、也没点过「恢复」的，停。日子读不出来的一律不停。 */
export function isPausedNow(f: PauseFacts, now: number): boolean {
  const cutoff = now - IDLE_DAYS * 86_400_000;
  if (!(at(f.firstMade) <= cutoff)) return false;
  return ![f.lastTouch, f.resumedAt].some((s) => at(s) > cutoff);
}

/** 几个时间里最晚的那个（库里的和 JS 写的格式不一样，按时间比，不按字比）。 */
export function latestOf(xs: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const x of xs) if (x && Number.isFinite(Date.parse(x)) && (best === null || Date.parse(x) > Date.parse(best))) best = x;
  return best;
}

export function earliestOf(xs: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const x of xs) if (x && Number.isFinite(Date.parse(x)) && (best === null || Date.parse(x) < Date.parse(best))) best = x;
  return best;
}

/** 「10 月 28 日以后没点过」「一次也没点过」（日子按东京时间）。 */
export function lastTouchNote(lastTouch: string | null): string {
  const t = at(lastTouch);
  if (!Number.isFinite(t)) return "一次也没点过";
  const d = new Date(t + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日以后没点过`;
}

/** 邮件和清单页上那一句；没停的返回 null。 */
export function pausedSentence(states: PauseState[]): string | null {
  const paused = states.filter((s) => s.paused);
  if (paused.length === 0) return null;
  return `这几样两周多没人点，先停了、不出新的：${paused.map((s) => `${PAUSE_LABELS[s.kind]}（${lastTouchNote(s.lastTouch)}）`).join("、")}。`;
}
