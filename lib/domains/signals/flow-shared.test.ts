import { describe, expect, it } from "vitest";
import { checkFlow } from "./flow-shared";

const body = "日本银行10月30日决定把政策利率提高到0.75%。地方银行表示下周起上调贷款利率，中小企业的利息负担会加重。";
const ok = { cause: "物价连续上涨", event: "日银加息到0.75%", affected: "靠借款周转的中小企业", watch: "地方银行下周的贷款利率。" };

describe("一图看懂：四个框", () => {
  it("四个框都合格才画；句末的句号去掉", () => {
    expect(checkFlow(ok, body)).toEqual({ ...ok, watch: "地方银行下周的贷款利率" });
  });

  it("数字不在正文里、缺一个框、太长、不是对象：整张不画", () => {
    expect(checkFlow({ ...ok, event: "日银加息到1%" }, body)).toBeNull();
    expect(checkFlow({ ...ok, watch: "" }, body)).toBeNull();
    expect(checkFlow({ ...ok, affected: "长".repeat(25) }, body)).toBeNull();
    expect(checkFlow("x", body)).toBeNull();
  });

  it("「值得关注」「持续观察」、下结论的话：整张不画", () => {
    expect(checkFlow({ ...ok, watch: "值得持续关注" }, body)).toBeNull();
    expect(checkFlow({ ...ok, event: "这表明利率进入新阶段" }, body)).toBeNull();
  });
});
