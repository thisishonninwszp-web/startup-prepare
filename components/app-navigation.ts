export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
};

export type AppNavGroup = {
  label: string;
  items: AppNavItem[];
};

export const NAV_GROUPS: AppNavGroup[] = [
  {
    label: "决策",
    items: [
      { href: "/dashboard", label: "今日行动", shortLabel: "行动" },
      { href: "/capture", label: "捕捉", shortLabel: "捕捉" },
      { href: "/materials", label: "材料箱", shortLabel: "材料" },
      { href: "/ideas", label: "想法库", shortLabel: "想法" },
      { href: "/workbench", label: "工作台", shortLabel: "工作台" },
    ],
  },
  {
    label: "成长",
    items: [
      { href: "/dreams", label: "梦想", shortLabel: "梦想" },
      { href: "/retrospectives", label: "周复盘", shortLabel: "复盘" },
      { href: "/learnings", label: "学到了", shortLabel: "学习" },
    ],
  },
  {
    label: "认识",
    items: [
      { href: "/reality", label: "现状", shortLabel: "现状" },
      { href: "/customer-view", label: "顾客", shortLabel: "顾客" },
    ],
  },
  {
    label: "档案",
    items: [
      { href: "/companies", label: "公司", shortLabel: "公司" },
      { href: "/knowledge", label: "知识库", shortLabel: "知识" },
    ],
  },
];

export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
