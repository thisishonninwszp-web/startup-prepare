import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: db }));
vi.mock("./users", () => ({ sharedViewFor: vi.fn(async () => ({ sourceUserId: "owner", shared: true })) }));
import { clearReadingPreference, loadReadingPreferences, reportEventsForSignals, setReadingPreference } from "./reading-preferences";

function query(result: { data?: unknown; error: { message: string; code?: string } | null }) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), or: vi.fn(), range: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), delete: vi.fn(), then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const method of [q.select, q.eq, q.order, q.limit, q.or, q.range, q.maybeSingle, q.upsert, q.delete]) method.mockReturnValue(q);
  return q;
}

beforeEach(() => { vi.clearAllMocks(); db.from.mockReset(); });

describe("viewer reading preference persistence", () => {
  it("finds old event labels across pages using only targeted shared-report IDs", async () => {
    const recentId = "00000000-0000-0000-0000-000000000001";
    const oldId = "00000000-0000-0000-0000-000000000002";
    const first = query({ data: Array.from({ length: 1000 }, () => ({ items: [{ signal_id: recentId, event: "日银加息" }] })), error: null });
    const second = query({ data: [{ items: [{ signal_id: oldId, event: "物流招聘" }] }], error: null });
    db.from.mockReturnValueOnce(first).mockReturnValueOnce(second);
    expect(await reportEventsForSignals("viewer", [recentId, oldId])).toEqual(new Map([[recentId, "日银加息"], [oldId, "物流招聘"]]));
    expect(first.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(first.or).toHaveBeenCalledWith(`items.cs.[{"signal_id":"${recentId}"}],items.cs.[{"signal_id":"${oldId}"}]`);
    expect(first.range).toHaveBeenCalledWith(0, 999);
    expect(second.range).toHaveBeenCalledWith(1000, 1999);
    expect(first.order).toHaveBeenCalledWith("brief_date", { ascending: false });
    expect(first.order).toHaveBeenCalledWith("id", { ascending: true });
  });
  it("missing report items are normal and invalid IDs never enter a PostgREST expression", async () => {
    const id = "00000000-0000-0000-0000-000000000001";
    const q = query({ data: [], error: null });
    db.from.mockReturnValue(q);
    expect(await reportEventsForSignals("viewer", [id, "malformed),user_id.eq.other"])).toEqual(new Map());
    expect(q.or).toHaveBeenCalledWith(`items.cs.[{"signal_id":"${id}"}]`);
    expect(await reportEventsForSignals("viewer", [])).toEqual(new Map());
  });
  it("does not treat a later report-page error as a complete event lookup", async () => {
    const id = "00000000-0000-0000-0000-000000000001";
    db.from.mockReturnValueOnce(query({ data: Array.from({ length: 1000 }, () => ({ items: [] })), error: null }))
      .mockReturnValueOnce(query({ data: null, error: { message: "later page failed" } }));
    await expect(reportEventsForSignals("viewer", [id])).rejects.toThrow("later page failed");
  });
  it("batches long lookups without letting an older co-occurrence override a later batch's latest label", async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`);
    const first = query({ data: [{ items: [{ signal_id: ids[0], event: "第一批事件" }, { signal_id: ids[20], event: "旧标签" }] }], error: null });
    const second = query({ data: [{ items: [{ signal_id: ids[20], event: "新的事件标签" }] }], error: null });
    db.from.mockReturnValueOnce(first).mockReturnValueOnce(second);
    expect((await reportEventsForSignals("viewer", ids)).get(ids[20])).toBe("新的事件标签");
    expect(first.or.mock.calls[0][0]).not.toContain(ids[20]);
    expect(second.or.mock.calls[0][0]).toContain(ids[20]);
  });
  it("returns a distinct missing-schema state and does not conceal other database failures", async () => {
    db.from.mockReturnValueOnce(query({ error: { code: "PGRST205", message: "Could not find public.signal_reading_preferences" } }));
    await expect(loadReadingPreferences("viewer")).resolves.toEqual({ status: "missing-schema", preferences: [] });
    db.from.mockReturnValueOnce(query({ error: { code: "42501", message: "permission denied" } }));
    await expect(loadReadingPreferences("viewer")).rejects.toThrow("permission denied");
  });
  it("reads the viewer's preferences even when they read a shared owner's report", async () => {
    const q = query({ data: [], error: null });
    db.from.mockReturnValue(q);
    await loadReadingPreferences("viewer");
    expect(q.eq).toHaveBeenCalledWith("user_id", "viewer");
    expect(q.eq).not.toHaveBeenCalledWith("user_id", "owner");
  });
  it("clears only the viewer's exact override", async () => {
    const q = query({ error: null });
    db.from.mockReturnValue(q);
    await clearReadingPreference("viewer", "event:日银加息");
    expect(q.eq).toHaveBeenCalledWith("user_id", "viewer");
    expect(q.eq).toHaveBeenCalledWith("event_key", "event:日银加息");
  });
  it("does not claim that a failed write succeeded", async () => {
    db.from.mockReturnValue(query({ error: { message: "connection reset" } }));
    await expect(clearReadingPreference("viewer", "event:日银加息")).rejects.toThrow("connection reset");
  });
  it("rejects nonexistent news before creating an override", async () => {
    const q = query({ data: null, error: null });
    db.from.mockReturnValue(q);
    await expect(setReadingPreference("viewer", "00000000-0000-0000-0000-000000000001", "mute")).rejects.toThrow("找不到这条新闻");
    expect(q.upsert).not.toHaveBeenCalled();
  });
  it("reuses the existing event override so changing a later report can be fully undone", async () => {
    const id = "00000000-0000-0000-0000-000000000001";
    const existing = { signal_id: "anchor", event_key: "event:日银加息", event_label: "日银加息", preference: "mute", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", external_signals: { title: "日银宣布加息", source: "rss:test", fetched_at: "2026-10-01T00:00:00Z" } };
    const reports = query({ data: [{ items: [{ signal_id: id, event: "日银加息后银行跟进" }] }], error: null });
    const write = query({ error: null });
    db.from.mockReturnValueOnce(query({ data: { id }, error: null })).mockReturnValueOnce(reports)
      .mockReturnValueOnce(query({ data: [existing], error: null })).mockReturnValueOnce(write);
    await setReadingPreference("viewer", id, "follow");
    expect(reports.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(write.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "viewer", event_key: "event:日银加息", event_label: "日银加息", preference: "follow", created_at: existing.created_at }), { onConflict: "user_id,event_key" });
  });
});
