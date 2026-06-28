export type CustomerPiiKind = "name" | "email" | "phone";

export function redactCustomerPii(input: string): {
  text: string;
  redactions: CustomerPiiKind[];
} {
  const found = new Set<CustomerPiiKind>();
  let text = input;

  text = text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    () => {
      found.add("email");
      return "[已遮蔽邮箱]";
    }
  );

  text = text.replace(
    /(?<!\d)(?:\+?\d{1,3}[-\s]?)?(?:0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{4}|1[3-9]\d{9})(?!\d)/g,
    () => {
      found.add("phone");
      return "[已遮蔽电话]";
    }
  );

  text = text.replace(
    /(^|\n)\s*(?:姓名|名字|name)\s*[:：]\s*[^\n,，。]{1,40}/gi,
    (match, prefix: string) => {
      found.add("name");
      return `${prefix}姓名：[已遮蔽姓名]`;
    }
  );

  return { text, redactions: Array.from(found) };
}
