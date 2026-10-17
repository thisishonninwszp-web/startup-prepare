import { describe, expect, it } from "vitest";
import type { BriefItem } from "./brief";
import { cleanBriefItem, dropEmptyConclusions, isCommentSentence } from "./filler";

describe("去掉只给前面下结论的空话", () => {
  it("整句只是在评论上一句：删掉", () => {
    const r = dropEmptyConclusions("个人信息保护委员会要求各企业检查。这表明日本政府高度重视个人信息保护问题，并敦促各企业加强防范。");
    expect(r.text).toBe("个人信息保护委员会要求各企业检查。");
    expect(r.dropped).toEqual(["这表明日本政府高度重视个人信息保护问题，并敦促各企业加强防范。"]);
  });

  it("前半句是事实、后半句「，这意味着……」：只删后半句", () => {
    const r = dropEmptyConclusions("调查还显示，不到两成的令牌支出能证明与量化财务成果相关联，这意味着许多AI投资未能带来明确的业务效益。");
    expect(r.text).toBe("调查还显示，不到两成的令牌支出能证明与量化财务成果相关联。");
    expect(r.dropped).toEqual(["这意味着许多AI投资未能带来明确的业务效益"]);
  });

  it("「，并凸显了……」「，并预示了……」也删", () => {
    expect(dropEmptyConclusions("虽然信用卡信息未受影响，但大规模的个人信息泄露仍可能损害用户信任，并凸显了移动应用平台的数据安全风险。").text).toBe(
      "虽然信用卡信息未受影响，但大规模的个人信息泄露仍可能损害用户信任。"
    );
    expect(dropEmptyConclusions("这满足了消费者对便捷茶饮的需求，并预示了O2O服务的整合趋势。").text).toBe("这满足了消费者对便捷茶饮的需求。");
  });

  it("「这些事件共同说明了」「这一变化标志着」「此举意味着」「这也反映了」都算", () => {
    for (const s of ["这些事件共同说明了行业结构正在快速变化。", "这一变化标志着货币政策进入新阶段。", "此举意味着竞争加剧。", "这也反映了 Rust 的影响力。"]) {
      expect(isCommentSentence(s)).toBe(true);
    }
  });

  it("句子里有具体的人和事的不动：宁可漏删，不删事实", () => {
    const kept = [
      "这种国际趋势可能会影响日本央行（BOJ）的货币政策，促使日本银行调整利率，例如瑞穗银行已开始上调其储蓄存款利率。",
      "植田总裁在会上，表明了继续加息的态度。",
      "丰田公布财报，并表明将增加投资。",
      "这家公司表明将在明年上市。",
    ];
    for (const s of kept) expect(dropEmptyConclusions(s)).toEqual({ text: s, dropped: [] });
  });

  it("全是空话就原样返回（交给上游）；删过的再跑一遍不变", () => {
    expect(dropEmptyConclusions("这表明行业在变。")).toEqual({ text: "这表明行业在变。", dropped: [] });
    const once = dropEmptyConclusions("日银加息到 0.75%。这表明货币政策进入新阶段。").text;
    expect(dropEmptyConclusions(once)).toEqual({ text: once, dropped: [] });
  });
});

describe("一条报告条目", () => {
  const item = {
    signal_id: "s",
    title: "t",
    url: null,
    source: "x",
    headline: "h",
    background: "日银加息到 0.75%。这表明货币政策进入新阶段。",
    for_you: "地方银行要重算贷款利率，这意味着中小企业利息变重。",
    precedent: "DiDi Food 在日本撤退过，这也反映出外卖难做。",
  } as BriefItem;

  it("背景、主要影响谁、先例都删一遍，删掉的记在 dropped", () => {
    const c = cleanBriefItem(item);
    expect(c.background).toBe("日银加息到 0.75%。");
    expect(c.for_you).toBe("地方银行要重算贷款利率。");
    expect(c.precedent).toBe("DiDi Food 在日本撤退过。");
    expect(c.dropped).toEqual(["这表明货币政策进入新阶段。", "这意味着中小企业利息变重", "这也反映出外卖难做"]);
  });

  it("再删一遍不变（存下的 dropped 留着，不重复）", () => {
    const c = cleanBriefItem(item);
    expect(cleanBriefItem(c)).toEqual(c);
  });

  it("「也值得一看」那几条原样返回", () => {
    const extra = { ...item, extra: true, background: "", for_you: "" };
    expect(cleanBriefItem(extra)).toBe(extra);
  });
});
