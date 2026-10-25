import { describe, expect, it } from "vitest";
import { readingSummary, validReadingDate, readingSnapshot } from "./reading-session-shared";

describe("每日阅读的边界", () => {
  it("展开记录只计算当前精选且不重复计数，不据此宣称读完", () => {
    expect(readingSummary(["a", "b", "a"], ["a", "old", "a"], null)).toEqual({ total: 2, opened: 1, remaining: 1, added: 0, stopped: false });
  });
  it("主动结束后的新精选单独提示，移除条目不算新增", () => {
    expect(readingSummary(["a", "c"], ["a"], ["a", "b"])).toEqual({ total: 2, opened: 1, remaining: 1, added: 1, stopped: true });
    expect(readingSummary(["a"], [], ["a", "b"]).added).toBe(0);
  });
  it("空报告不会被算作已经结束", () => {
    expect(readingSummary([], [], null)).toEqual({ total: 0, opened: 0, remaining: 0, added: 0, stopped: false });
  });
  it("日期验证拒绝不存在的日期与越界值", () => {
    expect(validReadingDate("2026-10-25", "2026-10-25")).toBe(true);
    expect(validReadingDate("2026-02-30", "2026-10-25")).toBe(false);
    expect(validReadingDate("2026-10-26", "2026-10-25")).toBe(false);
    expect(validReadingDate("not-date", "2026-10-25")).toBe(false);
  });
  it("结束时快照只接受服务器当日精选，去掉客户端伪造和重复的ID", () => {
    expect(readingSnapshot(["b", "private", "a", "b"], ["a", "b", "c"])).toEqual(["b", "a"]);
    expect(() => readingSnapshot([], ["a"])).toThrow("精选");
  });
});
