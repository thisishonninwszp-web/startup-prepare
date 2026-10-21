import { describe, expect, it } from "vitest";
import { rakutenReferer } from "./rakuten";

describe("rakutenReferer", () => {
  it("turns a bare domain into a full address", () => {
    expect(rakutenReferer("startup-prepare.vercel.app")).toBe("https://startup-prepare.vercel.app/");
  });
  it("keeps full addresses and adds the trailing slash to a bare origin", () => {
    expect(rakutenReferer("https://startup-prepare.vercel.app")).toBe("https://startup-prepare.vercel.app/");
    expect(rakutenReferer("https://x.example/path")).toBe("https://x.example/path");
  });
  it("falls back to the live site", () => {
    expect(rakutenReferer("  ")).toBe("https://startup-prepare.vercel.app/");
  });
});
