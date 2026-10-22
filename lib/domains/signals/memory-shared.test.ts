import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  cleanSnippet,
  embedText,
  followReasonText,
  groupStoryUpdates,
  interestGroups,
  mergeFollowed,
  mergeHits,
  normalizeEventDate,
  parseVector,
  tokyoDayRange,
} from "./memory-shared";
import { NEWS_SOURCE_PREFIX, VOICE_SOURCE_PREFIX } from "./feeds";

describe("memory helpers", () => {
  it("embed text is title + body, capped", () => {
    expect(embedText({ title: "T", raw_text: "body" })).toBe("T\nbody");
    expect(embedText({ title: null, raw_text: "x".repeat(3000) })).toHaveLength(1500);
  });

  it("parses vectors read back as strings", () => {
    expect(parseVector("[0.1,0.2]")).toEqual([0.1, 0.2]);
    expect(parseVector([1, 2])).toEqual([1, 2]);
    expect(parseVector("nope")).toBeNull();
  });

  it("Tokyo day range n days ago", () => {
    expect(tokyoDayRange("2026-10-22", 30)).toEqual({ from: "2026-09-21T15:00:00.000Z", to: "2026-09-22T15:00:00.000Z" });
  });

  it("merges keyword hits first and dedupes", () => {
    const h = (id: string) => ({ id, source: "s", url: null, title: id, snippet: "", fetched_at: "" });
    expect(mergeHits([h("a"), h("b")], [h("b"), h("c")], 10).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(mergeHits([h("a")], [h("b"), h("c")], 2).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("cleanSnippet", () => {
  it("decodes RSS entities and squashes spaces", () => {
    expect(cleanSnippet("モヤシ争奪戦 &nbsp;&nbsp; テレ朝NEWS")).toBe("モヤシ争奪戦 テレ朝NEWS");
    expect(cleanSnippet(null)).toBe("");
  });
});

describe("interestGroups", () => {
  it("counts marks per report section, most first, keeping only written reasons", () => {
    const groups = interestGroups([
      { signal_id: "a", source: `${VOICE_SOURCE_PREFIX}x`, title: "A", note: "跟我做的事有关" },
      { signal_id: "b", source: `${VOICE_SOURCE_PREFIX}y`, title: "B", note: null },
      { signal_id: "c", source: `${NEWS_SOURCE_PREFIX}z`, title: "C", note: "  " },
    ]);
    expect(groups.map((g) => [g.kind, g.count])).toEqual([
      ["voices", 2],
      ["news", 1],
    ]);
    expect(groups[0].reasons).toEqual([{ signal_id: "a", title: "A", note: "跟我做的事有关" }]);
    expect(groups[1].reasons).toEqual([]);
  });
});

describe("在跟的事", () => {
  const f = (signal_id: string, reason: "mark" | "observation" | "judgment", at: string) => ({ signal_id, reason, mark: reason === "mark" ? ("important" as const) : null, note: null, at });

  it("同一条有好几种理由时留标记，时间取最近的", () => {
    const merged = mergeFollowed([f("a", "observation", "2026-10-01"), f("a", "mark", "2026-09-01"), f("b", "judgment", "2026-10-05")]);
    expect(merged.map((m) => [m.signal_id, m.reason, m.at])).toEqual([
      ["b", "judgment", "2026-10-05"],
      ["a", "mark", "2026-10-01"],
    ]);
  });

  it("新消息只放在最像的那件事下面；他自己在跟的不再列；有最新消息的在前", () => {
    const followed = ["x", "y", "z"].map((id) => ({ ...f(id, "mark", "2026-10-01"), title: id, source: "news:a", fetched_at: "2026-10-01" }));
    const row = (followed_id: string, id: string, fetched_at: string, similarity: number) => ({ followed_id, id, source: "news:a", url: null, title: id, fetched_at, similarity });
    const groups = groupStoryUpdates(
      [row("x", "n1", "2026-10-20", 0.8), row("y", "n1", "2026-10-20", 0.9), row("x", "n2", "2026-10-21", 0.75), row("x", "z", "2026-10-22", 0.95)],
      followed
    );
    expect(groups.map((g) => [g.followed.signal_id, g.updates.map((u) => u.id)])).toEqual([
      ["x", ["n2"]],
      ["y", ["n1"]],
    ]);
  });

  it("理由写成一句话", () => {
    expect(followReasonText({ reason: "mark", mark: "doubt" })).toBe("你标了「存疑」");
    expect(followReasonText({ reason: "judgment", mark: null })).toBe("你写过判断");
  });
});

describe("时间线", () => {
  it("新闻和图谱、官报排成一条线，按年分；写不清日子的不进线", () => {
    const hit = { id: "h", source: "news:a", url: null, title: "外卖进日本", snippet: "", fetched_at: "2026-10-20T01:00:00Z" };
    const years = buildTimeline(
      [hit],
      [
        { key: "a1", date: "2016-03", kind: "atlas", title: "中国：美团外卖", href: "/signals/atlas" },
        { key: "a2", date: "某年", kind: "atlas", title: "x", href: null },
        { key: "k1", date: "2026-06-30", kind: "kanpo", title: "决算", href: null },
      ]
    );
    expect(years.map((y) => [y.year, y.events.map((e) => e.key)])).toEqual([
      ["2016", ["a1"]],
      ["2026", ["k1", "news-h"]],
    ]);
  });

  it("图谱里的日子统一写法", () => {
    expect(normalizeEventDate("2016年3月")).toBe("2016-03");
    expect(normalizeEventDate("2016")).toBe("2016");
    expect(normalizeEventDate("2019-11")).toBe("2019-11");
    expect(normalizeEventDate("某年")).toBe("某年");
  });
});
