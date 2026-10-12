import { describe, expect, it } from "vitest";
import {
  chainLikelihood,
  chainTo,
  foldIntoSignals,
  tierOf,
  childrenOf,
  evidenceRatio,
  formatPercent,
  LIKELIHOOD_FILLED,
  LIKELIHOOD_LABELS,
  posterior,
  priorValue,
  ratioOf,
  type InferenceNode,
} from "./inference-shared";

const node = (id: string, parent_id: string | null, depth: number): InferenceNode => ({
  id, parent_id, depth, claim: `结论 ${id}`, why: "w", watch: "看", likelihood: "likely",
});

describe("推论树", () => {
  const nodes = [node("a", null, 1), node("b", null, 1), node("a1", "a", 2), node("a1x", "a1", 3)];

  it("chainTo 从根排到自己", () => {
    expect(chainTo(nodes, "a1x").map((n) => n.id)).toEqual(["a", "a1", "a1x"]);
    expect(chainTo(nodes, null)).toEqual([]);
  });

  it("childrenOf 找直接的下一层", () => {
    expect(childrenOf(nodes, null).map((n) => n.id)).toEqual(["a", "b"]);
    expect(childrenOf(nodes, "a").map((n) => n.id)).toEqual(["a1"]);
  });
});

describe("贝叶斯", () => {
  it("没有证据时后验等于先验", () => {
    expect(posterior(0.25, [])).toBeCloseTo(0.25);
  });

  it("先验 25%（赔率 1:3），一条强烈支持（×3）→ 赔率 1:1 → 50%", () => {
    expect(posterior(0.25, [ratioOf("strong_for")])).toBeCloseTo(0.5);
  });

  it("支持和反对互相抵消", () => {
    expect(posterior(0.4, [ratioOf("for"), ratioOf("against")])).toBeCloseTo(0.4);
  });

  it("先验被夹在 1%–99%，不会算出 0 或 100%", () => {
    expect(posterior(0, [3])).toBeGreaterThan(0);
    expect(posterior(1, [1 / 3])).toBeLessThan(1);
  });

  it("档位换算", () => {
    expect(priorValue("low")).toBe(0.25);
    expect(ratioOf("strong_against")).toBeCloseTo(1 / 3);
    expect(formatPercent(0.504)).toBe("50%");
  });
});

describe("证据细调", () => {
  it("细调过就用细调的倍数，夹在 ÷5 到 ×5；没细调就用档位", () => {
    expect(evidenceRatio({ strength: "for" })).toBeCloseTo(1.5);
    expect(evidenceRatio({ strength: "for", ratio: 2.2 })).toBeCloseTo(2.2);
    expect(evidenceRatio({ strength: "for", ratio: 40 })).toBe(5);
    expect(evidenceRatio({ strength: "for", ratio: 0 })).toBe(1);
  });
});

describe("五档", () => {
  it("每一档都有名字和格数，旧数据的 possible 读作一半一半", () => {
    expect(LIKELIHOOD_LABELS.possible).toBe("一半一半");
    expect(LIKELIHOOD_FILLED.very_likely).toBe(5);
    expect(LIKELIHOOD_FILLED.very_unlikely).toBe(1);
  });
});

describe("整条链的档位", () => {
  const node = (over: Partial<InferenceNode>): InferenceNode => ({
    id: "n",
    parent_id: null,
    depth: 1,
    claim: "c",
    why: "w",
    watch: "w",
    likelihood: "likely",
    ...over,
  });

  it("每一步都是较可能，连成三步就只剩不太可能", () => {
    const chain = [node({}), node({ depth: 2 }), node({ depth: 3 })];
    expect(chainLikelihood(chain)).toEqual({ likelihood: "unlikely", selfRated: false });
  });

  it("有 p 就用 p；链上有 AI 自评的一步要标出来", () => {
    expect(chainLikelihood([node({ p: 0.95 }), node({ p: 0.9, depth: 2 })]).likelihood).toBe("very_likely");
    expect(chainLikelihood([node({ judged_by: "gemini" })]).selfRated).toBe(true);
  });

  it("tierOf 的分界", () => {
    expect([0.85, 0.65, 0.45, 0.25, 0.1].map(tierOf)).toEqual(["very_likely", "likely", "possible", "unlikely", "very_unlikely"]);
  });
});

describe("foldIntoSignals", () => {
  const node = (id: string, signals?: string[]): InferenceNode => ({
    id, parent_id: null, depth: 1, claim: "c", why: "w", watch: "w", likelihood: "likely", signals,
  });
  it("挪进上一步的具体信号，去重、最多 5 条；第一层没有上一步就不动", () => {
    const nodes = [node("a", ["大和上调运费"]), node("b")];
    const next = foldIntoSignals(nodes, "a", ["大和上调运费", "佐川上调运费"]);
    expect(next[0].signals).toEqual(["大和上调运费", "佐川上调运费"]);
    expect(next[1].signals).toBeUndefined();
    expect(foldIntoSignals(nodes, null, ["x"])).toBe(nodes);
    expect(foldIntoSignals(nodes, "a", ["1", "2", "3", "4", "5", "6"])[0].signals).toHaveLength(5);
  });
});
