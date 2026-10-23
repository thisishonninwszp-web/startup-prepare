import { describe, expect, it } from "vitest";
import { LIST_CAPS, LIST_MAX, listSeconds, pickListItems, previewLine, type ListCandidates, type ListForecast } from "./today-list-shared";

const fq = (id: string, blind = false, ai: number | null = 0.3): ListForecast => ({
  id,
  title: `题${id}`,
  kind: "market",
  resolve_on: "2027-03-31",
  criteria: "",
  blind,
  anchor: ai === null ? null : { source: "ai", probability: ai },
  three: [],
});
const base: ListCandidates = { practice: null, forecasts: [], confirms: [], dues: [], recalls: [], experiments: [] };
const draft = (probability: number) => ({ probability, perspectives: [], made_at: "" });

describe("一分钟清单", () => {
  it("按顺序取、各取几件、最多 8 件，剩下的数出来", () => {
    const c: ListCandidates = {
      ...base,
      practice: { kind: "practice", date: "2026-10-24", signalId: "s", question: "日银会不会加息？", mode: "draft", draft: draft(0.85), horizon: "3m", deadline: "2026-12-31" },
      forecasts: [fq("a"), fq("b"), fq("c"), fq("d"), fq("blind", true, null)],
      recalls: [1, 2, 3].map((i) => ({ signalId: `r${i}`, title: `回想${i}`, reason: "你标过", dueOn: "2026-10-24" })),
    };
    const { items, more } = pickListItems(c);
    expect(items.map((i) => i.kind)).toEqual(["practice", "forecast", "forecast", "forecast", "recall", "recall"]);
    // 先判题排在预测题第一个
    expect(items[1]).toMatchObject({ kind: "forecast", q: { id: "blind" } });
    // 预测题多 2 道、回想多 1 条
    expect(more).toBe(3);
    expect(items.length).toBeLessThanOrEqual(LIST_MAX);
  });

  it("满 8 件就停，后面的都算留到明天", () => {
    const c: ListCandidates = {
      ...base,
      forecasts: [fq("a"), fq("b"), fq("c")],
      dues: [1, 2].map((i) => ({ id: `j${i}`, predictionId: `p${i}`, question: "q", judgment: `判断${i}`, dueAt: "2026-10-20", evidence: null })),
      recalls: [1, 2].map((i) => ({ signalId: `r${i}`, title: `回想${i}`, reason: "你标过", dueOn: "2026-10-24" })),
      experiments: [{ kind: "door_views", targetId: "d", platform: "", label: "假门", question: "会不会被看 30 次？", dueOn: "2026-11-01" }],
      confirms: [1, 2].map((i) => ({
        id: `c${i}`,
        title: `确认${i}`,
        criteria: "",
        resolve_on: "2026-10-20",
        pending: { suggested: "yes" as const, note: "", evidence: [], checked_on: "2026-10-21" },
      })),
    };
    const { items, more } = pickListItems(c);
    expect(items).toHaveLength(LIST_MAX);
    expect(items.map((i) => i.kind)).toEqual(["forecast", "forecast", "forecast", "confirm", "confirm", "due", "due", "recall"]);
    expect(more).toBe(2);
  });

  it("AI 没判的、又不是先判题的预测题不进清单", () => {
    expect(pickListItems({ ...base, forecasts: [fq("x", false, null)] })).toEqual({ items: [], more: 0 });
  });

  it("估几秒：练习 10 秒，别的 6 秒", () => {
    const { items } = pickListItems({
      ...base,
      practice: { kind: "practice", date: "d", signalId: "s", question: "q", mode: "blind", draft: null, horizon: "3m" },
      forecasts: [fq("a")],
    });
    expect(listSeconds(items)).toBe(16);
  });

  it("邮件里那一行：哪一种、题目截短、AI 怎么说", () => {
    expect(previewLine({ kind: "forecast", q: fq("a") })).toEqual({ label: "预测", title: "题a", note: "AI：30%" });
    expect(previewLine({ kind: "forecast", q: fq("b", true, null) }).note).toBe("这道先自己判");
    expect(previewLine({ kind: "forecast", q: { ...fq("m"), anchor: { source: "market", probability: 0.45 } } }).note).toBe("市场：45%");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "draft", draft: draft(0.3), horizon: "3m" }).note).toBe("AI：不会 · 有点把握");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "waiting", draft: null, horizon: "3m" }).note).toBe("AI 还没判完");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "blind", draft: null, horizon: "3m" }).note).toBe("周一：先自己判");
    expect(
      previewLine({
        kind: "due",
        j: {
          id: "j",
          predictionId: "p",
          question: "q",
          judgment: "会",
          dueAt: "",
          evidence: [
            { url: "", title: "", fact: "", excerpt: "", stance: "supports" },
            { url: "", title: "", fact: "", excerpt: "", stance: "contradicts" },
            { url: "", title: "", fact: "", excerpt: "", stance: "contradicts" },
          ],
        },
      }).note
    ).toBe("查到 1 条支持、2 条反对");
    expect(previewLine({ kind: "forecast", q: { ...fq("x"), title: "一".repeat(40) } }).title).toHaveLength(29);
  });

  it("各种的上限", () => {
    expect(LIST_CAPS).toEqual({ practice: 1, forecast: 3, confirm: 2, due: 2, recall: 2, experiment: 1 });
  });
});
