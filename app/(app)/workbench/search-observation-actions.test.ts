import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.auth } }) }));
vi.mock("@/lib/domains/observations/queries", () => ({ getTask: m.get }));
vi.mock("@/lib/domains/observations/commands", () => ({ saveRun: m.save }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { saveSearchObservationRun } from "./search-observation-actions";
const input = { taskId: "task", taskVersionId: "v1", requestId: "request", provider: "trends_web" as const, rawText: "Week,a\n2026-01-04,0" };
beforeEach(() => {
  vi.stubEnv("DECISION_OBSERVATIONS_ENABLED", "true"); vi.clearAllMocks();
  m.auth.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  m.get.mockResolvedValue({ status: "ready", task: { object_id: "idea" }, versions: [{ id: "v1", config: { region: "JP", language: "ja", timeRange: "2026-01" } }] });
  m.save.mockResolvedValue({ id: "saved" });
});
it("reparses raw CSV on the server with the persisted task version collection conditions", async () => {
  await saveSearchObservationRun(input);
  expect(m.get).toHaveBeenCalledWith("owner", "task");
  expect(m.save.mock.calls[0][1].run).toMatchObject({ rawSnapshot: input.rawText, requestConditions: { region: "JP", language: "ja", timeframe: "2026-01" }, records: [{ value: 0 }] });
});
it("refuses unauthenticated or disabled requests before reading private tasks", async () => {
  vi.stubEnv("DECISION_OBSERVATIONS_ENABLED", "false");
  await expect(saveSearchObservationRun(input)).rejects.toThrow(); expect(m.get).not.toHaveBeenCalled();
  vi.stubEnv("DECISION_OBSERVATIONS_ENABLED", "true"); m.auth.mockResolvedValue({ data: { user: null } });
  await expect(saveSearchObservationRun(input)).rejects.toThrow(); expect(m.get).not.toHaveBeenCalled();
});
it("refuses missing tasks, unrelated versions, malformed rows and missing context", async () => {
  await expect(saveSearchObservationRun({ ...input, taskVersionId: "other" })).rejects.toThrow();
  await expect(saveSearchObservationRun({ ...input, rawText: "Week,a\ninvalid,5" })).rejects.toThrow();
  m.get.mockResolvedValue({ status: "ready", task: null, versions: [] });
  await expect(saveSearchObservationRun(input)).rejects.toThrow(); expect(m.save).not.toHaveBeenCalled();
});
