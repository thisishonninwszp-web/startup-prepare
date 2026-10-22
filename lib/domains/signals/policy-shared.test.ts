import { describe, expect, it } from "vitest";
import { baseProbability, deadlineToPromulgate, isRelevantPolicy, lagSummary, ministryOf, parsePcmRss, parseResultPage, policyResolveOn, shortPolicyTitle } from "./policy-shared";

const RSS = `<rdf:RDF><item rdf:about="x"><title>「有機藻類の日本農林規格の一部改正案についての意見・情報の募集」の結果について</title>
<link>https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCM1040&amp;id=550004347&amp;Mode=1</link>
<description>結果の公示日：2026/10/22&lt;br/&gt;案の公示日：2026/05/19&lt;br/&gt;受付締切日時：2026/06/17 23:59&lt;br/&gt;命令等の公布日：2026/10/22&lt;br/&gt;提出意見数：0&lt;br/&gt;カテゴリー：国民生活の安全・安心の確保&lt;br/&gt;問合せ先（所管省庁・部局名等）：農林水産省大臣官房新事業・食品産業部 電話：03-3502-8111&lt;br/&gt;</description></item>
<item rdf:about="y"><title>外国人の在留管理に関する省令（案）の意見募集について</title>
<link>https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCMMSTDETAIL&amp;id=300000001&amp;Mode=0</link>
<description>案の公示日：2026/10/21&lt;br/&gt;受付締切日時：2026/11/20 17:00&lt;br/&gt;カテゴリー：行政手続&lt;br/&gt;問合せ先（所管省庁・部局名等）：出入国在留管理庁政策課&lt;br/&gt;</description></item></rdf:RDF>`;

describe("e-Gov 意见征集", () => {
  it("订阅：结果公示带公布日和意见数；正在征求意见的只有截止日", () => {
    const [done, open] = parsePcmRss(RSS);
    expect(done).toMatchObject({ id: "550004347", ministry: "農林水産省", deadline: "2026-06-17", promulgate_date: "2026-10-22", result_date: "2026-10-22", comments: 0 });
    expect(open).toMatchObject({ id: "300000001", ministry: "出入国在留管理庁", deadline: "2026-11-20", promulgate_date: null, comments: null });
  });

  it("结果页：対象が定められた日就是公布日；还没结果的不是结果页", () => {
    expect(parseResultPage("<p>結果の公示日 2026年10月22日 対象が定められた日 2026年10月22日</p>")).toEqual({ result_date: "2026-10-22", promulgate_date: "2026-10-22" });
    expect(parseResultPage("ご迷惑をお掛けします")).toBeNull();
  });

  it("部委名、跟他有关没有、题目里引用的短标题", () => {
    expect(ministryOf("厚生労働省医薬局医薬品審査管理課 電話")).toBe("厚生労働省");
    expect(isRelevantPolicy("外国人の在留管理に関する省令（案）")).toBe(true);
    expect(isRelevantPolicy("試験研究の用に供する原子炉等の設置")).toBe(false);
    // 太泛的词不算：厚生労働省的告示、农药残留标准
    expect(isRelevantPolicy("平成十九年厚生労働省告示第五十三号（医療法施行規則別表第一の規定に基づく報告）")).toBe(false);
    expect(isRelevantPolicy("食品、添加物等の規格基準の一部を改正する告示（案）（農薬の残留基準の改正）")).toBe(false);
    expect(shortPolicyTitle("外国人の在留管理に関する省令（案）の意見募集について")).toBe("外国人の在留管理に関する省令");
  });
});

describe("流水线的基准", () => {
  it("时差：几件、中位数、各段几件", () => {
    expect(lagSummary([0, 0, 120, 200, 400])).toEqual({ n: 5, median: 120, same: 2, within6m: 1, within1y: 1, longer: 1 });
  });

  it("截止 → 公布：两头都有、公布不早于截止的才算", () => {
    expect(deadlineToPromulgate([{ deadline: "2026-06-17", promulgate_date: "2026-10-22" }, { deadline: "2026-06-17", promulgate_date: null }, { deadline: "2026-06-17", promulgate_date: "2026-06-01" }])).toEqual([127]);
  });

  it("门槛日取月底；统计基准是历史上在那么多天以内的比例（过了截止的看条件比例）", () => {
    expect(policyResolveOn("2026-11-20", 60)).toBe("2027-01-31");
    const history = Array.from({ length: 40 }, (_, i) => (i + 1) * 5); // 5..200 天
    expect(baseProbability(history, 100)).toBe(0.5);
    expect(baseProbability(history, 100, 50)).toBeCloseTo(0.33, 2);
    expect(baseProbability(history.slice(0, 10), 100)).toBeNull();
  });
});
