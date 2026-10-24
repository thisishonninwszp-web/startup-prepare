import { describe, expect, it } from "vitest";
import { isIssueDay, LIST_CAPS, LIST_MAX, listSeconds, pickListItems, previewLine, type ListCandidates, type ListForecast } from "./today-list-shared";

const fq = (id: string, blind = false, ai: number | null = 0.3): ListForecast => ({
  id,
  title: `题${id}`,
  kind: "market",
  resolve_on: "2027-03-31",
  criteria: "",
  blind,
  anchor: ai === null ? null : { source: "ai", probability: ai },
  three: [],
  breakdown: null,
});
const base: ListCandidates = { practice: null, forecasts: [], confirms: [], dues: [], recalls: [], experiments: [], doors: [] };
const draft = (probability: number) => ({ probability, perspectives: [], made_at: "" });

describe("一分钟清单", () => {
  it("按顺序取、各取几件、最多 8 件，剩下的数出来", () => {
    const c: ListCandidates = {
      ...base,
      practice: { kind: "practice", date: "2026-10-24", signalId: "s", question: "日银会不会加息？", mode: "draft", draft: draft(0.85), breakdown: null, horizon: "3m", deadline: "2026-12-31" },
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
      practice: { kind: "practice", date: "d", signalId: "s", question: "q", mode: "blind", draft: null, breakdown: null, horizon: "3m" },
      forecasts: [fq("a")],
    });
    expect(listSeconds(items)).toBe(16);
  });

  it("邮件里那一行：哪一种、题目截短、AI 怎么说", () => {
    expect(previewLine({ kind: "forecast", q: fq("a") })).toEqual({ label: "预测", title: "题a", note: "AI：30%" });
    expect(previewLine({ kind: "forecast", q: fq("b", true, null) }).note).toBe("这道先自己判");
    expect(previewLine({ kind: "forecast", q: { ...fq("m"), anchor: { source: "market", probability: 0.45 } } }).note).toBe("市场：45%");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "draft", draft: draft(0.3), breakdown: null, horizon: "3m" }).note).toBe("AI：不会 · 有点把握");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "waiting", draft: null, breakdown: null, horizon: "3m" }).note).toBe("AI 还没判完");
    expect(previewLine({ kind: "practice", date: "d", signalId: "s", question: "q", mode: "blind", draft: null, breakdown: null, horizon: "3m" }).note).toBe("周一：先自己判");
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
    expect(LIST_CAPS).toEqual({ practice: 1, door: 1, issue: 1, job: 2, forecast: 3, confirm: 2, due: 2, recall: 2, experiment: 1 });
  });

  it("岗位：排在周刊后面、预测题前面，一天两个，只摆事实", () => {
    const j = (id: string) => ({ id, company: "某社", title: "データアナリスト", category: "分析", hireType: "中途", experience: "最少 1 年", route: null, url: null });
    const { items, more } = pickListItems({ ...base, forecasts: [fq("a")], jobs: [j("1"), j("2"), j("3")] });
    expect(items.map((i) => i.kind)).toEqual(["job", "job", "forecast"]);
    expect(more).toBe(1);
    expect(previewLine(items[0])).toEqual({ label: "岗位", title: "某社 · データアナリスト", note: "中途 · 最少 1 年" });
  });

  it("这周的周刊：周四到周日才放，排在假门后面", () => {
    expect(isIssueDay("2026-10-22")).toBe(true);
    expect(isIssueDay("2026-10-25")).toBe(true);
    expect(isIssueDay("2026-10-26")).toBe(false);
    const { items } = pickListItems({ ...base, forecasts: [fq("a")], issue: { picks: [{ headline: "x", ai: 0.6, will: "will" }] } });
    expect(items.map((i) => i.kind)).toEqual(["issue", "forecast"]);
    expect(previewLine(items[0])).toEqual({ label: "周刊", title: "这周 1 条替你挑好了", note: "去看、生成" });
  });

  it("做好的假门排在练习后面，估 20 秒；邮件里写价格填了没有", () => {
    const d = { signalId: "g", side: "japan" as const, lang: "ja" as const, draft: { title: "家事代行", lead: "", points: [], audience: "" }, price: null, priceBasis: null };
    const { items } = pickListItems({ ...base, forecasts: [fq("a")], doors: [d, { ...d, signalId: "g2" }] });
    expect(items.map((i) => i.kind)).toEqual(["door", "forecast"]);
    expect(listSeconds(items)).toBe(26);
    expect(previewLine(items[0]).note).toBe("做好了，差一个价格");
    expect(previewLine({ kind: "door", d: { ...d, price: "1,280円" } }).note).toBe("做好了，价格先填了 1,280円");
  });
});
