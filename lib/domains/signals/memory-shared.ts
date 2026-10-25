import { isGithubSource, signalKindOf, type SignalKind } from "./feeds";
import { isSameStory } from "./same-story";

/**
 * 记忆层（浏览器端也要用的部分，不碰数据库、不碰网络）：
 * 抓到的每一条新闻都存着（external_signals，一条不删），算一个「意思的指纹」，能按意思搜、能看这件事以前和后来；
 * 他看到时点一下的标记是以后想起来的钩子 —— 标过的过 7 天、30 天、一年再拿出来给他看一次。
 */

export type MarkKind = "important" | "mine" | "doubt";

export const MARK_LABELS: Record<MarkKind, string> = { important: "重要", mine: "跟我有关", doubt: "存疑" };

export type ArchiveHit = { id: string; source: string; url: string | null; title: string | null; snippet: string; fetched_at: string; similarity?: number };

export type Mark = { signal_id: string; mark: MarkKind; note: string | null; created_at: string };

/** 回头看的几个间隔（天）。 */
export const RESURFACE_DAYS = [7, 30, 365] as const;

export const RESURFACE_LABELS: Record<(typeof RESURFACE_DAYS)[number], string> = { 7: "一周前", 30: "一个月前", 365: "一年前" };

/** 算指纹用的文字：标题加正文开头。 */
export function embedText(row: { title: string | null; raw_text: string }): string {
  return `${row.title ?? ""}\n${row.raw_text ?? ""}`.trim().slice(0, 1500);
}

/** PostgREST 把 vector 列读成字符串「[0.1,0.2,…]」；解析不了返回 null。 */
export function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v !== "string") return null;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
}

/** 日本的某一天（YYYY-MM-DD）往前 n 天那一天的起止（ISO，按日本时间）。 */
export function tokyoDayRange(today: string, daysAgo: number): { from: string; to: string } {
  const start = Date.parse(`${today}T00:00:00+09:00`) - daysAgo * 86_400_000;
  return { from: new Date(start).toISOString(), to: new Date(start + 86_400_000).toISOString() };
}

/** 关键词命中和按意思命中合在一起：关键词的在前（他记得原词时最准），同一条只留一次。 */
export function mergeHits(keyword: ArchiveHit[], semantic: ArchiveHit[], limit: number): ArchiveHit[] {
  const seen = new Set<string>();
  const out: ArchiveHit[] = [];
  for (const h of [...keyword, ...semantic]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/** RSS 里带来的 &nbsp; 这类 HTML 符号还原、多余空白压成一个（显示和交给 AI 都用这个）。 */
export function cleanSnippet(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}


/** 报告里这一类叫什么（跟今日总览的小标题一致）。 */
export const KIND_TITLES: Record<SignalKind, string> = {
  news: "今天的世界",
  calendar: "已经定了的未来",
  voices: "谁在头疼什么",
  money: "谁在掏钱",
  tools: "新工具和新可能",
};

export type InterestGroup = { kind: SignalKind; count: number; reasons: { signal_id: string; title: string | null; note: string }[] };

/**
 * 他最近在意什么：标过的按报告的几类数一数（代码数，不让 AI 归纳），每类列出他自己写的理由。
 * 多的在前；以后画自我画像用的是这些原话，不是 AI 的概括。
 */
export function interestGroups(marks: { signal_id: string; source: string; title: string | null; note: string | null }[]): InterestGroup[] {
  const groups = new Map<SignalKind, InterestGroup>();
  for (const m of marks) {
    const kind = signalKindOf(m.source);
    const g = groups.get(kind) ?? { kind, count: 0, reasons: [] };
    g.count += 1;
    if (m.note?.trim()) g.reasons.push({ signal_id: m.signal_id, title: m.title, note: m.note.trim() });
    groups.set(kind, g);
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

// ── 在跟的事 ────────────────────────────────────────────────────────────────

/** 他怎么表示过在意这一条：标过、记成了观察、写过判断（做过的比说过的可信，三样都算）。 */
/** opened：没标、没写，但点开看过两天以上（迁移 100，被动记录；比别的弱，只接后来的消息、不进回想）。 */
export type FollowReason = "mark" | "observation" | "judgment" | "opened" | "explicit";

export type Followed = {
  signal_id: string;
  reason: FollowReason;
  mark: MarkKind | null;
  note: string | null;
  /** 他做这件事的时候。 */
  at: string;
  title: string | null;
  source: string;
  fetched_at: string;
};

/** 多种理由指向同一条时留一个：标记（带着他写的为什么）优先，其次判断，再次观察；时间取最近的那次。 */
export function mergeFollowed(rows: Omit<Followed, "title" | "source" | "fetched_at">[]): Omit<Followed, "title" | "source" | "fetched_at">[] {
  const rank: Record<FollowReason, number> = { explicit: -1, mark: 0, judgment: 1, observation: 2, opened: 3 };
  const byId = new Map<string, Omit<Followed, "title" | "source" | "fetched_at">>();
  for (const r of rows) {
    const prev = byId.get(r.signal_id);
    if (!prev) {
      byId.set(r.signal_id, r);
      continue;
    }
    const keep = rank[r.reason] < rank[prev.reason] ? r : prev;
    byId.set(r.signal_id, { ...keep, at: r.at > prev.at ? r.at : prev.at });
  }
  return Array.from(byId.values()).sort((a, b) => b.at.localeCompare(a.at));
}

export type StoryRow = { followed_id: string; id: string; source: string; url: string | null; title: string | null; fetched_at: string; similarity: number };

export type StoryUpdate = { followed: Followed; updates: ArchiveHit[] };

/**
 * 「你在跟的事，有新消息」：按他在跟的那一条分组，只留算得上同一件事的（isSameStory：相似度够高、标题有共同的凭据词）。
 * 同一条新消息像好几件事时只放在最像的那件下面；
 * 新消息本身也是他在跟的就不再列（他已经知道了）；GitHub 新仓库不算新消息（同一个模板写的，彼此看着像）。
 * 每件最多 perStory 条（最像的几条），有最新消息的那件事在前，每件事里新的在前。
 */
export function groupStoryUpdates(rows: StoryRow[], followed: Followed[], perStory = 3): StoryUpdate[] {
  const followedIds = new Set(followed.map((f) => f.signal_id));
  const titles = new Map(followed.map((f) => [f.signal_id, f.title]));
  const best = new Map<string, StoryRow>();
  for (const r of rows) {
    if (followedIds.has(r.id) || isGithubSource(r.source)) continue;
    if (!isSameStory(titles.get(r.followed_id) ?? null, r.title, r.similarity)) continue;
    const prev = best.get(r.id);
    if (!prev || r.similarity > prev.similarity) best.set(r.id, r);
  }
  const groups = new Map<string, ArchiveHit[]>();
  for (const r of Array.from(best.values()).sort((a, b) => b.similarity - a.similarity)) {
    const list = groups.get(r.followed_id) ?? [];
    if (list.length >= perStory) continue;
    list.push({ id: r.id, source: r.source, url: r.url, title: r.title ? cleanSnippet(r.title) : r.title, snippet: "", fetched_at: r.fetched_at, similarity: r.similarity });
    groups.set(r.followed_id, list);
  }
  return followed
    .filter((f) => groups.has(f.signal_id))
    .map((f) => ({ followed: f, updates: (groups.get(f.signal_id) ?? []).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)) }))
    .sort((a, b) => b.updates[0].fetched_at.localeCompare(a.updates[0].fetched_at));
}

/** 「你标了『重要』」「你记成了观察」「你写过判断」。 */
export function followReasonText(f: Pick<Followed, "reason" | "mark">): string {
  if (f.reason === "explicit") return "你主动关注了这件事";
  if (f.reason === "mark" && f.mark) return `你标了「${MARK_LABELS[f.mark]}」`;
  if (f.reason === "judgment") return "你写过判断";
  if (f.reason === "opened") return "你点开看过好几回";
  return "你记成了观察";
}

// ── 时间线 ──────────────────────────────────────────────────────────────────

/** 时间线上的一件事：存档里的新闻，或者时差图谱、官报里对得上的。date 是 YYYY、YYYY-MM 或 YYYY-MM-DD。 */
export type TimelineEvent = { key: string; date: string; kind: "news" | "atlas" | "kanpo"; title: string; href: string | null; external?: boolean };

export const TIMELINE_KIND_LABELS: Record<TimelineEvent["kind"], string> = { news: "新闻", atlas: "时差图谱", kanpo: "官报" };

/** 找到的新闻加上图谱、官报里对得上的，按时间从早到晚排成一条线；日子写不清的（「某年」）不进线。 */
export function buildTimeline(hits: ArchiveHit[], extras: TimelineEvent[]): { year: string; events: TimelineEvent[] }[] {
  const events: TimelineEvent[] = [
    ...hits.map((h) => ({ key: `news-${h.id}`, date: h.fetched_at.slice(0, 10), kind: "news" as const, title: h.title ?? "（没有标题）", href: `/signals/${h.id}` })),
    ...extras,
  ].filter((e) => /^\d{4}(-\d{2}){0,2}$/.test(e.date));
  events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const years: { year: string; events: TimelineEvent[] }[] = [];
  for (const e of events) {
    const year = e.date.slice(0, 4);
    const last = years[years.length - 1];
    if (last && last.year === year) last.events.push(e);
    else years.push({ year, events: [e] });
  }
  return years;
}

/** 图谱里的日子可能写成「2016」「2016-03」「2016年3月」，统一成 YYYY 或 YYYY-MM；写不清的原样留着（不进线）。 */
export function normalizeEventDate(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  const m = t.match(/^(\d{4})(?:[-/年.](\d{1,2}))?/);
  if (!m) return t;
  return m[2] ? `${m[1]}-${m[2].padStart(2, "0")}` : m[1];
}
