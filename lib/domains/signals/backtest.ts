import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { forecastFromPerspective, planReferenceClass, prepareHistoryQuestion, type Perspective, type ReferenceClass } from "@/lib/ai";
import { medianProbability } from "./forecast-shared";
import { gdeltNews } from "./gdelt";
import {
  applyPlatt,
  backtestReport,
  drillStats,
  usableCalibration,
  type BacktestReport,
  type DrillStats,
  type Platt,
} from "./calibration-shared";
import {
  chooseAsOf,
  cleanSearchQuery,
  historyEligible,
  historyPriority,
  HISTORY_MAX_P,
  HISTORY_MIN_P,
  HISTORY_TARGET,
  parseManifoldResolved,
  parsePolymarketResolved,
  probAt,
  type HistoryCandidate,
  type HistoryNews,
} from "./history-shared";

/**
 * 历史回测和校准练习（迁移 094；原则 1 例外四：概率和分数只用于对世界事件的预测）。
 * 后台（/api/cron/jobs/history，GitHub Actions 每 3 小时）一批批进题：从 Manifold、Polymarket 取 2025 年 3 月以后开、已经结算的题，
 * 选开盘后的某一天当「今天」，取那天市场给的几成、那天以前的新闻（GDELT），AI 三种思路各说几成（今天就是那天、资料只有那些新闻）。
 * 同一批题给他练（先写基准率、再写这件事几成、马上揭晓），也拿来学 AI 的校准。
 */

export const HISTORY_MISSING = "迁移 094 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/094_forecast_history.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /forecast_history|does not exist|schema cache/.test(error.message);
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json", "User-Agent": "IdeaOS/1.0" } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ── 进候选（不调 AI） ─────────────────────────────────────────────────────────

/** Manifold 按这些词各搜一次已经结算的题（空字符串 = 不限主题的最热门）。 */
const MANIFOLD_TERMS = ["", "Japan", "China", "Bank of Japan", "yen", "Taiwan", "Korea", "Fed", "inflation", "tariff", "recession", "OpenAI", "Nvidia", "Apple", "Tesla", "election", "prime minister", "oil"];
/** Polymarket 按成交额从大到小翻几页（一页 100 道）。 */
const POLYMARKET_PAGES = 10;

async function fetchCandidates(): Promise<HistoryCandidate[]> {
  const manifold = MANIFOLD_TERMS.map(async (term) => {
    const json = await getJson(
      `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(term)}&filter=resolved&contractType=BINARY&sort=most-popular&limit=200`
    );
    return (Array.isArray(json) ? json : []).map(parseManifoldResolved);
  });
  const polymarket = Array.from({ length: POLYMARKET_PAGES }, async (_, page) => {
    const json = await getJson(
      `https://gamma-api.polymarket.com/markets?closed=true&limit=100&offset=${page * 100}&order=volumeNum&ascending=false&end_date_min=2025-03-15T00:00:00Z`
    );
    return (Array.isArray(json) ? json : []).map(parsePolymarketResolved);
  });
  const lists = await Promise.all([...manifold, ...polymarket]);
  return Array.from(new Map(lists.flat().filter((c): c is HistoryCandidate => c !== null).map((c) => [`${c.platform}:${c.marketId}`, c])).values());
}

/** 能进题库的候选存成 pending（同一道题只存一次）。返回新存了几道。 */
async function sourceCandidates(today: string): Promise<number> {
  const rows = (await fetchCandidates())
    .filter((c) => historyEligible(c, today))
    .map((c) => ({
      platform: c.platform,
      market_id: c.marketId,
      url: c.url,
      token: c.token,
      original_title: c.title,
      description: c.description || null,
      created_on: c.createdOn,
      as_of: chooseAsOf(c.createdOn, c.resolveOn) as string,
      resolve_on: c.resolveOn,
      outcome: c.outcome,
      depth: c.depth,
      priority: historyPriority(c.title),
    }));
  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("forecast_history")
      .upsert(rows.slice(i, i + 200), { onConflict: "platform,market_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(missing(error) ? HISTORY_MISSING : error.message);
    added += data?.length ?? 0;
  }
  return added;
}

// ── 准备一道（那天的价格、中文题目、那天以前的新闻、AI 三种思路） ─────────────────

type PendingRow = {
  id: string;
  platform: "manifold" | "polymarket";
  market_id: string;
  token: string | null;
  original_title: string;
  description: string | null;
  as_of: string;
  resolve_on: string;
};

/** 那天市场给的几成；那天以前还没有成交返回 null。Manifold 顺带取结算说明（搜索结果里没有）。 */
async function marketAsOf(row: PendingRow): Promise<{ p: number | null; description: string }> {
  const cut = Date.parse(`${row.as_of}T00:00:00Z`);
  if (row.platform === "manifold") {
    const [bets, market] = await Promise.all([
      getJson(`https://api.manifold.markets/v0/bets?contractId=${encodeURIComponent(row.market_id)}&beforeTime=${cut}&limit=1&order=desc`),
      getJson(`https://api.manifold.markets/v0/market/${encodeURIComponent(row.market_id)}`),
    ]);
    const last = Array.isArray(bets) ? (bets[0] as { probAfter?: number } | undefined) : undefined;
    const description = typeof (market as { textDescription?: unknown } | null)?.textDescription === "string" ? (market as { textDescription: string }).textDescription.slice(0, 1500) : row.description ?? "";
    return { p: typeof last?.probAfter === "number" ? last.probAfter : null, description };
  }
  if (!row.token) return { p: null, description: row.description ?? "" };
  const json = (await getJson(
    `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(row.token)}&startTs=${Math.floor(cut / 1000) - 14 * 86_400}&endTs=${Math.floor(cut / 1000)}&fidelity=60`
  )) as { history?: { t: number; p: number }[] } | null;
  return { p: probAt(json?.history ?? [], row.as_of), description: row.description ?? "" };
}

const PERSPECTIVES: Perspective[] = ["outside", "inside", "devil"];

async function skip(id: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin.from("forecast_history").update({ status: "skipped", skip_reason: reason, prepared_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** 准备好一道返回 true；不收（那天几乎定了、题目没译成、AI 没判断成）返回 false。 */
async function prepareOne(row: PendingRow): Promise<boolean> {
  const { p, description } = await marketAsOf(row);
  if (p === null) return skip(row.id, "那天以前还没有成交").then(() => false);
  if (p < HISTORY_MIN_P || p > HISTORY_MAX_P) return skip(row.id, "那天市场几乎已经定了").then(() => false);
  const prepared = await prepareHistoryQuestion({ question: row.original_title, description, asOf: row.as_of }).catch(() => null);
  if (!prepared) return skip(row.id, "题目没译成").then(() => false);
  const query = cleanSearchQuery(prepared.search);
  const news: HistoryNews[] = query ? await gdeltNews(query, row.as_of) : [];
  const input = {
    title: prepared.title,
    criteria: prepared.criteria,
    // 不给实际结算日（提前结算的题，结算日就透露了答案）：截止只按题目里写的
    resolveOn: "以题目里写的为准",
    today: row.as_of,
    context: "",
    sources: news.map((n) => ({ title: n.title, url: n.url, content: `${n.date} ${n.domain}：${n.title}` })),
  };
  const [results, ref] = await Promise.all([
    Promise.allSettled(PERSPECTIVES.map((persp) => forecastFromPerspective(persp, input))),
    planReferenceClass({ title: prepared.title, criteria: prepared.criteria, asOf: row.as_of }).catch(() => null),
  ]);
  const ok = results.flatMap((r, i) => (r.status === "fulfilled" ? [{ key: PERSPECTIVES[i], p: r.value.probability, reason: r.value.reason }] : []));
  const median = ok.length >= 2 ? medianProbability(ok.map((o) => o.p)) : null;
  if (median === null) return skip(row.id, "AI 没判断成").then(() => false);
  const { error } = await supabaseAdmin
    .from("forecast_history")
    .update({
      status: "ready",
      description: description || null,
      title: prepared.title,
      criteria: prepared.criteria,
      category: prepared.category,
      market_prob: p,
      news,
      ai: { ...Object.fromEntries(ok.map((o) => [o.key, { p: o.p, reason: o.reason }])), median, v: PREPARE_VERSION, ...(ref ? { ref } : {}) },
      prepared_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * 准备的版本：2026-10-23 以前准备的题，译题和 AI 都看到了实际结算日（提前结算的题会透露答案），作废重做。
 * 没带这个版本号的 ready 题改回 pending，他在这些题上的练习一并删掉（题目会重新译，旧答案对不上了）。
 */
const PREPARE_VERSION = 2;

async function redoOldPreparations(): Promise<number> {
  const { data, error } = await supabaseAdmin.from("forecast_history").select("id").eq("status", "ready").is("ai->>v", null).limit(1000);
  if (error) throw new Error(missing(error) ? HISTORY_MISSING : error.message);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { error: answersError } = await supabaseAdmin.from("forecast_history_answers").delete().in("question_id", ids);
  if (answersError) throw new Error(answersError.message);
  const { error: resetError } = await supabaseAdmin.from("forecast_history").update({ status: "pending", ai: null, news: null, title: null, criteria: null, prepared_at: null }).in("id", ids);
  if (resetError) throw new Error(resetError.message);
  return ids.length;
}

async function countStatus(status: "ready" | "pending"): Promise<number> {
  const { count, error } = await supabaseAdmin.from("forecast_history").select("id", { count: "exact", head: true }).eq("status", status);
  if (error) throw new Error(missing(error) ? HISTORY_MISSING : error.message);
  return count ?? 0;
}

/**
 * 后台一步：题库够了就停；没有待准备的先去进一批候选；然后按时间预算一道道准备（一道二十秒左右：译题、查新闻要隔 5 秒、AI 三种思路一起）。
 */
export async function runHistoryStep(today: string, startBeforeMs: number): Promise<{ done: boolean; did: number; remaining: number; note?: string }> {
  const started = Date.now();
  await redoOldPreparations();
  const refs = await backfillReferences(started, Math.min(startBeforeMs, REFERENCE_BUDGET_MS));
  const ready = await countStatus("ready");
  if (ready >= HISTORY_TARGET) return { done: refs.remaining === 0 || refs.did === 0, did: 0, remaining: refs.remaining, note: `题库满了（${ready} 道）；补「这一类事」${refs.did} 道` };
  const pendingRows = async () => {
    const { data, error } = await supabaseAdmin
      .from("forecast_history")
      .select("id, platform, market_id, token, original_title, description, as_of, resolve_on")
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .order("depth", { ascending: false })
      .limit(40);
    if (error) throw new Error(missing(error) ? HISTORY_MISSING : error.message);
    return (data ?? []) as PendingRow[];
  };
  let todo = await pendingRows();
  if (todo.length === 0) {
    const added = await sourceCandidates(today);
    if (added === 0) return { done: true, did: 0, remaining: 0, note: "没有新的候选" };
    todo = await pendingRows();
  }
  let did = 0;
  let processed = 0;
  for (const row of todo) {
    if (processed > 0 && Date.now() - started > startBeforeMs) break;
    if (ready + did >= HISTORY_TARGET) break;
    if (await prepareOne(row)) did += 1;
    processed += 1;
  }
  const remaining = await countStatus("pending");
  return { done: remaining === 0 || ready + did >= HISTORY_TARGET, did, remaining };
}

// ── 「这一类事」：校准练习第一步说清楚问的是哪一类（2026-10-24） ─────────────────

/** 一次后台最多花多久补老题的「这一类事」（剩下的时间留给准备新题）。 */
const REFERENCE_BUDGET_MS = 90_000;
/** 一次并排补几道（一道一次不上网的 AI 调用，两三秒）。 */
const REFERENCE_PARALLEL = 5;

type RefRow = { id: string; title: string; criteria: string; as_of: string; ai: AiView };

/** 补一道的「这一类事」，存在 ai.ref（不加列）。补不出来返回 null，练习页退回一句通用的说明。 */
async function saveReference(row: RefRow): Promise<ReferenceClass | null> {
  const ref = await planReferenceClass({ title: row.title, criteria: row.criteria, asOf: row.as_of }).catch(() => null);
  if (!ref) return null;
  const { error } = await supabaseAdmin.from("forecast_history").update({ ai: { ...row.ai, ref } }).eq("id", row.id);
  if (error) console.error("history reference", error.message);
  return ref;
}

/** 后台：老题还没有「这一类事」的，按练习出题的顺序（跟日本、中国、经济有关的先）补，几道一起。 */
async function backfillReferences(started: number, budgetMs: number): Promise<{ did: number; remaining: number }> {
  const { data, error, count } = await supabaseAdmin
    .from("forecast_history")
    .select("id, title, criteria, as_of, ai", { count: "exact" })
    .eq("status", "ready")
    .is("ai->>ref", null)
    .order("priority", { ascending: false })
    .limit(150);
  if (error) throw new Error(missing(error) ? HISTORY_MISSING : error.message);
  const rows = ((data ?? []) as RefRow[]).filter((r) => r.ai && r.title && r.criteria);
  let did = 0;
  for (let i = 0; i < rows.length; i += REFERENCE_PARALLEL) {
    if (Date.now() - started > budgetMs) break;
    const saved = await Promise.all(rows.slice(i, i + REFERENCE_PARALLEL).map(saveReference));
    did += saved.filter(Boolean).length;
  }
  return { did, remaining: Math.max(0, (count ?? rows.length) - did) };
}

// ── 校准练习 ────────────────────────────────────────────────────────────────

export type AiView = {
  median: number;
  outside?: { p: number; reason: string };
  inside?: { p: number; reason: string };
  devil?: { p: number; reason: string };
  /** 「这一类事」：说成一类具体的事 + 那天以前的几个同类（只有名字和年份）。 */
  ref?: ReferenceClass;
};

/** 练习时给他看的：不带实际结算日（提前结算的题，结算日就透露了答案）。 */
export type DrillQuestion = {
  id: string;
  title: string;
  criteria: string;
  category: string | null;
  as_of: string;
  news: HistoryNews[];
  /** 第一步「这一类事」问的是哪一类（没补出来是 null）。 */
  ref: ReferenceClass | null;
};

export type DrillReveal = {
  outcome: boolean;
  market: number | null;
  ai: AiView | null;
  /** 按回测学到的校准拉过的 AI（学到了、而且在没见过的题上确实更准才有）。 */
  aiCalibrated: number | null;
  you: number | null;
  baseRate: number | null;
  knew: boolean;
  url: string | null;
  originalTitle: string;
  /** 市场实际结算的那天（揭晓以后才给）。 */
  resolvedOn: string;
};

/** 同一个人每次的顺序固定、不同的人不一样（不用随机数，刷新也不变）。 */
function order(id: string, userId: string): number {
  let h = 2166136261;
  for (const ch of `${id}:${userId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** 下一道没做过的：跟日本、中国、经济有关的先出，同一档里每人顺序不同。迁移没跑返回 "missing-schema"，没题了返回 null。 */
export async function nextDrillQuestion(userId: string): Promise<DrillQuestion | null | "missing-schema"> {
  const [ready, done] = await Promise.all([
    selectAll<{ id: string; priority: number }>((a, b) => supabaseAdmin.from("forecast_history").select("id, priority").eq("status", "ready").order("id").range(a, b)),
    selectAll<{ question_id: string }>((a, b) => supabaseAdmin.from("forecast_history_answers").select("question_id").eq("user_id", userId).order("question_id").range(a, b)),
  ]);
  const error = ready.error ?? done.error;
  if (error) {
    if (missing(error)) return "missing-schema";
    throw new Error(error.message);
  }
  const answered = new Set(done.data.map((r) => r.question_id));
  const next = ready.data
    .filter((r) => !answered.has(r.id))
    .sort((a, b) => b.priority - a.priority || order(a.id, userId) - order(b.id, userId))[0];
  if (!next) return null;
  const { data, error: rowError } = await supabaseAdmin.from("forecast_history").select("id, title, criteria, category, as_of, news, ai").eq("id", next.id).single();
  if (rowError) throw new Error(rowError.message);
  const row = data as Omit<DrillQuestion, "news" | "ref"> & { news: HistoryNews[] | null; ai: AiView };
  // 后台还没补到这道：现在补（两三秒），补不出来就用通用的说明
  const ref = row.ai?.ref ?? (await saveReference({ id: row.id, title: row.title, criteria: row.criteria, as_of: row.as_of, ai: row.ai }));
  return { id: row.id, title: row.title, criteria: row.criteria, category: row.category, as_of: row.as_of, news: row.news ?? [], ref };
}

const isTier = (p: number | null) => p === null || (Number.isFinite(p) && p > 0 && p < 1);

/** 他交了这一道（或者说「我记得结果」）：存下来（交过的不改），揭晓。 */
export async function answerDrill(
  userId: string,
  questionId: string,
  input: { baseRate: number | null; probability: number | null; knew: boolean }
): Promise<DrillReveal> {
  if (!isTier(input.baseRate) || !isTier(input.probability)) throw new Error("几成要在 0 到 1 之间");
  if (!input.knew && input.probability === null) throw new Error("先选这件事你觉得几成");
  const { error } = await supabaseAdmin.from("forecast_history_answers").upsert(
    {
      question_id: questionId,
      user_id: userId,
      base_rate: input.baseRate,
      probability: input.knew ? null : input.probability,
      knew: input.knew,
    },
    { onConflict: "question_id,user_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(missing(error) ? HISTORY_MISSING : error.message);
  const [{ data: row, error: rowError }, { data: mine }] = await Promise.all([
    supabaseAdmin.from("forecast_history").select("outcome, market_prob, ai, url, original_title, resolve_on").eq("id", questionId).single(),
    supabaseAdmin.from("forecast_history_answers").select("base_rate, probability, knew").eq("question_id", questionId).eq("user_id", userId).single(),
  ]);
  if (rowError) throw new Error(rowError.message);
  const ai = (row.ai as AiView | null) ?? null;
  const calibration = await aiCalibration().catch(() => null);
  return {
    outcome: row.outcome as boolean,
    market: row.market_prob === null ? null : Number(row.market_prob),
    ai,
    aiCalibrated: ai && calibration ? Math.round(applyPlatt(ai.median, calibration) * 100) / 100 : null,
    you: mine?.probability === null || mine?.probability === undefined ? null : Number(mine.probability),
    baseRate: mine?.base_rate === null || mine?.base_rate === undefined ? null : Number(mine.base_rate),
    knew: Boolean(mine?.knew),
    url: (row.url as string | null) ?? null,
    originalTitle: row.original_title as string,
    resolvedOn: row.resolve_on as string,
  };
}

export type DrillProgress = { today: number; ready: number; left: number; stats: DrillStats };

/** 他练了多少（今天几道、题库里还剩几道没做）、成绩。 */
export async function drillProgress(userId: string, today: string): Promise<DrillProgress | "missing-schema"> {
  const [answers, ready] = await Promise.all([
    selectAll((a, b) =>
      supabaseAdmin
        .from("forecast_history_answers")
        .select("base_rate, probability, knew, answered_at, forecast_history!inner(outcome, market_prob, ai)")
        .eq("user_id", userId)
        .order("answered_at")
        .range(a, b)
    ),
    supabaseAdmin.from("forecast_history").select("id", { count: "exact", head: true }).eq("status", "ready"),
  ]);
  const error = answers.error ?? ready.error;
  if (error) {
    if (missing(error)) return "missing-schema";
    throw new Error(error.message);
  }
  type Row = { base_rate: number | null; probability: number | null; knew: boolean; answered_at: string; forecast_history: { outcome: boolean; market_prob: number | null; ai: AiView | null } };
  const rows = answers.data as unknown as Row[];
  const startOfToday = Date.parse(`${today}T00:00:00+09:00`);
  return {
    today: rows.filter((r) => Date.parse(r.answered_at) >= startOfToday).length,
    ready: ready.count ?? 0,
    left: Math.max(0, (ready.count ?? 0) - rows.length),
    stats: drillStats(
      rows.map((r) => ({
        probability: r.probability === null ? null : Number(r.probability),
        baseRate: r.base_rate === null ? null : Number(r.base_rate),
        knew: r.knew,
        y: r.forecast_history.outcome,
        market: r.forecast_history.market_prob === null ? null : Number(r.forecast_history.market_prob),
        ai: r.forecast_history.ai?.median ?? null,
      }))
    ),
  };
}

// ── 回测报告和校准 ──────────────────────────────────────────────────────────

let cached: { at: number; report: BacktestReport } | null = null;

/** AI 在历史题上的回测（十分钟内用同一份）。迁移没跑返回 null。 */
export async function historyBacktest(): Promise<BacktestReport | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.report;
  const { data, error } = await selectAll((a, b) => supabaseAdmin.from("forecast_history").select("id, ai, market_prob, outcome").eq("status", "ready").order("id").range(a, b));
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  const rows = ((data ?? []) as { id: string; ai: AiView | null; market_prob: number | null; outcome: boolean }[])
    .filter((r) => r.ai && Number.isFinite(r.ai.median))
    .map((r) => ({ id: r.id, ai: (r.ai as AiView).median, market: r.market_prob === null ? null : Number(r.market_prob), y: r.outcome }));
  const report = backtestReport(rows);
  cached = { at: Date.now(), report };
  return report;
}

/** 线上的 AI 数用的校准：回测学到了、而且在没见过的题上确实更准才给。 */
export async function aiCalibration(): Promise<Platt | null> {
  const report = await historyBacktest();
  return report ? usableCalibration(report) : null;
}
