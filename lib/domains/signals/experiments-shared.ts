import { binPoints, meanBrier, SCORE_MIN, type Bin } from "./calibration-shared";
import type { IssueMetric, IssuePublish } from "./issue-shared";

/**
 * 先猜自己实验的结果（迁移 095；原则 1 例外四的延伸）—— 不碰数据库的部分。
 * 题目和门槛由代码出，他只点几成；只数次数，不算转化率；不挂到想法上。
 */

export type ExperimentKind = "door_signups" | "door_views" | "issue_views";

/** 假门猜多少天、周刊猜发出去多少天。 */
export const DOOR_DAYS = 14;
export const ISSUE_DAYS = 7;
/** 发出去多少天以内还能猜（再晚他多半已经看到数了）。 */
export const ISSUE_GUESS_WITHIN_DAYS = 2;
/** 没有历史时的门槛。 */
export const DEFAULT_THRESHOLD: Record<ExperimentKind, number> = { door_signups: 1, door_views: 30, issue_views: 100 };

export type Proposal = {
  kind: ExperimentKind;
  targetId: string;
  platform: string;
  /** 猜的是哪一个（假门的标题、哪一周的周刊）。 */
  label: string;
  question: string;
  threshold: number;
  baseline: number;
  dueOn: string;
};

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 门槛：他过去同一类实验实际数的中位数（取整，至少 1）；没有历史用默认。门槛在他平时的水平上，「会不会」才不是一边倒，猜起来才有信息。 */
export function thresholdFrom(past: number[], fallback: number): number {
  const xs = past.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (xs.length === 0) return fallback;
  const mid = xs.length % 2 === 1 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  return Math.max(1, Math.round(mid));
}

export type DoorNow = { id: string; title: string; open: boolean; views: number; signups: number };

/** 一个开着的假门可以猜的两道：接下来 14 天会不会有人留邮箱、会不会被看到某个次数。past：他以前对过账的同类实验实际多少。 */
export function doorProposals(door: DoorNow, past: { signups: number[]; views: number[] }, today: string): Proposal[] {
  if (!door.open) return [];
  const dueOn = addDays(today, DOOR_DAYS);
  const s = thresholdFrom(past.signups, DEFAULT_THRESHOLD.door_signups);
  const v = thresholdFrom(past.views, DEFAULT_THRESHOLD.door_views);
  return [
    {
      kind: "door_signups",
      targetId: door.id,
      platform: "",
      label: door.title,
      question: `从今天起 ${DOOR_DAYS} 天，「${door.title}」这一页会不会有至少 ${s} 个新的人留邮箱？`,
      threshold: s,
      baseline: door.signups,
      dueOn,
    },
    {
      kind: "door_views",
      targetId: door.id,
      platform: "",
      label: door.title,
      question: `从今天起 ${DOOR_DAYS} 天，「${door.title}」这一页会不会被看至少 ${v} 次？`,
      threshold: v,
      baseline: door.views,
      dueOn,
    },
  ];
}

export type IssueNow = { id: string; weekStart: string; published: IssuePublish[] };

/** 一期周刊刚发出去（ISSUE_GUESS_WITHIN_DAYS 天以内）的每个平台：发出去 7 天，几篇加起来的浏览会不会到门槛。 */
export function issueProposals(issue: IssueNow, pastByPlatform: Record<string, number[]>, today: string): Proposal[] {
  const out: Proposal[] = [];
  for (const p of issue.published) {
    const day = p.at.slice(0, 10);
    const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
    if (age < 0 || age > ISSUE_GUESS_WITHIN_DAYS || out.some((x) => x.platform === p.platform)) continue;
    const t = thresholdFrom(pastByPlatform[p.platform] ?? [], DEFAULT_THRESHOLD.issue_views);
    out.push({
      kind: "issue_views",
      targetId: issue.id,
      platform: p.platform,
      label: `${issue.weekStart} 那一期`,
      question: `${issue.weekStart} 那一期在${p.platform}发出去 ${ISSUE_DAYS} 天，几篇加起来的浏览会不会到 ${t}？`,
      threshold: t,
      baseline: 0,
      dueOn: addDays(day, ISSUE_DAYS),
    });
  }
  return out;
}

export type OpenForecast = { kind: ExperimentKind; platform: string; threshold: number; baseline: number; start_at: string; due_on: string };

/** 到期那天（日本时间）结束的时刻。 */
const dueEnd = (dueOn: string) => Date.parse(`${addDays(dueOn, 1)}T00:00:00+09:00`);

/** 假门留邮箱：猜的时候到到期那天结束之间新留的几个。 */
export function resolveDoorSignups(f: OpenForecast, signupTimes: string[]): { observed: number; outcome: boolean } {
  const from = Date.parse(f.start_at);
  const observed = signupTimes.filter((t) => Date.parse(t) >= from && Date.parse(t) < dueEnd(f.due_on)).length;
  return { observed, outcome: observed >= f.threshold };
}

/** 假门被看：现在的次数减去猜的时候的（只有累计数，晚对账会多算几次 —— 后台一天对两次，误差在半天以内）。 */
export function resolveDoorViews(f: OpenForecast, viewsNow: number): { observed: number; outcome: boolean } {
  const observed = Math.max(0, viewsNow - f.baseline);
  return { observed, outcome: observed >= f.threshold };
}

/** 周刊浏览：到期以后他填过的那个平台的数（每一篇取最新一次，几篇加起来）；到期以后还没填过返回 null（等他填）。 */
export function resolveIssueViews(f: OpenForecast, metrics: IssueMetric[]): { observed: number; outcome: boolean } | null {
  const after = metrics.filter((m) => m.platform === f.platform && m.views !== null && Date.parse(m.at) >= dueEnd(f.due_on) - 86_400_000);
  if (after.length === 0) return null;
  const observed = after.reduce((s, m) => s + (m.views ?? 0), 0);
  return { observed, outcome: observed >= f.threshold };
}

export type ExperimentStats = { n: number; brier: number | null; bins: Bin[] };

/** 他对自己实验的判断准不准（满 10 道才给分）。 */
export function experimentStats(rows: { probability: number; outcome: boolean | null }[]): ExperimentStats {
  const done = rows.filter((r): r is { probability: number; outcome: boolean } => r.outcome !== null);
  const points = done.map((r) => ({ p: r.probability, y: r.outcome }));
  return { n: done.length, brier: done.length >= SCORE_MIN ? meanBrier(points) : null, bins: binPoints(points) };
}
