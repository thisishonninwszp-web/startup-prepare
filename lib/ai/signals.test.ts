import { describe, expect, it } from "vitest";
import { assertChinese, mentionsNumericLikelihood, parseAnalogChecks, yearShift, parseBayesDraft, parseGroundedBrief, sameEvent, parseBrief, parseInferenceSteps, trimAnalogLead, whenSpan, parseUserAnalog, parseQuestionLinks, parseKeyFactors, parseQuestionPlan, parseJapanChecks, parseJapanComparisons, parseJudgedTiers, parseJudgmentFeedback, parseNewsAnalysis, parsePersonalLinks, parseSignalHistory, parseSituationFacts, parseStepEvidence, parseToolAnalysis } from "./signals";

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
    const { overview, picks } = parseBrief(brief([pick(0), pick(0), pick(9), pick("2"), pick(1.5)]), 3);
    expect(overview).toBe("今天的世界");
    expect(picks.map((p) => p.index)).toEqual([0, 2]);
  });

  it("一条都对不上、没有 picks、没有总述，就不收", () => {
    expect(() => parseBrief(brief([pick(5)]), 3)).toThrow();
    expect(() => parseBrief({ overview: "x" }, 3)).toThrow("picks");
    expect(() => parseBrief({ picks: [pick(0)] }, 3)).toThrow("overview");
  });

  it("最多 5 条；出现投资建议就作废", () => {
    const many = Array.from({ length: 8 }, (_, i) => pick(i));
    expect(parseBrief(brief(many), 8).picks).toHaveLength(5);
    expect(() => parseBrief(brief([{ ...pick(0), forYou: "可以抄底" }]), 3)).toThrow("抄底");
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
        1
      )
    ).toThrow("日文");
  });
});

describe("parseBrief 的练习题", () => {
  const pick = (index: number) => ({ index, event: `事件${index}`, headline: "日银加息", background: "日银把利率调到一点二五。", forYou: "广告预算可能先被砍。" });
  const base = { overview: "今天日银加息了。", picks: [pick(0), pick(3)] };

  it("练习题指向 picks 里的一条才收", () => {
    const ok = parseBrief({ ...base, practice: { index: 3, question: "三个月后定存利率会过百分之零点五吗？", checkHow: "看三大银行的公告。" } }, 5);
    expect(ok.practice).toEqual({ index: 3, question: "三个月后定存利率会过百分之零点五吗？", checkHow: "看三大银行的公告。" });
    const off = parseBrief({ ...base, practice: { index: 1, question: "q", checkHow: "c" } }, 5);
    expect(off.practice).toBeNull();
  });

  it("没有练习题也收（工具报告）", () => {
    expect(parseBrief(base, 5).practice).toBeNull();
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
    expect(parseBrief({ overview: "这批消息里没有写明日期的变化。", picks: [] }, 10, true).picks).toEqual([]);
    expect(() => parseBrief({ overview: "x", picks: [] }, 10)).toThrow("picks");
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
    expect(links).toEqual([{ index: 0, personal: "跟你的推荐率监测有关。" }]);
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
    expect(tiers).toEqual([
      { likelihood: "likely", unsure: false },
      { likelihood: "unlikely", unsure: true },
    ]);
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
          { index: 7, event: "物流缺人", headline: "又一篇物流缺人的报道" },
          { index: 8, event: "派拉蒙收购", headline: "派拉蒙计划收购华纳" },
        ],
      },
      10
    );
    expect(b.picks.map((p) => p.index)).toEqual([0, 2, 3, 4, 5]);
    expect(b.more.map((m) => m.index)).toEqual([6, 8]);
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
