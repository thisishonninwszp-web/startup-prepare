import { supabaseAdmin } from "@/lib/supabase";
import { webSearch } from "@/lib/web-search";
import {
  draftResolution,
  forecastFromPerspective,
  planArrivalQuestion,
  planBusinessQuestions,
  translateMarketQuestion,
  type Perspective,
} from "@/lib/ai";
import { loadGapRechecks, openGapsWithSide } from "./gaps";
import { openRelevantPolicies, policyHistory, policyOutcome } from "./policy";
import { baseProbability, lagSummary, POLICY_MIN_HISTORY, policyResolveOn, shortPolicyTitle } from "./policy-shared";
import { FAST_VARIABLES } from "./fast";
import { wikiMonths, wikiTopics, yahooDaily } from "./data-questions";
import { closeOnOrBefore, monthResolveOn, monthUpShare, prevMonth, upShare, weekAhead } from "./data-questions-shared";
import { ATLAS_CATEGORIES, baseSentence, categoryBase, countedCases, listTransferCases, type AtlasCategory } from "./atlas";
import { REPORT_SECTION_KINDS } from "./feeds";
import type { BriefItem } from "./brief";
import { getMarket, searchMarkets } from "./markets";
import { sharedViewFor, signalUserIds } from "./users";
import {
  needsConfirm,
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
export const MEMBERS_MISSING = "迁移 092 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/092_signal_members.sql。";

function revealsMissing(error: { message: string } | null): boolean {
  return !!error && /forecast_reveals|does not exist|schema cache/.test(error.message);
}

function missing(error: { message: string } | null): boolean {
  return !!error && /forecast_questions|forecasts|revealed_at|does not exist|schema cache/.test(error.message);
}

const QUESTION_COLUMNS =
  "id, kind, title, original_title, criteria, resolve_on, category, source, context, status, outcome, resolved_at, resolution_note, resolution_url, pending, revealed_at, created_at";

const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));

/** 给哪些账号跑（配了 IDEAOS_USER_EMAIL 只给那一个）。 */
export async function activeSignalUsers(): Promise<string[]> {
  return signalUserIds();
}

/**
 * shared：这个账号看的是主账号那一池题（朋友的账号）；canConfirm：能不能确认生意题的对账（只有出题的主账号能）。
 * 题目、AI、市场的概率取主账号那一份；「你」的判断和「先看了答案」只取这个账号自己的。
 */
export type ForecastBoard = { questions: ForecastQuestion[]; forecasts: Forecast[]; shared: boolean; canConfirm: boolean };

export async function loadForecastBoard(userId: string): Promise<ForecastBoard | "missing-schema"> {
  const { sourceUserId: pool, shared } = await sharedViewFor(userId);
  const [q, f, r] = await Promise.all([
    supabaseAdmin.from("forecast_questions").select(QUESTION_COLUMNS).eq("user_id", pool).order("resolve_on"),
    supabaseAdmin.from("forecasts").select("question_id, user_id, source, probability, reason, made_at").in("user_id", Array.from(new Set([pool, userId]))),
    supabaseAdmin.from("forecast_reveals").select("question_id").eq("user_id", userId),
  ]);
  const error = q.error ?? f.error;
  if (error) {
    if (missing(error)) return "missing-schema";
    throw new Error(error.message);
  }
  // 迁移 092 没跑时没有 forecast_reveals：主账号照旧用题目上的 revealed_at
  const revealed = r.error ? null : new Set(((r.data ?? []) as { question_id: string }[]).map((x) => x.question_id));
  const questions = ((q.data ?? []) as ForecastQuestion[]).map((x) => ({
    ...x,
    revealed_at: revealed?.has(x.id) ? x.revealed_at ?? x.created_at : shared ? null : x.revealed_at,
  }));
  const forecasts = ((f.data ?? []) as (Forecast & { user_id: string })[])
    .filter((x) => (x.source === "me" ? x.user_id === userId : x.user_id === pool))
    .map(({ user_id: _u, ...x }) => {
      void _u;
      return { ...x, probability: Number(x.probability) };
    });
  return { questions, forecasts, shared, canConfirm: !shared };
}

async function insertForecasts(userId: string, questionId: string, rows: { source: ForecastSource; probability: number; reason?: string | null }[]): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({ question_id: questionId, user_id: userId, source: r.source, probability: clamp(r.probability), reason: r.reason ?? null }));
  let { error } = await supabaseAdmin.from("forecasts").upsert(payload, { onConflict: "question_id,user_id,source", ignoreDuplicates: true });
  // 迁移 092 没跑时唯一键还是 (question_id, source)
  if (error && /no unique or exclusion constraint/.test(error.message)) {
    ({ error } = await supabaseAdmin.from("forecasts").upsert(payload, { onConflict: "question_id,source", ignoreDuplicates: true }));
  }
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
  // 同一条新闻出过题的不再用（报告还没出来时会拿到前一天那份，不然会对同一条新闻再出一遍差不多的题）
  const { data: asked, error: askedError } = await supabaseAdmin.from("forecast_questions").select("source").eq("user_id", userId).eq("kind", "business").limit(1000);
  if (askedError) throw new Error(askedError.message);
  const used = new Set(((asked ?? []) as { source: { signal_id?: string } }[]).map((r) => r.source.signal_id));
  const items = (data ?? [])
    .filter((r) => r.brief_date === latest)
    .flatMap((r) => (Array.isArray(r.items) ? (r.items as BriefItem[]) : []).filter((i) => !i.extra && i.signal_id && i.headline && !used.has(i.signal_id)))
    .slice(0, 15);
  if (items.length === 0) return 0;
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
 * 在时间预算内让 AI 押还没押的题：先上网查一次资料（三种思路共用），三种思路各押一个，代码取中间值存成「AI」。
 * 市场题不给 AI 看市场的概率。三个里至少两个押成了才存中间值。
 * 不按固定道数做：开始下一道之前看已经用了多久，过了 startBeforeMs 就停（一道要二三十秒，Vercel 一次最多 60 秒）。
 */
export async function forecastPending(userId: string, today: string, startBeforeMs = 20_000): Promise<{ did: number; remaining: number }> {
  const started = Date.now();
  const todo = await questionsWithoutAi(userId);
  let did = 0;
  for (const q of todo) {
    if (did > 0 && Date.now() - started > startBeforeMs) break;
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
 * 生意题上网查证据、AI 给建议，存成「等你确认」（他点了才算对账）。
 * 按时间预算做：开始下一道之前过了 startBeforeMs 就停，剩下的下次调用接着做。
 */
export async function resolveDue(userId: string, today: string, startBeforeMs = 25_000): Promise<{ did: number; remaining: number }> {
  const started = Date.now();
  const board = await loadForecastBoard(userId);
  if (board === "missing-schema") throw new Error(FORECAST_MISSING);
  const due = board.questions.filter((q) => q.status === "open" && q.resolve_on <= today && !(needsConfirm(q.kind) && q.pending));
  // 到日本题还没到期、但差距清单重查已经查到日本有了（带出处）：先给出「会」的建议，等他确认
  await suggestEarlyArrivals(userId, board.questions, today);
  // 政策题没到期、但已经公布了：直接对账（公布日是 e-Gov 上写着的，不用他确认）
  await settleEarlyPolicies(userId, board.questions, today);
  let did = 0;
  let tried = 0;
  for (const q of due) {
    if (tried > 0 && Date.now() - started > startBeforeMs) break;
    tried += 1;
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
    } else if (q.kind === "data" && q.source.series) {
      const r = await settleData(q, today);
      if (r === null) continue;
      await resolveQuestion(userId, q.id, r);
      did += 1;
    } else if (q.kind === "policy" && q.source.policy_id) {
      // 门槛日当天还可能公布：过了门槛日才判「不会」；判之前去结果页再查一次，免得订阅漏看
      const r = await policyOutcome(q.source.policy_id, true);
      if (!r) continue;
      const yes = r.promulgate_date !== null && r.promulgate_date <= q.resolve_on;
      if (!yes && today <= q.resolve_on) continue;
      await resolveQuestion(userId, q.id, {
        status: "resolved",
        outcome: yes,
        resolved_at: new Date().toISOString(),
        resolution_note: yes ? `${r.promulgate_date} 公布（e-Gov 意见征集结果公示）` : r.promulgate_date ? `${r.promulgate_date} 才公布，晚于门槛日` : `到 ${q.resolve_on} 还没公布（e-Gov 上没有结果公示）`,
        resolution_url: r.url,
      });
      did += 1;
    } else if (needsConfirm(q.kind)) {
      const query = q.kind === "arrival" ? `${q.source.headline ?? q.title} 日本` : `${q.source.headline ?? q.title} ${q.resolve_on.slice(0, 7)}`;
      const sources = (await webSearch(query, 6).catch(() => [])).map((s) => ({
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
  return { did, remaining: Math.max(0, due.length - tried) };
}

// ── 他的操作 ────────────────────────────────────────────────────────────────

/** 这个账号能看到的那一池里的一道题（朋友的账号看主账号那一池）。 */
async function poolQuestion(userId: string, id: string): Promise<{ q: ForecastQuestion; pool: string; shared: boolean }> {
  const { sourceUserId: pool, shared } = await sharedViewFor(userId);
  const { data, error } = await supabaseAdmin.from("forecast_questions").select(QUESTION_COLUMNS).eq("id", id).eq("user_id", pool).maybeSingle();
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  if (!data) throw new Error("找不到这道题");
  return { q: data as ForecastQuestion, pool, shared };
}

/** 这个账号是不是已经先看过这道题的答案（迁移 092 没跑时，主账号看题目上的 revealed_at，别的账号报缺迁移）。 */
async function hasRevealed(userId: string, q: ForecastQuestion, shared: boolean): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("forecast_reveals").select("question_id").eq("question_id", q.id).eq("user_id", userId).maybeSingle();
  if (error) {
    if (!revealsMissing(error)) throw new Error(error.message);
    if (shared) throw new Error(MEMBERS_MISSING);
    return !!q.revealed_at;
  }
  return !!data;
}

/** 他说出自己的判断（几成可能）：题还开着、没到期、没先看过 AI 和市场、没判断过。 */
export async function setMyForecast(userId: string, questionId: string, probability: number, today: string): Promise<void> {
  const { q, shared } = await poolQuestion(userId, questionId);
  if (q.status !== "open" || daysBetween(today, q.resolve_on) <= 0) throw new Error("这道题已经到期了，不能再判断");
  if (await hasRevealed(userId, q, shared)) throw new Error("你已经先看过 AI 和市场的答案了，这道题不能再判断（免得被带偏）");
  const { data } = await supabaseAdmin.from("forecasts").select("id").eq("question_id", questionId).eq("source", "me").eq("user_id", userId).maybeSingle();
  if (data) throw new Error("这道题你已经判断过了");
  if (!(probability > 0 && probability < 1)) throw new Error("概率不对");
  await insertForecasts(userId, questionId, [{ source: "me", probability }]);
}

/** 他先不判断、直接看答案：记下来，这道题以后不能再判断。 */
export async function revealQuestion(userId: string, questionId: string): Promise<void> {
  const { q, pool, shared } = await poolQuestion(userId, questionId);
  const { error } = await supabaseAdmin.from("forecast_reveals").upsert({ question_id: q.id, user_id: userId }, { onConflict: "question_id,user_id", ignoreDuplicates: true });
  if (!error) return;
  if (!revealsMissing(error)) throw new Error(error.message);
  if (shared) throw new Error(MEMBERS_MISSING);
  if (!q.revealed_at) await resolveQuestion(pool, questionId, { revealed_at: new Date().toISOString() });
}

// ── 到日本题 ────────────────────────────────────────────────────────────────

/** 今天有没有出过到日本题。 */
async function arrivalToday(userId: string, today: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("forecast_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "arrival")
    .gte("created_at", `${today}T00:00:00+09:00`);
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  return (count ?? 0) > 0;
}

/**
 * 从差距清单（日本这边还没有的）出一道到日本题，一天最多一道：他开过假门的先出（他在意的），再按进清单的先后（新的先）。
 * 附上时差图谱里同一类东西的历史当基准率（AI「先看基准率」的思路和他都看得到）。迁移 096 没跑时这种题存不进去，返回 0。
 */
export async function createArrivalQuestions(userId: string, today: string): Promise<number> {
  if (await arrivalToday(userId, today).catch(() => true)) return 0;
  const rechecks = await loadGapRechecks(userId);
  const [gaps, asked, doors, cases] = await Promise.all([
    openGapsWithSide(userId, rechecks ?? []),
    supabaseAdmin.from("forecast_questions").select("source").eq("user_id", userId).eq("kind", "arrival"),
    supabaseAdmin.from("signal_fake_doors").select("signal_id").eq("user_id", userId),
    listTransferCases(userId),
  ]);
  if (asked.error) throw new Error(asked.error.message);
  const done = new Set(((asked.data ?? []) as { source: { signal_id?: string } }[]).map((r) => r.source.signal_id));
  const withDoor = new Set(((doors.error ? [] : doors.data ?? []) as { signal_id: string | null }[]).map((d) => d.signal_id));
  const gap = gaps
    .filter((g) => g.side === "japan" && !done.has(g.signal_id))
    .sort((a, b) => Number(withDoor.has(b.signal_id)) - Number(withDoor.has(a.signal_id)) || b.brief_date.localeCompare(a.brief_date))[0];
  if (!gap) return 0;
  const draft = await planArrivalQuestion({ headline: gap.headline, background: gap.background, japan: gap.japan }, today);
  const category = draft.category as AtlasCategory;
  const base = baseSentence(category, categoryBase(cases === "missing-schema" ? [] : countedCases(cases).filter((c) => c.category === category)));
  const { error } = await supabaseAdmin.from("forecast_questions").insert({
    user_id: userId,
    kind: "arrival",
    title: draft.title,
    criteria: draft.criteria,
    resolve_on: draft.resolveOn,
    category: ATLAS_CATEGORIES[category],
    source: { signal_id: gap.signal_id, headline: gap.headline, side: gap.side, atlas: category, base },
    context: `那边：${gap.headline}\n${gap.background}\n日本这边（进清单时）：${gap.japan}\n基准（时差图谱）：${base}`.slice(0, 1500),
  });
  if (error) {
    // 迁移 096 没跑：题目类型的约束还不认 arrival
    if (/forecast_questions_kind_check|violates check constraint/.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return 1;
}

/** 还没到期的到日本题：差距清单重查查到日本这边有了（带出处），就先存成「建议：会」，等出题的人确认。 */
async function suggestEarlyArrivals(userId: string, questions: ForecastQuestion[], today: string): Promise<void> {
  const open = questions.filter((q) => q.kind === "arrival" && q.status === "open" && !q.pending && q.resolve_on > today && q.source.signal_id);
  if (open.length === 0) return;
  const rechecks = (await loadGapRechecks(userId)) ?? [];
  for (const q of open) {
    const hit = rechecks.find((r) => r.signal_id === q.source.signal_id && r.side === (q.source.side ?? "japan") && r.verdict === "arrived" && r.checked_on >= q.created_at.slice(0, 10));
    if (!hit) continue;
    const pending: PendingResolution = {
      suggested: "yes",
      note: `差距清单重查（${hit.checked_on}）：日本这边有了 —— ${hit.japan}`.slice(0, 200),
      evidence: (hit.source_check?.basis ?? []).slice(0, 3),
      checked_on: today,
    };
    await resolveQuestion(userId, q.id, { pending });
  }
}

// ── 数据题 ──────────────────────────────────────────────────────────────────

/** 星期一到五各出哪一个市场数（周末不出）。 */
const DATA_ROTATION: Record<number, string> = { 1: "nikkei", 2: "usdjpy", 3: "cnyjpy", 4: "oil", 5: "us10y" };
/** 一个月最多出几道维基关注度题（月初几天出）。 */
const WIKI_PER_MONTH = 2;
/** AI 上网查资料用的日文检索词（市场数）。 */
const DATA_QUERIES: Record<string, string> = { nikkei: "日経平均 来週 見通し", usdjpy: "ドル円 来週 見通し", cnyjpy: "人民元 円 相場 見通し", oil: "原油 WTI 来週 見通し", us10y: "米10年債利回り 来週 見通し" };
const WIKI_DAYS = 5;
/** 上个月浏览不到这么多的页面不出题（多半是转到别的页面的空页，数太小，涨跌是噪音）。 */
const WIKI_MIN_VIEWS = 100;

const fmtValue = (v: number, digits: number) => v.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * 一天最多一道数据题：每月头 5 天先出维基关注度题（他「听一听」过的差距清单那几条，一个月最多两道）：「这个月会不会比上个月多」；
 * 别的工作日轮着出一个市场数：「一周后会不会高于今天」。统计基准存成 base 一方。迁移 097 没跑（没有 base）时只存题、不存基准。
 */
export async function createDataQuestions(userId: string, today: string): Promise<number> {
  const { data: made, error } = await supabaseAdmin.from("forecast_questions").select("created_at, source").eq("user_id", userId).eq("kind", "data").gte("created_at", `${today.slice(0, 7)}-01T00:00:00+09:00`);
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  const rows = (made ?? []) as { created_at: string; source: ForecastQuestion["source"] }[];
  const startOfToday = Date.parse(`${today}T00:00:00+09:00`);
  if (rows.some((r) => Date.parse(r.created_at) >= startOfToday)) return 0;

  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  if (day <= WIKI_DAYS) {
    const askedThisMonth = rows.filter((r) => r.source.series === "wiki");
    if (askedThisMonth.length < WIKI_PER_MONTH) {
      const prev = prevMonth(month);
      for (const topic of (await wikiTopics(userId)).filter((t) => !askedThisMonth.some((r) => r.source.wiki_title === t.title)).slice(0, 5)) {
        const history = await wikiMonths(topic.title, "2015-07", prev);
        const last = history?.find((h) => h.month === prev);
        if (history && last && last.views >= WIKI_MIN_VIEWS) {
          const base = monthUpShare(history, month);
          return insertDataQuestion(userId, {
            title: `日文维基「${topic.title}」${month} 一个月的浏览，会不会比 ${prev}（${last.views.toLocaleString("ja-JP")} 次）多？`,
            criteria: `以 Wikimedia 公开的按月浏览数为准（ja.wikipedia，所有设备，真人访问）：${month} 的数大于 ${last.views} 算「会」。`,
            resolveOn: monthResolveOn(month),
            category: "日本经济",
            source: { series: "wiki", wiki_title: topic.title, value0: last.views, target: month, signal_id: topic.signalId, headline: `${topic.title} 日本 話題` },
            context: `日文维基「${topic.title}」最近 12 个月的浏览：${history.slice(-12).map((h) => `${h.month} ${h.views}`).join("、")}`,
            base: base ? { p: base.p, reason: base.how } : null,
          });
        }
      }
    }
  }

  const key = DATA_ROTATION[new Date(`${today}T00:00:00Z`).getUTCDay()];
  const v = FAST_VARIABLES.find((x) => x.key === key);
  if (!v) return 0;
  const series = await yahooDaily(v.symbol, "3y");
  const latest = series?.[series.length - 1];
  if (!series || !latest) return 0;
  const resolveOn = weekAhead(today);
  const value0 = Number(latest.close.toFixed(v.digits));
  const p = upShare(series.map((s) => s.close), 5);
  return insertDataQuestion(userId, {
    title: `${v.label}在 ${resolveOn} 的收盘会不会高于 ${fmtValue(value0, v.digits)}（${latest.day} 的收盘）？`,
    criteria: `以 Yahoo Finance 上 ${v.symbol} 的日收盘为准：${resolveOn} 那天（休市就取之前最后一个交易日）的收盘高于 ${fmtValue(value0, v.digits)} 算「会」。只练判断准不准，不是投资建议。`,
    resolveOn,
    category: v.key === "nikkei" || v.key === "usdjpy" ? "日本经济" : v.key === "cnyjpy" ? "中日关系" : "世界",
    source: { series: "yahoo", symbol: v.symbol, value0, target: resolveOn, headline: DATA_QUERIES[v.key] ?? v.label },
    context: `${v.label}最近十个交易日的收盘：${series.slice(-10).map((s) => `${s.day.slice(5)} ${fmtValue(s.close, v.digits)}`).join("、")}`,
    base: p !== null ? { p, reason: "近三年里隔 5 个交易日比当时高的比例" } : null,
  });
}

async function insertDataQuestion(
  userId: string,
  q: { title: string; criteria: string; resolveOn: string; category: string; source: ForecastQuestion["source"]; context: string; base: { p: number; reason: string } | null }
): Promise<number> {
  const { data: row, error } = await supabaseAdmin
    .from("forecast_questions")
    .insert({ user_id: userId, kind: "data", title: q.title, criteria: q.criteria, resolve_on: q.resolveOn, category: q.category, source: q.source, context: q.context.slice(0, 1500) })
    .select("id")
    .single();
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  // 迁移 097 没跑时 forecasts 还不认 base：题照样存，基准不存
  if (q.base) await insertForecasts(userId, row.id as string, [{ source: "base", probability: q.base.p, reason: q.base.reason }]).catch(() => undefined);
  return 1;
}

/** 数据题对账：到期以后取数比；数还没出来先放着，过了两周还取不到就作废。 */
async function settleData(q: ForecastQuestion, today: string): Promise<Partial<ForecastQuestion> | null> {
  const s = q.source;
  const now = new Date().toISOString();
  if (s.series === "yahoo" && s.symbol && typeof s.value0 === "number") {
    if (today <= q.resolve_on) return null;
    const c = closeOnOrBefore((await yahooDaily(s.symbol, "3mo")) ?? [], q.resolve_on);
    if (c && c.day > q.created_at.slice(0, 10)) {
      return { status: "resolved", outcome: c.close > s.value0, resolved_at: now, resolution_note: `${c.day} 收盘 ${c.close}（出题时 ${s.value0}）`, resolution_url: `https://finance.yahoo.com/quote/${encodeURIComponent(s.symbol)}` };
    }
  } else if (s.series === "wiki" && s.wiki_title && s.target && typeof s.value0 === "number") {
    if (today < q.resolve_on) return null;
    const m = (await wikiMonths(s.wiki_title, s.target, s.target))?.find((x) => x.month === s.target);
    if (m) {
      return {
        status: "resolved",
        outcome: m.views > s.value0,
        resolved_at: now,
        resolution_note: `${s.target} 浏览 ${m.views} 次（上个月 ${s.value0} 次）`,
        resolution_url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(s.wiki_title.replace(/ /g, "_"))}`,
      };
    }
  }
  if (daysBetween(q.resolve_on, today) > 14) return { status: "void", outcome: null, resolved_at: now, resolution_note: "到期两周还取不到数（不算分）" };
  return null;
}

// ── 政策题 ──────────────────────────────────────────────────────────────────

/** 今天有没有出过政策题。 */
async function policyToday(userId: string, today: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("forecast_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "policy")
    .gte("created_at", `${today}T00:00:00+09:00`);
  if (error) throw new Error(missing(error) ? FORECAST_MISSING : error.message);
  return (count ?? 0) > 0;
}

/**
 * 正在征求意见、跟他有关的一件出一道政策题，一天最多一道：「会不会在某天之前公布」，门槛日取历史上「截止 → 公布」的中位数（取月底）。
 * 统计基准（历史上那么多天以内公布的比例）存成 base 一方，跟 AI、他一起记分。历史不够 POLICY_MIN_HISTORY 条先不出。迁移 097 没跑返回 0。
 */
export async function createPolicyQuestions(userId: string, today: string): Promise<number> {
  if (await policyToday(userId, today).catch(() => true)) return 0;
  const history = await policyHistory();
  if (!history || history.length < POLICY_MIN_HISTORY) return 0;
  const median = lagSummary(history).median ?? 0;
  const [open, asked] = await Promise.all([
    openRelevantPolicies(today),
    supabaseAdmin.from("forecast_questions").select("source").eq("user_id", userId).eq("kind", "policy"),
  ]);
  if (asked.error) throw new Error(asked.error.message);
  const done = new Set(((asked.data ?? []) as { source: { policy_id?: string } }[]).map((r) => r.source.policy_id));
  const item = open.find((i) => i.deadline && i.deadline >= today && !done.has(i.id));
  if (!item?.deadline) return 0;
  const resolveOn = policyResolveOn(item.deadline, median);
  const base = baseProbability(history, daysBetween(item.deadline, resolveOn));
  const { data: row, error } = await supabaseAdmin
    .from("forecast_questions")
    .insert({
      user_id: userId,
      kind: "policy",
      title: `「${shortPolicyTitle(item.title)}」会不会在 ${resolveOn} 之前公布？`,
      criteria: `以 e-Gov 意见征集结果公示上的公布日为准（「命令等の公布日」或「対象が定められた日」）：${resolveOn} 当天或以前公布算「会」；到那天还没公布、或者不再公布算「不会」。`,
      resolve_on: resolveOn,
      category: "日本政治社会",
      source: { policy_id: item.id, url: item.url, headline: item.title, ministry: item.ministry ?? undefined },
      context: `${item.title}\n${item.ministry ?? ""} · 意见截止 ${item.deadline}\n历史（e-Gov 结果公示）：截止后中位 ${median} 天公布（${history.length} 件）。`.slice(0, 1500),
    })
    .select("id")
    .single();
  if (error) {
    if (/forecast_questions_kind_check|violates check constraint/.test(error.message)) return 0;
    throw new Error(error.message);
  }
  if (base !== null) {
    await insertForecasts(userId, row.id as string, [
      { source: "base", probability: base, reason: `历史上 ${history.length} 件意见征集里，截止后 ${daysBetween(item.deadline, resolveOn)} 天以内公布的比例` },
    ]);
  }
  return 1;
}

/** 没到期的政策题：库里已经有公布日、而且不晚于门槛日，直接对成「会」。 */
async function settleEarlyPolicies(userId: string, questions: ForecastQuestion[], today: string): Promise<void> {
  for (const q of questions.filter((x) => x.kind === "policy" && x.status === "open" && x.resolve_on > today && x.source.policy_id)) {
    const r = await policyOutcome(q.source.policy_id as string, false).catch(() => null);
    if (!r?.promulgate_date || r.promulgate_date > q.resolve_on) continue;
    await resolveQuestion(userId, q.id, {
      status: "resolved",
      outcome: true,
      resolved_at: new Date().toISOString(),
      resolution_note: `${r.promulgate_date} 公布（e-Gov 意见征集结果公示）`,
      resolution_url: r.url,
    });
  }
}

/** 生意题对账：出题的主账号按证据点会 / 不会 / 作废（作废的不算分），对所有人生效。 */
export async function confirmResolution(userId: string, questionId: string, verdict: "yes" | "no" | "void", note = ""): Promise<void> {
  const { q, shared } = await poolQuestion(userId, questionId);
  if (shared) throw new Error("生意题的对账由出题的那个账号确认，确认了对所有人生效");
  if (q.status !== "open") throw new Error("这道题已经对过账了");
  await resolveQuestion(userId, questionId, {
    status: verdict === "void" ? "void" : "resolved",
    outcome: verdict === "void" ? null : verdict === "yes",
    resolved_at: new Date().toISOString(),
    resolution_note: note.trim().slice(0, 200) || q.pending?.note || null,
    resolution_url: q.pending?.evidence[0]?.url ?? null,
  });
}
