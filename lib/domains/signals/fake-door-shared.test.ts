import { describe, expect, it } from "vitest";
import { doorLang, maskEmail, validDoorContent, validEmail } from "./fake-door-shared";

describe("假门测试：格式检查", () => {
  const base = { title: "近所の家事代行", lead: "忙しい人のための家事代行。", points: ["日時を選ぶ", "", "  来てくれる "], audience: "共働き家庭", price: "月額 980円", operator: "" };

  it("validDoorContent：空行去掉、前后空白去掉；价格必填且要有数字", () => {
    const ok = validDoorContent(base);
    expect(typeof ok !== "string" && ok.points).toEqual(["日時を選ぶ", "来てくれる"]);
    expect(validDoorContent({ ...base, price: "" })).toMatch(/价格要写/);
    expect(validDoorContent({ ...base, price: "お手頃価格" })).toMatch(/数字/);
    expect(validDoorContent({ ...base, points: ["", " "] })).toMatch(/至少写一条/);
    expect(validDoorContent({ ...base, points: ["1", "2", "3", "4", "5", "6"] })).toMatch(/最多/);
    expect(validDoorContent(null)).toBe("标题没写");
  });

  it("validEmail：只挡明显不对的", () => {
    expect(validEmail(" a.b+c@example.co.jp ")).toBe("a.b+c@example.co.jp");
    expect(validEmail("not-an-email")).toBeNull();
    expect(validEmail("a@b")).toBeNull();
    expect(validEmail("a b@example.com")).toBeNull();
  });

  it("maskEmail：观察里只留第一个字和域名", () => {
    expect(maskEmail("tanaka@example.jp")).toBe("t***@example.jp");
    expect(maskEmail("broken")).toBe("***");
  });

  it("doorLang：日本这边用日文页，中国这边用中文页", () => {
    expect([doorLang("japan"), doorLang("us"), doorLang("china")]).toEqual(["ja", "ja", "zh"]);
  });
});
