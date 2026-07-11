import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ai = readFileSync("lib/ai.ts", "utf8");

describe("reality material AI contract", () => {
  it("exposes the three-province AI functions through lib/ai.ts", () => {
    expect(ai).toContain("draftRealityMaterial");
    expect(ai).toContain("reviewRealityMaterial");
    expect(ai).toContain("routeRealityMaterial");
    expect(ai).toContain("summarizeSpreadsheetMaterial");
  });

  it("keeps material prompts from auto-writing facts or ideas", () => {
    expect(ai).toContain("不自动创建 idea");
    expect(ai).toContain("不自动写入顾客证据");
    expect(ai).toContain("不把推断写成事实");
  });
});
