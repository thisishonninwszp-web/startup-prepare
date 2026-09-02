import { describe, expect, it } from "vitest";
import { SKILL_ICONS } from "@/app/(app)/self/skill-icons";
import { SKILL_DEFS } from "./skills";

describe("skill icons", () => {
  it("gives every skill its own icon entry", () => {
    const missing = SKILL_DEFS.filter((def) => !SKILL_ICONS[def.key]).map(
      (def) => def.key
    );
    expect(missing).toEqual([]);
  });

  it("carries no icon for a skill that no longer exists", () => {
    const keys = new Set(SKILL_DEFS.map((def) => def.key));
    expect(Object.keys(SKILL_ICONS).filter((key) => !keys.has(key))).toEqual([]);
  });
});
