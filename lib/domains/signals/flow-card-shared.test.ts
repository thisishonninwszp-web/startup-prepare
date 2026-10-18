import { describe, expect, it } from "vitest";
import { readFlowCard, signFlowCard } from "./flow-card-shared";

const card = { headline: "日银加息到0.75%", flow: { cause: "物价连续上涨", event: "日银加息到0.75%", affected: "中小企业", watch: "地方银行下周的贷款利率" } };

describe("邮件里的一图看懂：签了名才画", () => {
  it("签名对得上就原样读回来（中文不乱）", async () => {
    const { d, s } = await signFlowCard(card, "secret");
    expect(await readFlowCard(d, s, "secret")).toEqual(card);
  });

  it("内容被改过、密钥不对、缺参数：不画", async () => {
    const { d, s } = await signFlowCard(card, "secret");
    const other = await signFlowCard({ ...card, headline: "别的" }, "secret");
    expect(await readFlowCard(other.d, s, "secret")).toBeNull();
    expect(await readFlowCard(d, s, "wrong")).toBeNull();
    expect(await readFlowCard("", s, "secret")).toBeNull();
    expect(await readFlowCard(d, s, "")).toBeNull();
  });
});
