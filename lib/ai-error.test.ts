import { describe, expect, it } from "vitest";
import {
  formatAiErrorMessage,
  parseAiErrorMessage,
  type SerializedAiError,
} from "./ai-error";

describe("AI inline error serialization", () => {
  it("round-trips AI error metadata through an Error message", () => {
    const input: SerializedAiError = {
      code: "timeout",
      requestId: "ai_abc123",
      retryable: true,
      inputSaved: true,
      message: "AI 响应超时，本次输入已保留。",
    };

    expect(parseAiErrorMessage(formatAiErrorMessage(input))).toEqual(input);
  });

  it("returns null for normal non-AI errors", () => {
    expect(parseAiErrorMessage("普通保存失败")).toBeNull();
  });

  it("handles malformed serialized messages as non-AI errors", () => {
    expect(parseAiErrorMessage("AI_ERROR:not-json")).toBeNull();
  });
});
