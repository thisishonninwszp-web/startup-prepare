import Link from "next/link";

/**
 * 横向条形图：一组同一单位的数（只有一组，所以只用一个颜色 —— 主色；不画图例，标题已经说了画的是什么）。
 * 条从同一条基线长出来，数写在条的末端；悬停 / 键盘聚焦时这一行变底色，并带 title 提示。
 * 只数次数：条的长短就是次数，不换算成百分比。
 */
export function BarList({
  title,
  items,
  unit = "",
  empty = "这里空着。",
}: {
  title: string;
  items: { label: string; value: number; href?: string }[];
  unit?: string;
  empty?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <figure className="text-xs">
      <figcaption className="mb-2 text-sm font-medium">{title}</figcaption>
      {items.length === 0 || max === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => {
            const width = i.value > 0 ? Math.max(1, (i.value / max) * 100) : 0;
            const text = `${i.label}：${i.value.toLocaleString("ja-JP")}${unit}`;
            return (
              <li
                key={i.label}
                tabIndex={0}
                title={text}
                aria-label={text}
                className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 rounded-sm px-1 py-0.5 transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="truncate text-muted-foreground">
                  {i.href ? (
                    <Link href={i.href} className="underline-offset-4 hover:text-foreground hover:underline">
                      {i.label}
                    </Link>
                  ) : (
                    i.label
                  )}
                </span>
                <span className="border-l border-border">
                  <span className="block h-3 rounded-r-[4px] bg-primary" style={{ width: `${width}%` }} />
                </span>
                <span className="text-right font-mono text-foreground">
                  {i.value.toLocaleString("ja-JP")}
                  {unit}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
