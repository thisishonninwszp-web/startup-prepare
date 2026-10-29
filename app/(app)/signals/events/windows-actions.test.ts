import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), append: vi.fn(), check: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.auth } }) }));
vi.mock("@/lib/domains/signals/events/research", () => ({ loadResearch: m.load, appendResearch: m.append }));
vi.mock("@/lib/domains/signals/events/windows", () => ({ validateWindowUrl: (url: string) => new URL(url), checkWindow: m.check }));
import { addWindowAction, checkWindowAction } from "./windows-actions";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SIGNAL_EVENTS_ENABLED", "true");
  m.auth.mockResolvedValue({ data: { user: { id: "viewer" } } });
  m.load.mockResolvedValue({ available: true, entries: [{ id: "window", event_id: "event", user_id: "viewer", kind: "window", payload: { url: "https://example.com", field: "price", cadence: "manual" } }] });
  m.append.mockResolvedValue({ id: "saved" });
  m.check.mockResolvedValue({ status: "failed", url: "https://example.com", checkedAt: "now", error: "HTTP 500" });
});
describe("window action ownership and journals", () => {
  it("requires feature flag and session before fetching or appending", async () => {
    vi.stubEnv("SIGNAL_EVENTS_ENABLED", "false");
    expect((await checkWindowAction({ eventId: "event", windowId: "window", requestId: "r" })).ok).toBe(false);
    vi.stubEnv("SIGNAL_EVENTS_ENABLED", "true"); m.auth.mockResolvedValue({ data: { user: null } });
    expect((await addWindowAction({ eventId: "event", url: "https://example.com", field: "", cadence: "manual", requestId: "r" })).ok).toBe(false);
    expect(m.load).not.toHaveBeenCalled(); expect(m.append).not.toHaveBeenCalled(); expect(m.check).not.toHaveBeenCalled();
  });
  it.each([{ kind: "source", event_id: "event", user_id: "viewer" }, { kind: "window", event_id: "other", user_id: "viewer" }, { kind: "window", event_id: "event", user_id: "other" }])("refuses foreign/non-window references", async entry => {
    m.load.mockResolvedValue({ available: true, entries: [{ ...entry, id: "window", payload: {} }] });
    expect((await checkWindowAction({ eventId: "event", windowId: "window", requestId: "r" })).ok).toBe(false); expect(m.check).not.toHaveBeenCalled();
  });
  it("appends failed checks without replacing the prior history", async () => {
    expect((await checkWindowAction({ eventId: "event", windowId: "window", requestId: "r" })).ok).toBe(true);
    expect(m.load).toHaveBeenCalledWith("viewer", "event");
    expect(m.append).toHaveBeenCalledWith("viewer", "event", { kind: "window_check", subjectId: "window", requestId: "r", payload: expect.objectContaining({ status: "failed", error: "HTTP 500" }) });
  });
  it("keeps a journal write error as failure", async () => {
    m.append.mockRejectedValue(new Error("保存失败"));
    expect(await checkWindowAction({ eventId: "event", windowId: "window", requestId: "r" })).toEqual({ ok: false, message: "保存失败" });
  });
});

it("returns an already committed request without crawling or appending again", async () => {
  m.load.mockResolvedValue({ available: true, entries: [
    { id: "window", event_id: "event", user_id: "viewer", kind: "window", payload: { url: "https://example.com", field: "price" } },
    { id: "prior", event_id: "event", user_id: "viewer", kind: "window_check", subject_id: "window", client_request_id: "r", payload: { status: "success" } },
  ] });
  expect(await checkWindowAction({ eventId: "event", windowId: "window", requestId: "r" })).toEqual({ ok: true, data: { id: "prior" } });
  expect(m.check).not.toHaveBeenCalled(); expect(m.append).not.toHaveBeenCalled();
});
it("refuses a request ID already committed for another window", async () => {
  m.load.mockResolvedValue({ available: true, entries: [
    { id: "window", event_id: "event", user_id: "viewer", kind: "window", payload: { url: "https://example.com", field: "price" } },
    { id: "prior", event_id: "event", user_id: "viewer", kind: "window_check", subject_id: "other", client_request_id: "r", payload: {} },
  ] });
  expect((await checkWindowAction({ eventId: "event", windowId: "window", requestId: "r" })).ok).toBe(false);
  expect(m.check).not.toHaveBeenCalled(); expect(m.append).not.toHaveBeenCalled();
});
