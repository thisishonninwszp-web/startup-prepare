import { supabaseAdmin } from "@/lib/supabase";
import { selectGapCandidates, type JapanComparison } from "@/lib/ai";
import { compareAndCheckJapan, tokyoToday, type BriefItem } from "./brief";
import { balanceBySource, GAP_SCAN_SOURCES, isChinaSource, isUsSource, newsSourceLabel } from "./feeds";
import { usableSummary } from "./summary";
import { dueForRecheck, isJapanGap, recheckVerdict, RECHECKS_PER_DAY, type GapSide } from "./gaps-shared";
import { loadGapRechecks, openGapsWithSide } from "./gaps";
import { autoResolveIssueBets } from "./issue-resolve";

/**
 * 差距清单每天专门扫一轮。以前只有被挑进报告精选的中文、美国条目才会问"日本有没有"，
 * 清单攒多少全看当天新闻挑了什么。现在从最近一天半的中文媒体、中国 App 榜、美国媒体里
 * 专门挑讲产品、服务、生意做法的几条，问一遍并上网核实。
 * 结果存成 signal_briefs 里 kind=gaps 的一份，差距清单照旧从存下的报告里挑。
 *
 * 打开清单页时跑（一天一次）：两个定时任务都已经逼近 60 秒上限，塞不进去。
 */

const SCAN_WINDOW_HOURS = 36;
const SCAN_FETCH = 300;
const SCAN_CANDIDATES = 60;
/** 最近几天的报告里已经问过"日本有没有"的条目，不再问一遍。 */
const ASKED_LOOKBACK_DAYS = 7;

const MISSING_MIGRATION = "迁移 063 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/063_signal_gap_scan.sql。";

/** 今天扫过没有；扫过的话，挑出几条、其中几条进了清单。 */
export async function todayGapScan(userId: string): Promise<{ picked: number; gaps: number } | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("items")
    .eq("user_id", userId)
    .eq("brief_date", tokyoToday())
    .eq("kind", "gaps")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const items = (data.items as BriefItem[] | null) ?? [];
  return { picked: items.length, gaps: countGaps(items) };
}

function countGaps(items: BriefItem[]): number {
  return items.filter((i) => isJapanGap(i, i.origin === "us" ? "us" : "japan")).length;
}

/** 最近几天的报告（含每天扫的那一份）里已经问过"日本有没有""中国有没有"的条目。 */
async function recentlyAskedIds(userId: string): Promise<Set<string>> {
  const since = tokyoToday(new Date(Date.now() - ASKED_LOOKBACK_DAYS * 86_400_000));
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("items")
    .eq("user_id", userId)
    .in("kind", ["news", "gaps"])
    .gte("brief_date", since);
  if (error) throw new Error(error.message);
  const ids = new Set<string>();
  for (const r of data ?? []) {
    for (const i of (r.items as BriefItem[] | null) ?? []) if (i.japan || i.china_side) ids.add(i.signal_id);
  }
  return ids;
}

/** 扫一轮并存下来。返回挑出几条、其中几条进了清单（查到出处、日本确实没有或没普及）。 */
export async function runGapScan(userId: string): Promise<{ picked: number; gaps: number }> {
  const since = new Date(Date.now() - SCAN_WINDOW_HOURS * 3_600_000).toISOString();
  const [{ data, error }, asked] = await Promise.all([
    supabaseAdmin
      .from("external_signals")
      .select("id, source, title, url, raw_text")
      .in("source", GAP_SCAN_SOURCES)
      .eq("status", "pending")
      .gte("fetched_at", since)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(SCAN_FETCH),
    recentlyAskedIds(userId),
  ]);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const fresh = (data ?? []).filter((r) => {
    if (asked.has(r.id as string)) return false;
    const key = (r.url as string | null) ?? (r.id as string);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rows = balanceBySource(fresh as { source: string; [k: string]: unknown }[], SCAN_CANDIDATES);
  const candidates = rows.map((r) => ({
    title: (r.title as string | null) ?? "",
    text: usableSummary(r.title as string | null, r.raw_text as string | null),
    source: newsSourceLabel(r.source),
    china: isChinaSource(r.source),
    us: isUsSource(r.source),
  }));

  const picks = await selectGapCandidates(candidates);
  const [fromChina, fromUs] = await Promise.all([
    compareAndCheckJapan(picks.filter((p) => candidates[p.index].china)),
    compareAndCheckJapan(picks.filter((p) => candidates[p.index].us), "us"),
  ]);

  const items: BriefItem[] = picks.map((p) => {
    const row = rows[p.index];
    const us = candidates[p.index].us;
    const c = (us ? fromUs : fromChina).get(p.index);
    return {
      signal_id: row.id as string,
      title: (row.title as string | null) ?? "",
      url: (row.url as string | null) ?? null,
      source: newsSourceLabel(row.source),
      headline: p.headline,
      background: p.background,
      for_you: "",
      origin: us ? "us" : "china",
      japan: c?.japan,
      japan_check: c?.check,
      japan_query: c?.query || undefined,
      japan_why_now: c?.whyNow,
      japan_funded: c?.funded,
    };
  });

  // 一条都没挑出来也存一份空的：今天扫过了，别每次打开页面都再扫
  const { error: saveError } = await supabaseAdmin
    .from("signal_briefs")
    .upsert({ user_id: userId, brief_date: tokyoToday(), kind: "gaps", items, overview: null }, { onConflict: "user_id,brief_date,kind" });
  if (saveError) {
    if (/kind_check|check constraint/.test(saveError.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(saveError.message);
  }
  return { picked: picks.length, gaps: countGaps(items) };
}

/**
 * 进清单满一个月的，再查一次"这边现在有没有"。一天最多查 RECHECKS_PER_DAY 条，最久没查的先查。
 * 查不出结论的也记一笔（unclear），算查过了，免得每次打开页面都重查同一条。
 */
export async function runGapRechecks(userId: string): Promise<{ rechecked: number; arrived: number; resolved: number }> {
  const rechecks = await loadGapRechecks(userId);
  if (rechecks === null) throw new Error(MISSING_MIGRATION);
  const today = tokyoToday();
  if (rechecks.some((r) => r.checked_on === today)) return { rechecked: 0, arrived: 0, resolved: 0 };
  const due = dueForRecheck(await openGapsWithSide(userId, rechecks), today, RECHECKS_PER_DAY);
  // 没有要重查的，也看一眼有没有到期能自动对账的
  if (due.length === 0) return { rechecked: 0, arrived: 0, resolved: await safeAutoResolve(userId) };

  const sides = Array.from(new Set(due.map((g) => g.side)));
  const results = await Promise.all(
    sides.map(async (side: GapSide) => {
      const gaps = due.filter((g) => g.side === side);
      // 序号就是这几条在 gaps 里的位置；背景是空的老数据拿标题顶上
      const checked = await compareAndCheckJapan(
        gaps.map((g, i) => ({ index: i, headline: g.headline, background: g.background || g.headline })),
        side
      ).catch((e) => {
        console.error("gap recheck failed", e);
        return new Map<number, JapanComparison>();
      });
      return gaps.map((g, i) => {
        const c = checked.get(i);
        return {
          user_id: userId,
          signal_id: g.signal_id,
          side,
          checked_on: today,
          verdict: c ? recheckVerdict(c.japan, c.check) : ("unclear" as const),
          japan: c?.japan ?? "这次没写出结论。",
          source_check: c?.check ?? null,
          funded: c?.funded ?? null,
        };
      });
    })
  );
  const rows = results.flat();
  const { error } = await supabaseAdmin.from("signal_gap_rechecks").insert(rows);
  if (error) throw new Error(error.message);
  return { rechecked: rows.length, arrived: rows.filter((r) => r.verdict === "arrived").length, resolved: await safeAutoResolve(userId) };
}

/** 周刊上押过的，重查完能自动对账的顺手对掉；对账出错不拖垮重查本身。 */
async function safeAutoResolve(userId: string): Promise<number> {
  try {
    return await autoResolveIssueBets(userId);
  } catch (e) {
    console.error("auto resolve issue bets failed", e);
    return 0;
  }
}
