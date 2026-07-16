import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("AI gateway contract", () => {
  it("keeps direct Gemini generateContent calls inside lib/ai-gateway.ts only", () => {
    const aiModules = readdirSync(join(ROOT, "lib/ai"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `lib/ai/${name}`);
    const files = [...aiModules, "lib/ai-gateway.ts"].map((file) => ({
      file,
      text: readFileSync(join(ROOT, file), "utf8"),
    }));

    const violations = files
      .filter(({ file }) => file !== "lib/ai-gateway.ts")
      .flatMap(({ file, text }) =>
        [...text.matchAll(/models\.generateContent\(/g)].map(
          (match) => `${file}:${text.slice(0, match.index).split("\n").length}`
        )
      );

    expect(violations).toEqual([]);
  });
});
