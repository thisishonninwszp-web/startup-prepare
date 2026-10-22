import type { GapRecheck, GapSide } from "./gaps-shared";
import type { VoiceKind } from "./voices-shared";

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
      ? `我判断${STANCE_YEARS}年内${here}会出现这个。`
      : stance.will === "wont"
        ? `我判断${STANCE_YEARS}年内${here}不会出现这个。`
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

// ── 小红书封面 ─────────────────────────────────────────────────────────────

/** 封面上每条标题最多几个字（两行放得下）。 */
export const COVER_HEADLINE_MAX = 30;

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

const SIDE_LABEL: Record<GapSide, string> = {
  japan: "中国有 · 日本还没有",
  us: "美国有 · 日本还没有",
  china: "日本有 · 中国还没有",
};

/** 封面顶上那一行：这一期都是同一个方向就写方向，混着的就写"那边有 · 这边还没有"。 */
export function coverTopLabel(picks: Pick<IssuePick, "side">[]): string {
  const sides = Array.from(new Set(picks.map((p) => p.side)));
  return sides.length === 1 ? SIDE_LABEL[sides[0]] : "那边有 · 这边还没有";
}

/** 封面上的几条：标题（截到两行）和他押的是什么。 */
export function coverItems(picks: Pick<IssuePick, "headline" | "stance">[]): { headline: string; stance: string }[] {
  return picks.slice(0, ISSUE_MAX_PICKS).map((p) => ({
    headline: clip(p.headline, COVER_HEADLINE_MAX),
    stance: !p.stance
      ? ""
      : p.stance.will === "will"
        ? `我的判断：${STANCE_YEARS} 年内会出现`
        : p.stance.will === "wont"
          ? `我的判断：${STANCE_YEARS} 年内不会出现`
          : "我说不清",
  }));
}

/**
 * 封面图的地址：带上生成时间，换了稿子浏览器就不会拿缓存里的旧图。
 * 给了 pick 就是那一篇小红书笔记自己的封面（只讲那一条）。
 */
export function coverUrl(issue: Pick<Issue, "id" | "updated_at">, pick?: number): string {
  const v = `v=${encodeURIComponent(issue.updated_at ?? "")}`;
  return `/api/issue-card/${issue.id}?${pick === undefined ? v : `pick=${pick}&${v}`}`;
}

/** 单篇封面上那一条：方向、笔记标题、新闻标题（截短）、他押的是什么。 */
export function coverSingle(
  pick: Pick<IssuePick, "side" | "headline" | "stance">,
  noteTitle: string | undefined
): { top: string; title: string; headline: string; stance: string } {
  const [item] = coverItems([pick]);
  return { top: coverTopLabel([pick]), title: noteTitle || item.headline, headline: noteTitle ? item.headline : "", stance: item.stance };
}

/** X 的发帖框，内容填好，点"发布"就行（不用接口、不用授权）。 */
export function xIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/** X 先不发：零粉丝的新号一周一条基本没人看到，要每天去互动才有用。以后真要发，记在"其他"里。 */
export const ISSUE_PLATFORMS = ["小红书", "note", "公众号", "即刻", "其他"] as const;
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
  /** 日本人为这件麻烦自己会搜的说法（"听一听"时查过才有，只给日本这边）：note 版的标题用上它。 */
  searchPhrases?: string[];
  /** 「那边查一查」查到的事实（一条讲透里查过才有）。 */
  thereFacts?: { text: string; url: string; title: string }[];
  /** 这边有没有人在为这件麻烦头疼（查过才有）：那件麻烦、三种各几句、最多 3 句原话。 */
  voices?: { pain: string; counts: Record<VoiceKind, number>; quotes: string[] };
  /** 同类东西以前来日本的结果（他在一条讲透里点了类别才有）。 */
  benchmark?: string;
  /** 对上的官报决算，一条一行。 */
  kanpo?: string[];
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

/** 发出去时押进判断账本的那几条：记下是哪一条差距，每月重查发现"有了"就能自动对账。 */
export type IssueRecordedBet = {
  prediction_id: string;
  judgment_id: string;
  side: GapSide;
  signal_id: string;
  will: "will" | "wont";
  /** 押的那天（YYYY-MM-DD）：之前的重查结果不算。 */
  made_on: string;
  due_at: string;
};

export type IssueContent = {
  opening: string;
  picks: IssuePick[];
  bets: IssueBet[];
  /** 第一次记"发了"之后才有。 */
  recorded?: IssueRecordedBet[];
};

/** 小红书一篇：一条一篇（一篇只讲一件事的才有人看）。 */
export type XhsNote = { title: string; body: string };

export type IssueDrafts = {
  zhLong: string;
  /** 小红书笔记，和这一期的条一一对应。 */
  zhNotes?: XhsNote[];
  jaLong: string;
  zhTitles: string[];
  jaTitles: string[];
  /** 早期版本：小红书合成一篇、日文还有一条 X。新生成的没有。 */
  zhShort?: string;
  jaShort?: string;
};

export type IssuePublish = { platform: IssuePlatform; url: string; at: string };
/**
 * 读者回应说的是哪一类：pain = 说想要 / 自己有这个麻烦（有痛），pay = 问哪里买、多少钱（愿付钱的迹象），other = 别的。
 * 对着宪法里证据只记的那两个信号。
 */
export const RESPONSE_SIGNALS = { pain: "说想要 / 有这个麻烦", pay: "问哪里买 / 多少钱", other: "别的" } as const;
export type ResponseSignal = keyof typeof RESPONSE_SIGNALS;

export type IssueResponse = {
  at: string;
  observation_id: string;
  wants_talk: boolean;
  /** 回应的是第几篇（小红书一条一篇）；整期的回应没有。 */
  pick?: number;
  signal?: ResponseSignal;
};

export type Issue = {
  id: string;
  week_start: string;
  /** 最后一次生成稿子的时间（封面图的地址带上它，换了稿子就不会拿到旧图）。 */
  updated_at?: string;
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

/**
 * 小红书的话题标签（代码加，不让 AI 挑：挑偏了没人搜得到）。
 * 日本有、中国还没有的那一类，读的人是想买日本东西、做跨境的。
 */
export function xhsTags(side: GapSide): string {
  return side === "china" ? "#日本好物 #跨境电商 #中日差异 #日本生活" : "#在日华人 #日本生活 #出海日本 #日本创业 #中日差异";
}

/** AI 写的正文 + 代码加的结尾、出处、话题标签 = 可以直接复制去发的稿子。 */
export function assembleDrafts(body: IssueDrafts, picks: IssuePick[]): IssueDrafts {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  return {
    ...body,
    zhLong: join(body.zhLong, ISSUE_CTA.zh, sourcesBlock(picks, "zh")),
    zhNotes: body.zhNotes?.map((n, i) => ({ ...n, body: join(n.body, ISSUE_CTA.zh, picks[i] ? xhsTags(picks[i].side) : "") })),
    jaLong: join(body.jaLong, ISSUE_CTA.ja, sourcesBlock(picks, "ja")),
  };
}

/** note 文末那一段：这一期里开着假门的几条，各放一个登记页的链接（代码加，不让 AI 写）。 */
export const DOOR_LINKS_LEAD =
  "準備中のサービスです。使ってみたい方は、下のページからメールアドレスを登録できます（まだお金は一切かかりません）。";

/**
 * 日文 note 版加上假门链接：放在结尾那句之后、出典之前；没有出典就放最后。没有开着的假门就原样返回。
 * 在显示时加（不存进稿子）：之后开的假门也会出现，关掉的就不再出现。
 */
export function withDoorLinks(text: string, links: { title: string; url: string }[]): string {
  if (links.length === 0) return text;
  return beforeSources(text, `${DOOR_LINKS_LEAD}\n${links.map((l) => `・${l.title} ${l.url}`).join("\n")}`, "ja");
}

/** 一段插在出处 / 出典之前（结尾那句之后）；没有出处就放最后。 */
function beforeSources(text: string, block: string, lang: "zh" | "ja"): string {
  const at = text.lastIndexOf(lang === "zh" ? "\n\n出处：" : "\n\n出典：");
  return at === -1 ? `${text}\n\n${block}` : `${text.slice(0, at)}\n\n${block}${text.slice(at)}`;
}

/** 周刊付费版的那一句（代码加）。 */
export const ISSUE_DOOR_LINE = {
  zh: "这份周刊在筹备付费版。有兴趣的话，可以在这里留个邮箱（现在不收钱）：",
  ja: "この週刊の有料版を準備しています。興味のある方は、こちらからメールアドレスを登録できます（まだお金はかかりません）：",
} as const;

/** 长文加上周刊付费版的登记页链接（显示时加，不存进稿子；没开着就原样返回）。 */
export function withIssueDoorLink(text: string, url: string | null, lang: "zh" | "ja"): string {
  return url ? beforeSources(text, `${ISSUE_DOOR_LINE[lang]}${url}`, lang) : text;
}

/** 搜索词里的站名不算"说法"（「〇〇 困る 知恵袋」里的知恵袋）。 */
const PHRASE_NOISE = new Set(["知恵袋", "教えて!goo", "教えてgoo", "note", "X", "Twitter", "知乎", "小红书", "豆瓣", "贴吧"]);

/**
 * 标题有没有用上日本人自己搜的说法：一个说法里至少两个词（只有一个词就那一个）出现在某个标题里，算用上了。
 * 返回用上了的那几个说法。只用来提醒他，不拦着发。
 */
export function phraseHits(titles: string[], phrases: string[]): string[] {
  return phrases.filter((phrase) => {
    const words = phrase.split(/[\s　]+/).filter((w) => w.length >= 2 && !PHRASE_NOISE.has(w));
    if (words.length === 0) return false;
    const need = Math.min(2, words.length);
    return titles.some((t) => words.filter((w) => t.includes(w)).length >= need);
  });
}

// ── 每一篇的数据 ───────────────────────────────────────────────────────────

/** 一篇在一个平台上的数据（他过几天回来看一眼填的）。没填的为 null。 */
export type IssueMetric = {
  pick: number;
  platform: IssuePlatform;
  views: number | null;
  likes: number | null;
  saves: number | null;
  comments: number | null;
  at: string;
};

export type GapReach = { posts: number; views: number; likes: number; saves: number; comments: number };

/** 浏览器传来的一条先查形状：第几篇要在这一期里、平台认得、数是非负整数（空的为 null）、至少填了一个。 */
export function validMetric(raw: unknown, picks: number): Omit<IssueMetric, "at"> | string {
  const v = (raw ?? {}) as Record<string, unknown>;
  const pick = Number(v.pick);
  if (!Number.isInteger(pick) || pick < 0 || pick >= picks) return "这一期没有这一篇";
  if (typeof v.platform !== "string" || !(ISSUE_PLATFORMS as readonly string[]).includes(v.platform)) return "不认识这个平台";
  const num = (k: string): number | null | "bad" => {
    const x = v[k];
    if (x === null || x === undefined || x === "") return null;
    const n = Number(x);
    return Number.isInteger(n) && n >= 0 && n < 1e9 ? n : "bad";
  };
  const views = num("views");
  const likes = num("likes");
  const saves = num("saves");
  const comments = num("comments");
  if ([views, likes, saves, comments].includes("bad")) return "数要填整数";
  if ([views, likes, saves, comments].every((x) => x === null)) return "至少填一个数";
  return { pick, platform: v.platform as IssuePlatform, views: views as number | null, likes: likes as number | null, saves: saves as number | null, comments: comments as number | null };
}

/** 同一篇同一个平台只留最新的一次。 */
export function upsertMetric(list: IssueMetric[], m: IssueMetric): IssueMetric[] {
  return [...list.filter((x) => !(x.pick === m.pick && x.platform === m.platform)), m];
}

/** 每条差距在周刊上被看了多少、收藏了多少（几期、几个平台加起来；键是 "side:signal_id"）。只数次数。 */
export function gapReach(issues: Pick<Issue, "id" | "content">[], metrics: Map<string, IssueMetric[]>): Map<string, GapReach> {
  const out = new Map<string, GapReach>();
  for (const issue of issues) {
    for (const m of metrics.get(issue.id) ?? []) {
      const pick = issue.content.picks[m.pick];
      if (!pick) continue;
      const key = `${pick.side}:${pick.signal_id}`;
      const r = out.get(key) ?? { posts: 0, views: 0, likes: 0, saves: 0, comments: 0 };
      r.posts += 1;
      r.views += m.views ?? 0;
      r.likes += m.likes ?? 0;
      r.saves += m.saves ?? 0;
      r.comments += m.comments ?? 0;
      out.set(key, r);
    }
  }
  return out;
}

/** 发了几处、回应几条、几个人想聊。只数次数。 */
export function issueCounts(issue: Pick<Issue, "published" | "responses">): { published: number; responses: number; wantsTalk: number } {
  return {
    published: issue.published.length,
    responses: issue.responses.length,
    wantsTalk: issue.responses.filter((r) => r.wants_talk).length,
  };
}

// ── 每篇笔记就是一次需求测试 ───────────────────────────────────────────────

export type GapDemand = { pain: number; pay: number; other: number; wantsTalk: number };

/** 每条差距在周刊上收到的回应：说想要几个、问哪里买几个、想聊几个（键是 "side:signal_id"）。只数次数。 */
export function gapDemand(issues: Pick<Issue, "content" | "responses">[]): Map<string, GapDemand> {
  const out = new Map<string, GapDemand>();
  for (const issue of issues) {
    for (const r of issue.responses) {
      const pick = r.pick !== undefined ? issue.content.picks[r.pick] : undefined;
      if (!pick) continue;
      const key = `${pick.side}:${pick.signal_id}`;
      const d = out.get(key) ?? { pain: 0, pay: 0, other: 0, wantsTalk: 0 };
      d[r.signal ?? "other"] += 1;
      if (r.wants_talk) d.wantsTalk += 1;
      out.set(key, d);
    }
  }
  return out;
}

// ── 自动对账 ───────────────────────────────────────────────────────────────

/**
 * 周刊上押过的一条，能不能不用他点就对账：
 * - 押之后的重查查到出处说"这边有了"：押会出现的算对，押不会的算错；
 * - 到了期限，最近一次重查（期限前后 45 天内）查到出处说"还没有"：押会出现的算错，押不会的算对；
 * - 别的情况（没查清、太久没查）留给他自己对 —— 只在有出处的时候替他对账。
 */
export const RESOLVE_WINDOW_DAYS = 45;

export function decideIssueBet(
  bet: IssueRecordedBet,
  rechecks: GapRecheck[],
  today: string
): { outcome: "hit" | "miss"; note: string } | null {
  const mine = rechecks
    .filter((r) => r.side === bet.side && r.signal_id === bet.signal_id && r.checked_on >= bet.made_on)
    .sort((a, b) => b.checked_on.localeCompare(a.checked_on));
  const arrived = mine.filter((r) => r.verdict === "arrived").at(-1);
  if (arrived) {
    const src = arrived.source_check?.basis[0];
    return {
      outcome: bet.will === "will" ? "hit" : "miss",
      note: `自动对账：${arrived.checked_on} 重查查到这边有了 —— ${arrived.japan}${src ? `（出处：${src.title || src.url} ${src.url}）` : ""}`,
    };
  }
  const due = bet.due_at.slice(0, 10);
  if (today < due) return null;
  const dueMs = Date.parse(`${due}T00:00:00Z`);
  const near = mine.find((r) => Math.abs(Date.parse(`${r.checked_on}T00:00:00Z`) - dueMs) <= RESOLVE_WINDOW_DAYS * 86_400_000);
  if (near?.verdict !== "still") return null;
  const src = near.source_check?.basis[0];
  return {
    outcome: bet.will === "will" ? "miss" : "hit",
    note: `自动对账：到期时（${near.checked_on} 重查）这边还是没有 —— ${near.japan}${src ? `（出处：${src.title || src.url} ${src.url}）` : ""}`,
  };
}
