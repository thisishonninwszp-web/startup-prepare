import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../reconsideration-actions", () => ({ loadReconsiderationAction: vi.fn() }));
import { ReconsiderationPanel, ReconsiderationSourceFields } from "./reconsideration-panel";
import { loadReconsiderationAction } from "../reconsideration-actions";
it("only offers archived conditions for archived ideas and never loads on mount", () => {
  expect(renderToStaticMarkup(<ReconsiderationPanel ideaId="idea" archived={false} />)).toBe("");
  expect(renderToStaticMarkup(<ReconsiderationPanel ideaId="idea" archived />)).toContain("归档条件");
  expect(loadReconsiderationAction).not.toHaveBeenCalled();
});
it("requires actual material, a quote and coverage rather than an AI assertion", () => {
  const html = renderToStaticMarkup(<ReconsiderationSourceFields kind="manual" />);
  expect(html).toContain("逐字引用");
  expect(html).toContain("实际覆盖范围");
  expect(html).toContain("合成 / AI");
  expect(html).toContain('name="rawText"');
});
