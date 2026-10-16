import { describe, expect, it } from "vitest";
import {
  atsOf,
  belowFloor,
  experienceVerdict,
  hireTypeOrder,
  careerQuery,
  effectiveStatus,
  locationVerdict,
  marketRows,
  matchCounts,
  normalizeUrl,
  parseProfileForm,
  pickCandidates,
  postingKey,
  salaryDiff,
  searchQuery,
  sectionText,
  type MarketApp,
} from "./shared";

describe("年收：只说差多少", () => {
  it("salaryDiff", () => {
    expect(salaryDiff(500, 400, 450)).toBe("比现在少 50–100 万");
    expect(salaryDiff(500, 550, 700)).toBe("比现在多 50–200 万");
    expect(salaryDiff(500, 450, 600)).toBe("比现在少 50 万到多 100 万");
    expect(salaryDiff(500, 500, 500)).toBe("跟现在一样");
    expect(salaryDiff(500, 450, null)).toBe("比现在少 50 万");
    expect(salaryDiff(500, null, null)).toBeNull();
    expect(salaryDiff(null, 400, 500)).toBeNull();
  });

  it("belowFloor：上限都够不着下限才标", () => {
    expect(belowFloor(450, 350, 420)).toBe(true);
    expect(belowFloor(450, 400, 500)).toBe(false);
    expect(belowFloor(450, null, null)).toBe(false);
    expect(belowFloor(null, 300, 300)).toBe(false);
  });
});

describe("经验要求和招聘类型", () => {
  it("experienceVerdict：不问的能投；要 1 年的勉强；要 2 年以上的筛掉；没写的说不清", () => {
    expect(experienceVerdict(0)).toBe("fits");
    expect(experienceVerdict(1)).toBe("stretch");
    expect(experienceVerdict(2)).toBe("too_much");
    expect(experienceVerdict(5)).toBe("too_much");
    expect(experienceVerdict(null)).toBe("unknown");
    expect(experienceVerdict(undefined)).toBe("unknown");
  });

  it("hireTypeOrder：中途排在第二新卒前面，说不清的在中间", () => {
    const items = [{ id: "s", hire_type: "second_new" as const }, { id: "u", hire_type: "unclear" as const }, { id: "m", hire_type: "mid" as const }];
    expect([...items].sort((a, b) => hireTypeOrder(a.hire_type) - hireTypeOrder(b.hire_type)).map((i) => i.id)).toEqual(["m", "u", "s"]);
  });
});

describe("地点", () => {
  it("全远程、基本远程不管在哪都留；勤务地含大阪的留；说不清的保留", () => {
    expect(locationVerdict("東京都港区", "full", ["大阪"])).toBe("keep");
    expect(locationVerdict("東京都港区", "mostly", ["大阪"])).toBe("keep");
    expect(locationVerdict("大阪府大阪市北区", "none", ["大阪"])).toBe("keep");
    expect(locationVerdict("東京都港区", "hybrid", ["大阪"])).toBe("drop");
    expect(locationVerdict("東京都港区", "unknown", ["大阪"])).toBe("unclear");
    expect(locationVerdict("", "none", ["大阪"])).toBe("unclear");
  });
});

describe("去重", () => {
  it("postingKey：株式会社、空白、全半角、括号都不算", () => {
    expect(postingKey("株式会社ＡＢＣ", "データアナリスト（中途）")).toBe(postingKey("ABC", "データアナリスト 中途"));
    expect(postingKey("ABC", "データアナリスト")).not.toBe(postingKey("ABC", "事業企画"));
  });

  it("normalizeUrl：去掉 # 和跟踪参数、结尾的 /", () => {
    expect(normalizeUrl("https://a.jp/jobs/12/?utm_source=x&id=3#top")).toBe("https://a.jp/jobs/12?id=3");
    expect(normalizeUrl("https://a.jp/")).toBe("https://a.jp/");
    expect(normalizeUrl("not a url ")).toBe("not a url");
  });
});

describe("搜索", () => {
  it("searchQuery：地点之外总带上フルリモート", () => {
    expect(searchQuery("data", ["大阪"])).toBe("データアナリスト 中途採用 未経験可 求人 大阪 OR フルリモート");
    expect(searchQuery("chinese", [])).toBe("中国語 活かせる 中途採用 未経験可 求人 フルリモート");
    expect(searchQuery("consulting", ["大阪"])).not.toContain("第二新卒");
  });

  it("careerQuery：职位关键词和地点，地点之外带上リモート（网站范围另外给）", () => {
    expect(careerQuery("planning", ["大阪"])).toBe("事業企画 経営企画 中途 未経験歓迎 求人 大阪 リモート");
  });

  it("atsOf：按域名认招聘系统，子域名也认，别的不认", () => {
    expect(atsOf("https://hrmos.co/pages/abc/jobs/123")).toBe("hrmos");
    expect(atsOf("https://herp.careers/v1/abc/xyz")).toBe("herp");
    expect(atsOf("https://job-boards.greenhouse.io/abc/jobs/1")).toBe("greenhouse");
    expect(atsOf("https://jobs.lever.co/abc/1")).toBe("lever");
    expect(atsOf("https://doda.jp/DodaFront/View/JobSearchDetail/j_jid__1/")).toBeNull();
    expect(atsOf("https://evilhrmos.co/x")).toBeNull();
    expect(atsOf(null)).toBeNull();
    expect(atsOf("not a url")).toBeNull();
  });

  it("pickCandidates：四类轮流，每类最多 2 条，一共最多 8 条，不在四类里的不取", () => {
    const items = [
      { id: "d1", category: "data" as const },
      { id: "d2", category: "data" as const },
      { id: "d3", category: "data" as const },
      { id: "c1", category: "consulting" as const },
      { id: "n1", category: "none" as const },
      { id: "p1", category: "planning" as const },
    ];
    expect(pickCandidates(items, ["data", "consulting", "planning", "chinese"]).map((i) => i.id)).toEqual(["d1", "c1", "p1", "d2"]);
    expect(pickCandidates(items, ["data"], 8, 2).map((i) => i.id)).toEqual(["d1", "d2"]);
    expect(pickCandidates(items, ["data", "consulting"], 2, 2).map((i) => i.id)).toEqual(["d1", "c1"]);
  });
});

describe("投递", () => {
  const base: MarketApp = {
    posting_id: "p",
    company_name: "A社",
    title: "アナリスト",
    category: "data",
    status: "applied",
    events: [],
    applied_on: "2026-10-01",
    offered_salary: null,
  };

  it("effectiveStatus：投了以后 21 天没变化才算没回音", () => {
    expect(effectiveStatus(base, "2026-10-21")).toBe("applied");
    expect(effectiveStatus(base, "2026-10-22")).toBe("no_reply");
    expect(effectiveStatus({ ...base, events: [{ status: "applied", on: "2026-10-10" }] }, "2026-10-22")).toBe("applied");
    expect(effectiveStatus({ ...base, status: "replied" }, "2026-12-01")).toBe("replied");
  });

  it("marketRows：只数次数；满 5 家才给比例；回了包括后来约了面试的", () => {
    const apps: MarketApp[] = [
      {
        ...base,
        posting_id: "1",
        status: "interview",
        events: [
          { status: "replied", on: "2026-10-05" },
          { status: "interview", on: "2026-10-08" },
        ],
        offered_salary: 480,
      },
      { ...base, posting_id: "2", status: "rejected", events: [{ status: "rejected", on: "2026-10-05" }] },
      { ...base, posting_id: "3", status: "replied", events: [{ status: "replied", on: "2026-10-09" }], offered_salary: 520 },
      { ...base, posting_id: "4" },
      { ...base, posting_id: "5", category: "consulting" },
    ];
    const [data, consulting] = marketRows(apps, ["data", "consulting"], "2026-10-30");
    expect(data).toMatchObject({ applied: 4, replied: 2, interview: 1, rejected: 1, noReply: 1, replyRate: null, salaryRange: [480, 520] });
    expect(consulting).toMatchObject({ applied: 1, replied: 0, noReply: 1, salaryRange: null });
    const five = marketRows([...apps.slice(0, 4), { ...base, posting_id: "6" }], ["data"], "2026-10-30")[0];
    expect(five.replyRate).toBe(40);
  });
});

describe("对照", () => {
  it("matchCounts：必须和加分分开数", () => {
    const conditions = [
      { text: "a", quote: "aaaa", required: true },
      { text: "b", quote: "bbbb", required: true },
      { text: "c", quote: "cccc", required: false },
    ];
    expect(matchCounts(conditions, { entry_ids: [["e1"], [], []], blocker: { index: 2, text: "x" } })).toEqual({
      required: { have: 1, missing: 1 },
      bonus: { have: 0, missing: 1 },
    });
  });
});

describe("简历", () => {
  it("sectionText：他改过的用他的；技能和经历一句一行", () => {
    const sentences = [
      { text: "A。", entry_ids: ["e"] },
      { text: "B。", entry_ids: ["e"] },
    ];
    expect(sectionText("pr", { sentences })).toBe("A。B。");
    expect(sectionText("skills", { sentences })).toBe("A。\nB。");
    expect(sectionText("pr", { sentences, user_text: "自分で書いた。" })).toBe("自分で書いた。");
    expect(sectionText("pr", undefined)).toBe("");
  });
});

describe("条件表单", () => {
  const form = (entries: [string, string][]) => ({
    get: (name: string) => entries.find(([k]) => k === name)?.[1] ?? null,
    getAll: (name: string) => entries.filter(([k]) => k === name).map(([, v]) => v),
  });

  it("parseProfileForm：至少一类、年收写万日元整数、地点用顿号隔开", () => {
    const ok = parseProfileForm(
      form([
        ["categories", "data"],
        ["categories", "chinese"],
        ["categories", "bogus"],
        ["locations", "大阪、京都 "],
        ["salary_now", "500"],
        ["salary_floor", ""],
        ["visa", "gijinkoku"],
        ["name", " 呉 山 "],
      ])
    );
    expect(typeof ok !== "string" && ok).toMatchObject({
      categories: ["data", "chinese"],
      locations: ["大阪", "京都"],
      salaryNow: 500,
      salaryFloor: null,
      visa: "gijinkoku",
      personal: { name: "呉 山", kana: "" },
    });
    expect(parseProfileForm(form([["salary_now", "500"]]))).toBe("至少选一类岗位");
    expect(
      parseProfileForm(
        form([
          ["categories", "data"],
          ["salary_now", "5,000,000"],
        ])
      )
    ).toMatch(/万日元/);
  });
});
