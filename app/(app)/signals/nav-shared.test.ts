import { describe, expect, it } from "vitest";
import { activeHref, SIGNALS_NAV } from "./nav-shared";

describe("外部信号的二级导航", () => {
  it("activeHref：最长的前缀对得上的那一页；新闻详情页算「今天」", () => {
    expect(activeHref("/signals")).toBe("/signals");
    expect(activeHref("/signals/events")).toBe("/signals/memory");
    expect(activeHref("/signals/events/example")).toBe("/signals/memory");
    expect(activeHref("/signals/eventsX")).toBe("/signals");
    expect(activeHref("/signals/gaps")).toBe("/signals/gaps");
    expect(activeHref("/signals/gaps/door")).toBe("/signals/gaps");
    expect(activeHref("/signals/issue/door")).toBe("/signals/issue/door");
    expect(activeHref("/signals/issue")).toBe("/signals/issue");
    expect(activeHref("/signals/questions/abc")).toBe("/signals/questions");
    expect(activeHref("/signals/123e4567-e89b-12d3-a456-426614174000")).toBe("/signals");
    // 前缀要按整段比：/signals/gapsX 不算差距清单
    expect(activeHref("/signals/gapsX")).toBe("/signals");
  });

  it("每一页只出现在一组里", () => {
    const hrefs = SIGNALS_NAV.flatMap((g) => g.pages.map((p) => p.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("五块：今天、记忆、预测、机会、行动；每块第一页是点块名去的地方", () => {
    expect(SIGNALS_NAV.map((g) => g.label)).toEqual(["今天", "记忆", "预测", "机会", "行动"]);
    expect(SIGNALS_NAV.map((g) => g.pages[0].href)).toEqual(["/signals", "/signals/memory", "/signals/forecast", "/signals/gaps", "/signals/act"]);
  });
});
