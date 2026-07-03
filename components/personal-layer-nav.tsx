import Link from "next/link";

const PERSONAL_LAYER_PAGES = [
  { href: "/life", label: "生活罗盘" },
  { href: "/profile", label: "创业者档案" },
  { href: "/patterns", label: "认知镜" },
] as const;

/**
 * 三个个人层反思页面互相导航——它们服务不同的反思目的（时间对齐/人格推断/决策偏误），
 * 刻意不合并成一个页面，只做轻量互链。
 */
export function PersonalLayerNav({ current }: { current: (typeof PERSONAL_LAYER_PAGES)[number]["href"] }) {
  const others = PERSONAL_LAYER_PAGES.filter((p) => p.href !== current);
  return (
    <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {others.map((p) => (
        <Link key={p.href} href={p.href} className="underline-offset-4 hover:underline">
          查看{p.label} →
        </Link>
      ))}
    </div>
  );
}
