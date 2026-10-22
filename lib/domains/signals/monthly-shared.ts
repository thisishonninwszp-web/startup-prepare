/**
 * 月报（浏览器端也要用的部分，不碰数据库、不碰 AI）：哪个月、算进来的是哪几周、一条线到月底还在不在走、
 * 下一步怎么说、去哪一页。
 */

export type MonthlyNextKey = "issue" | "door" | "listen" | "gaps" | "judge";

export type MonthlyRelated = { kind: "gap" | "idea"; id: string; title: string; side?: string };

export type MonthlyLine = {
  title: string;
  note: string;
  /** 这条线出现在哪几周（那周的周一）。 */
  weeks: string[];
  /** 最后一周还在 = still；前面有、最后一周没了 = faded（由代码按周算，不让 AI 说）。 */
  status: "still" | "faded";
  threads: { weekStart: string; title: string }[];
  related: MonthlyRelated[];
  next: MonthlyNextKey | null;
  why: string;
};

export type Monthly = {
  month: string;
  /** 算进来的那几周（周一）。 */
  weeks: string[];
  summary: string;
  lines: MonthlyLine[];
  created_at: string;
};

/** 这个月做了几件往前推的事（代码数的，不经 AI）；哪一样数不出来是 null。 */
export type MonthlyActivity = {
  judgments: number | null;
  listens: number | null;
  doors: number | null;
  signups: number | null;
  issues: number | null;
  conversations: number | null;
  evidence: number | null;
};

export const ACTIVITY_LABELS: { key: keyof MonthlyActivity; label: string }[] = [
  { key: "judgments", label: "写下的判断" },
  { key: "listens", label: "听一听" },
  { key: "evidence", label: "补进想法缺口的信息" },
  { key: "doors", label: "开的假门" },
  { key: "signups", label: "假门上留的邮箱" },
  { key: "issues", label: "发出去的周刊" },
  { key: "conversations", label: "记下的真实对话" },
];

export const NEXT_LABELS: Record<MonthlyNextKey, string> = {
  issue: "放进下周的周刊，写上你的判断",
  door: "给它开一个假门，写上价格",
  listen: "听一听这边有没有人为它头疼",
  gaps: "给这个想法列信息缺口",
  judge: "押一条判断，到期对账",
};

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

/** 「2026-10」→ 第一天、最后一天。 */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * 算进这个月的周：周一到周日已经过完（周日在今天之前），而且至少有一天落在这个月里。
 * 返回那几周的周一（旧的在前）。
 */
export function monthWeeks(month: string, today: string): string[] {
  const { start, end } = monthRange(month);
  const dow = new Date(`${start}T12:00:00Z`).getUTCDay();
  let monday = shift(start, -((dow + 6) % 7));
  const out: string[] = [];
  while (monday <= end) {
    const sunday = shift(monday, 6);
    if (sunday >= start && sunday < today) out.push(monday);
    monday = shift(monday, 7);
  }
  return out;
}

/** 一条线到月底还在不在走：出现在算进来的最后一周就是 still。 */
export function lineStatus(lineWeeks: string[], monthWeekList: string[]): "still" | "faded" {
  const last = monthWeekList[monthWeekList.length - 1];
  return lineWeeks.includes(last) ? "still" : "faded";
}

/** 「第 2 周（10/6–10/12）」 */
export function weekLabel(index: number, monday: string): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `第 ${index + 1} 周（${md(monday)}–${md(shift(monday, 6))}）`;
}

/** 下一步去哪一页：有相关的差距 / 想法就直接去那一条。 */
export function nextHref(next: MonthlyNextKey, related: MonthlyRelated[]): string {
  const gap = related.find((r) => r.kind === "gap");
  const idea = related.find((r) => r.kind === "idea");
  switch (next) {
    case "issue":
      return "/signals/issue";
    case "door":
      return gap?.side ? `/signals/gaps/door?side=${gap.side}&signal=${gap.id}` : "/signals/gaps";
    case "listen":
      return "/signals/gaps";
    case "gaps":
      return idea ? `/ideas/${idea.id}#gaps` : "/ideas";
    case "judge":
      return "/signals/practice";
  }
}
