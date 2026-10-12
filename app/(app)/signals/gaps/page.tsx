import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { formatReportDate } from "@/lib/domains/signals/format";
import { listJapanGaps, type JapanGapRow } from "@/lib/domains/signals/gaps";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { SourceCheckView } from "../check-view";
import { GapActions } from "./gap-actions";

export const dynamic = "force-dynamic";

/** 两个方向的叫法：问的是哪边有没有、原文在哪边、有人拿到钱时说的是哪边。 */
const SIDE_TEXT: Record<GapSide, { here: string; there: string; empty: string }> = {
  japan: {
    here: "日本",
    there: "中国",
    empty: "只有查到出处、确认日本还没有或没普及的才会进来，所以攒得慢。过几天再来看。",
  },
  china: {
    here: "中国",
    there: "日本",
    empty: "报告里日本的产品、服务或做法，查下来中国还没有或没普及的，会攒在这里。过几天再来看。",
  },
};

function GapList({ gaps, side }: { gaps: JapanGapRow[]; side: GapSide }) {
  const t = SIDE_TEXT[side];
  if (gaps.length === 0) return <EmptyState title="这里空着。" description={t.empty} />;
  return (
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
              <span className="text-muted-foreground">{t.here}这边：</span>
              {g.japan}
            </p>
            {g.funded && (
              <div className="mt-2 text-sm leading-7">
                <p>
                  <span className="text-muted-foreground">{t.here}已经有人拿到钱在做：</span>
                  {g.funded.company}
                  <span className="ml-1 text-xs text-muted-foreground">（方向被验证过，也说明有人先走了一步）</span>
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">原文</summary>
                  <p className="mt-1 text-muted-foreground">
                    「{g.funded.excerpt}」
                    <a
                      href={g.funded.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-primary underline-offset-4 hover:underline"
                    >
                      来源 ↗
                    </a>
                  </p>
                </details>
              </div>
            )}
            {g.whyNow && (
              <p className="mt-2 text-sm leading-7">
                <span className="text-muted-foreground">为什么是现在：</span>
                {g.whyNow}
              </p>
            )}
            <div className="mt-1">
              <SourceCheckView
                check={g.check}
                searchQuery={`${t.here} ${g.headline}`}
                unverifiedText="没查到出处，这句是 AI 凭印象说的。"
                uncheckedText="这句是 AI 凭印象说的，没上网查过。"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <GapActions signalId={g.signal_id} observed={g.observed} side={side} />
              {g.url && (
                <a
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                >
                  {t.there}那边的原文 ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function JapanGapsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [toJapan, toChina] = await Promise.all([listJapanGaps(user.id, "japan"), listJapanGaps(user.id, "china")]);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="China ⇄ Japan"
        title="中国有、日本还没有"
        description="每天报告里中国的那几条，上网查下来日本还没有、或者有但没普及的，都攒在这里；反过来，日本有、中国还没有的也攒着。哪条让你想多琢磨一下，就记成观察，周复盘时会再看到它。"
      />

      <GapList gaps={toJapan} side="japan" />

      <section className="mt-12 border-t pt-6">
        <h2 className="text-xl font-semibold">反过来：日本有、中国还没有</h2>
        <p className="mb-4 mt-1 text-sm leading-7 text-muted-foreground">
          日本做成、中国还没有的东西，可能适合跨境电商卖给中国人，或者把这种做法带去中国。
        </p>
        <GapList gaps={toChina} side="china" />
      </section>
    </PageContainer>
  );
}
