import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFLECTION_CATEGORIES,
  applyGrayTimeRules,
  buildFullDaySlots,
  getMonthlyPeriod,
  getMonthlyReviewDate,
  getWeeklyPeriod,
  normalizeAiTimelineCategories,
  parseDailyTimeline,
  parseMonthlyRetrospective,
  parseRetrospectiveQuestions,
  parseWeeklyRetrospective,
  validatePredictionDueDate,
} from "./types";

describe("daily time mirror", () => {
  it("accepts only ordered half-hour blocks inside a 24-hour day", () => {
    const timeline = parseDailyTimeline({
      blocks: [
        {
          start_slot: 14,
          end_slot: 16,
          event: "早餐与整理房间",
          category_key: "life",
          time_basis: "explicit",
        },
        {
          start_slot: 18,
          end_slot: 21,
          event: "处理客户邮件",
          category_key: "business",
          time_basis: "approximate",
        },
      ],
      ambiguities: ["处理客户邮件的结束时间不明确"],
    });
    expect(timeline.blocks).toHaveLength(2);
    expect(() =>
      parseDailyTimeline({
        blocks: [
          {
            start_slot: 3.5,
            end_slot: 5,
            event: "无法落在半小时格",
            category_key: "unknown",
            time_basis: "approximate",
          },
        ],
        ambiguities: [],
      })
    ).toThrow("slot");
  });

  it("rejects overlapping primary activities", () => {
    expect(() =>
      parseDailyTimeline({
        blocks: [
          {
            start_slot: 10,
            end_slot: 14,
            event: "工作",
            category_key: "business",
            time_basis: "explicit",
          },
          {
            start_slot: 13,
            end_slot: 15,
            event: "通话",
            category_key: "relationship",
            time_basis: "explicit",
          },
        ],
        ambiguities: [],
      })
    ).toThrow("重叠");
  });

  it("keeps every unmentioned half hour unknown", () => {
    const slots = buildFullDaySlots([
      {
        start_slot: 20,
        end_slot: 22,
        event: "散步",
        category_key: "recovery",
        time_basis: "explicit",
      },
    ]);
    expect(slots).toHaveLength(48);
    expect(slots[19].category_key).toBe("unknown");
    expect(slots[20].event).toBe("散步");
    expect(slots[22].category_key).toBe("unknown");
  });

  it("marks gray time only when a user keyword rule matches", () => {
    const [matched, recovery] = applyGrayTimeRules(
      [
        {
          start_slot: 30,
          end_slot: 32,
          event: "无意识刷短视频",
          category_key: "life",
          time_basis: "explicit",
        },
        {
          start_slot: 32,
          end_slot: 34,
          event: "午睡恢复",
          category_key: "recovery",
          time_basis: "explicit",
        },
      ],
      ["刷短视频"]
    );
    expect(matched.category_key).toBe("gray");
    expect(recovery.category_key).toBe("recovery");
  });

  it("never accepts gray or unknown category guesses directly from AI", () => {
    const [grayGuess, invalidGuess] = normalizeAiTimelineCategories(
      [
        {
          start_slot: 1,
          end_slot: 2,
          event: "浏览网页",
          category_key: "gray",
          time_basis: "approximate",
        },
        {
          start_slot: 2,
          end_slot: 3,
          event: "其他",
          category_key: "productive",
          time_basis: "approximate",
        },
      ],
      ["business", "life", "gray", "unknown"]
    );
    expect(grayGuess.category_key).toBe("unknown");
    expect(invalidGuess.category_key).toBe("unknown");
  });

  it("provides neutral default categories without productivity scores", () => {
    expect(DEFAULT_REFLECTION_CATEGORIES.map((item) => item.key)).toEqual([
      "business",
      "life",
      "relationship",
      "growth",
      "recovery",
      "gray",
      "unknown",
    ]);
  });
});

describe("weekly retrospective", () => {
  const valid = {
    expected: ["本周完成3次顾客接触"],
    actual: ["完成1次顾客接触"],
    gaps: [
      {
        statement: "真实接触少于原计划",
        cause: "execution",
        evidence_ids: ["validation:v1"],
      },
    ],
    hindsight_risks: ["用临时事务解释全部偏差"],
    contradictions: ["说客户最重要，但把时间用于内部整理"],
    unknowns: ["两次未联系的具体阻力"],
    life_business_conflicts: ["恢复时间不足影响事业判断"],
    rule: "安排验证前，先删除一个内部整理任务",
    commitment: "联系一位拒绝过的顾客",
    prediction: {
      text: "对方会说出至少一个当前替代方案",
      due_date: "2026-07-05",
    },
  };

  it("requires a rule, real action, and dated prediction", () => {
    expect(parseWeeklyRetrospective(valid).rule).toContain("验证");
    expect(() =>
      parseWeeklyRetrospective({ ...valid, commitment: "" })
    ).toThrow("commitment");
  });

  it("allows only the five explicit gap causes", () => {
    expect(() =>
      parseWeeklyRetrospective({
        ...valid,
        gaps: [{ ...valid.gaps[0], cause: "personality" }],
      })
    ).toThrow("cause");
  });

  it("limits diagnostic follow-up to one through three questions", () => {
    expect(
      parseRetrospectiveQuestions({
        questions: ["为什么没有联系？", "当时优先做了什么？"],
        missing_evidence: ["未联系时的具体记录"],
        ready_to_finalize: false,
      }).questions
    ).toHaveLength(2);
    expect(() =>
      parseRetrospectiveQuestions({
        questions: ["1", "2", "3", "4"],
        missing_evidence: [],
        ready_to_finalize: false,
      })
    ).toThrow("questions");
  });

  it("requires the feedback prediction to mature after the reviewed week", () => {
    expect(() => validatePredictionDueDate("2026-06-28", "2026-06-28")).toThrow(
      "晚于"
    );
    expect(() =>
      validatePredictionDueDate("2026-07-05", "2026-06-28")
    ).not.toThrow();
  });
});

describe("monthly retrospective", () => {
  it("preserves counterexamples and requires an explicit rule decision", () => {
    const result = parseMonthlyRetrospective({
      repeated_patterns: [
        {
          pattern: "内部整理挤占顾客接触",
          evidence_ids: ["weekly:w1"],
          counterexamples: ["第三周先接触顾客后仍完成整理"],
        },
      ],
      invalidated_rules: ["每天都必须清空收件箱"],
      life_business_conflicts: ["睡眠减少后判断更急躁"],
      only_focus: "先完成真实接触再增加分析",
      rule_decision: {
        action: "revise",
        rule_id: "rule-1",
        text: "每周先完成一次真实接触，再整理内部资料",
      },
    });
    expect(result.repeated_patterns[0].counterexamples).toHaveLength(1);
    expect(result.rule_decision.action).toBe("revise");
  });
});

describe("retrospective periods", () => {
  it("ends a weekly period on the configured review weekday", () => {
    expect(getWeeklyPeriod("2026-06-24", 0)).toEqual({
      start: "2026-06-22",
      end: "2026-06-28",
    });
  });

  it("uses calendar month boundaries for monthly review", () => {
    expect(getMonthlyPeriod("2026-02-12")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("uses the final configured review weekday as monthly due date", () => {
    expect(getMonthlyReviewDate("2026-06-12", 0)).toBe("2026-06-28");
  });
});
