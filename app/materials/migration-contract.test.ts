import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/029_reality_materials.sql",
  "utf8"
);

describe("reality materials migration", () => {
  it("creates the materials, extraction, draft, review, route and department tables", () => {
    for (const table of [
      "reality_materials",
      "reality_material_extractions",
      "reality_material_drafts",
      "reality_material_reviews",
      "reality_material_routes",
      "reality_material_departments",
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps client table writes closed by default", () => {
    expect(sql).toMatch(/revoke all on table public\.reality_materials from anon, authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.reality_material_routes from anon, authenticated/i);
  });
});
