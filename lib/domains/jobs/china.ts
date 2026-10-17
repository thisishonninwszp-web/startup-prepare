import { supabaseAdmin } from "@/lib/supabase";
import { webSearch } from "@/lib/web-search";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import {
  extractChinaCompanies,
  judgeJapanConditions,
  judgeJapanEvidence,
  judgeSameBusiness,
  planChinaQueries,
  planJapanConditions,
  type SearchSource,
} from "@/lib/ai";
import {
  cleanBusiness,
  nextChinaStep,
  STEP_LABELS,
  type ChinaCompanies,
  type ChinaCompany,
  type ChinaJapan,
  type ChinaPlan,
  type ChinaRun,
  type ChinaRunStatus,
  type ChinaRunSummary,
} from "./china-shared";

/**
 * 面试演示「御社の商売、中国ではどうなっている？」：三步，每步一个请求（Vercel 一个请求最多 60 秒，整个流程要一分钟多）。
 * 每步做完存进 job_china_runs，下一步从数据库读上一步的结果，不信浏览器传回来的东西。
 */

export const MISSING_CHINA_MIGRATION =
  "还差一步：迁移 080 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/080_job_china_runs.sql 之后再来。";

const COMPANY_RESULTS = 6;
// 3 篇时四条里常常只有一两条查到日本的原文（2026-10-17 试跑）
const CONDITION_RESULTS = 5;
const ENTRANT_RESULTS = 4;
const HISTORY = 20;

function isMissingTable(message: string): boolean {
  return /job_china_runs/.test(message);
}

function dedupeByUrl(results: SearchSource[][]): SearchSource[] {
  const seen = new Set<string>();
  return results.flat().filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/** 第 2 步：中文搜 → 挑公司（原文核对）→ 另一个模型判是不是同一门生意。 */
export async function findChinaCompanies(userId: string, plan: ChinaPlan): Promise<ChinaCompanies> {
  const sources = dedupeByUrl(await Promise.all(plan.queries.map((q) => webSearch(q, COMPANY_RESULTS).catch(() => []))));
  if (sources.length === 0) return { companies: [], read: 0 };
  const found = await extractChinaCompanies(userId, plan.zh_business, sources);
  const verdict = await judgeSameBusiness(plan.zh_business, found);
  const companies: ChinaCompany[] = verdict.ok
    ? found.filter((_, i) => verdict.same[i]).map((c) => ({ ...c, same: true }))
    : found.map((c) => ({ ...c, same: null }));
  return { companies, read: sources.length };
}

/** 第 3 步：那边做成靠的条件 → 日文搜日本现在怎样 → 判有没有（日本原文核对）；顺带查中国同行来没来过日本；最后裁判看原文说没说到点子上。 */
export async function checkJapan(userId: string, plan: ChinaPlan, companies: ChinaCompany[]): Promise<ChinaJapan> {
  const jp = await planJapanConditions(userId, plan.zh_business, companies);
  const [conditionSources, entrantResults] = await Promise.all([
    Promise.all(jp.conditions.map((c) => webSearch(c.query_ja, CONDITION_RESULTS).catch(() => []))),
    Promise.all(jp.entrant_queries.map((q) => webSearch(q, ENTRANT_RESULTS).catch(() => []))),
  ]);
  const judged = await judgeJapanConditions(
    userId,
    plan.zh_business,
    jp.conditions.map((condition, i) => ({ condition, sources: conditionSources[i] })),
    dedupeByUrl(entrantResults)
  );
  return judgeJapanEvidence(plan.zh_business, judged);
}

function toRun(row: Record<string, unknown>): ChinaRun {
  return {
    id: row.id as string,
    business: row.business as string,
    status: row.status as ChinaRunStatus,
    plan: (row.plan as ChinaPlan | null) ?? null,
    companies: (row.companies as ChinaCompanies | null) ?? null,
    japan: (row.japan as ChinaJapan | null) ?? null,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

async function save(userId: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("job_china_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** 新开一次：先写搜索词（第 1 步），再存一行。返回这一次的 id。 */
export async function startChinaRun(userId: string, input: string): Promise<string> {
  const business = cleanBusiness(input);
  // 表还没建就别先花一次 AI
  const probe = await supabaseAdmin.from("job_china_runs").select("id").limit(1);
  if (probe.error) throw new Error(isMissingTable(probe.error.message) ? MISSING_CHINA_MIGRATION : probe.error.message);
  const plan = await planChinaQueries(userId, business);
  const { data, error } = await supabaseAdmin
    .from("job_china_runs")
    .insert({ user_id: userId, business, plan, status: "planned" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function getChinaRun(userId: string, id: string): Promise<ChinaRun | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("job_china_runs").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return data ? toRun(data) : null;
}

/** 最近 20 次（列在 /jobs 上，不列在演示页上：面试官会看到他还查过别家）。 */
export async function listChinaRuns(userId: string): Promise<ChinaRunSummary[] | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("job_china_runs")
    .select("id, business, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  if (error) {
    if (isMissingTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    business: r.business as string,
    status: r.status as ChinaRunStatus,
    created_at: r.created_at as string,
  }));
}

/** 接着跑下一步，存好，返回新的状态。失败时把"哪一步：为什么"存进 error，再抛出去。 */
export async function advanceChinaRun(userId: string, id: string): Promise<ChinaRunStatus> {
  const run = await getChinaRun(userId, id);
  if (run === "missing-schema") throw new Error(MISSING_CHINA_MIGRATION);
  if (!run) throw new Error("この記録は見つかりませんでした。");
  const step = nextChinaStep(run);
  if (!step) return run.status;
  try {
    const { plan, companies } = run;
    let patch: { status: ChinaRunStatus } & Record<string, unknown>;
    if (step === "plan" || !plan) {
      patch = { plan: await planChinaQueries(userId, run.business), status: "planned" };
    } else if (step === "companies" || !companies) {
      const found = await findChinaCompanies(userId, plan);
      patch = { companies: found, status: found.companies.length > 0 ? "companies" : "none_found" };
    } else {
      patch = { japan: await checkJapan(userId, plan, companies.companies), status: "done" };
    }
    await save(userId, id, { ...patch, error: null });
    return patch.status;
  } catch (e) {
    const message = e instanceof AiGatewayError ? humanAiErrorMessage(e.code) : e instanceof Error ? e.message : "うまくいきませんでした";
    await save(userId, id, { status: "failed", error: `${STEP_LABELS[step]}：${message.slice(0, 200)}` });
    throw e;
  }
}
