import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("./company-observation-actions", () => ({ loadCompanyObservations: vi.fn() }));
vi.mock("./company-provider-panel", () => ({ CompanyProviderPanel: () => null }));
vi.mock("./company-snapshots-panel", () => ({ CompanySnapshotsPanel: () => null }));
import { CompanyObservationsPanel, CompanySourceView, CompanyActivityView } from "./company-observations-panel";
import { loadCompanyObservations } from "./company-observation-actions";
it("keeps company research collapsed and does not load until requested", () => {
  const html = renderToStaticMarkup(<CompanyObservationsPanel companyId="company" />);
  expect(html).toContain("企业身份与实际行动");
  expect(html).toContain('aria-expanded="false"');
  expect(loadCompanyObservations).not.toHaveBeenCalled();
});
it("shows exact source quote, raw text and scope without interpreting the stage", () => {
  const html = renderToStaticMarkup(<CompanyActivityView activity={{ type: "procurement", stage: "announcement", title: "采购公告", occurredOn: null, dateUnknown: true, details: { amount: 0, currency: "JPY" }, source: { kind: "manual_import", url: "https://example.com/notice", rawText: "原文：拟采购。", quote: "拟采购", scope: "仅本公告" } }} />);
  expect(html).toContain("宣布"); expect(html).toContain("日期未知"); expect(html).toContain("0 JPY"); expect(html).toContain("拟采购"); expect(html).toContain("仅本公告");
});
it("labels manually imported sources and preserves whitespace", () => {
  const html = renderToStaticMarkup(<CompanySourceView source={{ kind: "manual_import", url: null, rawText: "第一行\n第二行", quote: "第二行", scope: "手动摘录" }} />);
  expect(html).toContain("人工导入"); expect(html).toContain("第一行\n第二行"); expect(html).toContain("whitespace-pre-wrap");
});

it("separates exact jobs from name candidates and requires explicit attribution", async () => {
  const { CompanyJobCandidates } = await import("./company-observations-panel");
  const job = { id: "job", company_id: null, company_name: "同名公司", title: "工程师", body: "负责开发", url: "https://example.com/job", found_on: "2026-10-26", facts: null, previewHash: "preview-hash" };
  const html = renderToStaticMarkup(<CompanyJobCandidates companyId="company" jobs={{ exact: [], candidates: [job], exactNextCursor: null, candidatesNextCursor: "next-page" }} reload={async () => {}} />);
  expect(html).toContain("已明确关联此公司"); expect(html).toContain("仅名称相同的人工候选");
  expect(html).toContain('name="confirmed"'); expect(html).toContain('required=""');
  expect(html).toContain("读取更多仅名称相同的人工候选岗位"); expect(html).toContain("负责开发"); expect(html).toContain("不代表已雇佣或有外包预算");
});
it("requires choosing an owned idea and preserves both review questions", async () => {
  const { CompanyEntryView } = await import("./company-observations-panel");
  const html = renderToStaticMarkup(<CompanyEntryView entry={{ id: "entry", company_id: "company", user_id: "owner", kind: "identity", payload: { action: "clear" }, created_at: "2026-10-26", request_id: "req", content_hash: "hash" }} companyId="company" ideas={[{ id: "owned", title: "本人想法" }]} reload={async () => {}} />);
  expect(html).toContain("请明确选择想法"); expect(html).toContain('value="owned"');
  expect(html).toContain("需要复查哪条假设"); expect(html).toContain("这份材料仍不能回答什么");
  expect(html).toContain("痛点、付费、想法状态和真实接触计时保持原规则");
});
it("renders snapshot scope and verbatim value as text instead of claiming a price fall", () => {
  const html = renderToStaticMarkup(<CompanyActivityView activity={{ type: "price", stage: "action", title: "Basic 定价", occurredOn: null, dateUnknown: true, details: { subject: "Basic", valueText: "1000円 / 月", region: "JP", unit: "每月", currency: "JPY", status: "success" }, source: { kind: "manual_import", url: "https://example.com/price", rawText: "1000円 / 月", quote: "1000円 / 月", scope: "Basic 公共套餐" } }} />);
  expect(html).toContain("对象：Basic"); expect(html).toContain("原文值：1000円 / 月"); expect(html).toContain("单位：每月"); expect(html).toContain("地区：JP");
  expect(html).not.toContain("降价");
});
it("invalidates manual and provider identity previews when the current identity changes", async () => {
  const { CompanyIdentityForms } = await import("./company-observations-panel");
  const before = CompanyIdentityForms({ companyId: "company", identity: { entryId: null, identity: null }, reload: async () => {} });
  const after = CompanyIdentityForms({ companyId: "company", identity: { entryId: "new-binding", identity: null }, reload: async () => {} });
  const keys = (element: typeof before) => element.props.children.map((child: { key: string }) => child.key);
  expect(keys(before)).not.toEqual(keys(after));
  expect(keys(before)).toHaveLength(2);
  expect(keys(after).every((key: string) => key.includes("new-binding"))).toBe(true);
});

it("provides explicit search for earlier owned ideas without loading on render", async () => {
  const { CompanyIdeaSearch } = await import("./company-observations-panel");
  const html = renderToStaticMarkup(<CompanyIdeaSearch companyId="company" onItems={() => {}} />);
  expect(html).toContain("按名称查找本人想法");
  expect(html).toContain("查找本人想法");
  expect(html).toContain("不会自动关联");
});
