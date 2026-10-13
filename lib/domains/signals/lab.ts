import { supabaseAdmin } from "@/lib/supabase";
import { generateSignalBrief, shortlistCandidates, type BriefCandidate } from "@/lib/ai";
import { fetchArticle } from "./article";
import { loadBriefCandidates } from "./brief";
import { newsSourceLabel } from "./feeds";
import { LAB_VARIANTS, shuffledDisplay, type LabPick, type LabRun, type LabVariant, type LabVariantKey } from "./lab-shared";

export * from "./lab-shared";

/**
 * 挑法盲测：拿"今天的世界"同一批候选，用几种挑法各挑一遍，隐去名字给他看，他挑最想读的那一组。
 * 只比"挑哪几条"：页面上一律显示原标题，不显示 AI 改写的那句（每天的报告会按正文重写，几种挑法都一样）。
 * 测一次：五次 AI 调用（一次是更强的模型）、读十几篇网页，不用搜索额度。
 */

/** 更强的模型：Vercel 上设了 AI_MODEL_STRONG 就用它。 */
const STRONG_MODEL = process.env.AI_MODEL_STRONG ?? "gemini-2.5-pro";
const SHORTLIST_SIZE = 15;
/** 两轮挑法第二轮每条给 AI 看多少字正文。 */
const BODY_LENGTH = 900;
const THINKING_BUDGET = 2048;
/** 每种挑法最多等多久（页面的请求一共 60 秒）。 */
const VARIANT_TIMEOUT_MS = 50_000;
const LAB_KIND = "news";

const MISSING_MIGRATION = "迁移 065 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/065_signal_lab.sql。";

type Row = { id: unknown; source: string; title?: unknown; url?: unknown };

function toPicks(rows: Row[], indexes: number[]): LabPick[] {
  return indexes.map((i) => ({
    signal_id: rows[i].id as string,
    title: (rows[i].title as string | null) ?? "",
    url: (rows[i].url as string | null) ?? null,
    source: newsSourceLabel(rows[i].source),
  }));
}

async function pickWith(key: LabVariantKey, rows: Row[], candidates: BriefCandidate[]): Promise<number[]> {
  if (key === "current") return (await generateSignalBrief(LAB_KIND, candidates)).picks.map((p) => p.index);
  if (key === "thinking") {
    return (await generateSignalBrief(LAB_KIND, candidates, { thinkingBudget: THINKING_BUDGET })).picks.map((p) => p.index);
  }
  if (key === "strong") {
    return (await generateSignalBrief(LAB_KIND, candidates, { model: STRONG_MODEL, thinkingBudget: THINKING_BUDGET })).picks.map(
      (p) => p.index
    );
  }
  // 两轮：先按标题粗选，再读正文挑（读不到正文的那几条照旧用简介）
  const short = await shortlistCandidates(LAB_KIND, candidates, SHORTLIST_SIZE);
  const articles = await Promise.all(short.map((i) => fetchArticle((rows[i].url as string | null) ?? null)));
  const withBodies = short.map((i, j) => ({ ...candidates[i], text: articles[j].body || candidates[i].text }));
  const brief = await generateSignalBrief(LAB_KIND, withBodies, { thinkingBudget: THINKING_BUDGET, textLength: BODY_LENGTH });
  return brief.picks.map((p) => short[p.index]);
}

async function runVariant(key: LabVariantKey, rows: Row[], candidates: BriefCandidate[]): Promise<LabVariant> {
  const timeout = new Promise<LabVariant>((resolve) =>
    setTimeout(() => resolve({ key, picks: [], error: "超时没挑完" }), VARIANT_TIMEOUT_MS)
  );
  const run = pickWith(key, rows, candidates)
    .then((indexes): LabVariant => ({ key, picks: toPicks(rows, indexes) }))
    .catch((e): LabVariant => ({ key, picks: [], error: e instanceof Error ? e.message.slice(0, 200) : "没挑成" }));
  return Promise.race([run, timeout]);
}

/** 测一次，存下来，返回这一次的 id。 */
export async function runSelectionLab(userId: string): Promise<string> {
  const { rows, candidates } = await loadBriefCandidates(LAB_KIND);
  if (rows.length === 0) throw new Error("最近一天半还没有新的候选。等早上抓完再来。");
  const variants = await Promise.all(LAB_VARIANTS.map((key) => runVariant(key, rows as Row[], candidates)));
  const { data, error } = await supabaseAdmin
    .from("signal_lab_runs")
    .insert({ user_id: userId, kind: LAB_KIND, variants, display: shuffledDisplay() })
    .select("id")
    .single();
  if (error) {
    if (/signal_lab_runs/.test(error.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return data.id as string;
}

/** 最近几次，新的在前。表还没建时返回 null。 */
export async function listLabRuns(userId: string, limit = 30): Promise<LabRun[] | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_lab_runs")
    .select("id, kind, variants, display, chosen, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (/signal_lab_runs/.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    variants: (r.variants as LabVariant[] | null) ?? [],
    display: (r.display as LabVariantKey[] | null) ?? [],
    chosen: (r.chosen as LabVariantKey | null) ?? null,
    created_at: r.created_at as string,
  }));
}

/** 记下他选了哪一组。选过的不能改（揭晓以后再改就不是盲测了）。 */
export async function chooseLabVariant(userId: string, runId: string, key: LabVariantKey): Promise<void> {
  if (!LAB_VARIANTS.includes(key)) throw new Error("不认识这一组");
  const { error } = await supabaseAdmin
    .from("signal_lab_runs")
    .update({ chosen: key, chosen_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("user_id", userId)
    .is("chosen", null);
  if (error) throw new Error(error.message);
}
