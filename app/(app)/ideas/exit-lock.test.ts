import { describe, expect, it } from "vitest";
import { AI_LOCK_DAYS, daysUntilLock, isAiLocked } from "./types";

// 强制出口机制（宪法第 5 条）：这是产品灵魂，必须有回归测试锁住边界语义，
// 不能只靠 idea-detail.tsx / actions.ts 里手工核对日期。
describe("isAiLocked (强制出口机制)", () => {
  const day = 24 * 60 * 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it("只对「验证中」状态生效，其余状态永不锁定", () => {
    const staleDate = ago(10 * day);
    expect(isAiLocked("观察", staleDate)).toBe(false);
    expect(isAiLocked("假设", staleDate)).toBe(false);
    expect(isAiLocked("MVP候选", staleDate)).toBe(false);
    expect(isAiLocked("归档", staleDate)).toBe(false);
  });

  it(`「验证中」未超过 ${AI_LOCK_DAYS} 天不锁定`, () => {
    expect(isAiLocked("验证中", ago(2 * day))).toBe(false);
    expect(isAiLocked("验证中", ago(AI_LOCK_DAYS * day - 60_000))).toBe(false);
  });

  it(`「验证中」超过 ${AI_LOCK_DAYS} 天后锁定`, () => {
    expect(isAiLocked("验证中", ago(AI_LOCK_DAYS * day + 60_000))).toBe(true);
    expect(isAiLocked("验证中", ago(10 * day))).toBe(true);
  });

  it("daysUntilLock 随时间线性递减，锁定后为非正数", () => {
    expect(daysUntilLock(ago(0))).toBe(AI_LOCK_DAYS);
    expect(daysUntilLock(ago(1 * day))).toBe(AI_LOCK_DAYS - 1);
    expect(daysUntilLock(ago(AI_LOCK_DAYS * day))).toBeLessThanOrEqual(0);
  });
});
