import { describe, expect, it } from "vitest";
import { embedText, mergeHits, parseVector, tokyoDayRange } from "./memory-shared";

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
