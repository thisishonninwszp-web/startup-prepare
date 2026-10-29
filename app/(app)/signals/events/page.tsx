import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listEvents } from "@/lib/domains/signals/events/queries";
import { eventsEnabled } from "./enabled";
import { NewEventForm } from "./new-event-form";

export const dynamic = "force-dynamic";
export default async function EventsPage({ searchParams }: { searchParams: { q?: string; cursor?: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) notFound();
  const search = typeof searchParams.q === "string" ? searchParams.q.slice(0, 120) : "";
  const cursor = typeof searchParams.cursor === "string" ? searchParams.cursor.slice(0, 2048) : undefined;
  const list = eventsEnabled() ? await listEvents(user.id, { search, cursor, limit: 20 }) : null;
  return <PageContainer width="narrow">
    <p className="mb-5 text-sm"><Link href="/signals/memory" className="text-muted-foreground hover:text-primary">← 记忆</Link></p>
    <PageHeader eyebrow="Event Dossiers" title="事件档案" description="让多天的报道接成一件事。归属由你确认，时间和来源可以核对。" />
    {!list || list.status === "missing-schema" ? <p className="rounded-lg border p-5 text-sm leading-7 text-muted-foreground">事件档案尚未开启，请联系维护者完成启用。现有新闻和判断不受影响。</p> : <>
      <NewEventForm />
      <form action="/signals/events" className="mb-6 flex gap-2"><Input name="q" aria-label="按事件名称查找" maxLength={120} defaultValue={search} placeholder="查找我的事件" /><Button type="submit" variant="outline">查找</Button></form>
      {list.items.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm leading-7 text-muted-foreground">{search ? "没有匹配的事件，可以换个名称查找。" : "还没有事件档案。可以从上面新建，也可以在新闻详情里把报道加入事件。"}</p> : <ul className="divide-y rounded-lg border px-4">{list.items.map((event) => <li key={event.id} className="py-4"><Link href={`/signals/events/${event.id}`} className="break-words text-base font-medium hover:text-primary">{event.title} →</Link>{event.scope_note && <p className="mt-1 text-sm leading-7 text-muted-foreground">{event.scope_note}</p>}<p className="mt-1 text-xs text-muted-foreground">{event.revision} 次归属修订 · 私人档案</p></li>)}</ul>}
      {list.nextCursor && <Link className="mt-5 inline-block text-sm text-primary hover:underline" href={`/signals/events?q=${encodeURIComponent(search)}&cursor=${encodeURIComponent(list.nextCursor)}`}>下一页事件 →</Link>}
    </>}
  </PageContainer>;
}
