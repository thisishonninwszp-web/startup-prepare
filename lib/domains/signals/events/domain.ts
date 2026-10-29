export type TimelineMode = "published" | "occurred" | "captured";
export type CaptureScope = "summary" | "excerpt" | "body";
export type Occurrence = { from: string; to: string | null; precision: "day" | "month" | "year"; quote: string };
export type EventRecord = { id: string; title: string; scope_note: string | null; revision: number; created_at: string; archived_at: string | null };
export type TimelineEntry = {
  signalId: string; snapshotId: string; title: string; sourceName: string; sourceUrl: string | null;
  publishedAt: string | null; capturedAt: string; sourceFetchedAt: string | null; capturedText: string;
  captureScope: CaptureScope; occurred: Occurrence | null; firstRecordedOpenAt: string | null;
  note: string | null; revision: number;
};

export function validateUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("无效的标识符");
  return value;
}
export function validateText(value: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("文字为空或过长");
  return value.trim();
}
export function validateSourceUrl(value: string | null): string | null {
  if (value === null) return null;
  if (value.length > 4096) throw new Error("原文地址过长");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("原文地址必须为 HTTP(S)");
  return value;
}
function calendar(value: string, precision: Occurrence["precision"]): number {
  const pattern = { day: /^\d{4}-\d{2}-\d{2}$/, month: /^\d{4}-\d{2}$/, year: /^\d{4}$/ }[precision];
  if (!pattern || !pattern.test(value) || value.slice(0, 4) === "0000") throw new Error("日期精度不匹配");
  const day = precision === "year" ? `${value}-01-01` : precision === "month" ? `${value}-01` : value;
  const time = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) throw new Error("无效的日历日期");
  return time;
}
export function validateOccurrence(value: Occurrence | null | undefined, text?: string): Occurrence | null {
  if (value == null) return null;
  const from = calendar(value.from, value.precision);
  if (value.to && calendar(value.to, value.precision) < from) throw new Error("结束日期早于开始日期");
  const quote = validateText(value.quote, 4000, true);
  if (text !== undefined && !text.includes(quote)) throw new Error("日期依据必须是保存原文中的逐字引句");
  return { from: value.from, to: value.to || null, precision: value.precision, quote };
}
export function formatOccurrence(value: Occurrence): string {
  return value.to && value.to !== value.from ? `${value.from} — ${value.to}` : value.from;
}
export function timelineKey(entry: TimelineEntry, mode: TimelineMode): string | null {
  return mode === "published" ? entry.publishedAt : mode === "captured" ? entry.capturedAt : entry.occurred?.from ?? null;
}
export function groupTimeline(entries: TimelineEntry[], mode: TimelineMode): { dated: TimelineEntry[]; undated: TimelineEntry[] } {
  const at = (entry: TimelineEntry) => timelineKey(entry, mode);
  const dated = entries.filter((entry) => at(entry) !== null).sort((a, b) => (at(b) ?? "").localeCompare(at(a) ?? "") || b.snapshotId.localeCompare(a.snapshotId));
  return { dated, undated: entries.filter((entry) => at(entry) === null) };
}
export function isMissingEventSchema(error: { code?: string; message: string }): boolean {
  return ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "") && /signal_event|signal_source_snapshot|event_timeline/.test(error.message);
}
