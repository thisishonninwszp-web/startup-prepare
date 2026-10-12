import { describe, expect, it } from "vitest";
import type { BriefItem } from "./brief";
import { collectPrecedents } from "./precedents-shared";

const item = (signal_id: string, precedent?: string, event?: string) =>
  ({ signal_id, precedent, event, headline: signal_id, title: "", url: null, source: "s", background: "", for_you: "" }) as BriefItem;

describe("先例", () => {
  it("只收标了先例的；同一件事只留最新的", () => {
    const out = collectPrecedents([
      { brief_date: "2026-10-01", items: [item("old", "自建仓撑不住", "Wolt退出日本")] },
      { brief_date: "2026-10-12", items: [item("new", "外卖平台退出", "Wolt 退出日本市场"), item("plain")] },
    ]);
    expect(out.map((p) => [p.signal_id, p.brief_date])).toEqual([["new", "2026-10-12"]]);
  });
});
