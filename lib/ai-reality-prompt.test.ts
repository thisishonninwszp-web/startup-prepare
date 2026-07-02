import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reality delta prompt", () => {
  it("uses empty arrays instead of invalid blank-string placeholders", () => {
    const source = readFileSync("lib/ai.ts", "utf8");
    const prompt = source.match(
      /const REALITY_DELTA_PROMPT = `([\s\S]*?)`;/u
    )?.[1];

    expect(prompt).toBeDefined();
    expect(prompt).toContain('"emotion_changes":[]');
    expect(prompt).not.toContain('[""]');
  });
});
