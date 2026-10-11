import { supabaseAdmin } from "@/lib/supabase";
import { findHistoricalAnalogs } from "@/lib/ai";
import { getSignalDetail, type StoredHistory } from "./analysis";
import { fetchArticleBody } from "./article";
import { verifyBooks } from "./books";

/**
 * 历史上类似的事：第一次点开时生成，荐书核实过之后存进 external_signals.history，之后直接读。
 * 写判断之前就能看 —— 先看"这类事通常怎样"，是练判断的正确顺序。
 */
export async function ensureSignalHistory(id: string): Promise<StoredHistory> {
  const detail = await getSignalDetail(id);
  if (detail === "missing-schema") throw new Error("迁移 056 还没跑");
  if (!detail) throw new Error("这条已经不在了（两周没动的会被清掉）");
  if (detail.history) return detail.history;
  if (detail.kind === "tools") throw new Error("工具没有历史参照");

  const body = detail.excerpt ?? (await fetchArticleBody(detail.url));
  const raw = await findHistoricalAnalogs({ title: detail.title, summary: detail.summary, body });
  const history: StoredHistory = { ...raw, books: await verifyBooks(raw.books) };

  const { error } = await supabaseAdmin.from("external_signals").update({ history }).eq("id", id);
  if (error) throw new Error(error.message);
  return history;
}
