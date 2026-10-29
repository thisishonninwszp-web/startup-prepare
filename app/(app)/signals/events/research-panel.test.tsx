import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResearchEntry } from "@/lib/domains/signals/events/research-shared";
vi.mock("./research-form", () => ({ ResearchForm: () => null }));
vi.mock("./windows-panel", () => ({ WindowsPanel: () => null }));
vi.mock("./research-quick-action", () => ({ ResearchQuickAction: () => null }));
import { ResearchPanel } from "./research-panel";

const sourceId = "00000000-0000-4000-8000-000000000001";
const row = (id: string, kind: ResearchEntry["kind"], subject_id: string | null, payload: Record<string, unknown>): ResearchEntry => ({ id, kind, subject_id, payload, event_id: "event", created_at: "2026-10-25T00:00:00Z" });
describe("explanation evidence history", () => {
  it("keeps evidence and its direction with the original version after a revision", () => {
    const html = renderToStaticMarkup(<ResearchPanel eventId="event" available otherEvents={[]} sources={[{ id: sourceId, signal_id: "signal", title: "原始出处", source_url: "https://example.com", captured_text: "原先支持的逐字依据", published_at: null, captured_at: "2026-10-25T00:00:00Z" }]} entries={[
      row("v1", "explanation", null, { text: "原解释", assumptions: "原前提", distinguish: "原观察" }),
      row("e1", "explanation_evidence", "v1", { text: "只支持旧版解释的材料", direction: "supports", refs: [{ snapshotId: sourceId, quote: "原先支持的逐字依据" }] }),
      row("v2", "explanation", "v1", { text: "修正后的解释", assumptions: "新前提", distinguish: "新观察" }),
      row("e2", "explanation_evidence", "v2", { text: "只挑战新版解释的材料", direction: "contradicts" }),
    ]} />);
    expect(html).toContain("只支持旧版解释的材料");
    expect(html).toContain("支持这个解释");
    const historyStart = html.indexOf("查看原解释与修正历史");
    expect(html.indexOf("只支持旧版解释的材料")).toBeGreaterThan(historyStart);
    expect(html).toContain("只挑战新版解释的材料");
    expect(html).toContain("挑战这个解释");
    expect(html).toContain("原先支持的逐字依据");
    expect(html).toContain('<details class="mt-2 text-xs"><summary class="cursor-pointer">查看原解释与修正历史');
  });
});

it("shows frozen note quotations on adopted unknown and explanation records", () => {
  const html = renderToStaticMarkup(<ResearchPanel eventId="event" available otherEvents={[]} sources={[]} entries={[
    row("u", "unknown", null, { question: "关键问题", criterion: "回答口径", noteRefs: [{ recordId: sourceId, quote: "当时未知的规模" }] }),
    row("e", "explanation", null, { text: "竞争解释", assumptions: "前提", distinguish: "区分观察", noteRefs: [{ recordId: sourceId, quote: "先前以为需求下降" }] }),
  ]} />);
  expect(html).toContain("当时未知的规模"); expect(html).toContain("先前以为需求下降"); expect(html).toContain("笔记原话");
});
