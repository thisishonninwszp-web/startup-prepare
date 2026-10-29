import { describe, expect, it } from "vitest";
import { groupBySignal, INLINE_PER_ITEM } from "./inline-questions-shared";
import type { ForecastQuestion } from "./forecast-shared";

const q = (id: string, signalId: string | null, resolveOn = "2027-03-31"): ForecastQuestion =>
  ({ id, kind: "business", title: `题${id}`, original_title: null, criteria: "", resolve_on: resolveOn, category: null, source: signalId ? { signal_id: signalId } : {}, context: null, status: "open" }) as unknown as ForecastQuestion;

describe("读报时就地判断", () => {
  it("groupBySignal：只收挂着这份报告里的新闻的；先判题在前、再按截止早的；每条最多两道", () => {
    const waiting = [q("a", "s1", "2027-06-30"), q("b", "s1", "2027-01-31"), q("c", "s1"), q("d", "s2"), q("e", null), q("f", "other")];
    const out = groupBySignal(waiting, ["s1", "s2"], new Set(["c"]), () => ({ source: "ai", probability: 0.4 }), [], new Map());
    expect(Object.keys(out).sort()).toEqual(["s1", "s2"]);
    expect(out.s1.map((x) => x.q.id)).toEqual(["c", "b"]);
    expect(out.s1).toHaveLength(INLINE_PER_ITEM);
    // 先判题不给先摆的数
    expect(out.s1[0]).toMatchObject({ blind: true, anchor: null });
    expect(out.s1[1].anchor).toEqual({ source: "ai", probability: 0.4 });
  });
});
