const stringArraySchema = {
  type: "array",
  items: { type: "string" },
} as const;

export const REALITY_DELTA_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    added_facts: stringArraySchema,
    revised_interpretations: stringArraySchema,
    resolved_unknowns: stringArraySchema,
    new_unknowns: stringArraySchema,
    emotion_changes: stringArraySchema,
    previous_path_result: { type: "string" },
    change_reason: { type: "string" },
  },
  required: [
    "added_facts",
    "revised_interpretations",
    "resolved_unknowns",
    "new_unknowns",
    "emotion_changes",
    "previous_path_result",
    "change_reason",
  ],
} as const;
