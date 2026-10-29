import { expect, it } from "vitest";
import { previewSearchRun } from "./search-comparison-panel";
import { buildSearchRun } from "@/lib/domains/observations/search/run";
import { normalizeRun } from "@/lib/domains/observations/domain";

it("reconstructs comparison only from frozen raw text and persisted context", () => {
  const run = { id: "run", task_id: "task", task_version_id: "v", created_at: "2026-10-26", payload: normalizeRun(buildSearchRun("trends_web", "Week,旅館\n2026-01-04,0", { region: "JP", language: "ja", timeframe: "2026" })) };
  expect(previewSearchRun(run)?.points[0].value).toBe(0);
  expect(previewSearchRun({ ...run, payload: { ...run.payload, rawSnapshot: null } })).toBeNull();
  expect(previewSearchRun({ ...run, payload: { ...run.payload, requestConditions: {} } })).toBeNull();
});
