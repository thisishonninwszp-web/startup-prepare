import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: mocks.from } }));

import { appendJudgmentUpdate, listJudgmentUpdates } from "./judgment-updates";
import { parseJudgmentUpdate, opposingEvidence } from "./judgment-updates-shared";

function query(result: { data?: unknown; error?: unknown } = {}) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "insert", "single", "maybeSingle"]) q[method] = vi.fn().mockReturnValue(q);
  Object.assign(q, { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...result }).then(resolve) });
  return q;
}

beforeEach(() => vi.clearAllMocks());

describe("judgment update input", () => {
  it("requires a new judgment and reason and keeps a real HTTP source optional", () => {
    expect(parseJudgmentUpdate({ judgment: "  新信息改变了我的判断  ", reason: "  新公布的订单减少了  ", sourceUrl: "" })).toEqual({ judgment: "新信息改变了我的判断", reason: "新公布的订单减少了", source_url: null });
    expect(parseJudgmentUpdate({ judgment: "新的判断", reason: "新的依据", sourceUrl: "https://example.com/news" }).source_url).toBe("https://example.com/news");
    expect(() => parseJudgmentUpdate({ judgment: "短", reason: "新的依据" })).toThrow("判断");
    expect(() => parseJudgmentUpdate({ judgment: "新的判断", reason: "" })).toThrow("原因");
  });

  it("rejects dangerous or malformed source URLs and overlong text", () => {
    for (const sourceUrl of ["javascript:alert(1)", "data:text/plain,test", "not a url", "https://user:secret@example.com/"]) {
      expect(() => parseJudgmentUpdate({ judgment: "新的判断", reason: "新的依据", sourceUrl })).toThrow("链接");
    }
    expect(() => parseJudgmentUpdate({ judgment: "字".repeat(501), reason: "新的依据" })).toThrow("500");
  });
});

describe("append-only judgment history", () => {
  it("checks ownership before reading private history", async () => {
    const owner = query();
    mocks.from.mockReturnValueOnce(owner);
    await expect(listJudgmentUpdates("viewer", "someone-elses-judgment")).rejects.toThrow("无权");
    expect(owner.eq).toHaveBeenCalledWith("user_id", "viewer");
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("inserts a dated revision without touching the original judgment or prediction", async () => {
    const owner = query({ data: { id: "j" } });
    const saved = { id: "u", judgment_id: "j", judgment: "新的判断", reason: "新的依据", source_url: null, created_at: "2026-10-25T00:00:00Z" };
    const insert = query({ data: saved });
    mocks.from.mockReturnValueOnce(owner).mockReturnValueOnce(insert);
    expect(await appendJudgmentUpdate("me", "j", { judgment: "新的判断", reason: "新的依据" })).toEqual(saved);
    expect(insert.insert).toHaveBeenCalledWith({ user_id: "me", judgment_id: "j", judgment: "新的判断", reason: "新的依据", source_url: null });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["signal_judgments", "signal_judgment_updates"]);
  });

  it("reports database failures rather than displaying an empty history", async () => {
    mocks.from.mockReturnValueOnce(query({ data: { id: "j" } })).mockReturnValueOnce(query({ error: { message: "connection lost" } }));
    await expect(listJudgmentUpdates("me", "j")).rejects.toThrow("connection lost");
  });

  it("tells the user when the history migration has not been installed", async () => {
    mocks.from.mockReturnValueOnce(query({ data: { id: "j" } })).mockReturnValueOnce(query({ error: { code: "42P01", message: "relation signal_judgment_updates does not exist" } }));
    await expect(listJudgmentUpdates("me", "j")).rejects.toThrow("103");
  });
});

describe("opposing evidence", () => {
  it("highlights only verified contradiction records with a usable source", () => {
    const evidence = [
      { stance: "contradicts" as const, fact: "反方事实", excerpt: "原文摘录", url: "https://example.com/against", title: "原文" },
      { stance: "supports" as const, fact: "支持事实", excerpt: "摘录", url: "https://example.com/for", title: "原文" },
      { stance: "contradicts" as const, fact: "无出处的AI反驳", excerpt: "", url: "", title: "" },
    ];
    expect(opposingEvidence(evidence).map((e) => e.fact)).toEqual(["反方事实"]);
  });
});
