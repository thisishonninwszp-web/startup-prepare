import { describe, expect, it } from "vitest";
import {
  classifyAiError,
  decryptAiPayloadForTest,
  encryptAiPayloadForTest,
  sanitizeAiPayload,
  shouldAttemptJsonRepair,
} from "./ai-gateway";

describe("AI gateway error policy", () => {
  it("allows exactly one repair attempt only for structure validation failures", () => {
    expect(shouldAttemptJsonRepair("invalid_json", 1)).toBe(true);
    expect(shouldAttemptJsonRepair("schema_violation", 1)).toBe(true);
    expect(shouldAttemptJsonRepair("citation_violation", 1)).toBe(true);
    expect(shouldAttemptJsonRepair("invalid_json", 2)).toBe(false);
    expect(shouldAttemptJsonRepair("timeout", 1)).toBe(false);
    expect(shouldAttemptJsonRepair("rate_limit", 1)).toBe(false);
  });

  it("classifies common provider and validation failures without hiding the category", () => {
    expect(classifyAiError(new Error("Missing GEMINI_API_KEY"))).toBe(
      "configuration"
    );
    expect(classifyAiError(new Error("AI JSON was truncated"))).toBe(
      "truncated_json"
    );
    expect(classifyAiError(new Error("429 resource exhausted"))).toBe(
      "rate_limit"
    );
    expect(classifyAiError(new Error("deadline exceeded timeout"))).toBe(
      "timeout"
    );
  });
});

describe("AI gateway diagnostics payload", () => {
  it("redacts secrets before diagnostics are encrypted", () => {
    const sanitized = sanitizeAiPayload({
      headers: {
        authorization: "Bearer secret",
        cookie: "sb-token=secret",
        "x-api-key": "secret",
      },
      body: "ok",
      nested: { access_token: "secret", keep: "visible" },
    });

    expect(JSON.stringify(sanitized)).not.toContain("secret");
    expect(sanitized).toMatchObject({
      headers: {
        authorization: "[redacted]",
        cookie: "[redacted]",
        "x-api-key": "[redacted]",
      },
      nested: { access_token: "[redacted]", keep: "visible" },
    });
  });

  it("round-trips encrypted payloads with AES-GCM", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptAiPayloadForTest({ prompt: "hello" }, key);

    expect(encrypted).not.toContain("hello");
    expect(decryptAiPayloadForTest(encrypted, key)).toEqual({ prompt: "hello" });
  });
});
