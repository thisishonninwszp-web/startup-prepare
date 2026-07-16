import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "app/(app)/capture/actions.ts",
  "app/(app)/customer-view/actions.ts",
  "app/(app)/reasoning/actions.ts",
];

describe("database writes", () => {
  it.each(FILES)("%s checks every Supabase write result", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/^\s*await\s+supabaseAdmin/gm);
  });
});
