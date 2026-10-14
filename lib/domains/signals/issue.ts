import { supabaseAdmin } from "@/lib/supabase";
import { composeIssue } from "@/lib/ai";
import { tokyoToday } from "./brief";
import { loadGapTransfers } from "./gap-transfer";
import { listGapBoard, GAP_SIDES } from "./gaps";
import { gapPlaces, transferKey, type GapSide, type JapanGap } from "./gaps-shared";
import { displayQuestion, listJudgments } from "./practice";
import {
  assembleDrafts,
  ISSUE_MAX_PICKS,
  ISSUE_MIN_JUDGMENT,
  ISSUE_PLATFORMS,
  weekStartOf,
  type Issue,
  type IssueBet,
  type IssuePick,
  type IssuePlatform,
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
    content: r.content as Issue["content"],
    drafts: (r.drafts as Issue["drafts"]) ?? null,
    published: (r.published as Issue["published"]) ?? [],
    responses: (r.responses as Issue["responses"]) ?? [],
  };
}

const ISSUE_COLUMNS = "id, week_start, content, drafts, published, responses";

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
  judgment: string
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
    judgment: judgment.trim(),
  };
}

/** 生成（或重新生成）这一周的稿子并存下来。发过的、收到的回应不动。 */
export async function composeAndSaveIssue(
  userId: string,
  input: { picks: { side: GapSide; signal_id: string; judgment: string }[]; betIds: string[]; opening: string }
): Promise<Issue> {
  if (input.picks.length === 0) throw new Error("至少挑一条");
  if (input.picks.length > ISSUE_MAX_PICKS) throw new Error(`一期最多 ${ISSUE_MAX_PICKS} 条`);
  for (const p of input.picks) {
    if (p.judgment.trim().length < ISSUE_MIN_JUDGMENT) throw new Error("每条都写一句完整的判断，发出去的就是这句话");
  }
  const [board, transfers, candidates] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapTransfers(userId),
    issueCandidates(userId),
  ]);
  const picks = input.picks.map((p) => buildPick(board, transfers, p.side, p.signal_id, p.judgment));
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

async function loadOwnIssue(userId: string, issueId: string): Promise<Issue> {
  const { data, error } = await supabaseAdmin.from("signal_issues").select(ISSUE_COLUMNS).eq("id", issueId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("找不到这一期");
  return toIssue(data as Record<string, unknown>);
}

/** 记一笔发在了哪。 */
export async function addIssuePublish(userId: string, issueId: string, platform: IssuePlatform, url: string): Promise<Issue> {
  if (!ISSUE_PLATFORMS.includes(platform)) throw new Error("不认识这个平台");
  const link = url.trim();
  if (link && !/^https?:\/\//.test(link)) throw new Error("链接要以 http:// 或 https:// 开头");
  const issue = await loadOwnIssue(userId, issueId);
  const published = [...issue.published, { platform, url: link, at: new Date().toISOString() }];
  const { error } = await supabaseAdmin.from("signal_issues").update({ published }).eq("id", issueId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ...issue, published };
}

/** 记一条读者回应（正文已经记成观察，这里只记是哪一条、他想不想聊）。 */
export async function addIssueResponse(userId: string, issueId: string, observationId: string, wantsTalk: boolean): Promise<Issue> {
  const issue = await loadOwnIssue(userId, issueId);
  const responses = [...issue.responses, { at: new Date().toISOString(), observation_id: observationId, wants_talk: wantsTalk }];
  const { error } = await supabaseAdmin.from("signal_issues").update({ responses }).eq("id", issueId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ...issue, responses };
}
