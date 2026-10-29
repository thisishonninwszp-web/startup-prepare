/**
 * 外部信号的二级导航（不是新的一级导航）。外部信号重构第三步（2026-10-22）收成五块：
 * 今天（每天打开的那一页）、记忆（以后找得到）、预测（练判断、对账）、机会（攒那边有日本没有的）、行动（这周做什么、周刊）。
 * 第一行是块，第二行是当前这块的几页。
 */
export const SIGNALS_NAV: { label: string; pages: { href: string; label: string }[] }[] = [
  {
    label: "今天",
    pages: [
      { href: "/signals", label: "今天" },
      { href: "/signals/inbox", label: "全部新闻" },
      { href: "/signals/sources", label: "信息源体检" },
      { href: "/signals/lab", label: "挑法盲测" },
    ],
  },
  {
    label: "记忆",
    pages: [
      { href: "/signals/memory", label: "找和回看" },
      { href: "/signals/week", label: "周报" },
      { href: "/signals/month", label: "月报" },
      { href: "/signals/precedents", label: "先例" },
    ],
  },
  {
    label: "预测",
    pages: [
      { href: "/signals/forecast", label: "预测题" },
      { href: "/signals/calibrate", label: "校准练习" },
      { href: "/signals/practice", label: "判断账本" },
      { href: "/signals/drill", label: "历史题" },
      { href: "/signals/questions", label: "在追的问题" },
    ],
  },
  {
    label: "机会",
    pages: [
      { href: "/signals/gaps", label: "差距清单" },
      { href: "/signals/atlas", label: "时差图谱" },
      { href: "/signals/indicators", label: "领先指标" },
      { href: "/signals/policy", label: "政策流水线" },
      { href: "/signals/kanpo", label: "官报" },
      { href: "/signals/slow", label: "慢变量" },
    ],
  },
  {
    label: "行动",
    pages: [
      { href: "/signals/act", label: "本周行动" },
      { href: "/signals/issue", label: "周刊" },
      { href: "/signals/issue/door", label: "周刊付费版" },
    ],
  },
];

/** 当前在哪一页：最长的前缀对得上的那一页；都对不上（一条新闻的详情页）算「今天」。 */
export function activeHref(pathname: string): string {
  if (pathname === "/signals/events" || pathname.startsWith("/signals/events/")) return "/signals/memory";
  const all = SIGNALS_NAV.flatMap((g) => g.pages.map((p) => p.href)).filter((h) => h !== "/signals");
  const hit = all.filter((h) => pathname === h || pathname.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  return hit ?? "/signals";
}
