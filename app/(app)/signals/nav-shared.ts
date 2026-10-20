/**
 * 外部信号的二级导航（不是新的一级导航）：按「你拿它干什么」分五组，
 * 第一行是组，第二行是当前这组的几页。页面越来越多，只靠今日报告顶上一行小字找不到。
 */
export const SIGNALS_NAV: { label: string; pages: { href: string; label: string }[] }[] = [
  {
    label: "每天读",
    pages: [
      { href: "/signals", label: "今日报告" },
      { href: "/signals/week", label: "周报" },
      { href: "/signals/inbox", label: "全部新闻" },
    ],
  },
  {
    label: "攒机会",
    pages: [
      { href: "/signals/gaps", label: "差距清单" },
      { href: "/signals/atlas", label: "时差图谱" },
      { href: "/signals/precedents", label: "先例" },
      { href: "/signals/kanpo", label: "官报" },
    ],
  },
  {
    label: "练判断",
    pages: [
      { href: "/signals/practice", label: "判断账本" },
      { href: "/signals/drill", label: "历史题" },
      { href: "/signals/questions", label: "在追的问题" },
    ],
  },
  {
    label: "看底数",
    pages: [
      { href: "/signals/slow", label: "慢变量" },
      { href: "/signals/sources", label: "信息源体检" },
      { href: "/signals/lab", label: "挑法盲测" },
    ],
  },
  {
    label: "去行动",
    pages: [
      { href: "/signals/act", label: "本周行动" },
      { href: "/signals/issue", label: "周刊" },
      { href: "/signals/issue/door", label: "周刊付费版" },
    ],
  },
];

/** 当前在哪一页：最长的前缀对得上的那一页；都对不上（一条新闻的详情页）算今日报告。 */
export function activeHref(pathname: string): string {
  const all = SIGNALS_NAV.flatMap((g) => g.pages.map((p) => p.href)).filter((h) => h !== "/signals");
  const hit = all.filter((h) => pathname === h || pathname.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  return hit ?? "/signals";
}
