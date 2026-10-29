import Link from "next/link";
import { eventLinksForSignals } from "@/lib/domains/signals/events/queries";
import { eventsEnabled } from "./enabled";
import { EventPicker } from "./event-picker";

export async function SignalEventSection({ viewerId, signalId, title }: { viewerId: string; signalId: string; title: string }) {
  if (!eventsEnabled()) return null;
  const links = await eventLinksForSignals(viewerId, [signalId]);
  return <section id="event-dossier" className="mt-6 scroll-mt-8">
    <h2 className="text-base font-semibold">这件事的事件档案</h2>
    {(links[signalId] ?? []).length > 0 && <ul className="mt-2 space-y-2">{links[signalId].map((event) => <li key={event.id}><Link href={`/signals/events/${event.id}`} className="text-sm text-primary hover:underline">{event.title} · 看跨天时间线 →</Link></li>)}</ul>}
    <EventPicker signalId={signalId} defaultTitle={title} />
  </section>;
}
