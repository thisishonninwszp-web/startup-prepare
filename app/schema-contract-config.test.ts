import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production schema contract", () => {
  it("provides a repeatable remote schema check command", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["db:check"]).toBe("node scripts/check-schema.mjs");
    expect(existsSync("scripts/check-schema.mjs")).toBe(true);
  });
});
