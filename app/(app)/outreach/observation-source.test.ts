import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), insert: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.auth } }) }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({ insert: m.insert }) } }));
vi.mock("@/lib/domains/observations/search/outreach", () => ({ loadSearchOutreachDraft: m.draft }));
vi.mock("@/lib/ai", () => ({ generateOutreachStrategy: vi.fn(), challengeOutreachDimension: vi.fn(), polishOutreachDraft: vi.fn() }));
import { createCanvas } from "./actions";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DECISION_OBSERVATIONS_ENABLED", "true");
  m.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  m.draft.mockResolvedValue({ runId: "run", ideaId: "owned-idea" });
  m.single.mockResolvedValue({ data: { id: "canvas" }, error: null }); m.insert.mockReturnValue({ select: () => ({ single: m.single }) });
});
it("rechecks source ownership when creating the canvas and derives its idea binding on the server", async () => {
  await createCanvas({ title: "核对问题", use_case: "startup", scenario: "用户确认的提纲", source_id: "spoofed", source_type: "company", source_observation_run_id: "run" });
  expect(m.draft).toHaveBeenCalledWith("owner", "run");
  expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner", source_id: "owned-idea", source_type: "idea", scenario: expect.stringContaining("观察来源（已核对归属）：run") }));
});
it("does not create a canvas when source access is denied or feature disabled", async () => {
  m.draft.mockRejectedValue(new Error("不可访问"));
  await expect(createCanvas({ title: "核对", use_case: "startup", scenario: "", source_observation_run_id: "run" })).rejects.toThrow();
  expect(m.insert).not.toHaveBeenCalled();
  vi.stubEnv("DECISION_OBSERVATIONS_ENABLED", "false");
  await expect(createCanvas({ title: "核对", use_case: "startup", scenario: "", source_observation_run_id: "run" })).rejects.toThrow();
});
