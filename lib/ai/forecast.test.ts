import { describe, expect, it } from "vitest";
import {
  parsePerspectiveQueries,
  parseArrivalDraft,
  parseHistoryPreparation,
  parseArchiveAnswer,
  parseBusinessQuestions,
  parseMarketTranslation,
  parsePerspectiveForecast,
  longestSharedRun,
  parseReferenceClass,
  parseResolutionDraft,
  verifiedExcerpts,
} from "./forecast";

const sources = [{ title: "日経", url: "https://example.jp/a", content: "日銀は12月の会合で政策金利を0.75%に引き上げることを決めた。市場では予想通りとの声が多い。" }];

describe("forecast AI parsers", () => {
  it("market translation: Chinese, no probabilities, category from the list", () => {
    const ok = parseMarketTranslation({ title: "日本银行会不会在 2026 年 12 月的会议上加息？", criteria: "以日本银行 12 月会议后的公告为准。", category: "日本经济" });
    expect(ok.category).toBe("日本经济");
    expect(parseMarketTranslation({ title: "会不会？", criteria: "以公告为准。", category: "随便" }).category).toBe("世界");
    expect(() => parseMarketTranslation({ title: "市场认为 70% 会加息？", criteria: "x", category: "世界" })).toThrow();
  });

  it("business questions: id/headline echo, date window, no 'you'", () => {
    const items = new Map([["s1", "PayPay、訪日客向けプリペイドカードを検討"]]);
    const out = parseBusinessQuestions(
      {
        questions: [
          { id: "s1", headline: "PayPay、訪日客向けプリペイドカードを検討", title: "到 2027 年 3 月底，PayPay 会不会推出面向外国游客的预付卡？", criteria: "以 PayPay 官方公告为准。", resolve_on: "2027-03-31", category: "日本经济" },
          { id: "s1", headline: "PayPay、訪日客向けプリペイドカードを検討", title: "太近的题会不会？", criteria: "x", resolve_on: "2026-10-30", category: "世界" },
          { id: "s9", headline: "不存在", title: "会不会？", criteria: "x", resolve_on: "2027-03-31", category: "世界" },
        ],
      },
      items,
      "2026-10-22"
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ signalId: "s1", resolveOn: "2027-03-31" });
  });

  it("perspective forecast: probability in (0,1), rounded and clamped", () => {
    expect(parsePerspectiveForecast({ probability: 0.734, reason: "资料显示已经进入最后一步。" }).probability).toBe(0.73);
    expect(parsePerspectiveForecast({ probability: "0.999", reason: "几乎确定。" }).probability).toBe(0.99);
    expect(() => parsePerspectiveForecast({ probability: 1.2, reason: "x" })).toThrow();
    expect(() => parsePerspectiveForecast({ probability: 0.5, reason: "" })).toThrow();
  });

  it("resolution draft: yes/no only with verbatim evidence", () => {
    const yes = parseResolutionDraft({ verdict: "yes", note: "日银宣布加息。", evidence: [{ source: 1, excerpt: "日銀は12月の会合で政策金利を0.75%に引き上げる" }] }, sources);
    expect(yes.suggested).toBe("yes");
    expect(yes.evidence[0].url).toBe("https://example.jp/a");
    const made = parseResolutionDraft({ verdict: "no", note: "没有加息。", evidence: [{ source: 1, excerpt: "日銀は利上げを見送った" }] }, sources);
    expect(made.suggested).toBe("unclear");
    expect(verifiedExcerpts([{ source: 2, excerpt: "日銀は12月の会合で" }], sources)).toEqual([]);
  });

  it("archive answer: only statements with valid refs", () => {
    const out = parseArchiveAnswer(
      {
        statements: [
          { text: "9 月的报道说 A 公司准备进日本。", refs: [1, 9] },
          { text: "没有出处的一句。", refs: [] },
          { text: "这说明市场很大。", refs: [1] },
          { text: "存档里没找到能回答这个的。", refs: [] },
        ],
      },
      3
    );
    expect(out).toEqual([
      { text: "9 月的报道说 A 公司准备进日本。", refs: [1] },
      { text: "存档里没找到能回答这个的。", refs: [] },
    ]);
  });
});

describe("历史回测：题目准备", () => {
  const ok = { title: "日本银行会不会在 2025 年 7 月底前加息？", criteria: "以日本银行 7 月会议的公告为准。", category: "日本经济", search: '"Bank of Japan" rate hike' };
  it("题目、标准、检索词都在才收", () => {
    expect(parseHistoryPreparation(ok)).toMatchObject({ search: '"Bank of Japan" rate hike', category: "日本经济" });
    expect(() => parseHistoryPreparation({ ...ok, search: "" })).toThrow();
  });
  it("写进了结算的事不收", () => {
    expect(() => parseHistoryPreparation({ ...ok, criteria: "已经结算为会。" })).toThrow();
    expect(() => parseHistoryPreparation({ ...ok, search: "BOJ resolved yes" })).toThrow();
  });
});

describe("到日本题", () => {
  const ok = { title: "到 2027 年 10 月底，日本会不会出现按小时收费的上门做饭服务？", criteria: "以日本有公司正式对外提供、有官网或报道为准；只宣布计划不算。", resolve_on: "2027-10-31", category: "food" };
  it("截止日要在 300 到 760 天之间；类别只认那八个", () => {
    expect(parseArrivalDraft(ok, "2026-10-23")).toMatchObject({ resolveOn: "2027-10-31", category: "food" });
    expect(parseArrivalDraft({ ...ok, category: "外卖" }, "2026-10-23").category).toBe("other");
    expect(() => parseArrivalDraft({ ...ok, resolve_on: "2026-12-31" }, "2026-10-23")).toThrow();
  });
  it("不许写概率", () => {
    expect(() => parseArrivalDraft({ ...ok, criteria: "有 60% 的可能。" }, "2026-10-23")).toThrow();
  });
});

describe("三种思路各搜各的：搜索词", () => {
  it("三条都要有、不能太长", () => {
    expect(parsePerspectiveQueries({ outside: "央行 连续加息 间隔", inside: "日銀 12月 利上げ", devil: "日銀 利上げ 見送り 理由" })).toEqual({
      outside: "央行 连续加息 间隔",
      inside: "日銀 12月 利上げ",
      devil: "日銀 利上げ 見送り 理由",
    });
    expect(() => parsePerspectiveQueries({ outside: "a b", inside: "c d" })).toThrow();
    expect(() => parsePerspectiveQueries({ outside: "x".repeat(81), inside: "c d", devil: "e f" })).toThrow();
  });

  it("reference class: 一类事说成一句；同类只留名字和年份，写了结果、晚于那天的不收", () => {
    const r = parseReferenceClass(
      {
        kind: "一台新游戏机发售头一年，在日本卖得比在美洲多。",
        examples: ["Switch（2017）", "PS5（2020）日本卖得更少", "Switch 3（2027）", "Wii U"],
      },
      "2025-07-01"
    );
    expect(r).toEqual({ kind: "一台新游戏机发售头一年，在日本卖得比在美洲多", examples: ["Switch（2017）"] });
    expect(() => parseReferenceClass({ kind: "短", examples: [] }, "2025-07-01")).toThrow();
    expect(() => parseReferenceClass({ kind: "新主机头一年日本卖得多的可能性", examples: [] }, "2025-07-01")).toThrow("可能性");
  });

  it("reference class: 只是把题目换个说法的不收", () => {
    const title = "日本会不会在 2027 年底前出现一位女性首相？";
    expect(longestSharedRun("日本在三年内出现一位女性首相", title)).toBeGreaterThanOrEqual(6);
    expect(() => parseReferenceClass({ kind: "日本在三年内出现一位女性首相", examples: [] }, "2025-07-29", title)).toThrow("换了个说法");
    expect(parseReferenceClass({ kind: "一个从没有过女性首脑的大国，两三年内出现第一位", examples: [] }, "2025-07-29", title).kind).toContain("大国");
  });
});
