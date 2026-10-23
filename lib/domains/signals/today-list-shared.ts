/**
 * 一分钟清单（经用户同意，2026-10-23）：早上的邮件最上面一框 + 点开的那一页，今天要他点的都在这里，每件点一下。
 * 这里是不碰数据库的部分：有哪几种、什么顺序、各取几件、估几秒、邮件里那一行怎么写。邮件和清单页用同一套。
 */
import { ANCHOR_LABELS, pct, type Anchor, type Forecast, type ForecastKind, type PendingResolution } from "./forecast-shared";
import { CONFIDENCE_LEVELS, draftVerdict, type HorizonKey, type PracticeDraft } from "./practice-shared";
import type { InferenceEvidence } from "./inference-shared";
import type { FakeDoorDraft } from "./fake-door-shared";
import type { GapSide } from "./gaps-shared";

/** anchor：先摆出来的那个数（市场价 / 统计基准 / AI，见 anchorOf）；先判题不摆，是 null。 */
export type ListForecast = { id: string; title: string; kind: ForecastKind; resolve_on: string; criteria: string; blind: boolean; anchor: Anchor | null; three: Forecast[] };

export type ListPractice = {
  kind: "practice";
  date: string;
  signalId: string;
  question: string;
  /** draft：AI 先判了；blind：周一先自己判；waiting：AI 先判还没出（7:30 后台会补）。 */
  mode: "draft" | "blind" | "waiting";
  draft: PracticeDraft | null;
  horizon: HorizonKey;
  deadline?: string;
};
export type ListConfirm = { id: string; title: string; criteria: string; resolve_on: string; pending: PendingResolution };
export type ListDue = { id: string; predictionId: string; question: string; judgment: string; dueAt: string; evidence: InferenceEvidence[] | null };
export type ListRecall = { signalId: string; title: string; reason: string; dueOn: string };
export type ListExperiment = { kind: string; targetId: string; platform: string; label: string; question: string; dueOn: string };
/** 后台先做好的假门（见 door-prep.ts）：整页的字、先填的价格和出处（没有数据是 null，要他填）。 */
export type ListDoor = { signalId: string; side: GapSide; lang: "ja" | "zh"; draft: FakeDoorDraft; price: string | null; priceBasis: string | null };

export type ListItem =
  | ListPractice
  | { kind: "forecast"; q: ListForecast }
  | { kind: "confirm"; q: ListConfirm }
  | { kind: "due"; j: ListDue }
  | { kind: "recall"; r: ListRecall }
  | { kind: "experiment"; p: ListExperiment }
  | { kind: "door"; d: ListDoor };

export type ListCandidates = {
  practice: ListPractice | null;
  forecasts: ListForecast[];
  confirms: ListConfirm[];
  dues: ListDue[];
  recalls: ListRecall[];
  experiments: ListExperiment[];
  doors: ListDoor[];
};

/** 一天最多几件、每一种最多几件（多出来的留到明天，不堆）。 */
export const LIST_MAX = 8;
export const LIST_CAPS = { practice: 1, door: 1, forecast: 3, confirm: 2, due: 2, recall: 2, experiment: 1 } as const;

/** 按顺序取：练习 → 做好的假门（拿「愿付钱」证据的唯一一条路，排在前面）→ 预测题（先判题排第一；不是先判题、又没有先摆出来的数的不放）→ 到期确认 → 到期的判断 → 回想 → 实验先猜。 */
export function pickListItems(c: ListCandidates): { items: ListItem[]; more: number } {
  const forecasts = [...c.forecasts.filter((q) => q.blind), ...c.forecasts.filter((q) => !q.blind && q.anchor !== null)];
  const groups: [ListItem[], number][] = [
    [c.practice ? [c.practice] : [], LIST_CAPS.practice],
    [c.doors.map((d) => ({ kind: "door" as const, d })), LIST_CAPS.door],
    [forecasts.map((q) => ({ kind: "forecast" as const, q })), LIST_CAPS.forecast],
    [c.confirms.map((q) => ({ kind: "confirm" as const, q })), LIST_CAPS.confirm],
    [c.dues.map((j) => ({ kind: "due" as const, j })), LIST_CAPS.due],
    [c.recalls.map((r) => ({ kind: "recall" as const, r })), LIST_CAPS.recall],
    [c.experiments.map((p) => ({ kind: "experiment" as const, p })), LIST_CAPS.experiment],
  ];
  const items: ListItem[] = [];
  let total = 0;
  for (const [group, cap] of groups) {
    total += group.length;
    for (const it of group.slice(0, cap)) if (items.length < LIST_MAX) items.push(it);
  }
  return { items, more: total - items.length };
}

/** 估几秒（只是让他知道很短）：练习 10 秒、假门 20 秒（要把那一页读一遍），别的 6 秒。 */
export function listSeconds(items: ListItem[]): number {
  return items.reduce((s, i) => s + (i.kind === "practice" ? 10 : i.kind === "door" ? 20 : 6), 0);
}

const KIND_NAMES: Record<ListItem["kind"], string> = {
  practice: "练习",
  door: "假门",
  forecast: "预测",
  confirm: "到期确认",
  due: "到期的判断",
  recall: "回想",
  experiment: "你的实验",
};

const clip = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 邮件里那一行：哪一种、题目（截短）、AI 或程序怎么说（回想不写答案）。 */
export function previewLine(item: ListItem): { label: string; title: string; note: string } {
  const label = KIND_NAMES[item.kind];
  switch (item.kind) {
    case "practice": {
      if (item.mode === "blind") return { label, title: clip(item.question), note: "周一：先自己判" };
      if (!item.draft) return { label, title: clip(item.question), note: "AI 还没判完" };
      const v = draftVerdict(item.draft.probability, item.question);
      return { label, title: clip(item.question), note: `AI：${v.will ? "会" : "不会"} · ${CONFIDENCE_LEVELS[v.confidence].label}` };
    }
    case "forecast":
      return { label, title: clip(item.q.title), note: item.q.blind || !item.q.anchor ? "这道先自己判" : `${ANCHOR_LABELS[item.q.anchor.source]}：${pct(item.q.anchor.probability)}` };
    case "confirm": {
      const s = item.q.pending.suggested;
      return { label, title: clip(item.q.title), note: `程序查到：${s === "yes" ? "看起来「会」" : s === "no" ? "看起来「不会」" : "说不清"}` };
    }
    case "due": {
      const ev = item.j.evidence ?? [];
      const sup = ev.filter((e) => e.stance === "supports").length;
      const con = ev.filter((e) => e.stance === "contradicts").length;
      return { label, title: clip(item.j.judgment), note: item.j.evidence === null ? "证据还没查" : `查到 ${sup} 条支持、${con} 条反对` };
    }
    case "recall":
      return { label, title: clip(item.r.title), note: item.r.reason };
    case "experiment":
      return { label, title: clip(item.p.label), note: "先猜一下" };
    case "door":
      return { label, title: clip(item.d.draft.title), note: item.d.price ? `做好了，价格先填了 ${item.d.price}` : "做好了，差一个价格" };
  }
}
