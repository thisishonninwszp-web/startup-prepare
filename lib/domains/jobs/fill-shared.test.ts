import { describe, expect, it } from "vitest";
import { fillValues, fitsMaxLength, isConsentField, kanaForLabel, looksSubmitted, pickOption, resumeHtml, splitName } from "./fill-shared";
import { EMPTY_PERSONAL, type JobProfile, type ResumeSection, type ResumeSectionKey } from "./shared";

const profile: JobProfile = {
  categories: ["data"],
  locations: ["大阪"],
  salaryNow: 500,
  salaryFloor: 450,
  visa: "gijinkoku",
  personal: {
    ...EMPTY_PERSONAL,
    name: "呉　山",
    kana: "ご さん",
    email: "a@example.jp",
    birth: "1999/04/07",
    school: "大阪大学 経済学部",
    employer: "株式会社Focus",
    address: "大阪府大阪市北区1-1",
    salary_want: "500万円以上",
    visa_expiry: "2028-03-31",
  },
  lastSearchOn: null,
};

const sections = (pr: string): Record<ResumeSectionKey, ResumeSection> => ({
  summary: { sentences: [{ text: "要約。", entry_ids: ["e"] }] },
  history: { sentences: [{ text: "A。", entry_ids: ["e"] }, { text: "B。", entry_ids: ["e"] }] },
  skills: { sentences: [] },
  pr: { sentences: [{ text: pr, entry_ids: ["e"] }] },
  motivation: { sentences: [], user_text: "自分で書いた<動機>" },
});

describe("填表的值（代码算，不经过 AI）", () => {
  it("splitName：中间有一个空格（半角或全角）才拆", () => {
    expect(splitName("呉　山")).toEqual({ last: "呉", first: "山" });
    expect(splitName(" Wu Shan ")).toEqual({ last: "Wu", first: "Shan" });
    expect(splitName("呉山")).toBeNull();
    expect(splitName("A B C")).toBeNull();
  });

  it("fillValues：个人信息、年收、在留资格、简历几段", () => {
    const v = fillValues(profile, { sections: sections("PR。") });
    expect(v).toMatchObject({
      name: "呉　山",
      last_name: "呉",
      first_name: "山",
      last_kana: "ご",
      first_kana: "さん",
      salary_now: "500万円",
      salary_want: "500万円以上",
      visa: "技術・人文知識・国際業務（在留期限：2028-03-31）",
      history: "A。\nB。",
      pr: "PR。",
      motivation: "自分で書いた<動機>",
      phone: "",
      birth_year: "1999",
      birth_month: "4",
      birth_day: "7",
      school: "大阪大学 経済学部",
      employer: "株式会社Focus",
    });
    expect(fillValues({ ...profile, personal: { ...profile.personal, birth: "平成11年" } }, null)).toMatchObject({ birth_year: "", birth_month: "", birth_day: "" });
    expect(fillValues({ ...profile, visa: "none", salaryNow: null }, null)).toMatchObject({ visa: "", salary_now: "", pr: "" });
  });

  it("kanaForLabel：「ふりがな」给平假名，「フリガナ／カナ」给片假名，别的原样", () => {
    expect(kanaForLabel("ふりがな 必須 [例）たなか たろう]", "ゴ サンチヘイ")).toBe("ご さんちへい");
    expect(kanaForLabel("フリガナ", "ご さんちへい")).toBe("ゴ サンチヘイ");
    expect(kanaForLabel("セイ（カナ）", "ご")).toBe("ゴ");
    expect(kanaForLabel("氏名", "ゴ サンチヘイ")).toBe("ゴ サンチヘイ");
  });

  it("fitsMaxLength：没有上限的都算放得下", () => {
    expect(fitsMaxLength("あいう", 3)).toBe(true);
    expect(fitsMaxLength("あいうえ", 3)).toBe(false);
    expect(fitsMaxLength("あいうえ", null)).toBe(true);
  });
});

describe("表单", () => {
  it("pickOption：一模一样的优先；否则挑出现在值里最长的那个", () => {
    const prefectures = ["選択してください", "大阪", "大阪府", "京都府"];
    expect(pickOption(prefectures, "大阪府大阪市北区1-1")).toBe(2);
    expect(pickOption(["はい", "いいえ"], "はい")).toBe(0);
    expect(pickOption(prefectures, "東京都")).toBeNull();
    expect(pickOption(prefectures, "")).toBeNull();
  });

  it("pickOption：数字按数值比（年、月、日的下拉框）", () => {
    expect(pickOption(["--", "1998年", "1999年", "2000年"], "1999")).toBe(2);
    expect(pickOption(["月", "01", "02", "03", "04"], "4")).toBe(4);
    expect(pickOption(["", "4月", "14月"], "4")).toBe(1);
    expect(pickOption(["1", "2"], "7")).toBeNull();
  });

  it("isConsentField：同意、规约、个人信息的勾选框一律不替他勾", () => {
    expect(isConsentField({ kind: "checkbox", label: "個人情報の取り扱いに同意する" })).toBe(true);
    expect(isConsentField({ kind: "checkbox", label: "I agree to the Privacy Policy" })).toBe(true);
    expect(isConsentField({ kind: "checkbox", label: "メールマガジンを受け取る" })).toBe(false);
    expect(isConsentField({ kind: "text", label: "同意書の番号" })).toBe(false);
  });

  it("looksSubmitted：页面变了、而且变成提交成功的样子才算；表单上本来就有的字不算", () => {
    const form = { startUrl: "https://hrmos.co/pages/a/jobs/1/apply", startText: "送信完了後、担当者よりご連絡します" };
    expect(looksSubmitted({ ...form, url: form.startUrl, text: form.startText })).toBe(false);
    expect(looksSubmitted({ ...form, url: "https://hrmos.co/pages/a/jobs/1/apply/complete", text: "" })).toBe(true);
    expect(looksSubmitted({ ...form, url: form.startUrl, text: "ご応募いただきありがとうございました" })).toBe(true);
    expect(looksSubmitted({ ...form, url: "https://hrmos.co/pages/a/jobs/1/apply/confirm", text: "入力内容の確認" })).toBe(false);
    expect(
      looksSubmitted({ startUrl: "https://jobs.lever.co/a/applied-ml/apply", startText: "", url: "https://jobs.lever.co/a/applied-ml/apply", text: "" })
    ).toBe(false);
  });
});

describe("職務経歴書 PDF 用的 HTML", () => {
  it("resumeHtml：个人信息和简历都转义；志望動機另起一页", () => {
    const html = resumeHtml({ personal: profile.personal, resume: { sections: sections("<b>PR</b>") }, date: "2026-10-16" });
    expect(html).toContain("2026年10月16日現在");
    expect(html).toContain("呉　山");
    expect(html).toContain("&lt;b&gt;PR&lt;/b&gt;");
    expect(html).toContain("自分で書いた&lt;動機&gt;");
    expect(html).not.toContain("<b>PR</b>");
    expect(html.indexOf("志望動機")).toBeGreaterThan(html.indexOf("page-break-before"));
  });
});
