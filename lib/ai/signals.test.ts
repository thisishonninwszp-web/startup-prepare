import { describe, expect, it } from "vitest";
import { assertChinese, mentionsNumericLikelihood, parseAnalogChecks, yearShift, parseBayesDraft, parseGroundedBrief, sameEvent, parseBrief, titleEchoMatches, parseGapPicks, parseInferenceSteps, parseScoutQueries, parseSharpened, parseFunded, keepJudgedLinks, parseDigest, parseDigestChain, parseWhyNow, parseSurprises, keepJudgedSurprises, trimAnalogLead, whenSpan, parseUserAnalog, parseQuestionLinks, parseKeyFactors, parseQuestionPlan, parseJapanChecks, parseJapanComparisons, parseJapanQueries, parseOutcomeQueries, parseDrillDrafts, parseDrillChecks, parseJudgedTiers, parseJudgmentFeedback, parseNewsAnalysis, parsePersonalLinks, parseSignalHistory, parseSituationFacts, parseStepEvidence, parseToolAnalysis } from "./signals";

/** 测试用的候选原标题：彼此不像，免得核对标题时误认。 */
const titles = (n: number) => Array.from({ length: n }, (_, i) => `候补記事その${"一二三四五六七八九十"[i] ?? i}についての報道`);

const ok = {
  background: "日银多年维持零利率，最近物价持续上涨，开始一步步加息。",
  chain: "日银加息 → 银行贷款利率上调 → 靠借款周转的中小企业利息变重",
  forYou: "跟你关系不大。它更影响中小企业的财务。",
  who: "在中小制造业做财务的人",
  question: "这次加息之后，你们找银行续贷的时候，条件变了吗？",
};

describe("parseNewsAnalysis", () => {
  it("五段齐全就原样给出（去掉首尾空白）", () => {
    expect(parseNewsAnalysis({ ...ok, who: `  ${ok.who}  ` })).toEqual(ok);
  });

  it("缺任何一段、或者不是对象，都不收", () => {
    expect(() => parseNewsAnalysis({ ...ok, question: "" })).toThrow("question");
    expect(() => parseNewsAnalysis({ ...ok, background: undefined })).toThrow("background");
    expect(() => parseNewsAnalysis("文本")).toThrow();
  });

  it("出现迎合或投资建议的话就作废", () => {
    expect(() => parseNewsAnalysis({ ...ok, forYou: "这个方向很有潜力" })).toThrow("很有潜力");
    expect(() => parseNewsAnalysis({ ...ok, chain: "利率上调 → 可以考虑买入银行股" })).toThrow("买入");
  });
});

describe("parseBrief", () => {
  const pick = (index: unknown) => ({ index, event: `事件${String(index)}`, headline: "h", background: "b", forYou: "f" });
  const brief = (picks: unknown[]) => ({ overview: "今天的世界", picks });

  it("序号越界、重复、不是整数的丢掉，其余保留", () => {
    const { overview, picks } = parseBrief(brief([pick(0), pick(0), pick(9), pick("2"), pick(1.5)]), titles(3));
    expect(overview).toBe("今天的世界");
    expect(picks.map((p) => p.index)).toEqual([0, 2]);
  });

  it("一条都对不上、没有 picks、没有总述，就不收", () => {
    expect(() => parseBrief(brief([pick(5)]), titles(3))).toThrow();
    expect(() => parseBrief({ overview: "x" }, titles(3))).toThrow("picks");
    expect(() => parseBrief({ picks: [pick(0)] }, titles(3))).toThrow("overview");
  });

  it("最多 5 条；出现投资建议就作废", () => {
    const many = Array.from({ length: 8 }, (_, i) => pick(i));
    expect(parseBrief(brief(many), titles(8)).picks).toHaveLength(5);
    expect(() => parseBrief(brief([{ ...pick(0), forYou: "可以抄底" }]), titles(3))).toThrow("抄底");
  });

});

describe("parseJapanComparisons", () => {
  const inputs = [
    { index: 2, headline: "h", background: "b" },
    { index: 5, headline: "h", background: "b" },
  ];
  it("先给结论的才收；空话、没结论、序号对不上的丢掉", () => {
    const out = parseJapanComparisons(
      {
        items: [
          { index: 2, japan: "没有。可能卡在便利店已经够密，即时配送不划算。" },
          { index: 5, japan: "日本企业需要关注这一变化。" },
          { index: 7, japan: "有，类似的服务已经很多。" },
        ],
      },
      inputs
    );
    expect(out).toEqual([{ index: 2, japan: "没有。可能卡在便利店已经够密，即时配送不划算。", query: "" }]);
    expect(
      parseJapanComparisons({ items: [{ index: 5, japan: "有类似的，但没普及，值得借鉴。" }] }, inputs)
    ).toEqual([]);
  });
});

describe("parseToolAnalysis", () => {
  const tool = { what: "w", howToUse: "h", whoFor: "f", tryThis: "t" };
  it("四段齐全才收，空话作废", () => {
    expect(parseToolAnalysis(tool)).toEqual(tool);
    expect(() => parseToolAnalysis({ ...tool, tryThis: "" })).toThrow("tryThis");
    expect(() => parseToolAnalysis({ ...tool, what: "对你很有启发" })).toThrow("有启发");
  });
});

describe("assertChinese", () => {
  it("中文夹一个片假名名词可以，整段日文不行", () => {
    expect(() => assertChinese(["OpenAI 发布了能自己操作电脑的个人 AI，名字叫 Dots。它在云端的虚拟电脑上运行，读取屏幕背后的数据结构来操作。トヨタ也表示会跟进。"])).not.toThrow();
    expect(() =>
      assertChinese(["日本銀行が政策金利を引き上げ、地方銀行も預金金利を上げる動きが出ています。"])
    ).toThrow("日文");
  });

  it("新闻报告整段写成日文就不收", () => {
    expect(() =>
      parseBrief(
        { overview: "日銀が金利を引き上げました。", picks: [{ index: 0, headline: "利上げ", background: "これは大きな変化です。", forYou: "あなたの会社に影響します。" }] },
        titles(1)
      )
    ).toThrow("日文");
  });
});

describe("parseBrief 的练习题", () => {
  const pick = (index: number) => ({ index, event: `事件${index}`, headline: "日银加息", background: "日银把利率调到一点二五。", forYou: "广告预算可能先被砍。" });
  const base = { overview: "今天日银加息了。", picks: [pick(0), pick(3)] };

  it("练习题指向 picks 里的一条才收", () => {
    const ok = parseBrief({ ...base, practice: { index: 3, question: "三个月后定存利率会过百分之零点五吗？", checkHow: "看三大银行的公告。" } }, titles(5));
    expect(ok.practice).toEqual({ index: 3, question: "三个月后定存利率会过百分之零点五吗？", checkHow: "看三大银行的公告。", horizon: "3m" });
    const off = parseBrief({ ...base, practice: { index: 1, question: "q", checkHow: "c" } }, titles(5));
    expect(off.practice).toBeNull();
  });

  it("德鲁克的机会来源只认规定的几种；先例有就留", () => {
    const { picks } = parseBrief(
      { ...base, picks: [{ ...pick(0), opportunity: "demographics", precedent: "自建仓的即时配送撑不住" }, { ...pick(3), opportunity: "unexpected" }] },
      titles(5)
    );
    expect(picks.map((p) => p.opportunity)).toEqual(["demographics", undefined]);
    expect(picks[0].precedent).toBe("自建仓的即时配送撑不住");
  });

  it("练习题带上为什么两个方向都有可能（没有也收）", () => {
    const why = "会，因为工资在涨；不会，因为银行存款太多不缺钱。";
    const ok = parseBrief({ ...base, practice: { index: 3, question: "三个月后定存利率会过百分之零点五吗？", checkHow: "看三大银行的公告。", whyUncertain: why } }, titles(5));
    expect(ok.practice?.whyUncertain).toBe(why);
  });

  it("没有练习题也收（工具报告）", () => {
    expect(parseBrief(base, titles(5)).practice).toBeNull();
  });
});

describe("parseJudgmentFeedback", () => {
  const fb = { missed: "你没提到大企业的反应。", sharpen: "改成：三个月内乐天的广告单价会下降。", counter: "加息幅度太小，企业可能根本不调预算。" };
  it("三段齐全才收；夸奖作废", () => {
    expect(parseJudgmentFeedback(fb)).toEqual(fb);
    expect(() => parseJudgmentFeedback({ ...fb, counter: "" })).toThrow("counter");
    expect(() => parseJudgmentFeedback({ ...fb, missed: "你判断得很好，只是没提到大企业。" })).toThrow("夸奖");
  });
});

describe("parseSignalHistory", () => {
  const ok = {
    analogs: [{ when: "2006 年 7 月", what: "日银解除零利率，把利率调到 0.25%。", after: "大银行在几周内陆续小幅上调了定存利率。" }],
    baseRate: "央行加息后，大银行通常会跟进，但幅度比政策利率小。",
    different: "这次通胀更持续，银行之间抢存款的压力更大。",
    books: [
      { title: "超预测", originalTitle: "Superforecasting", author: "Philip E. Tetlock", why: "讲怎么先看历史基准再下判断。" },
      { title: "缺作者" },
    ],
  };
  it("缺字段的书丢掉，其余保留", () => {
    const h = parseSignalHistory(ok);
    expect(h.analogs).toHaveLength(1);
    expect(h.books.map((b) => b.originalTitle)).toEqual(["Superforecasting"]);
  });
  it("没有近现代的参照就不收（古代的不能单独当参照）", () => {
    expect(() => parseSignalHistory({ ...ok, analogs: [] })).toThrow("近现代");
    const ancientOnly = [{ era: "ancient", when: "1070 年前后", what: "王安石推行青苗法。", after: "地方官强行摊派，农民负担反而加重。" }];
    expect(() => parseSignalHistory({ ...ok, analogs: ancientOnly })).toThrow("近现代");
  });

  it("古代的最多留一条，排在近现代后面", () => {
    const ancient = (when: string) => ({ era: "ancient", when, what: "宋代滥发交子。", after: "交子大幅贬值。" });
    const h = parseSignalHistory({ ...ok, analogs: [ancient("1100 年前后"), ancient("1200 年前后"), ...ok.analogs] });
    expect(h.analogs.map((a) => a.era)).toEqual(["modern", "ancient"]);
    expect(h.analogs[1].when).toBe("1100 年前后");
  });
});

describe("parseBrief 的日程（允许空）", () => {
  it("日程那一份一条都没有也收，别的不行", () => {
    expect(parseBrief({ overview: "这批消息里没有写明日期的变化。", picks: [] }, titles(10), true).picks).toEqual([]);
    expect(() => parseBrief({ overview: "x", picks: [] }, titles(10))).toThrow("picks");
  });
});

describe("parseSituationFacts", () => {
  const sources = ["今年四月进了一家电商公司，在经营层做广告数据分析。", "我其实很内向，不擅长和人打交道。"];
  it("出处必须逐字出现在原文里（空白不算），对不上的丢掉", () => {
    const facts = parseSituationFacts(
      {
        facts: [
          { fact: "在一家电商公司做广告数据分析", quote: "在经营层做广告 数据分析" },
          { fact: "在东京工作", quote: "我在东京上班" },
          { fact: "没有出处", quote: "" },
        ],
      },
      sources
    );
    expect(facts.map((f) => f.fact)).toEqual(["在一家电商公司做广告数据分析"]);
  });

  it("没有 facts 字段就不收；空数组可以", () => {
    expect(() => parseSituationFacts({}, sources)).toThrow("facts");
    expect(parseSituationFacts({ facts: [] }, sources)).toEqual([]);
  });
});

describe("parsePersonalLinks（报告的第二步：跟你）", () => {
  const reader = ["负责公司的 AI 推荐率监测，把它和网站访问、订单关联分析", "想当社长"];

  it("link 对得上关于他的某一条、序号在报告里，才留", () => {
    const links = parsePersonalLinks(
      {
        links: [
          { index: 0, personal: "跟你的推荐率监测有关。", link: "AI 推荐率监测" },
          { index: 1, personal: "跟你有关。", link: "他在做推荐系统" },
          { index: 9, personal: "跟你有关。", link: "想当社长" },
        ],
      },
      [0, 1, 2],
      reader
    );
    expect(links).toEqual([{ index: 0, personal: "跟你的推荐率监测有关。", link: "AI 推荐率监测" }]);
  });

  it("裁判判成只是沾边的丢掉", () => {
    const res = { answers: { link_0: { probabilities: { "0": 0.98, "1": 0.02 } }, link_1: { probabilities: { "0": 0.02, "1": 0.98 } } } };
    const kept = keepJudgedLinks(
      [{ index: 0, personal: "可能会影响你的工作" }, { index: 3, personal: "推荐卡片上线直接改变推荐率口径" }],
      res as unknown as Parameters<typeof keepJudgedLinks>[1]
    );
    expect(kept.map((k) => k.index)).toEqual([3]);
  });

  it("最多留两条；没有 links 字段不收", () => {
    const many = [0, 1, 2, 3].map((i) => ({ index: i, personal: "跟你想当社长有关。", link: "想当社长" }));
    expect(parsePersonalLinks({ links: many }, [0, 1, 2, 3], reader)).toHaveLength(2);
    expect(() => parsePersonalLinks({}, [0], reader)).toThrow("links");
  });
});

describe("parseInferenceSteps", () => {
  const step = (likelihood: string, claim = "地方银行跟着提高定存利率。") => ({
    claim, why: "存款外流的压力变大。", watch: "看各地银行的利率公告。", likelihood,
  });

  it("按较可能 → 有可能 → 不太可能排；不认识的档位当作有可能", () => {
    const steps = parseInferenceSteps({ steps: [step("unlikely"), step("weird"), step("likely")] });
    expect(steps.map((s) => s.likelihood)).toEqual(["likely", "possible", "unlikely"]);
  });

  it("写了百分比或「概率为」就作废", () => {
    expect(() => parseInferenceSteps({ steps: [step("likely", "有 70% 的可能银行会跟进。")] })).toThrow("数字化");
    expect(() => parseInferenceSteps({ steps: [step("likely", "银行跟进的概率为六成。")] })).toThrow("数字化");
  });

  it("没有 steps 不收；最多三条", () => {
    expect(() => parseInferenceSteps({ steps: [] })).toThrow("steps");
    expect(parseInferenceSteps({ steps: [1, 2, 3, 4].map(() => step("possible")) })).toHaveLength(3);
  });

  it("角度只认四种，没写的当顺着往下；材料原文逐字对得上才留", () => {
    const materials = [
      { title: "地銀の預金金利", url: "https://example.jp/a", content: "地方銀行の多くが10月に普通預金金利を0.2%に引き上げた。" },
    ];
    const steps = parseInferenceSteps(
      {
        steps: [
          { ...step("likely"), lens: "ripple", basis: { source: 1, excerpt: "地方銀行の多くが10月に普通預金金利を0.2%に引き上げた。" } },
          { ...step("possible"), lens: "weird", basis: { source: 1, excerpt: "信用金庫も追随する見通し。" } },
          { ...step("unlikely"), lens: "precedent", basis: { source: 2, excerpt: "地方銀行の多くが10月に" } },
        ],
      },
      materials
    );
    expect(steps.map((s) => s.lens)).toEqual(["ripple", "direct", "precedent"]);
    expect(steps[0].basis).toEqual({ url: "https://example.jp/a", title: "地銀の預金金利", excerpt: "地方銀行の多くが10月に普通預金金利を0.2%に引き上げた。" });
    expect(steps[1].basis).toBeUndefined();
    expect(steps[2].basis).toBeUndefined();
  });
});

describe("parseScoutQueries（推之前查材料）", () => {
  it("只认三个角度，每个角度一个，空的丢掉", () => {
    expect(
      parseScoutQueries({
        queries: [
          { lens: "ripple", query: "地方銀行 預金金利 引き上げ" },
          { lens: "ripple", query: "重复的" },
          { lens: "direct", query: "不查这个角度" },
          { lens: "reaction", query: "  " },
          { lens: "precedent", query: "Japan 2006 rate hike regional banks deposits" },
        ],
      })
    ).toEqual([
      { lens: "ripple", query: "地方銀行 預金金利 引き上げ" },
      { lens: "precedent", query: "Japan 2006 rate hike regional banks deposits" },
    ]);
    expect(() => parseScoutQueries({ queries: [{ lens: "direct", query: "x" }] })).toThrow();
  });
});

describe("parseJudgedTiers（Jev 当裁判）", () => {
  const answer = (p: number[]) => ({
    type: "score",
    score: 1.4,
    confidence: 0.5,
    probabilities: Object.fromEntries(p.map((v, i) => [String(i), v])),
  });
  const result = (answers: Record<string, unknown>) => ({ model: "jev", answers, usage: { input_tokens: 1, output_tokens: 1 } });

  it("五档：取概率最高的那档（score 是期望值，不是档位）；最高档不到一半就算拿不准", () => {
    const tiers = parseJudgedTiers(
      result({ step_0: answer([0.05, 0.68, 0.2, 0.05, 0.02]), step_1: answer([0.02, 0.08, 0.3, 0.45, 0.15]) }),
      2
    );
    expect(tiers.map(({ likelihood, unsure }) => ({ likelihood, unsure }))).toEqual([
      { likelihood: "likely", unsure: false },
      { likelihood: "unlikely", unsure: true },
    ]);
    // p 是按每档代表值折算的可能，只拿来连乘整条链：0.05×0.9 + 0.68×0.7 + 0.2×0.5 + 0.05×0.3 + 0.02×0.1 = 0.638
    expect(tiers[0].p).toBeCloseTo(0.638, 3);
    expect(tiers[1].p).toBeLessThan(0.4);
  });

  it("车轱辘：相邻换说法过 0.45、或绕回前面过 0.5 就标出来；两问都缺就当不是", () => {
    const tier = answer([0.1, 0.7, 0.1, 0.05, 0.05]);
    const res = result({ step_0: tier, step_1: tier, step_2: tier, step_3: tier });
    const yes = (p: number) => ({ type: "score", probabilities: { "0": 1 - p, "1": p } });
    Object.assign(res.answers as Record<string, unknown>, {
      restate_0: yes(0.47), circular_0: yes(0.1), // 相邻换说法，刚过门槛
      restate_1: yes(0.06), circular_1: yes(0.97), // 绕回两步前
      restate_2: yes(0.2), circular_2: yes(0.42), // 真往下推
    });
    expect(parseJudgedTiers(res, 4).map((t) => t.restates)).toEqual([true, true, false, false]);
  });

  it("太泛：过 0.9 才算（裁判偏严，中等具体的会给到 0.6–0.8）", () => {
    const tier = answer([0.1, 0.7, 0.1, 0.05, 0.05]);
    const res = result({ step_0: tier, step_1: tier });
    Object.assign(res.answers as Record<string, unknown>, {
      concrete_0: { type: "score", probabilities: { "0": 0.05, "1": 0.95 } },
      concrete_1: { type: "score", probabilities: { "0": 0.19, "1": 0.81 } },
    });
    expect(parseJudgedTiers(res, 2).map((t) => t.vague)).toEqual([true, false]);
  });

  it("更具体一点：反推那一问过 0.3 就标出来", () => {
    const tier = answer([0.1, 0.7, 0.1, 0.05, 0.05]);
    const res = result({ step_0: tier, step_1: tier });
    Object.assign(res.answers as Record<string, unknown>, {
      reverse_0: { type: "score", probabilities: { "0": 0.57, "1": 0.43 } },
      reverse_1: { type: "score", probabilities: { "0": 0.96, "1": 0.04 } },
    });
    expect(parseJudgedTiers(res, 2).map((t) => t.specifies)).toEqual([true, false]);
  });

  it("两头的档也认得", () => {
    const tiers = parseJudgedTiers(result({ step_0: answer([0.8, 0.1, 0.05, 0.03, 0.02]) }), 1);
    expect(tiers[0].likelihood).toBe("very_likely");
  });

  it("缺档位、概率不在 0 到 1 之间，都不收", () => {
    expect(() => parseJudgedTiers(result({}), 1)).toThrow("step_0");
    expect(() => parseJudgedTiers(result({ step_0: answer([1.2, 0, 0, 0, 0]) }), 1)).toThrow("0 到 1");
  });
});

describe("parseBayesDraft", () => {
  const ok = {
    prior: "low",
    priorWhy: "央行小幅加息后，大银行通常会跟进，但不会一下子调很多。",
    evidence: [
      { text: "地方银行已经开始上调存款利率。", why: "说明银行之间在抢存款。", strength: "for" },
      { text: "这次只加了一点点。", why: "幅度小，银行不急着跟。", strength: "against" },
      { text: "档位写错的证据", why: "会被丢掉。", strength: "very_strong" },
    ],
  };
  it("只认五档，档位不对的证据丢掉", () => {
    const d = parseBayesDraft(ok);
    expect(d.prior).toBe("low");
    expect(d.evidence.map((e) => e.strength)).toEqual(["for", "against"]);
  });
  it("证据只有支持的、没有反方，不收", () => {
    const onlyFor = { ...ok, evidence: [ok.evidence[0], { ...ok.evidence[0], strength: "strong_for" }] };
    expect(() => parseBayesDraft(onlyFor)).toThrow("反方");
  });

  it("先验不是五档之一、或写了百分比，都不收", () => {
    expect(() => parseBayesDraft({ ...ok, prior: "30%" })).toThrow("prior");
    expect(() => parseBayesDraft({ ...ok, priorWhy: "大概有 30% 的可能。" })).toThrow("数字化");
  });
});

describe("mentionsNumericLikelihood", () => {
  it("拦用数字说可能性的", () => {
    for (const t of ["有 70% 的可能会跟进。", "概率为 30%。", "可能性大约 40%", "七成的可能", "百分之八十的把握"]) {
      expect(mentionsNumericLikelihood(t), t).toBe(true);
    }
  });
  it("不拦事实里的百分比", () => {
    for (const t of ["日银把政策利率从 1% 提高到 1.25%。", "销售额增长了 3%。", "银行可能会把利率调到 0.5%"]) {
      expect(mentionsNumericLikelihood(t), t).toBe(false);
    }
  });
});

describe("parseStepEvidence（上网查证据）", () => {
  const sources = [
    { title: "日経", url: "https://example.jp/a", content: "三菱UFJ銀行は11月から住宅ローンの変動金利を0.15%引き上げると発表した。" },
    { title: "Yahoo", url: "https://example.jp/b", content: "大手行の多くは当面、預金金利を据え置く方針だ。" },
  ];
  const item = (over: Record<string, unknown>) => ({
    source: 1, fact: "三菱UFJ银行宣布从11月起上调房贷浮动利率0.15个百分点。",
    excerpt: "住宅ローンの変動金利を0.15%引き上げる", stance: "supports", ...over,
  });

  it("来源编号对得上、摘录逐字在原文里，才收", () => {
    const ev = parseStepEvidence({ evidence: [item({}), item({ source: 2, fact: "大型银行多数暂时维持存款利率不变。", excerpt: "預金金利を据え置く方針", stance: "contradicts" })] }, sources);
    expect(ev.map((e) => [e.url, e.stance])).toEqual([["https://example.jp/a", "supports"], ["https://example.jp/b", "contradicts"]]);
  });

  it("编的摘录、不存在的来源、档位不对，都丢掉", () => {
    const ev = parseStepEvidence(
      { evidence: [item({ excerpt: "原文里根本没有这句话的内容" }), item({ source: 9 }), item({ stance: "maybe" })] },
      sources
    );
    expect(ev).toEqual([]);
  });

  it("没有 evidence 字段不收；空数组可以", () => {
    expect(() => parseStepEvidence({}, sources)).toThrow("evidence");
    expect(parseStepEvidence({ evidence: [] }, sources)).toEqual([]);
  });
});

describe("parseBayesDraft 挂来源", () => {
  const draft = {
    prior: "low",
    priorWhy: "普通年份里，大银行很少主动大幅调房贷利率。",
    evidence: [
      { text: "三菱UFJ银行已宣布上调房贷利率。", why: "龙头带头，其他银行容易跟。", strength: "for", found: 1 },
      { text: "多数大行暂时维持存款利率。", why: "说明银行不急着全面调整。", strength: "against", found: 0 },
    ],
  };
  it("found 编号对得上才挂 url；0 或越界不挂", () => {
    const d = parseBayesDraft(draft, [{ url: "https://example.jp/a" }]);
    expect(d.evidence.map((e) => e.url)).toEqual(["https://example.jp/a", undefined]);
  });
});

describe("同一件事只留一条 + 也值得一看", () => {
  const pick = (index: number, event: string) => ({ index, event, headline: `标题${index}`, background: "b", forYou: "f" });

  it("sameEvent：去掉空格标点后相同、或一个包含另一个", () => {
    expect(sameEvent("日银加息", "日银 加息")).toBe(true);
    expect(sameEvent("日银加息", "日银加息后银行跟进")).toBe(true);
    expect(sameEvent("日银加息", "台积电熊本")).toBe(false);
  });

  it("标签重复的精选被去掉，后面的补上来；多出来的进也值得一看", () => {
    const b = parseBrief(
      {
        overview: "今天日银加息。",
        picks: [
          pick(0, "日银加息"), pick(1, "日银加息后银行跟进"), pick(2, "台积电熊本"), pick(3, "物流缺人"),
          pick(4, "OpenAI Dots"), pick(5, "微软紧急刹车"), pick(6, "乐天漫游缩小"),
        ],
        more: [
          { index: 7, title: titles(10)[7], event: "物流缺人", headline: "又一篇物流缺人的报道" },
          { index: 8, title: titles(10)[8], event: "派拉蒙收购", headline: "派拉蒙计划收购华纳" },
        ],
      },
      titles(10)
    );
    expect(b.picks.map((p) => p.index)).toEqual([0, 2, 3, 4, 5]);
    expect(b.more.map((m) => m.index)).toEqual([6, 8]);
  });
});

describe("拿照抄的原标题核对序号", () => {
  const candidates = [
    "日本の若者に人気、エナジードリンクより「白湯」 - 日経MJ",
    "国立大でコスメ学ぶ訳 1期生の声",
    "日銀、追加利上げを決定",
    "楽天モバイル、ローミング縮小へ",
  ];
  const pick = (index: number, event: string, title?: string) => ({ index, title, event, headline: `标题${index}`, background: "b", forYou: "f" });
  const brief = (more: unknown[]) => ({ overview: "今天日银加息。", picks: [pick(2, "日银加息", "日銀、追加利上げを決定")], more });

  it("titleEchoMatches：只抄前一段、全半角和标点不同都认；别的标题不认", () => {
    expect(titleEchoMatches("日本の若者に人気、エナジードリンク", candidates[0])).toBe(true);
    expect(titleEchoMatches("国立大でコスメ学ぶ訳　１期生の声", candidates[1])).toBe(true);
    expect(titleEchoMatches("日銀、追加利上げを決定（NHK）", candidates[2])).toBe(true);
    expect(titleEchoMatches("日本の若者に人気、エナジードリンク", candidates[1])).toBe(false);
    expect(titleEchoMatches("", candidates[1])).toBe(false);
  });

  it("也值得一看：序号数错一位时，按标题换回它说的那一条", () => {
    const b = parseBrief(brief([{ index: 1, title: "日本の若者に人気、エナジードリンクより", event: "白汤流行", headline: "日本年轻人流行喝白开水" }]), candidates);
    expect(b.more).toEqual([{ index: 0, event: "白汤流行", headline: "日本年轻人流行喝白开水" }]);
  });

  it("也值得一看：没抄标题、或标题哪条都对不上，就不收", () => {
    const b = parseBrief(
      brief([
        { index: 0, event: "白汤流行", headline: "日本年轻人流行喝白开水" },
        { index: 1, title: "Young people in Japan love hot water", event: "国立大化妆品", headline: "国立大学开化妆品课" },
      ]),
      candidates
    );
    expect(b.more).toEqual([]);
  });

  it("精选：标题对上另一条就换过去；对不上任何一条照旧信序号（后面还会按正文重写）", () => {
    const b = parseBrief(
      { overview: "今天日银加息。", picks: [pick(1, "乐天漫游", "楽天モバイル、ローミング縮小へ"), pick(2, "日银加息", "BOJ hikes rates")] },
      candidates
    );
    expect(b.picks.map((p) => p.index)).toEqual([3, 2]);
  });
});

describe("parseGroundedBrief（读正文重写）", () => {
  const inputs = [
    { index: 3, title: "日銀利上げ", summary: "", body: "日本銀行は政策金利を1%から1.25%に引き上げることを決めた。物価上昇が続いている。", draft: { headline: "h", background: "b", forYou: "f" } },
    { index: 7, title: "Google News", summary: "", body: "", draft: { headline: "h", background: "b", forYou: "f" } },
  ];
  const item = (over: Record<string, unknown>) => ({
    index: 3, headline: "日银加息到 1.25%。", background: "日本银行决定把政策利率从 1% 提高到 1.25%，原因是物价持续上涨。",
    forYou: "主要影响靠贷款周转的中小企业。", basis: ["政策金利を1%から1.25%に引き上げる"], ...over,
  });

  it("依据逐字在正文里才收；正文为空的条目不收", () => {
    const r = parseGroundedBrief({ overview: "今天日银加息了。", items: [item({}), item({ index: 7 })] }, inputs);
    expect(r.items.map((i) => i.index)).toEqual([3]);
    expect(r.items[0].basis).toEqual(["政策金利を1%から1.25%に引き上げる"]);
  });

  it("依据是编的（正文里没有）就整条不收，调用方会保留草稿", () => {
    const r = parseGroundedBrief({ overview: "今天日银加息了。", items: [item({ basis: ["日銀は来月も利上げすると明言した"] })] }, inputs);
    expect(r.items).toEqual([]);
  });

  it("没有总述不收", () => {
    expect(() => parseGroundedBrief({ items: [item({})] }, inputs)).toThrow("overview");
  });
});

describe("parseAnalogChecks（历史参照逐条核实）", () => {
  const analog = (when: string, after: string) => ({ era: "modern" as const, when, what: "日银解除零利率。", after });
  const inputs = [
    {
      analog: analog("2006 年 7 月", "银行很快大幅上调了存款利率。"),
      sources: [{ title: "日銀", url: "https://example.jp/2006", content: "2006年7月14日、日本銀行はゼロ金利政策を解除し、無担保コール翌日物金利を0.25%に引き上げた。" }],
    },
    {
      analog: analog("2000 年 8 月", "之后经济再次衰退，2001 年回到量化宽松。"),
      sources: [{ title: "Wiki", url: "https://example.jp/2000", content: "2000年8月にゼロ金利を解除したが、2001年3月に量的緩和政策を導入した。" }],
    },
    { analog: analog("1989 年", "泡沫破裂。"), sources: [] },
  ];

  it("查到出处的标 supported，改正的写明哪里不一样，拿不出原文的降成 unverified", () => {
    const r = parseAnalogChecks(
      {
        baseRate: "解除零利率之后，日银往往很快又回到宽松。",
        analogs: [
          { i: 0, status: "corrected", when: "2006 年 7 月 14 日", what: "日银解除零利率，把利率调到 0.25%。", after: "银行很快大幅上调了存款利率。", correction: "原来没写具体日期，资料里是 7 月 14 日。", basis: [{ source: 1, excerpt: "ゼロ金利政策を解除し、無担保コール翌日物金利を0.25%に引き上げた" }] },
          { i: 1, status: "supported", basis: [{ source: 1, excerpt: "2001年3月に量的緩和政策を導入した" }] },
          { i: 2, status: "supported", basis: [{ source: 1, excerpt: "根本不存在的资料原文内容" }] },
        ],
      },
      inputs
    );
    expect(r.analogs.map((a) => a.check?.status)).toEqual(["corrected", "supported", "unverified"]);
    expect(r.analogs[0].when).toBe("2006 年 7 月 14 日");
    expect(r.analogs[1].check?.basis[0].url).toBe("https://example.jp/2000");
    expect(r.analogs[2].after).toBe("泡沫破裂。");
  });

  it("说改正了却没写哪里不一样，按 supported 算，内容不改", () => {
    const r = parseAnalogChecks(
      { baseRate: "这类事通常很快又回到宽松。", analogs: [{ i: 0, status: "corrected", when: "1999 年", basis: [{ source: 1, excerpt: "日本銀行はゼロ金利政策を解除し" }] }] },
      inputs.slice(0, 1)
    );
    expect(r.analogs[0].check?.status).toBe("supported");
    expect(r.analogs[0].when).toBe("2006 年 7 月");
  });
});

describe("parseAnalogChecks 的兜底", () => {
  const inputs = [{
    analog: { era: "modern" as const, when: "2000 年 8 月", what: "日银解除零利率。", after: "2001 年回到宽松。" },
    sources: [{ title: "Yahoo", url: "https://example.jp/a", content: "2000年8月に日銀はゼロ金利政策の解除を決定した。" }],
  }];
  const basis = [{ source: 1, excerpt: "2000年8月に日銀はゼロ金利政策の解除を決定した" }];

  it("说改正了但内容一个字没改，算查到出处", () => {
    const r = parseAnalogChecks({ baseRate: "解除零利率后往往又回到宽松。", analogs: [{ i: 0, status: "corrected", when: "2000 年 8 月", what: "日银解除零利率。", after: "2001 年回到宽松。", correction: "资料里多讲了细节。", basis }] }, inputs);
    expect(r.analogs[0].check?.status).toBe("supported");
  });

  it("when 写串了（塞进了发生了什么）就保留原来的时间", () => {
    const r = parseAnalogChecks({ baseRate: "解除零利率后往往又回到宽松。", analogs: [{ i: 0, status: "corrected", when: "2000 年 8 月：日本银行在维持零利率政策近一年半后上调利率", what: "日银解除零利率。", after: "2001 年 3 月改为量化宽松。", correction: "原来写的是回到宽松，资料里是改为量化宽松。", basis }] }, inputs);
    expect(r.analogs[0].when).toBe("2000 年 8 月");
    expect(r.analogs[0].check?.status).toBe("corrected");
  });
});

describe("历史参照：搜错了不能拼成一件事", () => {
  it("yearShift 取四位年份比较", () => {
    expect(yearShift("2018 年", "2022 年 3 月")).toBe(4);
    expect(yearShift("2006 年 7 月", "2006年7月14日")).toBe(0);
    expect(yearShift("大约 90 年代初", "1991 年")).toBe(0);
  });

  it("改正前后年份差一年以上 → 当作搜到了另一件事，退回原文、标没查到出处", () => {
    const inputs = [{
      analog: { era: "modern" as const, when: "2018 年", what: "美联储持续加息。", after: "美股年底回调，2019 年转向降息。" },
      sources: [{ title: "Nikkei", url: "https://example.jp/fed", content: "FRBは2022年3月、3年ぶりの利上げに踏み切った。" }],
    }];
    const r = parseAnalogChecks(
      { baseRate: "这次的参照都没查到出处。", analogs: [{ i: 0, status: "corrected", when: "2022 年 3 月", what: "美联储三年来首次加息。", after: "美股年底回调，2019 年转向降息。", correction: "原来写的是 2018 年，资料里是 2022 年。", basis: [{ source: 1, excerpt: "FRBは2022年3月、3年ぶりの利上げに踏み切った" }] }] },
      inputs
    );
    expect(r.analogs[0].check?.status).toBe("unverified");
    expect(r.analogs[0].when).toBe("2018 年");
  });
});

describe("parseJapanChecks", () => {
  const comparison = { index: 3, japan: "没有。可能卡在便利店已经够密。", query: "即配 ネットスーパー" };
  const sources = [{ title: "t", url: "https://example.jp/a", content: "イオンネットスーパーは最短30分で届ける即配サービスを都内で始めた。" }];
  const inputs = [{ comparison, sources }];
  const excerpt = "イオンネットスーパーは最短30分で届ける即配サービスを都内で始めた。";

  it("原文对得上才算查到；改正要真改了、开头合格", () => {
    const fixed = "有类似的，但没普及。イオン在东京试 30 分钟送达。";
    const out = parseJapanChecks(
      { items: [{ i: 0, status: "corrected", japan: fixed, correction: "原来说没有，资料里有", basis: [{ source: 1, excerpt }] }] },
      inputs
    );
    expect(out[0].japan).toBe(fixed);
    expect(out[0].check?.status).toBe("corrected");
    expect(out[0].check?.basis[0].url).toBe("https://example.jp/a");
  });

  it("原文对不上、或改正后开头不合格，就降级", () => {
    const fake = parseJapanChecks(
      { items: [{ i: 0, status: "supported", japan: comparison.japan, basis: [{ source: 1, excerpt: "资料里根本没有这一句话呀呀呀" }] }] },
      inputs
    );
    expect(fake[0].check?.status).toBe("unverified");
    expect(fake[0].japan).toBe(comparison.japan);
    const bad = parseJapanChecks(
      { items: [{ i: 0, status: "corrected", japan: "日本企业值得借鉴。", correction: "x", basis: [{ source: 1, excerpt }] }] },
      inputs
    );
    expect(bad[0].check?.status).toBe("supported");
    expect(bad[0].japan).toBe(comparison.japan);
  });
});

describe("问题驱动的解析", () => {
  it("小问题不到 3 个不收；重复的、缺搜索词的丢掉", () => {
    const sq = (question: string, query = "q") => ({ question, query, counterQuery: "c" });
    expect(() => parseQuestionPlan({ subQuestions: [sq("一"), sq("二")] })).toThrow();
    const plan = parseQuestionPlan({ subQuestions: [sq("日本人信不信主播"), sq("日本人信不信主播"), sq("没有搜索词", ""), sq("乐天为什么撤"), sq("TikTok 卖得怎样")] });
    expect(plan.map((p) => p.question)).toEqual(["日本人信不信主播", "乐天为什么撤", "TikTok 卖得怎样"]);
  });

  it("关键因素：编号对不上的丢掉，没有依据的改成还没查到；写可能性数字就作废", () => {
    const factors = parseKeyFactors(
      {
        keyFactors: [
          { factor: "日本人信不信主播", now: "大多数人还在观望", watch: "TikTok Shop 成交翻倍", evidence: [1, 9] },
          { factor: "配送成本", now: "很高", watch: "有人做到 30 分钟送达还赚钱", evidence: [] },
        ],
      },
      2
    );
    expect(factors[0].evidence).toEqual([1]);
    expect(factors[1].now).toBe("还没查到。");
    expect(() =>
      parseKeyFactors({ keyFactors: [{ factor: "因素", now: "有七成的可能会来", watch: "看数据", evidence: [1] }] }, 1)
    ).toThrow();
  });

  it("历史参照带上像在哪、不像在哪", () => {
    const h = parseSignalHistory({
      analogs: [{ era: "modern", when: "2018 年", what: "PayPay 上线", after: "两年铺满日本", alike: "都来自中国的做法", unlike: "PayPay 有政府返点和巨额补贴", query: "PayPay 2018" }],
      baseRate: "有大资本推的才铺得开。",
      different: "这次没有补贴。",
      books: [],
    });
    expect(h.analogs[0].alike).toBe("都来自中国的做法");
    expect(h.analogs[0].unlike).toBe("PayPay 有政府返点和巨额补贴");
  });
});

describe("trimAnalogLead", () => {
  it("去掉「这次和……像在，」这类开头，正文留着", () => {
    expect(trimAnalogLead("这次和中国当时的情况像在，都有新兴的即时配送模式")).toBe("都有新兴的即时配送模式");
    expect(trimAnalogLead("这次和欧美当时不像在，日本城市密度更高")).toBe("日本城市密度更高");
    expect(trimAnalogLead("都来自中国的做法")).toBe("都来自中国的做法");
    expect(trimAnalogLead("  ")).toBeUndefined();
  });
});

describe("历史参照必须是一件具体的事", () => {
  it("whenSpan：具体年份是 0，区间算跨度，年代算 10，没有年份算无穷大", () => {
    expect(whenSpan("2018 年 10 月")).toBe(0);
    expect(whenSpan("2015–2018 年")).toBe(3);
    expect(whenSpan("2010 年代后期")).toBe(10);
    expect(whenSpan("1990s")).toBe(10);
    expect(whenSpan("明治初期")).toBe(Infinity);
  });

  it("跨度太大、主语含糊的近现代参照丢掉；古代的不管；一条近现代都不剩就作废", () => {
    const base = { baseRate: "b", different: "d", books: [] };
    const a = (when: string, what: string, era = "modern") => ({ era, when, what, after: "后来怎样", unlike: "不一样的地方" });
    const h = parseSignalHistory({
      ...base,
      analogs: [
        a("2018 年", "PayPay 上线返现"),
        a("2010 年代", "中国移动支付普及"),
        a("2016 年", "一些中国游戏公司进入日本"),
        a("北宋", "王安石变法", "ancient"),
      ],
    });
    expect(h.analogs.map((x) => x.what)).toEqual(["PayPay 上线返现", "王安石变法"]);
    expect(() => parseSignalHistory({ ...base, analogs: [a("2000 年代初期", "便利店普及")] })).toThrow();
  });

  it("自己想到的类比：标成 user，不像的地方不许空着", () => {
    const u = parseUserAnalog({ era: "modern", when: "2018 年 10 月", what: "PayPay 上线", after: "两年铺开", alike: "都是新支付方式", unlike: "PayPay 有巨额返现", query: "PayPay 2018", altQuery: "PayPay 2018 campaign" });
    expect(u.source).toBe("user");
    expect(u.altQuery).toBe("PayPay 2018 campaign");
    expect(() => parseUserAnalog({ when: "2018 年", what: "PayPay 上线", after: "两年铺开", unlike: "" })).toThrow();
  });
});

describe("parseQuestionLinks", () => {
  it("序号和问题编号都要对得上；每条新闻只连一个问题；最多 3 条；问题编号换成从 0 开始", () => {
    const links = parseQuestionLinks(
      {
        links: [
          { index: 2, question: 1, why: "TikTok Shop 成交翻倍，是直播带货来日本的直接证据。" },
          { index: 2, question: 2, why: "重复的这条丢掉。" },
          { index: 9, question: 1, why: "序号不在今天的报告里。" },
          { index: 4, question: "Q3", why: "问题编号越界。" },
          { index: 5, question: "Q2", why: "某配送公司撤出日本，即时零售少了一家。" },
        ],
      },
      [2, 4, 5],
      2
    );
    expect(links).toEqual([
      { index: 2, question: 0, why: "TikTok Shop 成交翻倍，是直播带货来日本的直接证据。" },
      { index: 5, question: 1, why: "某配送公司撤出日本，即时零售少了一家。" },
    ]);
    expect(parseQuestionLinks({ links: [] }, [1], 1)).toEqual([]);
  });
});

describe("parseQuestionLinks 拦住沾边的", () => {
  it("理由里自己承认牵强的不标", () => {
    const weak = "全国因人手不足倒闭的企业数量创新高，尽管新闻未明确指出物流业，但对小型运输公司也有影响。";
    expect(parseQuestionLinks({ links: [{ index: 0, question: 1, why: weak }] }, [0], 1)).toEqual([]);
    expect(parseQuestionLinks({ links: [{ index: 0, question: 1, why: "这可能间接影响运输业。" }] }, [0], 1)).toEqual([]);
    expect(parseQuestionLinks({ links: [{ index: 0, question: 1, why: "一家运送公司因司机不足破产。" }] }, [0], 1)).toHaveLength(1);
  });
});

describe("parseSharpened", () => {
  it("编号对得上、claim 和 watch 都有才收；写可能性数字就作废", () => {
    expect(parseSharpened({ steps: [{ i: 0, claim: "大和运输上调宅急便运费", watch: "看大和的价格公告" }, { i: 5, claim: "x", watch: "y" }] }, 2)).toEqual([
      { i: 0, claim: "大和运输上调宅急便运费", watch: "看大和的价格公告" },
    ]);
    expect(() => parseSharpened({ steps: [{ i: 0, claim: "有七成的可能涨价", watch: "看公告" }] }, 1)).toThrow();
  });
});

describe("parseSurprises", () => {
  const inputs = [
    { index: 2, title: "ワークマン 値下げで利益5割増", summary: "", body: "主力の作業服を1000円値下げしたところ、利益はむしろ約5割増えた。" },
    { index: 4, title: "日銀が利上げ", summary: "", body: "政策金利を1.25%に引き上げた。" },
  ];
  it("原文对得上才收；序号不在、缺字段的丢掉", () => {
    const out = parseSurprises(
      {
        surprises: [
          { index: 2, expected: "降价会压低利润", actual: "利润反而增加了约五成", quote: "利益はむしろ約5割増えた" },
          { index: 4, expected: "x", actual: "y", quote: "根本没有这句话这句话" },
          { index: 9, expected: "x", actual: "y", quote: "利益はむしろ約5割増えた" },
        ],
      },
      inputs
    );
    expect(out).toEqual([{ index: 2, expected: "降价会压低利润", actual: "利润反而增加了约五成", quote: "利益はむしろ約5割増えた" }]);
    expect(parseSurprises({ surprises: [] }, inputs)).toEqual([]);
  });

  it("裁判判原文没写出反差的丢掉（预期多半是 AI 编的）", () => {
    const s = (index: number) => ({ index, expected: "e", actual: "a", quote: "q" });
    const res = { answers: { surprise_0: { probabilities: { "0": 0.01, "1": 0.99 } }, surprise_1: { probabilities: { "0": 0.62, "1": 0.38 } } } };
    expect(keepJudgedSurprises([s(2), s(5), s(7)], res as unknown as Parameters<typeof keepJudgedSurprises>[1]).map((x) => x.index)).toEqual([2]);
  });
});

describe("parseWhyNow", () => {
  it("有就留，没有是空串；写可能性数字就作废", () => {
    expect(parseWhyNow({ whyNow: "TikTok Shop 进了日本，平台已经搭好。" })).toBe("TikTok Shop 进了日本，平台已经搭好。");
    expect(parseWhyNow({})).toBe("");
    expect(() => parseWhyNow({ whyNow: "有七成的可能现在发生" })).toThrow();
  });
});

describe("parseFunded", () => {
  const sources = [{ title: "t", url: "https://x.jp/a", content: "株式会社イオは即配サービスのためシリーズAで5億円の資金調達を実施した。" }];
  it("原文对得上、写着融资、有公司名才收", () => {
    expect(parseFunded({ company: "イオ", excerpt: "シリーズAで5億円の資金調達を実施した", source: 1 }, sources)).toEqual({ company: "イオ", url: "https://x.jp/a", excerpt: "シリーズAで5億円の資金調達を実施した" });
    expect(parseFunded({ company: "イオ", excerpt: "即配サービスのため", source: 1 }, sources)).toBeUndefined();
    expect(parseFunded({ company: "", excerpt: "シリーズAで5億円の資金調達を実施した", source: 1 }, sources)).toBeUndefined();
    expect(parseFunded(null, sources)).toBeUndefined();
  });
});

describe("你的优势与 PESTLE 领域", () => {
  it("跟你那一条可以标成优势", () => {
    const links = parsePersonalLinks({ links: [{ index: 0, personal: "你会中文，能直接读中国原文", link: "在日本做电商广告", edge: true }] }, [0], ["在日本做电商广告的数据分析"]);
    expect(links[0].edge).toBe(true);
  });
  it("领域只认 PESTLE 六种", () => {
    const pick = (index: number, domain: string) => ({ index, event: `e${index}`, headline: "h", background: "b", forYou: "f", domain });
    const { picks } = parseBrief({ overview: "今天", picks: [pick(0, "economic"), pick(1, "sports")] }, titles(3));
    expect(picks.map((p) => p.domain)).toEqual(["economic", undefined]);
  });
});

describe("parseDigest", () => {
  it("编号对得上才留，最多 3 条；总述必须有", () => {
    const d = parseDigest(
      {
        summary: "今天最大的事是日银加息，倒产和外国司机其实是同一个人手不足的不同面。",
        picks: [
          { signalId: "a", why: "加息会传到中小企业贷款" },
          { signalId: "zzz", why: "编号不在材料里" },
          { signalId: "b", why: "意外：降价反而增利" },
          { signalId: "a", why: "重复" },
        ],
      },
      ["a", "b", "c"]
    );
    expect(d.picks.map((p) => p.signalId)).toEqual(["a", "b"]);
    expect(() => parseDigest({ picks: [] }, ["a"])).toThrow("summary");
  });

  it("写了'跟你'就作废（写总览时没给它任何关于他的信息）", () => {
    expect(() => parseDigest({ summary: "今天日银加息。", picks: [{ signalId: "a", why: "跟你做的产品有关" }] }, ["a"])).toThrow();
  });
});

describe("总览里可以往下推的一条", () => {
  it("编号对得上、2 到 4 步才收；写可能性数字或跟你就当没写", () => {
    expect(parseDigestChain({ signalId: "a", steps: ["日银加息", "中小企业贷款变贵", "招人更难"] }, ["a"])).toEqual({
      chain: { signalId: "a", steps: ["日银加息", "中小企业贷款变贵", "招人更难"] },
    });
    expect(parseDigestChain({ signalId: "a", steps: ["只有一步"] }, ["a"])).toEqual({});
    expect(parseDigestChain({ signalId: "zzz", steps: ["一", "二"] }, ["a"])).toEqual({});
    expect(parseDigestChain({ signalId: "a", steps: ["日银加息", "有七成的可能贷款变贵"] }, ["a"])).toEqual({});
    expect(parseDigestChain(undefined, ["a"])).toEqual({});
  });
});

describe("parseGapPicks（差距清单每天专门扫）", () => {
  const titles = ["美团推出无人机送药服务，30分钟送达", "日銀、追加利上げを決定", "Show HN: Usage-based billing for plumbers"];

  it("序号和照抄的标题对得上才收；数错一位按标题换回；没标题、缺背景的丢掉", () => {
    const picks = parseGapPicks(
      {
        picks: [
          { index: 1, title: "美团推出无人机送药服务", headline: "美团用无人机给城市家庭送药", background: "下单后无人机送到小区取货柜，30 分钟内送到。" },
          { index: 2, headline: "给水管工的按用量收费软件", background: "按派单次数收费。" },
          { index: 2, title: "Show HN: Usage-based billing", headline: "给水管工的按用量收费软件", background: "" },
        ],
      },
      titles
    );
    expect(picks).toEqual([
      { index: 0, headline: "美团用无人机给城市家庭送药", background: "下单后无人机送到小区取货柜，30 分钟内送到。" },
    ]);
  });

  it("可以一条都没有；不是数组不收", () => {
    expect(parseGapPicks({ picks: [] }, titles)).toEqual([]);
    expect(() => parseGapPicks({}, titles)).toThrow("picks");
  });
});

describe("parseJapanQueries（先只写搜索词，看完资料再下结论）", () => {
  const inputs = [
    { index: 2, headline: "美团推出无人机送药", background: "b" },
    { index: 5, headline: "某公司高管辞职", background: "b" },
  ];
  it("只留要问的那几条，空的、重复的、序号不对的丢掉；跳过的那条就是没有", () => {
    expect(
      parseJapanQueries(
        { items: [{ index: 2, query: "ドローン 医薬品 配送" }, { index: 2, query: "重复" }, { index: 9, query: "x" }, { index: 5, query: " " }] },
        inputs
      )
    ).toEqual([{ index: 2, query: "ドローン 医薬品 配送" }]);
    expect(() => parseJapanQueries({}, inputs)).toThrow("items");
  });
});

describe("parseOutcomeQueries（到期对账先查现在怎样）", () => {
  it("query 必须有；counterQuery 可以空；过长的截断", () => {
    expect(parseOutcomeQueries({ query: " 日銀 利上げ 2026年12月 ", counterQuery: "日銀 利上げ 見送り" })).toEqual({
      query: "日銀 利上げ 2026年12月",
      counterQuery: "日銀 利上げ 見送り",
    });
    expect(parseOutcomeQueries({ query: "x" }).counterQuery).toBe("");
    expect(() => parseOutcomeQueries({ counterQuery: "x" })).toThrow("query");
    expect(parseOutcomeQueries({ query: "a".repeat(200) }).query).toHaveLength(120);
  });
});

describe("历史题：出题和核实", () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    topic: 0,
    setup: "2023 年 6 月，楽天モバイル宣布缩小和 KDDI 的漫游合作范围，自建基站覆盖率超过 98%。",
    question: "到 2024 年 6 月底，楽天モバイル的签约数会不会超过 700 万？",
    deadline: "2024-06-30",
    answer: true,
    whatHappened: "2024 年 5 月签约数超过 700 万。",
    whySimilar: "都是靠自建网络撑用户数。",
    query: "楽天モバイル 契約数 700万 2024",
    ...over,
  });

  it("期限要早于今天半年以前；题面漏了结果的、答案不是 true/false 的丢掉", () => {
    const drills = parseDrillDrafts(
      {
        drills: [
          draft(),
          draft({ deadline: "2026-09-30" }),
          draft({ setup: "后来楽天モバイル的签约数大涨。" }),
          draft({ answer: "会" }),
          draft({ topic: 9 }),
        ],
      },
      2,
      "2026-10-13"
    );
    expect(drills.map((d) => [d.deadline, d.topic])).toEqual([
      ["2024-06-30", 0],
      ["2024-06-30", -1],
    ]);
  });

  it("核实：原文逐字对得上才留；改正的要有新答案和说明；没出处的整道丢掉", () => {
    const sources = [{ title: "楽天", url: "https://example.jp/r", content: "楽天モバイルは2024年5月、契約数が700万回線を突破したと発表した。" }];
    const d = parseDrillDrafts({ drills: [draft()] }, 1, "2026-10-13")[0];
    const inputs = [
      { draft: d, sources },
      { draft: { ...d, question: "另一道" }, sources },
      { draft: { ...d, question: "第三道" }, sources },
    ];
    const checked = parseDrillChecks(
      {
        items: [
          { i: 0, status: "supported", basis: [{ source: 1, excerpt: "契約数が700万回線を突破したと発表した" }] },
          { i: 1, status: "corrected", answer: false, whatHappened: "没超过。", correction: "原来说超过，资料里是没超过", basis: [{ source: 1, excerpt: "资料里没有这句话原文" }] },
          { i: 2, status: "corrected", answer: false, whatHappened: "到 6 月底没超过。", correction: "原来说会，资料里是不会", basis: [{ source: 1, excerpt: "楽天モバイルは2024年5月" }] },
        ],
      },
      inputs
    );
    expect(checked.map((c) => [c.question, c.answer, c.check.status])).toEqual([
      [d.question, true, "supported"],
      ["第三道", false, "corrected"],
    ]);
  });
});
