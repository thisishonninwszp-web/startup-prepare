import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), generate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.auth } }) }));
vi.mock("@/lib/domains/signals/events/research-ai", () => ({ generateResearch: m.generate }));
import { generateResearchAction } from "./research-ai-actions";
const input = { task: "dossier" as const, sourceIds: [], noteIds: [], consent: true, requestId: "request" };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SIGNAL_EVENTS_ENABLED", "true"); m.auth.mockResolvedValue({ data: { user: { id: "viewer" } } }); });
it("requires authentication and feature gate before generation", async () => {
  m.auth.mockResolvedValue({ data: { user: null } }); expect((await generateResearchAction("event", input)).ok).toBe(false); expect(m.generate).not.toHaveBeenCalled();
  vi.stubEnv("SIGNAL_EVENTS_ENABLED", "false"); expect((await generateResearchAction("event", input)).ok).toBe(false); expect(m.generate).not.toHaveBeenCalled();
});
it("passes authenticated identity and preserves provider error", async () => {
  m.generate.mockRejectedValue(new Error("所选引用不可核对")); expect(await generateResearchAction("event", input)).toEqual({ ok: false, message: "所选引用不可核对" }); expect(m.generate).toHaveBeenCalledWith("viewer", "event", input);
});
