import Link from "next/link";
import { groupTimeline, type TimelineEntry, type TimelineMode } from "@/lib/domains/signals/events/domain";
import { preferenceForItem, type ReadingPreferencesState } from "@/lib/domains/signals/reading-preferences-shared";
import { StoryPreferenceButtons } from "../../story-preference-buttons";
import { EventPicker } from "../event-picker";
import { ExcludeMemberButton } from "../member-controls";

const DATE = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });
function stamp(value: string | null): string {
  return value && Number.isFinite(Date.parse(value)) ? DATE.format(new Date(value)) : "时间不详";
}
function safeUrl(value: string | null): string | null {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function occurrence(entry: TimelineEntry): string {
  if (!entry.occurred) return "发生时间未记录";
  const { from, to, precision } = entry.occurred;
  const label = precision === "month" ? "月" : precision === "year" ? "年" : "日";
  return `${from}${to && to !== from ? ` — ${to}` : ""}（${label}）`;
}

export function EventTimeline({ eventId, entries, mode, preferences = { status: "ready", preferences: [] }, eventLabels = {} }: {
  eventId: string; entries: TimelineEntry[]; mode: TimelineMode; preferences?: ReadingPreferencesState; eventLabels?: Record<string, string>;
}) {
  const visible = entries.filter((item) => preferenceForItem({ signal_id: item.signalId, event: eventLabels[item.signalId] }, preferences.preferences)?.preference !== "mute");
  const muted = entries.filter((item) => !visible.includes(item));
  const grouped = groupTimeline(visible, mode);
  function item(entry: TimelineEntry) {
    const sourceUrl = safeUrl(entry.sourceUrl);
    const recovered = entry.sourceFetchedAt && Date.parse(entry.capturedAt) - Date.parse(entry.sourceFetchedAt) > 86_400_000;
    return <li key={`${entry.signalId}-${entry.revision}`} className="relative border-l-2 border-border pb-7 pl-5" data-snapshot-id={entry.snapshotId}>
      <span className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">{mode === "published" ? entry.publishedAt ? `发布于 ${stamp(entry.publishedAt)}` : "发布时间不详" : mode === "occurred" ? occurrence(entry) : `本次快照保存于 ${stamp(entry.capturedAt)}`}</p>
      <h3 className="mt-1 break-words text-base font-medium leading-7"><Link href={`/signals/${entry.signalId}`} className="hover:text-primary">{entry.title}</Link></h3>
      <p className="mt-1 text-xs text-muted-foreground">{entry.sourceName} · {entry.captureScope === "summary" ? "仅保存发布方简介" : entry.captureScope === "excerpt" ? "保存正文摘录" : "保存正文"}</p>
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-7">{entry.capturedText.length > 600 ? `${entry.capturedText.slice(0, 600)}…` : entry.capturedText}</p>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">这是来源的说法，不代表已经独立证实。{recovered ? "后补快照：原新闻早于本次保存，不代表当时已保存这份内容。" : ""}</p>
      {entry.publishedAt && Date.parse(entry.publishedAt) > Date.parse(entry.capturedAt) && <p className="mt-1 text-xs text-status-validating">来源标注的发布时间晚于这份快照保存时间，请回原文核对。</p>}
      {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">核对完整原文 ↗</a>}
      <Link href={`/signals/events/${eventId}/sources/${entry.snapshotId}`} className="ml-3 inline-block text-xs text-primary hover:underline">查看这份冻结快照 →</Link>
      <details className="mt-3 text-xs leading-6 text-muted-foreground"><summary className="cursor-pointer">时间来路与已保存的依据</summary><dl className="mt-2 space-y-1"><div><dt className="inline">来源发布时间：</dt><dd className="inline">{entry.publishedAt ? stamp(entry.publishedAt) : "发布时间不详"}</dd></div><div><dt className="inline">发生时间：</dt><dd className="inline">{occurrence(entry)}</dd></div>{entry.occurred && <div><dt className="inline">发生时间依据：</dt><dd className="inline">「{entry.occurred.quote}」</dd></div>}<div><dt className="inline">原新闻系统收录：</dt><dd className="inline">{stamp(entry.sourceFetchedAt)}</dd></div><div><dt className="inline">这份快照保存：</dt><dd className="inline">{stamp(entry.capturedAt)}</dd></div><div><dt className="inline">系统记录首次打开：</dt><dd className="inline">{entry.firstRecordedOpenAt ? stamp(entry.firstRecordedOpenAt) : "尚无记录，不推断何时知晓"}</dd></div></dl>{entry.capturedText.length > 600 && <p className="mt-3 whitespace-pre-line break-words">{entry.capturedText}</p>}</details>
      {entry.note && <p className="mt-3 border-l border-primary pl-3 text-sm leading-7">我的备注：{entry.note}</p>}
      <div className="mt-3"><StoryPreferenceButtons signalId={entry.signalId} event={eventLabels[entry.signalId]} initial={preferenceForItem({ signal_id: entry.signalId, event: eventLabels[entry.signalId] }, preferences.preferences)} available={preferences.status === "ready"} /></div>
      <EventPicker signalId={entry.signalId} defaultTitle={entry.title} initialEventId={eventId} initialSnapshotId={entry.snapshotId} initialNote={entry.note} initialOccurred={entry.occurred} />
      <ExcludeMemberButton eventId={eventId} signalId={entry.signalId} />
    </li>;
  }
  return <div>
    {entries.length === 0 && <div className="rounded-lg border border-dashed p-6 text-sm leading-7 text-muted-foreground">这个档案还没有报道。到任意新闻详情点“加入事件档案”，或查找下方的候选。</div>}
    {grouped.dated.length > 0 && <ol className="ml-1">{grouped.dated.map(item)}</ol>}
    {grouped.undated.length > 0 && <section className="mt-3"><h2 className="mb-4 text-sm font-medium text-muted-foreground">{mode === "occurred" ? "发生时间未记录" : "发布时间不详"}（不拿收录时间代替）</h2><ol className="ml-1">{grouped.undated.map(item)}</ol></section>}
    {muted.length > 0 && <details className="mt-4 rounded-md border border-dashed p-3"><summary className="cursor-pointer text-sm text-muted-foreground">已静音的报道（{muted.length} 条，可查看或恢复）</summary><ol className="ml-1 mt-4">{muted.map(item)}</ol></details>}
  </div>;
}
