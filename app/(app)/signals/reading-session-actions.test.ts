import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), view: vi.fn(), report: vi.fn(), save: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.auth } }) }));
vi.mock("@/lib/domains/signals/users", () => ({ sharedViewFor: m.view }));
vi.mock("@/lib/domains/signals/brief", () => ({ tokyoToday: () => "2026-10-25" }));
vi.mock("@/lib/domains/signals/reading-session", () => ({ saveReadingStop: m.save }));
vi.mock("./queries", () => ({ getDailyReport: m.report }));
import { stopReadingAction } from "./reading-session-actions";
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ data: { user: { id: "viewer" } } });
  m.view.mockResolvedValue({ sourceUserId: "owner", shared: true });
  m.report.mockResolvedValue({ news: { items: [{ signal_id: "a" }, { signal_id: "extra", extra: true }] } });
});
describe("阅读终点服务端边界", () => {
  it("身份来自会话，共享正文不改变记录归属；拒绝伪造条目", async () => {
    expect(await stopReadingAction("2026-10-25", ["a", "private", "extra"])).toEqual({ ok: true });
    expect(m.report).toHaveBeenCalledWith("owner", "2026-10-25");
    expect(m.save).toHaveBeenCalledWith("viewer", "2026-10-25", ["a"]);
  });
  it("未登录不读报告也不写入", async () => {
    m.auth.mockResolvedValue({ data: { user: null } });
    expect((await stopReadingAction("2026-10-25", ["a"])).ok).toBe(false);
    expect(m.report).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
  });
  it("保存失败向用户报告，未来日期不写入", async () => {
    expect((await stopReadingAction("2026-10-26", ["a"])).ok).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
    m.save.mockRejectedValue(new Error("数据库写入失败"));
    expect(await stopReadingAction("2026-10-25", ["a"])).toEqual({ ok: false, message: "数据库写入失败" });
  });
});
