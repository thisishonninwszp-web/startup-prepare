import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reality delta prompt", () => {
  it("shows string array elements without invalid blank placeholders", () => {
    const source = readFileSync("lib/ai.ts", "utf8");
    const prompt = source.match(
      /const REALITY_DELTA_PROMPT = `([\s\S]*?)`;/u
    )?.[1];

    expect(prompt).toBeDefined();
    expect(prompt).toContain('"added_facts":["新增事实及其来源"]');
    expect(prompt).toContain('"emotion_changes":["情绪及判断影响的变化"]');
    expect(prompt).not.toContain('[""]');
  });
});
