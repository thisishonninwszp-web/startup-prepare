import type { GapSide } from "./gaps-shared";

/**
 * 周刊里浏览器端也要用的部分：类型、平台、固定的结尾、拼稿。不碰数据库。
 *
 * 公开新闻谁都能总结；陌生人会来，是因为这里有别人写不了的：核实过的"那边有、这边还没有"、
 * 他自己的判断、公开对账（押过什么、对没对）。系统只搬运和排版，判断一个字都不替他写。
 */

/** 一期最多写几条：多了每条的判断就写不认真。 */
export const ISSUE_MAX_PICKS = 3;
/** 补的那句话最长几个字（判断主体是点选出来的，这句只是补充）。 */
export const ISSUE_NOTE_MAX = 200;

/**
 * 判断不用打字：每条点三下。点出来的拼成一句话，就是发出去的"我的判断"——每个选项都是他自己点的，系统只是把它说成一句话。
 * 第一问（会 / 不会）发出去时自动押进判断账本，两年后对账。
 */
export const STANCE_OPTIONS = { will: "会", wont: "不会", unsure: "说不清" } as const;
export const BLOCKER_OPTIONS = {
  law: "法规",
  habit: "习惯",
  cost: "成本",
  substitute: "已经有替代品",
  nobody: "没人做",
  other: "其他",
} as const;
export const FIRST_MOVER_OPTIONS = { big: "大公司", startup: "创业公司", foreign: "外面的公司进来", none: "不会有人做" } as const;

export type PickStance = {
  will: keyof typeof STANCE_OPTIONS;
  blocker?: keyof typeof BLOCKER_OPTIONS;
  firstMover?: keyof typeof FIRST_MOVER_OPTIONS;
};

/** 押的期限：两年内会不会出现。 */
export const STANCE_YEARS = 2;

const BLOCKER_PHRASE: Record<keyof typeof BLOCKER_OPTIONS, string | null> = {
  law: "法规",
  habit: "使用习惯",
  cost: "成本",
  substitute: "已经有替代品",
  nobody: "还没人去做",
  other: null,
};
const FIRST_MOVER_PHRASE: Record<keyof typeof FIRST_MOVER_OPTIONS, string> = {
  big: "最可能先做的是大公司。",
  startup: "最可能先做的是创业公司。",
  foreign: "最可能先做的是从外面进来的公司。",
  none: "我觉得不会有人做。",
};

/** 点选的结果拼成一句话，再接上他补的那句（原样）。here 是"这边"（日本 / 中国）。 */
export function stanceSentence(stance: PickStance, here: string, note = ""): string {
  const parts = [
    stance.will === "will"
      ? `我押${STANCE_YEARS}年内${here}会出现这个。`
      : stance.will === "wont"
        ? `我押${STANCE_YEARS}年内${here}不会出现这个。`
        : `${STANCE_YEARS}年内${here}会不会出现，我说不清。`,
    stance.blocker && BLOCKER_PHRASE[stance.blocker] ? `最大的阻碍是${BLOCKER_PHRASE[stance.blocker]}。` : "",
    stance.firstMover ? FIRST_MOVER_PHRASE[stance.firstMover] : "",
    note.trim(),
  ];
  return parts.filter(Boolean).join("");
}

/** 浏览器传来的选项只认这几种。 */
export function validStance(raw: unknown): PickStance | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (!(typeof v.will === "string" && v.will in STANCE_OPTIONS)) return null;
  return {
    will: v.will as PickStance["will"],
    ...(typeof v.blocker === "string" && v.blocker in BLOCKER_OPTIONS ? { blocker: v.blocker as PickStance["blocker"] } : {}),
    ...(typeof v.firstMover === "string" && v.firstMover in FIRST_MOVER_OPTIONS ? { firstMover: v.firstMover as PickStance["firstMover"] } : {}),
  };
}

/** X 的发帖框，内容填好，点"发布"就行（不用接口、不用授权）。 */
export function xIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

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
  /** 点选的三问（早期版本没有，判断是手写的）。 */
  stance?: PickStance;
  /** 他补的那句（原样）。 */
  note?: string;
  /** 发出去的"我的判断"：点选拼成的那句 + 他补的那句。 */
  judgment: string;
  /** 原文链接（押进账本时带上）。 */
  url?: string | null;
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
