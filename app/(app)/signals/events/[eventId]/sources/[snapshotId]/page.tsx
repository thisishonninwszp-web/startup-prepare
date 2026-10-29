import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getEvent } from "@/lib/domains/signals/events/queries";
import { eventsEnabled } from "../../../enabled";
import { PageContainer } from "@/components/ui/page-container";
export const dynamic = "force-dynamic";
export default async function FrozenSourcePage({ params }: { params: { eventId: string; snapshotId: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (!user || !eventsEnabled() || !uuid.test(params.eventId) || !uuid.test(params.snapshotId)) notFound();
  const event = await getEvent(user.id, params.eventId); if (!event || event === "missing-schema") notFound();
  const link = await supabaseAdmin.from("signal_event_memberships").select("id").eq("user_id", user.id).eq("event_id", params.eventId).eq("snapshot_id", params.snapshotId).eq("action", "include").limit(1);
  if (link.error) throw new Error(link.error.message); if (!link.data?.length) notFound();
  const { data, error } = await supabaseAdmin.from("signal_source_snapshots").select("title,source_name,captured_text,capture_scope,captured_at,published_at").eq("user_id", user.id).eq("id", params.snapshotId).maybeSingle();
  if (error) throw new Error(error.message); if (!data) notFound();
  return <PageContainer width="narrow"><Link href={`/signals/events/${params.eventId}`} className="text-sm text-muted-foreground hover:text-primary">← 返回事件档案</Link><h1 className="mt-6 text-2xl font-semibold leading-9">{data.title}</h1><p className="mt-2 text-xs leading-6 text-muted-foreground">来源：{data.source_name} · 保存于 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.captured_at))}（东京）<br />捕获范围：{data.capture_scope === "summary" ? "发布方简介" : data.capture_scope === "excerpt" ? "正文摘录" : "已保存正文"}。这是当次实际保存的内容，之后原网页更新不会覆盖这份快照；来源说法仍需核实。</p><article className="mt-6 whitespace-pre-wrap break-words text-base leading-8">{data.captured_text}</article></PageContainer>;
}
