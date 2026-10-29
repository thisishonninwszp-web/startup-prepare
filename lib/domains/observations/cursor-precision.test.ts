import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase",()=>({supabaseAdmin:{}}));
import { observationCursorFilter } from "./queries";
it("preserves PostgreSQL fractional seconds instead of skipping unread rows within a millisecond",()=>{
  expect(observationCursorFilter("2026-10-26T00:00:00.123900+00:00|11111111-1111-4111-8111-111111111111")).toContain("created_at.lt.2026-10-26T00:00:00.123900+00:00");
});
it("rejects unsafe PostgREST filter characters in cursor timestamps",()=>{
  expect(()=>observationCursorFilter("2026-10-26T00:00:00Z),id.gt.x|11111111-1111-4111-8111-111111111111")).toThrow();
});
