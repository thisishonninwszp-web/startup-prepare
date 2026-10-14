import { supabaseAdmin } from "@/lib/supabase";
import { composeIssue } from "@/lib/ai";
import { tokyoToday } from "./brief";
import { loadGapTransfers } from "./gap-transfer";
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
export async function issueCandidates(userId: string): Promise<{ gaps: IssueCandidate[]; bets: IssueBet[] }> {
  const since = daysAgo(LOOKBACK_DAYS);
  const [board, transfers, judgments] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapTransfers(userId),
    listJudgments(userId).catch(() => []),
  ]);
  const gaps: IssueCandidate[] = GAP_SIDES.flatMap((side) => [
    ...board.sides[side].arrived
      .filter((g) => g.arrivedOn >= since)
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
      .filter((g) => g.brief_date >= since)
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

/** 从清单里按 id 取一条差距，拼成这一期的一条（事实全从服务器拿）。 */
function buildPick(
  board: Awaited<ReturnType<typeof listGapBoard>>,
  transfers: Awaited<ReturnType<typeof loadGapTransfers>>,
  side: GapSide,
  signalId: string,
  stance: PickStance,
  note: string
): IssuePick {
  const arrived = board.sides[side].arrived.find((g) => g.signal_id === signalId);
  const open = board.sides[side].open.find((g) => g.signal_id === signalId);
  const gap: JapanGap | undefined = arrived ?? open;
  if (!gap) throw new Error("清单里找不到其中一条了，刷新一下再选");
  const transfer = transfers.get(transferKey(side, signalId));
  const sources = [
    ...(gap.url ? [{ title: gap.title, url: gap.url }] : []),
    ...gap.check.basis.map((b) => ({ title: b.title, url: b.url })),
    ...(arrived?.nowCheck?.basis ?? []).map((b) => ({ title: b.title, url: b.url })),
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
    ...(note.trim() ? { note: note.trim() } : {}),
    // 判断由服务器按他点的选项拼（不信浏览器传来的那句话）
    judgment: stanceSentence(stance, gapPlaces(side).here, note),
    url: gap.url,
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
  const [board, transfers, candidates] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapTransfers(userId),
    issueCandidates(userId),
  ]);
  const picks = input.picks.map((p, i) => buildPick(board, transfers, p.side, p.signal_id, stances[i]!, p.note));
  const bets = candidates.bets.filter((b) => input.betIds.includes(b.id));
  const content = { opening: input.opening.trim(), picks, bets };

  const body = await composeIssue({
    opening: content.opening,
    picks: picks.map((p) => {
      const { there, here } = gapPlaces(p.side);
      return { there, here, headline: p.headline, background: p.background, hereNow: p.here, whyNow: p.whyNow, funded: p.funded, conditions: p.conditions, judgment: p.judgment };
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
