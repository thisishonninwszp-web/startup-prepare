import { describe, expect, it } from "vitest";
import {
  assertClosureDueDate,
  mergeClosureDraftKeepingEdits,
  closureNeedsReconfirmation,
  isClosureDue,
  normalizeClosureResolution,
  normalizeReplacementReason,
  parseRealityClosureDraft,
  pathTypeToClosureMode,
  type RealityClosureDraft,
} from "./closure";
import { fingerprintClosureSource } from "./closure-source";
import {
  allowedClosureBasisRefs,
  assembleClosureSource,
  validateClosureAgainstSource,
  validateClosureBasisRefs,
  type RealityClosureSourceSnapshot,
} from "./closure-source";

const validDraft: RealityClosureDraft = {
  mode: "verify",
  decision: "先验证顾客是否仍在主动寻找替代方案",
  critical_unknown: "顾客是否愿意为解决这个问题改变现有做法",
  next_action: "联系一位最近放弃试用的顾客，只问他现在如何解决",
  completion_criterion: "完成一次真实对话并保存对方原话",
  expected_feedback: "知道顾客当前替代方案以及不切换的原因",
  due_on: "2026-07-02",
  rejected_alternative_reason: "现在直接开发仍缺少顾客行为证据",
  direction_change_reason: null,
  wait_signal: null,
  basis_refs: ["reality:unknowns", "bayesian:belief-1"],
};

describe("parseRealityClosureDraft", () => {
  it("accepts exactly one grounded closure", () => {
    expect(parseRealityClosureDraft(validDraft)).toEqual(validDraft);
  });

  it("requires a reopening signal when the decision is to wait", () => {
    expect(() =>
      parseRealityClosureDraft({
        ...validDraft,
        mode: "wait",
        wait_signal: null,
      })
    ).toThrow("wait_signal");
  });

  it("rejects scoring and success-rate language", () => {
    expect(() =>
      parseRealityClosureDraft({
        ...validDraft,
        score: 8,
      })
    ).toThrow();
    expect(() =>
      parseRealityClosureDraft({
        ...validDraft,
        decision: "成功率大约80%，所以继续",
      })
    ).toThrow();
  });

  it("requires at least one unique source reference", () => {
    expect(() =>
      parseRealityClosureDraft({ ...validDraft, basis_refs: [] })
    ).toThrow("basis_refs");
    expect(() =>
      parseRealityClosureDraft({
        ...validDraft,
        basis_refs: ["reality:facts", "reality:facts"],
      })
    ).toThrow("basis_refs");
  });
});

describe("closure dates and direction", () => {
  it("requires a future ISO date", () => {
    expect(() => assertClosureDueDate("2026-06-29", "2026-06-29")).toThrow();
    expect(() => assertClosureDueDate("29/06/2026", "2026-06-29")).toThrow();
    expect(() => assertClosureDueDate("2026-06-30", "2026-06-29")).not.toThrow();
  });

  it("maps the initial path into the matching closure mode", () => {
    expect(pathTypeToClosureMode("investigate")).toBe("verify");
    expect(pathTypeToClosureMode("act")).toBe("act");
    expect(pathTypeToClosureMode("wait")).toBe("wait");
  });
});

describe("closure lifecycle input", () => {
  it("accepts only binary execution outcomes with a reality note", () => {
    expect(normalizeClosureResolution("completed", "完成了一次访谈")).toEqual({
      outcome: "completed",
      note: "完成了一次访谈",
    });
    expect(() => normalizeClosureResolution("failed", "没做")).toThrow();
    expect(() => normalizeClosureResolution("not_completed", " ")).toThrow();
  });

  it("requires a reason before replacing the current next move", () => {
    expect(normalizeReplacementReason(" 客户取消了访谈 ")).toBe(
      "客户取消了访谈"
    );
    expect(() => normalizeReplacementReason("")).toThrow();
  });

  it("requires reconfirmation after a newer reality version appears", () => {
    const closure = {
      source_version_id: "version-1",
      events: [],
    };
    expect(closureNeedsReconfirmation(closure, "version-2")).toBe(true);
    expect(
      closureNeedsReconfirmation(
        {
          ...closure,
          events: [
            {
              event_type: "reconfirmed",
              reality_version_id: "version-2",
            },
          ],
        },
        "version-2"
      )
    ).toBe(false);
  });

  it("marks the current move due on and after its due date", () => {
    expect(isClosureDue("2026-06-30", "2026-06-29")).toBe(false);
    expect(isClosureDue("2026-06-30", "2026-06-30")).toBe(true);
    expect(isClosureDue("2026-06-30", "2026-07-01")).toBe(true);
  });
});

describe("closure draft freshness", () => {
  it("creates the same fingerprint regardless of object key order", () => {
    expect(fingerprintClosureSource({ b: 2, a: { y: 2, x: 1 } })).toBe(
      fingerprintClosureSource({ a: { x: 1, y: 2 }, b: 2 })
    );
  });

  it("keeps edited fields when a fresh draft arrives", () => {
    const refreshed = {
      ...validDraft,
      decision: "新建议",
      next_action: "新动作",
    };
    expect(
      mergeClosureDraftKeepingEdits(
        { ...validDraft, next_action: "用户改写的动作" },
        refreshed,
        new Set(["next_action"])
      )
    ).toEqual({
      ...refreshed,
      next_action: "用户改写的动作",
    });
  });
});

describe("closure source references", () => {
  const source = {
    reality: {
      realityCase: { id: "case-1", title: "增长停滞", context: "business" },
      version: {
        id: "version-1",
        version_no: 1,
        created_at: "2026-06-29T00:00:00.000Z",
      },
      map: {
        topic: "增长停滞",
        emotions: [],
        facts: [{ statement: "本月新增为零", source: "后台" }],
        interpretations: ["渠道失效"],
        unknowns: ["顾客为何不回复"],
        constraints: {
          fixed: [],
          influenceable: ["访谈方式"],
          actionable_now: ["联系顾客"],
        },
        contradictions: ["没有回复不等于没有需求"],
        paths: [],
      },
      selected_path: null,
      custom_action: null,
      selection_reason: null,
    },
    reasoning: {
      bayesian: [
        {
          id: "belief-1",
          question: "渠道是否失效",
          prior: 0.5,
          current_posterior: 0.4,
          updates: [],
        },
      ],
      fermi: [
        {
          id: "estimate-1",
          question: "可访谈人数",
          final_low: 3,
          final_high: 8,
          unit: "人",
          components: [],
        },
      ],
      reframing: [
        {
          id: "session-1",
          topic_text: "是否继续",
          context_note: "",
          frames: [],
        },
      ],
    },
  } as unknown as RealityClosureSourceSnapshot;

  it("allows reality sections and only linked reasoning ids", () => {
    expect(allowedClosureBasisRefs(source)).toContain("reality:unknowns");
    expect(allowedClosureBasisRefs(source)).not.toContain("reality:emotions");
    expect(allowedClosureBasisRefs(source)).toContain("bayesian:belief-1");
    expect(allowedClosureBasisRefs(source)).toContain("fermi:estimate-1");
    expect(allowedClosureBasisRefs(source)).toContain("reframing:session-1");
  });

  it("allows only focused inquiries included in the closure snapshot", () => {
    const withFocus = {
      ...source,
      focused_inquiries: [
        {
          id: "focus-1",
          anchor: { text: "极限感" },
          summary: { updated_understanding: "疲惫可能影响判断" },
        },
      ],
    } as unknown as RealityClosureSourceSnapshot;
    expect(allowedClosureBasisRefs(withFocus)).toContain("focus:focus-1");
    expect(
      allowedClosureBasisRefs({ ...withFocus, focused_inquiries: [] })
    ).not.toContain("focus:focus-1");
  });

  it("rejects a citation that is not in the closure source", () => {
    expect(() =>
      validateClosureBasisRefs(
        { ...validDraft, basis_refs: ["bayesian:other-user-belief"] },
        source
      )
    ).toThrow("引用");
    expect(() => validateClosureBasisRefs(validDraft, source)).not.toThrow();
  });

  it("requires a reason when the final mode changes the initial direction", () => {
    const withInitialAct = {
      ...source,
      reality: {
        ...source.reality,
        selected_path: { type: "act" },
      },
    } as RealityClosureSourceSnapshot;
    expect(() =>
      validateClosureAgainstSource(validDraft, withInitialAct, "2026-06-29")
    ).toThrow("改变");
    expect(() =>
      validateClosureAgainstSource(
        { ...validDraft, direction_change_reason: "新证据改变了判断" },
        withInitialAct,
        "2026-06-29"
      )
    ).not.toThrow();
  });

  it("excludes reasoning rows that are not linked to the selected version", () => {
    const assembled = assembleClosureSource({
      reality: source.reality,
      links: [
        {
          bayesian_belief_id: "belief-1",
          fermi_estimate_id: null,
          reframing_session_id: null,
        },
      ],
      beliefs: [
        { id: "belief-1", question: "linked", prior: 0.4 },
        { id: "belief-other", question: "unlinked", prior: 0.9 },
      ],
      bayesianUpdates: [],
      estimates: [],
      fermiComponents: [],
      sessions: [],
      reframingFrames: [],
    });
    expect(assembled.reasoning.bayesian.map((item) => item.id)).toEqual([
      "belief-1",
    ]);
  });
});
