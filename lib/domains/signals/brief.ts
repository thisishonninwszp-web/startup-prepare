import { supabaseAdmin } from "@/lib/supabase";
import {
  checkJapanComparisons,
  compareWithJapan,
  generateSignalBrief,
  groundBrief,
  linkPicksToReader,
  type SignalReader,
  type AnalogCheck,
  type JapanComparison,
  type SituationFact,
} from "@/lib/ai";
import { tavilySearch } from "@/lib/external";
import { fetchArticleBody } from "./article";
import { fetchReadme } from "./github";
import { fetchDailyNews } from "./daily-news";
import { balanceBySource, isChinaSource, newsSourceLabel, SIGNAL_KIND_PREFIX, type SignalKind } from "./feeds";
import { fetchGithubTools } from "./github";
import { usableSummary } from "./summary";
import { SKILL_DEFS } from "@/lib/domains/self-model/skills";
import { loadSituationFacts } from "./reader-facts";

/**
 * 每日精选：从最近一天半没处理过的条目里，让 AI 挑 5 条并写清楚为什么。
 * 一天一份（新闻、工具各一份），存进 signal_briefs，页面只读。
 */

const CANDIDATE_WINDOW_HOURS = 36;
const MAX_CANDIDATES = 80;
/** 先多取一些，再按源轮流挑出 MAX_CANDIDATES 条（见 balanceBySource）。 */
const FETCH_CANDIDATES = 400;
/** 读最近多少天的观察。 */
const READER_OBSERVATION_DAYS = 30;

/** 今天的练习题：报告里挑出的一条新闻 + 一个能事后检验的问题。 */
export type BriefPracticeRow = {
  signal_id: string;
  question: string;
  check_how: string;
};

export type BriefItem = {
  signal_id: string;
  title: string;
  url: string | null;
  source: string;
  headline: string;
  background: string;
  /** 每条都有、不涉及他的那一句（主要影响谁 / 可以找谁聊 / 可以拿它试什么）。 */
  for_you: string;
  /** "跟你"：只有代码核对过确实连得上"关于他"时才有；早期数据没有这个字段。 */
  personal?: string;
  /** 这件事的短标签（去重用）。早期数据没有。 */
  event?: string;
  /** true = "也值得一看"那一行：只有 headline，没有 background / for_you。 */
  extra?: boolean;
  /**
   * true = 背景是读了正文写的，basis 是代码核对过的原文依据；
   * false = 没读到正文（比如 Google News 的跳转链接），背景只根据标题和简介写。早期数据没有这个字段。
   */
  grounded?: boolean;
  basis?: string[];
  /** 只有中文媒体的条目有：日本这边有没有类似的做法、没有的话卡在哪。 */
  japan?: string;
  /** "日本这边"上网核实的结果：查到出处 / 原来说错了已改 / 没查到。没有这个字段 = 没核实过。 */
  japan_check?: AnalogCheck;
  /** 核实"日本这边"用的日语搜索词；页面上"自己去查"也用它。 */
  japan_query?: string;
};

/** 每句"日本这边"搜几篇资料来核实。 */
const JAPAN_SEARCH_RESULTS = 3;

/**
 * 中文媒体的那几条：先让 AI 说"日本这边有没有"，再拿它给的日语搜索词上网查，逐句核实。
 * 核实失败就保留原来的说法、不带核实结果（页面上显示"没上网查过"）。
 */
async function compareAndCheckJapan(
  picks: { index: number; headline: string; background: string }[]
): Promise<Map<number, JapanComparison>> {
  const result = new Map<number, JapanComparison>();
  const comparisons = await compareWithJapan(picks);
  for (const c of comparisons) result.set(c.index, c);
  try {
    const sources = await Promise.all(
      comparisons.map(async (c) => {
        const headline = picks.find((p) => p.index === c.index)?.headline ?? "";
        try {
          const found = await tavilySearch(c.query || `日本 ${headline}`, JAPAN_SEARCH_RESULTS);
          return found.filter((r) => r.url && r.content);
        } catch {
          return [];
        }
      })
    );
    const checked = await checkJapanComparisons(comparisons.map((comparison, i) => ({ comparison, sources: sources[i] })));
    for (const c of checked) result.set(c.index, c);
  } catch (e) {
    console.error("brief japan check failed, keeping unchecked", e);
  }
  return result;
}

/** 日本时间的今天（YYYY-MM-DD）。cron 在 UTC 22 点跑，正好是日本早上 7 点。 */
export function tokyoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(now);
}

/**
 * AI 读新闻时知道的"你"，全部从你做过的事里拼出来：
 * 最近的观察、/self 里工作假设及以上的假设、点亮的技能、假设/验证中的想法、没归档的梦想，
 * 加上从自述里抽出的处境事实（见 reader-facts.ts，只抽事实、带出处）。写法画像不读。
 */
export async function loadSignalReader(
  userId: string,
  /** 调用方已经抽好的处境事实（页面上要显示出处，先抽一次传进来，免得重复调 AI）。 */
  preloadedFacts?: SituationFact[]
): Promise<SignalReader> {
  const since = new Date(Date.now() - READER_OBSERVATION_DAYS * 86_400_000).toISOString();
  const [facts, observations, hypotheses, nodes, customSkills, ideas, dreams] = await Promise.all([
    // 抽事实失败不拖垮报告，只是少了处境这一块
    preloadedFacts ??
      loadSituationFacts(userId).catch((e) => {
        console.error("situation facts failed", e);
        return [] as SituationFact[];
      }),
    supabaseAdmin
      .from("observations")
      .select("raw_text")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("self_hypotheses")
      .select("statement")
      .eq("user_id", userId)
      .in("tier", ["working", "load_bearing"])
      .limit(10),
    supabaseAdmin.from("self_skill_nodes").select("skill_key").eq("user_id", userId),
    supabaseAdmin.from("self_custom_skills").select("key, name").eq("user_id", userId),
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
  for (const r of [observations, hypotheses, nodes, customSkills, ideas, dreams]) {
    if (r.error) throw new Error(r.error.message);
  }

  const skillNames = new Map<string, string>([
    ...SKILL_DEFS.map((d) => [d.key, d.name] as const),
    ...(customSkills.data ?? []).map((c) => [c.key as string, c.name as string] as const),
  ]);
  const skills = Array.from(new Set((nodes.data ?? []).map((n) => n.skill_key as string)))
    .map((key) => skillNames.get(key))
    .filter((name): name is string => !!name);

  return {
    facts: facts.map((f) => f.fact),
    observations: (observations.data ?? []).map((o) => (o.raw_text as string).replace(/\s+/g, " ").slice(0, 100)),
    hypotheses: (hypotheses.data ?? []).map((h) => h.statement as string),
    skills,
    ideas: (ideas.data ?? []).map((r) => r.title as string),
    dreams: (dreams.data ?? []).map((r) => r.title as string),
  };
}

/** 返回 null 表示最近一天半没有可挑的条目（还没抓过），什么都没生成。 */
export async function generateBrief(userId: string, kind: SignalKind): Promise<BriefItem[] | null> {
  const since = new Date(Date.now() - CANDIDATE_WINDOW_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, source, title, url, raw_text")
    .like("source", `${SIGNAL_KIND_PREFIX[kind]}%`)
    .eq("status", "pending")
    .gte("fetched_at", since)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(FETCH_CANDIDATES);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const unique = (data ?? []).filter((r) => {
    const key = (r.url as string | null) ?? (r.id as string);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rows = balanceBySource(unique as { source: string; [k: string]: unknown }[], MAX_CANDIDATES);
  if (rows.length === 0) return null;

  const candidates = rows.map((r) => ({
    title: (r.title as string | null) ?? "",
    text: kind === "tools" ? (r.raw_text as string) : usableSummary(r.title as string, r.raw_text as string),
    source: newsSourceLabel(r.source as string),
    china: isChinaSource(r.source as string),
  }));
  // 第一步：只看标题和简介挑 5 条、起草（不给 AI 看任何关于他的信息）
  const draft = await generateSignalBrief(kind, candidates);
  const { more, practice } = draft;

  // 第二步：只给挑中的这几条抓正文（工具抓 README），按正文重写，原文依据由代码核对。
  // 抓不到正文、或重写没有一句依据对得上的，保留草稿并标"只根据标题和简介写的"。
  const bodies = await Promise.all(
    draft.picks.map((p) => {
      const row = rows[p.index];
      return kind === "tools"
        ? fetchReadme((row.title as string | null) ?? "").catch(() => "")
        : fetchArticleBody((row.url as string | null) ?? null);
    })
  );
  const grounded = new Map<number, { headline: string; background: string; forYou: string; basis: string[] }>();
  let overview = draft.overview;
  try {
    const result = await groundBrief(
      draft.picks.map((p, i) => ({
        index: p.index,
        title: candidates[p.index].title,
        summary: candidates[p.index].text,
        body: bodies[i],
        draft: { headline: p.headline, background: p.background, forYou: p.forYou },
      }))
    );
    for (const g of result.items) grounded.set(g.index, g);
    if (result.items.length > 0 && result.overview) overview = result.overview;
  } catch (e) {
    console.error("brief grounding failed, keeping drafts", e);
  }
  const picks = draft.picks.map((p) => {
    const g = grounded.get(p.index);
    return g ? { ...p, headline: g.headline, background: g.background, forYou: g.forYou } : p;
  });

  // 下面两件互不依赖，一起跑（cron 只有 60 秒）：
  // 中文媒体的那几条问"日本这边有没有"并上网核实；单独找最多两条真跟他连得上的。失败都只是少了那一行。
  const [japan, personal] = await Promise.all([
    compareAndCheckJapan(picks.filter((p) => candidates[p.index].china)).catch((e) => {
      console.error("brief japan comparison failed", e);
      return new Map<number, JapanComparison>();
    }),
    (async () => {
      const links = new Map<number, string>();
      try {
        const reader = await loadSignalReader(userId);
        for (const link of await linkPicksToReader(picks, reader)) links.set(link.index, link.personal);
      } catch (e) {
        console.error("brief personal links failed", e);
      }
      return links;
    })(),
  ]);

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
      personal: personal.get(p.index),
      event: p.event,
      grounded: grounded.has(p.index),
      basis: grounded.get(p.index)?.basis,
      japan: japan.get(p.index)?.japan,
      japan_check: japan.get(p.index)?.check,
      japan_query: japan.get(p.index)?.query || undefined,
    };
  });
  // "也值得一看"跟精选存在同一个数组里，用 extra 标出来，不用加列
  for (const m of more) {
    const row = rows[m.index];
    items.push({
      signal_id: row.id as string,
      title: (row.title as string | null) ?? "",
      url: (row.url as string | null) ?? null,
      source: newsSourceLabel(row.source as string),
      headline: m.headline,
      background: "",
      for_you: "",
      event: m.event,
      extra: true,
    });
  }

  const { error: saveError } = await supabaseAdmin
    .from("signal_briefs")
    .upsert(
      {
        user_id: userId,
        brief_date: tokyoToday(),
        kind,
        items,
        overview,
        practice: practice
          ? {
              signal_id: rows[practice.index].id as string,
              question: practice.question,
              check_how: practice.checkHow,
            }
          : null,
      },
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
 * cron 每天跑一次：抓新闻、抓 GitHub，然后给最近一个月用过报告的人各生成四份。
 * 第一次要在页面上手动生成一次，之后每天早上自动出。
 */
export async function runDailySignals(): Promise<DailySignalsOutcome> {
  const failed: string[] = [];
  const [news, tools] = await Promise.allSettled([fetchDailyNews(), fetchGithubTools()]);
  if (news.status === "rejected") failed.push(`新闻：${String(news.reason)}`);
  else failed.push(...news.value.failed);
  if (tools.status === "rejected") failed.push(`GitHub：${String(tools.reason)}`);

  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: recent, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("user_id")
    .gte("brief_date", monthAgo);
  if (error) throw new Error(error.message);
  const userIds = Array.from(new Set((recent ?? []).map((r) => r.user_id as string)));

  let briefs = 0;
  const jobs = userIds.flatMap((userId) =>
    (["news", "calendar", "voices", "tools"] as const).map(async (kind) => {
      try {
        if ((await generateBrief(userId, kind)) !== null) briefs += 1;
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
