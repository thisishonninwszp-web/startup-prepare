import { describe, expect, it } from "vitest";
import { parseFakeDoorDraft, parseVoiceKinds, parseVoicePlan, parseVoiceQuotes } from "./demand";

describe("这边有人在为这个头疼吗", () => {
  it("parseVoicePlan：pain 用中文一句；搜索词至少两个、最多三个；appTerm 可以空", () => {
    const plan = parseVoicePlan({ pain: "叫外卖要等一个多小时", queries: ["デリバリー 遅い 困る", " 出前 届かない どうしてる ", "", "多余1", "多余2"], appTerm: "" });
    expect(plan.queries).toEqual(["デリバリー 遅い 困る", "出前 届かない どうしてる", "多余1"]);
    expect(plan.appTerm).toBe("");
    expect(() => parseVoicePlan({ pain: "", queries: ["a", "b"] })).toThrow();
    expect(() => parseVoicePlan({ pain: "デリバリーがとても遅くて困っています", queries: ["a", "b"] })).toThrow();
    expect(() => parseVoicePlan({ pain: "叫外卖太慢", queries: ["只有一个"] })).toThrow();
  });

  it("parseVoiceQuotes：原文逐字对得上（去掉空白比）才留；编号越界、类别不认识、太短、重复的丢掉", () => {
    const sources = [
      { title: "知恵袋", url: "https://example.jp/q", content: "フードデリバリーが毎回 1時間以上かかって本当に困っています。みなさんどうしてますか？" },
      { title: "App Store 评论", url: "https://apps.apple.com/jp/app/id1", content: "とにかく遅い。優先にしてもめちゃくちゃ遅い。" },
    ];
    const out = parseVoiceQuotes(
      {
        quotes: [
          { source: 1, excerpt: "フードデリバリーが毎回1時間以上かかって本当に困っています", kind: "complain" },
          { source: 1, excerpt: "みなさんどうしてますか？", kind: "seek" },
          { source: 2, excerpt: "優先にしてもめちゃくちゃ遅い", kind: "complain" },
          { source: 2, excerpt: "優先にしても めちゃくちゃ遅い", kind: "complain" },
          { source: 3, excerpt: "フードデリバリーが毎回1時間以上かかって", kind: "complain" },
          { source: 1, excerpt: "フードデリバリーが毎回1時間以上かかって本当に", kind: "angry" },
          { source: 2, excerpt: "店が少ないので仕方なく使っている", kind: "workaround" },
          { source: 2, excerpt: "遅い", kind: "complain" },
        ],
      },
      sources
    );
    expect(out.map((q) => [q.source, q.kind])).toEqual([
      [1, "complain"],
      [1, "seek"],
      [2, "complain"],
    ]);
    expect(() => parseVoiceQuotes({}, sources)).toThrow();
  });

  it("parseVoiceKinds：概率最高、过了 0.5 的那一种才算；最高是「不算」或拿不准的为 null", () => {
    const answer = (p: number[]) => ({ probabilities: Object.fromEntries(p.map((v, i) => [String(i), v])) });
    const kinds = parseVoiceKinds(
      {
        model: "jev",
        answers: {
          v_0: answer([0.1, 0.8, 0.05, 0.05]),
          v_1: answer([0.7, 0.1, 0.1, 0.1]),
          v_2: answer([0.2, 0.3, 0.1, 0.4]),
          v_3: answer([0.05, 0.05, 0.05, 0.85]),
          v_4: answer([0.1, 0.1, 0.6, 0.2]),
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      6
    );
    expect(kinds).toEqual(["complain", null, null, "workaround", "seek", null]);
  });
});

describe("假门测试：AI 起草的文字", () => {
  const ja = {
    title: "アプリで頼める、近所の家事代行",
    lead: "共働きで家事に手が回らない人のための、近所の人に頼める家事代行です。",
    points: ["アプリで日時を選ぶだけ", "近所の登録スタッフが来てくれる", "終わったらアプリで支払い"],
    audience: "共働きで忙しい家庭",
  };

  it("日文页：四格都在就收", () => {
    expect(parseFakeDoorDraft(ja, "ja")).toEqual(ja);
  });

  it("编人数、评价、No.1、夸张的话、价格：作废", () => {
    expect(() => parseFakeDoorDraft({ ...ja, lead: "すでに1万人が利用している家事代行です。" }, "ja")).toThrow();
    expect(() => parseFakeDoorDraft({ ...ja, title: "満足度No.1の家事代行" }, "ja")).toThrow();
    expect(() => parseFakeDoorDraft({ ...ja, points: ["月額980円で使い放題", "b", "c"] }, "ja")).toThrow();
    expect(() => parseFakeDoorDraft({ ...ja, lead: "家事の常識を変える革命的なサービスです。" }, "ja")).toThrow();
    expect(() => parseFakeDoorDraft({ ...ja, points: ["a", "b"] }, "ja")).toThrow();
  });

  it("周刊付费版：不许写订阅人数、命中率、能赚钱", () => {
    const zh = { title: "每周几条：中国有、日本还没有的生意", lead: "每周替你核实日本还缺什么。", points: ["每条附出处", "以前多久到日本", "能不能搬过来"], audience: "想做日本市场的中国公司" };
    expect(parseFakeDoorDraft(zh, "zh")).toEqual(zh);
    expect(() => parseFakeDoorDraft({ ...zh, lead: "判断命中率很高的周刊。" }, "zh")).toThrow();
    expect(() => parseFakeDoorDraft({ ...zh, lead: "看了就能赚钱。" }, "zh")).toThrow();
    expect(() => parseFakeDoorDraft({ ...zh, points: ["订阅人数持续增长", "b", "c"] }, "zh")).toThrow();
  });

  it("语言要对：日文页写成中文的作废，中文页写成日文的作废", () => {
    const zh = { title: "手机上就能约的上门家政", lead: "给双职工家庭的上门家政，在手机上约附近的阿姨。", points: ["选好时间", "附近的阿姨上门", "做完在手机上付钱"], audience: "双职工家庭" };
    expect(parseFakeDoorDraft(zh, "zh")).toEqual(zh);
    expect(() => parseFakeDoorDraft(zh, "ja")).toThrow();
    expect(() => parseFakeDoorDraft(ja, "zh")).toThrow();
  });
});
