import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("./search-observation-actions", () => ({ saveSearchObservationRun: vi.fn() }));
import { SearchImportPanel } from "./search-import-panel";
it("blocks import before task geography, language and period are recorded", () => {
  const html = renderToStaticMarkup(<SearchImportPanel taskId="task" versionId="version" context={{ region: "", language: "ja", timeframe: "2026" }} onSaved={async () => {}} />);
  expect(html).toContain("先修改任务配置");
  expect(html).not.toContain("确认保存导入");
});
