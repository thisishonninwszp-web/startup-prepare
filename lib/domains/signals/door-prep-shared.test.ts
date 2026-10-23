import { describe, expect, it } from "vitest";
import { pickDoorGap, pickListenGap, suggestedPrice, VOICES_FOR_DOOR } from "./door-prep-shared";
import type { Attention } from "./attention-shared";

const g = (id: string, quotes: number | null, door: unknown | null = null) => ({ side: "japan" as const, signal_id: id, quotes, door });

describe("假门 AI 先做好", () => {
  it("自动听一听：没听过的里排在最前的那条", () => {
    expect(pickListenGap([g("a", 0), g("b", null), g("c", null)])?.signal_id).toBe("b");
    expect(pickListenGap([g("a", 2)])).toBeNull();
  });

  it("该做假门的：原话够了、没开过、没做过，原话多的先", () => {
    const gaps = [g("few", VOICES_FOR_DOOR - 1), g("open", 9, { open: true }), g("done", 8), g("loud", 6), g("ok", 4)];
    expect(pickDoorGap(gaps, (x) => x.signal_id === "done")?.signal_id).toBe("loud");
    expect(pickDoorGap([g("few", 1)], () => false)).toBeNull();
  });

  it("先填的价格：日文页用楽天的中位数、写明出处；中文页和没数据的不填", () => {
    const attention = { topic: "家事代行", rakuten: { count: 120, top: [], reviews: 300, medianPrice: 1280 } } as unknown as Attention;
    expect(suggestedPrice(attention, "ja")).toEqual({
      price: "1,280円",
      basis: "楽天上「家事代行」相关商品前 30 件价格的中位数（买一次的价格；要是按月收费，改成「月額 …円」）",
    });
    expect(suggestedPrice(attention, "zh")).toBeNull();
    expect(suggestedPrice({ ...attention, rakuten: "no-key" } as Attention, "ja")).toBeNull();
    expect(suggestedPrice(undefined, "ja")).toBeNull();
  });
});
