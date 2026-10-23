/**
 * 他点开了哪几条（迁移 100，经用户同意 2026-10-23）：被动记录，他什么都不用点 ——
 * 做过的比说过的可信，点开就是一点「在意」的痕迹（比标记弱，所以只接后来的消息、不进回想）。不碰数据库的部分。
 */

export type OpenVia = "report" | "detail" | "email" | "list";
export const OPEN_VIAS: OpenVia[] = ["report", "detail", "email", "list"];

export type OpenRow = { signal_id: string; opened_on: string; first_at: string };

/** 点开过几天以上，才算他在跟这件事。 */
export const OPEN_FOLLOW_DAYS = 2;

/** 点开过 min 天以上的（新的在前）：signal_id 和最后一次点开的时候。 */
export function repeatOpened(rows: OpenRow[], min = OPEN_FOLLOW_DAYS): { signal_id: string; at: string; days: number }[] {
  const by = new Map<string, { days: Set<string>; at: string }>();
  for (const r of rows) {
    const cur = by.get(r.signal_id) ?? { days: new Set<string>(), at: r.first_at };
    cur.days.add(r.opened_on);
    if (r.first_at > cur.at) cur.at = r.first_at;
    by.set(r.signal_id, cur);
  }
  return Array.from(by.entries())
    .filter(([, v]) => v.days.size >= min)
    .map(([signal_id, v]) => ({ signal_id, at: v.at, days: v.days.size }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** 每个源点开过几条（同一条点开几天都只算一条）。 */
export function opensBySource(rows: { signal_id: string; source: string }[]): Map<string, number> {
  const seen = new Set<string>();
  const out = new Map<string, number>();
  for (const r of rows) {
    if (seen.has(r.signal_id)) continue;
    seen.add(r.signal_id);
    out.set(r.source, (out.get(r.source) ?? 0) + 1);
  }
  return out;
}
