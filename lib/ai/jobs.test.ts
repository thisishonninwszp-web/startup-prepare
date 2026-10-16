import { describe, expect, it } from "vitest";
import { assertNoPraise, parseEntryDraft, parseFieldMap, parseMatch, parsePostingFacts, parseTailored } from "./jobs";
import type { FormField } from "@/lib/domains/jobs/fill-shared";

const BODY = [
  "職種：データアナリスト",
  "株式会社ABC",
  "勤務地：大阪府大阪市北区",
  "年収：450万円〜600万円",
  "応募資格：Excelでのデータ集計の実務経験",
  "応募資格：Excelでのデータ集計の実務経験1年以上",
  "中途採用（未経験歓迎）",
  "歓迎：中国語でのビジネス会話ができる方",
  "仕事内容：広告データの分析と改善提案を担当していただきます",
  "残業：月20時間程度",
].join("\n");

describe("抽岗位", () => {
  const good = {
    is_posting: true,
    company: "株式会社ABC",
    title: "データアナリスト",
    location: "大阪府大阪市北区",
    remote: "hybrid",
    salary_min: 450,
    salary_max: 600,
    salary_quote: "年収：450万円〜600万円",
    conditions: [
      { text: "Excel 集计经验", quote: "Excelでのデータ集計の実務経験", required: true },
      { text: "中文商务会话", quote: "中国語でのビジネス会話ができる方", required: false },
      { text: "编的", quote: "Pythonの実務経験3年以上", required: true },
    ],
    terms: [{ label: "加班", quote: "残業：月20時間程度" }],
    category: "data",
    visa: { fit: "fits", quote: "広告データの分析と改善提案を担当していただきます", reason: "分析和提案属于专业工作" },
    hire_type: "mid",
    experience: { min_years: 1, quote: "応募資格：Excelでのデータ集計の実務経験1年以上" },
  };

  it("原话对不上的条件丢掉；年收数字要在原话里", () => {
    const r = parsePostingFacts(good, BODY);
    expect(r.is_posting).toBe(true);
    if (!r.is_posting) return;
    expect(r.facts.conditions.map((c) => c.text)).toEqual(["Excel 集计经验", "中文商务会话"]);
    expect([r.facts.salary_min, r.facts.salary_max]).toEqual([450, 600]);
    expect(r.facts.visa.fit).toBe("fits");
    const bad = parsePostingFacts({ ...good, salary_max: 700 }, BODY);
    expect(bad.is_posting && [bad.facts.salary_min, bad.facts.salary_max]).toEqual([null, null]);
  });

  it("签证没有原话撑着就算说不清；不是招聘页直接返回", () => {
    const r = parsePostingFacts({ ...good, visa: { fit: "fits", quote: "どこにもない文", reason: "x" } }, BODY);
    expect(r.is_posting && r.facts.visa).toEqual({ fit: "unclear", quote: "", reason: "x" });
    expect(parsePostingFacts({ is_posting: false }, BODY)).toEqual({ is_posting: false });
    expect(() => parsePostingFacts({ ...good, company: "" }, BODY)).toThrow(/公司名/);
  });

  it("招聘类型和经验年数：原话对得上才认；年数要在原话里；写着未経験的算 0", () => {
    const r = parsePostingFacts(good, BODY);
    expect(r.is_posting && [r.facts.hire_type, r.facts.experience]).toEqual(["mid", { min_years: 1, quote: "応募資格：Excelでのデータ集計の実務経験1年以上" }]);
    const wrongYears = parsePostingFacts({ ...good, experience: { min_years: 3, quote: "応募資格：Excelでのデータ集計の実務経験1年以上" } }, BODY);
    expect(wrongYears.is_posting && wrongYears.facts.experience).toEqual({ min_years: null, quote: "" });
    const none = parsePostingFacts({ ...good, experience: { min_years: 0, quote: "中途採用（未経験歓迎）" } }, BODY);
    expect(none.is_posting && none.facts.experience?.min_years).toBe(0);
    const odd = parsePostingFacts({ ...good, hire_type: "bogus", experience: null }, BODY);
    expect(odd.is_posting && [odd.facts.hire_type, odd.facts.experience]).toEqual(["unclear", { min_years: null, quote: "" }]);
  });

  it("年收写成円也认（4500000 = 450 万）", () => {
    const body = "年収 4,500,000円〜6,000,000円";
    const r = parsePostingFacts({ ...good, salary_quote: "年収 4,500,000円〜6,000,000円", conditions: [], terms: [], visa: {} }, body);
    expect(r.is_posting && [r.facts.salary_min, r.facts.salary_max]).toEqual([450, 600]);
  });
});

describe("对照", () => {
  it("parseMatch：不认识的编号丢掉；blocker 必须写、不许夸", () => {
    const r = parseMatch(
      {
        matches: [
          { index: 1, entry_ids: ["E1", "E9"] },
          { index: 5, entry_ids: ["E1"] },
        ],
        blocker: { index: 2, text: "第 2 条要中文商务会话，底稿里没有。" },
      },
      2,
      new Set(["E1"])
    );
    expect(r.entry_ids).toEqual([["E1"], []]);
    expect(r.blocker.index).toBe(2);
    expect(() => parseMatch({ matches: [], blocker: { text: "" } }, 2, new Set())).toThrow(/blocker/);
    expect(() => parseMatch({ matches: [], blocker: { index: 1, text: "你很优秀，加油" } }, 2, new Set())).toThrow(/夸/);
  });

  it("assertNoPraise", () => {
    expect(() => assertNoPraise("这条底稿里没有。")).not.toThrow();
    expect(() => assertNoPraise("很有潜力")).toThrow();
  });
});

describe("底稿草稿", () => {
  it("parseEntryDraft：原话里没有的数字所在的句子删掉；追问不许夸", () => {
    const r = parseEntryDraft({ draft_ja: "広告データを分析。CVRを15%改善。", follow_up: "改善是跟哪个月比的？" }, "我分析广告数据");
    expect(r).toEqual({
      draft_ja: "広告データを分析。",
      dropped: [{ text: "CVRを15%改善。", reason: "数字「15」在你的原话里找不到" }],
      follow_up: "改善是跟哪个月比的？",
    });
    expect(() => parseEntryDraft({ draft_ja: "", follow_up: "" }, "x")).toThrow(/draft_ja/);
  });
});

describe("改简历", () => {
  const sources = new Map([
    ["E1", "Focus\n2026-04\nGA4 看广告数据，每周报 3 次"],
    ["E2", "JLPT N1"],
  ]);
  const value = {
    summary: [{ text: "GA4で広告データを分析。", entry_ids: ["E1"] }],
    history: [
      { text: "週3回報告。", entry_ids: ["E1"] },
      { text: "売上を2倍に。", entry_ids: ["E1"] },
    ],
    skills: [{ text: "JLPT N1。", entry_ids: ["E2"] }],
    pr: [{ text: "粘り強い。", entry_ids: [] }],
    motivation: [{ text: "貴社のSaaS事業でGA4の経験を活かしたい。", entry_ids: ["E1"] }],
    probes: [
      { sentence: "週3回報告。", question: "报告给谁？他们看完做了什么决定？" },
      { sentence: "売上を2倍に。", question: "被删的句子不该出现" },
    ],
  };

  it("parseTailored：每段各自核对；志望動機可以用招聘页上的词；追问只留留下来的句子", () => {
    const r = parseTailored(value, sources, "SaaS事業の企画");
    expect(r.sections.history.sentences.map((s) => s.text)).toEqual(["週3回報告。"]);
    expect(r.sections.pr.sentences).toEqual([]);
    expect(r.sections.motivation.sentences).toHaveLength(1);
    expect(r.dropped.map((d) => [d.section, d.reason])).toEqual([
      ["history", "数字「2」在底稿里找不到"],
      ["pr", "没标出处"],
    ]);
    expect(r.probes).toEqual([{ sentence: "週3回報告。", question: "报告给谁？他们看完做了什么决定？" }]);
  });

  it("職務要約和職務経歴一句都没留下就算失败（让 AI 重写一次）", () => {
    expect(() => parseTailored({ ...value, summary: [], history: [] }, sources, "")).toThrow(/職務要約/);
  });
});

describe("表单格子对应", () => {
  const field = (index: number, kind: FormField["kind"], label: string): FormField => ({
    index,
    kind,
    type: kind,
    label,
    required: false,
    maxLength: null,
    options: [],
  });
  const fields = [
    field(0, "text", "メールアドレス"),
    field(1, "text", "メールアドレス（確認）"),
    field(2, "file", "履歴書・職務経歴書"),
    field(3, "checkbox", "個人情報の取り扱いに同意する"),
    field(4, "textarea", "志望動機"),
    field(5, "select", "都道府県"),
    field(6, "text", "建物名 [例）クロスタワー12F]"),
  ];

  it("parseFieldMap：不认识的格子和键丢掉；文件格只能放 PDF；同意框和勾选框不对应", () => {
    const r = parseFieldMap(
      {
        map: [
          { index: 0, key: "email" },
          { index: "1", key: "email" },
          { index: 2, key: "resume_pdf" },
          { index: 3, key: "name" },
          { index: 4, key: "resume_pdf" },
          { index: 5, key: "address" },
          { index: 6, key: "address" },
          { index: 9, key: "phone" },
          { index: 0, key: "bogus" },
        ],
      },
      fields
    );
    expect(Array.from(r.entries())).toEqual([
      [0, "email"],
      [1, "email"],
      [2, "resume_pdf"],
      [5, "address"],
    ]);
    expect(parseFieldMap({}, fields).size).toBe(0);
  });
});
