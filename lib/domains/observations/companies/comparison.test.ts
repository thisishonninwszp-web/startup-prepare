import { expect, it } from "vitest";
import type { CompanyEntry } from "./domain";
import { compareCompanySnapshots, snapshotDetails } from "./comparison";
const make = (value: string, overrides: Record<string, unknown> = {}) => ({
  id: value, company_id: "company", user_id: "owner", kind: "snapshot", request_id: "request", created_at: "2026-10-26T01:00:00Z", content_hash: "hash",
  payload: { type: "price", stage: "action", title: "定价", occurredOn: null, dateUnknown: true,
    source: { kind: "manual_import", url: "https://example.com/price", rawText: value, quote: value, scope: "公开定价片段" },
    details: { subject: "Basic", valueText: value, region: "JP", unit: "每月", currency: "JPY", status: "success", ...overrides } },
} as CompanyEntry);
it("compares only matching source, product, unit, region and known price currency without inferring price direction", () => {
  const result = compareCompanySnapshots(make("1000円"), make("2000円"));
  expect(result).toMatchObject({ comparable: true, change: "text_changed", leftValue: "1000円", rightValue: "2000円" });
  expect(compareCompanySnapshots(make("1000円"), make("2000円", { unit: "每年" })).comparable).toBe(false);
  expect(compareCompanySnapshots(make("1000円"), make("2000円", { currency: null })).comparable).toBe(false);
});
it("does not read failed captures or missing markers as removed features or price changes", () => {
  expect(compareCompanySnapshots(make("1000円"), make("未找到", { status: "failed" })).comparable).toBe(false);
  expect(() => snapshotDetails({ subject: "Basic", valueText: "无出处", region: "JP", unit: "月", currency: "JPY" }, "1000円")).toThrow();
});
it("rejects different companies and URL or capture scopes", () => {
  const a = make("1000円"), b = make("1000円"); b.company_id = "other";
  expect(compareCompanySnapshots(a,b).comparable).toBe(false);
  b.company_id = a.company_id; (b.payload.source as {url:string}).url = "https://other.example/price";
  expect(compareCompanySnapshots(a,b).comparable).toBe(false);
});
