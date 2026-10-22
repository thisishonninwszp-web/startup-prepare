import { describe, expect, it } from "vitest";
import { buildDailyEmail, buildDailyEmailHtml, emailConfig, firstSentence, isFriday, isMonday } from "./notify";

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

describe("邮件更丰富：最值得点开的几条带背景，各条带一句话", () => {
  const input = {
    date: "2026-10-13",
    digest: "今天最重要的是日银加息。",
    top: [
      {
        signal_id: "s1",
        headline: "日银加息到0.75%",
        background: "日本银行决定把政策利率提高到0.75%。地方银行下周跟进。",
        flow: { cause: "物价连续上涨", event: "日银加息到0.75%", affected: "中小企业", watch: "地方银行下周的贷款利率" },
      },
    ],
    practice: null,
    overview: null,
    sections: [{ title: "今天的世界", items: [{ headline: "物流业招外国司机", background: "人手不足越来越严重。好几家公司开始招外国司机。" }] }],
    dueCount: 0,
    freshQuestions: [],
    url: "https://app.example",
  };

  it("纯文字版：总览之后是最值得点开的几条（带背景），各条下面一句话", () => {
    const { text } = buildDailyEmail(input);
    expect(text.indexOf("最值得点开的几条")).toBeGreaterThan(text.indexOf("今天最重要的是日银加息"));
    expect(text).toContain("日本银行决定把政策利率提高到0.75%。地方银行下周跟进。");
    expect(text).toContain("  人手不足越来越严重。");
    expect(text).not.toContain("好几家公司开始招外国司机");
  });

  it("HTML 版：有图的嵌 cid 图片，没图只有文字；正文里的尖括号转义", () => {
    const html = buildDailyEmailHtml({ ...input, digest: "A<B" }, { s1: "flow-s1@ideaos" });
    expect(html).toContain('src="cid:flow-s1@ideaos"');
    expect(html).toContain("日银加息到0.75%");
    expect(html).toContain("A&lt;B");
    expect(buildDailyEmailHtml(input, {})).not.toContain("cid:");
    expect(html).toContain("https://app.example/signals");
  });

  it("一句话就是第一句", () => {
    expect(firstSentence("第一句。第二句。")).toBe("第一句。");
    expect(firstSentence("没有句号")).toBe("没有句号");
  });
});

describe("每人一份的几块：在跟的事、回头看、预测题", () => {
  const base = { date: "2026-10-22", practice: null, overview: null, sections: [], dueCount: 0, freshQuestions: [], url: "https://app.example" };
  const input = {
    ...base,
    stories: [{ title: "美团进日本", reason: "你标了「重要」", updates: [{ id: "u1", title: "美团在东京招人" }] }],
    lookBack: { when: "一个月前", mark: "存疑", note: "数字对不上", signalId: "s1", title: "某某融资", later: [] },
    forecastTodo: { toForecast: 2, first: "日银 12 月会加息吗？", toConfirm: 1 },
  };

  it("纯文字版：在跟的事和回头看在练习之前，预测题跟到期判断放一起", () => {
    const { text } = buildDailyEmail(input);
    expect(text).toContain("你在跟的事，有新消息\n· 美团进日本（你标了「重要」）\n  → 美团在东京招人");
    expect(text).toContain("回头看\n一个月前你标了「存疑」：某某融资\n  当时你写：数字对不上\n  存档里还没有它后来的消息。");
    expect(text).toContain("有 2 道预测题等你判断，比如：日银 12 月会加息吗？\n有 1 道生意题到期了，等你确认对账。\nhttps://app.example/signals/forecast");
  });

  it("HTML 版：新消息带链接；没有这几块就什么都不多", () => {
    const html = buildDailyEmailHtml(input, {});
    expect(html).toContain('href="https://app.example/signals/u1"');
    expect(html).toContain("去判断");
    const plain = buildDailyEmailHtml(base, {});
    expect(plain).not.toContain("你在跟的事");
    expect(plain).not.toContain("去判断");
  });
});
