import { describe, expect, it } from "vitest";
import { parseCaseQuestion, parseFollowups, parseReview } from "./jobs-case";

const BODY =
  "株式会社サンプルは、中小企業向けにECサイトの構築と運用代行を行っています。年商は約30億円。マーケティング担当として、広告とサイト改善のデータ分析を担当していただきます。";

describe("出题", () => {
  const good = {
    type: "improvement",
    prompt_ja: "この会社のEC運用代行の売上を3年で2倍にするにはどうしますか。",
    premise_ja: "数字は自分で置いてかまいません。考え方を聞きたいです。",
    why: "这家给中小企业做EC代运营，岗位要做广告和网站改善的分析。",
    quote: "中小企業向けにECサイトの構築と運用代行を行っています",
  };

  it("原话在招聘页里、数字是出题用的小数字，照收", () => {
    expect(parseCaseQuestion(good, BODY).type).toBe("improvement");
  });

  it("原话不在招聘页里报错", () => {
    expect(() => parseCaseQuestion({ ...good, quote: "大手企業向けにコンサルティングを行っています" }, BODY)).toThrow(/原话/);
  });

  it("编了招聘页没有的大数字报错；招聘页里有的可以", () => {
    expect(() => parseCaseQuestion({ ...good, prompt_ja: "年商100億円のこの会社の売上を伸ばすには？" }, BODY)).toThrow(/100/);
    expect(parseCaseQuestion({ ...good, prompt_ja: "年商30億円のこの会社の売上を伸ばすには？" }, BODY).prompt_ja).toContain("30億円");
  });

  it("题型不对报错", () => {
    expect(() => parseCaseQuestion({ ...good, type: "other" }, BODY)).toThrow(/题型/);
  });

  it("题目不是日文报错", () => {
    expect(() => parseCaseQuestion({ ...good, prompt_ja: "如何让这家公司销售额翻倍" }, BODY)).toThrow(/没用日文/);
  });
});

const ANSWER = "売上を客数×客単価に分解します。客数は新規顧客の獲得を増やし、客単価は追加サービスで上げます。";

describe("追问", () => {
  it("引用他原话的留下，不引用的丢掉", () => {
    const out = parseFollowups(
      {
        followups: [
          { q_ja: "新規顧客はどのチャネルで増やしますか。", cites: "新規顧客の獲得を増やし" },
          { q_ja: "追加サービスとは具体的に何ですか。", cites: "追加サービスで上げます" },
          { q_ja: "競合はどうですか。", cites: "競合が多い" },
        ],
      },
      ANSWER
    );
    expect(out).toHaveLength(2);
  });

  it("不到两个报错", () => {
    expect(() =>
      parseFollowups({ followups: [{ q_ja: "新規顧客はどのチャネルで増やしますか。", cites: "新規顧客の獲得を増やし" }] }, ANSWER)
    ).toThrow(/不到两个/);
  });

  it("夸了报错", () => {
    expect(() =>
      parseFollowups(
        {
          followups: [
            { q_ja: "素晴らしい分解ですね。新規はどう増やしますか。", cites: "新規顧客の獲得を増やし" },
            { q_ja: "追加サービスとは何ですか。", cites: "追加サービスで上げます" },
          ],
        },
        ANSWER
      )
    ).toThrow(/夸奖/);
  });
});

describe("复盘", () => {
  const good = {
    reference_ja: [
      "まず目標を確認する（3年で2倍）",
      "売上＝顧客数×顧客あたり売上に分ける",
      "顧客数は新規と継続に分ける",
      "打ち手を効果と手間で並べて、先にやるものを決める",
    ],
    weak: [{ quote: "新規顧客の獲得を増やし", why: "没说靠什么渠道、要花多少成本，面试官一定会问。" }],
    suggested_step: "split",
  };

  it("照收", () => {
    expect(parseReview(good, ANSWER).suggested_step).toBe("split");
  });

  it("被问穿处不引用他的原话就丢；一条都没有报错", () => {
    expect(() => parseReview({ ...good, weak: [{ quote: "競合が多い", why: "没说清。" }] }, ANSWER)).toThrow(/原话/);
  });

  it("卡在哪一步不在五类里报错", () => {
    expect(() => parseReview({ ...good, suggested_step: "logic" }, ANSWER)).toThrow(/五类/);
  });

  it("参考结构不到三条报错", () => {
    expect(() => parseReview({ ...good, reference_ja: ["売上を分解する"] }, ANSWER)).toThrow(/三条/);
  });
});
