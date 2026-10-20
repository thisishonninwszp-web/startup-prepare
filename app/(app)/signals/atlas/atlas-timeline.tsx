import type { Timeline } from "@/lib/domains/signals/atlas-shared";

/**
 * 时间轴：每件一行，空心点是那边有了，实心点是日本有了，中间连一条线；至今没到的用虚线画到今天。
 * 只有一组东西，所以只用主色；结果写成字（不用颜色分档），没过裁判的整行画淡。
 * 悬停 / 键盘聚焦这一行变底色，带一整句提示；每件的日子和原文都在下面的清单里（那就是表）。
 */
export function AtlasTimeline({ timeline }: { timeline: Timeline }) {
  const { rows, ticks, today } = timeline;
  const grid = (
    <>
      {ticks.map((t) => (
        <span key={t.year} aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: `${t.at}%` }} />
      ))}
      <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-muted-foreground/50" style={{ left: `${today}%` }} />
    </>
  );
  return (
    <figure className="text-xs">
      <figcaption className="mb-2 text-sm font-medium">每一件：那边哪年有了，日本哪年有了</figcaption>
      <p className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full border-2 border-primary bg-background" />
          那边有了
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-primary" />
          日本有了
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block w-5 border-t-2 border-dashed border-primary/60" />
          至今没到（画到今天）
        </span>
      </p>
      <div className="relative mb-1 h-4 text-muted-foreground" aria-hidden>
        {/* 离「今天」太近的年份不写字（竖线照画），免得叠在一起 */}
        {ticks
          .filter((t) => t.at < today - 12 || t.at > today + 4)
          .map((t) => (
            <span key={t.year} className="absolute -translate-x-1/2 whitespace-nowrap font-mono" style={{ left: `${t.at}%` }}>
              {t.year}
            </span>
          ))}
        <span
          className="absolute whitespace-nowrap text-foreground"
          style={{ left: `${today}%`, transform: today > 90 ? "translateX(-100%)" : "translateX(-50%)" }}
        >
          今天
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.id}
            tabIndex={0}
            title={r.text}
            aria-label={r.text}
            className={`rounded-sm px-1 py-1 transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${r.counted ? "" : "opacity-40"}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-foreground">{r.thing}</span>
              <span className="shrink-0 font-mono text-muted-foreground">{r.label}</span>
            </div>
            <div className="relative mt-1 h-3">
              {grid}
              {r.arrived ? (
                <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-primary" style={{ left: `${r.from}%`, width: `${Math.max(0, r.to - r.from)}%` }} />
              ) : (
                <span className="absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed border-primary/60" style={{ left: `${r.from}%`, width: `${Math.max(0, r.to - r.from)}%` }} />
              )}
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
                style={{ left: `${r.from}%` }}
              />
              {r.arrived && (
                <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background" style={{ left: `${r.to}%` }} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
