import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("./observation-actions", () => ({ loadObservationTasks: vi.fn(), loadObservationTask: vi.fn() }));
import { ObservationTaskPanel, ObservationRunView } from "./observation-task-panel";
import { loadObservationTasks } from "./observation-actions";

it("does not collect or load records until the panel is opened", () => {
  const html = renderToStaticMarkup(<ObservationTaskPanel ideaId="idea" />);
  expect(html).toContain("观察任务");
  expect(loadObservationTasks).not.toHaveBeenCalled();
});

it("keeps zero, missing values and source text distinct in frozen run history", () => {
  const html = renderToStaticMarkup(<ObservationRunView run={{ id: "run", task_id: "task", task_version_id: "v1", created_at: "2026-10-26", payload: { status: "partial", resultState: "observed", records: [{ title: "原始出处", text: "逐字原文", origin: "public", sourceUrl: "https://example.com", value: 0, metric: "count", unit: "件", time: null, region: null, publishedAt: null, providerMetadata: {}, data: {} }], dataPeriod: null, requestConditions: {}, rawSnapshot: null, parserVersion: "manual-v1", returnedScope: "只摘录一页", truncated: true, pagination: null, providerMetadata: {}, providerUsage: null, costMinor: null, currency: null, error: null, retryOf: null } }} />);
  expect(html).toContain("逐字原文");
  expect(html).toContain("只摘录一页");
  expect(html).toContain("截断");
  expect(html).toContain("0 件");
  expect(html).toContain("https://example.com");
});
