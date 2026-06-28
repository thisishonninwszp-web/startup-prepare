import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/011_dream_branch_canvas.sql",
  "utf8"
);

describe("dream branch migration", () => {
  it("aliases canvas array entries before aggregating them", () => {
    expect(migration).toContain(
      "from jsonb_array_elements(items) as entries(item)"
    );
  });

  it("can be rerun after the branch-version constraint was created", () => {
    expect(migration).toContain(
      "where conname = 'dream_versions_branch_version_uniq'"
    );
  });
});
