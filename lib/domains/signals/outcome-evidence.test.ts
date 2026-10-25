import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), search: vi.fn(), plan: vi.fn(), extract: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/ai", () => ({ critiqueJudgment: vi.fn(), planOutcomeQueries: mocks.plan, extractStepEvidence: mocks.extract }));
vi.mock("@/lib/web-search", () => ({ webSearch: mocks.search }));
vi.mock("./article", () => ({ fetchArticleBody: vi.fn() }));
vi.mock("./analysis", () => ({ getSignalDetail: vi.fn() }));
vi.mock("./questions", () => ({ getQuestion: vi.fn() }));
vi.mock("./breakdown", () => ({ loadBriefPractice: vi.fn() }));
vi.mock("./users", () => ({ sharedViewFor: vi.fn() }));

import { checkOutcomeEvidence } from "./practice";

function query(data: unknown) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "single", "update"]) q[method] = vi.fn().mockReturnValue(q);
  Object.assign(q, { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) });
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plan.mockResolvedValue({ query: "support", counterQuery: "against" });
  mocks.from.mockReturnValue(query({ id: "j", news_title: "新闻", question: "q", judgment: "我的原判断", created_at: "2026-10-01T00:00:00Z", predictions: { due_at: "2026-12-01T00:00:00Z" } }));
  mocks.extract.mockResolvedValue([]);
});

describe("complete two-sided outcome evidence search", () => {
  it("does not replace previous evidence with an empty result if the counter search fails", async () => {
    mocks.search.mockImplementation(async (q: string) => { if (q === "against") throw new Error("provider unavailable"); return []; });
    await expect(checkOutcomeEvidence("me", "j")).rejects.toThrow("反对方向");
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("reports a partial check if the supporting search fails as well", async () => {
    mocks.search.mockImplementation(async (q: string) => { if (q === "support") throw new Error("timeout"); return []; });
    await expect(checkOutcomeEvidence("me", "j")).rejects.toThrow("支持方向");
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("does not claim to have checked both sides when no counter search was planned", async () => {
    mocks.plan.mockResolvedValue({ query: "support", counterQuery: "" });
    await expect(checkOutcomeEvidence("me", "j")).rejects.toThrow("反对方向");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("saves a genuine no-findings result only after both searches succeed", async () => {
    mocks.search.mockResolvedValue([]);
    const result = await checkOutcomeEvidence("me", "j");
    expect(result.evidence).toEqual([]);
    expect(mocks.search.mock.calls.map(([q]) => q)).toEqual(["support", "against"]);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});
