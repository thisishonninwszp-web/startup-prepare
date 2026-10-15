import { describe, expect, it } from "vitest";
import { parseReviewEntries, voiceCounts } from "./voices-shared";

describe("这边的真人原话", () => {
  it("voiceCounts：每种几句", () => {
    expect(voiceCounts([{ kind: "complain" }, { kind: "complain" }, { kind: "workaround" }])).toEqual({ complain: 2, seek: 0, workaround: 1 });
  });

  it("parseReviewEntries：只要三星以下、够长的评论；带日子和星数；最多取 max 条", () => {
    const entry = (rating: string, title: string, content: string) => ({
      "im:rating": { label: rating },
      title: { label: title },
      content: { label: content },
      updated: { label: "2026-10-13T16:00:31-07:00" },
    });
    const feed = {
      feed: {
        entry: [
          entry("1", "とにかく遅い", "最近本当に遅い。優先にしてもめちゃくちゃ遅い。"),
          entry("5", "最高", "いつも使っています。とても便利で助かっています。"),
          entry("2", "短い", "遅い"),
          entry("3", "まあまあ", "店は多いけど配達員が見つからないことがよくある。"),
          entry("1", "三つ目", "勝手に課金されます。解約の画面がわかりにくい。"),
          { title: { label: "App 本身的信息，没有星数" } },
        ],
      },
    };
    const out = parseReviewEntries(feed, { name: "Uber Eats", url: "https://apps.apple.com/jp/app/id1" }, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ rating: 1, date: "2026-10-13", url: "https://apps.apple.com/jp/app/id1" });
    expect(out[0].content).toBe("とにかく遅い。最近本当に遅い。優先にしてもめちゃくちゃ遅い。");
    expect(out[0].title).toContain("★1");
    expect(out[1].rating).toBe(3);
    // 只有一条时 RSS 给的是对象不是数组
    expect(parseReviewEntries({ feed: { entry: entry("2", "一条", "配達がいつも三十分以上遅れてくる。") } }, { name: "x", url: "u" }, 5)).toHaveLength(1);
    expect(parseReviewEntries(null, { name: "x", url: "u" }, 5)).toEqual([]);
  });
});
