import { supabaseAdmin } from "@/lib/supabase";
import { checkHistoryDrills, draftHistoryDrills, type AnalogCheck } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { tokyoToday, type BriefItem } from "./brief";
import { CONFIDENCE_LEVELS, type ConfidenceKey } from "./practice-shared";
import type { AnsweredDrill, OpenDrill } from "./drills-shared";

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
/** 每道搜几篇资料核实。 */
const DRILL_SEARCH_RESULTS = 4;

const MISSING_MIGRATION = "迁移 066 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/066_signal_drills.sql。";

/** 他最近在看的事：最近几天"今天的世界"的精选，加上在追的问题。 */
async function recentTopics(userId: string): Promise<string[]> {
  const since = tokyoToday(new Date(Date.now() - TOPIC_DAYS * 86_400_000));
  const [briefs, questions] = await Promise.all([
    supabaseAdmin.from("signal_briefs").select("items").eq("user_id", userId).eq("kind", "news").gte("brief_date", since),
    supabaseAdmin.from("signal_questions").select("question").eq("user_id", userId).is("archived_at", null).limit(4),
  ]);
  if (briefs.error) throw new Error(briefs.error.message);
  const headlines = (briefs.data ?? []).flatMap((r) => ((r.items as BriefItem[] | null) ?? []).filter((i) => !i.extra).map((i) => i.headline));
  // 问题表没建（059 没跑）就只用新闻
  const asked = questions.error ? [] : (questions.data ?? []).map((q) => `他在追的问题：${q.question as string}`);
  return [...asked, ...headlines].slice(0, MAX_TOPICS);
}

/** 出一批题、核实、只存核实到出处的。返回存下几道。 */
export async function generateDrills(userId: string): Promise<number> {
  const topics = await recentTopics(userId);
  if (topics.length === 0) throw new Error("最近几天还没有报告，没东西可以对照着出题。等明天早上的报告出来再来。");
  const drafts = await draftHistoryDrills(topics, tokyoToday());
  if (drafts.length === 0) throw new Error("这次没出成题，再来一次。");
  const sources = await Promise.all(drafts.map((d) => webSearch(d.query, DRILL_SEARCH_RESULTS).catch(() => [])));
  const checked = await checkHistoryDrills(drafts.map((draft, i) => ({ draft, sources: sources[i] })));
  if (checked.length === 0) throw new Error("这次出的题都没在网上核实到出处，宁可不出。再来一次。");
  const { error } = await supabaseAdmin.from("signal_drills").insert(
    checked.map((d) => ({
      user_id: userId,
      topic: d.topic >= 0 ? topics[d.topic] : null,
      setup: d.setup,
      question: d.question,
      deadline: d.deadline,
      answer: d.answer,
      what_happened: d.whatHappened,
      why_similar: d.whySimilar || null,
      source_check: d.check,
    }))
  );
  if (error) {
    if (/signal_drills/.test(error.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return checked.length;
}

/** 还没答的最早那一道（不带答案）。表还没建时返回 "missing-schema"。 */
export async function nextDrill(userId: string): Promise<OpenDrill | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_drills")
    .select("id, topic, setup, question")
    .eq("user_id", userId)
    .is("guess", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/signal_drills/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return data ? { id: data.id as string, topic: (data.topic as string | null) ?? null, setup: data.setup as string, question: data.question as string } : null;
}

const ANSWERED_COLUMNS =
  "id, topic, setup, question, deadline, answer, what_happened, why_similar, source_check, guess, confidence, reasoning, answered_at";

function toAnswered(r: Record<string, unknown>): AnsweredDrill {
  return {
    id: r.id as string,
    topic: (r.topic as string | null) ?? null,
    setup: r.setup as string,
    question: r.question as string,
    deadline: r.deadline as string,
    answer: r.answer as boolean,
    what_happened: r.what_happened as string,
    why_similar: (r.why_similar as string | null) ?? null,
    source_check: r.source_check as AnalogCheck,
    guess: r.guess as boolean,
    confidence: (r.confidence as number | null) ?? null,
    reasoning: (r.reasoning as string | null) ?? null,
    answered_at: r.answered_at as string,
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
  if (error) throw new Error(error.message);
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
    if (/signal_drills/.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => toAnswered(r as Record<string, unknown>));
}
