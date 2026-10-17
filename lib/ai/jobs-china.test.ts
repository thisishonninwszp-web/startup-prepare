import { describe, expect, it } from "vitest";
import {
  applyJapanVerdict,
  parseChinaCompanies,
  parseChinaPlan,
  parseJapanJudgment,
  parseJapanPlan,
  parseJapanVerdict,
  parseSameBusiness,
} from "./jobs-china";
import type { ChinaJapan } from "@/lib/domains/jobs/china-shared";

const CN = {
  title: "钉钉发布新版考勤功能",
  url: "https://example.cn/a",
  content: "钉钉是阿里巴巴旗下的企业协作平台。钉钉为中小企业提供考勤打卡、排班和请假审批功能，已服务超过2000万家企业组织。",
};

const good = {
  source: 1,
  name: "钉钉",
  what_ja: "中小企業向けに勤怠打刻やシフト管理の機能を提供している。",
  excerpt: "钉钉为中小企业提供考勤打卡、排班和请假审批功能",
  excerpt_ja: "釘釘は中小企業向けに勤怠打刻、シフト作成、休暇申請の承認機能を提供している",
};

describe("第 1 步：中文搜索词", () => {
  it("收中文的两到三个词", () => {
    const plan = parseChinaPlan({
      zh_business: "面向中小企业的考勤管理 SaaS",
      queries: ["中小企业 考勤 SaaS", "考勤打卡 软件 融资", "考勤 SaaS 排行"],
    });
    expect(plan.zh_business).toBe("面向中小企业的考勤管理 SaaS");
    expect(plan.queries).toHaveLength(3);
  });

  it("带日文假名的词不要，剩不到两个就报错", () => {
    expect(() =>
      parseChinaPlan({ zh_business: "面向中小企业的考勤管理 SaaS", queries: ["勤怠管理 クラウド", "中小企业 考勤 SaaS"] })
    ).toThrow(/不到两个/);
  });

  it("zh_business 写成日文就报错", () => {
    expect(() => parseChinaPlan({ zh_business: "中小企業向けの勤怠管理", queries: ["中小企业 考勤", "考勤 融资"] })).toThrow(/不是中文/);
  });
});

describe("第 2 步：中国的公司", () => {
  it("原文逐字在资料里、名字对得上的留下", () => {
    const out = parseChinaCompanies({ companies: [good] }, [CN]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "钉钉", url: CN.url, title: CN.title });
  });

  it("资料编号写成「资料 1」也认得", () => {
    expect(parseChinaCompanies({ companies: [{ ...good, source: "资料 1" }] }, [CN])).toHaveLength(1);
  });

  it("拿网页标题当原文也认（标题也在这页上）", () => {
    const titled = { title: "神策数据｜大数据分析与营销科技解决方案服务商", url: "https://example.cn/s", content: "成立于2015年。" };
    const pick = {
      source: 1,
      name: "神策数据",
      what_ja: "企業向けにデータ分析のサービスを提供している。",
      excerpt: titled.title,
      excerpt_ja: "神策データ｜ビッグデータ分析とマーケティングテクノロジーのソリューションを提供する会社",
    };
    expect(parseChinaCompanies({ companies: [pick] }, [titled])).toHaveLength(1);
  });

  it("括号里加的拼音、英文名删掉再核对，不因此丢掉整家", () => {
    const out = parseChinaCompanies({ companies: [{ ...good, what_ja: "钉钉（DingTalk）は中小企業向けに勤怠打刻の機能を提供している。" }] }, [CN]);
    expect(out).toHaveLength(1);
    expect(out[0].what_ja).toBe("钉钉は中小企業向けに勤怠打刻の機能を提供している。");
  });

  it("原文不在资料里的丢掉", () => {
    expect(parseChinaCompanies({ companies: [{ ...good, excerpt: "钉钉为所有企业提供考勤打卡功能和工资计算" }] }, [CN])).toEqual([]);
  });

  it("公司名不在原文和标题里的丢掉（防编名字）", () => {
    expect(parseChinaCompanies({ companies: [{ ...good, name: "企业微信" }] }, [CN])).toEqual([]);
  });

  it("译文里多出原文没有的数字就丢掉；说明里的数字只要在整篇资料里就行", () => {
    expect(parseChinaCompanies({ companies: [{ ...good, excerpt_ja: `${good.excerpt_ja}。2000万社が使っている` }] }, [CN])).toEqual([]);
    expect(parseChinaCompanies({ companies: [{ ...good, what_ja: "2000万以上の組織が使う勤怠打刻の機能がある。" }] }, [CN])).toHaveLength(1);
  });

  it("同名的只留一家", () => {
    expect(parseChinaCompanies({ companies: [good, { ...good }] }, [CN])).toHaveLength(1);
  });

  it("说明写成中文就报错（让它重写）", () => {
    expect(() => parseChinaCompanies({ companies: [{ ...good, what_ja: "为中小企业提供考勤功能" }] }, [CN])).toThrow(/没用日文/);
  });

  it("吹捧的词报错", () => {
    expect(() => parseChinaCompanies({ companies: [{ ...good, what_ja: "日本でも有望なサービスを提供している。" }] }, [CN])).toThrow(/有望/);
  });
});

describe("裁判：是不是同一门生意", () => {
  it("第二档概率过 0.5 才算是；没答的算不是", () => {
    const answers = {
      c_0: { probabilities: { "0": 0.2, "1": 0.8 } },
      c_1: { probabilities: { "0": 0.7, "1": 0.3 } },
    };
    expect(parseSameBusiness(answers, 3)).toEqual([true, false, false]);
  });
});

const CONDITIONS = [
  { name: "スマホ打刻が当たり前", there_ja: "中国では従業員がスマホで出退勤を打刻するのが当たり前になっている。", query_ja: "スマホ 打刻 普及率 中小企業" },
  { name: "中小企業がITにお金を払う習慣", there_ja: "中国の中小企業は無料の業務アプリを使い慣れている。", query_ja: "中小企業 IT投資 調査" },
  { name: "勤怠の記録の決まり", there_ja: "中国では勤怠の記録方法に細かい決まりが少ない。", query_ja: "勤怠管理 客観的記録 義務" },
];

describe("第 3 步：日本这边要查的条件", () => {
  it("收两到五个条件和两个先例搜索词", () => {
    const plan = parseJapanPlan({ conditions: CONDITIONS, entrant_queries: ["中国 勤怠管理 日本進出 撤退", "考勤 SaaS 出海 日本"] });
    expect(plan.conditions).toHaveLength(3);
    expect(plan.entrant_queries).toHaveLength(2);
  });

  it("中国那边的说明写了数字就报错（没有出处）", () => {
    const withNumber = [{ ...CONDITIONS[0], there_ja: "中国では8割の企業がスマホで打刻している。" }, CONDITIONS[1]];
    expect(() => parseJapanPlan({ conditions: withNumber, entrant_queries: [] })).toThrow(/数字/);
  });

  it("条件不到两个报错", () => {
    expect(() => parseJapanPlan({ conditions: [CONDITIONS[0]], entrant_queries: [] })).toThrow(/不到两个/);
  });

  it("说明写成中文报错", () => {
    const chinese = [{ ...CONDITIONS[0], there_ja: "中国企业普遍用手机打卡" }, CONDITIONS[1]];
    expect(() => parseJapanPlan({ conditions: chinese, entrant_queries: [] })).toThrow(/没用日文/);
  });
});

const JP = {
  title: "勤怠管理システムの導入率",
  url: "https://example.jp/a",
  content: "中小企業における勤怠管理システムの導入率は約4割にとどまる。紙のタイムカードを使い続ける企業も多い。",
};
const ENTRANT = {
  title: "中国の勤怠SaaSが日本進出",
  url: "https://example.jp/b",
  content: "2019年、中国の勤怠管理サービスA社が日本法人を設立した。2022年に日本から撤退した。",
};
const inputs = [
  { condition: CONDITIONS[0], sources: [JP] },
  { condition: CONDITIONS[1], sources: [] },
];
const judged = {
  i: 0,
  here_ja: "日本の中小企業では勤怠管理システムの導入は約4割にとどまる。",
  holds: "no",
  basis: [{ source: 1, excerpt: "中小企業における勤怠管理システムの導入率は約4割にとどまる" }],
};

describe("第 3 步：日本这边有没有", () => {
  it("有原文的照收；没原文的一律資料なし", () => {
    const out = parseJapanJudgment({ items: [judged, { i: 1, here_ja: "日本でも払う習慣がある。", holds: "yes", basis: [] }], entrants: [] }, inputs, []);
    expect(out.conditions[0]).toMatchObject({ holds: "no", here_ja: judged.here_ja });
    expect(out.conditions[0].basis).toHaveLength(1);
    expect(out.conditions[1]).toMatchObject({ holds: "unclear", here_ja: "日本側の資料が見つかりませんでした。", basis: [] });
  });

  it("日文里的数字原文里没有，就算資料なし", () => {
    const out = parseJapanJudgment({ items: [{ ...judged, here_ja: "導入は約5割にとどまる。" }], entrants: [] }, inputs, []);
    expect(out.conditions[0].holds).toBe("unclear");
  });

  it("来过日本的：原文对得上才留，数字要在原文里", () => {
    const entrant = {
      text_ja: "中国のA社が2019年に日本法人を設立し、2022年に撤退した。",
      basis: [
        { source: 1, excerpt: "2019年、中国の勤怠管理サービスA社が日本法人を設立した" },
        { source: 1, excerpt: "2022年に日本から撤退した" },
      ],
    };
    const out = parseJapanJudgment({ items: [judged], entrants: [entrant, { text_ja: "B社も来ていた。", basis: [] }] }, inputs, [ENTRANT]);
    expect(out.entrants).toHaveLength(1);
    expect(out.entrants[0].basis).toHaveLength(2);
  });

  it("叙述写成中文报错", () => {
    expect(() => parseJapanJudgment({ items: [{ ...judged, here_ja: "日本中小企业约4割在用考勤系统" }], entrants: [] }, inputs, [])).toThrow(/没用日文/);
  });
});

describe("裁判：日本那边的原文说没说到点子上", () => {
  const quote = { url: "https://example.jp/a", title: "t", excerpt: "中小企業における勤怠管理システムの導入率は約4割にとどまる" };
  const japan: ChinaJapan = {
    conditions: [
      { name: "A", there_ja: "中国ではこうなっている。", here_ja: "日本ではこうだ。", holds: "no", basis: [quote] },
      { name: "B", there_ja: "中国ではこうなっている。", here_ja: "日本側の資料が見つかりませんでした。", holds: "unclear", basis: [] },
      { name: "C", there_ja: "中国ではこうなっている。", here_ja: "日本ではああだ。", holds: "yes", basis: [quote] },
    ],
    entrants: [
      { text_ja: "X社が来た。", basis: [quote] },
      { text_ja: "Y社が来た。", basis: [quote] },
    ],
  };

  it("没原文的条件不问、算过；问了没答的算没过", () => {
    const verdict = parseJapanVerdict(
      { k_0: { probabilities: { "0": 0.1, "1": 0.9 } }, e_1: { probabilities: { "0": 0.2, "1": 0.8 } } },
      japan
    );
    expect(verdict).toEqual({ conditions: [true, true, false], entrants: [false, true] });
  });

  it("没过的条件改成資料なし，没过的来过日本丢掉", () => {
    const out = applyJapanVerdict(japan, { conditions: [true, true, false], entrants: [false, true] });
    expect(out.conditions[0]).toBe(japan.conditions[0]);
    expect(out.conditions[2]).toMatchObject({ holds: "unclear", here_ja: "日本側の資料が見つかりませんでした。", basis: [] });
    expect(out.entrants.map((e) => e.text_ja)).toEqual(["Y社が来た。"]);
  });
});
