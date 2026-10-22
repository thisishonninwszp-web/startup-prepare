import { supabaseAdmin } from "@/lib/supabase";
import { checkAnalogs, findHistoricalAnalogs, type HistoricalAnalog } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { getSignalDetail, type StoredHistory } from "./analysis";
import { fetchArticleBody } from "./article";
import { verifyBooks } from "./books";
import { mergeSources } from "./sources";

/**
 * 历史上类似的事：第一次点开时生成，存进 external_signals.history，之后直接读。
 * 写判断之前就能看 —— 先看"这类事通常怎样"，是练判断的正确顺序。
 *
 * AI 擅长想到"哪几次像"，不擅长记准细节（年份、利率调到多少、后来怎样）。
 * 所以先让它提参照，再逐条上网核实：查到出处的附原文；和它记的不一样的按原文改正、写明哪里不一样；
 * 没查到的标"凭记忆写的"。"这类事通常会怎样"只用查到出处的那几次归纳。
 * 每一次参照都写"像在哪、不像在哪"（《Thinking in Time》的做法）：错误的类比几乎都错在不像的地方。
 * 每一次都用两种语言各搜一次：日本、中国的事只用本国语言搜，常常搜不到能逐字核对的原文。
 */

const SEARCH_RESULTS_PER_QUERY = 3;
/** 两种语言的结果合起来最多交给核实几篇。 */
const MAX_SOURCES_PER_ANALOG = 5;

async function searchOne(query: string) {
  try {
    return await webSearch(query, SEARCH_RESULTS_PER_QUERY);
  } catch {
    return [];
  }
}

async function searchAnalog(analog: HistoricalAnalog) {
  const primary = analog.query || `${analog.when} ${analog.what}`;
  const groups = await Promise.all([searchOne(primary), analog.altQuery ? searchOne(analog.altQuery) : Promise.resolve([])]);
  return mergeSources(groups, MAX_SOURCES_PER_ANALOG);
}

/** 核实单独一条参照（他自己想到的类比）。核实失败就标没查到出处，不冒充核实过。 */
export async function verifyAnalog(analog: HistoricalAnalog): Promise<HistoricalAnalog> {
  try {
    const sources = await searchAnalog(analog);
    const { analogs } = await checkAnalogs([{ analog, sources }]);
    return { ...analogs[0], source: analog.source };
  } catch (e) {
    console.error("analog check failed", e);
    return { ...analog, check: { status: "unverified", basis: [] } };
  }
}

/** 找参照 → 逐条上网核实 → 核实荐书。新闻详情和问题驱动共用。 */
export async function researchHistory(input: {
  title: string;
  summary: string;
  body: string;
  subject?: "news" | "question";
}): Promise<StoredHistory> {
  const raw = await findHistoricalAnalogs(input);

  // 历史核实和荐书核实互不依赖，一起跑
  const [checked, books] = await Promise.all([
    (async () => {
      try {
        const sources = await Promise.all(raw.analogs.map(searchAnalog));
        return await checkAnalogs(raw.analogs.map((analog, i) => ({ analog, sources: sources[i] })));
      } catch (e) {
        // 核实失败就照 AI 原来写的存，但每条标成没查到出处，不冒充核实过
        console.error("history check failed", e);
        return {
          analogs: raw.analogs.map((a) => ({ ...a, check: { status: "unverified" as const, basis: [] } })),
          baseRate: raw.baseRate,
        };
      }
    })(),
    verifyBooks(raw.books),
  ]);

  return { ...raw, analogs: checked.analogs, baseRate: checked.baseRate, books };
}

export async function ensureSignalHistory(id: string): Promise<StoredHistory> {
  const detail = await getSignalDetail(id);
  if (detail === "missing-schema") throw new Error("迁移 056 还没跑");
  if (!detail) throw new Error("这条已经不在了");
  if (detail.history) return detail.history;
  if (detail.kind === "tools") throw new Error("工具没有历史参照");

  const body = detail.excerpt ?? (await fetchArticleBody(detail.url));
  const history = await researchHistory({ title: detail.title, summary: detail.summary, body });
  const { error } = await supabaseAdmin.from("external_signals").update({ history }).eq("id", id);
  if (error) throw new Error(error.message);
  return history;
}
