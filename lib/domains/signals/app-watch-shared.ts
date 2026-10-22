/**
 * 中国 App 来日本的迹象（迁移 096）—— 不碰数据库、不碰网络的部分。
 * 上过中国免费榜的 App，每天用苹果公开的查询接口（itunes.apple.com/lookup，不用 Key）查：日本 App Store 上有没有、支不支持日语。
 */

/** 中国免费榜那一条的标题「中国 App Store 免费榜新上榜（第 3 名）：豆包 - 生活工作 AI 助手（效率）」里取出 App 名。 */
export function appNameFromChartTitle(title: string): string {
  const m = title.match(/[：:](.+?)（[^（）]*）\s*$/);
  return (m ? m[1] : title).trim();
}

export type LookupApp = { id: string; name: string; developer: string; url: string; hasJa: boolean };

/** 苹果查询接口的结果：id → 名字、开发者、链接、支不支持日语。 */
export function parseLookup(json: unknown): Map<string, LookupApp> {
  const results = ((json ?? {}) as { results?: unknown[] }).results ?? [];
  const out = new Map<string, LookupApp>();
  for (const r of results) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.trackId !== "number" && typeof o.trackId !== "string") continue;
    const id = String(o.trackId);
    const langs = Array.isArray(o.languageCodesISO2A) ? (o.languageCodesISO2A as unknown[]).map(String) : [];
    out.set(id, {
      id,
      name: typeof o.trackName === "string" ? o.trackName : "",
      developer: typeof o.sellerName === "string" ? o.sellerName : typeof o.artistName === "string" ? o.artistName : "",
      url: typeof o.trackViewUrl === "string" ? o.trackViewUrl : "",
      hasJa: langs.includes("JA"),
    });
  }
  return out;
}

export type WatchState = { in_jp: boolean | null; has_ja: boolean | null; checked_on: string | null };
export type WatchEvent = "jp_store" | "japanese";

export const EVENT_LABELS: Record<WatchEvent, string> = { jp_store: "在日本 App Store 上架了", japanese: "加了日语" };

/**
 * 这次查到的和上次比：第一次查只记下现状（已经在的不算「刚」）；之后从没有变成有，才算一件事。
 * 查不到（苹果没返回）时 inJp 为 false；hasJa 为 null 表示这次哪个区都没查到它（下架了），不动原来的。
 */
export function watchTransition(prev: WatchState, now: { inJp: boolean; hasJa: boolean | null }, today: string): { patch: Record<string, unknown>; events: WatchEvent[] } {
  const first = prev.checked_on === null;
  const events: WatchEvent[] = [];
  const patch: Record<string, unknown> = { checked_on: today, in_jp: now.inJp };
  if (now.hasJa !== null) patch.has_ja = now.hasJa;
  if (!first && prev.in_jp === false && now.inJp) {
    events.push("jp_store");
    patch.jp_since = today;
  }
  if (!first && prev.has_ja === false && now.hasJa === true) {
    events.push("japanese");
    patch.ja_since = today;
  }
  return { patch, events };
}
