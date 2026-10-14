import type { GapSide } from "./gaps-shared";

/**
 * 周刊里浏览器端也要用的部分：类型、平台、固定的结尾、拼稿。不碰数据库。
 *
 * 公开新闻谁都能总结；陌生人会来，是因为这里有别人写不了的：核实过的"那边有、这边还没有"、
 * 他自己的判断、公开对账（押过什么、对没对）。系统只搬运和排版，判断一个字都不替他写。
 */

/** 一期最多写几条：多了每条的判断就写不认真。 */
export const ISSUE_MAX_PICKS = 3;
/** 每条判断至少几个字（一句完整的话）。 */
export const ISSUE_MIN_JUDGMENT = 10;

export const ISSUE_PLATFORMS = ["小红书", "即刻", "公众号", "note", "X", "其他"] as const;
export type IssuePlatform = (typeof ISSUE_PLATFORMS)[number];

/** 这一期写的一条：核实过的事实（服务器按 id 重新取，不信浏览器传来的）+ 他的判断。 */
export type IssuePick = {
  side: GapSide;
  signal_id: string;
  headline: string;
  /** 那边是怎么回事。 */
  background: string;
  /** 这边现在怎样（核实过的）。 */
  here: string;
  whyNow?: string;
  funded?: { company: string; url: string };
  /** 能不能搬过来：每个条件这边成不成立。查过才有。 */
  conditions?: { name: string; holds: "yes" | "no" | "unclear"; here: string }[];
  sources: { title: string; url: string }[];
  judgment: string;
};

/** 公开对账的一条：押过什么、结果。 */
export type IssueBet = {
  id: string;
  question: string;
  judgment: string;
  outcome: "pending" | "hit" | "miss";
  made_on: string;
  due_on: string;
};

export type IssueContent = { opening: string; picks: IssuePick[]; bets: IssueBet[] };

export type IssueDrafts = {
  zhLong: string;
  zhShort: string;
  jaLong: string;
  jaShort: string;
  zhTitles: string[];
  jaTitles: string[];
};

export type IssuePublish = { platform: IssuePlatform; url: string; at: string };
export type IssueResponse = { at: string; observation_id: string; wants_talk: boolean };

export type Issue = {
  id: string;
  week_start: string;
  content: IssueContent;
  drafts: IssueDrafts | null;
  published: IssuePublish[];
  responses: IssueResponse[];
};

/** 结尾那一句由代码加，不让 AI 写：陌生人就是从这一句来的，措辞要稳定。 */
export const ISSUE_CTA = {
  zh: "你在日本碰到过这类麻烦吗？或者你就在做这件事？评论或私信告诉我。",
  ja: "日本でこういう不便を感じたことはありますか？あるいは、まさにこれをやっている方がいたら、コメントかDMで教えてください。",
};

/** 这一天所在那一周的周一（YYYY-MM-DD）。 */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** 长文最后的出处列表（代码拼，不让 AI 写链接）。同一个链接只列一次。 */
export function sourcesBlock(picks: IssuePick[], lang: "zh" | "ja"): string {
  const seen = new Set<string>();
  const lines = picks
    .flatMap((p) => p.sources)
    .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))
    .map((s) => `・${s.title || s.url} ${s.url}`);
  if (lines.length === 0) return "";
  return `${lang === "zh" ? "出处" : "出典"}：\n${lines.join("\n")}`;
}

/** AI 写的正文 + 代码加的结尾和出处 = 可以直接复制去发的稿子。X 那条放不下，只放正文。 */
export function assembleDrafts(body: IssueDrafts, picks: IssuePick[]): IssueDrafts {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  return {
    ...body,
    zhLong: join(body.zhLong, ISSUE_CTA.zh, sourcesBlock(picks, "zh")),
    zhShort: join(body.zhShort, ISSUE_CTA.zh),
    jaLong: join(body.jaLong, ISSUE_CTA.ja, sourcesBlock(picks, "ja")),
  };
}

/** 发了几处、回应几条、几个人想聊。只数次数。 */
export function issueCounts(issue: Pick<Issue, "published" | "responses">): { published: number; responses: number; wantsTalk: number } {
  return {
    published: issue.published.length,
    responses: issue.responses.length,
    wantsTalk: issue.responses.filter((r) => r.wants_talk).length,
  };
}
