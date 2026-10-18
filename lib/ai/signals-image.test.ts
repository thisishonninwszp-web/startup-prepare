import { describe, expect, it } from "vitest";
import { IMAGE_RULES, illustrationPrompt } from "./signals-image";

describe("出图提示词", () => {
  it("那边的东西 + 这一类 + 固定规矩；数字一律拿掉", () => {
    const p = illustrationPrompt({ there: "中国", headline: "淘宝直播 GMV 超过 4000 亿元，点淘冲上免费榜第 3", category: "短剧直播购物 App" });
    expect(p).toContain("中国");
    expect(p).toContain("短剧直播购物 App");
    expect(p).toContain(IMAGE_RULES);
    expect(p).not.toMatch(/[0-9]/);
  });

  it("没有这一类的叫法也能拼", () => {
    expect(illustrationPrompt({ there: "日本", headline: "豆芽生产商越来越少" })).not.toContain("这一类东西");
  });
});
