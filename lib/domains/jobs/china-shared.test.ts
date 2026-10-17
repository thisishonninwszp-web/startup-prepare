import { describe, expect, it } from "vitest";
import {
  assertJapanese,
  assertNoHype,
  cleanBusiness,
  nextChinaStep,
  quoteLang,
  type ChinaCompanies,
  type ChinaJapan,
  type ChinaPlan,
} from "./china-shared";

const plan: ChinaPlan = { zh_business: "面向中小企业的考勤管理 SaaS", queries: ["中小企业 考勤 SaaS", "考勤打卡 软件 融资"] };
const one: ChinaCompanies = {
  read: 6,
  companies: [
    {
      name: "钉钉",
      what_ja: "中小企業向けに勤怠打刻の機能を提供している。",
      excerpt: "钉钉为中小企业提供考勤打卡、排班和请假审批功能",
      excerpt_ja: "釘釘は中小企業向けに勤怠打刻、シフト作成、休暇申請の承認機能を提供している",
      url: "https://example.cn/a",
      title: "钉钉发布新版考勤功能",
      same: true,
    },
  ],
};
const japan: ChinaJapan = { conditions: [], entrants: [] };

describe("下一步跑哪一步", () => {
  it("按哪几列是空的接着跑，失败的也一样", () => {
    expect(nextChinaStep({ status: "failed", plan: null, companies: null, japan: null })).toBe("plan");
    expect(nextChinaStep({ status: "planned", plan, companies: null, japan: null })).toBe("companies");
    expect(nextChinaStep({ status: "failed", plan, companies: null, japan: null })).toBe("companies");
    expect(nextChinaStep({ status: "companies", plan, companies: one, japan: null })).toBe("japan");
    expect(nextChinaStep({ status: "failed", plan, companies: one, japan: null })).toBe("japan");
  });

  it("跑完、没找到就不再跑", () => {
    expect(nextChinaStep({ status: "done", plan, companies: one, japan })).toBeNull();
    expect(nextChinaStep({ status: "none_found", plan, companies: { read: 3, companies: [] }, japan: null })).toBeNull();
  });
});

describe("日文和禁用词", () => {
  it("没有平假名的算没用日文", () => {
    expect(() => assertJapanese(["中小企業向けに勤怠打刻の機能を提供している。"])).not.toThrow();
    expect(() => assertJapanese(["为中小企业提供考勤打卡功能"])).toThrow(/没用日文/);
  });

  it("吹捧、下结论的词报错", () => {
    expect(() => assertNoHype(["日本でも有望な市場だ"])).toThrow(/有望/);
    expect(() => assertNoHype(["日本ではまだ導入が少ない"])).not.toThrow();
  });
});

describe("输入那一句", () => {
  it("去掉多余空白，太短的不收", () => {
    expect(cleanBusiness("  中小企業向けの   勤怠管理SaaS ")).toBe("中小企業向けの 勤怠管理SaaS");
    expect(() => cleanBusiness("ab")).toThrow();
  });
});

describe("原文是哪种语言", () => {
  it("有假名是日文，没有是中文", () => {
    expect(quoteLang("中小企業における勤怠管理システムの導入率は約4割にとどまる")).toBe("ja");
    expect(quoteLang("钉钉为中小企业提供考勤打卡功能")).toBe("zh-CN");
  });
});
