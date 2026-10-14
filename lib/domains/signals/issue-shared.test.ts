import { describe, expect, it } from "vitest";
import { assembleDrafts, ISSUE_CTA, issueCounts, sourcesBlock, weekStartOf, type IssuePick } from "./issue-shared";

const pick = (over: Partial<IssuePick> = {}): IssuePick => ({
  side: "japan",
  signal_id: "s1",
  headline: "美团用无人机送药",
  background: "b",
  here: "没有。",
  sources: [
    { title: "原文", url: "https://example.cn/1" },
    { title: "日本这边", url: "https://example.jp/1" },
  ],
  judgment: "两年内日本会先在离岛试点，城市里法规还卡着。",
  ...over,
});

describe("周刊", () => {
  it("weekStartOf：那一周的周一", () => {
    expect(weekStartOf("2026-10-14")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12");
  });

  it("sourcesBlock：同一个链接只列一次", () => {
    const block = sourcesBlock([pick(), pick({ signal_id: "s2", sources: [{ title: "原文", url: "https://example.cn/1" }] })], "zh");
    expect(block.split("\n")).toEqual(["出处：", "・原文 https://example.cn/1", "・日本这边 https://example.jp/1"]);
  });

  it("assembleDrafts：长文加结尾和出处，小红书只加结尾，X 什么都不加", () => {
    const d = assembleDrafts({ zhLong: "正文", zhShort: "短", jaLong: "本文", jaShort: "ポスト", zhTitles: ["t"], jaTitles: ["t"] }, [pick()]);
    expect(d.zhLong.startsWith("正文\n\n" + ISSUE_CTA.zh + "\n\n出处：")).toBe(true);
    expect(d.zhShort).toBe("短\n\n" + ISSUE_CTA.zh);
    expect(d.jaLong).toContain("出典：");
    expect(d.jaShort).toBe("ポスト");
  });

  it("issueCounts：只数次数", () => {
    expect(
      issueCounts({
        published: [{ platform: "小红书", url: "", at: "" }],
        responses: [
          { at: "", observation_id: "o1", wants_talk: true },
          { at: "", observation_id: "o2", wants_talk: false },
        ],
      })
    ).toEqual({ published: 1, responses: 2, wantsTalk: 1 });
  });
});
