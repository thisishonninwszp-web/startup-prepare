import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), append: vi.fn(), own: vi.fn(), evidence: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: mocks.auth } }) }));
vi.mock("@/lib/domains/signals/judgment-updates", () => ({ listJudgmentUpdates: mocks.list, appendJudgmentUpdate: mocks.append, requireOwnJudgment: mocks.own }));
vi.mock("@/lib/domains/signals/practice", () => ({ checkOutcomeEvidence: mocks.evidence }));

import { appendJudgmentUpdateAction, checkJudgmentEvidenceAction, loadJudgmentUpdatesAction } from "./judgment-updates-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ data: { user: { id: "me" } } });
  mocks.own.mockResolvedValue(undefined);
});

describe("private judgment update actions", () => {
  it("requires login before reading, appending or requesting AI evidence", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect(await loadJudgmentUpdatesAction("j")).toMatchObject({ ok: false, message: "未登录" });
    expect(await appendJudgmentUpdateAction("j", { judgment: "新的判断", reason: "新的依据" })).toMatchObject({ ok: false });
    expect(await checkJudgmentEvidenceAction("j")).toMatchObject({ ok: false });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.evidence).not.toHaveBeenCalled();
  });

  it("uses the authenticated identity for a new dated history entry", async () => {
    const update = { id: "u", judgment: "新的判断" };
    mocks.append.mockResolvedValue(update);
    expect(await appendJudgmentUpdateAction("j", { judgment: "新的判断", reason: "新的依据" })).toEqual({ ok: true, update });
    expect(mocks.append).toHaveBeenCalledWith("me", "j", { judgment: "新的判断", reason: "新的依据" });
  });

  it("does not spend AI calls on someone else's judgment", async () => {
    mocks.own.mockRejectedValue(new Error("无权访问"));
    expect(await checkJudgmentEvidenceAction("other")).toMatchObject({ ok: false, message: "无权访问" });
    expect(mocks.evidence).not.toHaveBeenCalled();
  });

  it("returns grounded findings without treating AI criticism as evidence", async () => {
    const evidence = { checked_at: "2026-10-25T00:00:00Z", evidence: [] };
    mocks.evidence.mockResolvedValue(evidence);
    expect(await checkJudgmentEvidenceAction("j")).toEqual({ ok: true, evidence });
    expect(mocks.evidence).toHaveBeenCalledWith("me", "j");
  });
});
