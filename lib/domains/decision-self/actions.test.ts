import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), target: vi.fn(), links: vi.fn(), ai: vi.fn(), save: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: mocks.auth } }) }));
vi.mock("@/lib/ai", () => ({ challengeWithSelf: mocks.ai }));
vi.mock("./queries", () => ({ requireSelfTarget: mocks.target, getLinkedSelfRecords: mocks.links, setSelfLink: mocks.save, getSelfRecord: vi.fn(), getSelfContextState: vi.fn() }));
import { questionDecisionWithSelf, changeDecisionSelfLink } from "./actions";
const target = { type: "idea" as const, id: "11111111-1111-4111-8111-111111111111" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ data: { user: { id: "me" } } });
  mocks.target.mockResolvedValue({ title: "当前想法", context: "服务端的真实决策内容" });
});
describe("self decision server actions", () => {
  it("requires authentication before saving or running AI", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await questionDecisionWithSelf(target)).error).toContain("登录");
    expect((await changeDecisionSelfLink(target, { type: "self_deeds", id: target.id }, true)).error).toContain("登录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("does not invoke AI when the server reports a locked idea", async () => {
    mocks.target.mockRejectedValue(new Error("请先记录真实接触"));
    expect((await questionDecisionWithSelf(target)).error).toContain("真实接触");
    expect(mocks.target).toHaveBeenCalledWith("me", target, true);
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("does not silently discard an unavailable linked source", async () => {
    mocks.links.mockResolvedValue([{ type: "self_deeds", id: target.id, record: null }]);
    expect((await questionDecisionWithSelf(target)).error).toContain("失效记录");
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("uses fresh server records and returns the exact source snapshot with the reply", async () => {
    const record = { type: "self_deeds", id: target.id, title: "真实经历", text: "已修改的原文", date: "2026-09-06", href: "/self" };
    mocks.links.mockResolvedValue([{ ...record, record }]);
    mocks.ai.mockResolvedValue({ questions: [] });
    const response = await questionDecisionWithSelf(target);
    expect(mocks.ai).toHaveBeenCalledWith("服务端的真实决策内容", [record]);
    expect(response.data?.records).toEqual([record]);
  });
});
