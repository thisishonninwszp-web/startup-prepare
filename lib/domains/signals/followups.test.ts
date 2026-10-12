import { describe, expect, it } from "vitest";
import type { BriefItem } from "./brief";
import { findEarlierMentions, type EarlierJudgment } from "./followups";

const item = (signal_id: string, event?: string, headline = signal_id) =>
  ({ signal_id, event, headline, title: "", url: null, source: "", background: "", for_you: "" }) as BriefItem;

describe("跟住一件事", () => {
  it("之前出现过同一件事：标最近一次、一共几天，以及写过判断的那次", () => {
    const judgments = new Map<string, EarlierJudgment>([["old", { judgment: "运费会涨", due_at: "2027-01-01", outcome: "pending" }]]);
    const out = findEarlierMentions(
      [item("today", "物流2024年问题"), item("other", "日银加息")],
      [
        { brief_date: "2026-10-03", items: [item("old", "物流2024年问题", "旧的")] },
        { brief_date: "2026-10-08", items: [item("mid", "物流 2024 年问题司机不足", "中间的")] },
      ],
      judgments
    );
    expect(out.today).toMatchObject({ brief_date: "2026-10-08", headline: "中间的", times: 2 });
    expect(out.today.judgment).toMatchObject({ judgment: "运费会涨", brief_date: "2026-10-03" });
    expect(out.other).toBeUndefined();
  });

  it("同一条新闻、没有事件标签、也值得一看那几条，都不算", () => {
    const out = findEarlierMentions(
      [item("same", "日银加息"), item("noevent"), { ...item("extra", "日银加息"), extra: true }],
      [{ brief_date: "2026-10-01", items: [item("same", "日银加息")] }],
      new Map()
    );
    expect(out).toEqual({});
  });
});
