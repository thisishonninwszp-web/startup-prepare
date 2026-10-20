import { describe, expect, it } from "vitest";
import { dueGaps } from "./info-gaps-shared";

describe("信息缺口：该拿了的", () => {
  it("dueGaps：还缺、而且截止到了的才算", () => {
    const gaps = [
      { status: "open" as const, due_on: "2026-10-19" },
      { status: "open" as const, due_on: "2026-10-20" },
      { status: "open" as const, due_on: "2026-10-30" },
      { status: "got" as const, due_on: "2026-10-01" },
    ];
    expect(dueGaps(gaps, "2026-10-20")).toBe(2);
  });
});
