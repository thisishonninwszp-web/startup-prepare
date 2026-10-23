import { supabaseAdmin } from "@/lib/supabase";
import { composeIssue } from "@/lib/ai";
import { tokyoToday } from "./brief";
import { loadGapTransfers } from "./gap-transfer";
import { loadGapVoices } from "./voices";
import { voiceCounts } from "./voices-shared";
import { baseSentence, categoryBase, countedCases, listTransferCases } from "./atlas";
import { gapKanpo, kanpoLines, loadGapDeeps } from "./deep";
import type { GapDeep } from "./deep-shared";
import { listGapBoard, GAP_SIDES } from "./gaps";
import { gapPlaces, transferKey, type GapSide, type JapanGap } from "./gaps-shared";
import { displayQuestion, ISSUE_BET_PREFIX, listJudgments } from "./practice";
import {
  assembleDrafts,
  ISSUE_MAX_PICKS,
  ISSUE_NOTE_MAX,
  ISSUE_PLATFORMS,
  STANCE_YEARS,
  stanceSentence,
  validStance,
  weekStartOf,
  type Issue,
  type IssueBet,
  type IssuePick,
  type IssuePlatform,
  type IssueRecordedBet,
  type PickStance,
  type ResponseSignal,
  RESPONSE_SIGNALS,
  upsertMetric,
  validMetric,
  type IssueMetric,
  aiWill,
  rankIssueSuggestions,
  type IssueSuggestion,
} from "./issue-shared";

export * from "./issue-shared";

/**
 * 周刊：每周一期"那边有、这边还没有"。他挑这周的几条、写自己的判断，再挑几条公开对账；
 * 系统把核实过的事实和他的原话排成中文长文 / 小红书 / 日文 note / 日文 X 四个版本。
 * 事实由服务器按 id 重新取（不信浏览器传来的），他的判断在中文版里由代码核对一字不改。
 */

/** 挑题时往回看几天的差距和判断。 */
const LOOKBACK_DAYS = 14;

const MISSING_MIGRATION = "迁移 071 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/071_signal_issues.sql。";

export type IssueCandidate = {
  side: GapSide;
  /** "那边 / 这边"叫什么（在服务器上算好，页面不用引 gaps-shared）。 */
  there: string;
  here: string;
  signal_id: string;
  headline: string;
  /** 这边现在怎样。 */
  hereNow: string;
  whyNow?: string;
  date: string;
  /** 重查时发现这边已经有了。 */
  arrived: boolean;
  hasTransfer: boolean;
};

function daysAgo(n: number): string {
  return tokyoToday(new Date(Date.now() - n * 86_400_000));
}

/** 这周能写的：最近两周进清单的差距、重查发现这边有了的；最近两周新押的、刚对过账的判断。 */
export async function issueCandidates(
  userId: string,
  /** 从一条讲透跳过来的那一条（可能超过两周），也放进候选。 */
  include: { side: GapSide; signal_id: string }[] = []
): Promise<{ gaps: IssueCandidate[]; bets: IssueBet[] }> {
  const included = (side: GapSide, signalId: string) => include.some((x) => x.side === side && x.signal_id === signalId);
  const since = daysAgo(LOOKBACK_DAYS);
  const [board, transfers, judgments] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapTransfers(userId),
    listJudgments(userId).catch(() => []),
  ]);
  const gaps: IssueCandidate[] = GAP_SIDES.flatMap((side) => [
    ...board.sides[side].arrived
      .filter((g) => g.arrivedOn >= since || included(side, g.signal_id))
      .map((g) => ({
        side,
        ...gapPlaces(side),
        signal_id: g.signal_id,
        headline: g.headline,
        hereNow: g.now,
        date: g.arrivedOn,
        arrived: true,
        hasTransfer: transfers.has(transferKey(side, g.signal_id)),
      })),
    ...board.sides[side].open
      .filter((g) => g.brief_date >= since || included(side, g.signal_id))
      .map((g) => ({
        side,
        ...gapPlaces(side),
        signal_id: g.signal_id,
        headline: g.headline,
        hereNow: g.japan,
        whyNow: g.whyNow,
        date: g.brief_date,
        arrived: false,
        hasTransfer: transfers.has(transferKey(side, g.signal_id)),
      })),
  ]).sort((a, b) => b.date.localeCompare(a.date));
  const bets: IssueBet[] = judgments
    .filter((j) => (j.resolved_at ?? "").slice(0, 10) >= since || j.created_at.slice(0, 10) >= since)
    .map((j) => ({
      id: j.id,
      question: displayQuestion(j.question),
      judgment: j.judgment,
      outcome: j.outcome,
      made_on: j.created_at.slice(0, 10),
      due_on: j.due_at.slice(0, 10),
    }));
  return { gaps, bets };
}

function toIssue(r: Record<string, unknown>): Issue {
  return {
    id: r.id as string,
    week_start: r.week_start as string,
    updated_at: (r.updated_at as string | null) ?? undefined,
    content: r.content as Issue["content"],
    drafts: (r.drafts as Issue["drafts"]) ?? null,
    published: (r.published as Issue["published"]) ?? [],
    responses: (r.responses as Issue["responses"]) ?? [],
  };
}

const ISSUE_COLUMNS = "id, week_start, updated_at, content, drafts, published, responses";

const MISSING_089 = "迁移 089 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/089_signal_issue_metrics.sql。";

/** 每一期每一篇的数据（键是 issue id）。089 没跑、表没建都返回空。 */
/**
 * 到日本题上 AI 说的几成（键见 transferKey）：到日本题问的就是「这边会不会正式出现这个」、截止一到两年，
 * 和周刊第一问是同一件事，周刊挑条时拿它先替他填「两年内会不会」。迁移 091/096 没跑或者没有就是空的。
 */
async function arrivalAi(userId: string): Promise<Map<string, number>> {
  const { data: qs, error } = await supabaseAdmin.from("forecast_questions").select("id, source").eq("user_id", userId).eq("kind", "arrival");
  if (error || !qs || qs.length === 0) return new Map();
  const { data: fs } = await supabaseAdmin
    .from("forecasts")
    .select("question_id, probability")
    .eq("user_id", userId)
    .eq("source", "ai")
    .in("question_id", qs.map((q) => q.id as string));
  const p = new Map(((fs ?? []) as { question_id: string; probability: number }[]).map((f) => [f.question_id, Number(f.probability)]));
  const out = new Map<string, number>();
  for (const q of qs as { id: string; source: { side?: string; signal_id?: string } }[]) {
    const v = p.get(q.id);
    if (v !== undefined && q.source?.signal_id && q.source.side) out.set(transferKey(q.source.side as GapSide, q.source.signal_id), v);
  }
  return out;
}

/** 这一期先替他挑好的几条和先填的「会不会」（规则见 rankIssueSuggestions）。 */
export async function suggestIssuePicks(userId: string, candidates?: IssueCandidate[]): Promise<IssueSuggestion[]> {
  const [gaps, ai, voices] = await Promise.all([
    candidates ? Promise.resolve(candidates) : issueCandidates(userId).then((c) => c.gaps),
    arrivalAi(userId),
    loadGapVoices(userId),
  ]);
  const quotes = new Map(Array.from(voices).map(([k, v]) => [k, v.quotes.length]));
  return rankIssueSuggestions(gaps, ai, quotes);
}

export async function loadIssueMetrics(userId: string): Promise<Map<string, IssueMetric[]>> {
  const { data, error } = await supabaseAdmin.from("signal_issues").select("id, metrics").eq("user_id", userId);
  if (error) {
    if (/metrics|signal_issues/.test(error.message)) return new Map();
    throw new Error(error.message);
  }
  return new Map((data ?? []).map((r) => [r.id as string, ((r.metrics as IssueMetric[] | null) ?? [])]));
}

/** 记一篇在一个平台上的数据（同一篇同一个平台覆盖上一次）。 */
export async function saveIssueMetric(userId: string, issueId: string, raw: unknown): Promise<IssueMetric[]> {
  const issue = await loadOwnIssue(userId, issueId);
  const m = validMetric(raw, issue.content.picks.length);
  if (typeof m === "string") throw new Error(m);
  const { data, error } = await supabaseAdmin.from("signal_issues").select("metrics").eq("id", issueId).eq("user_id", userId).maybeSingle();
  if (error) {
    if (/metrics/.test(error.message)) throw new Error(MISSING_089);
    throw new Error(error.message);
  }
  const metrics = upsertMetric(((data?.metrics as IssueMetric[] | null) ?? []), { ...m, at: new Date().toISOString() });
  const { error: updateError } = await supabaseAdmin.from("signal_issues").update({ metrics }).eq("id", issueId).eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
  return metrics;
}

/** 这一周的那一期（还没写为 null）；表还没建返回 "missing-schema"。 */
export async function getIssue(userId: string, weekStart = weekStartOf(tokyoToday())): Promise<Issue | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_issues")
    .select(ISSUE_COLUMNS)
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) {
    if (/signal_issues/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return data ? toIssue(data as Record<string, unknown>) : null;
}

/** 以前的几期，新的在前。 */
export async function listIssues(userId: string): Promise<Issue[]> {
  const { data, error } = await supabaseAdmin
    .from("signal_issues")
    .select(ISSUE_COLUMNS)
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []).map((r) => toIssue(r as Record<string, unknown>));
}

function findBoardGap(board: Awaited<ReturnType<typeof listGapBoard>>, side: GapSide, signalId: string) {
  const arrived = board.sides[side].arrived.find((g) => g.signal_id === signalId);
  const open = board.sides[side].open.find((g) => g.signal_id === signalId);
  return { arrived, gap: (arrived ?? open) as JapanGap | undefined };
}

/** 一条讲透里攒的料：存下的那边查一查、类别算出的同类基准、对上的官报决算；到日本题上 AI 说的几成（先填「会不会」用的）。 */
type PickExtra = { deep: GapDeep | undefined; benchmark: string | undefined; kanpo: string[]; ai?: number };

/** 从清单里按 id 取一条差距，拼成这一期的一条（事实全从服务器拿）。 */
function buildPick(
  board: Awaited<ReturnType<typeof listGapBoard>>,
  transfers: Awaited<ReturnType<typeof loadGapTransfers>>,
  voices: Awaited<ReturnType<typeof loadGapVoices>>,
  side: GapSide,
  signalId: string,
  stance: PickStance,
  note: string,
  extra: PickExtra
): IssuePick {
  const { arrived, gap } = findBoardGap(board, side, signalId);
  if (!gap) throw new Error("清单里找不到其中一条了，刷新一下再选");
  const transfer = transfers.get(transferKey(side, signalId));
  const v = voices.get(transferKey(side, signalId));
  // 日本这边（中国、美国 → 日本）才有：note 是日文的
  const phrases = side === "china" ? [] : (v?.queries ?? []);
  const facts = extra.deep?.there?.facts ?? [];
  const sources = [
    ...(gap.url ? [{ title: gap.title, url: gap.url }] : []),
    ...gap.check.basis.map((b) => ({ title: b.title, url: b.url })),
    ...(arrived?.nowCheck?.basis ?? []).map((b) => ({ title: b.title, url: b.url })),
    ...facts.map((f) => ({ title: f.title, url: f.url })),
    ...(v?.quotes ?? []).slice(0, 3).map((q) => ({ title: q.title, url: q.url })),
  ];
  return {
    side,
    signal_id: signalId,
    headline: gap.headline,
    background: gap.background,
    here: arrived ? `${arrived.now}（进清单时查过是：${gap.japan}）` : gap.japan,
    ...(gap.whyNow ? { whyNow: gap.whyNow } : {}),
    ...(gap.funded ? { funded: { company: gap.funded.company, url: gap.funded.url } } : {}),
    ...(transfer ? { conditions: transfer.conditions.map((c) => ({ name: c.name, holds: c.holds, here: c.here })) } : {}),
    sources,
    stance,
    ...(extra.ai !== undefined ? { ai_will: aiWill(extra.ai), ai_p: extra.ai } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
    // 判断由服务器按他点的选项拼（不信浏览器传来的那句话）
    judgment: stanceSentence(stance, gapPlaces(side).here, note),
    url: gap.url,
    ...(phrases.length > 0 ? { searchPhrases: phrases } : {}),
    ...(facts.length > 0 ? { thereFacts: facts.map((f) => ({ text: f.text, url: f.url, title: f.title })) } : {}),
    ...(v && v.quotes.length > 0 ? { voices: { pain: v.pain, counts: voiceCounts(v.quotes), quotes: v.quotes.slice(0, 3).map((q) => q.excerpt) } } : {}),
    ...(extra.benchmark ? { benchmark: extra.benchmark } : {}),
    ...(extra.kanpo.length > 0 ? { kanpo: extra.kanpo } : {}),
  };
}

/** 生成（或重新生成）这一周的稿子并存下来。发过的、收到的回应不动。 */
export async function composeAndSaveIssue(
  userId: string,
  input: { picks: { side: GapSide; signal_id: string; stance: unknown; note: string }[]; betIds: string[]; opening: string }
): Promise<Issue> {
  if (input.picks.length === 0) throw new Error("至少挑一条");
  if (input.picks.length > ISSUE_MAX_PICKS) throw new Error(`一期最多 ${ISSUE_MAX_PICKS} 条`);
  const stances = input.picks.map((p) => validStance(p.stance));
  if (stances.some((s) => s === null)) throw new Error("每条都先点一下：两年内会不会出现");
  if (input.picks.some((p) => p.note.trim().length > ISSUE_NOTE_MAX)) throw new Error(`补的那句最多 ${ISSUE_NOTE_MAX} 字`);
  const [board, transfers, candidates, voices, deeps, cases, ai] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapTransfers(userId),
    issueCandidates(userId, input.picks),
    loadGapVoices(userId),
    loadGapDeeps(userId),
    listTransferCases(userId).catch(() => "missing-schema" as const),
    arrivalAi(userId).catch(() => new Map<string, number>()),
  ]);
  // 一条讲透里攒的料：类别 → 同类基准；对上的官报决算（查不到就少这一样，不拦着写）
  const extras = await Promise.all(
    input.picks.map(async (p): Promise<PickExtra> => {
      const deep = deeps.get(transferKey(p.side, p.signal_id));
      const { gap } = findBoardGap(board, p.side, p.signal_id);
      const kanpo = gap ? await gapKanpo(userId, gap, deep ?? null).catch(() => null) : null;
      const benchmark =
        deep?.category && cases !== "missing-schema" && gapPlaces(p.side).here === "日本"
          ? baseSentence(deep.category, categoryBase(countedCases(cases).filter((c) => c.category === deep.category)))
          : undefined;
      return { deep, benchmark, kanpo: kanpo ? kanpoLines(kanpo) : [], ai: ai.get(transferKey(p.side, p.signal_id)) };
    })
  );
  const picks = input.picks.map((p, i) => buildPick(board, transfers, voices, p.side, p.signal_id, stances[i]!, p.note, extras[i]));
  const bets = candidates.bets.filter((b) => input.betIds.includes(b.id));
  const content = { opening: input.opening.trim(), picks, bets };

  const body = await composeIssue({
    opening: content.opening,
    picks: picks.map((p) => {
      const { there, here } = gapPlaces(p.side);
      return {
        there,
        here,
        headline: p.headline,
        background: p.background,
        hereNow: p.here,
        whyNow: p.whyNow,
        funded: p.funded,
        conditions: p.conditions,
        thereFacts: p.thereFacts,
        voices: p.voices,
        benchmark: p.benchmark,
        kanpo: p.kanpo,
        judgment: p.judgment,
        searchPhrases: p.searchPhrases,
      };
    }),
    bets,
  });
  const drafts = assembleDrafts(body, picks);

  const { data, error } = await supabaseAdmin
    .from("signal_issues")
    .upsert(
      { user_id: userId, week_start: weekStartOf(tokyoToday()), content, drafts, updated_at: new Date().toISOString() },
      { onConflict: "user_id,week_start" }
    )
    .select(ISSUE_COLUMNS)
    .single();
  if (error) {
    if (/signal_issues/.test(error.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return toIssue(data as Record<string, unknown>);
}

export async function loadOwnIssue(userId: string, issueId: string): Promise<Issue> {
  const { data, error } = await supabaseAdmin.from("signal_issues").select(ISSUE_COLUMNS).eq("id", issueId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("找不到这一期");
  return toIssue(data as Record<string, unknown>);
}

/**
 * 发出去了，这一期里"会 / 不会"的几条就是公开押过的：押进判断账本，两年后对账（标签「周刊」）。
 * 只在第一次记"发了"时押；同一句已经押过就跳过。新闻条目已经被清掉的，就不连着它（只记标题和链接）。
 */
async function recordIssueBets(userId: string, issue: Issue): Promise<IssueRecordedBet[]> {
  const due = new Date(Date.now() + STANCE_YEARS * 365 * 86_400_000);
  const dueLabel = `${due.getFullYear()}年${due.getMonth() + 1}月`;
  const recorded: IssueRecordedBet[] = [];
  for (const p of issue.content.picks) {
    const will = p.stance?.will;
    if (will !== "will" && will !== "wont") continue;
    const question = `${ISSUE_BET_PREFIX}到${dueLabel}，${gapPlaces(p.side).here}会不会出现：${p.headline}？`;
    const { data: existing } = await supabaseAdmin
      .from("signal_judgments")
      .select("id")
      .eq("user_id", userId)
      .eq("question", question)
      .limit(1)
      .maybeSingle();
    if (existing) continue;
    const { data: signal } = await supabaseAdmin.from("external_signals").select("id").eq("id", p.signal_id).maybeSingle();
    const { data: prediction, error: predictionError } = await supabaseAdmin
      .from("predictions")
      .insert({ user_id: userId, source_type: "signal", text: p.judgment, due_at: due.toISOString(), confidence: null })
      .select("id")
      .single();
    if (predictionError) throw new Error(predictionError.message);
    const { data: judgmentRow, error } = await supabaseAdmin
      .from("signal_judgments")
      .insert({
        user_id: userId,
        signal_id: signal ? p.signal_id : null,
        prediction_id: prediction.id,
        news_title: p.headline,
        news_url: p.url ?? null,
        question,
        judgment: p.judgment,
        tags: ["周刊"],
        // AI 先填过「会不会」的：没改是同意 AI，改了是改判（迁移 099 的列）；没先填的照旧（为空算先判）
        ...(p.ai_will ? { mode: p.ai_will === will ? "agree" : "override" } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // 记下是哪一条差距：每月重查发现"有了"就能自动对账
    recorded.push({
      prediction_id: prediction.id as string,
      judgment_id: judgmentRow.id as string,
      side: p.side,
      signal_id: p.signal_id,
      will,
      made_on: tokyoToday(),
      due_at: due.toISOString(),
    });
  }
  return recorded;
}

/** 记一笔发在了哪。第一次记"发了"时，把这一期里押了会 / 不会的几条押进判断账本。 */
export async function addIssuePublish(
  userId: string,
  issueId: string,
  platform: IssuePlatform,
  url: string
): Promise<{ issue: Issue; bets: number }> {
  if (!ISSUE_PLATFORMS.includes(platform)) throw new Error("不认识这个平台");
  const link = url.trim();
  if (link && !/^https?:\/\//.test(link)) throw new Error("链接要以 http:// 或 https:// 开头");
  const issue = await loadOwnIssue(userId, issueId);
  const first = issue.published.length === 0;
  const published = [...issue.published, { platform, url: link, at: new Date().toISOString() }];
  const recorded = first ? await recordIssueBets(userId, issue) : [];
  const content = first ? { ...issue.content, recorded: [...(issue.content.recorded ?? []), ...recorded] } : issue.content;
  const { error } = await supabaseAdmin.from("signal_issues").update({ published, content }).eq("id", issueId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { issue: { ...issue, published, content }, bets: recorded.length };
}

/** 回应的是第几篇、哪一类（只认这几种），给观察的正文和标签用。 */
export function describeResponse(issue: Issue, pick: number | undefined, signal: ResponseSignal | undefined) {
  const p = pick !== undefined ? issue.content.picks[pick] : undefined;
  if (pick !== undefined && !p) throw new Error("这一期没有这一篇");
  if (signal !== undefined && !(signal in RESPONSE_SIGNALS)) throw new Error("不认识这一类回应");
  return {
    where: p ? `${issue.week_start} 那一期周刊第 ${pick! + 1} 篇（${p.headline}）` : `${issue.week_start} 那一期周刊`,
    // 对着宪法里证据只记的两个信号：有痛 / 愿付钱
    tags: signal === "pain" ? ["有痛"] : signal === "pay" ? ["愿付钱"] : [],
  };
}

/** 记一条读者回应（正文已经记成观察，这里只记是哪一篇、哪一类、他想不想聊）。 */
export async function addIssueResponse(
  userId: string,
  issueId: string,
  observationId: string,
  wantsTalk: boolean,
  pick?: number,
  signal?: ResponseSignal
): Promise<Issue> {
  const issue = await loadOwnIssue(userId, issueId);
  const responses = [
    ...issue.responses,
    {
      at: new Date().toISOString(),
      observation_id: observationId,
      wants_talk: wantsTalk,
      ...(pick !== undefined ? { pick } : {}),
      ...(signal ? { signal } : {}),
    },
  ];
  const { error } = await supabaseAdmin.from("signal_issues").update({ responses }).eq("id", issueId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ...issue, responses };
}
