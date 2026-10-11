const TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** 新闻时间一律按日本时间显示；没有时间显示 "--"。 */
export function formatTokyoTime(iso: string | null): string {
  return iso ? TIME.format(new Date(iso)) : "--";
}

/** 2026-10-11 → 10月11日（日） */
export function formatReportDate(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export function isReportDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
