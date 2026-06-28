import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import type { RawSignal } from "./types.js";
import { createHash } from "node:crypto";

/**
 * 服务端 admin client：照搬主应用 lib/supabase.ts 的 service-role 模式。
 * 爬虫是独立进程，env 名沿用主应用 .env.local（SUPABASE_URL / SERVICE_ROLE_KEY）。
 */
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "缺少 Supabase 环境变量。请在 crawler/.env 里填 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。"
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type DueCustomerTopic = {
  id: string;
  userId: string;
  caseId: string;
  query: string;
  translatedQueries: { en?: string; zh?: string; ja?: string };
  markets: ("cn" | "jp" | "en")[];
  cadence: "daily" | "weekly";
};

function redactPublicPii(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[已遮蔽邮箱]")
    .replace(
      /(?<!\d)(?:\+?\d{1,3}[-\s]?)?(?:0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{4}|1[3-9]\d{9})(?!\d)/g,
      "[已遮蔽电话]"
    )
    .slice(0, 20_000);
}

function materialDedupeKey(signal: RawSignal): string {
  return createHash("sha256")
    .update(`${signal.source}\0${signal.sourceId}\0${signal.rawText.trim()}`)
    .digest("hex");
}

export async function listDueCustomerTopics(
  onlyId?: string
): Promise<DueCustomerTopic[]> {
  let query = supabase
    .from("customer_research_topics")
    .select(
      "id, user_id, case_id, query, translated_queries, markets, cadence"
    )
    .eq("enabled", true);
  if (onlyId) query = query.eq("id", onlyId);
  else query = query.lte("next_run_at", new Date().toISOString());
  const { data, error } = await query.limit(30);
  if (error) throw new Error(`读取顾客研究主题失败：${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    caseId: row.case_id as string,
    query: row.query as string,
    translatedQueries:
      (row.translated_queries as DueCustomerTopic["translatedQueries"]) ?? {},
    markets: (row.markets ?? []) as DueCustomerTopic["markets"],
    cadence: row.cadence as DueCustomerTopic["cadence"],
  }));
}

export async function upsertCustomerSignals(
  topic: DueCustomerTopic,
  signals: RawSignal[],
  market: "cn" | "jp" | "en"
): Promise<number> {
  let inserted = 0;
  for (const signal of signals) {
    const sanitizedText = redactPublicPii(signal.rawText);
    if (!sanitizedText.trim()) continue;
    const { data: material, error } = await supabase
      .from("customer_materials")
      .upsert(
        {
          user_id: topic.userId,
          origin: "web",
          source: signal.source,
          source_id: signal.sourceId,
          source_url: signal.url ?? null,
          title: signal.title ?? null,
          sanitized_text: sanitizedText,
          dedupe_key: materialDedupeKey(signal),
          language: market === "cn" ? "zh" : market === "jp" ? "ja" : "en",
          market,
        },
        { onConflict: "user_id,dedupe_key" }
      )
      .select("id")
      .single();
    if (error) throw new Error(`写入顾客材料失败：${error.message}`);
    const { error: linkError } = await supabase
      .from("customer_case_materials")
      .upsert(
        {
          case_id: topic.caseId,
          material_id: material.id,
          status: "candidate",
        },
        { onConflict: "case_id,material_id", ignoreDuplicates: true }
      );
    if (linkError) throw new Error(`关联顾客课题失败：${linkError.message}`);
    inserted++;
  }
  return inserted;
}

export async function finishCustomerTopic(
  topic: DueCustomerTopic,
  errorMessage: string | null
) {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + (topic.cadence === "daily" ? 1 : 7));
  const { error } = await supabase
    .from("customer_research_topics")
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: next.toISOString(),
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", topic.id);
  if (error) throw new Error(`更新顾客研究主题失败：${error.message}`);
}

/**
 * 批量写入 external_signals（staging）。
 * 依赖唯一约束 (source, source_id)：重复抓取的条目被忽略，不报错、不重复。
 * 返回本次实际新增的条数（用于日志/观测）。
 */
export async function upsertSignals(signals: RawSignal[]): Promise<number> {
  if (signals.length === 0) return 0;

  const rows = signals.map((s) => ({
    source: s.source,
    source_id: s.sourceId,
    url: s.url ?? null,
    title: s.title ?? null,
    raw_text: s.rawText,
    query: s.query ?? null,
  }));

  // onConflict 命中唯一约束的行被跳过；ignoreDuplicates 让重复跑保持幂等。
  const { data, error } = await supabase
    .from("external_signals")
    .upsert(rows, {
      onConflict: "source,source_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw new Error(`写入 external_signals 失败：${error.message}`);
  return data?.length ?? 0;
}
