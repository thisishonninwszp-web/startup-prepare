import type { SurvivalCalendar } from "./queries";

function cellClass(day: { realContactCount: number; armchairCount: number } | undefined): string {
  if (!day) return "bg-muted/30";
  if (day.realContactCount > 0) {
    return day.realContactCount >= 3
      ? "bg-emerald-600"
      : day.realContactCount === 2
        ? "bg-emerald-400"
        : "bg-emerald-300";
  }
  if (day.armchairCount > 0) return "bg-slate-300 dark:bg-slate-600";
  return "bg-muted/30";
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function SurvivalCalendar({ calendar }: { calendar: SurvivalCalendar }) {
  const byDate = new Map(calendar.days.map((d) => [d.date, d]));

  const today = new Date();
  const weeks: Date[][] = [];
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  // 对齐到周日开始
  start.setDate(start.getDate() - start.getDay());

  const cursor = new Date(start);
  while (cursor <= today) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          存活日历 · 真实接触 vs 空想
        </p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-emerald-500" />
            真实接触
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />
            空想
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-muted/30" />
            无活动
          </span>
        </div>
      </div>

      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((date) => {
              const key = dateKey(date);
              const day = byDate.get(key);
              const isFuture = date > today;
              return (
                <div
                  key={key}
                  title={
                    isFuture
                      ? undefined
                      : `${key} · 真实接触 ${day?.realContactCount ?? 0} · 空想 ${day?.armchairCount ?? 0}`
                  }
                  className={
                    "size-[11px] rounded-sm " +
                    (isFuture ? "bg-transparent" : cellClass(day))
                  }
                />
              );
            })}
          </div>
        ))}
      </div>

      {calendar.lateNightDayCount > 0 && (
        <p className="text-xs text-muted-foreground">
          过去30天有 {calendar.lateNightDayCount} 天，你的记录发生在凌晨——这个产品注意到了。
        </p>
      )}
    </div>
  );
}
