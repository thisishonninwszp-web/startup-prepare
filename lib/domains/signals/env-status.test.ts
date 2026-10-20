import { describe, expect, it } from "vitest";
import { envStatus } from "./env-status";

describe("envStatus", () => {
  it("accepts the older Rakuten name and reports which one is used", () => {
    const rakuten = envStatus({ RAKUTEN_APP_ID: "x", RAKUTEN_ACCESS_KEY: "y" }).find((s) => s.label === "楽天市场")!;
    expect(rakuten.ok).toBe(true);
    expect(rakuten.slots[0].using).toBe("RAKUTEN_APP_ID");
  });

  it("is not ok when one slot is empty or blank", () => {
    const rakuten = envStatus({ RAKUTEN_APPLICATION_ID: "x", RAKUTEN_ACCESS_KEY: "  " }).find((s) => s.label === "楽天市场")!;
    expect(rakuten.ok).toBe(false);
    expect(rakuten.slots[1].using).toBeNull();
  });

  it("never returns values", () => {
    const json = JSON.stringify(envStatus({ ESTAT_APP_ID: "secret-value-123" }));
    expect(json).not.toContain("secret-value-123");
  });
});
