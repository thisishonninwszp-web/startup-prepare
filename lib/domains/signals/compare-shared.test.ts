import { describe, expect, it } from "vitest";
import { displayName, headToHead, scoresByUser } from "./compare-shared";

describe("一起练", () => {
  const rows = [
    { user: "a", question: "q1", p: 0.9, y: true },
    { user: "b", question: "q1", p: 0.6, y: true },
    { user: "a", question: "q2", p: 0.3, y: false },
    { user: "b", question: "q2", p: 0.3, y: false },
    { user: "b", question: "q3", p: 0.8, y: false },
  ];
  it("两个人都答过的题里谁更近；只有一个人答过的不算", () => {
    expect(headToHead(rows, "a", "b")).toEqual({ other: "b", n: 2, meCloser: 1, otherCloser: 0, tie: 1 });
  });
  it("满 10 道才给分", () => {
    expect(scoresByUser(rows, ["a", "b"]).map((s) => [s.user, s.n, s.brier])).toEqual([
      ["a", 2, null],
      ["b", 3, null],
    ]);
  });
  it("名字取邮箱 @ 前面那段", () => {
    expect(displayName("taro@example.com")).toBe("taro");
  });
});
