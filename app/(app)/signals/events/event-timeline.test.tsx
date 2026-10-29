import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("./event-picker", () => ({ EventPicker: () => null }));
vi.mock("./member-controls", () => ({ ExcludeMemberButton: () => null }));
vi.mock("../story-preference-buttons", () => ({ StoryPreferenceButtons: () => null }));
import { EventTimeline } from "./[eventId]/event-timeline";
import type { TimelineEntry } from "@/lib/domains/signals/events/domain";
const entry: TimelineEntry = {
  signalId: "news", snapshotId: "snapshot", title: "一条旧报道", sourceName: "发布方", sourceUrl: "https://example.com/news",
  publishedAt: null, capturedAt: "2026-10-25T01:00:00Z", sourceFetchedAt: "2026-10-20T01:00:00Z",
  capturedText: "公告说政策将在十月生效。", captureScope: "excerpt", occurred: null, firstRecordedOpenAt: "2026-10-24T01:00:00Z", note: "", revision: 1,
};
describe("事件时间线的来源和时间边界", () => {
  it("未有发布日期或发生日期时明确留空，后补快照不冒充当时记录", () => {
    const html = renderToStaticMarkup(createElement(EventTimeline, { eventId: "event", entries: [entry], mode: "published" }));
    expect(html).toContain("发布时间不详"); expect(html).toContain("发生时间未记录");
    expect(html).toContain("后补快照"); expect(html).toContain("系统记录首次打开");
    expect(html).toContain("https://example.com/news"); expect(html).toContain("公告说政策将在十月生效。");
  });
  it("保留月级发生时间，不伪造到某一天", () => {
    const html = renderToStaticMarkup(createElement(EventTimeline, { eventId: "event", entries: [{ ...entry, occurred: { from: "2026-10", to: null, precision: "month", quote: "政策将在十月生效" } }], mode: "occurred" }));
    expect(html).toContain("2026-10（月）"); expect(html).not.toContain("2026-10-01");
  });
  it("静音只收起，保留来源；非法来源协议不生成链接", () => {
    const preferences = { status: "ready" as const, preferences: [{ signal_id: "news", event_key: "signal:news", event_label: null, preference: "mute" as const, title: "一条旧报道", created_at: "2026-10-25", updated_at: "2026-10-25" }] };
    const html = renderToStaticMarkup(createElement(EventTimeline, { eventId: "event", entries: [{ ...entry, sourceUrl: "javascript:alert(1)" }], mode: "published", preferences }));
    expect(html).toContain("已静音的报道"); expect(html).toContain("一条旧报道"); expect(html).not.toContain("javascript:");
  });
});
