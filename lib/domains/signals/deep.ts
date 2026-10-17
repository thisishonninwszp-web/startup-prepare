import { supabaseAdmin } from "@/lib/supabase";
import { extractThereFacts, planThereName } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { mentionedNames, thereLanguage, thereSearches, validCategory, validDeepStance, type GapDeep, type GapThere } from "./deep-shared";
import { findJapanGap } from "./gaps";
import { gapPlaces, transferKey, type GapSide, type JapanGap } from "./gaps-shared";
import { ISSUE_NOTE_MAX } from "./issue-shared";
import { latestNoticeFor, watchBoard, type WatchRow } from "./kanpo";
import { noticeSummary, type KanpoNotice } from "./kanpo-shared";

export * from "./deep-shared";

/**
 * 差距的「一条讲透」：signal_gap_deep 的读写、「那边查一查」、这条对上的官报决算。
 * 页面拼料在 deep-page.ts（它要读周刊，周刊又要读这里，分开免得互相引用）。
 */

export const MISSING_DEEP_MIGRATION =
  "还差一步：迁移 083 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/083_signal_gap_deep.sql 之后再来。";

/** 每个搜索词读几篇。 */
const THERE_RESULTS = 4;

function isMissingDeep(message: string): boolean {
  return /signal_gap_deep/.test(message);
}

function toDeep(row: Record<string, unknown>): GapDeep {
  return {
    there: (row.there as GapThere | null) ?? null,
    category: validCategory(row.category),
    stance: (row.stance as GapDeep["stance"]) ?? null,
    updated_at: row.updated_at as string,
  };
}

/** 这一条存过的（没存过为 null）；表还没建返回 "missing-schema"。 */
export async function loadGapDeep(userId: string, side: GapSide, signalId: string): Promise<GapDeep | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_gap_deep")
    .select("there, category, stance, updated_at")
    .eq("user_id", userId)
    .eq("side", side)
    .eq("signal_id", signalId)
    .maybeSingle();
  if (error) {
    if (isMissingDeep(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return data ? toDeep(data) : null;
}

/** 全部存过的（键见 transferKey）；表还没建时返回空。周刊拼料用。 */
export async function loadGapDeeps(userId: string): Promise<Map<string, GapDeep>> {
  const { data, error } = await supabaseAdmin
    .from("signal_gap_deep")
    .select("signal_id, side, there, category, stance, updated_at")
    .eq("user_id", userId);
  if (error) {
    if (isMissingDeep(error.message)) return new Map();
    throw new Error(error.message);
  }
  return new Map((data ?? []).map((r) => [transferKey(r.side as GapSide, r.signal_id as string), toDeep(r)]));
}

/** 只更新给了的那几列（upsert 合并，别的列不动）。 */
async function upsertDeep(userId: string, side: GapSide, signalId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_gap_deep")
    .upsert({ user_id: userId, side, signal_id: signalId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,signal_id,side" });
  if (error) throw new Error(isMissingDeep(error.message) ? MISSING_DEEP_MIGRATION : error.message);
}

/**
 * 那边查一查：AI 只写这样东西的叫法和属于谁 → 代码拼搜索词（规模、收钱、母公司的规模只搜商业媒体，再加 AI 写的一个词不限网站）
 * → 一起搜 → AI 按四格摘事实、代码核对原文。一条没摘到也存（页面上写没查到）。
 */
export async function runThereCheck(userId: string, signalId: string, side: GapSide): Promise<GapThere> {
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const input = { there: gapPlaces(side).there, language: thereLanguage(side), headline: gap.headline, background: gap.background };
  const plan = await planThereName(input);
  const searches = thereSearches(input.language, plan.name, plan.query, plan.parent);
  const results = await Promise.all(searches.map((s) => webSearch(s.query, THERE_RESULTS, { domains: s.domains }).catch(() => [])));
  const seen = new Set<string>();
  const sources = results.flat().filter((r) => r.url && !seen.has(r.url) && seen.add(r.url));
  const facts = sources.length > 0 ? await extractThereFacts({ ...input, name: plan.name, parent: plan.parent }, sources) : [];
  const there: GapThere = {
    facts,
    queries: searches.map((s) => s.query),
    name: plan.name,
    ...(plan.parent ? { parent: plan.parent } : {}),
    searched: { pages: sources.length },
    checked_at: new Date().toISOString(),
  };
  await upsertDeep(userId, side, signalId, { there });
  return there;
}

export async function saveDeepCategory(userId: string, signalId: string, side: GapSide, raw: unknown): Promise<void> {
  const category = validCategory(raw);
  if (!category) throw new Error("没有这一类");
  await upsertDeep(userId, side, signalId, { category });
}

export async function saveDeepStance(userId: string, signalId: string, side: GapSide, rawStance: unknown, rawNote: unknown): Promise<void> {
  if (typeof rawNote === "string" && rawNote.trim().length > ISSUE_NOTE_MAX) throw new Error(`补的那句最多 ${ISSUE_NOTE_MAX} 字`);
  const stance = validDeepStance(rawStance, rawNote);
  if (!stance) throw new Error("先点一下：两年内会不会出现");
  await upsertDeep(userId, side, signalId, { stance });
}

export type GapKanpo = { fundedNotice: KanpoNotice | null; watchRows: WatchRow[]; ready: boolean };

/**
 * 这条对上的官报决算：日本拉到投资的那家（公司名归一化后完全相同才算），
 * 和名单里中国那边的名字原样出现在这条文字里的那几家。不让 AI 猜日本法人叫什么。迁移 082 没跑时 ready=false。
 */
export async function gapKanpo(userId: string, gap: Pick<JapanGap, "headline" | "background" | "funded">, deep: GapDeep | null): Promise<GapKanpo> {
  const board = await watchBoard(userId);
  if (board === "missing-schema") return { fundedNotice: null, watchRows: [], ready: false };
  const texts = [gap.headline, gap.background, ...(deep?.there?.facts ?? []).flatMap((f) => [f.text, f.company ?? ""])];
  const names = new Set(mentionedNames(texts, board.map((r) => r.watch.name_zh)));
  const fundedNotice = gap.funded ? await latestNoticeFor(gap.funded.company).catch(() => null) : null;
  return { fundedNotice, watchRows: board.filter((r) => names.has(r.watch.name_zh)), ready: true };
}

/** 周刊的材料：对上的决算，一条一行（名单上的只取最近一条）。 */
export function kanpoLines(k: GapKanpo): string[] {
  return [
    ...(k.fundedNotice ? [noticeSummary(k.fundedNotice)] : []),
    ...k.watchRows.flatMap((r) => (r.notices[0] ? [noticeSummary(r.notices[0])] : [])),
  ];
}
