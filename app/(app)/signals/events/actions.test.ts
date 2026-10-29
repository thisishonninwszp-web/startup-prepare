import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), update: vi.fn(), include: vi.fn(), exclude: vi.fn(), list: vi.fn(), candidates: vi.fn(), history: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.auth } }) }));
vi.mock("@/lib/domains/signals/events/commands", () => ({ createEvent: m.create, updateEvent: m.update, includeSignal: m.include, excludeSignal: m.exclude }));
vi.mock("@/lib/domains/signals/events/queries", () => ({ listEvents: m.list, suggestMembers: m.candidates, listMembershipHistory: m.history }));
import { createEventAction, updateEventAction, includeSignalAction, excludeSignalAction, listEventsAction, loadCandidatesAction } from "./actions";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SIGNAL_EVENTS_ENABLED", "true");
  m.auth.mockResolvedValue({ data: { user: { id: "viewer" } } });
  m.create.mockResolvedValue({ id: "event" });
});
describe("事件档案操作的会话边界", () => {
  it("未登录不创建、抓取、关联或读取候选", async () => {
    m.auth.mockResolvedValue({ data: { user: null } });
    expect((await createEventAction({ title: "日银政策", scopeNote: "", requestId: "request" })).ok).toBe(false);
    expect((await loadCandidatesAction("event")).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled(); expect(m.candidates).not.toHaveBeenCalled();
  });
  it("新入口默认关闭时直接请求也不写数据", async () => {
    vi.stubEnv("SIGNAL_EVENTS_ENABLED", "false");
    expect((await createEventAction({ title: "日银政策", scopeNote: "", requestId: "request" })).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("归属使用会话身份，失败保持为失败", async () => {
    const input = { eventId: "event", signalId: "news", requestId: "request", note: "", occurred: null };
    m.include.mockRejectedValueOnce(new Error("来源已不可读取"));
    expect(await includeSignalAction(input)).toEqual({ ok: false, message: "来源已不可读取" });
    expect(m.include).toHaveBeenCalledWith("viewer", input);
    await excludeSignalAction({ eventId: "event", signalId: "news", requestId: "remove", note: "并非同一件事" });
    expect(m.exclude).toHaveBeenCalledWith("viewer", expect.objectContaining({ note: "并非同一件事" }));
  });
  it("列表只有本人档案，并把缺少结构作为明确状态传回", async () => {
    m.list.mockResolvedValue({ status: "missing-schema", items: [], nextCursor: null });
    expect(await listEventsAction("日银")).toEqual({ ok: true, data: { status: "missing-schema", items: [], nextCursor: null } });
    expect(m.list).toHaveBeenCalledWith("viewer", { search: "日银", limit: 20 });
  });
});

it("updates metadata with the authenticated viewer and propagates access failure", async () => {
  const input = { eventId: "event", title: "New name", scopeNote: "Changed scope" };
  m.update.mockRejectedValueOnce(new Error("无权修改"));
  expect(await updateEventAction(input)).toEqual({ ok: false, message: "无权修改" });
  expect(m.update).toHaveBeenCalledWith("viewer", input);
  m.auth.mockResolvedValueOnce({ data: { user: null } });
  expect((await updateEventAction(input)).ok).toBe(false);
  expect(m.update).toHaveBeenCalledTimes(1);
});
