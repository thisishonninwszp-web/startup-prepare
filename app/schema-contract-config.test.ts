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

  it("defines one active reality closure and transactional lifecycle RPCs", () => {
    const migration = readFileSync(
      "supabase/migrations/013_reality_closure.sql",
      "utf8"
    );
    expect(migration).toContain(
      "create table if not exists reality_closures"
    );
    expect(migration).toContain(
      "create table if not exists reality_closure_events"
    );
    expect(migration).toMatch(
      /create unique index[\s\S]+where status = 'active'/
    );
    expect(migration).toContain(
      "create or replace function save_reality_closure"
    );
    expect(migration).toContain(
      "create or replace function resolve_reality_closure"
    );
    expect(migration).toContain(
      "create or replace function reconfirm_reality_closure"
    );
    const checker = readFileSync("scripts/check-schema.mjs", "utf8");
    expect(checker).toContain(
      '["reality_closures", "id,user_id,case_id,source_version_id,status,due_on"]'
    );
    expect(checker).toContain(
      '["reality_closure_events", "id,closure_id,user_id,event_type"]'
    );
  });
});
