import { supabaseAdmin } from "@/lib/supabase";
import { checkHistoryDrills, draftHistoryDrills, judgeReasonMatch, type AnalogCheck } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { mergeSources } from "./sources";
import { tokyoToday, type BriefItem } from "./brief";
import { CONFIDENCE_LEVELS, MISS_REASONS, type ConfidenceKey, type MissReason } from "./practice-shared";
import { DRILL_FLAGS, pickBalanced, type AnsweredDrill, type DrillBasis, type DrillFlag, type OpenDrill } from "./drills-shared";

export * from "./drills-shared";

/**
 * 历史题：真实的判断要等几个月才对账，反馈太慢。挑过去真实发生过、结果早已揭晓的事，
 * 把他放回当时，只给当时知道的信息，猜"会不会"，答完马上揭晓。
 * 题目和他最近在看的新闻、在追的问题像（同一类机制或局面），答案上网核实过，没核实到出处的不出。
 * 对错由代码比他选的"会 / 不会"和核实过的答案，不用自己判。
 */

/** 拿最近几天的报告当"他最近在看的事"。 */
const TOPIC_DAYS = 3;
const MAX_TOPICS = 10;
/** 每道每种语言搜几篇资料核实（两种语言各搜一次）。 */
const DRILL_SEARCH_RESULTS = 3;

const MISSING_MIGRATION = "迁移 066 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/066_signal_drills.sql。";
const MISSING_068 = "迁移 068 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/068_signal_drills_criterion.sql。";
/** 068 加的列不存在时报的错。 */
const MISSING_068_COLUMNS = /as_of|criterion|flag/;
const MISSING_069 = "迁移 069 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/069_signal_drills_reasons.sql。";
const MISSING_069_COLUMNS = /decided_by|decided_basis|reason_match/;
/** 看最近答过的几道来决定下一道出"会"还是"不会"。 */
const BALANCE_WINDOW = 20;
const MISSING_070 = "迁移 070 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/070_signal_drills_loop.sql。";
const MISSING_070_COLUMNS = /topic_signal_id|topic_question_id|today_question|reason_judge|miss_reason/;

type Topic = { text: string; signalId?: string; questionId?: string };

/** 他最近在看的事：最近几天"今天的世界"的精选，加上在追的问题。带着 id，揭晓后好回到那件事上下判断。 */
async function recentTopics(userId: string): Promise<Topic[]> {
  const since = tokyoToday(new Date(Date.now() - TOPIC_DAYS * 86_400_000));
  const [briefs, questions] = await Promise.all([
    supabaseAdmin.from("signal_briefs").select("items").eq("user_id", userId).eq("kind", "news").gte("brief_date", since),
    supabaseAdmin.from("signal_questions").select("id, question").eq("user_id", userId).is("archived_at", null).limit(4),
  ]);
  if (briefs.error) throw new Error(briefs.error.message);
  const news = (briefs.data ?? []).flatMap((r) =>
    ((r.items as BriefItem[] | null) ?? []).filter((i) => !i.extra).map((i) => ({ text: i.headline, signalId: i.signal_id }))
  );
  // 问题表没建（059 没跑）就只用新闻
  const asked = questions.error
    ? []
    : (questions.data ?? []).map((q) => ({ text: `他在追的问题：${q.question as string}`, questionId: q.id as string }));
  return [...asked, ...news].slice(0, MAX_TOPICS);
}

/** 记一笔这一批出了几道、搜到资料几道、通过几道。记不上不影响出题。 */
async function logBatch(userId: string, drafted: number, searched: number, passed: number): Promise<void> {
  const { error } = await supabaseAdmin.from("signal_drill_batches").insert({ user_id: userId, drafted, searched, passed });
  if (error) console.error("drill batch log failed", error.message);
}

/** 出一批题、核实、只存核实到出处的。返回存下几道。 */
export async function generateDrills(userId: string): Promise<number> {
  const topics = await recentTopics(userId);
  if (topics.length === 0) throw new Error("最近几天还没有报告，没东西可以对照着出题。等明天早上的报告出来再来。");
  const drafts = await draftHistoryDrills(
    topics.map((t) => t.text),
    tokyoToday()
  );
  if (drafts.length === 0) {
    await logBatch(userId, 0, 0, 0);
    throw new Error("这次没出成题，再来一次。");
  }
  const sources = await Promise.all(
    drafts.map(async (d) => {
      const [local, en] = await Promise.all([
        webSearch(d.query, DRILL_SEARCH_RESULTS).catch(() => []),
        d.queryEn ? webSearch(d.queryEn, DRILL_SEARCH_RESULTS).catch(() => []) : Promise.resolve([]),
      ]);
      return mergeSources([local, en], DRILL_SEARCH_RESULTS * 2);
    })
  );
  const checked = await checkHistoryDrills(drafts.map((draft, i) => ({ draft, sources: sources[i] })));
  const searched = sources.filter((s) => s.length > 0).length;
  await logBatch(userId, drafts.length, searched, checked.length);
  if (checked.length === 0) {
    // 带上数字，分得清是搜不到资料，还是搜到了却对不上
    throw new Error(
      `这次出了 ${drafts.length} 道，搜到资料的 ${searched} 道，核实到出处的 0 道，宁可不出。` +
        (searched === 0 ? "一篇资料都没搜到，多半是搜索出了问题，去信息源体检看一眼搜索用量。" : "再来一次。")
    );
  }
  const { error } = await supabaseAdmin.from("signal_drills").insert(
    checked.map((d) => ({
      user_id: userId,
      topic: d.topic >= 0 ? topics[d.topic].text : null,
      topic_signal_id: d.topic >= 0 ? (topics[d.topic].signalId ?? null) : null,
      topic_question_id: d.topic >= 0 ? (topics[d.topic].questionId ?? null) : null,
      today_question: d.todayQuestion || null,
      as_of: d.asOf,
      setup: d.setup,
      question: d.question,
      criterion: d.criterion,
      deadline: d.deadline,
      answer: d.answer,
      what_happened: d.whatHappened,
      why_similar: d.whySimilar || null,
      source_check: d.check,
      decided_by: d.decidedBy?.text ?? null,
      decided_basis: d.decidedBy?.basis ?? null,
    }))
  );
  if (error) {
    if (MISSING_070_COLUMNS.test(error.message)) throw new Error(MISSING_070);
    if (MISSING_069_COLUMNS.test(error.message)) throw new Error(MISSING_069);
    if (MISSING_068_COLUMNS.test(error.message)) throw new Error(MISSING_068);
    if (/signal_drills/.test(error.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return checked.length;
}

/**
 * 下一道（不带答案）：从没答、没跳过的题里挑，最近答过的题答案偏向"会"就优先出"不会"，反过来也一样。
 * 068 之前出的题没有"怎么才算会"，不再出给他（标准说不清的题不公平）。
 * 表还没建返回 "missing-066"，068 没跑返回 "missing-068"。
 */
export async function nextDrill(
  userId: string
): Promise<{ drill: OpenDrill | null; remaining: number } | "missing-066" | "missing-068"> {
  const [pool, recent] = await Promise.all([
    supabaseAdmin
      .from("signal_drills")
      .select("id, topic, setup, question, criterion, answer")
      .eq("user_id", userId)
      .is("guess", null)
      .is("flag", null)
      .not("criterion", "is", null)
      .limit(50),
    supabaseAdmin
      .from("signal_drills")
      .select("answer")
      .eq("user_id", userId)
      .not("guess", "is", null)
      .order("answered_at", { ascending: false })
      .limit(BALANCE_WINDOW),
  ]);
  const error = pool.error ?? recent.error;
  if (error) {
    if (MISSING_068_COLUMNS.test(error.message)) return "missing-068";
    if (/signal_drills/.test(error.message)) return "missing-066";
    throw new Error(error.message);
  }
  const picked = pickBalanced(
    (pool.data ?? []).map((d) => ({ ...d, answer: d.answer as boolean })),
    (recent.data ?? []).map((r) => r.answer as boolean)
  );
  // 答案留在服务器上，只把题面交出去；remaining 是这一道之外还攒着几道（少了页面就在后台出下一批）
  return {
    drill: picked
      ? {
          id: picked.id as string,
          topic: (picked.topic as string | null) ?? null,
          setup: picked.setup as string,
          question: picked.question as string,
          criterion: (picked.criterion as string | null) ?? null,
        }
      : null,
    remaining: Math.max(0, (pool.data ?? []).length - (picked ? 1 : 0)),
  };
}

/**
 * 揭晓后他自己标"我当时的理由对上了没有"，再请裁判独立判一次（只提名、不改他标的）。
 * 返回裁判的看法；裁判不可用、没写理由、资料没写原因时为 null。
 */
export async function markReasonMatch(userId: string, id: string, match: boolean): Promise<boolean | null> {
  const { data, error: loadError } = await supabaseAdmin
    .from("signal_drills")
    .select("question, reasoning, decided_by")
    .eq("id", id)
    .eq("user_id", userId)
    .not("guess", "is", null)
    .maybeSingle();
  if (loadError) {
    if (MISSING_069_COLUMNS.test(loadError.message)) throw new Error(MISSING_069);
    throw new Error(loadError.message);
  }
  if (!data) throw new Error("找不到这道题");
  const reasoning = (data.reasoning as string | null) ?? "";
  const decidedBy = (data.decided_by as string | null) ?? "";
  const judge = reasoning && decidedBy ? await judgeReasonMatch({ question: data.question as string, reasoning, decidedBy }) : null;
  const { error } = await supabaseAdmin
    .from("signal_drills")
    .update({ reason_match: match, reason_judge: judge })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    if (MISSING_070_COLUMNS.test(error.message)) throw new Error(MISSING_070);
    throw new Error(error.message);
  }
  return judge;
}

/** 猜错时选"错在哪一步"（和判断账本同一套五类）。 */
export async function setDrillMissReason(userId: string, id: string, reason: MissReason): Promise<void> {
  if (!(reason in MISS_REASONS)) throw new Error("不认识这个原因");
  const { error } = await supabaseAdmin
    .from("signal_drills")
    .update({ miss_reason: reason })
    .eq("id", id)
    .eq("user_id", userId)
    .not("guess", "is", null);
  if (error) {
    if (MISSING_070_COLUMNS.test(error.message)) throw new Error(MISSING_070);
    throw new Error(error.message);
  }
}

/** 最近几批出了几道、搜到资料几道、通过几道（加起来）。表还没建时返回 null。 */
export async function recentDrillYield(
  userId: string,
  batches = 10
): Promise<{ batches: number; drafted: number; searched: number; passed: number } | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_drill_batches")
    .select("drafted, searched, passed")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(batches);
  if (error) return null;
  const rows = data ?? [];
  const sum = (k: "drafted" | "searched" | "passed") => rows.reduce((n, r) => n + ((r[k] as number) ?? 0), 0);
  return { batches: rows.length, drafted: sum("drafted"), searched: sum("searched"), passed: sum("passed") };
}

/** 这题出得不好，跳过：记下原因，不算进次数。答过的不能跳。 */
export async function flagDrill(userId: string, id: string, flag: DrillFlag): Promise<void> {
  if (!(flag in DRILL_FLAGS)) throw new Error("不认识这个原因");
  const { error } = await supabaseAdmin
    .from("signal_drills")
    .update({ flag })
    .eq("id", id)
    .eq("user_id", userId)
    .is("guess", null);
  if (error) {
    if (MISSING_068_COLUMNS.test(error.message)) throw new Error(MISSING_068);
    throw new Error(error.message);
  }
}

const ANSWERED_COLUMNS =
  "id, topic, setup, question, criterion, deadline, answer, what_happened, why_similar, source_check, guess, confidence, reasoning, answered_at, decided_by, decided_basis, reason_match, topic_signal_id, topic_question_id, today_question, reason_judge, miss_reason";

function toAnswered(r: Record<string, unknown>): AnsweredDrill {
  return {
    id: r.id as string,
    topic: (r.topic as string | null) ?? null,
    setup: r.setup as string,
    question: r.question as string,
    criterion: (r.criterion as string | null) ?? null,
    deadline: r.deadline as string,
    answer: r.answer as boolean,
    what_happened: r.what_happened as string,
    why_similar: (r.why_similar as string | null) ?? null,
    source_check: r.source_check as AnalogCheck,
    guess: r.guess as boolean,
    confidence: (r.confidence as number | null) ?? null,
    reasoning: (r.reasoning as string | null) ?? null,
    answered_at: r.answered_at as string,
    decided_by: (r.decided_by as string | null) ?? null,
    decided_basis: (r.decided_basis as DrillBasis | null) ?? null,
    reason_match: (r.reason_match as boolean | null) ?? null,
    topic_signal_id: (r.topic_signal_id as string | null) ?? null,
    topic_question_id: (r.topic_question_id as string | null) ?? null,
    today_question: (r.today_question as string | null) ?? null,
    reason_judge: (r.reason_judge as boolean | null) ?? null,
    miss_reason: (r.miss_reason as MissReason | null) ?? null,
  };
}

/** 答一道：存下他的"会 / 不会"、把握和一句理由，返回揭晓后的整道题。答过的不能改。 */
export async function answerDrill(
  userId: string,
  id: string,
  guess: boolean,
  confidence: ConfidenceKey | null,
  reasoning: string
): Promise<AnsweredDrill> {
  const { data, error } = await supabaseAdmin
    .from("signal_drills")
    .update({
      guess,
      confidence: confidence ? CONFIDENCE_LEVELS[confidence].value : null,
      reasoning: reasoning.trim().slice(0, 300) || null,
      answered_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .is("guess", null)
    .select(ANSWERED_COLUMNS)
    .maybeSingle();
  if (error) {
    if (MISSING_070_COLUMNS.test(error.message)) throw new Error(MISSING_070);
    if (MISSING_069_COLUMNS.test(error.message)) throw new Error(MISSING_069);
    throw new Error(error.message);
  }
  if (!data) throw new Error("这道题已经答过了");
  return toAnswered(data as Record<string, unknown>);
}

/** 答过的题，新的在前。 */
export async function listAnsweredDrills(userId: string, limit = 200): Promise<AnsweredDrill[]> {
  const { data, error } = await supabaseAdmin
    .from("signal_drills")
    .select(ANSWERED_COLUMNS)
    .eq("user_id", userId)
    .not("guess", "is", null)
    .order("answered_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (
      /signal_drills/.test(error.message) ||
      MISSING_068_COLUMNS.test(error.message) ||
      MISSING_069_COLUMNS.test(error.message) ||
      MISSING_070_COLUMNS.test(error.message)
    ) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => toAnswered(r as Record<string, unknown>));
}
