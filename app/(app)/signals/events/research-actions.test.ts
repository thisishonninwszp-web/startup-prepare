import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ snapshots: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "viewer" } } }) } }) }));
vi.mock("@/lib/domains/signals/events/research", () => ({ appendResearch: vi.fn(), researchSnapshots: m.snapshots }));
import { connectionSourcesAction } from "./research-actions";
it("previews the same 10000-character target excerpt that generation can send", async () => {
  vi.stubEnv("SIGNAL_EVENTS_ENABLED", "true"); m.snapshots.mockResolvedValue([{ id: "source", captured_text: "x".repeat(10000) + "not sent" }]);
  const result = await connectionSourcesAction("target"); expect(result.ok).toBe(true); if (result.ok) expect(result.data[0].captured_text).toHaveLength(10000);
  expect(m.snapshots).toHaveBeenCalledWith("viewer", "target");
});
