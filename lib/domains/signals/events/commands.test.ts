import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: m.from, rpc: m.rpc } }));
vi.mock("./snapshots", () => ({ captureSnapshot: m.capture }));
import { createEvent, includeSignal, excludeSignal, updateEvent } from "./commands";
const user = "11111111-1111-4111-8111-111111111111";
const event = "22222222-2222-4222-8222-222222222222";
const signal = "33333333-3333-4333-8333-333333333333";
const request = "44444444-4444-4444-8444-444444444444";
function query(result: unknown) { const q = { update: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(async () => result) }; q.update.mockReturnValue(q); q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.is.mockReturnValue(q); return q; }
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: { id: event, revision: 1 }, error: null }); });
it("rejects invalid input before calling the database", async () => {
  await expect(createEvent(user, { title: "", scopeNote: "", requestId: request })).rejects.toThrow();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("checks viewer ownership before any source capture", async () => {
  m.from.mockReturnValue(query({ data: null, error: null }));
  await expect(includeSignal(user, { eventId: event, signalId: signal, requestId: request, note: "", occurred: null })).rejects.toThrow();
  expect(m.capture).not.toHaveBeenCalled();
});
it("returns an idempotent retry before recapturing mutable source material", async () => {
  m.from.mockReturnValueOnce(query({ data: { id: event }, error: null })).mockReturnValueOnce(query({ data: { event_id: event, snapshot_id: signal, action: "include", signal_id: signal, note: null, occurred_from: null, occurred_to: null, occurred_precision: null, occurred_quote: null, revision: 7 }, error: null }));
  expect(await includeSignal(user, { eventId: event, signalId: signal, requestId: request, note: "", occurred: null })).toEqual({ revision: 7 });
  expect(m.capture).not.toHaveBeenCalled();
});
it("excludes through the atomic revision RPC without recapturing sources", async () => {
  m.from.mockReturnValueOnce(query({ data: { id: event }, error: null })).mockReturnValueOnce(query({ data: null, error: null }));
  await excludeSignal(user, { eventId: event, signalId: signal, requestId: request, note: "out of scope" });
  expect(m.rpc).toHaveBeenCalledWith("revise_signal_event_member", expect.objectContaining({ p_user_id: user, p_event_id: event, p_action: "exclude", p_snapshot_id: null }));
  expect(m.capture).not.toHaveBeenCalled();
});

it("edits an existing source using its owned original snapshot without recapturing", async () => {
  m.from.mockReturnValueOnce(query({ data: { id: event }, error: null }))
    .mockReturnValueOnce(query({ data: null, error: null }))
    .mockReturnValueOnce(query({ data: { id: signal, captured_text: "original quote" }, error: null }));
  await includeSignal(user, { eventId: event, signalId: signal, snapshotId: signal, requestId: request, note: "changed note", occurred: { from: "2026", to: null, precision: "year", quote: "original quote" } });
  expect(m.capture).not.toHaveBeenCalled();
  expect(m.rpc).toHaveBeenCalledWith("revise_signal_event_member", expect.objectContaining({ p_snapshot_id: signal }));
});
it("rejects a retry that changes the event or explicit snapshot", async () => {
  const old = { event_id: signal, snapshot_id: signal, action: "include", signal_id: signal, note: null, occurred_from: null, occurred_to: null, occurred_precision: null, occurred_quote: null, revision: 1 };
  m.from.mockReturnValueOnce(query({ data: { id: event }, error: null })).mockReturnValueOnce(query({ data: old, error: null }));
  await expect(includeSignal(user, { eventId: event, signalId: signal, requestId: request, note: "", occurred: null })).rejects.toThrow("不同内容");
  m.from.mockReturnValueOnce(query({ data: { id: event }, error: null })).mockReturnValueOnce(query({ data: { ...old, event_id: event }, error: null }));
  await expect(includeSignal(user, { eventId: event, signalId: signal, snapshotId: event, requestId: request, note: "", occurred: null })).rejects.toThrow("不同内容");
  expect(m.capture).not.toHaveBeenCalled();
});
it("limits metadata updates to the current private owner", async () => {
  const owned = query({ data: { id: event }, error: null });
  m.from.mockReturnValueOnce(owned);
  await updateEvent(user, { eventId: event, title: "Renamed", scopeNote: "Scope" });
  expect(owned.eq).toHaveBeenCalledWith("user_id", user);
  expect(owned.eq).toHaveBeenCalledWith("id", event);
  m.from.mockReturnValueOnce(query({ data: null, error: null }));
  await expect(updateEvent(user, { eventId: event, title: "Other", scopeNote: "" })).rejects.toThrow("无权修改");
});
