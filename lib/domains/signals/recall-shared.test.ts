import { describe, expect, it } from "vitest";
import { addDays, nextInterval } from "./recall-shared";

describe("回想的间隔", () => {
  it("记得的越隔越久，模糊的稍微拉长，忘了的回到一周；最长一年", () => {
    expect(nextInterval(7, "remembered")).toBe(18);
    expect(nextInterval(18, "remembered")).toBe(45);
    expect(nextInterval(7, "vague")).toBe(8);
    expect(nextInterval(200, "forgot")).toBe(7);
    expect(nextInterval(300, "remembered")).toBe(365);
  });
  it("日子往后数", () => {
    expect(addDays("2026-10-23", 18)).toBe("2026-11-10");
  });
});
