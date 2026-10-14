import { describe, expect, it } from "vitest";
import { buildDailyEmail, emailConfig, isFriday, isMonday } from "./notify";

describe("早上的提醒邮件", () => {
  it("没配就说缺什么；收信地址不填就发给自己", () => {
    expect(emailConfig({})).toEqual({ ready: false, missing: ["GMAIL_USER", "GMAIL_APP_PASSWORD"] });
    expect(emailConfig({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x" })).toEqual({ ready: true, from: "a@gmail.com", to: "a@gmail.com" });
    expect(emailConfig({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x", NOTIFY_EMAIL_TO: "b@x.com" })).toMatchObject({ to: "b@x.com" });
  });

  it("先说今天的练习，再列到期、问题新证据和各节标题；带链接", () => {
    const { subject, text } = buildDailyEmail({
      date: "2026-10-13",
      practice: { question: "三个月后定存利率会过 0.5% 吗？", headline: "日银加息" },
      overview: "今天最重要的是日银加息。",
      sections: [
        { title: "今天的世界", items: [{ headline: "物流业招外国司机", related_question: { id: "q", question: "物流会不会倒一片", why: "w" } }] },
        { title: "新工具", items: [] },
      ],
      dueCount: 2,
      freshQuestions: [{ question: "中国哪些做法会来日本", freshCount: 3 }],
      url: "https://app.example",
    });
    expect(subject).toContain("今天的练习");
    expect(text.indexOf("今天的练习")).toBe(0);
    expect(text).toContain("有 2 条判断到期了");
    expect(text).toContain("新冒出来 3 条证据");
    expect(text).toContain("↳ 跟你在追的「物流会不会倒一片」有关");
    expect(text).not.toContain("【新工具】");
    expect(text).toContain("https://app.example/signals");
  });
});

describe("周一提一句慢变量", () => {
  it("周一的邮件带慢变量链接，别的日子不带", () => {
    const base = { practice: null, overview: null, sections: [], dueCount: 0, freshQuestions: [], url: "https://app.example" };
    expect(isMonday("2026-10-12")).toBe(true);
    expect(buildDailyEmail({ ...base, date: "2026-10-12" }).text).toContain("/signals/slow");
    expect(buildDailyEmail({ ...base, date: "2026-10-13" }).text).not.toContain("/signals/slow");
  });
});

describe("周五提醒周刊", () => {
  const base = { practice: null, overview: null, sections: [], dueCount: 0, freshQuestions: [], url: "https://app.example", date: "2026-10-16" };
  it("还没写、写了没发说的不一样；发了就不提", () => {
    expect(isFriday("2026-10-16")).toBe(true);
    expect(isFriday("2026-10-15")).toBe(false);
    expect(buildDailyEmail({ ...base, issueReminder: "unwritten" }).text).toContain("这周的周刊还没写");
    expect(buildDailyEmail({ ...base, issueReminder: "unpublished" }).text).toContain("还没发出去");
    expect(buildDailyEmail({ ...base, issueReminder: "unwritten" }).text).toContain("https://app.example/signals/issue");
    expect(buildDailyEmail({ ...base, issueReminder: null }).text).not.toContain("周刊");
  });
});
