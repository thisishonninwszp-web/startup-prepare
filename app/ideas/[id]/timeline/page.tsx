import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { getIdeaTimeline } from "./queries";
import { TimelineView } from "./timeline-view";

export const dynamic = "force-dynamic";

export default async function IdeaTimelinePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: idea, error } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title")
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!idea || idea.user_id !== user.id) notFound();

  const events = await getIdeaTimeline(params.id, user.id);

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          想法时间线
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {idea.title?.trim() || "（无标题）"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          从第一条观察到现在的完整轨迹。亮色节点是真实接触，灰色节点是分析或AI质疑。
        </p>
        <TimelineView events={events} />
      </main>
    </AppShell>
  );
}
