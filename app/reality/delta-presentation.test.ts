import { describe, expect, it } from "vitest";
import {
  REALITY_DELTA_PRESENTATION,
  getRealityDeltaClasses,
} from "./delta-presentation";

describe("reality delta presentation", () => {
  it("assigns a distinct semantic color to every change type", () => {
    expect(REALITY_DELTA_PRESENTATION.added_facts.accent).toBe("emerald");
    expect(REALITY_DELTA_PRESENTATION.revised_interpretations.accent).toBe(
      "amber"
    );
    expect(REALITY_DELTA_PRESENTATION.resolved_unknowns.accent).toBe("sky");
    expect(REALITY_DELTA_PRESENTATION.new_unknowns.accent).toBe("rose");
    expect(REALITY_DELTA_PRESENTATION.emotion_changes.accent).toBe("violet");
  });

  it("uses neutral classes when a group has no changes", () => {
    expect(getRealityDeltaClasses("new_unknowns", false)).toEqual({
      card: "border-border bg-muted/30",
      label: "text-muted-foreground",
      badge: "bg-muted text-muted-foreground",
    });
  });
});
