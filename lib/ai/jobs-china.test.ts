import { describe, expect, it } from "vitest";
import { parseChinaCompanies, parseChinaPlan, parseSameBusiness } from "./jobs-china";

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
