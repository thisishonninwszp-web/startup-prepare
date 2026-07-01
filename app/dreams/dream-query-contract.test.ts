import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dream case parallel queries", () => {
  it("assigns query results in the same order as their Supabase tables", () => {
    const source = readFileSync("app/dreams/queries.ts", "utf8");

    expect(source).toMatch(
      /const \[\s*canvasSuggestionResult,\s*messageResult,\s*canvasResult,\s*suggestionResult,\s*versionResult,\s*sourceResult,\s*\]\s*=\s*await Promise\.all/
    );
  });
});
