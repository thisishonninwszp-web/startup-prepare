import { describe, expect, it } from "vitest";
import { buildListenScript, listenMinutes } from "./listen-script";

describe("听今天的报告", () => {
  const sections = [
    { title: "今天的世界", overview: "总述。", items: [{ signal_id: "a", headline: "日银加息", background: "背景。" }, { signal_id: "p", headline: "练习那条", background: "不能剧透。" }] },
    { title: "谁在掏钱", overview: null, items: [] },
  ];
  it("先总览，再每节总述和每条；练习那条不念背景；没条目的节不念", () => {
    const s = buildListenScript({ digest: "今天最重要的是日银加息。", sections, hiddenSignalId: "p" });
    expect(s[0]).toBe("AI 今日总览");
    expect(s).toContain("以下是 AI 整理与推断。");
    expect(s).toContain("练习那条。这条是今天的练习题，先自己判断。");
    expect(s.join("")).not.toContain("不能剧透");
    expect(s).not.toContain("谁在掏钱");
  });
  it("几分钟：三百字一分钟，至少一分钟", () => {
    expect(listenMinutes(["字".repeat(1500)])).toBe(5);
    expect(listenMinutes([])).toBe(1);
  });
});
