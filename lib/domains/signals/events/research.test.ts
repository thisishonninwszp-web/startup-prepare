import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ select: vi.fn(), event: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { rpc: m.rpc } }));
vi.mock("@/lib/supabase-all", () => ({ selectAll: m.select }));
vi.mock("./queries", () => ({ getEvent: m.event }));
import { appendResearch } from "./research";
const user = "11111111-1111-4111-8111-111111111111", event = "22222222-2222-4222-8222-222222222222", note = "33333333-3333-4333-8333-333333333333", request = "44444444-4444-4444-8444-444444444444";
beforeEach(() => { vi.clearAllMocks(); m.event.mockResolvedValue({ id: event }); m.select.mockResolvedValueOnce({ data: [{ id: note, kind: "note", payload: { text: "原先的理解" } }], error: null }).mockResolvedValueOnce({ data: [], error: null }); m.rpc.mockResolvedValue({ data: { id: request }, error: null }); });
it("saves validated note provenance with an adopted explanation", async () => {
  const noteRefs = [{ recordId: note, quote: "原先的理解" }];
  await appendResearch(user, event, { kind: "explanation", requestId: request, payload: { text: "现在的解释", assumptions: "前提", distinguish: "比较变化", noteRefs } });
  expect(m.rpc.mock.calls[0][1].p_payload.noteRefs).toEqual(noteRefs);
});
it.each([{ recordId: "55555555-5555-4555-8555-555555555555", quote: "原先的理解" }, { recordId: note, quote: "编造的理解" }])("rejects unowned or fabricated private note citation before write", async (ref) => {
  await expect(appendResearch(user, event, { kind: "unknown", requestId: request, payload: { question: "问题", criterion: "判据", noteRefs: [ref] } })).rejects.toThrow(); expect(m.rpc).not.toHaveBeenCalled();
});
it("checks nested proposal notes against explicit dossier note selection", async () => {
  await expect(appendResearch(user, event, { kind: "dossier", requestId: request, payload: { task: "unknowns", inputHash: "a".repeat(64), memberRevision: 0, selectedSnapshotIds: [], selectedNoteIds: [], sections: [{ heading: "未知", text: "需要核实", refs: [], proposal: { kind: "unknown", payload: { question: "问题", criterion: "判据", noteRefs: [{ recordId: note, quote: "原先的理解" }] } } }] } })).rejects.toThrow(); expect(m.rpc).not.toHaveBeenCalled();
});
