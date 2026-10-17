import { supabaseAdmin } from "@/lib/supabase";
import { companyKey, watchKeys, type KanpoNotice, type KanpoNoticeInput, type KanpoWatch } from "./kanpo-shared";

/**
 * 官报决算公告的数据库读写（页面和本机脚本都用）。决算公告是公开数据、不分用户；名单按用户。
 */

export const MISSING_KANPO_MIGRATION =
  "还差一步：迁移 082 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/082_kanpo_notices.sql 之后再来。";

const NOTICE_COLUMNS =
  "id, notice_key, issue_date, issue, page, pdf_url, company_name, company_key, address, period, fiscal_end, unit, total_assets, net_assets, retained_earnings, net_income, complete, raw_text";

function isMissingKanpo(message: string): boolean {
  return /kanpo_/.test(message);
}

function fail(message: string): never {
  throw new Error(isMissingKanpo(message) ? MISSING_KANPO_MIGRATION : message);
}

export async function saveNotices(notices: KanpoNoticeInput[]): Promise<void> {
  if (notices.length === 0) return;
  const rows = notices.map((n) => ({ ...n, company_key: n.company_name ? companyKey(n.company_name) : null }));
  const { error } = await supabaseAdmin.from("kanpo_notices").upsert(rows, { onConflict: "notice_key" });
  if (error) fail(error.message);
}

export async function markFetched(issueDate: string, pages: number, notices: number, incomplete: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("kanpo_fetch_days")
    .upsert({ issue_date: issueDate, pages, notices, incomplete, fetched_at: new Date().toISOString() }, { onConflict: "issue_date" });
  if (error) fail(error.message);
}

export async function fetchedDays(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("kanpo_fetch_days").select("issue_date");
  if (error) fail(error.message);
  return new Set((data ?? []).map((r) => r.issue_date as string));
}

export type KanpoStatus = { lastDay: string | null; notices: number; incomplete: number };

/** 页脚那一行：抓到哪天了、一共几条、几条没抽全。表还没建返回 "missing-schema"。 */
export async function kanpoStatus(): Promise<KanpoStatus | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("kanpo_fetch_days").select("issue_date, notices, incomplete");
  if (error) {
    if (isMissingKanpo(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  const days = (data ?? []).map((r) => r.issue_date as string).sort();
  return {
    lastDay: days.at(-1) ?? null,
    notices: (data ?? []).reduce((n, r) => n + (r.notices as number), 0),
    incomplete: (data ?? []).reduce((n, r) => n + (r.incomplete as number), 0),
  };
}

function toWatch(row: Record<string, unknown>): KanpoWatch {
  return {
    id: row.id as string,
    name_zh: row.name_zh as string,
    aliases: (row.aliases as string[] | null) ?? [],
    rejected: (row.rejected as string[] | null) ?? [],
    note: (row.note as string | null) ?? "",
    case_id: (row.case_id as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export async function listWatch(userId: string): Promise<KanpoWatch[]> {
  const { data, error } = await supabaseAdmin.from("kanpo_watch").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) fail(error.message);
  return (data ?? []).map(toWatch);
}

export async function addWatch(userId: string, input: { name_zh: string; aliases: string[]; note: string; case_id: string | null }): Promise<void> {
  const name_zh = input.name_zh.trim().slice(0, 80);
  const aliases = Array.from(new Set(input.aliases.map((a) => a.trim()).filter(Boolean))).slice(0, 8);
  if (!name_zh) throw new Error("写一下中国那边的名字。");
  if (aliases.length === 0) throw new Error("至少写一个日本法人名（官报上登的那个名字）。");
  const { error } = await supabaseAdmin
    .from("kanpo_watch")
    .insert({ user_id: userId, name_zh, aliases, note: input.note.trim().slice(0, 200), case_id: input.case_id });
  if (error) fail(error.message);
}

export async function removeWatch(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("kanpo_watch").delete().eq("user_id", userId).eq("id", id);
  if (error) fail(error.message);
}

/** 他点「不是这家」：把这个公司名记进 rejected，下次同名不再挂到这一家。 */
export async function rejectMatch(userId: string, id: string, key: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from("kanpo_watch").select("rejected").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail(error.message);
  if (!data) throw new Error("名单里没有这一家了");
  const rejected = Array.from(new Set([...((data.rejected as string[] | null) ?? []), key]));
  const { error: updateError } = await supabaseAdmin.from("kanpo_watch").update({ rejected }).eq("user_id", userId).eq("id", id);
  if (updateError) fail(updateError.message);
}

async function noticesForKeys(keys: string[]): Promise<KanpoNotice[]> {
  if (keys.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("kanpo_notices")
    .select(NOTICE_COLUMNS)
    .in("company_key", keys)
    .order("issue_date", { ascending: false });
  if (error) fail(error.message);
  return (data ?? []) as unknown as KanpoNotice[];
}

export type WatchRow = { watch: KanpoWatch; notices: KanpoNotice[] };

/** 名单每一家和对上的决算公告（新的在前）。表还没建返回 "missing-schema"。 */
export async function watchBoard(userId: string): Promise<WatchRow[] | "missing-schema"> {
  try {
    const list = await listWatch(userId);
    const notices = await noticesForKeys(list.flatMap((w) => watchKeys(w)));
    return list.map((watch) => {
      const keys = new Set(watchKeys(watch));
      return { watch, notices: notices.filter((n) => n.company_key && keys.has(n.company_key)) };
    });
  } catch (e) {
    if (e instanceof Error && e.message === MISSING_KANPO_MIGRATION) return "missing-schema";
    throw e;
  }
}

/** 在全部决算公告里按公司名搜（名单之外的也能搜）。 */
export async function searchNotices(q: string): Promise<KanpoNotice[]> {
  const text = q.trim().slice(0, 40);
  if (!text) return [];
  const { data, error } = await supabaseAdmin
    .from("kanpo_notices")
    .select(NOTICE_COLUMNS)
    .ilike("company_name", `%${text.replace(/[%_]/g, "")}%`)
    .order("issue_date", { ascending: false })
    .limit(30);
  if (error) fail(error.message);
  return (data ?? []) as unknown as KanpoNotice[];
}

/** 岗位页：这家公司最近一次决算公告。表还没建、没对上都返回 null。 */
export async function latestNoticeFor(companyName: string): Promise<KanpoNotice | null> {
  const { data, error } = await supabaseAdmin
    .from("kanpo_notices")
    .select(NOTICE_COLUMNS)
    .eq("company_key", companyKey(companyName))
    .order("issue_date", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingKanpo(error.message)) return null;
    throw new Error(error.message);
  }
  return ((data ?? [])[0] as unknown as KanpoNotice) ?? null;
}

/** 时差图谱：从图谱加进名单的那几家，各自最近一次决算公告（按 case_id）。表还没建返回空。 */
export async function caseNotices(userId: string): Promise<Map<string, KanpoNotice>> {
  const board = await watchBoard(userId);
  const out = new Map<string, KanpoNotice>();
  if (board === "missing-schema") return out;
  for (const row of board) {
    if (row.watch.case_id && row.notices[0]) out.set(row.watch.case_id, row.notices[0]);
  }
  return out;
}
