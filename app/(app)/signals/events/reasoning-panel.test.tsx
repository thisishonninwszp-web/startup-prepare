import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("./reasoning-actions", () => ({ loadReasoningAction: vi.fn(), saveReasoningAction: vi.fn() }));
vi.mock("./source-picker", () => ({ ReasoningSourcePicker: () => null }));
import { ReasoningPanel, ReasoningRecord } from "./reasoning-panel";
it("opens lazily and explains unchanged old conclusions", () => {
  const html = renderToStaticMarkup(<ReasoningPanel eventId="event" />);
  expect(html).toContain("推理与来源更正");
  expect(html).toContain("主动读取");
});
it("renders both original quotation and unknown comparison dimensions", () => {
  const html = renderToStaticMarkup(<ReasoningRecord row={{ id: "r", revision: 2, kind: "comparability", payload: { text: "暂不可比", refs: [{ snapshotId: "s", quote: "原文一百家" }], dimensions: { definition: { left: "未知", right: "门店" } }, verdict: "not_comparable", reason: "定义缺失" } }} />);
  expect(html).toContain("原文一百家"); expect(html).toContain("未知"); expect(html).toContain("门店"); expect(html).toContain("定义缺失");
});
it("preserves verbatim quotations and free text that happen to equal enum words", () => {
  const html = renderToStaticMarkup(<ReasoningRecord row={{ id: "r", revision: 1, kind: "increment", payload: { text: "claim", refs: [{ snapshotId: "s", quote: "independent" }, { snapshotId: "t", quote: "value" }], increment: "shared", independence: "independent", independenceBasis: "unknown" } }} />);
  expect(html).toContain('>claim</span>');
  expect(html).toContain('>independent</span>');
  expect(html).toContain('>value</span>');
  expect(html).toContain('>shared</span>');
  expect(html).toContain('>unknown</span>');
  expect(html).toContain('>独立</span>');
});
