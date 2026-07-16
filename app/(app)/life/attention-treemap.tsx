import type { AttentionCategoryMinutes, DomainCard } from "./queries";

const COLOR_CLASS: Record<string, string> = {
  zinc: "bg-foreground/90",
  stone: "bg-chart-3",
  amber: "bg-status-validating",
  blue: "bg-status-hypothesis",
  emerald: "bg-status-mvp",
  orange: "bg-status-validating",
  slate: "bg-chart-4",
};

const DOMAIN_PALETTE = [
  "bg-status-hypothesis",
  "bg-destructive",
  "bg-status-hypothesis",
  "bg-verdict-learned",
  "bg-status-mvp",
  "bg-status-hypothesis",
  "bg-verdict-learned",
  "bg-status-validating",
];

function Bar({
  items,
}: {
  items: { key: string; label: string; value: number; colorClass: string }[];
}) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-8 items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">
        暂无数据
      </div>
    );
  }
  return (
    <div className="flex h-8 overflow-hidden rounded-md">
      {items.map((item) => (
        <div
          key={item.key}
          title={`${item.label} · ${item.value}`}
          className={`${item.colorClass} flex items-center justify-center overflow-hidden text-[10px] text-primary-foreground/90`}
          style={{ width: `${(item.value / total) * 100}%` }}
        >
          {item.value / total > 0.08 && (
            <span className="truncate px-1">{item.label}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function AttentionTreemap({
  timeByCategory,
  domains,
}: {
  timeByCategory: AttentionCategoryMinutes[];
  domains: DomainCard[];
}) {
  const timeItems = timeByCategory.map((c) => ({
    key: c.key,
    label: c.label,
    value: c.minutes,
    colorClass: COLOR_CLASS[c.color] ?? "bg-muted-foreground",
  }));
  const domainItems = domains.map((d, i) => ({
    key: d.tag,
    label: d.tag,
    value: d.idea_count,
    colorClass: DOMAIN_PALETTE[i % DOMAIN_PALETTE.length],
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          过去30天时间花在哪（复盘已确认的时间块）
        </p>
        <Bar items={timeItems} />
      </div>
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          想法活跃在哪个领域（全部想法按标签计数）
        </p>
        <Bar items={domainItems} />
      </div>
      <p className="text-xs text-muted-foreground">
        两条对照：如果时间上没出现的领域，想法却很多，说明只在想不在做。
      </p>
    </div>
  );
}
