import { supabaseAdmin } from "@/lib/supabase";
import { executeEmbedding } from "@/lib/ai-gateway";
import { answerFromArchive, type ArchiveStatement } from "@/lib/ai";
import {
  embedText,
  mergeHits,
  parseVector,
  RESURFACE_DAYS,
  SAME_STORY,
  tokyoDayRange,
  type ArchiveHit,
  type Mark,
  type MarkKind,
} from "./memory-shared";

export * from "./memory-shared";

/**
 * 记忆层（迁移 091）：抓到的新闻全部存着，这里给它们算指纹、按意思搜、找这件事的以前和后来、
 * 存他点的标记、到时候拿出来给他看、按存档回答他的问题（只许引用存档里的那几条）。
 */

export const MEMORY_MISSING = "迁移 091 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/091_signal_memory_forecasts.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /embedding|match_external_signals|signal_marks|does not exist|schema cache/.test(error.message);
}

/** 还没算指纹的有几条。迁移没跑返回 null。 */
export async function unembeddedCount(): Promise<number | null> {
  const { count, error } = await supabaseAdmin.from("external_signals").select("id", { count: "exact", head: true }).is("embedding", null);
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  return count ?? 0;
}

/** 存档一共几条、算过指纹的几条。 */
export async function archiveCoverage(): Promise<{ total: number; embedded: number } | null> {
  const [all, todo] = await Promise.all([
    supabaseAdmin.from("external_signals").select("id", { count: "exact", head: true }),
    unembeddedCount(),
  ]);
  if (all.error) throw new Error(all.error.message);
  if (todo === null) return null;
  return { total: all.count ?? 0, embedded: (all.count ?? 0) - todo };
}

/** 给还没算指纹的（新的先）算一批，最多 limit 条。返回算了几条、还剩几条。 */
export async function embedBacklog(limit = 300): Promise<{ embedded: number; remaining: number }> {
  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, title, raw_text")
    .is("embedding", null)
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (missing(error)) throw new Error(MEMORY_MISSING);
    throw new Error(error.message);
  }
  const rows = (data ?? []) as { id: string; title: string | null; raw_text: string }[];
  if (rows.length > 0) {
    const vectors = await executeEmbedding(rows.map(embedText), "document");
    const now = new Date().toISOString();
    // 只能一条一条 update（这张表有非空列，upsert 会当成插入去检查）；二十条一起发
    for (let i = 0; i < rows.length; i += 20) {
      const results = await Promise.all(
        rows.slice(i, i + 20).map((r, j) => supabaseAdmin.from("external_signals").update({ embedding: vectors[i + j], embedded_at: now }).eq("id", r.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    }
  }
  return { embedded: rows.length, remaining: (await unembeddedCount()) ?? 0 };
}

async function match(vector: number[], count: number, range: { after?: string; before?: string } = {}): Promise<ArchiveHit[]> {
  const { data, error } = await supabaseAdmin.rpc("match_external_signals", {
    query_embedding: vector,
    match_count: count,
    after: range.after ?? null,
    before: range.before ?? null,
  });
  if (error) {
    if (missing(error)) throw new Error(MEMORY_MISSING);
    throw new Error(error.message);
  }
  return ((data ?? []) as ArchiveHit[]).map((h) => ({ ...h, snippet: h.snippet ?? "" }));
}

/** 按他写的一句话找：标题里有这些字的在前，再加按意思最近的。 */
export async function searchArchive(query: string, limit = 30): Promise<ArchiveHit[]> {
  const q = query.replace(/[\s　]+/g, " ").trim().slice(0, 200);
  if (!q) return [];
  const words = q.split(" ").filter((w) => w.length >= 2).slice(0, 4);
  const [vector] = await executeEmbedding([q], "query");
  let keywordQuery = supabaseAdmin.from("external_signals").select("id, source, url, title, raw_text, fetched_at").order("fetched_at", { ascending: false }).limit(10);
  for (const w of words.length > 0 ? words : [q]) keywordQuery = keywordQuery.ilike("title", `%${w.replace(/[%_]/g, "")}%`);
  const [keyword, semantic] = await Promise.all([keywordQuery, match(vector, limit)]);
  if (keyword.error) throw new Error(keyword.error.message);
  const kw = ((keyword.data ?? []) as { id: string; source: string; url: string | null; title: string | null; raw_text: string; fetched_at: string }[]).map((r) => ({
    id: r.id,
    source: r.source,
    url: r.url,
    title: r.title,
    snippet: (r.raw_text ?? "").slice(0, 400),
    fetched_at: r.fetched_at,
  }));
  return mergeHits(kw, semantic, limit);
}

/** 这一条的以前和后来：意思够近（同一件事）的，以前的按时间倒着、后来的按时间顺着。 */
export async function storyAround(signalId: string, n = 6): Promise<{ before: ArchiveHit[]; after: ArchiveHit[] } | null> {
  const { data, error } = await supabaseAdmin.from("external_signals").select("embedding, fetched_at").eq("id", signalId).maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  const vector = parseVector(data?.embedding);
  if (!data || !vector) return null;
  const at = data.fetched_at as string;
  const [before, after] = await Promise.all([match(vector, n * 2, { before: at }), match(vector, n * 2, { after: at })]);
  const same = (h: ArchiveHit) => h.id !== signalId && (h.similarity ?? 0) >= SAME_STORY;
  return {
    before: before.filter(same).slice(0, n).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)),
    after: after.filter(same).slice(0, n).sort((a, b) => a.fetched_at.localeCompare(b.fetched_at)),
  };
}

// ── 标记 ────────────────────────────────────────────────────────────────────

export async function setMark(userId: string, signalId: string, mark: MarkKind | null, note = ""): Promise<void> {
  if (mark === null) {
    const { error } = await supabaseAdmin.from("signal_marks").delete().eq("user_id", userId).eq("signal_id", signalId);
    if (error) throw new Error(missing(error) ? MEMORY_MISSING : error.message);
    return;
  }
  const { error } = await supabaseAdmin
    .from("signal_marks")
    .upsert({ user_id: userId, signal_id: signalId, mark, note: note.trim().slice(0, 200) || null }, { onConflict: "user_id,signal_id" });
  if (error) throw new Error(missing(error) ? MEMORY_MISSING : error.message);
}

export async function marksFor(userId: string, signalIds: string[]): Promise<Map<string, Mark>> {
  if (signalIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from("signal_marks").select("signal_id, mark, note, created_at").eq("user_id", userId).in("signal_id", signalIds);
  if (error) {
    if (missing(error)) return new Map();
    throw new Error(error.message);
  }
  return new Map(((data ?? []) as Mark[]).map((m) => [m.signal_id, m]));
}

export type MarkedItem = Mark & { title: string | null; url: string | null; source: string; fetched_at: string };

/** 他最近标过的（新的在前）。迁移没跑返回 null。 */
export async function recentMarks(userId: string, limit = 30): Promise<MarkedItem[] | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_marks")
    .select("signal_id, mark, note, created_at, external_signals!inner(title, url, source, fetched_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown as (Mark & { external_signals: { title: string | null; url: string | null; source: string; fetched_at: string } })[]).map((r) => ({
    signal_id: r.signal_id,
    mark: r.mark,
    note: r.note,
    created_at: r.created_at,
    ...r.external_signals,
  }));
}

export type Resurfaced = { daysAgo: (typeof RESURFACE_DAYS)[number]; item: MarkedItem; later: ArchiveHit[] };

/** 一周前、一个月前、一年前的今天标过的，连同它后来（同一件事更新的消息）。 */
export async function resurfaced(userId: string, today: string): Promise<Resurfaced[]> {
  const out: Resurfaced[] = [];
  for (const daysAgo of RESURFACE_DAYS) {
    const { from, to } = tokyoDayRange(today, daysAgo);
    const { data, error } = await supabaseAdmin
      .from("signal_marks")
      .select("signal_id, mark, note, created_at, external_signals!inner(title, url, source, fetched_at)")
      .eq("user_id", userId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(3);
    if (error) {
      if (missing(error)) return [];
      throw new Error(error.message);
    }
    for (const r of (data ?? []) as unknown as (Mark & { external_signals: { title: string | null; url: string | null; source: string; fetched_at: string } })[]) {
      const story = await storyAround(r.signal_id, 3).catch(() => null);
      out.push({ daysAgo, item: { signal_id: r.signal_id, mark: r.mark, note: r.note, created_at: r.created_at, ...r.external_signals }, later: story?.after ?? [] });
    }
  }
  return out;
}

// ── 问存档 ──────────────────────────────────────────────────────────────────

export type ArchiveAnswer = { statements: ArchiveStatement[]; sources: ArchiveHit[] };

/** 按意思找出最近的 15 条，只许用它们回答（每句标出处）。 */
export async function askArchive(question: string): Promise<ArchiveAnswer> {
  const q = question.trim().slice(0, 300);
  if (!q) return { statements: [], sources: [] };
  const [vector] = await executeEmbedding([q], "query");
  const hits = (await match(vector, 15)).sort((a, b) => a.fetched_at.localeCompare(b.fetched_at));
  if (hits.length === 0) return { statements: [], sources: [] };
  const statements = await answerFromArchive(
    q,
    hits.map((h) => ({ title: h.title ?? "", snippet: h.snippet, date: h.fetched_at.slice(0, 10) }))
  );
  return { statements, sources: hits };
}
