import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./actions", () => ({ weekPickToIdeaAction: vi.fn() }));
vi.mock("@/lib/domains/signals/week-pick", () => ({ loadWeekPick: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { WeekPickView } from "./week-pick-box";

const pick = {
  side: "japan" as const,
  signal_id: "g1",
  headline: "“养基宝”把几家平台的基金放在一起看",
  title: "日本版：“养基宝”把几家平台的基金放在一起看",
  why: "这周进差距清单（中国有、日本还没有）的 3 条里，根据最多的一条。",
  riskiest: "日本这边还没有它，不是因为没人要。",
  who: [{ who: "正在用「マネーフォワード ME」的人", how: "App Store 上 182863 人评过分。" }],
  test: "这周找 3 个正在用「マネーフォワード ME」的人聊一次。",
  evidence: "根据：网上原话 8 句。",
  url: null,
};

describe("「今天」页周日那一框", () => {
  it("摆出假设、先去问谁、根据，一个「变成想法」和全部材料的链接", () => {
    const html = renderToStaticMarkup(<WeekPickView state={{ kind: "pick", pick }} />);
    expect(html).toContain("这周的一件 · 可以变成想法");
    expect(html).toContain("日本这边还没有它，不是因为没人要。");
    expect(html).toContain("正在用「マネーフォワード ME」的人");
    expect(html).toContain("根据：网上原话 8 句。");
    expect(html).toContain(">变成想法<");
    expect(html).toContain('href="/signals/gaps/deep?side=japan&amp;id=g1"');
  });

  it("这周已经变成想法的，只说变成了哪一条、链过去", () => {
    const html = renderToStaticMarkup(<WeekPickView state={{ kind: "done", idea: { id: "i1", title: "日本版：某某" } }} />);
    expect(html).toContain("这周的一件已经变成想法了");
    expect(html).toContain('href="/ideas/i1"');
    expect(html).not.toContain(">变成想法<");
  });
});
