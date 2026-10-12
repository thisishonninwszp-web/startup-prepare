import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { formatReportDate } from "@/lib/domains/signals/format";
import { listJapanGaps } from "@/lib/domains/signals/gaps";
import { SourceCheckView } from "../check-view";
import { GapActions } from "./gap-actions";

export const dynamic = "force-dynamic";

export default async function JapanGapsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const gaps = await listJapanGaps(user.id);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="China → Japan"
        title="中国有、日本还没有"
        description="每天报告里中国的那几条，上网查下来日本还没有、或者有但没普及的，都攒在这里。哪条让你想多琢磨一下，就记成观察，周复盘时会再看到它。"
      />

      {gaps.length === 0 ? (
        <EmptyState
          title="这里空着。"
          description="只有查到出处、确认日本还没有或没普及的才会进来，所以攒得慢。过几天再来看。"
        />
      ) : (
        <>
          <p className="mb-4 font-mono text-xs text-muted-foreground">{gaps.length} 条</p>
          <ul className="space-y-4">
            {gaps.map((g) => (
              <li key={g.signal_id} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">
                  {formatReportDate(g.brief_date)} · {g.source}
                </p>
                <h3 className="mt-1 text-base font-semibold leading-7">{g.headline}</h3>
                <p className="mt-2 text-sm leading-7">
                  <span className="text-muted-foreground">日本这边：</span>
                  {g.japan}
                </p>
                {g.whyNow && (
                  <p className="mt-2 text-sm leading-7">
                    <span className="text-muted-foreground">为什么是现在：</span>
                    {g.whyNow}
                  </p>
                )}
                <div className="mt-1">
                  <SourceCheckView
                    check={g.check}
                    searchQuery={`日本 ${g.headline}`}
                    unverifiedText="没查到出处，这句是 AI 凭印象说的。"
                    uncheckedText="这句是 AI 凭印象说的，没上网查过。"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <GapActions signalId={g.signal_id} observed={g.observed} />
                  {g.url && (
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                    >
                      中国那边的原文 ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageContainer>
  );
}
