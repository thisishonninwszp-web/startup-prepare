import { readFileSync } from "node:fs";
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
      "/self",
    ])
  );
});

it("keeps the navigation at four groups and thirteen items", () => {
  expect(NAV_GROUPS).toHaveLength(4);
  expect(NAV_GROUPS.flatMap((group) => group.items)).toHaveLength(13);
});

// AppShell 用 ICONS[item.href] 取图标后直接 <Icon />，缺一个键就是整个应用壳白屏。
it("gives every nav item an icon in AppShell", () => {
  const shell = readFileSync("components/app-shell.tsx", "utf8");
  const iconMap = shell.slice(
    shell.indexOf("const ICONS"),
    shell.indexOf("export function AppShell")
  );
  for (const item of NAV_GROUPS.flatMap((group) => group.items)) {
    expect(iconMap, `${item.href} 缺少图标`).toContain(`"${item.href}":`);
  }
});
