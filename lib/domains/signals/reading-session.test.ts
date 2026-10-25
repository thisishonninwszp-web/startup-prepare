import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: mocks.from } }));
import { loadReadingSession, saveReadingStop, saveReadingOpen } from "./reading-session";

const id = "11111111-1111-4111-8111-111111111111";
function query(result: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn(), upsert: vi.fn(), maybeSingle: vi.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.in.mockReturnValue(q); q.order.mockReturnValue(q); q.range.mockResolvedValue(result);
  q.maybeSingle.mockResolvedValue(result); q.upsert.mockResolvedValue(result);
  return q;
}
beforeEach(() => vi.clearAllMocks());
describe("用户的阅读记录", () => {
  it("两个查询均限制当前用户，打开状态仅查询当前报告", async () => {
    const stop = query({ data: null, error: null });
    const opens = query({ data: [{ signal_id: id }], error: null });
    mocks.from.mockImplementation((name) => name === "signal_reading_sessions" ? stop : opens);
    const state = await loadReadingSession("viewer", "2026-10-25", [id]);
    expect(stop.eq).toHaveBeenCalledWith("user_id", "viewer");
    expect(opens.eq).toHaveBeenCalledWith("user_id", "viewer");
    expect(opens.in).toHaveBeenCalledWith("signal_id", [id]);
    expect(state.openedIds).toEqual([id]);
    expect(state.available).toBe(true);
  });
  it("缺少迁移明确返回不可保存，其他数据库错误抛出", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: { code: "42P01", message: "relation signal_reading_sessions does not exist" } }));
    expect((await loadReadingSession("viewer", "2026-10-25", [])).available).toBe(false);
    mocks.from.mockReturnValue(query({ data: null, error: { code: "42501", message: "permission denied" } }));
    await expect(loadReadingSession("viewer", "2026-10-25", [])).rejects.toThrow("permission denied");
  });
  it("结束保存个人快照，写入失败不会返回成功", async () => {
    const q = query({ error: null }); mocks.from.mockReturnValue(q);
    await saveReadingStop("viewer", "2026-10-25", [id]);
    expect(q.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "viewer", report_date: "2026-10-25", signal_ids: [id] }), { onConflict: "user_id,report_date" });
    mocks.from.mockReturnValue(query({ error: { message: "write failed" } }));
    await expect(saveReadingStop("viewer", "2026-10-25", [id])).rejects.toThrow("write failed");
  });
  it("打开同步失败必须抛错，不能把本次展开伪装成持久化成功", async () => {
    const q = query({ error: null }); mocks.from.mockReturnValue(q);
    await saveReadingOpen("viewer", id);
    expect(q.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "viewer", signal_id: id, via: "report" }), { onConflict: "user_id,signal_id,opened_on", ignoreDuplicates: true });
    mocks.from.mockReturnValue(query({ error: { message: "network offline" } }));
    await expect(saveReadingOpen("viewer", id)).rejects.toThrow("network offline");
  });
  it("打开记录超过一页时仍找得到较早打开的精选", async () => {
    const stop = query({ data: null, error: null }); const opens = query({ data: [], error: null });
    opens.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => ({ signal_id: "recent" })), error: null })
      .mockResolvedValueOnce({ data: [{ signal_id: id }], error: null });
    mocks.from.mockImplementation((name) => name === "signal_reading_sessions" ? stop : opens);
    expect((await loadReadingSession("viewer", "2026-10-25", [id])).openedIds).toContain(id);
    expect(opens.range).toHaveBeenCalledWith(1000, 1999);
  });
});
