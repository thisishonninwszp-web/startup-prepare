import { fetchDay, listIssues } from "@/lib/domains/signals/kanpo-fetch";
import { clearDay, fetchedDays, markFetched, saveNotices } from "@/lib/domains/signals/kanpo";

/**
 * 抓官报的会社決算公告：默认把首页上最近 90 天里还没抓过的日子补齐（旧的在前）；给 only 就只抓那一天，
 * again 就把这 90 天全部重抓（改了抽取规则以后用）。重抓一天先删掉那天存的，切法变了条目的编号会跟着变。
 * 一天抓完才记"抓过"，中途断了下次从那天接着。
 */
export async function runKanpoFetch(
  opts: { only?: string; again?: boolean } = {},
  log: (line: string) => void = console.log
): Promise<{ days: number; notices: number; incomplete: number }> {
  const issues = await listIssues();
  const dates = Array.from(new Set(issues.map((i) => `${i.date.slice(0, 4)}-${i.date.slice(4, 6)}-${i.date.slice(6, 8)}`))).sort();
  const done = await fetchedDays();
  const todo = opts.only ? [opts.only] : opts.again ? dates : dates.filter((d) => !done.has(d));
  let notices = 0;
  let incomplete = 0;
  for (const day of todo) {
    const r = await fetchDay(day, issues);
    if (done.has(day)) await clearDay(day);
    await saveNotices(r.notices);
    const bad = r.notices.filter((n) => !n.complete).length;
    await markFetched(day, r.pages, r.notices.length, bad);
    notices += r.notices.length;
    incomplete += bad;
    log(`${day}：读了 ${r.pages} 页，决算公告 ${r.notices.length} 条${bad > 0 ? `（${bad} 条没抽全，原文留着）` : ""}`);
  }
  return { days: todo.length, notices, incomplete };
}
