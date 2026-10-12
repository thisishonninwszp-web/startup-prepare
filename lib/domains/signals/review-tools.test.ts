import { describe, expect, it } from "vitest";
import { dropBadSentences, dropFillerSentences, parseDigestDetail, parseRepoExplanations, parseWeeklyDigest, practiceHorizon, questionDeadline, weekdayOf } from "@/lib/ai/signals";
import { splitRepoText } from "./feeds";
import type { BriefItem } from "./brief";
import { countFeedback } from "./feedback";
import { describeMove, isUnusual, parseYahooChart, weeklyMove, type FastVariable } from "./fast";
import { collectJapanGaps, gapIdeaDraft, gapObservationText } from "./gaps-shared";
import { deadlineLabel, displayQuestion, milestoneQuestion, tallyMissReasons, type JudgmentRow } from "./practice-shared";
import { countPicks, sortHealth } from "./source-health";
import { lastWeekRange } from "./weekly";

const found = { status: "supported" as const, basis: [{ url: "https://example.jp", title: "t", excerpt: "原文原文原文原文" }] };

function item(over: Partial<BriefItem>): BriefItem {
  return {
    signal_id: "s1",
    title: "t",
    url: null,
    source: "news:hackernews",
    headline: "某公司推出按用量收费的客服 AI",
    background: "b",
    for_you: "f",
    japan: "没有。日本这类服务还是按月固定收费。",
    japan_check: found,
    ...over,
  };
}

describe("美国有、日本还没有", () => {
  it("按出发地分开两张清单，老数据没有 origin 算中国的", () => {
    const briefs = [
      {
        brief_date: "2026-10-10",
        items: [item({ signal_id: "us1", origin: "us" }), item({ signal_id: "cn1", origin: "china" }), item({ signal_id: "old" })],
      },
    ];
    expect(collectJapanGaps(briefs, "us").map((g) => g.signal_id)).toEqual(["us1"]);
    expect(collectJapanGaps(briefs, "japan").map((g) => g.signal_id)).toEqual(["cn1", "old"]);
  });

  it("记成观察、变成想法时写对那边和这边", () => {
    const [gap] = collectJapanGaps([{ brief_date: "2026-10-10", items: [item({ origin: "us" })] }], "us");
    expect(gapObservationText(gap, "想看看", "us")).toContain("美国有、日本还没有");
    const draft = gapIdeaDraft(gap, "us");
    expect(draft.title.startsWith("日本版：")).toBe(true);
    expect(draft.hypothesis.solution).toContain("把美国已经跑通的做法带到日本");
    expect(draft.tags).toContain("美日差距");
    expect(gapIdeaDraft(gap, "china").hypothesis.alternative.startsWith("中国这边")).toBe(true);
  });
});

describe("判断：错在哪一步、长期判断的苗头", () => {
  const row = (over: Partial<JudgmentRow>): JudgmentRow => ({
    id: "j",
    signal_id: null,
    prediction_id: "p",
    news_title: "",
    news_url: null,
    question: "q",
    judgment: "",
    feedback: null,
    created_at: "",
    due_at: "",
    outcome: "miss",
    confidence: null,
    resolved_at: null,
    note: null,
    tags: [],
    question_id: null,
    ...over,
  });

  it("只数看错的、按原因数次数", () => {
    const t = tallyMissReasons([row({ miss_reason: "timing" }), row({ miss_reason: "timing" }), row({ outcome: "hit", miss_reason: "timing" }), row({})]);
    expect(t.find((x) => x.reason === "timing")?.count).toBe(2);
    expect(t.reduce((n, x) => n + x.count, 0)).toBe(2);
  });

  it("苗头题显示成中途苗头", () => {
    expect(displayQuestion(milestoneQuestion("便利店会不会无人化"))).toBe("长期判断的中途苗头：便利店会不会无人化");
  });
});

describe("每一节有没有用、信息源体检", () => {
  it("按节数有用和没用", () => {
    const t = countFeedback([
      { kind: "news", useful: true },
      { kind: "news", useful: false },
      { kind: "tools", useful: false },
    ]);
    expect(t.find((x) => x.kind === "news")).toEqual({ kind: "news", useful: 1, useless: 1 });
    expect(t.find((x) => x.kind === "tools")).toEqual({ kind: "tools", useful: 0, useless: 1 });
    expect(t).toHaveLength(5);
  });

  it("挑中只数精选；坏了的排最前，再是从没挑中的", () => {
    const picks = countPicks([
      { source: "news:a", extra: undefined },
      { source: "news:a" },
      { source: "news:b", extra: true },
    ]);
    expect(picks.get("news:a")).toBe(2);
    expect(picks.has("news:b")).toBe(false);
    const sorted = sortHealth([
      { source: "a", label: "a", kind: "news", fetched: 40, picked: 3 },
      { source: "b", label: "b", kind: "news", fetched: 30, picked: 0 },
      { source: "c", label: "c", kind: "news", fetched: 0, picked: 0 },
    ]);
    expect(sorted.map((r) => r.source)).toEqual(["c", "b", "a"]);
  });
});

describe("快变量", () => {
  const v: FastVariable = { key: "usdjpy", symbol: "JPY=X", label: "美元日元", mode: "pct", digits: 2 };
  const week = 7 * 86_400;

  it("拿最近一周跟近两年每一周比，数比它大的有几次", () => {
    // 60 周每周涨 0.1%，最后一周涨 3%
    const pts = Array.from({ length: 61 }, (_, i) => ({ t: i * week, close: 100 * Math.pow(1.001, i) }));
    pts.push({ t: 61 * week, close: pts[60].close * 1.03 });
    const m = weeklyMove(v, pts)!;
    expect(m.change).toBeCloseTo(3, 5);
    expect(m.weeks).toBe(60);
    expect(m.asBig).toBe(0);
    expect(isUnusual(m)).toBe(true);
    expect(describeMove(m)).toContain("一次都没有");
  });

  it("数据不满一年不提醒；平常的波动不提醒", () => {
    const short = Array.from({ length: 20 }, (_, i) => ({ t: i * week, close: 100 + (i % 2) * 5 }));
    expect(isUnusual(weeklyMove(v, short)!)).toBe(false);
    const calm = Array.from({ length: 80 }, (_, i) => ({ t: i * week, close: 100 + (i % 2) }));
    expect(isUnusual(weeklyMove(v, calm)!)).toBe(false);
  });

  it("最后一个点是本周到现在时，跟一周前的点比", () => {
    const pts = [
      { t: 0, close: 100 },
      { t: week, close: 101 },
      { t: 2 * week, close: 102 },
      { t: 2 * week + 3 * 86_400, close: 110 },
    ];
    expect(weeklyMove(v, pts)!.prev.close).toBe(101);
  });

  it("解析 Yahoo 接口时跳过空值", () => {
    const pts = parseYahooChart({
      chart: { result: [{ timestamp: [1, 2, 3], indicators: { quote: [{ close: [1.5, null, 2] }] } }] },
    });
    expect(pts).toEqual([
      { t: 1, close: 1.5 },
      { t: 3, close: 2 },
    ]);
  });
});

describe("周报", () => {
  it("上一周是周一到周日", () => {
    expect(lastWeekRange("2026-10-12")).toEqual({ start: "2026-10-05", end: "2026-10-11" }); // 周一
    expect(lastWeekRange("2026-10-18")).toEqual({ start: "2026-10-05", end: "2026-10-11" }); // 周日
  });

  it("一条线要来自至少两个不同的日子，编号要对得上", () => {
    const dayOf = new Map([
      ["a", "2026-10-05"],
      ["b", "2026-10-07"],
      ["c", "2026-10-07"],
    ]);
    const w = parseWeeklyDigest(
      {
        summary: "这一周的主线是日银加息的预期，从周初一直响到周末。",
        threads: [
          { title: "日银加息预期升温", note: "周一先是传闻，周三官员讲话证实了方向。", signalIds: ["a", "b"] },
          { title: "同一天的两条", note: "都在周三。", signalIds: ["b", "c"] },
          { title: "编号对不上", note: "编出来的。", signalIds: ["a", "zzz"] },
        ],
      },
      dayOf
    );
    expect(w.threads.map((t) => t.title)).toEqual(["日银加息预期升温"]);
  });

  it("去掉提了材料里没有的日子、自己推因果的那一句，别的留着", () => {
    const present = new Set([weekdayOf("2026-10-11"), weekdayOf("2026-10-12")]);
    expect(Array.from(present).sort()).toEqual(["周一", "周日"]);
    const out = dropBadSentences("周日日银加息。周三又有后续。这说明利率时代来了。周一地方银行跟进。", present);
    expect(out).toBe("周日日银加息。周一地方银行跟进。");
  });

  it("编了跟他的关系就不收", () => {
    expect(() => parseWeeklyDigest({ summary: "这一周的事跟你的工作关系很大。", threads: [] }, new Map())).toThrow();
  });
});

describe("GitHub 仓库的中文一句", () => {
  it("拆出中文那一句和英文原简介；老数据没有中文就整段当原简介", () => {
    expect(splitRepoText("中文：拿来发邮件\nSelf-hosted · 语言：JS")).toEqual({ zh: "拿来发邮件", rest: "Self-hosted · 语言：JS" });
    expect(splitRepoText("Self-hosted · 语言：JS")).toEqual({ zh: null, rest: "Self-hosted · 语言：JS" });
  });

  it("模型只写仓库短名也认；短名撞车、夸奖、日文的那一句丢掉", () => {
    const names = ["a/mailer", "b/tool", "c/tool", "d/hype", "e/ja"];
    const m = parseRepoExplanations(
      [
        { name: "mailer", zh: "一个自己搭的群发邮件系统，做电商的人可以拿它给老客户发新品通知。" },
        { name: "tool", zh: "撞车了，不知道是哪个。" },
        { name: "d/hype", zh: "一个很有潜力的工具。" },
        { name: "e/ja", zh: "これはメールを送るためのツールです。" },
      ],
      names
    );
    expect(Array.from(m.keys())).toEqual(["a/mailer"]);
  });

  it("一个都对不上就算没写出来（让它重写一次）", () => {
    expect(() => parseRepoExplanations({ items: [{ name: "zzz", zh: "随便" }] }, ["a/b"])).toThrow();
  });
});

describe("练习题的期限跟着题目里的时间点走", () => {
  const today = "2026-10-12";
  it("认得出明年底、某年某月、不带年份的月份", () => {
    expect(questionDeadline("到明年底，豆芽价格会不会涨", today)?.toISOString().slice(0, 10)).toBe("2027-12-31");
    expect(questionDeadline("2027年3月底前，日银会不会再加息", today)?.toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(questionDeadline("到1月底，JR 东日本会不会公布赔偿方案", today)?.toISOString().slice(0, 10)).toBe("2027-01-31");
    expect(questionDeadline("到12月底会不会", today)?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(questionDeadline("会不会涨价", today)).toBeNull();
  });

  it("到明年底的题配一年，不配一个月；没写时间点就用 AI 给的档", () => {
    // 2027-12-31 离今天 445 天，超过一年 → 三年那一档（宁可长不能短）
    expect(practiceHorizon("到明年底，豆芽价格会不会涨", "1m", today)).toBe("3y");
    expect(practiceHorizon("到1月底，JR 东日本会不会公布赔偿方案", "6m", today)).toBe("6m");
    expect(practiceHorizon("到11月底会不会", undefined, today)).toBe("3m");
    expect(practiceHorizon("会不会涨价", "1m", today)).toBe("1m");
  });
});

describe("总览和详细报告的空话", () => {
  it("去掉抽象收尾的那一句，别的留着", () => {
    expect(dropFillerSentences("三分之一的企业 AI 预算超支。这凸显了新技术的成熟度不足。豆芽厂少了一半。总的来看，结构在变。")).toBe(
      "三分之一的企业 AI 预算超支。豆芽厂少了一半。"
    );
  });

  it("详细报告：编号对不上、没写盯什么的丢掉；发生了什么里自推因果和套话的句子去掉", () => {
    const d = parseDigestDetail(
      {
        themes: [
          {
            title: "豆芽厂接连倒闭",
            signalIds: ["a", "zzz"],
            happened: "全国豆芽厂从235家降到86家。这说明行业要完了。",
            context: "随着成本上涨，企业普遍承压。燃料费三年涨了四成。",
            open: "会不会涨价：会，因为厂少了；不会，因为超市压价。",
            watch: "下个月东京商工リサーチ的食品业倒闭件数",
          },
          { title: "没写盯什么", signalIds: ["a"], happened: "有事发生。", context: "", open: "", watch: "" },
        ],
      },
      ["a", "b"]
    );
    expect(d.themes).toHaveLength(1);
    expect(d.themes[0].signalIds).toEqual(["a"]);
    expect(d.themes[0].happened).toBe("全国豆芽厂从235家降到86家。");
    expect(d.themes[0].context).toBe("燃料费三年涨了四成。");
  });
});

describe("练习题里相对的时间说法", () => {
  const today = "2026-10-12";
  it("未来一年内、三个月内、半年后", () => {
    expect(questionDeadline("到未来一年内，企业超支比例会不会降", today)?.toISOString().slice(0, 10)).toBe("2027-10-12");
    expect(questionDeadline("三个月内会不会公布", today)?.toISOString().slice(0, 7)).toBe("2027-01");
    expect(questionDeadline("半年后会不会", today)?.toISOString().slice(0, 7)).toBe("2027-04");
    expect(questionDeadline("3个月内会不会", today)?.toISOString().slice(0, 7)).toBe("2027-01");
  });

  it("新闻总述里换一天也成立的结尾去掉", () => {
    expect(dropFillerSentences("JR 东日本泄露了数百万件个人信息。这些事件共同说明了行业结构和流程正在快速变化。")).toBe("JR 东日本泄露了数百万件个人信息。");
  });
});

describe("按题目对账的日子怎么写", () => {
  it("月底写月底，别的写到哪一天", () => {
    expect(deadlineLabel("2027-12-31")).toBe("2027年12月底");
    expect(deadlineLabel("2027-02-28")).toBe("2027年2月底");
    expect(deadlineLabel("2027-10-12")).toBe("2027年10月12日");
  });
});
