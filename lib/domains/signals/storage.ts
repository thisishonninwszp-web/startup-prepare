import { gzipSync } from "node:zlib";
import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";

/**
 * 存储（迁移 098）：数据库实际多大（免费版上限 500MB，不再靠估算），和每月一次的完整备份 ——
 * 把一个月抓到的新闻原样打包（压缩的 JSON Lines）存进 Supabase 的文件存储（免费版 1GB，和数据库分开算），
 * 记忆页上能下载到本地。只读、只加，不删数据库里的任何东西（要不要整理旧数据，看了实际大小再请他定）。
 */

export const DB_LIMIT_BYTES = 500 * 1024 * 1024;
const BUCKET = "archive";
const PREFIX = "external_signals";

export type StorageReport = { total: number; tables: { name: string; bytes: number }[] };

/** 迁移 098 没跑（或没权限）返回 null。 */
export async function storageReport(): Promise<StorageReport | null> {
  const { data, error } = await supabaseAdmin.rpc("storage_report");
  if (error) return null;
  const rows = ((data ?? []) as { name: string; bytes: number }[]).map((r) => ({ name: r.name, bytes: Number(r.bytes) }));
  const total = rows.find((r) => r.name === "database")?.bytes ?? 0;
  return { total, tables: rows.filter((r) => r.name !== "database") };
}

async function ensureBucket(): Promise<void> {
  const { error } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!error) return;
  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
  if (createError && !/already exists/i.test(createError.message)) throw new Error(createError.message);
}

const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - 9 * 3_600_000).toISOString(), to: new Date(Date.UTC(y, m, 1) - 9 * 3_600_000).toISOString() };
};

/** 把一个月（日本时间）抓到的新闻原样打包存起来（同一个月再打包会覆盖）。返回几条、压缩后多大。 */
export async function exportMonth(month: string): Promise<{ rows: number; bytes: number }> {
  await ensureBucket();
  const { from, to } = monthRange(month);
  const { data, error } = await selectAll((a, b) =>
    supabaseAdmin
      .from("external_signals")
      .select("id, source, source_id, url, title, raw_text, query, status, published_at, fetched_at, excerpt, analysis")
      .gte("fetched_at", from)
      .lt("fetched_at", to)
      .order("fetched_at")
      .range(a, b)
  );
  if (error) throw new Error(error.message);
  const body = gzipSync(Buffer.from(data.map((r) => JSON.stringify(r)).join("\n"), "utf8"));
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(`${PREFIX}/${month}.jsonl.gz`, body, { contentType: "application/gzip", upsert: true });
  if (uploadError) throw new Error(uploadError.message);
  return { rows: data.length, bytes: body.length };
}

export type ArchiveFile = { month: string; bytes: number; url: string | null };

/** 打包好的几个月（新的在前），带一小时有效的下载链接。 */
export async function listArchives(): Promise<ArchiveFile[]> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(PREFIX, { limit: 120, sortBy: { column: "name", order: "desc" } });
  if (error || !data) return [];
  const files = data.filter((f) => /^\d{4}-\d{2}\.jsonl\.gz$/.test(f.name));
  return Promise.all(
    files.map(async (f) => {
      const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(`${PREFIX}/${f.name}`, 3600, { download: true });
      return { month: f.name.slice(0, 7), bytes: Number((f.metadata as { size?: number } | null)?.size ?? 0), url: signed?.signedUrl ?? null };
    })
  );
}

/** 每月头几天：上个月还没打包的就打包（后台 indicators 那一步顺手做）。 */
export async function monthlyArchive(today: string): Promise<string | null> {
  if (Number(today.slice(8, 10)) > 5) return null;
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const have = await listArchives();
  if (have.some((f) => f.month === prev)) return null;
  const r = await exportMonth(prev);
  return `${prev}：${r.rows} 条，${Math.round(r.bytes / 1024)}KB`;
}
