export const COUNCIL_PERSONA_KEYS = [
  "sunzi",
  "mao",
  "gates",
  "munger",
  "drucker",
  "christensen",
  "graham",
  "taleb",
] as const;

export type BuiltinPersonaKey = (typeof COUNCIL_PERSONA_KEYS)[number];

export type CouncilPersona = {
  key: string;
  display_name: string;
  is_builtin: boolean;
  grounding_note: string;
  owner_user_id: string | null;
};

export type CouncilSession = {
  id: string;
  user_id: string;
  idea_id: string | null;
  title: string;
  created_at: string;
};

export type CouncilSessionPersona = {
  persona_key: string;
  turns_since_last_spoke: number;
};

export type CouncilMessage = {
  id: string;
  session_id: string;
  role: "user" | "persona";
  persona_key: string | null;
  grounded_reference: string;
  content: string;
  sharpest_question: string | null;
  created_at: string;
};

export type CouncilSessionWithMessages = CouncilSession & {
  personas: CouncilSessionPersona[];
  messages: CouncilMessage[];
};

export type CouncilTurnReply = {
  persona_key: string;
  grounded_reference: string;
  content: string;
  sharpest_question: string | null;
};

export type CouncilTurnOutput = {
  replies: CouncilTurnReply[];
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

const FORBIDDEN_FLATTERY_PATTERN =
  /很有潜力|不错的想法|值得一试|加油|你可以的|这个方向很好/;

export function rejectFlatteringLanguage(text: string, label: string): string {
  if (FORBIDDEN_FLATTERY_PATTERN.test(text)) {
    throw new Error(`${label} 含有禁止的迎合性语言`);
  }
  return text;
}

export function parseCouncilTurnOutput(
  value: unknown,
  allowedPersonaKeys: string[]
): CouncilTurnOutput {
  const input = object(value, "council turn output");
  if (!Array.isArray(input.replies) || input.replies.length < 1) {
    throw new Error("replies must have at least 1 item");
  }
  if (input.replies.length > 3) {
    throw new Error("replies must have at most 3 items");
  }

  const allowed = new Set(allowedPersonaKeys);
  const seen = new Set<string>();
  const replies = input.replies.map((r: unknown, i: number) => {
    const row = object(r, `replies[${i}]`);
    const persona_key = str(row.persona_key, `replies[${i}].persona_key`);
    if (!allowed.has(persona_key)) {
      throw new Error(
        `replies[${i}].persona_key "${persona_key}" 不在本场会话选定的顾问名单中`
      );
    }
    if (seen.has(persona_key)) {
      throw new Error(`persona_key "${persona_key}" 在同一轮重复发言`);
    }
    seen.add(persona_key);

    const content = rejectFlatteringLanguage(
      str(row.content, `replies[${i}].content`),
      `replies[${i}].content`
    );
    const grounded_reference = str(
      row.grounded_reference,
      `replies[${i}].grounded_reference`
    );

    let sharpest_question: string | null = null;
    if (row.sharpest_question != null) {
      const q = str(row.sharpest_question, `replies[${i}].sharpest_question`);
      if (!/[吗？?]/.test(q)) {
        throw new Error(`replies[${i}].sharpest_question 必须是一个具体问题`);
      }
      sharpest_question = q;
    }

    return { persona_key, grounded_reference, content, sharpest_question };
  });

  return { replies };
}
