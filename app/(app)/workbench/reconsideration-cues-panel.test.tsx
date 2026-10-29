import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../ideas/reconsideration-actions", () => ({ loadReconsiderationCuesAction: vi.fn() }));
import { ReconsiderationCuesPanel } from "./reconsideration-cues-panel";
import { loadReconsiderationCuesAction } from "../ideas/reconsideration-actions";
it("uses the bounded server snapshot without fetching on mount", () => {
  const html = renderToStaticMarkup(<ReconsiderationCuesPanel initialData={{ status: "ready", items: [], nextCursor: null }} />);
  expect(html).toContain("每版提示一次");
  expect(html).toContain("不改变想法状态");
  expect(loadReconsiderationCuesAction).not.toHaveBeenCalled();
});
