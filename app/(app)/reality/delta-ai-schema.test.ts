import { describe, expect, it } from "vitest";
import { REALITY_DELTA_RESPONSE_SCHEMA } from "./delta-ai-schema";

describe("reality delta response schema", () => {
  it("requires every change collection to contain strings", () => {
    for (const key of [
      "added_facts",
      "revised_interpretations",
      "resolved_unknowns",
      "new_unknowns",
      "emotion_changes",
    ] as const) {
      expect(REALITY_DELTA_RESPONSE_SCHEMA.properties[key]).toMatchObject({
        type: "array",
        items: { type: "string" },
      });
    }
  });

  it("requires the complete delta object and rejects extra fields", () => {
    expect(REALITY_DELTA_RESPONSE_SCHEMA.required).toEqual([
      "added_facts",
      "revised_interpretations",
      "resolved_unknowns",
      "new_unknowns",
      "emotion_changes",
      "previous_path_result",
      "change_reason",
    ]);
    expect(REALITY_DELTA_RESPONSE_SCHEMA.additionalProperties).toBe(false);
  });
});
