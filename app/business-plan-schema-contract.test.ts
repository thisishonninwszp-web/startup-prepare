import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/022_internal_business_plan.sql",
  "utf8"
);

describe("internal business plan migration", () => {
  it("creates isolated owner-scoped tables and a private bucket", () => {
    for (const table of [
      "own_company_profiles",
      "business_plan_imports",
      "business_plan_chunks",
      "business_plan_supplier_aliases",
      "business_plan_extractions",
      "business_plan_snapshots",
      "business_plan_questions",
    ]) {
      expect(sql).toContain(`create table if not exists ${table}`);
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
    expect(sql).toContain("'internal-business-plans'");
    expect(sql).toContain("public = false");
    expect(sql).toContain("business_plan_snapshot_id");
    expect(sql).toContain(
      "compressed_size integer not null check (compressed_size between 1 and 2097152)"
    );
    expect(sql).toContain("to_regclass('public.reality_case_sources')");
    expect(sql).not.toMatch(
      /on business_plan_(?:imports|chunks|supplier_aliases|extractions|snapshots|questions) for all/
    );
  });
});
