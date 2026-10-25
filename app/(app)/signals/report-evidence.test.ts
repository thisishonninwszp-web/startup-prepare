import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EarlierComparison, ReportEvidence } from "./report-evidence";
import type { EarlierMention } from "@/lib/domains/signals/followups";

const item = { background: "本次隐藏的 AI 背景", grounded: true, basis: ["原文摘录"], url: "https://example.com/new" };
const earlier: EarlierMention = {
  signal_id: "old", headline: "上次标题", brief_date: "2026-10-24", times: 1,
  previous: { background: "上次隐藏的 AI 背景", grounded: true, basis: ["原文摘录"], url: null },
};

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as ReactNode)];
}

describe("来源对照不绕过 AI 折叠", () => {
  it("前后 AI 背景只放在默认关闭的展开区", () => {
    const result = EarlierComparison({ item, earlier });
    const details = elements(result).filter((element) => element.type === "details");
    const aiComparison = details.find((element) => JSON.stringify(element.props.children).includes("本次隐藏的 AI 背景"));
    expect(aiComparison).toBeDefined();
    expect(aiComparison?.props.open).not.toBe(true);
  });

  it("来源模式不把隐藏练习的背景通过对照重新输出", () => {
    const html = renderToStaticMarkup(createElement(ReportEvidence, { item, earlier, showBackground: false }));
    expect(html).toContain("原文摘录");
    expect(html).not.toContain("本次隐藏的 AI 背景");
    expect(html).not.toContain("上次隐藏的 AI 背景");
  });
});
