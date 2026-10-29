import { describe, expect, it } from "vitest";
import { proposeSourceLinks } from "./source-links";
describe("本地来源关系候选", () => {
  it("只把明确转载声明及已保存链接提出候选，不自动确认", () => {
    const sources = [{ id: "release", source_url: "https://example.com/release", captured_text: "原始公告" }, { id: "copy", source_url: "https://example.com/copy", captured_text: "本文转载自原公告 https://example.com/release ，不代表独立采访。" }];
    expect(proposeSourceLinks(sources)).toEqual([expect.objectContaining({ fromSnapshotId: "copy", toSnapshotId: "release", relation: "reprints", refs: [{ snapshotId: "copy", quote: sources[1].captured_text }] })]);
  });
  it("相似文字、未知链接、无引用线索都不冒充同源关系", () => {
    expect(proposeSourceLinks([{ id: "a", source_url: "https://example.com/a", captured_text: "订单下降。" }, { id: "b", source_url: "https://example.com/b", captured_text: "订单下降。官方网站 https://example.com/a" }])).toEqual([]);
  });
});
