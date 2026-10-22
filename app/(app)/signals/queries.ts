import { supabaseAdmin } from "@/lib/supabase";
import { kindSourceFilter, REPORT_SECTION_KINDS, type SignalKind } from "@/lib/domains/signals/feeds";
import type { BriefItem, BriefPracticeRow } from "@/lib/domains/signals/brief";
import { cleanBriefItem } from "@/lib/domains/signals/filler";
import { findEarlierMentions, type EarlierJudgment, type EarlierMention } from "@/lib/domains/signals/followups";
import { handledSignalIds } from "@/lib/domains/signals/user-states";

export type NewsItem = {
  id: string;
  source: string;
  url: string | null;
  title: string | null;
  raw_text: string;
  published_at: string | null;
  fetched_at: string;
};

/** 只看这几个 source 前缀（"新工具"一类里，GitHub 仓库和"什么变得可能了"的新闻分开列）。 */
function prefixFilter(kind: SignalKind, prefixes?: string[]): string {
  return prefixes ? prefixes.map((p) => `source.like.${p}%`).join(",") : kindSourceFilter(kind);
}

/** 收件箱列最近几天抓到、还没处理过的。更早的不删（存档一条不删），只是不在这里列，记忆页能找到。 */
export const INBOX_DAYS = 14;

function inboxSince(): string {
  return new Date(Date.now() - INBOX_DAYS * 86_400_000).toISOString();
}

/**
 * 某个页签下没处理过的条目，按发布时间倒序。迁移 052 没跑时返回 null。
 * sharedViewer：朋友的账号 —— 不看 external_signals.status（那是主账号的），去掉他自己处理过的。
 */
export async function listPendingSignals(kind: SignalKind, limit = 60, prefixes?: string[], sharedViewer?: string): Promise<NewsItem[] | null> {
  let query = supabaseAdmin
    .from("external_signals")
    .select("id, source, url, title, raw_text, published_at, fetched_at")
    .or(prefixFilter(kind, prefixes))
    .gte("fetched_at", inboxSince());
  const handled = sharedViewer ? await handledSignalIds(sharedViewer) : null;
  if (!sharedViewer) query = query.eq("status", "pending");
  const { data, error } = await query.order("published_at", { ascending: false, nullsFirst: false }).limit(limit + (handled?.size ?? 0));
  if (error) {
    if (/published_at/.test(error.message)) return null;
    throw new Error(error.message);
  }
  // 隔天同一篇换了个分类再进来，表里就会有两行；显示时按链接只留一条。
  const seen = new Set<string>();
  return ((data ?? []) as NewsItem[]).filter((item) => {
    if (handled?.has(item.id)) return false;
    if (!item.url) return true;
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export async function countPendingSignals(kind: SignalKind, prefixes?: string[], sharedViewer?: string): Promise<number> {
  if (!sharedViewer) {
    const { count, error } = await supabaseAdmin
      .from("external_signals")
      .select("id", { count: "exact", head: true })
      .or(prefixFilter(kind, prefixes))
      .eq("status", "pending")
      .gte("fetched_at", inboxSince());
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
  // 朋友的账号：收件箱这段时间里这一类一共几条，减去他自己处理过的
  const since = inboxSince();
  const handled = Array.from(await handledSignalIds(sharedViewer));
  const [all, done] = await Promise.all([
    supabaseAdmin.from("external_signals").select("id", { count: "exact", head: true }).or(prefixFilter(kind, prefixes)).gte("fetched_at", since),
    handled.length > 0
      ? supabaseAdmin.from("external_signals").select("id", { count: "exact", head: true }).or(prefixFilter(kind, prefixes)).gte("fetched_at", since).in("id", handled.slice(0, 500))
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (all.error) throw new Error(all.error.message);
  return Math.max(0, (all.count ?? 0) - (done.count ?? 0));
}

export type ReportSection = { overview: string | null; items: BriefItem[]; practice: BriefPracticeRow | null };

export type DailyReport = {
  date: string;
  news: ReportSection | null;
  tools: ReportSection | null;
  voices: ReportSection | null;
  calendar: ReportSection | null;
  money: ReportSection | null;
  /** 有报告的最近几天，用来翻往期。 */
  recentDates: string[];
  /** 今天的条目里，之前的报告也出现过同一件事的：signal_id → 上次的情况。 */
  earlier: Record<string, EarlierMention>;
};

/** 往回翻多少天的报告找"同一件事"。 */
const FOLLOWUP_LOOKBACK_DAYS = 30;

/** 迁移 053 / 054 没跑时返回 "missing-schema"。 */
export async function getDailyReport(userId: string, date: string): Promise<DailyReport | "missing-schema"> {
  const since = new Date(new Date(`${date}T00:00:00+09:00`).getTime() - FOLLOWUP_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [briefs, recent, past, judged] = await Promise.all([
    supabaseAdmin
      .from("signal_briefs")
      .select("kind, items, overview, practice")
      .eq("user_id", userId)
      .eq("brief_date", date),
    supabaseAdmin
      .from("signal_briefs")
      .select("brief_date")
      .eq("user_id", userId)
      .in("kind", REPORT_SECTION_KINDS)
      .order("brief_date", { ascending: false })
      .limit(20),
    // 之前的报告（工具不算：工具没有"后续进展"）
    supabaseAdmin
      .from("signal_briefs")
      .select("brief_date, items")
      .eq("user_id", userId)
      .in("kind", REPORT_SECTION_KINDS.filter((k) => k !== "tools"))
      .gte("brief_date", since)
      .lt("brief_date", date),
    // 你对哪些新闻写过判断（押推论的不算，那是对某一步的判断）
    supabaseAdmin
      .from("signal_judgments")
      .select("signal_id, judgment, question, predictions!inner(due_at, outcome)")
      .eq("user_id", userId)
      .not("signal_id", "is", null)
      .not("question", "like", "【%"),
  ]);
  for (const r of [briefs, recent]) {
    if (r.error && /signal_briefs|overview|practice/.test(r.error.message)) return "missing-schema";
    if (r.error) throw new Error(r.error.message);
  }

  const section = (kind: SignalKind): ReportSection | null => {
    const row = (briefs.data ?? []).find((b) => b.kind === kind);
    return row
      ? {
          overview: (row.overview as string | null) ?? null,
          items: (row.items as BriefItem[]).map(cleanBriefItem),
          practice: (row.practice as BriefPracticeRow | null) ?? null,
        }
      : null;
  };

  const judgments = new Map<string, EarlierJudgment>();
  for (const j of judged.error ? [] : judged.data ?? []) {
    const p = (Array.isArray(j.predictions) ? j.predictions[0] : j.predictions) as { due_at: string; outcome: EarlierJudgment["outcome"] };
    judgments.set(j.signal_id as string, { judgment: j.judgment as string, due_at: p.due_at, outcome: p.outcome });
  }
  const todayItems = (briefs.data ?? [])
    .filter((b) => b.kind !== "tools" && REPORT_SECTION_KINDS.includes(b.kind as SignalKind))
    .flatMap((b) => b.items as BriefItem[]);
  const earlier = past.error
    ? {}
    : findEarlierMentions(
        todayItems,
        (past.data ?? []).map((r) => ({ brief_date: r.brief_date as string, items: (r.items as BriefItem[] | null) ?? [] })),
        judgments
      );

  return {
    date,
    earlier,
    news: section("news"),
    tools: section("tools"),
    voices: section("voices"),
    calendar: section("calendar"),
    money: section("money"),
    recentDates: Array.from(new Set((recent.data ?? []).map((r) => r.brief_date as string))).slice(0, 7),
  };
}
