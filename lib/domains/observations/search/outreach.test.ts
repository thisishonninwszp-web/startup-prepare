import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), run: vi.fn(), task: vi.fn(), version: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: m.from } }));
import { loadSearchOutreachDraft } from "./outreach";
const owner = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks(); m.run.mockResolvedValue({ data: { id, task_id: id, task_version_id: id, payload: { status: "success", parserVersion: "search-csv-v1", requestConditions: { provider: "ads_planner", region: "JP", language: "ja", timeframe: "2026-01" }, rawSnapshot: "Keyword,Avg. monthly searches\n旅館,20" } }, error: null });
  m.task.mockResolvedValue({ data: { object_id: id }, error: null });
  m.version.mockResolvedValue({ data: { config: { question: "夜间接待有什么障碍", region: "JP", language: "ja", timeRange: "2026-01" } }, error: null });
  m.from.mockImplementation((table: string) => { const result = table.endsWith("runs") ? m.run : table.endsWith("tasks") ? m.task : m.version; const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: result }; chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); return chain; });
});
it("prepares a traceable question draft without treating search interest as customer evidence", async () => {
  const draft = await loadSearchOutreachDraft(owner, id);
  expect(draft.ideaId).toBe(id); expect(draft.scenario).toContain("旅館"); expect(draft.scenario).toContain("不代表痛点或付费意愿"); expect(draft.scenario).toContain(id);
});
it("rejects missing owned records, unsupported runs and bad IDs", async () => {
  m.run.mockResolvedValue({ data: null, error: null }); await expect(loadSearchOutreachDraft(owner, id)).rejects.toThrow(); expect(m.task).not.toHaveBeenCalled();
  await expect(loadSearchOutreachDraft(owner, "bad")).rejects.toThrow();
});
it("rejects a generic import that claims a scope different from its immutable version", async () => {
  m.version.mockResolvedValue({ data: { config: { question: "问题", region: "US", language: "ja", timeRange: "2026-01" } }, error: null });
  await expect(loadSearchOutreachDraft(owner, id)).rejects.toThrow();
});
