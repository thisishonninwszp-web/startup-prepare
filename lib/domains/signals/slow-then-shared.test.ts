import { describe, expect, it } from "vitest";
import { windFor, type SlowWind } from "./slow-then-shared";

describe("顺风逆风：某一样东西的", () => {
  const wind: SlowWind = {
    created_at: "2026-10-20T00:00:00Z",
    links: [
      { key: "working_age", dir: "tail", kind: "gap", ref: "s1", side: "japan", title: "a", why: "x" },
      { key: "usdjpy", dir: "head", kind: "gap", ref: "s1", side: "us", title: "a", why: "x" },
      { key: "usdjpy", dir: "head", kind: "idea", ref: "i1", title: "b", why: "y" },
    ],
  };
  it("windFor：差距按方向 + signal_id，想法按 id；没看过返回空", () => {
    expect(windFor(wind, "gap", "s1", "japan").map((l) => l.key)).toEqual(["working_age"]);
    expect(windFor(wind, "idea", "i1").map((l) => l.key)).toEqual(["usdjpy"]);
    expect(windFor(null, "idea", "i1")).toEqual([]);
  });
});
