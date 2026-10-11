import { supabaseAdmin } from "@/lib/supabase";
import { generateSignalBrief, type SignalReader } from "@/lib/ai";
import { fetchDailyNews } from "./daily-news";
import { newsSourceLabel, SIGNAL_KIND_PREFIX, type SignalKind } from "./feeds";
import { fetchGithubTools } from "./github";
import { usableSummary } from "./summary";

/**
 * 每日精选：从最近一天半没处理过的条目里，让 AI 挑 5 条并写清楚为什么。
 * 一天一份（新闻、工具各一份），存进 signal_briefs，页面只读。
 */

const CANDIDATE_WINDOW_HOURS = 36;
const MAX_CANDIDATES = 80;

export type BriefItem = {
  signal_id: string;
  title: string;
  url: string | null;
  source: string;
  headline: string;
  background: string;
  for_you: string;
};

/** 日本时间的今天（YYYY-MM-DD）。cron 在 UTC 22 点跑，正好是日本早上 7 点。 */
export function tokyoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(now);
}

/** AI 读新闻时知道的"你"：自己写的背景 + 假设/验证中的想法 + 没归档的梦想（只取标题）。 */
export async function loadSignalReader(userId: string): Promise<SignalReader> {
  const [profile, ideas, dreams] = await Promise.all([
    supabaseAdmin.from("signal_profiles").select("context").eq("user_id", userId).maybeSingle(),
    supabaseAdmin
      .from("ideas")
      .select("title")
      .eq("user_id", userId)
      .in("status", ["假设", "验证中"])
      .order("last_activity_at", { ascending: false })
      .limit(8),
    supabaseAdmin
      .from("dream_cases")
      .select("title")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);
  for (const r of [profile, ideas, dreams]) if (r.error) throw new Error(r.error.message);
  return {
    context: (profile.data?.context as string | undefined) ?? "",
    ideas: (ideas.data ?? []).map((r) => r.title as string),
    dreams: (dreams.data ?? []).map((r) => r.title as string),
  };
}

export async function generateBrief(userId: string, kind: SignalKind): Promise<BriefItem[]> {
  const since = new Date(Date.now() - CANDIDATE_WINDOW_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, source, title, url, raw_text")
    .like("source", `${SIGNAL_KIND_PREFIX[kind]}%`)
    .eq("status", "pending")
    .gte("fetched_at", since)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MAX_CANDIDATES);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const rows = (data ?? []).filter((r) => {
    const key = (r.url as string | null) ?? (r.id as string);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (rows.length === 0) return [];

  const reader = await loadSignalReader(userId);
  const candidates = rows.map((r) => ({
    title: (r.title as string | null) ?? "",
    text: kind === "news" ? usableSummary(r.title as string, r.raw_text as string) : (r.raw_text as string),
    source: newsSourceLabel(r.source as string),
  }));
  const picks = await generateSignalBrief(kind, candidates, reader);

  const items: BriefItem[] = picks.map((p) => {
    const row = rows[p.index];
    return {
      signal_id: row.id as string,
      title: (row.title as string | null) ?? "",
      url: (row.url as string | null) ?? null,
      source: newsSourceLabel(row.source as string),
      headline: p.headline,
      background: p.background,
      for_you: p.forYou,
    };
  });

  const { error: saveError } = await supabaseAdmin
    .from("signal_briefs")
    .upsert(
      { user_id: userId, brief_date: tokyoToday(), kind, items },
      { onConflict: "user_id,brief_date,kind" }
    );
  if (saveError) throw new Error(saveError.message);
  return items;
}

export type DailySignalsOutcome = {
  news: number;
  tools: number;
  briefs: number;
  failed: string[];
};

/**
 * cron 每天跑一次：抓新闻、抓 GitHub，然后给每个写过背景的用户生成两份精选。
 * 单用户阶段"用户"= signal_profiles 里有行的人；没写过背景的不生成，页面上可以手动生成。
 */
export async function runDailySignals(): Promise<DailySignalsOutcome> {
  const failed: string[] = [];
  const [news, tools] = await Promise.allSettled([fetchDailyNews(), fetchGithubTools()]);
  if (news.status === "rejected") failed.push(`新闻：${String(news.reason)}`);
  else failed.push(...news.value.failed);
  if (tools.status === "rejected") failed.push(`GitHub：${String(tools.reason)}`);

  const { data: profiles, error } = await supabaseAdmin.from("signal_profiles").select("user_id");
  if (error) throw new Error(error.message);

  let briefs = 0;
  const jobs = (profiles ?? []).flatMap((p) =>
    (["news", "tools"] as const).map(async (kind) => {
      try {
        if ((await generateBrief(p.user_id as string, kind)).length > 0) briefs += 1;
      } catch (e) {
        failed.push(`精选（${kind}）：${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );
  await Promise.all(jobs);

  return {
    news: news.status === "fulfilled" ? news.value.inserted : 0,
    tools: tools.status === "fulfilled" ? tools.value.inserted : 0,
    briefs,
    failed,
  };
}
