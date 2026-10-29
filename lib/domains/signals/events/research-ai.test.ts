import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ event: vi.fn(), load: vi.fn(), snapshots: vi.fn(), append: vi.fn(), generate: vi.fn(), rpc: vi.fn(), update: vi.fn() }));
vi.mock("./queries", () => ({ getEvent: mocks.event }));
vi.mock("./research", () => ({ loadResearch: mocks.load, researchSnapshots: mocks.snapshots, appendResearch: mocks.append }));
vi.mock("@/lib/ai/signal-events", async (original) => ({ ...await original<object>(), generateEventDraft: mocks.generate }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: () => ({ update: mocks.update }) } }));
import { generateResearch } from "./research-ai";
const user = "11111111-1111-4111-8111-111111111111", event = "22222222-2222-4222-8222-222222222222", source = "33333333-3333-4333-8333-333333333333", note = "44444444-4444-4444-8444-444444444444";
const input = { task: "dossier" as const, sourceIds: [source], noteIds: [], consent: true, requestId: "55555555-5555-4555-8555-555555555555" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.event.mockResolvedValue({ id: event, revision: 2, title: "PRIVATE_TITLE", scope_note: "PRIVATE_SCOPE" });
  mocks.load.mockResolvedValue({ available: true, entries: [{ id: note, kind: "note", created_at: "2026-01-01", payload: { text: "PRIVATE_NOTE" } }] });
  mocks.snapshots.mockResolvedValue([{ id: source, title: "Selected source", captured_text: "Selected excerpt", captured_at: "2026-01-01", published_at: null }, { id: note, title: "NOT_SELECTED", captured_text: "NOT_SELECTED_TEXT" }]);
  mocks.rpc.mockResolvedValue({ data: true, error: null }); const chain = { eq: vi.fn(), then: (resolve: (v: unknown) => void) => resolve({ error: null }) }; chain.eq.mockReturnValue(chain); mocks.update.mockReturnValue(chain);
  mocks.generate.mockResolvedValue({ sections: [{ heading: "未知", text: "需要核实原因", refs: [] }] }); mocks.append.mockImplementation(async (_u, _e, value) => ({ id: note, ...value }));
});
it("sends only explicitly selected excerpts and no private event metadata or unselected notes", async () => {
  await generateResearch(user, event, input);
  const sent = JSON.stringify(mocks.generate.mock.calls[0]);
  expect(sent).toContain("Selected excerpt"); expect(sent).not.toMatch(/PRIVATE_|NOT_SELECTED/);
});
it("requires consent and ownership before any AI request", async () => {
  await expect(generateResearch(user, event, { ...input, consent: false })).rejects.toThrow(); expect(mocks.generate).not.toHaveBeenCalled();
  mocks.event.mockResolvedValue(null); await expect(generateResearch(user, event, input)).rejects.toThrow(); expect(mocks.generate).not.toHaveBeenCalled();
});
it("allows explicit note selection and understanding requires two notes", async () => {
  await generateResearch(user, event, { ...input, noteIds: [note] }); expect(JSON.stringify(mocks.generate.mock.calls[0])).toContain("PRIVATE_NOTE");
  await expect(generateResearch(user, event, { ...input, task: "understanding", sourceIds: [], noteIds: [note] })).rejects.toThrow();
});
it("reuses matching draft without claiming or calling AI", async () => {
  const first = await generateResearch(user, event, input); mocks.load.mockResolvedValue({ available: true, entries: [first] }); mocks.generate.mockClear(); mocks.rpc.mockClear();
  expect(await generateResearch(user, event, input)).toEqual(first); expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("refuses a concurrent claim and preserves existing draft when AI fails", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null }); await expect(generateResearch(user, event, input)).rejects.toThrow(); expect(mocks.generate).not.toHaveBeenCalled();
  mocks.generate.mockRejectedValueOnce(new Error("provider failed")); await expect(generateResearch(user, event, input)).rejects.toThrow("provider failed"); expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.update).toHaveBeenCalledWith({ status: "failed" });
});
it("truncates source text and selected note text before crossing the AI boundary", async () => {
  mocks.snapshots.mockResolvedValue([{ id: source, title: "Source", captured_text: "a".repeat(10000) + "SECRET_TAIL", captured_at: "2026-01-01", published_at: null }]);
  mocks.load.mockResolvedValue({ available: true, entries: [{ id: note, kind: "note", created_at: "2026-01-01", payload: { text: "b".repeat(1000) + "PRIVATE_TAIL" } }] });
  await generateResearch(user, event, { ...input, noteIds: [note] });
  const sent = JSON.stringify(mocks.generate.mock.calls[0]); expect(sent).not.toMatch(/SECRET_TAIL|PRIVATE_TAIL/); expect(mocks.generate.mock.calls[0][2][0].captured_text).toHaveLength(10000);
});
it("supports note-only understanding and keeps selected note timestamps", async () => {
  const note2 = "66666666-6666-4666-8666-666666666666";
  mocks.load.mockResolvedValue({ available: true, entries: [{ id: note, kind: "note", created_at: "2026-01-01", payload: { text: "先前认为需求下滑" } }, { id: note2, kind: "explanation", created_at: "2026-02-01", payload: { text: "新增订单显示存在季节性" } }] });
  await generateResearch(user, event, { ...input, task: "understanding", sourceIds: [], noteIds: [note, note2] });
  expect(mocks.generate.mock.calls[0][2]).toEqual([]); expect(mocks.generate.mock.calls[0][3]).toHaveLength(2); expect(mocks.generate.mock.calls[0][3][1].createdAt).toBe("2026-02-01");
});
it("requires owned target and explicit source selections from both events", async () => {
  const target = "77777777-7777-4777-8777-777777777777", targetSource = "88888888-8888-4888-8888-888888888888";
  mocks.snapshots.mockImplementation(async (_user, eventId) => eventId === event ? [{ id: source, title: "Current source", captured_text: "current", captured_at: "2026-01-01", published_at: null }] : [{ id: targetSource, title: "Target source", captured_text: "target", captured_at: "2026-01-01", published_at: null }]);
  await expect(generateResearch(user, event, { ...input, task: "connections", targetEventId: target })).rejects.toThrow(); expect(mocks.generate).not.toHaveBeenCalled();
  mocks.generate.mockResolvedValue({ sections: [{ heading: "关联", text: "待核对机制", refs: [{ snapshotId: source, quote: "current" }, { snapshotId: targetSource, quote: "target" }], proposal: { kind: "connection", payload: { targetEventId: note } } }] });
  await generateResearch(user, event, { ...input, task: "connections", targetEventId: target, sourceIds: [source, targetSource] });
  expect(mocks.append.mock.calls[0][2].payload.sections[0].proposal.payload.targetEventId).toBe(target);
  expect(mocks.generate.mock.calls[0][2].map((s: { side: string }) => s.side)).toEqual(["current", "target"]);
});
