import { describe, expect, it } from "vitest";
import {
  appendRealityUpdateMessage,
  assertPathNotSelected,
  assertOwnership,
  normalizeCreateRealityInput,
  normalizePathSelection,
  shouldStopRealityInterview,
} from "./validation";

describe("normalizeCreateRealityInput", () => {
  it("normalizes a global cross-context case and removes duplicate domains", () => {
    expect(
      normalizeCreateRealityInput({
        mode: "global",
        context: "cross",
        title: "  现在真正卡在哪里  ",
        initialStatement: "  我同时面对事业停滞和生活疲惫。 ",
        domains: ["健康", "客户", "健康", " "],
      })
    ).toEqual({
      mode: "global",
      context: "cross",
      title: "现在真正卡在哪里",
      initialStatement: "我同时面对事业停滞和生活疲惫。",
      domains: ["健康", "客户"],
    });
  });

  it("rejects an empty initial statement", () => {
    expect(() =>
      normalizeCreateRealityInput({
        mode: "specific",
        context: "personal",
        title: "课题",
        initialStatement: " ",
        domains: [],
      })
    ).toThrow("描述");
  });
});

describe("normalizePathSelection", () => {
  it("requires a review date for the wait path", () => {
    expect(() =>
      normalizePathSelection({
        pathIndex: 2,
        customAction: "",
        reason: "等待现实信息",
        reviewDueAt: "",
      })
    ).toThrow("复查日期");
  });

  it("accepts an ISO review date and trimmed custom action", () => {
    expect(
      normalizePathSelection({
        pathIndex: 0,
        customAction: "  访问一位客户  ",
        reason: "  缺少一手信息 ",
        reviewDueAt: "2030-01-02",
      })
    ).toMatchObject({
      pathIndex: 0,
      customAction: "访问一位客户",
      reason: "缺少一手信息",
    });
  });
});

describe("appendRealityUpdateMessage", () => {
  it("adds a reality update to the AI context", () => {
    const messages = [
      {
        role: "user" as const,
        content: "原始描述",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const result = appendRealityUpdateMessage(
      messages,
      "客户明确说预算被冻结",
      "2026-01-02T00:00:00.000Z"
    );
    expect(result.at(-1)?.content).toBe(
      "【现实更新】客户明确说预算被冻结"
    );
  });

  it("does not duplicate the same update during an AI retry", () => {
    const messages = [
      {
        role: "user" as const,
        content: "【现实更新】客户明确说预算被冻结",
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ];
    expect(
      appendRealityUpdateMessage(messages, "客户明确说预算被冻结")
    ).toHaveLength(1);
  });
});

describe("assertOwnership", () => {
  it("rejects a resource owned by another user", () => {
    expect(() =>
      assertOwnership("other-user", "current-user", "无权访问该课题")
    ).toThrow("无权访问该课题");
  });

  it("rejects a missing resource without exposing whether it exists", () => {
    expect(() =>
      assertOwnership(null, "current-user", "无权访问该课题")
    ).toThrow("无权访问该课题");
  });
});

describe("shouldStopRealityInterview", () => {
  const assistantMessage = {
    role: "assistant" as const,
    content: "依据是什么？",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("stops at six assistant rounds by default", () => {
    expect(
      shouldStopRealityInterview(Array(6).fill(assistantMessage), false)
    ).toBe(true);
  });

  it("allows an explicit continuation after the soft limit", () => {
    expect(
      shouldStopRealityInterview(Array(6).fill(assistantMessage), true)
    ).toBe(false);
  });
});

it("prevents overwriting a version's recorded path choice", () => {
  expect(() => assertPathNotSelected({ type: "act" })).toThrow(
    "已经记录过路径"
  );
});
