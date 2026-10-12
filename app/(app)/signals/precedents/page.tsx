import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import type { BriefItem } from "@/lib/domains/signals/brief";
import { formatReportDate } from "@/lib/domains/signals/format";
import { collectPrecedents } from "@/lib/domains/signals/precedents-shared";

export const dynamic = "force-dynamic";

/** 往回翻多少份报告。 */
const LOOKBACK = 200;

export default async function PrecedentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, items")
    .eq("user_id", user.id)
    .order("brief_date", { ascending: false })
    .limit(LOOKBACK);
  if (error) throw new Error(error.message);
  const precedents = collectPrecedents(
    (data ?? []).map((r) => ({ brief_date: r.brief_date as string, items: (r.items as BriefItem[] | null) ?? [] }))
  );

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="Precedents"
        title="先例：谁试过、结果怎样"
        description="报告里讲到某个方向有人试过的结果 —— 撤退、停服、转型、失败，或者在别处做成了 —— 都攒在这里。想一个方向之前，先翻翻前人是怎么栽的。"
      />

      {precedents.length === 0 ? (
        <EmptyState title="这里空着。" description="之后每天的报告里，讲到有人试过某个方向的结果时，会攒进来。" />
      ) : (
        <ul className="space-y-4">
          {precedents.map((p) => (
            <li key={p.signal_id} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {formatReportDate(p.brief_date)} · {p.source}
              </p>
              <Link
                href={`/signals/${p.signal_id}`}
                className="mt-1 block text-base font-semibold leading-7 transition-colors duration-150 hover:text-primary"
              >
                {p.headline}
              </Link>
              <p className="mt-2 text-sm leading-7">
                <span className="text-muted-foreground">说明了什么：</span>
                {p.lesson}
              </p>
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                >
                  原文 ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
