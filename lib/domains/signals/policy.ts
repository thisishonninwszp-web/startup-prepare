import { supabaseAdmin } from "@/lib/supabase";
import {
  deadlineToPromulgate,
  isRelevantPolicy,
  lagSummary,
  parsePcmRss,
  parseResultPage,
  WATCHED_LAWS,
  type LagSummary,
  type PolicyItem,
} from "./policy-shared";
import { daysBetween } from "./forecast-shared";

/**
 * 日本政策的「流水线」（迁移 097）：e-Gov 意见征集（每天两个订阅）+ 几十部法律历次修改的公布、施行日（e-Gov 法令 API，一个月刷新一次）。
 * 都是公开数据、不用 Key、不调 AI。基准由代码数出来；政策题的出题和对账在 forecast.ts。
 */

export const POLICY_MISSING = "迁移 097 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/097_signal_policy.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /policy_items|policy_law_lags|does not exist|schema cache/.test(error.message);
}

/** 两个订阅：正在征求意见的（没有结果那几列）、结果公示的（有）。分开存，免得一批里列不一样把已有的值冲成空。 */
const FEEDS = [
  { url: "https://public-comment.e-gov.go.jp/rss/pcm_list.xml", result: false },
  { url: "https://public-comment.e-gov.go.jp/rss/pcm_result.xml", result: true },
];
const UA = { "User-Agent": "Mozilla/5.0 (compatible; IdeaOS/1.0)" };

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: UA });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** 一件意见征集的结果页（按案件番号）：有结果返回公示日和公布日，还没结果返回 null。 */
export async function fetchPolicyResult(id: string): Promise<{ result_date: string | null; promulgate_date: string | null } | null> {
  const html = await getText(`https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCM1040&id=${encodeURIComponent(id)}&Mode=1`);
  return html ? parseResultPage(html) : null;
}

/** 抓两个订阅，存进 policy_items（同一件按案件番号合并：先是征求意见，后来补上结果）。返回存了几件。 */
async function refreshFeeds(): Promise<number> {
  let stored = 0;
  for (const feed of FEEDS) {
    const xml = await getText(feed.url);
    const items = xml ? parsePcmRss(xml) : [];
    if (items.length === 0) continue;
    const rows = Array.from(new Map(items.map((i) => [i.id, i])).values()).map((i) => ({
      id: i.id,
      title: i.title,
      ministry: i.ministry,
      category: i.category,
      notice_date: i.notice_date,
      deadline: i.deadline,
      url: i.url,
      relevant: isRelevantPolicy(i.title),
      updated_at: new Date().toISOString(),
      ...(feed.result ? { result_date: i.result_date, promulgate_date: i.promulgate_date, comments: i.comments } : {}),
    }));
    const { error } = await supabaseAdmin.from("policy_items").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(missing(error) ? POLICY_MISSING : error.message);
    stored += rows.length;
  }
  return stored;
}

/** 截止过了、还没看到结果的（跟他有关的那些）：去结果页补一补（订阅只列最近的十几件，漏看了会把「公布了」当成「没公布」）。一次最多 n 件。 */
async function backfillResults(today: string, n = 8): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("policy_items")
    .select("id, deadline")
    .eq("relevant", true)
    .is("result_date", null)
    .lt("deadline", today)
    .order("updated_at", { ascending: true })
    .limit(n);
  if (error) throw new Error(missing(error) ? POLICY_MISSING : error.message);
  let found = 0;
  for (const row of (data ?? []) as { id: string }[]) {
    const r = await fetchPolicyResult(row.id);
    const patch = r ? { ...r, updated_at: new Date().toISOString() } : { updated_at: new Date().toISOString() };
    const { error: updateError } = await supabaseAdmin.from("policy_items").update(patch).eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    if (r) found += 1;
  }
  return found;
}

type LawRevision = { amendment_law_title?: string; amendment_promulgate_date?: string; amendment_enforcement_date?: string };

/** 法律的修改历史：一个月刷新一次，一次做几部（有时间预算）。法令 API 不用 Key。 */
async function refreshLawLags(today: string, budgetMs: number): Promise<number> {
  const started = Date.now();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin.from("policy_law_lags").select("law_title, fetched_on").gte("fetched_on", since).limit(5000);
  if (error) throw new Error(missing(error) ? POLICY_MISSING : error.message);
  const fresh = new Set(((data ?? []) as { law_title: string }[]).map((r) => r.law_title.split("（")[0]));
  let added = 0;
  for (const name of WATCHED_LAWS) {
    if (Date.now() - started > budgetMs) break;
    if (Array.from(fresh).some((t) => t.startsWith(name))) continue;
    const res = await getText(`https://laws.e-gov.go.jp/api/2/laws?law_title=${encodeURIComponent(name)}&limit=10`);
    const laws = res ? ((JSON.parse(res) as { laws?: { law_info: { law_id: string; law_type: string }; revision_info?: { law_title?: string } }[] }).laws ?? []) : [];
    // 法律本身和它的施行令、施行规则（标题以这部法律的名字开头的），最多四部
    const targets = laws.filter((l) => (l.revision_info?.law_title ?? "").startsWith(name)).slice(0, 4);
    for (const l of targets) {
      const text = await getText(`https://laws.e-gov.go.jp/api/2/law_revisions/${encodeURIComponent(l.law_info.law_id)}`);
      const revisions = text ? ((JSON.parse(text) as { revisions?: LawRevision[] }).revisions ?? []) : [];
      const rows = revisions
        .filter((r) => r.amendment_promulgate_date && r.amendment_enforcement_date && r.amendment_promulgate_date >= "2005-01-01")
        .map((r) => ({
          law_id: l.law_info.law_id,
          law_title: l.revision_info?.law_title ?? name,
          law_type: l.law_info.law_type,
          amendment_title: (r.amendment_law_title ?? "").slice(0, 300),
          promulgate_date: r.amendment_promulgate_date as string,
          enforce_date: r.amendment_enforcement_date as string,
          fetched_on: today,
        }));
      // 同一个修改分几步施行时，同一天同一个法律名会重复：按主键去重
      const unique = Array.from(new Map(rows.map((r) => [`${r.law_id}|${r.amendment_title}|${r.promulgate_date}|${r.enforce_date}`, r])).values());
      if (unique.length === 0) continue;
      const { error: upsertError } = await supabaseAdmin.from("policy_law_lags").upsert(unique, { onConflict: "law_id,amendment_title,promulgate_date,enforce_date" });
      if (upsertError) throw new Error(upsertError.message);
      added += unique.length;
    }
  }
  return added;
}

/** 后台（indicators 那一步）：抓订阅、补结果、刷法律的修改历史。 */
export async function refreshPolicy(today: string, budgetMs = 60_000): Promise<{ items: number; results: number; lags: number }> {
  const items = await refreshFeeds();
  const results = await backfillResults(today);
  const lags = await refreshLawLags(today, budgetMs);
  return { items, results, lags };
}

/** 「截止 → 公布」的历史（天）：所有有结果、两头都有日子的。迁移没跑返回 null。 */
export async function policyHistory(): Promise<number[] | null> {
  const { data, error } = await supabaseAdmin.from("policy_items").select("deadline, promulgate_date").not("promulgate_date", "is", null).limit(10000);
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  return deadlineToPromulgate((data ?? []) as Pick<PolicyItem, "deadline" | "promulgate_date">[]);
}

/** 正在征求意见（还没截止或截止不到一个月、还没结果）、跟他有关的。 */
export async function openRelevantPolicies(today: string): Promise<(PolicyItem & { relevant: boolean })[]> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("policy_items")
    .select("id, title, ministry, category, notice_date, deadline, result_date, promulgate_date, comments, url, relevant")
    .eq("relevant", true)
    .is("result_date", null)
    .gte("deadline", since)
    .order("deadline", { ascending: true })
    .limit(100);
  if (error) throw new Error(missing(error) ? POLICY_MISSING : error.message);
  return (data ?? []) as (PolicyItem & { relevant: boolean })[];
}

export type PolicySummary = {
  open: PolicyItem[];
  recent: PolicyItem[];
  deadlineToPromulgate: LagSummary;
  laws: { title: string; summary: LagSummary }[];
  allLaws: LagSummary;
  tracked: number;
};

/** 政策流水线页：正在征求意见的、最近有结果的（跟他有关的）、两段时差的基准。迁移没跑返回 null。 */
export async function policySummary(today: string): Promise<PolicySummary | null> {
  const [open, recent, all, lags] = await Promise.all([
    openRelevantPolicies(today).catch((e: Error) => (e.message === POLICY_MISSING ? null : Promise.reject(e))),
    supabaseAdmin
      .from("policy_items")
      .select("id, title, ministry, category, notice_date, deadline, result_date, promulgate_date, comments, url")
      .eq("relevant", true)
      .not("result_date", "is", null)
      .order("result_date", { ascending: false })
      .limit(20),
    supabaseAdmin.from("policy_items").select("deadline, promulgate_date", { count: "exact" }).limit(10000),
    supabaseAdmin.from("policy_law_lags").select("law_title, law_type, promulgate_date, enforce_date").limit(20000),
  ]);
  if (open === null) return null;
  const error = recent.error ?? all.error ?? lags.error;
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  const lagRows = (lags.data ?? []) as { law_title: string; promulgate_date: string; enforce_date: string }[];
  const byLaw = new Map<string, number[]>();
  for (const r of lagRows) byLaw.set(r.law_title, [...(byLaw.get(r.law_title) ?? []), daysBetween(r.promulgate_date, r.enforce_date)]);
  return {
    open,
    recent: (recent.data ?? []) as PolicyItem[],
    deadlineToPromulgate: lagSummary(deadlineToPromulgate((all.data ?? []) as Pick<PolicyItem, "deadline" | "promulgate_date">[])),
    laws: Array.from(byLaw.entries())
      .map(([title, days]) => ({ title, summary: lagSummary(days) }))
      .sort((a, b) => b.summary.n - a.summary.n),
    allLaws: lagSummary(lagRows.map((r) => daysBetween(r.promulgate_date, r.enforce_date))),
    tracked: all.count ?? 0,
  };
}

/** 政策题对账用：这件公布了没有、哪天公布的。库里没有公布日、又要对账时（fetch=true）去结果页查一次并存下。 */
export async function policyOutcome(id: string, fetch: boolean): Promise<{ promulgate_date: string | null; url: string | null } | null> {
  const { data, error } = await supabaseAdmin.from("policy_items").select("promulgate_date, url").eq("id", id).maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  if (data.promulgate_date || !fetch) return { promulgate_date: (data.promulgate_date as string | null) ?? null, url: (data.url as string | null) ?? null };
  const r = await fetchPolicyResult(id);
  if (r) {
    const { error: updateError } = await supabaseAdmin.from("policy_items").update({ ...r, updated_at: new Date().toISOString() }).eq("id", id);
    if (updateError) throw new Error(updateError.message);
  }
  return { promulgate_date: r?.promulgate_date ?? null, url: (data.url as string | null) ?? null };
}
