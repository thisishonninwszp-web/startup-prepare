import { describe, expect, it } from "vitest";
import { parseChart } from "./app-chart";

describe("中国 App 榜单", () => {
  it("取名字、分类、简介、链接和名次；没有 id 的丢掉", () => {
    const json = { feed: { entry: [
      { "im:name": { label: "豆包" }, summary: { label: "豆包是\n AI 助手" }, category: { attributes: { label: "效率" } }, id: { attributes: { "im:id": "1" } }, link: [{ attributes: { rel: "alternate", href: "https://apps.apple.com/cn/app/1" } }] },
      { "im:name": { label: "没有 id" } },
    ] } };
    expect(parseChart(json)).toEqual([{ id: "1", name: "豆包", category: "效率", summary: "豆包是 AI 助手", url: "https://apps.apple.com/cn/app/1", rank: 1 }]);
  });
});
