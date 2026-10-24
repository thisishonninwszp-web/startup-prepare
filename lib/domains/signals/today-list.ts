import { supabaseAdmin } from "@/lib/supabase";
import { practiceHorizon, questionDeadline } from "@/lib/ai";
import { loadBriefPractice, loadQuestionBreakdowns } from "./breakdown";
import { anchorOf, boardSections, loadForecastBoard } from "./forecast";
import { dueRecalls } from "./recall";
import { loadExperimentBoard } from "./experiments";
import { listJudgments, pendingDueJudgments } from "./practice";
import { HORIZONS, isBlindPracticeDate, type HorizonKey } from "./practice-shared";
import { weekStartOf } from "./issue-shared";
import { sharedViewFor } from "./users";
import { isIssueDay, pickListItems, type ListCandidates, type ListItem } from "./today-list-shared";
import { getIssue, suggestIssuePicks } from "./issue";
import { listPostings } from "@/lib/domains/jobs/postings";
import { atsOf, ATS_SITES, boardOf, BOARD_SITES, categoryLabel, HIRE_TYPES, hireTypeOrder } from "@/lib/domains/jobs/shared";
import { loadGapVoices } from "./voices";
import { loadFakeDoorStats } from "./fake-door";
import { doorLang } from "./fake-door-shared";
import type { GapSide } from "./gaps-shared";

export * from "./today-list-shared";

const THREE_VIEWS = ["ai_outside", "ai_inside", "ai_devil"];

/**
 * 一分钟清单（经用户同意，2026-10-23）：今天要他点的，从现成的地方取 —— 当天的练习（主账号那份报告）、预测题分组、
 * 到期确认（只给出题的主账号）、到期的判断、回想、实验先猜；挑法在 today-list-shared.ts。邮件和清单页每次都现取。
 * 只读、不调 AI。哪一块取不到就当那一块是空的，不拦着别的。
 */
export async function loadTodayList(userId: string, today: string): Promise<{ items: ListItem[]; more: number }> {
  const view = await sharedViewFor(userId);
  const quiet =
    <T,>(what: string, fallback: T) =>
    (e: unknown): T => {
      console.error(`today-list: ${what}`, e);
      return fallback;
    };
  const [practice, board, dues, recalls, experiments, judgments, voices, doorStats] = await Promise.all([
    // 那一天没有报告或者没出练习题是常事，不记错
    loadBriefPractice(view.sourceUserId, today).catch(() => null),
    loadForecastBoard(userId).catch(quiet("forecast", null)),
    pendingDueJudgments(userId).catch(quiet("due", [])),
    dueRecalls(userId, view.shared, today, 5).catch(quiet("recall", null)),
    loadExperimentBoard(userId, today).catch(quiet("experiments", null)),
    listJudgments(userId).catch(quiet("judgments", [])),
    loadGapVoices(userId).catch(quiet("voices", new Map<string, never>())),
    loadFakeDoorStats(userId).catch(quiet("doors", new Map<string, never>())),
  ]);

  const c: ListCandidates = { practice: null, forecasts: [], confirms: [], dues: [], recalls: [], experiments: [], doors: [] };

  // 后台先做好的假门：他没说不要、还没发布（这一条还没有假门）的
  for (const [key, v] of Array.from(voices)) {
    const prep = v.door_draft;
    if (!prep || prep.dismissed_at || doorStats.has(key)) continue;
    const [side, signalId] = [key.slice(0, key.indexOf(":")) as GapSide, key.slice(key.indexOf(":") + 1)];
    c.doors.push({ signalId, side, lang: doorLang(side), draft: prep.draft, price: prep.price, priceBasis: prep.price_basis });
  }

  // 练习：他还没对这道题下过判断才放
  if (practice && !judgments.some((j) => j.signal_id === practice.signal_id && j.question === practice.question)) {
    const deadlineDate = questionDeadline(practice.question, today);
    const horizon: HorizonKey =
      practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, today);
    c.practice = {
      kind: "practice",
      date: today,
      signalId: practice.signal_id,
      question: practice.question,
      mode: isBlindPracticeDate(today) ? "blind" : practice.ai_draft ? "draft" : "waiting",
      draft: practice.ai_draft ?? null,
      breakdown: practice.breakdown ?? null,
      horizon,
      deadline: deadlineDate ? deadlineDate.toISOString().slice(0, 10) : undefined,
    };
  }

  if (board && board !== "missing-schema") {
    const s = boardSections(board, today);
    const breakdowns = await loadQuestionBreakdowns(s.toForecast.map((q) => q.id));
    // board 里 AI、市场、基准都是出题那一池的（loadForecastBoard 已经分好了），先摆的数直接从这里算
    c.forecasts = s.toForecast.map((q) => ({
      id: q.id,
      title: q.title,
      kind: q.kind,
      resolve_on: q.resolve_on,
      criteria: q.criteria,
      blind: s.blind.has(q.id),
      anchor: s.blind.has(q.id) ? null : anchorOf(q, board.forecasts),
      three: board.forecasts.filter((f) => f.question_id === q.id && THREE_VIEWS.includes(f.source)),
      breakdown: breakdowns.get(q.id) ?? null,
    }));
    c.confirms = s.toConfirm.flatMap((q) => (q.pending ? [{ id: q.id, title: q.title, criteria: q.criteria, resolve_on: q.resolve_on, pending: q.pending }] : []));
  }

  c.dues = dues.map((j) => ({
    id: j.id,
    predictionId: j.prediction_id,
    question: j.question,
    judgment: j.judgment,
    dueAt: j.due_at,
    evidence: j.outcome_evidence ? j.outcome_evidence.evidence : null,
  }));
  c.recalls = (recalls?.items ?? []).map((r) => ({ signalId: r.signal_id, title: r.title ?? "（没有标题）", reason: r.reason, dueOn: r.due_on }));
  if (experiments && experiments !== "missing-schema") {
    c.experiments = experiments.proposals.map((p) => ({ kind: p.kind, targetId: p.targetId, platform: p.platform, label: p.label, question: p.question, dueOn: p.dueOn }));
  }
  // 这周的周刊（周四到周日、这一周还没写，主账号才有）：AI 先挑好几条、先填「会不会」，点去网站上看、生成
  if (isIssueDay(today) && !view.shared) {
    const issue = await getIssue(userId).catch(() => "missing-schema" as const);
    if (issue === null || (issue !== "missing-schema" && issue.content.picks.length === 0)) {
      const picks = await suggestIssuePicks(userId).catch(quiet("issue", []));
      c.issue = { picks: picks.map((p) => ({ headline: p.headline, ai: p.ai, ...(p.will ? { will: p.will } : {}) })) };
    }
  }
  // 搜到、还没决定的岗位（主账号才有）：按求职页同一个事实顺序 —— 中途在前、新的在前；只摆事实，不打分
  if (!view.shared) {
    const postings = await listPostings(userId).catch(quiet("jobs", { picked: [], candidates: [] }));
    // 同一家同一个职位名的（同一个岗位挂在几个地方）只放一个，免得占两格
    const seen = new Set<string>();
    c.jobs = [...postings.candidates]
      .sort((a, b) => hireTypeOrder(a.facts.hire_type) - hireTypeOrder(b.facts.hire_type) || b.created_at.localeCompare(a.created_at))
      .filter((p) => {
        const k = `${p.company_name}|${p.title}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((p) => {
        const ats = atsOf(p.url);
        const board = boardOf(p.url);
        const min = p.facts.experience?.min_years;
        return {
          id: p.id,
          company: p.company_name,
          title: p.title,
          category: categoryLabel(p.category),
          hireType: HIRE_TYPES[p.facts.hire_type ?? "unclear"],
          experience: min === null || min === undefined ? null : min === 0 ? "不要经验" : `最少 ${min} 年`,
          route: ats ? `官网可直接应募（${ATS_SITES[ats].label}）` : board ? `要在 ${BOARD_SITES[board].label} 上投` : null,
          url: p.url,
        };
      });
  }
  return pickListItems(c);
}

/**
 * 这周（东京时间周一起）他点了几件，只数次数：从现成的时间戳数 —— 他的预测、判断、判断对账、回想、实验先猜、到期确认，不加表。
 * 哪张表没有（迁移没跑）就当 0。
 */
export async function tapsThisWeek(userId: string, today: string): Promise<number> {
  const since = `${weekStartOf(today)}T00:00:00+09:00`;
  const count = async (build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await build();
    return r.error ? 0 : r.count ?? 0;
  };
  const head = { count: "exact" as const, head: true };
  const view = await sharedViewFor(userId);
  const n = await Promise.all([
    count(() => supabaseAdmin.from("forecasts").select("question_id", head).eq("user_id", userId).eq("source", "me").gte("made_at", since)),
    count(() => supabaseAdmin.from("signal_judgments").select("id", head).eq("user_id", userId).gte("created_at", since)),
    count(() => supabaseAdmin.from("predictions").select("id", head).eq("user_id", userId).eq("source_type", "signal").neq("outcome", "pending").gte("resolved_at", since)),
    count(() => supabaseAdmin.from("recall_reviews").select("signal_id", head).eq("user_id", userId).gte("last_at", since)),
    count(() => supabaseAdmin.from("experiment_forecasts").select("id", head).eq("user_id", userId).gte("created_at", since)),
    // 到期确认只有出题的主账号点；生意题、到日本题对账都要他确认，所以按这两种数
    view.shared
      ? Promise.resolve(0)
      : count(() => supabaseAdmin.from("forecast_questions").select("id", head).eq("user_id", userId).in("kind", ["business", "arrival"]).neq("status", "open").gte("resolved_at", since)),
  ]);
  return n.reduce((a, b) => a + b, 0);
}
