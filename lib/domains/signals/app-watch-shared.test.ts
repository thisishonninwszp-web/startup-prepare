import { describe, expect, it } from "vitest";
import { appNameFromChartTitle, parseLookup, watchTransition } from "./app-watch-shared";

describe("中国 App 来日本的迹象", () => {
  it("从榜单那一条的标题取 App 名", () => {
    expect(appNameFromChartTitle("中国 App Store 免费榜新上榜（第 3 名）：豆包 - 生活工作 AI 助手（效率）")).toBe("豆包 - 生活工作 AI 助手");
  });

  it("苹果查询接口：支不支持日语", () => {
    const m = parseLookup({ results: [{ trackId: 123, trackName: "Temu", sellerName: "Whaleco Inc.", trackViewUrl: "u", languageCodesISO2A: ["EN", "JA"] }, { trackId: 456, trackName: "拼多多", languageCodesISO2A: ["ZH"] }] });
    expect(m.get("123")).toMatchObject({ hasJa: true, developer: "Whaleco Inc." });
    expect(m.get("456")?.hasJa).toBe(false);
  });

  it("第一次查只记现状；之后从没有变成有才算一件事", () => {
    const first = watchTransition({ in_jp: null, has_ja: null, checked_on: null }, { inJp: true, hasJa: true }, "2026-10-23");
    expect(first.events).toEqual([]);
    const later = watchTransition({ in_jp: false, has_ja: false, checked_on: "2026-10-22" }, { inJp: true, hasJa: true }, "2026-10-23");
    expect(later.events).toEqual(["jp_store", "japanese"]);
    expect(later.patch).toMatchObject({ jp_since: "2026-10-23", ja_since: "2026-10-23" });
    // 哪个区都没查到（下架了）：不动原来的语言
    expect(watchTransition({ in_jp: true, has_ja: true, checked_on: "2026-10-22" }, { inJp: false, hasJa: null }, "2026-10-23").patch).toEqual({ checked_on: "2026-10-23", in_jp: false });
  });
});
