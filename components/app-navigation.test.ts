import { describe, expect, it } from "vitest";
import { NAV_GROUPS, isActiveRoute } from "./app-navigation";

describe("isActiveRoute", () => {
  it("matches both an exact route and its child pages", () => {
    expect(isActiveRoute("/reality", "/reality")).toBe(true);
    expect(isActiveRoute("/reality/abc", "/reality")).toBe(true);
    expect(isActiveRoute("/customer-view", "/reality")).toBe(false);
  });
});

it("exposes all four independent system entries", () => {
  const hrefs = NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => item.href)
  );
  expect(hrefs).toEqual(
    expect.arrayContaining([
      "/reality",
      "/customer-view",
      "/retrospectives",
      "/dreams",
    ])
  );
});
