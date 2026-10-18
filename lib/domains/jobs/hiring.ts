import { supabaseAdmin } from "@/lib/supabase";
import { inferHiringNeeds, type HiringSourceInput } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { getPosting } from "./postings";
import { hiringQueries, type HiringContext, type HiringFact, type HiringNeed, type HiringSource } from "./hiring-shared";
import { tokyoDate } from "./shared";

/**
 * 「这家为什么现在招」：搜这家的中期计划、今年的新闻稿、新事业或组织调整，连同招聘页一起交给 AI 推测。
 * 一个岗位一行，重查就覆盖（他认同的那条跟着清掉 —— 推测换了，旧的选择对不上）。
 * 搜索三路并行，一次请求里做完（Vercel 60 秒）。
 */

export const MISSING_HIRING_MIGRATION =
  "还差一步：迁移 084 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/084_job_hiring_contexts.sql 之后再来。";

const PER_QUERY = 4;
const SOURCE_CHARS = 1500;
const POSTING_CHARS = 4000;

function isMissingTable(message: string): boolean {
  return /job_hiring_contexts/.test(message);
}

function toContext(row: Record<string, unknown>): HiringContext {
  return {
    posting_id: row.posting_id as string,
    queries: (row.queries as string[] | null) ?? [],
    sources: (row.sources as HiringSource[] | null) ?? [],
    facts: (row.facts as HiringFact[] | null) ?? [],
    needs: (row.needs as HiringNeed[] | null) ?? [],
    picked: typeof row.picked === "number" ? row.picked : null,
    updated_at: row.updated_at as string,
  };
}

export async function getHiringContext(userId: string, postingId: string): Promise<HiringContext | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("job_hiring_contexts")
    .select("*")
    .eq("user_id", userId)
    .eq("posting_id", postingId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return data ? toContext(data) : null;
}

/** 查一遍、推测、存起来。 */
export async function generateHiringContext(userId: string, postingId: string): Promise<HiringContext> {
  const posting = await getPosting(userId, postingId);
  if (!posting) throw new Error("这个岗位找不到了");
  const year = Number(tokyoDate().slice(0, 4));
  const queries = hiringQueries(posting.company_name, year, posting.title);
  const results = await Promise.all(queries.map((q) => webSearch(q, PER_QUERY).catch(() => [])));

  // 同一篇只留一次；招聘页本身那一页不重复算
  const seen = new Set<string>(posting.url ? [posting.url] : []);
  const web: HiringSourceInput[] = [];
  for (const r of results.flat()) {
    if (!r.url || seen.has(r.url) || !r.content) continue;
    seen.add(r.url);
    web.push({ key: `S${web.length + 1}`, title: r.title, url: r.url, text: r.content.slice(0, SOURCE_CHARS) });
  }
  const sources: HiringSourceInput[] = [
    { key: "S0", title: `招聘页：${posting.title}`, url: posting.url, text: posting.body.slice(0, POSTING_CHARS) },
    ...web,
  ];

  const { facts, needs } = await inferHiringNeeds(
    userId,
    { company: posting.company_name, title: posting.title, body: posting.body },
    sources
  );
  const row = {
    user_id: userId,
    posting_id: postingId,
    queries,
    // 只存用到的那几篇（标题和链接），正文不存
    sources: sources.filter((s) => facts.some((f) => f.source === s.key)).map(({ key, title, url }) => ({ key, title, url })),
    facts,
    needs,
    picked: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("job_hiring_contexts")
    .upsert(row, { onConflict: "user_id,posting_id" })
    .select("*")
    .single();
  if (error) throw new Error(isMissingTable(error.message) ? MISSING_HIRING_MIGRATION : error.message);
  return toContext(data);
}

/** 他认同哪一条（null = 一条都不认）。 */
export async function pickHiringNeed(userId: string, postingId: string, index: number | null): Promise<void> {
  const ctx = await getHiringContext(userId, postingId);
  if (ctx === "missing-schema") throw new Error(MISSING_HIRING_MIGRATION);
  if (!ctx) throw new Error("还没查过这家");
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= ctx.needs.length)) throw new Error("没有这一条");
  const { error } = await supabaseAdmin
    .from("job_hiring_contexts")
    .update({ picked: index, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("posting_id", postingId);
  if (error) throw new Error(error.message);
}
