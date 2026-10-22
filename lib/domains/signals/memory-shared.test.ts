import { describe, expect, it } from "vitest";
import { cleanSnippet, embedText, interestGroups, mergeHits, parseVector, tokyoDayRange } from "./memory-shared";
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
