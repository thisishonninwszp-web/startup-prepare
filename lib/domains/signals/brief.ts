import { supabaseAdmin } from "@/lib/supabase";
import {
  checkJapanComparisons,
  compareWithJapan,
  planJapanQueries,
  findSurprises,
  generateSignalBrief,
  groundBrief,
  linkPicksToQuestions,
  linkPicksToReader,
  type SignalReader,
  type AnalogCheck,
  type CompareSide,
  type JapanComparison,
  type OpportunitySource,
  type PestleDomain,
  type SituationFact,
} from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { mergeSources } from "./sources";
import { fetchArticle } from "./article";
import { cleanBriefItem } from "./filler";
import { fetchReadme } from "./github";
import { fetchDailyNews } from "./daily-news";
import { balanceBySource, isChinaSource, isGithubSource, isUsSource, kindSourceFilter, newsSourceLabel, type SignalKind } from "./feeds";
import { fetchGithubTools } from "./github";
import { fetchCnAppChart } from "./app-chart";
import { usableSummary } from "./summary";
import { SKILL_DEFS } from "@/lib/domains/self-model/skills";
import { loadSituationFacts } from "./reader-facts";
import { sendDailyEmail } from "./notify";
import { generateDigest } from "./digest";
import type { Breakdown } from "./breakdown-shared";

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
  /** 为什么它两个方向都有可能：练习题专挑"关键不确定"的事。早期数据没有。 */
  why_uncertain?: string;
  /** 多久能见分晓（按题目里写的时间点算）；判断表单默认选这一档。早期数据没有。 */
  horizon?: string;
  /** 判断前的拆解卡（他点了"先拆一拆"才有；见 breakdown-shared.ts）。 */
  breakdown?: Breakdown;
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
  /** "跟你"那一句说的是他的优势（处境让他比一般人更容易看懂或做成），不只是"有关"。 */
  personal_edge?: boolean;
  /** PESTLE 领域：一周下来查有没有长期漏掉的领域。 */
  domain?: PestleDomain;
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
  /** 日本这边还没有时："为什么是现在"（最近什么变了让它可能，或者还缺什么）。 */
  japan_why_now?: string;
  /** 查到日本已经有公司为这件事拉到投资（原文核对过）。 */
  japan_funded?: { company: string; url: string; excerpt: string };
  /** 反方向（日本的条目）：中国那边有没有同样的东西，以及核实、为什么是现在、有没有人拿到钱。 */
  china_side?: string;
  /** 出发地：中文媒体 china、美国媒体 us；日本的不写。japan 那组字段对两者都是"日本这边"。 */
  origin?: "china" | "us";
  china_check?: AnalogCheck;
  china_query?: string;
  china_why_now?: string;
  china_funded?: { company: string; url: string; excerpt: string };
  /** 德鲁克的创新机会来源（不协调、流程需要、结构变化、人口、认知、新知识）。 */
  opportunity?: OpportunitySource;
  /** 先例：这条是某个方向"有人试过的结果"时，它说明了什么。 */
  precedent?: string;
  /** 意外：材料本身写出了和预期反着来的结果（德鲁克说这是机会最丰富的来源）。原文由代码核对。 */
  surprise?: { expected: string; actual: string; quote: string };
  /** 这条直接关系到他在追的哪个问题（问题驱动）。问题文字另存一份：问题改名或收起后，旧报告照样看得懂。 */
  related_question?: { id: string; question: string; why: string };
  /** 代码删掉的空话（「这表明……」「，这意味着……」），留着在信息源体检页查删得对不对。早期数据没有。 */
  dropped?: string[];
};

/** 报告认得的问题：最近建的几个没收起的问题，连同现在的看法。 */
const MAX_LINKED_QUESTIONS = 8;

async function loadActiveQuestions(userId: string): Promise<{ id: string; question: string; view: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("signal_questions")
    .select("id, question")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LINKED_QUESTIONS);
  // 059 没跑就当没有问题
  if (error) return [];
  const ids = (data ?? []).map((q) => q.id as string);
  if (ids.length === 0) return [];
  const { data: views } = await supabaseAdmin
    .from("signal_question_views")
    .select("question_id, view, created_at")
    .in("question_id", ids)
    .order("created_at", { ascending: false });
  const latest = new Map<string, string>();
  for (const v of views ?? []) {
    if (!latest.has(v.question_id as string)) latest.set(v.question_id as string, v.view as string);
  }
  return (data ?? []).map((q) => ({ id: q.id as string, question: q.question as string, view: latest.get(q.id as string) ?? "" }));
}

/** 今天哪几条直接关系到他在追的问题。失败或没有问题就是空的，报告照常。 */
async function linkToQuestions(
  userId: string,
  picks: { index: number; headline: string; background: string }[]
): Promise<Map<number, { id: string; question: string; why: string }>> {
  const result = new Map<number, { id: string; question: string; why: string }>();
  try {
    const questions = await loadActiveQuestions(userId);
    for (const link of await linkPicksToQuestions(picks, questions)) {
      const q = questions[link.question];
      if (q) result.set(link.index, { id: q.id, question: q.question, why: link.why });
    }
  } catch (e) {
    console.error("brief question links failed", e);
  }
  return result;
}

/** 每句"日本这边"搜几篇资料（另外再搜这么多篇融资的）。 */
const JAPAN_SEARCH_RESULTS = 3;

/**
 * "日本这边有没有"（反方向是"中国那边"）：先只写搜索词 → 上网找（同时搜一次"有没有公司刚拉到投资"）→
 * 看着资料下结论 → 再逐句核实原文。以前是先凭印象写结论再去查，日本有它不知道的服务时只会写"没有"，查不到也发现不了。
 * 写搜索词失败就拿标题去搜；核实失败就保留结论、不带核实结果（页面上显示"没上网查过"）。
 */
export async function compareAndCheckJapan(
  picks: { index: number; headline: string; background: string }[],
  side: CompareSide = "japan"
): Promise<Map<number, JapanComparison>> {
  const result = new Map<number, JapanComparison>();
  if (picks.length === 0) return result;
  const planned = await planJapanQueries(picks, side).catch((e) => {
    console.error("brief japan queries failed, searching by headline", e);
    return null;
  });
  const queryOf = new Map((planned ?? []).map((q) => [q.index, q.query]));
  // 美国、反方向的提示会跳过不是产品、服务、做法的那几条：没给搜索词的不搜，省额度
  const searchable = planned && side !== "japan" ? picks.filter((p) => queryOf.has(p.index)) : picks;
  const sources = new Map(
    await Promise.all(
      searchable.map(async (p) => {
        const query = queryOf.get(p.index) || `${side === "china" ? "中国" : "日本"} ${p.headline}`;
        const [found, funding] = await Promise.all([
          webSearch(query, JAPAN_SEARCH_RESULTS).catch(() => []),
          webSearch(`${query} ${side === "china" ? "融资" : "資金調達"}`, JAPAN_SEARCH_RESULTS).catch(() => []),
        ]);
        return [p.index, mergeSources([found, funding], JAPAN_SEARCH_RESULTS * 2)] as const;
      })
    )
  );
  const comparisons = (await compareWithJapan(picks, side, sources)).map((c) => ({ ...c, query: queryOf.get(c.index) || c.query }));
  for (const c of comparisons) result.set(c.index, c);
  try {
    const checked = await checkJapanComparisons(
      comparisons.map((comparison) => ({ comparison, sources: sources.get(comparison.index) ?? [] })),
      side
    );
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

/**
 * 这一节今天的候选：最近一天半没处理过的条目，按链接去重，再按源轮流取（见 balanceBySource）。
 * rows 和 candidates 一一对应（candidates 是给 AI 看的那份）。
 */
export async function loadBriefCandidates(kind: SignalKind) {
  const since = new Date(Date.now() - CANDIDATE_WINDOW_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, source, title, url, raw_text")
    .or(kindSourceFilter(kind))
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
  const candidates = rows.map((r) => ({
    title: (r.title as string | null) ?? "",
    text: isGithubSource(r.source as string) ? (r.raw_text as string) : usableSummary(r.title as string, r.raw_text as string),
    source: newsSourceLabel(r.source as string),
    china: isChinaSource(r.source as string),
    us: isUsSource(r.source as string),
  }));
  return { rows, candidates };
}

/** 返回 null 表示最近一天半没有可挑的条目（还没抓过），什么都没生成。 */
export async function generateBrief(userId: string, kind: SignalKind): Promise<BriefItem[] | null> {
  const { rows, candidates } = await loadBriefCandidates(kind);
  if (rows.length === 0) return null;
  // 第一步：只看标题和简介挑 5 条、起草（不给 AI 看任何关于他的信息）
  const draft = await generateSignalBrief(kind, candidates);
  const { more, practice } = draft;

  // "日本这边有没有"要先上网搜再写，是最慢的一段：草稿一出来就开始，和下面读正文、重写并行。
  // 用的是草稿的标题和背景（只根据标题和简介写的），对"日本有没有"够用了。
  const japanComparisons = Promise.all([
    // 中国的条目和美国的条目都问"日本有没有"，结果放在同一组字段里，origin 区分出发地
    Promise.all([
      compareAndCheckJapan(draft.picks.filter((p) => candidates[p.index].china)),
      compareAndCheckJapan(draft.picks.filter((p) => candidates[p.index].us), "us"),
    ])
      .then(([cn, us]) => new Map([...Array.from(cn), ...Array.from(us)]))
      .catch((e) => {
        console.error("brief japan comparison failed", e);
        return new Map<number, JapanComparison>();
      }),
    // 反方向只在"今天的世界"里问：日本的条目讲的是一种产品、服务或做法时，中国那边有没有
    kind === "news"
      ? compareAndCheckJapan(draft.picks.filter((p) => !candidates[p.index].china && !candidates[p.index].us), "china").catch((e) => {
          console.error("brief china comparison failed", e);
          return new Map<number, JapanComparison>();
        })
      : Promise.resolve(new Map<number, JapanComparison>()),
  ]);

  // 第二步：只给挑中的这几条抓正文（工具抓 README），按正文重写，原文依据由代码核对。
  // 抓不到正文、或重写没有一句依据对得上的，保留草稿并标"只根据标题和简介写的"。
  // Google News 的跳转链接会先还原成原文地址再抓；还原出来的地址也换到报告里的"原文"链接上
  const articles = await Promise.all(
    draft.picks.map(async (p) => {
      const row = rows[p.index];
      if (isGithubSource(row.source as string)) {
        return { url: null, body: await fetchReadme((row.title as string | null) ?? "").catch(() => "") };
      }
      return fetchArticle((row.url as string | null) ?? null);
    })
  );
  const bodies = articles.map((a) => a.body);
  const resolvedUrl = new Map(draft.picks.map((p, i) => [p.index, articles[i].url]));
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
      })),
      kind === "news" || kind === "voices" || kind === "money"
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

  // 下面几件互不依赖，一起跑（cron 只有 60 秒）：等上面已经开始的"日本这边有没有"；单独找最多两条真跟他连得上的；
  // 哪几条直接关系到他在追的问题；找"意外"。失败都只是少了那一行。
  const [[japan, chinaSide], personal, related, surprises] = await Promise.all([
    japanComparisons,
    (async () => {
      const links = new Map<number, { personal: string; edge?: boolean }>();
      try {
        const reader = await loadSignalReader(userId);
        for (const link of await linkPicksToReader(picks, reader)) links.set(link.index, link);
      } catch (e) {
        console.error("brief personal links failed", e);
      }
      return links;
    })(),
    linkToQuestions(userId, picks),
    // 意外只在世界和一线的人里找：日程是定好的事，工具没有"预期"可言
    kind === "news" || kind === "voices" || kind === "money"
      ? findSurprises(
          picks.map((p, i) => ({
            index: p.index,
            title: candidates[p.index].title,
            summary: candidates[p.index].text,
            body: bodies[i] ?? "",
          }))
        ).catch((e) => {
          console.error("brief surprises failed", e);
          return [];
        })
      : Promise.resolve([]),
  ]);
  const surpriseOf = new Map(surprises.map((s) => [s.index, { expected: s.expected, actual: s.actual, quote: s.quote }]));

  const items: BriefItem[] = picks.map((p): BriefItem => {
    const row = rows[p.index];
    return {
      signal_id: row.id as string,
      title: (row.title as string | null) ?? "",
      url: resolvedUrl.get(p.index) ?? (row.url as string | null) ?? null,
      source: newsSourceLabel(row.source as string),
      headline: p.headline,
      background: p.background,
      for_you: p.forYou,
      personal: personal.get(p.index)?.personal,
      personal_edge: personal.get(p.index)?.edge || undefined,
      domain: p.domain,
      event: p.event,
      grounded: grounded.has(p.index),
      basis: grounded.get(p.index)?.basis,
      origin: candidates[p.index].china ? "china" : candidates[p.index].us ? "us" : undefined,
      japan: japan.get(p.index)?.japan,
      japan_check: japan.get(p.index)?.check,
      japan_query: japan.get(p.index)?.query || undefined,
      japan_why_now: japan.get(p.index)?.whyNow,
      japan_funded: japan.get(p.index)?.funded,
      china_side: chinaSide.get(p.index)?.japan,
      china_check: chinaSide.get(p.index)?.check,
      china_query: chinaSide.get(p.index)?.query || undefined,
      china_why_now: chinaSide.get(p.index)?.whyNow,
      china_funded: chinaSide.get(p.index)?.funded,
      related_question: related.get(p.index),
      surprise: surpriseOf.get(p.index),
      opportunity: p.opportunity,
      precedent: p.precedent,
    };
  }).map(cleanBriefItem);
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
              why_uncertain: practice.whyUncertain,
              horizon: practice.horizon,
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
  /** 早上的提醒邮件发给了谁 / 为什么没发。 */
  emails: string[];
  failed: string[];
};

/**
 * cron 每天跑一次：抓新闻、抓 GitHub，然后给最近一个月用过报告的人各生成四份。
 * 第一次要在页面上手动生成一次，之后每天早上自动出。
 */
/** 抓新闻和 GitHub。6:30 的定时任务先抓好，7 点生成报告时就不用再抓（cron 只有 60 秒）。 */
export async function fetchAllSignals(): Promise<{ news: number; tools: number; failed: string[] }> {
  const failed: string[] = [];
  const [news, tools, apps] = await Promise.allSettled([fetchDailyNews(), fetchGithubTools(), fetchCnAppChart()]);
  if (news.status === "rejected") failed.push(`新闻：${String(news.reason)}`);
  else failed.push(...news.value.failed);
  if (tools.status === "rejected") failed.push(`GitHub：${String(tools.reason)}`);
  return {
    news: (news.status === "fulfilled" ? news.value.inserted : 0) + (apps.status === "fulfilled" ? apps.value : 0),
    tools: tools.status === "fulfilled" ? tools.value.inserted : 0,
    failed,
  };
}

/** 最近这么久之内抓过，就不再抓。 */
const FRESH_FETCH_HOURS = 3;

async function fetchedRecently(): Promise<boolean> {
  const since = new Date(Date.now() - FRESH_FETCH_HOURS * 3_600_000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("external_signals")
    .select("id", { count: "exact", head: true })
    .gte("fetched_at", since);
  return !error && (count ?? 0) > 0;
}

/**
 * 五节分两个定时任务生成（Vercel 免费版每个任务 60 秒，五节一起要四五十秒，太险）：
 * 6:30 那个任务抓完新闻接着生成"谁在掏钱"，7 点这个生成另外四节再发邮件（实测各三四十秒，留出余量）。
 */
export const EARLY_KINDS = ["money"] as const;
/** 7 点的任务跑到这个时间以内，才顺手写今日总览（60 秒上限，留出发邮件的余量）。 */
const DIGEST_TIME_BUDGET_MS = 45_000;
const MORNING_KINDS = ["news", "calendar", "voices", "tools"] as const;

/** 给最近一个月用过报告的人，生成这几节。 */
export async function generateBriefsForRecentUsers(
  kinds: readonly SignalKind[]
): Promise<{ userIds: string[]; briefs: number; failed: string[] }> {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: recent, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("user_id")
    .gte("brief_date", monthAgo);
  if (error) throw new Error(error.message);
  const userIds = Array.from(new Set((recent ?? []).map((r) => r.user_id as string)));
  const failed: string[] = [];
  let briefs = 0;
  await Promise.all(
    userIds.flatMap((userId) =>
      kinds.map(async (kind) => {
        try {
          if ((await generateBrief(userId, kind)) !== null) briefs += 1;
        } catch (e) {
          failed.push(`精选（${kind}）：${e instanceof Error ? e.message : String(e)}`);
        }
      })
    )
  );
  return { userIds, briefs, failed };
}

export async function runDailySignals(): Promise<DailySignalsOutcome> {
  const startedAt = Date.now();
  const failed: string[] = [];
  // 6:30 那个定时任务已经抓过的话直接生成；没抓过（它失败了、或者手动触发）才在这里抓
  const fetched = (await fetchedRecently()) ? { news: 0, tools: 0, failed: [] as string[] } : await fetchAllSignals();
  failed.push(...fetched.failed);

  const { userIds, briefs, failed: briefFailed } = await generateBriefsForRecentUsers(MORNING_KINDS);
  failed.push(...briefFailed);

  // 今日总览要五节都好了才写；还有余量才在这里写（大约五六秒），不够就留给第一次打开报告页时写
  if (userIds.length > 0 && Date.now() - startedAt < DIGEST_TIME_BUDGET_MS) {
    try {
      await generateDigest(userIds[0], tokyoToday());
    } catch (e) {
      failed.push(`今日总览：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 报告都好了再发提醒邮件。单用户阶段收信地址在环境变量里，所以只给一个人发。
  const emails: string[] = [];
  if (userIds.length > 0) {
    try {
      const outcome = await sendDailyEmail(userIds[0]);
      emails.push(outcome.sent ? `发给 ${outcome.to}` : `没发：${outcome.reason}`);
    } catch (e) {
      failed.push(`提醒邮件：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    news: fetched.news,
    tools: fetched.tools,
    briefs,
    emails,
    failed,
  };
}
