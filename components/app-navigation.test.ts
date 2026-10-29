import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, isActiveRoute, navigationGroups } from "./app-navigation";

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
      "/jobs",
    ])
  );
});

it("keeps the navigation at four groups and fifteen items", () => {
  expect(NAV_GROUPS).toHaveLength(4);
  expect(NAV_GROUPS.flatMap((group) => group.items)).toHaveLength(15);
});

it("shows business learning only when enabled and keeps the default navigation intact", () => {
  const enabled = navigationGroups({ businessTeardownsEnabled: true });
  expect(enabled.find(group => group.label === "成长")?.items).toContainEqual({ href: "/business-lab", label: "生意拆解", shortLabel: "生意" });
  expect(navigationGroups().flatMap(group => group.items).some(item => item.href === "/business-lab")).toBe(false);
  expect(NAV_GROUPS.flatMap(group => group.items)).toHaveLength(15);
  expect(enabled.flatMap(group => group.items)).toHaveLength(16);
  expect(isActiveRoute("/business-lab/some-case", "/business-lab")).toBe(true);
});

// AppShell 用 ICONS[item.href] 取图标后直接 <Icon />，缺一个键就是整个应用壳白屏。
it("gives every nav item an icon in AppShell", () => {
  const shell = readFileSync("components/app-shell.tsx", "utf8");
  const iconMap = shell.slice(
    shell.indexOf("const ICONS"),
    shell.indexOf("export function AppShell")
  );
  for (const item of navigationGroups({businessTeardownsEnabled:true}).flatMap((group) => group.items)) {
    expect(iconMap, `${item.href} 缺少图标`).toContain(`"${item.href}":`);
  }
});
