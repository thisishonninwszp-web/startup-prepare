import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("./attention-actions", () => ({ attentionStateAction: vi.fn(), saveAttentionAction: vi.fn() }));
vi.mock("./source-picker", () => ({ ReasoningSourcePicker: () => null }));
import { AttentionPanel, AttentionBlindMaterial } from "./attention-panel";
it("keeps full material access explicit and loads only by choice", () => {
  const html = renderToStaticMarkup(<AttentionPanel eventId="event" />);
  expect(html).toContain("全部材料始终可看"); expect(html).toContain("主动读取");
});
it("renders only frozen body before reveal even if a runtime object contains a title", () => {
  const material = { body: "冻结原文", sourceUrl: "https://example.com", title: "不应出现在先判画面" };
  const html = renderToStaticMarkup(<AttentionBlindMaterial material={material} />);
  expect(html).toContain("冻结原文"); expect(html).not.toContain("不应出现在先判画面");
});
