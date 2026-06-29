import { describe, expect, it } from "vitest";
import { extractJson, generateValidatedJson } from "./ai-json";

describe("extractJson", () => {
  it("extracts an object from fenced model output", () => {
    expect(extractJson('```json\n{"ready":true}\n```')).toEqual({
      ready: true,
    });
  });

  it("repairs a structurally complete object with a missing comma", () => {
    expect(
      extractJson('{"items":[{"text":"第一条"}\n{"text":"第二条"}]}')
    ).toEqual({
      items: [{ text: "第一条" }, { text: "第二条" }],
    });
  });

  it("rejects truncated JSON instead of accepting partial AI output", () => {
    expect(() =>
      extractJson('{"items":[{"text":"第一条"},{"text":"第二')
    ).toThrow("truncated");
  });
});

describe("generateValidatedJson", () => {
  it("retries once when validation rejects the first response", async () => {
    const outputs = ['{"questions":[]}', '{"questions":["依据是什么？"]}'];
    let calls = 0;

    const result = await generateValidatedJson(
      async () => outputs[calls++],
      (value) => {
        const row = value as { questions?: unknown };
        if (!Array.isArray(row.questions) || row.questions.length === 0) {
          throw new Error("questions required");
        }
        return row.questions as string[];
      }
    );

    expect(result).toEqual(["依据是什么？"]);
    expect(calls).toBe(2);
  });

  it("throws after the repair attempt also fails", async () => {
    let calls = 0;
    await expect(
      generateValidatedJson(
        async () => {
          calls++;
          return "not-json";
        },
        (value) => value
      )
    ).rejects.toThrow("AI返回了无法验证的结构");
    expect(calls).toBe(2);
  });
});
