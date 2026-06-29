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

  it("defines one exclusive reasoning target per reality source", () => {
    const migration = readFileSync(
      "supabase/migrations/012_reality_reasoning_bridge.sql",
      "utf8"
    );
    expect(migration).toContain(
      "create table if not exists reasoning_sources"
    );
    expect(migration).toContain(
      "num_nonnulls(bayesian_belief_id, fermi_estimate_id, reframing_session_id) = 1"
    );
  });
});
