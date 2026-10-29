import { expect, it } from "vitest";
import { experimentTimelineEvents } from "./experiment-timeline";
it("distinguishes a completed prototype from real contact", () => {
  const events = experimentTimelineEvents([{ id: "run", experiment_id: "experiment", status: "completed", started_at: "2026-10-26T00:00:00Z", finished_at: "2026-10-26T01:00:00Z" }]);
  expect(events).toHaveLength(2);
  expect(events.every(e => e.isRealContact === false)).toBe(true);
  expect(events[1].title).toContain("运行完成");
  expect(events[1].detail).toContain("痛点和付费仍未知");
});
