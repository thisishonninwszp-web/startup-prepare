import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import type { RawSignal } from "./types.js";

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
