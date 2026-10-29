import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { REPORT_SECTION_KINDS } from "@/lib/domains/signals/feeds";
import { KIND_TITLES } from "@/lib/domains/signals/memory-shared";
import { marksFor } from "@/lib/domains/signals/memory";
import { loadReadingPreferences } from "@/lib/domains/signals/reading-preferences";
import { partitionReadingItems } from "@/lib/domains/signals/reading-preferences-shared";
import { loadReadingSession } from "@/lib/domains/signals/reading-session";
import { sectionLayout } from "@/lib/domains/signals/section-habits";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { getDailyReport } from "../queries";
import { QuickReader, type QuickItem } from "./quick-reader";

export const dynamic = "force-dynamic";

/** 速读：今天的精选一条一屏，按他的阅读习惯排的版面顺序，从第一条没看过的开始。 */
export default async function QuickPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const view = await sharedViewFor(user.id);
  const [report, preferences, layout] = await Promise.all([
    getDailyReport(view.sourceUserId, today),
    loadReadingPreferences(user.id),
    sectionLayout(user.id, REPORT_SECTION_KINDS),
  ]);
  const rows =
    report === "missing-schema"
      ? []
      : layout.order.flatMap((kind) =>
          partitionReadingItems(report[kind]?.items ?? [], preferences.preferences)
            .visible.filter((i) => !i.extra)
            .map((i) => ({ i, section: KIND_TITLES[kind] }))
        );
  const ids = rows.map((r) => r.i.signal_id);
  const [session, marks] = await Promise.all([loadReadingSession(user.id, today, ids), marksFor(user.id, ids).catch(() => new Map())]);
  const opened = new Set(session.openedIds);
  const items: QuickItem[] = rows.map(({ i, section }) => ({
    signal_id: i.signal_id,
    section,
    short: i.short ?? null,
    headline: i.headline,
    source: i.source,
    url: i.url,
    background: i.background,
    opened: opened.has(i.signal_id),
    mark: marks.get(i.signal_id)?.mark ?? null,
  }));

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Quick read"
        title="速读"
        description="今天的精选一条一屏。右滑（或 →）标「重要」，左滑（或 ←）看过了；跟你有关的点中间那个按钮。标了的会进记忆、接上后来的消息、一周后回想一次。"
      />
      <QuickReader items={items} date={today} />
    </PageContainer>
  );
}
