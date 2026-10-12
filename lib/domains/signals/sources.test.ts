import { describe, expect, it } from "vitest";
import { mergeSources } from "./sources";

describe("mergeSources", () => {
  it("两种语言的结果按链接去重、保持先后、最多留 max 篇；没正文的丢掉", () => {
    const r = (url: string, content = "c") => ({ url, content });
    const merged = mergeSources([[r("a"), r("b"), r("x", "")], [r("b"), r("c"), r("d")]], 3);
    expect(merged.map((m) => m.url)).toEqual(["a", "b", "c"]);
  });
});
