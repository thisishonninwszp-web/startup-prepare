import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), around: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: m.from, rpc: m.rpc } }));
vi.mock("../memory", () => ({ storyAround: m.around }));
import { suggestMembers, eventLinksForSignals, listEvents, listTimeline } from "./queries";
const user = "11111111-1111-4111-8111-111111111111";
const event = "22222222-2222-4222-8222-222222222222";
beforeEach(() => vi.clearAllMocks());
it("degrades only when the event schema is absent", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find public.list_signal_events" } });
  expect(await listEvents(user)).toEqual({ status: "missing-schema", items: [], nextCursor: null });
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });
  await expect(listEvents(user)).rejects.toThrow("permission denied");
});
it("uses viewer-owned SQL pagination rather than truncating and filtering client side", async () => {
  m.rpc.mockResolvedValue({ data: { items: [], nextCursor: "next" }, error: null });
  expect(await listTimeline(user, event, { mode: "occurred", cursor: "opaque", limit: 20 })).toEqual({ items: [], nextCursor: "next" });
  expect(m.rpc).toHaveBeenCalledWith("signal_event_timeline", { p_user_id: user, p_event_id: event, p_mode: "occurred", p_cursor: "opaque", p_limit: 20 });
});
it("maps confirmed event links by viewer and validates IDs before database reads", async () => {
  m.rpc.mockResolvedValueOnce({ data: { [event]: [{ id: event, title: "Test" }] }, error: null });
  expect(await eventLinksForSignals(user, [event])).toEqual({ [event]: [{ id: event, title: "Test" }] });
  expect(m.rpc).toHaveBeenCalledWith("signal_event_links", { p_user_id: user, p_signal_ids: [event] });
  m.rpc.mockClear();
  await expect(eventLinksForSignals(user, ["invalid"])).rejects.toThrow();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("preserves the ordinary reading route when migration105 is absent", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find public.signal_event_links" } });
  expect(await eventLinksForSignals(user, [event])).toEqual({});
});

it("uses only owned confirmed seeds and omits every previously reviewed candidate", async () => {
  function query(result: unknown) { const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(async () => result), maybeSingle: vi.fn(async () => result) }; q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.order.mockReturnValue(q); return q; }
  const owned = query({ data: { id: event, title: "Event", archived_at: null }, error: null });
  m.from.mockReturnValueOnce(owned).mockReturnValueOnce(query({ data: [{ signal_id: "rejected" }, { signal_id: "seed" }], error: null }));
  m.rpc.mockResolvedValueOnce({ data: { items: [{ signalId: "seed", title: "Seed title" }], nextCursor: null }, error: null });
  m.around.mockResolvedValueOnce({ before: [{ id: "rejected", title: "Rejected", source: "news", url: null, fetched_at: "2026-10-01" }], after: [{ id: "candidate", title: "Candidate", source: "news", url: null, fetched_at: "2026-10-02" }] });
  const result = await suggestMembers(user, event);
  expect(owned.eq).toHaveBeenCalledWith("user_id", user);
  expect(m.around).toHaveBeenCalledWith("seed", 20);
  expect(result.status).toBe("ready");
  expect(result.items.map((item) => item.id)).toEqual(["candidate"]);
  if (result.status === "ready") expect(result.items[0].reason).toContain("Seed title");
});

it("never searches member candidates before confirming private event ownership", async () => {
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) }; q.select.mockReturnValue(q); q.eq.mockReturnValue(q);
  m.from.mockReturnValueOnce(q);
  await expect(suggestMembers(user, event)).rejects.toThrow("无权访问");
  expect(m.around).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
});
