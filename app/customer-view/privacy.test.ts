import { describe, expect, it } from "vitest";
import { redactCustomerPii } from "./privacy";

describe("redactCustomerPii", () => {
  it("redacts email, phone, and explicit name fields", () => {
    const input =
      "姓名：张三\n邮箱 zhangsan@example.com，电话 13812345678，日本号码 090-1234-5678。";
    const output = redactCustomerPii(input);

    expect(output.text).not.toContain("张三");
    expect(output.text).not.toContain("zhangsan@example.com");
    expect(output.text).not.toContain("13812345678");
    expect(output.text).not.toContain("090-1234-5678");
    expect(output.redactions).toEqual(
      expect.arrayContaining(["name", "email", "phone"])
    );
  });

  it("leaves ordinary customer language unchanged", () => {
    const input = "我每天都要手动复制数据，月底尤其痛苦。";
    expect(redactCustomerPii(input)).toEqual({
      text: input,
      redactions: [],
    });
  });
});
