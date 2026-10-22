import { supabaseAdmin } from "@/lib/supabase";
import type { FakeDoorContent } from "./fake-door-shared";
import type { IssueMetric, IssuePublish } from "./issue-shared";
import {
  doorProposals,
  experimentStats,
  issueProposals,
  resolveDoorSignups,
  resolveDoorViews,
  resolveIssueViews,
  type ExperimentKind,
  type ExperimentStats,
  type OpenForecast,
  type Proposal,
} from "./experiments-shared";

/**
 * 先猜自己实验的结果（迁移 095；原则 1 例外四的延伸）：假门开着时猜接下来 14 天会不会有人留邮箱、会不会被看到某个次数；
 * 周刊发出去两天以内猜 7 天的浏览。题目和门槛由代码出，他只点几成；到期由代码对账（周刊要等他填了数）。
 */

export const EXPERIMENTS_MISSING = "迁移 095 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/095_experiment_forecasts.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /experiment_forecasts|does not exist|schema cache/.test(error.message);
}

export type ExperimentForecast = {
  id: string;
  kind: ExperimentKind;
  target_id: string;
  platform: string;
  question: string;
  threshold: number;
  baseline: number;
  start_at: string;
  due_on: string;
  probability: number;
  status: "open" | "resolved" | "void";
  observed: number | null;
  outcome: boolean | null;
  resolved_at: string | null;
};

const COLUMNS = "id, kind, target_id, platform, question, threshold, baseline, start_at, due_on, probability, status, observed, outcome, resolved_at";

type Door = { id: string; open: boolean; views: number; content: FakeDoorContent; signups: string[] };
type IssueRow = { id: string; week_start: string; published: IssuePublish[]; metrics: IssueMetric[] };

async function loadTargets(userId: string): Promise<{ doors: Door[]; issues: IssueRow[] }> {
  const [doors, signups, issues] = await Promise.all([
    supabaseAdmin.from("signal_fake_doors").select("id, open, views, content").eq("user_id", userId),
    supabaseAdmin.from("signal_fake_door_signups").select("door_id, created_at").eq("user_id", userId),
    supabaseAdmin.from("signal_issues").select("id, week_start, published, metrics").eq("user_id", userId).order("week_start", { ascending: false }).limit(30),
  ]);
  const byDoor = new Map<string, string[]>();
  for (const s of (signups.error ? [] : signups.data ?? []) as { door_id: string; created_at: string }[]) {
    byDoor.set(s.door_id, [...(byDoor.get(s.door_id) ?? []), s.created_at]);
  }
  return {
    // 假门、周刊的表没建（或 089 没跑）就当没有
    doors: ((doors.error ? [] : doors.data ?? []) as Omit<Door, "signups">[]).map((d) => ({ ...d, signups: byDoor.get(d.id) ?? [] })),
    issues: ((issues.error ? [] : issues.data ?? []) as IssueRow[]).map((i) => ({ ...i, published: i.published ?? [], metrics: i.metrics ?? [] })),
  };
}

/** 到期的对账（代码对，不调 AI）。周刊到期了他还没填数的先放着。 */
async function resolveDue(open: ExperimentForecast[], targets: { doors: Door[]; issues: IssueRow[] }, today: string): Promise<number> {
  let did = 0;
  for (const f of open.filter((x) => x.due_on <= today)) {
    const door = targets.doors.find((d) => d.id === f.target_id);
    const issue = targets.issues.find((i) => i.id === f.target_id);
    const of: OpenForecast = { ...f };
    const r =
      f.kind === "door_signups" && door
        ? resolveDoorSignups(of, door.signups)
        : f.kind === "door_views" && door
          ? resolveDoorViews(of, door.views)
          : f.kind === "issue_views" && issue
            ? resolveIssueViews(of, issue.metrics)
            : f.kind !== "issue_views"
              ? "gone"
              : null;
    if (r === null) continue;
    const patch = r === "gone" ? { status: "void", resolved_at: new Date().toISOString() } : { status: "resolved", observed: r.observed, outcome: r.outcome, resolved_at: new Date().toISOString() };
    const { error } = await supabaseAdmin.from("experiment_forecasts").update(patch).eq("id", f.id).eq("status", "open");
    if (error) throw new Error(error.message);
    did += 1;
  }
  return did;
}

export type ExperimentBoard = {
  proposals: Proposal[];
  open: ExperimentForecast[];
  /** 等他填周刊的数才能对账的（到期了）。 */
  waiting: ExperimentForecast[];
  resolved: ExperimentForecast[];
  stats: ExperimentStats;
};

/** 他的实验预测：先对到期的账，再列出可以猜的、在等的、对过账的。迁移没跑返回 "missing-schema"。 */
export async function loadExperimentBoard(userId: string, today: string): Promise<ExperimentBoard | "missing-schema"> {
  const [targets, first] = await Promise.all([
    loadTargets(userId),
    supabaseAdmin.from("experiment_forecasts").select(COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
  ]);
  if (first.error) {
    if (missing(first.error)) return "missing-schema";
    throw new Error(first.error.message);
  }
  let rows = ((first.data ?? []) as ExperimentForecast[]).map((r) => ({ ...r, probability: Number(r.probability) }));
  if ((await resolveDue(rows.filter((r) => r.status === "open"), targets, today)) > 0) {
    const again = await supabaseAdmin.from("experiment_forecasts").select(COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
    if (again.error) throw new Error(again.error.message);
    rows = ((again.data ?? []) as ExperimentForecast[]).map((r) => ({ ...r, probability: Number(r.probability) }));
  }
  const open = rows.filter((r) => r.status === "open");
  const resolved = rows.filter((r) => r.status === "resolved");
  // 门槛：他以前对过账的同类实验实际多少
  const past = (kind: ExperimentKind, platform = "") => resolved.filter((r) => r.kind === kind && r.platform === platform && r.observed !== null).map((r) => r.observed as number);
  const hasOpen = (kind: ExperimentKind, targetId: string, platform = "") => open.some((r) => r.kind === kind && r.target_id === targetId && r.platform === platform);
  const everMade = (targetId: string, platform: string) => rows.some((r) => r.kind === "issue_views" && r.target_id === targetId && r.platform === platform);
  const proposals = [
    ...targets.doors.flatMap((d) =>
      doorProposals({ id: d.id, title: d.content?.title ?? "假门", open: d.open, views: d.views, signups: d.signups.length }, { signups: past("door_signups"), views: past("door_views") }, today).filter(
        (p) => !hasOpen(p.kind, p.targetId)
      )
    ),
    ...targets.issues.flatMap((i) =>
      issueProposals(
        { id: i.id, weekStart: i.week_start, published: i.published },
        Object.fromEntries(i.published.map((p) => [p.platform, past("issue_views", p.platform)])),
        today
      ).filter((p) => !everMade(p.targetId, p.platform))
    ),
  ];
  return {
    proposals,
    open: open.filter((r) => r.due_on > today || r.kind !== "issue_views"),
    waiting: open.filter((r) => r.kind === "issue_views" && r.due_on <= today),
    resolved,
    stats: experimentStats(resolved.map((r) => ({ probability: r.probability, outcome: r.outcome }))),
  };
}

/** 他猜了一道：题目、门槛、起点都按服务器这边现在算出来的存（不信浏览器传来的）。 */
export async function saveExperimentForecast(userId: string, today: string, pick: { kind: ExperimentKind; targetId: string; platform: string }, probability: number): Promise<void> {
  if (!(Number.isFinite(probability) && probability > 0 && probability < 1)) throw new Error("几成要在 0 到 1 之间");
  const board = await loadExperimentBoard(userId, today);
  if (board === "missing-schema") throw new Error(EXPERIMENTS_MISSING);
  const p = board.proposals.find((x) => x.kind === pick.kind && x.targetId === pick.targetId && x.platform === pick.platform);
  if (!p) throw new Error("这一道现在不能猜了（已经猜过，或者已经过了能猜的时候）");
  const { error } = await supabaseAdmin.from("experiment_forecasts").insert({
    user_id: userId,
    kind: p.kind,
    target_id: p.targetId,
    platform: p.platform,
    question: p.question,
    threshold: p.threshold,
    baseline: p.baseline,
    due_on: p.dueOn,
    probability,
  });
  if (error) {
    if (/duplicate key/.test(error.message)) throw new Error("这一道已经猜过了");
    throw new Error(missing(error) ? EXPERIMENTS_MISSING : error.message);
  }
}
