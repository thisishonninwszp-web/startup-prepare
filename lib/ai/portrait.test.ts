import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => {
      throw new Error("测试里不写日志");
    },
  },
}));

import { AiGatewayError, executeJev, type JevResult } from "../ai-gateway";
import { buildPortraitQuestions, parsePortraitAnswers } from "./portrait";
import { PORTRAIT_AXES } from "@/lib/domains/self-model/portrait";

function okResult(): JevResult {
  const answers: Record<string, unknown> = {};
  for (const axis of PORTRAIT_AXES) {
    answers[axis.key] = {
      type: "score",
      score: 2.4,
      confidence: 0.55,
      probabilities: { "0": 0.05, "1": 0.15, "2": 0.3, "3": 0.4, "4": 0.1 },
    };
    answers[`${axis.key}_evidence`] = { type: "noul", noul: 0.8 };
  }
  return { model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 5 } };
}

describe("问 Jev 的题", () => {
  it("每个维度一道依据题、一道五档题", () => {
    const questions = buildPortraitQuestions();
    expect(Object.keys(questions)).toHaveLength(PORTRAIT_AXES.length * 2);
    for (const axis of PORTRAIT_AXES) {
      expect(questions[`${axis.key}_evidence`].type).toBe("noul");
      const score = questions[axis.key];
      expect(score.type === "score" && score.criteria).toHaveLength(5);
    }
  });
});

describe("Jev 的数字原样收下，格式不对就挡", () => {
  it("正常的一份", () => {
    const answers = parsePortraitAnswers(okResult());
    expect(answers.attribution).toEqual({
      score: 2.4,
      confidence: 0.55,
      probabilities: [0.05, 0.15, 0.3, 0.4, 0.1],
      evidence: 0.8,
    });
  });

  it("缺一个维度", () => {
    const result = okResult();
    delete result.answers.risk;
    expect(() => parsePortraitAnswers(result)).toThrow();
  });

  it("概率加起来不是 1", () => {
    const result = okResult();
    (result.answers.doing as { probabilities: Record<string, number> }).probabilities["4"] = 0.5;
    expect(() => parsePortraitAnswers(result)).toThrow();
  });

  it("档位越界", () => {
    const result = okResult();
    (result.answers.commitment as { score: number }).score = 5;
    expect(() => parsePortraitAnswers(result)).toThrow();
  });
});

describe("executeJev", () => {
  const original = process.env.JEV_API_KEY;
  beforeEach(() => {
    process.env.JEV_API_KEY = "test-key";
  });
  afterEach(() => {
    process.env.JEV_API_KEY = original;
  });

  const request = { state: "文字", questions: buildPortraitQuestions() };
  const context = { userId: "u1", operation: "test", module: "self" as const };

  it("带 Key 发出去，校验后返回", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(okResult()), { status: 200 })
    );
    const answers = await executeJev(context, request, parsePortraitAnswers, fetchImpl);
    expect(answers.risk.score).toBe(2.4);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body as string).model).toBe("jev-1.13.0");
  });

  it("402 说人话：额度用完了", async () => {
    const fetchImpl = vi.fn(async () => new Response("secret echo", { status: 402 }));
    await expect(
      executeJev(context, request, parsePortraitAnswers, fetchImpl)
    ).rejects.toThrow(/额度/);
  });

  it("没配 Key 不发请求", async () => {
    delete process.env.JEV_API_KEY;
    const fetchImpl = vi.fn();
    const error = await executeJev(context, request, parsePortraitAnswers, fetchImpl).catch(
      (cause) => cause
    );
    expect(error).toBeInstanceOf(AiGatewayError);
    expect((error as AiGatewayError).code).toBe("configuration");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
