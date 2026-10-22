import { supabaseAdmin } from "@/lib/supabase";
import { analyzeNewsItem, analyzeToolItem, type NewsAnalysis, type ToolAnalysis } from "@/lib/ai";
import { fetchArticleBody } from "./article";
import { loadSignalReader } from "./brief";
import { isGithubSource, newsSourceLabel } from "./feeds";
import { fetchReadme } from "./github";
import { usableSummary } from "./summary";
import type { VerifiedBook } from "./books";
import type { SignalHistory } from "@/lib/ai";

/** 存进 external_signals.history 的样子：荐书已经核实过、带链接。 */
export type StoredHistory = Omit<SignalHistory, "books"> & { books: VerifiedBook[] };

/**
 * 单条详情的 AI 深读：第一次打开时生成，连同原文开头一起存进 external_signals，之后直接读。
 * 单用户阶段，深读里用到的"关于你"就是这一个用户的；多用户时要按用户分开存。
 */

export type SignalAnalysis =
  | ({ kind: "news" } & NewsAnalysis)
  | ({ kind: "tools" } & ToolAnalysis);

export type SignalDetail = {
  id: string;
  kind: "news" | "tools";
  source: string;
  title: string;
  url: string | null;
  summary: string;
  status: string;
  published_at: string | null;
  excerpt: string | null;
  analysis: SignalAnalysis | null;
  history: StoredHistory | null;
};

const EXCERPT_LENGTH = 1200;

/** 迁移 054 没跑时返回 "missing-schema"。 */
export async function getSignalDetail(id: string): Promise<SignalDetail | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, source, title, url, raw_text, status, published_at, excerpt, analysis, history")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (/excerpt|analysis|history/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  if (!data) return null;
  const source = data.source as string;
  // "谁在头疼什么"、日程的条目也是文章，按新闻的方式读
  // "什么变得可能了"的新闻也在新工具那一节，但它是文章，按新闻的方式读；只有 GitHub 仓库读 README
  const kind = isGithubSource(source) ? "tools" : "news";
  const title = (data.title as string | null) ?? "";
  return {
    id: data.id as string,
    kind,
    source: newsSourceLabel(source),
    title,
    url: (data.url as string | null) ?? null,
    summary: kind === "tools" ? (data.raw_text as string) : usableSummary(title, data.raw_text as string),
    status: data.status as string,
    published_at: (data.published_at as string | null) ?? null,
    excerpt: (data.excerpt as string | null) ?? null,
    analysis: (data.analysis as SignalAnalysis | null) ?? null,
    history: (data.history as StoredHistory | null) ?? null,
  };
}

/** 生成并存下深读。已经有的话直接返回，不重复调用 AI。 */
export async function ensureSignalAnalysis(userId: string, id: string): Promise<SignalAnalysis> {
  const detail = await getSignalDetail(id);
  if (detail === "missing-schema") throw new Error("迁移 054 还没跑");
  if (!detail) throw new Error("这条已经不在了");
  if (detail.analysis) return detail.analysis;

  const reader = await loadSignalReader(userId);
  let analysis: SignalAnalysis;
  let excerpt: string;

  if (detail.kind === "tools") {
    const readme = await fetchReadme(detail.title);
    excerpt = readme.slice(0, EXCERPT_LENGTH);
    analysis = {
      kind: "tools",
      ...(await analyzeToolItem({ ...reader, name: detail.title, description: detail.summary, readme })),
    };
  } else {
    const body = await fetchArticleBody(detail.url);
    excerpt = body.slice(0, EXCERPT_LENGTH);
    analysis = {
      kind: "news",
      ...(await analyzeNewsItem({
        ...reader,
        title: detail.title,
        summary: detail.summary,
        body,
        source: detail.source,
      })),
    };
  }

  const { error } = await supabaseAdmin
    .from("external_signals")
    .update({ analysis, excerpt: excerpt || null, analyzed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return analysis;
}
