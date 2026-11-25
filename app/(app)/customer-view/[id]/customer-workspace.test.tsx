import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// 2026-11 用真问题跑了一遍才发现：标签页和两张操作卡片直接用了默认的橙色按钮，
// 没选中的标签橙底灰字读不出来，卡片不换行、标题是白字，说明被切掉，窄屏上整张卡片被挤出左边。

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({
  addCustomerMaterial: vi.fn(),
  createCustomerProxyVersion: vi.fn(),
  createCustomerTopic: vi.fn(),
  previewCustomerUrl: vi.fn(),
  retryCustomerMaterialEvidence: vi.fn(),
  reviewCustomerMaterial: vi.fn(),
  runCustomerIdeaReaction: vi.fn(),
  runCustomerResearch: vi.fn(),
  saveCustomerConclusion: vi.fn(),
  searchCustomerMaterials: vi.fn(),
  sendCustomerProxyMessage: vi.fn(),
}));

import { CustomerWorkspace } from "./customer-workspace";
import type { CustomerCaseDetail } from "../queries";

const emptyCase = {
  id: "case",
  idea_id: null,
  title: "在日本用好几个 App 买基金的人，怎么看自己一共有多少钱",
  customer_hypothesis: "在两个以上证券公司买了投资信托的人",
  problem_context: "得挨个登录每个 App 看",
  markets: ["jp"],
  original_belief: "会愿意用一个汇总的 App",
  created_at: "2026-11-25T00:00:00Z",
  materials: [],
  atoms: [],
  runs: [],
  versions: [],
  topics: [],
} as unknown as CustomerCaseDetail;

/** 把渲染结果里的每个 <button> 拆成 { class, text }。 */
function buttons(html: string) {
  return [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
    className: match[1].match(/class="([^"]*)"/)?.[1] ?? "",
    text: match[2].replace(/<[^>]+>/g, ""),
  }));
}

describe("CustomerWorkspace layout", () => {
  const html = renderToStaticMarkup(<CustomerWorkspace initialCase={emptyCase} ideas={[]} />);
  const all = buttons(html);

  it("draws the tabs as plain tabs, not orange buttons", () => {
    const tabs = all.filter((b) => /^(材料 \d|顾客声音 \d|顾客代理 \d|理解更新)/.test(b.text));
    expect(tabs).toHaveLength(4);
    for (const tab of tabs) {
      expect(tab.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
      expect(tab.className).toContain("border-b-2");
    }
  });

  it("lets the action cards wrap their text and keeps their titles dark", () => {
    const cards = all.filter((b) => /搜索公开材料|添加用户材料/.test(b.text));
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.className).toContain("whitespace-normal");
      expect(card.className).not.toContain("whitespace-nowrap");
      expect(card.className).not.toMatch(/(^|\s)text-primary-foreground(\s|$)/);
    }
  });
});
