import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), result: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: m.from } }));
import { loadDeferredExperimentQuestions } from "./connected-overview-queries";
beforeEach(() => { vi.clearAllMocks(); const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: m.result }; for (const fn of [chain.select,chain.eq,chain.order]) fn.mockReturnValue(chain); m.from.mockReturnValue(chain); });
it("keeps only the newest version in each series and preserves uncontacted questions", async () => {
  m.result.mockResolvedValue({ data: [{id:"new",idea_id:"idea",series_id:"series",question:"当前问题",deferred_questions:["要问谁"],recheck_on:null},{id:"old",idea_id:"idea",series_id:"series",question:"旧问题",deferred_questions:["旧问题"],recheck_on:null}], error:null });
  const result = await loadDeferredExperimentQuestions("owner"); expect(result.items).toHaveLength(1); expect(result.items[0].questions).toEqual(["要问谁"]);
});
it("degrades only for its own missing table and propagates other database errors", async () => {
  m.result.mockResolvedValue({data:null,error:{code:"PGRST205",message:"idea_experiments missing"}}); expect((await loadDeferredExperimentQuestions("owner")).available).toBe(false);
  m.result.mockResolvedValue({data:null,error:{code:"57014",message:"query timeout"}}); await expect(loadDeferredExperimentQuestions("owner")).rejects.toThrow("query timeout");
});
