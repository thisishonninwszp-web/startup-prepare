import { expect, it } from "vitest";
import { buildSearchRun } from "./run";
import { normalizeRun } from "../domain";
const context = { region: "JP", language: "ja", timeframe: "2026-01" };
it("keeps raw imported source, missing/suppressed semantics and provider caveats through run normalization", () => {
  const raw = "Week,a,b\n2026-01-04,0,<1\n2026-01-11,12,";
  const run = normalizeRun(buildSearchRun("trends_web", raw, context));
  expect(run.rawSnapshot).toBe(raw); expect(run.records[0].value).toBe(0);
  expect(run.records[1].value).toBeNull(); expect(run.records[1].data.state).toBe("below_threshold");
  expect(run.records[3].data.state).toBe("missing");
  expect(run.providerMetadata.authenticity).toBe("user_imported");
});
it("refuses to confirm partial malformed source or an undeclared collection context", () => {
  expect(() => buildSearchRun("trends_web", "Week,a\n2026-01-04,1\ninvalid,2", context)).toThrow();
  expect(() => buildSearchRun("ads_planner", "Keyword,Avg. monthly searches\na,2", { ...context, language: "" })).toThrow();
});
it("keeps configured fixed/exploratory sets and seed origin separate from imported keywords", () => {
  const run = normalizeRun(buildSearchRun("ads_planner", "Keyword,Avg. monthly searches\na,20\nb,4\nc,0", context, {
    purpose: "alternative", fixedPhrases: ["a"], exploratoryPhrases: ["b"], seeds: [{ text: "a", origin: "ai" }],
  }));
  expect(run.records.map(r => r.data.collectionSet)).toEqual(["fixed", "exploratory", "unassigned"]);
  expect(run.records[0].data.seedOrigins).toEqual(["ai"]);
  expect(run.records[0].data.observedOrigin).toBe("provider_export");
  expect(run.providerMetadata.purpose).toBe("alternative");
});
it("maps provider labels only after explicit user selection and validates against task phrases", () => {
  const raw = "Week,旅館: (Japan)\n2026-01-04,12";
  const run = normalizeRun(buildSearchRun("trends_web", raw, context, { fixedPhrases: ["旅館"], purpose: "problem", termMappings: { "旅館: (Japan)": "旅館" } }));
  expect(run.records[0].data).toMatchObject({ term: "旅館", providerLabel: "旅館: (Japan)", collectionSet: "fixed", termMapping: "user_confirmed" });
  expect(() => buildSearchRun("trends_web", raw, context, { fixedPhrases: ["旅館"], termMappings: { "旅館: (Japan)": "hotel" } })).toThrow();
});
