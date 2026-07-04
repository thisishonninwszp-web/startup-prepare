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
    label: "决策系统",
    items: [
      { href: "/dashboard", label: "今日行动", shortLabel: "行动" },
      { href: "/capture", label: "捕捉", shortLabel: "捕捉" },
      { href: "/review", label: "发现", shortLabel: "发现" },
      { href: "/ideas", label: "想法库", shortLabel: "想法" },
      { href: "/learnings", label: "判断复盘", shortLabel: "学习" },
    ],
  },
  {
    label: "思考系统",
    items: [
      { href: "/reality", label: "现状认识", shortLabel: "现状" },
      { href: "/customer-view", label: "顾客视点", shortLabel: "顾客" },
      { href: "/retrospectives", label: "复盘系统", shortLabel: "复盘" },
      { href: "/dreams", label: "梦想系统", shortLabel: "梦想" },
      { href: "/reasoning", label: "推理工具", shortLabel: "推理" },
      { href: "/council", label: "顾问团", shortLabel: "顾问" },
      { href: "/patterns", label: "认知镜", shortLabel: "认知" },
      { href: "/life", label: "生活罗盘", shortLabel: "生活" },
      { href: "/profile", label: "创业者档案", shortLabel: "档案" },
    ],
  },
  {
    label: "知识积累",
    items: [
      { href: "/knowledge", label: "知识库", shortLabel: "知识" },
      { href: "/companies", label: "公司档案", shortLabel: "公司" },
      { href: "/company-kb", label: "公司知识库", shortLabel: "公司库" },
      { href: "/outreach", label: "触达规划", shortLabel: "触达" },
    ],
  },
];

export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
