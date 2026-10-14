import { describe, expect, it } from "vitest";
import {
  assembleDrafts,
  decideIssueBet,
  gapDemand,
  coverItems,
  coverTopLabel,
  coverSingle,
  coverUrl,
  ISSUE_CTA,
  issueCounts,
  sourcesBlock,
  stanceSentence,
  validStance,
  weekStartOf,
  xIntentUrl,
  xhsTags,
  type IssuePick,
} from "./issue-shared";

const pick = (over: Partial<IssuePick> = {}): IssuePick => ({
  side: "japan",
  signal_id: "s1",
  headline: "美团用无人机送药",
  background: "b",
  here: "没有。",
  sources: [
    { title: "原文", url: "https://example.cn/1" },
    { title: "日本这边", url: "https://example.jp/1" },
  ],
  judgment: "两年内日本会先在离岛试点，城市里法规还卡着。",
  ...over,
});

describe("周刊", () => {
  it("weekStartOf：那一周的周一", () => {
    expect(weekStartOf("2026-10-14")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12");
  });

  it("sourcesBlock：同一个链接只列一次", () => {
    const block = sourcesBlock([pick(), pick({ signal_id: "s2", sources: [{ title: "原文", url: "https://example.cn/1" }] })], "zh");
    expect(block.split("\n")).toEqual(["出处：", "・原文 https://example.cn/1", "・日本这边 https://example.jp/1"]);
  });

  it("assembleDrafts：长文加结尾和出处，小红书每篇加结尾和话题标签", () => {
    const d = assembleDrafts(
      { zhLong: "正文", zhNotes: [{ title: "t", body: "短" }], jaLong: "本文", zhTitles: ["t"], jaTitles: ["t"] },
      [pick()]
    );
    expect(d.zhLong.startsWith("正文\n\n" + ISSUE_CTA.zh + "\n\n出处：")).toBe(true);
    expect(d.zhNotes?.[0].body).toBe("短\n\n" + ISSUE_CTA.zh + "\n\n" + xhsTags("japan"));
    expect(d.jaLong).toContain("出典：");
  });

  it("issueCounts：只数次数", () => {
    expect(
      issueCounts({
        published: [{ platform: "小红书", url: "", at: "" }],
        responses: [
          { at: "", observation_id: "o1", wants_talk: true },
          { at: "", observation_id: "o2", wants_talk: false },
        ],
      })
    ).toEqual({ published: 1, responses: 2, wantsTalk: 1 });
  });
});

describe("点三下就是判断", () => {
  it("stanceSentence：点的拼成一句，补的那句原样接在后面；其他、没点的不说", () => {
    expect(stanceSentence({ will: "will", blocker: "law", firstMover: "startup" }, "日本")).toBe(
      "我押2年内日本会出现这个。最大的阻碍是法规。最可能先做的是创业公司。"
    );
    expect(stanceSentence({ will: "wont", blocker: "other" }, "日本", " 便利店已经够近了。")).toBe(
      "我押2年内日本不会出现这个。便利店已经够近了。"
    );
    expect(stanceSentence({ will: "unsure", firstMover: "none" }, "中国")).toBe("2年内中国会不会出现，我说不清。我觉得不会有人做。");
  });

  it("validStance：只认规定的选项；第一问必须有", () => {
    expect(validStance({ will: "will", blocker: "law", firstMover: "x" })).toEqual({ will: "will", blocker: "law" });
    expect(validStance({ blocker: "law" })).toBeNull();
    expect(validStance({ will: "maybe" })).toBeNull();
    expect(validStance(null)).toBeNull();
  });

  it("xIntentUrl：内容编码进发帖框的链接", () => {
    expect(xIntentUrl("中国では #ドローン")).toBe("https://twitter.com/intent/tweet?text=" + encodeURIComponent("中国では #ドローン"));
  });
});

describe("小红书封面", () => {
  it("顶上那行：同一个方向写方向，混着的写那边 / 这边", () => {
    expect(coverTopLabel([{ side: "japan" }, { side: "japan" }])).toBe("中国有 · 日本还没有");
    expect(coverTopLabel([{ side: "china" }])).toBe("日本有 · 中国还没有");
    expect(coverTopLabel([{ side: "japan" }, { side: "us" }])).toBe("那边有 · 这边还没有");
  });

  it("每条标题截到两行放得下；押的是什么写成一句；最多三条", () => {
    const long = "美团在深圳用无人机给小区送药三十分钟送到取货柜而且已经覆盖了好几个区还在扩大";
    const items = coverItems([
      { headline: long, stance: { will: "will" } },
      { headline: "短", stance: { will: "wont" } },
      { headline: "说不清的", stance: { will: "unsure" } },
      { headline: "第四条不上封面" },
    ]);
    expect(items).toHaveLength(3);
    expect(Array.from(items[0].headline)).toHaveLength(30);
    expect(items[0].headline.endsWith("…")).toBe(true);
    expect(items.map((i) => i.stance)).toEqual(["我押：2 年内会出现", "我押：2 年内不会出现", "我说不清"]);
    expect(coverItems([{ headline: "没点过的老数据" }])[0].stance).toBe("");
  });

  it("coverUrl：带上生成时间，换了稿子不会拿到旧图", () => {
    expect(coverUrl({ id: "i1", updated_at: "2026-10-14T01:02:03Z" })).toBe("/api/issue-card/i1?v=2026-10-14T01%3A02%3A03Z");
    expect(coverUrl({ id: "i1", updated_at: "x" }, 2)).toBe("/api/issue-card/i1?pick=2&v=x");
  });

  it("单篇封面：有笔记标题就用它当大标题、新闻标题放下面；没有就用新闻标题", () => {
    const p = { side: "japan" as const, headline: "美团用无人机送药", stance: { will: "will" as const } };
    expect(coverSingle(p, "在日本找不到的中国服务")).toEqual({
      top: "中国有 · 日本还没有",
      title: "在日本找不到的中国服务",
      headline: "美团用无人机送药",
      stance: "我押：2 年内会出现",
    });
    expect(coverSingle(p, undefined).title).toBe("美团用无人机送药");
    expect(coverSingle(p, undefined).headline).toBe("");
  });

  it("话题标签：日本有中国没有的那一类，标签给想买日本东西、做跨境的人", () => {
    expect(xhsTags("china")).toContain("#跨境电商");
    expect(xhsTags("japan")).toContain("#出海日本");
  });
});

describe("自动对账（只在有出处的时候替他对）", () => {
  const bet = {
    prediction_id: "p1",
    judgment_id: "j1",
    side: "japan" as const,
    signal_id: "s1",
    will: "will" as const,
    made_on: "2026-10-15",
    due_at: "2028-10-15T00:00:00Z",
  };
  const basis = [{ url: "https://example.jp/a", title: "PayPay", excerpt: "e" }];
  const recheck = (checked_on: string, verdict: "still" | "arrived" | "unclear", signal_id = "s1") => ({
    signal_id,
    side: "japan" as const,
    checked_on,
    verdict,
    japan: verdict === "arrived" ? "有，已经上线。" : "没有。",
    source_check: { status: "supported" as const, basis },
    funded: null,
  });

  it("押之后查到这边有了：押会的算对、押不会的算错，带出处", () => {
    const d = decideIssueBet(bet, [recheck("2027-03-01", "arrived"), recheck("2026-11-15", "still")], "2027-03-02");
    expect(d?.outcome).toBe("hit");
    expect(d?.note).toContain("2027-03-01");
    expect(d?.note).toContain("https://example.jp/a");
    expect(decideIssueBet({ ...bet, will: "wont" }, [recheck("2027-03-01", "arrived")], "2027-03-02")?.outcome).toBe("miss");
  });

  it("押之前的重查、别的条目的重查不算；没到期也没有了就不动", () => {
    expect(decideIssueBet(bet, [recheck("2026-09-01", "arrived"), recheck("2027-01-01", "arrived", "other")], "2027-03-02")).toBeNull();
    expect(decideIssueBet(bet, [recheck("2027-01-01", "still")], "2027-03-02")).toBeNull();
  });

  it("到期时最近一次重查有出处说还没有：押会的算错；没查清、太久没查就留给他", () => {
    expect(decideIssueBet(bet, [recheck("2028-10-01", "still")], "2028-10-20")?.outcome).toBe("miss");
    expect(decideIssueBet({ ...bet, will: "wont" }, [recheck("2028-10-01", "still")], "2028-10-20")?.outcome).toBe("hit");
    expect(decideIssueBet(bet, [recheck("2028-10-01", "unclear")], "2028-10-20")).toBeNull();
    expect(decideIssueBet(bet, [recheck("2028-06-01", "still")], "2028-10-20")).toBeNull();
  });
});

describe("每篇笔记就是一次需求测试", () => {
  it("gapDemand：按条目数说想要、问哪里买、想聊；整期的回应不算到哪一条上", () => {
    const issue = {
      content: { opening: "", bets: [], picks: [pick(), pick({ side: "us", signal_id: "s2" })] },
      responses: [
        { at: "", observation_id: "o1", wants_talk: true, pick: 0, signal: "pain" as const },
        { at: "", observation_id: "o2", wants_talk: false, pick: 0, signal: "pay" as const },
        { at: "", observation_id: "o3", wants_talk: false, pick: 1 },
        { at: "", observation_id: "o4", wants_talk: true },
      ],
    };
    const d = gapDemand([issue]);
    expect(d.get("japan:s1")).toEqual({ pain: 1, pay: 1, other: 0, wantsTalk: 1 });
    expect(d.get("us:s2")).toEqual({ pain: 0, pay: 0, other: 1, wantsTalk: 0 });
    expect(d.size).toBe(2);
  });
});
