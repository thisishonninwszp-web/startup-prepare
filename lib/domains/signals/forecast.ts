import { supabaseAdmin } from "@/lib/supabase";
import { webSearch } from "@/lib/web-search";
import { draftResolution, forecastFromPerspective, planBusinessQuestions, translateMarketQuestion, type Perspective } from "@/lib/ai";
import { REPORT_SECTION_KINDS } from "./feeds";
import type { BriefItem } from "./brief";
import { getMarket, searchMarkets } from "./markets";
import {
  daysBetween,
  isJapanQuestion,
  medianProbability,
  pickMarkets,
  type Forecast,
  type ForecastQuestion,
  type ForecastSource,
  type MarketRef,
  type PendingResolution,
} from "./forecast-shared";

export * from "./forecast-shared";

/**
 * 预测账本（迁移 091；原则 1 例外四）：每天进几道题 —— 预测市场的（平台自己结算，自带市场的概率当对照）、
 * 从今天报告里出的生意题（到期程序查证据给建议，他点确认）。每道题 AI 用三种思路各押一个、代码取中间；
 * 他自己先押（看了 AI 和市场就不能再押）；对账后由代码记分、出校准表。
 * 这些步骤由 GitHub Actions 定时调 /api/cron/jobs/<step> 一步一步跑（每次一分钟以内）。
 */

export const FORECAST_MISSING = "迁移 091 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/091_signal_memory_forecasts.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /forecast_questions|forecasts|revealed_at|does not exist|schema cache/.test(error.message);
}

const QUESTION_COLUMNS =
  "id, kind, title, original_title, criteria, resolve_on, category, source, context, status, outcome, resolved_at, resolution_note, resolution_url, pending, revealed_at, created_at";

const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));

/** 最近一个月用过报告的人（单用户阶段就是他）。 */
export async function activeSignalUsers(): Promise<string[]> {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin.from("signal_briefs").select("user_id").gte("brief_date", monthAgo);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
}

export type ForecastBoard = { questions: ForecastQuestion[]; forecasts: Forecast[] };

export async function loadForecastBoard(userId: string): Promise<ForecastBoard | "missing-schema"> {
  const [q, f] = await Promise.all([
    supabaseAdmin.from("forecast_questions").select(QUESTION_COLUMNS).eq("user_id", userId).order("resolve_on"),
    supabaseAdmin.from("forecasts").select("question_id, source, probability, reason, made_at").eq("user_id", userId),
  ]);
  const error = q.error ?? f.error;
  if (error) {
    if (missing(error)) return "missing-schema";
    throw new Error(error.message);
  }
  return {
    questions: (q.data ?? []) as ForecastQuestion[],
    forecasts: ((f.data ?? []) as Forecast[]).map((x) => ({ ...x, probability: Number(x.probability) })),
  };
}

async function insertForecasts(userId: string, questionId: string, rows: { source: ForecastSource; probability: number; reason?: string | null }[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin
    .from("forecasts")
    .upsert(
      rows.map((r) => ({ question_id: questionId, user_id: userId, source: r.source, probability: clamp(r.probability), reason: r.reason ?? null })),
      { onConflict: "question_id,source", ignoreDuplicates: true }
    );
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
}

// ── 进题 ────────────────────────────────────────────────────────────────────

/** 从预测市场挑几道新题进账本（中文题目由 AI 译，市场当时的概率存成「市场」那一方）。 */
export async function importMarkets(userId: string, today: string, n = 2): Promise<number> {
  const { data, error } = await supabaseAdmin.from("forecast_questions").select("source").eq("user_id", userId).eq("kind", "market");
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  const already = new Set(((data ?? []) as { source: Partial<MarketRef> }[]).map((r) => `${r.source.platform}:${r.source.id}`));
  // 先从跟日本有关的里挑，不够再从别的（中国）里补
  const all = await searchMarkets();
  const japan = pickMarkets(all.filter((m) => isJapanQuestion(m.question)), today, already, n);
  const picked = [
    ...japan,
    ...pickMarkets(all.filter((m) => !isJapanQuestion(m.question)), today, new Set([...Array.from(already), ...japan.map((m) => `${m.platform}:${m.id}`)]), n - japan.length),
  ];
  let added = 0;
  for (const m of picked) {
    const t = await translateMarketQuestion({ question: m.question, description: m.description, closes: m.closes }).catch(() => null);
    if (!t) continue;
    const { data: row, error: insertError } = await supabaseAdmin
      .from("forecast_questions")
      .insert({
        user_id: userId,
        kind: "market",
        title: t.title,
        original_title: m.question,
        criteria: t.criteria,
        resolve_on: m.closes,
        category: t.category,
        source: { platform: m.platform, id: m.id, url: m.url },
        context: m.description.slice(0, 1500) || null,
      })
      .select("id")
      .single();
    if (insertError) {
      if (/duplicate key/.test(insertError.message)) continue;
      throw new Error(insertError.message);
    }
    await insertForecasts(userId, row.id as string, [{ source: "market", probability: m.probability }]);
    added += 1;
  }
  return added;
}

/** 今天（日本时间）有没有已经出过生意题。 */
async function businessToday(userId: string, today: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("forecast_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "business")
    .gte("created_at", `${today}T00:00:00+09:00`);
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  return (count ?? 0) > 0;
}

/** 从最近一份报告的精选里出最多两道生意题（一天一次）。 */
export async function createBusinessQuestions(userId: string, today: string): Promise<number> {
  if (await businessToday(userId, today)) return 0;
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, kind, items")
    .eq("user_id", userId)
    .lte("brief_date", today)
    .in("kind", ["news", "money", "calendar", "tools", "voices"].filter((k) => (REPORT_SECTION_KINDS as string[]).includes(k)))
    .order("brief_date", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const latest = data?.[0]?.brief_date as string | undefined;
  if (!latest) return 0;
  const items = (data ?? [])
    .filter((r) => r.brief_date === latest)
    .flatMap((r) => (Array.isArray(r.items) ? (r.items as BriefItem[]) : []).filter((i) => !i.extra && i.signal_id && i.headline))
    .slice(0, 15);
  const drafts = await planBusinessQuestions(
    items.map((i) => ({ id: i.signal_id, headline: i.headline, background: i.background ?? "" })),
    today
  );
  let added = 0;
  for (const d of drafts) {
    const item = items.find((i) => i.signal_id === d.signalId);
    const { error: insertError } = await supabaseAdmin.from("forecast_questions").insert({
      user_id: userId,
      kind: "business",
      title: d.title,
      criteria: d.criteria,
      resolve_on: d.resolveOn,
      category: d.category,
      source: { signal_id: d.signalId, headline: d.headline },
      context: `${d.headline}\n${item?.background ?? ""}`.trim().slice(0, 1500),
    });
    if (insertError) throw new Error(insertError.message);
    added += 1;
  }
  return added;
}

// ── AI 押 ───────────────────────────────────────────────────────────────────

const PERSPECTIVES: { p: Perspective; source: ForecastSource }[] = [
  { p: "outside", source: "ai_outside" },
  { p: "inside", source: "ai_inside" },
  { p: "devil", source: "ai_devil" },
];

/** 还没让 AI 押过的开着的题（旧的先）。 */
async function questionsWithoutAi(userId: string): Promise<ForecastQuestion[]> {
  const board = await loadForecastBoard(userId);
  if (board === "missing-schema") throw new Error(FORECAST_MISSING);
  const withAi = new Set(board.forecasts.filter((f) => f.source === "ai").map((f) => f.question_id));
  return board.questions.filter((q) => q.status === "open" && !withAi.has(q.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * 给最多 max 道题让 AI 押：先上网查一次资料（三种思路共用），三种思路各押一个，代码取中间值存成「AI」。
 * 市场题不给 AI 看市场的概率。三个里至少两个押成了才存中间值。
 */
export async function forecastPending(userId: string, today: string, max = 2): Promise<{ did: number; remaining: number }> {
  const todo = await questionsWithoutAi(userId);
  let did = 0;
  for (const q of todo.slice(0, max)) {
    const query = q.original_title ?? (q.source.headline as string | undefined) ?? q.title;
    const sources = (await webSearch(query, 5).catch(() => [])).map((s) => ({ title: s.title, url: s.url, content: s.content }));
    const input = { title: q.title, criteria: q.criteria, resolveOn: q.resolve_on, today, context: q.context ?? "", sources };
    const results = await Promise.allSettled(PERSPECTIVES.map(({ p }) => forecastFromPerspective(p, input)));
    const ok = results.flatMap((r, i) => (r.status === "fulfilled" ? [{ source: PERSPECTIVES[i].source, probability: r.value.probability, reason: r.value.reason }] : []));
    if (ok.length < 2) continue;
    const median = medianProbability(ok.map((o) => o.probability));
    if (median === null) continue;
    await insertForecasts(userId, q.id, [...ok, { source: "ai", probability: median, reason: null }]);
    did += 1;
  }
  return { did, remaining: Math.max(0, todo.length - did) };
}

// ── 对账 ────────────────────────────────────────────────────────────────────

async function resolveQuestion(userId: string, id: string, patch: Partial<ForecastQuestion>): Promise<void> {
  const { error } = await supabaseAdmin.from("forecast_questions").update(patch).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * 到期的题：市场题问平台结算了没有（结算了按平台结果对，取消的作废；还没结算的明天再问）；
 * 生意题上网查证据、AI 给建议，存成「等你确认」（他点了才算对账）。一次最多处理 max 道。
 */
export async function resolveDue(userId: string, today: string, max = 6): Promise<{ did: number; remaining: number }> {
  const board = await loadForecastBoard(userId);
  if (board === "missing-schema") throw new Error(FORECAST_MISSING);
  const due = board.questions.filter((q) => q.status === "open" && q.resolve_on <= today && !(q.kind === "business" && q.pending));
  let did = 0;
  for (const q of due.slice(0, max)) {
    if (q.kind === "market" && q.source.platform && q.source.id) {
      const m = await getMarket({ platform: q.source.platform, id: q.source.id, url: q.source.url ?? "" });
      if (!m?.resolved) continue;
      await resolveQuestion(userId, q.id, {
        status: m.resolved === "void" ? "void" : "resolved",
        outcome: m.resolved === "void" ? null : m.resolved === "yes",
        resolved_at: new Date().toISOString(),
        resolution_note: m.resolved === "void" ? "平台取消了这道题（不算分）" : `按 ${q.source.platform === "manifold" ? "Manifold" : "Polymarket"} 的结算结果`,
        resolution_url: q.source.url ?? null,
      });
      did += 1;
    } else if (q.kind === "business") {
      const sources = (await webSearch(`${q.source.headline ?? q.title} ${q.resolve_on.slice(0, 7)}`, 6).catch(() => [])).map((s) => ({
        title: s.title,
        url: s.url,
        content: s.content,
      }));
      const draft = await draftResolution({ title: q.title, criteria: q.criteria, resolveOn: q.resolve_on, sources }).catch(() => null);
      const pending: PendingResolution = draft
        ? { ...draft, checked_on: today }
        : { suggested: "unclear", note: "这次没查成，过几天再查。", evidence: [], checked_on: today };
      await resolveQuestion(userId, q.id, { pending });
      did += 1;
    }
  }
  return { did, remaining: Math.max(0, due.length - did) };
}

// ── 他的操作 ────────────────────────────────────────────────────────────────

async function ownQuestion(userId: string, id: string): Promise<ForecastQuestion> {
  const { data, error } = await supabaseAdmin.from("forecast_questions").select(QUESTION_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  if (!data) throw new Error("找不到这道题");
  return data as ForecastQuestion;
}

/** 他押一个概率：题还开着、没到期、没先看过 AI 和市场、没押过。 */
export async function setMyForecast(userId: string, questionId: string, probability: number, today: string): Promise<void> {
  const q = await ownQuestion(userId, questionId);
  if (q.status !== "open" || daysBetween(today, q.resolve_on) <= 0) throw new Error("这道题已经到期了，不能再押");
  if (q.revealed_at) throw new Error("你已经先看过 AI 和市场的答案了，这道题不能再押（免得被带偏）");
  const { data } = await supabaseAdmin.from("forecasts").select("id").eq("question_id", questionId).eq("source", "me").maybeSingle();
  if (data) throw new Error("这道题你已经押过了");
  if (!(probability > 0 && probability < 1)) throw new Error("概率不对");
  await insertForecasts(userId, questionId, [{ source: "me", probability }]);
}

/** 他不押、先看答案：记下来，这道题以后不能再押。 */
export async function revealQuestion(userId: string, questionId: string): Promise<void> {
  const q = await ownQuestion(userId, questionId);
  if (q.revealed_at) return;
  await resolveQuestion(userId, questionId, { revealed_at: new Date().toISOString() });
}

/** 生意题对账：他按证据点会 / 不会 / 作废（作废的不算分）。 */
export async function confirmResolution(userId: string, questionId: string, verdict: "yes" | "no" | "void", note = ""): Promise<void> {
  const q = await ownQuestion(userId, questionId);
  if (q.status !== "open") throw new Error("这道题已经对过账了");
  await resolveQuestion(userId, questionId, {
    status: verdict === "void" ? "void" : "resolved",
    outcome: verdict === "void" ? null : verdict === "yes",
    resolved_at: new Date().toISOString(),
    resolution_note: note.trim().slice(0, 200) || q.pending?.note || null,
    resolution_url: q.pending?.evidence[0]?.url ?? null,
  });
}
