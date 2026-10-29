import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: m.from } }));
import { prepareSnapshot, snapshotHash } from "./snapshots";
beforeEach(() => vi.clearAllMocks());
it("captures only server-owned source fields, with the cached excerpt labeled precisely", () => {
  const snapshot = prepareSnapshot({ id: "id", title: "Article", source: "news", url: "https://example.com", published_at: null, fetched_at: "2026-10-01T00:00:00Z", raw_text: "summary", excerpt: "Saved paragraph" });
  expect(snapshot).toMatchObject({ capture_scope: "excerpt", captured_text: "Saved paragraph", published_at: null });
  expect(snapshot).not.toHaveProperty("captured_at");
  expect(snapshot.payload_hash).toBe(snapshotHash(snapshot));
  expect(snapshotHash({ ...snapshot, captured_text: "changed" })).not.toBe(snapshot.payload_hash);
});
it("never promotes a summary to a complete body or invents publication time", () => {
  expect(prepareSnapshot({ id: "id", title: "Article", source: "news", url: null, published_at: null, fetched_at: "2026-10-01T00:00:00Z", raw_text: "summary", excerpt: null })).toMatchObject({ capture_scope: "summary", published_at: null, captured_text: "summary" });
});
it("rejects unsafe source links and empty captured material", () => {
  const row = { id: "id", title: "A", source: "news", url: "javascript:alert(1)", published_at: null, fetched_at: null, raw_text: "text", excerpt: null };
  expect(() => prepareSnapshot(row)).toThrow();
  expect(() => prepareSnapshot({ ...row, url: null, raw_text: "" })).toThrow();
});
