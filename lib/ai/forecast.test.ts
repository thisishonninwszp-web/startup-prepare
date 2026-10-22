import { describe, expect, it } from "vitest";
import {
  parseArchiveAnswer,
  parseBusinessQuestions,
  parseMarketTranslation,
  parsePerspectiveForecast,
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
