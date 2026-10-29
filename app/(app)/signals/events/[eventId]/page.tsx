import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getEvent, listTimeline, listEvents } from "@/lib/domains/signals/events/queries";
import { loadResearch, researchSnapshots } from "@/lib/domains/signals/events/research";
import { loadReadingPreferences, reportEventsForSignals } from "@/lib/domains/signals/reading-preferences";
import type { TimelineMode } from "@/lib/domains/signals/events/domain";
import { eventsEnabled } from "../enabled";
import { EventHistory } from "../member-controls";
import { EventTimeline } from "./event-timeline";
import { EventCandidates } from "./event-candidates";
import { ResearchPanel } from "../research-panel";
import { ReplayStart } from "../replay-start";
import { EditEventForm } from "../edit-event-form";
import { EventOverview } from "../event-overview";
import { AIResearchPanel } from "../ai-research-panel";
import { ReasoningPanel } from "../reasoning-panel";
import { AttentionPanel } from "../attention-panel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MODES = { published: "报道发布顺序", occurred: "有出处的发生顺序", captured: "快照保存顺序" } as const;
export default async function EventPage({ params, searchParams }: { params: { eventId: string }; searchParams: { mode?: string; cursor?: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) notFound();
  if (!eventsEnabled()) return <PageContainer width="narrow"><p className="text-sm">事件档案暂未开启。<Link href="/signals" className="text-primary">返回今天 →</Link></p></PageContainer>;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.eventId)) notFound();
  const event = await getEvent(user.id, params.eventId);
  if (!event) notFound();
  if (event === "missing-schema") return <PageContainer width="narrow"><p className="text-sm">事件档案需要完成数据库更新。现有新闻可正常阅读。</p></PageContainer>;
  const mode: TimelineMode = searchParams.mode && Object.hasOwn(MODES, searchParams.mode) ? searchParams.mode as TimelineMode : "published";
  const cursor = typeof searchParams.cursor === "string" ? searchParams.cursor.slice(0, 2048) : undefined;
  const [timeline, preferences, research, sources, other] = await Promise.all([listTimeline(user.id, event.id, { mode, cursor, limit: 20 }), loadReadingPreferences(user.id), loadResearch(user.id, event.id), researchSnapshots(user.id, event.id), listEvents(user.id, { limit: 100 })]);
  const events = preferences.preferences.length ? await reportEventsForSignals(user.id, timeline.items.map((entry) => entry.signalId)) : new Map<string, string>();
  const latest = cursor || mode !== "captured" ? await listTimeline(user.id, event.id, { mode: "captured", limit: 3 }) : timeline;
  return <PageContainer width="narrow">
    <p className="mb-5 text-sm"><Link href="/signals/events" className="text-muted-foreground hover:text-primary">← 我的事件档案</Link></p>
    <PageHeader eyebrow="Event Timeline" title={event.title} description={event.scope_note || "只收录你确认属于这件事的报道；相似材料放在候选区。"} />
    <EditEventForm eventId={event.id} initialTitle={event.title} initialScopeNote={event.scope_note} />
    <EventOverview timeline={latest.items} entries={research.entries} />
    <p className="mb-4 text-xs leading-6 text-muted-foreground">这是你的私人档案。报道发布、事件发生、系统收录和你打开的时间分别记录；没有依据的时间保持空白。时间由近到远。</p>
    <nav aria-label="时间线排序" className="mb-6 flex flex-wrap gap-2">{Object.entries(MODES).map(([key, label]) => <Link key={key} href={`/signals/events/${event.id}?mode=${key}`} aria-current={mode === key ? "page" : undefined} className={`rounded-md border px-3 py-2 text-xs ${mode === key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>)}</nav>
    {cursor && <p className="mb-4 text-sm"><Link href={`/signals/events/${event.id}?mode=${mode}`} className="text-primary hover:underline">回到最新一页</Link></p>}
    <EventTimeline eventId={event.id} entries={timeline.items} mode={mode} preferences={preferences} eventLabels={Object.fromEntries(events)} />
    {timeline.nextCursor && <Link className="mt-5 inline-block text-sm text-primary hover:underline" href={`/signals/events/${event.id}?mode=${mode}&cursor=${encodeURIComponent(timeline.nextCursor)}`}>更早的报道 →</Link>}
    <EventCandidates eventId={event.id} />
    <EventHistory eventId={event.id} />
    {sources.length > 100 && <p className="mt-6 text-xs leading-6 text-muted-foreground">来源目录先显示100份，共保存{sources.length}份；完整历史仍可在时间线翻页查看。本次目录不代表全部材料已分析。</p>}
    <ResearchPanel eventId={event.id} entries={research.entries} sources={[...sources].sort((a, b) => b.captured_at.localeCompare(a.captured_at) || b.id.localeCompare(a.id)).slice(0, 100).map((row) => ({ ...row, captured_text: row.captured_text.slice(0, 2000) }))} available={research.available} otherEvents={other.items.filter((item) => item.id !== event.id)} />
    <div className="mt-8"><AIResearchPanel eventId={event.id} memberRevision={event.revision} entries={research.entries} sources={[...sources].sort((a, b) => b.captured_at.localeCompare(a.captured_at) || b.id.localeCompare(a.id)).slice(0, 100).map((row) => ({ ...row, captured_text: row.captured_text.slice(0, 10000) }))} available={research.available} otherEvents={other.items.filter((item) => item.id !== event.id)} /></div>
    <div className="mt-8"><ReplayStart eventId={event.id} /></div>
    {process.env.REASONING_ATTENTION_ENABLED === "true" && <div className="mt-8 space-y-6"><ReasoningPanel eventId={event.id} /><AttentionPanel eventId={event.id} /></div>}
  </PageContainer>;
}
