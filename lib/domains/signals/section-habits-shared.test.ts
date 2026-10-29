import { describe, expect, it } from "vitest";
import { orderSections } from "./section-habits-shared";

const defaults = ["news", "calendar", "voices", "money", "tools"] as const;
const h = (kind: (typeof defaults)[number], opens: number, marks = 0, useful = 0, useless = 0) => ({ kind, opens, marks, useful, useless });

describe("版面按阅读习惯排", () => {
  it("动作太少照默认顺序", () => {
    expect(orderSections([...defaults], [h("money", 2)]).order).toEqual([...defaults]);
  });
  it("点得多、标得多的排前面；说没用的往后；同分照默认", () => {
    const r = orderSections([...defaults], [h("money", 6, 1), h("news", 3), h("voices", 3), h("tools", 1, 0, 0, 1)]);
    expect(r.order).toEqual(["money", "news", "voices", "calendar", "tools"]);
    expect(r.folded).toEqual([]);
  });
  it("点开够多以后，一次都没碰过的那节收起来", () => {
    const r = orderSections([...defaults], [h("money", 10), h("news", 6)]);
    expect(r.folded).toEqual(["calendar", "voices", "tools"]);
  });
});
