import { supabaseAdmin } from "@/lib/supabase";
import { executeEmbedding } from "@/lib/ai-gateway";
import { answerFromArchive, type ArchiveStatement } from "@/lib/ai";
import { isGithubSource } from "./feeds";
import {
  cleanSnippet,
  embedText,
  groupStoryUpdates,
  mergeFollowed,
  mergeHits,
  normalizeEventDate,
  parseVector,
  RESURFACE_DAYS,
  SAME_STORY,
  tokyoDayRange,
  type ArchiveHit,
  type Followed,
  type Mark,
  type MarkKind,
  type StoryRow,
  type StoryUpdate,
  type TimelineEvent,
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
  return ((data ?? []) as ArchiveHit[]).map((h) => ({ ...h, title: h.title ? cleanSnippet(h.title) : h.title, snippet: cleanSnippet(h.snippet) }));
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
    title: r.title ? cleanSnippet(r.title) : r.title,
    snippet: cleanSnippet((r.raw_text ?? "").slice(0, 400)),
    fetched_at: r.fetched_at,
  }));
  return mergeHits(kw, semantic, limit);
}

/**
 * 这一条的以前和后来：意思够近（同一件事）的，以前的按时间倒着、后来的按时间顺着。
 * GitHub 新仓库不算（每条都是同一个模板写的，彼此看着像，其实不是一件事）。minSimilarity 调低只在校准时用。
 */
export async function storyAround(signalId: string, n = 6, minSimilarity = SAME_STORY): Promise<{ before: ArchiveHit[]; after: ArchiveHit[] } | null> {
  const { data, error } = await supabaseAdmin.from("external_signals").select("embedding, fetched_at").eq("id", signalId).maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  const vector = parseVector(data?.embedding);
  if (!data || !vector) return null;
  const at = data.fetched_at as string;
  const [before, after] = await Promise.all([match(vector, n * 3, { before: at }), match(vector, n * 3, { after: at })]);
  const same = (h: ArchiveHit) => h.id !== signalId && (h.similarity ?? 0) >= minSimilarity && !isGithubSource(h.source);
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

/** 他最近标过的（新的在前；sinceDays 限定只看最近几天标的）。迁移没跑返回 null。 */
export async function recentMarks(userId: string, limit = 30, sinceDays?: number): Promise<MarkedItem[] | null> {
  let query = supabaseAdmin
    .from("signal_marks")
    .select("signal_id, mark, note, created_at, external_signals!inner(title, url, source, fetched_at)")
    .eq("user_id", userId);
  if (sinceDays) query = query.gte("created_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString());
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
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

/** 「今天」一页只放一条回头看：先找一年前的，没有再找一个月前、一周前的（越久越值得再看一眼）。 */
export async function resurfacedOne(userId: string, today: string): Promise<Resurfaced | null> {
  for (const daysAgo of [...RESURFACE_DAYS].reverse()) {
    const { from, to } = tokyoDayRange(today, daysAgo);
    const { data, error } = await supabaseAdmin
      .from("signal_marks")
      .select("signal_id, mark, note, created_at, external_signals!inner(title, url, source, fetched_at)")
      .eq("user_id", userId)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      if (missing(error)) return null;
      throw new Error(error.message);
    }
    const r = ((data ?? []) as unknown as (Mark & { external_signals: { title: string | null; url: string | null; source: string; fetched_at: string } })[])[0];
    if (!r) continue;
    const story = await storyAround(r.signal_id, 3).catch(() => null);
    return { daysAgo, item: { signal_id: r.signal_id, mark: r.mark, note: r.note, created_at: r.created_at, ...r.external_signals }, later: story?.after ?? [] };
  }
  return null;
}

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

// ── 在跟的事 ────────────────────────────────────────────────────────────────

/** 往回看多少天里他表示过在意的。 */
export const FOLLOW_DAYS = 90;
/** 一次最多跟多少件（一次比较是「在跟的 × 这段时间抓到的」，太多了慢）。 */
const FOLLOW_LIMIT = 60;

export const STORIES_MISSING = "迁移 093 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/093_signal_today.sql。";

/**
 * 他在跟的：最近 FOLLOW_DAYS 天里标过的、写过判断的、记成观察的新闻（做过的比说过的可信，三样都算）。
 * shared：朋友的账号 —— 「记成观察」看他自己那一份（signal_user_states），不看主账号的状态。
 * 哪张表还没建就当那一样是空的。
 */
export async function followedSignals(userId: string, shared: boolean): Promise<Followed[]> {
  const since = new Date(Date.now() - FOLLOW_DAYS * 86_400_000).toISOString();
  const [marks, judgments, kept] = await Promise.all([
    supabaseAdmin.from("signal_marks").select("signal_id, mark, note, created_at").eq("user_id", userId).gte("created_at", since).limit(200),
    supabaseAdmin.from("signal_judgments").select("signal_id, created_at").eq("user_id", userId).not("signal_id", "is", null).gte("created_at", since).limit(200),
    shared
      ? supabaseAdmin.from("signal_user_states").select("signal_id, created_at").eq("user_id", userId).eq("status", "promoted").gte("created_at", since).limit(200)
      : supabaseAdmin.from("external_signals").select("id, fetched_at").eq("status", "promoted").gte("fetched_at", since).limit(200),
  ]);
  const rows = [
    ...((marks.error ? [] : marks.data ?? []) as Mark[]).map((m) => ({ signal_id: m.signal_id, reason: "mark" as const, mark: m.mark, note: m.note, at: m.created_at })),
    ...((judgments.error ? [] : judgments.data ?? []) as { signal_id: string; created_at: string }[]).map((j) => ({
      signal_id: j.signal_id,
      reason: "judgment" as const,
      mark: null,
      note: null,
      at: j.created_at,
    })),
    ...((kept.error ? [] : kept.data ?? []) as { signal_id?: string; id?: string; created_at?: string; fetched_at?: string }[]).map((k) => ({
      signal_id: (k.signal_id ?? k.id) as string,
      reason: "observation" as const,
      mark: null,
      note: null,
      at: (k.created_at ?? k.fetched_at) as string,
    })),
  ];
  const merged = mergeFollowed(rows).slice(0, FOLLOW_LIMIT);
  if (merged.length === 0) return [];
  const { data, error } = await supabaseAdmin.from("external_signals").select("id, title, source, fetched_at").in("id", merged.map((m) => m.signal_id));
  if (error) throw new Error(error.message);
  const info = new Map(((data ?? []) as { id: string; title: string | null; source: string; fetched_at: string }[]).map((r) => [r.id, r]));
  return merged.flatMap((m) => {
    const i = info.get(m.signal_id);
    return i ? [{ ...m, title: i.title ? cleanSnippet(i.title) : i.title, source: i.source, fetched_at: i.fetched_at }] : [];
  });
}

/** 他在跟的这几件事，since 以后有没有新消息（意思够近的）。迁移 093 没跑返回 null。 */
export async function storyUpdates(followed: Followed[], since: string, perStory = 3): Promise<StoryUpdate[] | null> {
  if (followed.length === 0) return [];
  const { data, error } = await supabaseAdmin.rpc("story_updates", {
    followed: followed.map((f) => f.signal_id),
    since,
    min_similarity: SAME_STORY,
    // 多要几条：GitHub 新仓库在下面筛掉，筛完每件再留 perStory 条
    per_story: perStory * 4,
  });
  if (error) {
    if (/story_updates|does not exist|schema cache|Could not find the function/.test(error.message)) return null;
    throw new Error(error.message);
  }
  return groupStoryUpdates(((data ?? []) as StoryRow[]).map((r) => ({ ...r, similarity: Number(r.similarity) })), followed, perStory);
}

// ── 机会并进时间线 ──────────────────────────────────────────────────────────

/**
 * 找的时候顺带看时差图谱和官报：图谱里事情名字、那边 / 日本的事件对得上的（那边出现、日本出现各算一件），
 * 官报里公司名对得上的决算公告。按字找（这两样没有算指纹）。表还没建就当没有。
 */
export async function searchOpportunities(query: string, atlasUserId: string): Promise<TimelineEvent[]> {
  const words = query.replace(/[\s　]+/g, " ").trim().split(" ").filter((w) => w.length >= 2).slice(0, 3);
  if (words.length === 0) return [];
  const like = (w: string) => `%${w.replace(/[%_,()"]/g, "")}%`;
  // 图谱查三列：PostgREST 的 or 只用最长的那个词，其余的词在这里再筛
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  let kanpoQuery = supabaseAdmin.from("kanpo_notices").select("id, issue_date, company_name, period, pdf_url").order("issue_date", { ascending: false }).limit(10);
  for (const w of words) kanpoQuery = kanpoQuery.ilike("company_name", like(w));
  const [atlas, kanpo] = await Promise.all([
    supabaseAdmin
      .from("signal_transfer_cases")
      .select("id, thing, origin, origin_event, origin_date, japan_event, japan_date")
      .eq("user_id", atlasUserId)
      .or(`thing.ilike.${like(longest)},origin_event.ilike.${like(longest)},japan_event.ilike.${like(longest)}`)
      .limit(20),
    kanpoQuery,
  ]);
  const out: TimelineEvent[] = [];
  const cases = (atlas.error ? [] : atlas.data ?? []) as {
    id: string;
    thing: string;
    origin: "china" | "us";
    origin_event: string;
    origin_date: string;
    japan_event: string | null;
    japan_date: string | null;
  }[];
  const all = (c: (typeof cases)[number]) => words.every((w) => `${c.thing} ${c.origin_event} ${c.japan_event ?? ""}`.toLowerCase().includes(w.toLowerCase()));
  for (const c of cases.filter(all).slice(0, 10)) {
    out.push({ key: `atlas-o-${c.id}`, date: normalizeEventDate(c.origin_date), kind: "atlas", title: `${c.origin === "china" ? "中国" : "美国"}：${c.origin_event}`, href: "/signals/atlas" });
    if (c.japan_date) out.push({ key: `atlas-j-${c.id}`, date: normalizeEventDate(c.japan_date), kind: "atlas", title: `日本：${c.japan_event ?? c.thing}`, href: "/signals/atlas" });
  }
  for (const n of (kanpo.error ? [] : kanpo.data ?? []) as { id: string; issue_date: string; company_name: string | null; period: string | null; pdf_url: string }[]) {
    out.push({
      key: `kanpo-${n.id}`,
      date: n.issue_date,
      kind: "kanpo",
      title: `${n.company_name ?? "（公司名没认出来）"} 在官报登了决算公告${n.period ? `（${n.period}）` : ""}`,
      href: n.pdf_url,
      external: true,
    });
  }
  return out;
}
