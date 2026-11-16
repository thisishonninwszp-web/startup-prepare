import { gapIdeaDraft, gapIdeaTitle, gapPlaces, type GapSide, type GapTransfer, type JapanGap } from "./gaps-shared";
import type { GapVoices, VoiceQuote } from "./voices-shared";

/**
 * 周末的一件（经用户同意，2026-11-17）：想法从 6/18 以后一条没加过，决策轴停着。
 * 周日的周末版（邮件和「今天」页）最上面只放差距清单里的一条，按根据的多少挑（只按事实排，不打分），
 * 写好最关键的假设和先去问谁，点一下变成状态「观察」的想法（带「周末一件」标签，四周里数有没有变成过一条）。
 * 先去问谁只从现成的根据里拼（假门留的邮箱、网上的原话、这边的人在用的 App），不调 AI、不编人。这里不碰数据库。
 */

/** 从这里变成的想法带的标签：四周以后按它数「周末一件」变成过几条想法。 */
export const WEEK_PICK_TAG = "周末一件";

/** 这周没有新进清单的，往回看多少天。 */
export const WEEK_PICK_FALLBACK_DAYS = 28;

/** App 至少有多少人评过分，才算「这边的人在用」（个位数的多半是没人用的同名 App）。 */
const MIN_APP_RATINGS = 50;

export type WeekPickInput = {
  side: GapSide;
  gap: JapanGap;
  voices: Pick<GapVoices, "quotes" | "apps"> | null;
  transfer: GapTransfer | null;
  /** 假门上留了几个邮箱（没开过假门是 0）。 */
  signups: number;
  /** 已经变成过想法（按 gapIdeaTitle 认）。 */
  isIdea: boolean;
};

export type WeekPickEvidence = {
  signups: number;
  /** 已经在花钱、花力气绕路的原话。 */
  workaround: number;
  quotes: number;
  /** 听过这边的人怎么说没有（听过但一句没找到也算听过）。 */
  heard: boolean;
  /** 查过能不能搬过来，有一条这边不成立（有出处）。 */
  blocker: boolean;
  /** 报告里核对过的原文依据几段。 */
  basis: number;
  /** 这边已经有公司为它拿到投资。 */
  funded: boolean;
};

export function pickEvidence(c: WeekPickInput): WeekPickEvidence {
  const quotes = c.voices?.quotes ?? [];
  return {
    signups: c.signups,
    workaround: quotes.filter((q) => q.kind === "workaround").length,
    quotes: quotes.length,
    heard: !!c.voices,
    blocker: !!c.transfer?.conditions.some((x) => x.holds === "no" && x.basis.length > 0),
    basis: c.gap.basis?.length ?? 0,
    funded: !!c.gap.funded,
  };
}

const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** 这一周的周一（date 是 YYYY-MM-DD）。 */
function mondayOf(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDay(date, -((dow + 6) % 7));
}

/** 按根据排：留了邮箱的人多 > 已经在花钱绕路的原话多 > 原话多 > 查到搬过来有一条不成立 > 报告原文多 > 新的。 */
function byEvidence(a: WeekPickInput, b: WeekPickInput): number {
  const x = pickEvidence(a);
  const y = pickEvidence(b);
  return (
    y.signups - x.signups ||
    y.workaround - x.workaround ||
    y.quotes - x.quotes ||
    Number(y.blocker) - Number(x.blocker) ||
    y.basis - x.basis ||
    b.gap.brief_date.localeCompare(a.gap.brief_date) ||
    a.gap.signal_id.localeCompare(b.gap.signal_id)
  );
}

const keyOf = (c: WeekPickInput) => `${c.side}:${c.gap.signal_id}`;

type Choice = { pick: WeekPickInput; scope: "week" | "month"; pool: number };

function pickOn(open: WeekPickInput[], today: string, depth: number): Choice | null {
  const upTo = open.filter((c) => c.gap.brief_date <= today);
  const week = upTo.filter((c) => c.gap.brief_date >= mondayOf(today));
  if (week.length > 0) return { pick: [...week].sort(byEvidence)[0], scope: "week", pool: week.length };
  const recent = upTo.filter((c) => c.gap.brief_date >= shiftDay(today, -(WEEK_PICK_FALLBACK_DAYS - 1)));
  if (recent.length === 0) return null;
  // 前三个周日摆过的先跳过：他没点，就换一条，不一连几周摆同一条（不存，按同一个规则往回算）
  const shown = new Set<string>();
  if (depth > 0) {
    for (const back of [7, 14, 21]) {
      const earlier = pickOn(open, shiftDay(today, -back), depth - 1);
      if (earlier) shown.add(keyOf(earlier.pick));
    }
  }
  const fresh = recent.filter((c) => !shown.has(keyOf(c)));
  const pool = fresh.length > 0 ? fresh : recent;
  return { pick: [...pool].sort(byEvidence)[0], scope: "month", pool: pool.length };
}

/**
 * 挑这周的一件：这周（周一到今天）进清单的、还没变成想法的那几条里，按根据排（见 byEvidence）。
 * 这周没有新进清单的，从最近四周里挑，前三个周日摆过的先跳过。都没有就不放。
 */
export function chooseWeekPick(cands: WeekPickInput[], today: string): Choice | null {
  return pickOn(
    cands.filter((c) => !c.isIdea),
    today,
    3
  );
}

export type WhoLine = { who: string; how: string; quote?: { excerpt: string; title: string; url: string } };

const short = (s: string, n = 50) => (s.length > n ? `${s.slice(0, n)}…` : s);

function example(q: VoiceQuote | undefined): WhoLine["quote"] {
  return q ? { excerpt: short(q.excerpt), title: q.title, url: q.url } : undefined;
}

/**
 * 先去问谁：只从现成的根据里拼，最多两种人，排在前面的更接近「愿付钱」。
 * test 是写进想法「最小实验」那一格的一句（这周就能做完的那一步）。
 */
export function whoToAsk(c: WeekPickInput): { lines: WhoLine[]; test: string } {
  const quotes = c.voices?.quotes ?? [];
  const workaround = quotes.filter((q) => q.kind === "workaround");
  const app = [...(c.voices?.apps ?? [])].filter((a) => a.ratings >= MIN_APP_RATINGS).sort((a, b) => b.ratings - a.ratings)[0];
  const lines: { line: WhoLine; test: string }[] = [];
  const talk = (who: string, ask: string) => `这周找 3 个${who}聊一次：${ask}`;
  if (c.signups > 0) {
    lines.push({
      line: { who: `假门上留了邮箱的 ${c.signups} 个人`, how: "他们看着价格还留了邮箱，是离「愿付钱」最近的人。写信问一句：现在怎么对付这件事？" },
      test: `这周给假门上留了邮箱的 ${c.signups} 个人各写一封信：问他们现在怎么对付这件事、为什么留了邮箱。`,
    });
  }
  if (workaround.length > 0) {
    lines.push({
      line: { who: "已经在花钱、花力气绕路的人", how: `网上有 ${workaround.length} 句这样的原话。问他们：现在花多少钱或时间，为什么还没换。`, quote: example(workaround[0]) },
      test: talk("已经在花钱、花力气绕路的人", "现在花多少钱或时间、为什么还没换。"),
    });
  }
  if (app) {
    lines.push({
      line: { who: `正在用「${app.name}」的人`, how: `App Store 上 ${app.ratings} 人评过分，这边的人现在拿它对付这件事。问他们：哪里还不够用？` },
      test: talk(`正在用「${app.name}」的人`, "拿它对付这件事时哪里不够用、为什么还没换。"),
    });
  }
  if (quotes.length > 0 && workaround.length === 0) {
    lines.push({
      line: {
        who: "在为这件事头疼的人",
        how: `网上有 ${quotes.length} 句原话在说这件麻烦 —— 只说明有人头疼，不说明愿意付钱。问他们：现在怎么对付？`,
        quote: example(quotes[0]),
      },
      test: talk("在为这件事头疼的人", "现在怎么对付、花了多少钱或时间、为什么还没换。"),
    });
  }
  if (lines.length === 0) return { lines: [], test: "先在这一条上点「听一听」，找到这边在为这件事头疼的人，再找 3 个聊一次。" };
  return { lines: lines.slice(0, 2).map((l) => l.line), test: lines[0].test };
}

/** 最关键的假设：查过能不能搬过来、有一条这边不成立的，就是它；没查过的，所有差距都卡在同一处。 */
export function weekPickRiskiest(c: WeekPickInput): string {
  const fromTransfer = gapIdeaDraft(c.gap, c.side, c.transfer).hypothesis.riskiest_assumption;
  if (fromTransfer) return fromTransfer;
  return `${gapPlaces(c.side).here}这边还没有它，不是因为没人要 —— 得有人觉得现在的办法不够用，愿意为它换、为它付钱。`;
}

/** 变成想法时预填的：差距清单那几格 + 最关键的假设 + 最小实验（先去问谁），标签多一个「周末一件」。 */
export function weekPickDraft(c: WeekPickInput) {
  const base = gapIdeaDraft(c.gap, c.side, c.transfer);
  return {
    title: base.title,
    hypothesis: { ...base.hypothesis, riskiest_assumption: weekPickRiskiest(c), smallest_test: whoToAsk(c).test },
    tags: [...base.tags, WEEK_PICK_TAG],
  };
}

/** 「根据：……」那一行：只摆数，不合计。 */
export function evidenceLine(e: WeekPickEvidence): string {
  const parts: string[] = [];
  if (e.signups > 0) parts.push(`假门上留了邮箱 ${e.signups} 人`);
  if (e.quotes > 0) parts.push(`网上原话 ${e.quotes} 句${e.workaround > 0 ? `（${e.workaround} 句已经在花钱、花力气绕路）` : ""}`);
  else parts.push(e.heard ? "听过一次，这边没找到在说这件麻烦的原话" : "还没听过这边的人怎么说");
  if (e.blocker) parts.push("查过能不能搬过来：有一条这边不成立");
  if (e.basis > 0) parts.push(`报告里核对过的原文 ${e.basis} 段`);
  if (e.funded) parts.push("这边已经有公司为它拿到投资（方向有人验证过，你也晚了一步）");
  return `根据：${parts.join("；")}。`;
}

export type WeekPick = {
  side: GapSide;
  signal_id: string;
  headline: string;
  /** 变成想法以后叫什么。 */
  title: string;
  /** 为什么是这一条（这周进清单的几条里根据最多的）。 */
  why: string;
  riskiest: string;
  who: WhoLine[];
  test: string;
  evidence: string;
  /** 那条新闻的链接。 */
  url: string | null;
};

/** choice 不给（邮件链接落地页只摆那一条）时，why 是空的。 */
export function describeWeekPick(c: WeekPickInput, choice?: Pick<Choice, "scope" | "pool">): WeekPick {
  const { there, here } = gapPlaces(c.side);
  const who = whoToAsk(c);
  return {
    side: c.side,
    signal_id: c.gap.signal_id,
    headline: c.gap.headline,
    title: gapIdeaTitle(c.gap.headline, c.side),
    why: !choice
      ? ""
      : choice.scope === "week"
        ? `这周进差距清单（${there}有、${here}还没有）的 ${choice.pool} 条里，根据最多的一条。`
        : `这周没有新进差距清单的，这是最近四周 ${choice.pool} 条里根据最多的一条（前几个周日摆过的先跳过）。`,
    riskiest: weekPickRiskiest(c),
    who: who.lines,
    test: who.test,
    evidence: evidenceLine(pickEvidence(c)),
    url: c.gap.url,
  };
}
