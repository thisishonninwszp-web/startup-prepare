import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { dueJudgments, listJudgments, tallyJudgments } from "@/lib/domains/signals/practice";
import { ResolveJudgment } from "../judgment-forms";
import { formatDueDate, JudgmentView, outcomeLabel } from "../judgment-view";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function JudgmentLedgerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const judgments = await listJudgments(user.id).catch((e: Error) => {
    if (/signal_judgments/.test(e.message)) return null;
    throw e;
  });

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="Judgment ledger"
        title="判断账本"
        description="你读新闻时写下的每一句判断。到期了回来对账，攒几个月，就能看出哪类事你看得准、哪类事总看错。"
      />

      {judgments === null ? (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm leading-7 text-status-validating">
          数据库还差一步：迁移 055 没跑。执行 supabase/migrations/055_signal_judgments.sql 之后再来。
        </div>
      ) : judgments.length === 0 ? (
        <EmptyState
          title="这里空着。"
          description="还没写过判断。回今日报告做今天的练习，写下第一句。"
        />
      ) : (
        <Ledger judgments={judgments} />
      )}
    </PageContainer>
  );
}

function Ledger({ judgments }: { judgments: NonNullable<Awaited<ReturnType<typeof listJudgments>>> }) {
  const tally = tallyJudgments(judgments);
  const due = dueJudgments(judgments);
  const resolvedCount = tally.hit + tally.miss;

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-x-8 gap-y-2 font-mono text-sm">
        <span>看对了 {tally.hit}</span>
        <span>看错了 {tally.miss}</span>
        <span className="text-muted-foreground">还在等 {tally.pending}</span>
      </div>
      <p className="mb-8 text-xs leading-6 text-muted-foreground">
        {resolvedCount < 10
          ? `已经对过账的只有 ${resolvedCount} 条，太少，现在看不出你准不准。先攒着。`
          : "只记次数，不算准确率：一个数字会让你忘了每一条是怎么错的。往下翻着看。"}
      </p>

      {due.length > 0 && (
        <section className="mb-10">
          <h2 className="text-base font-semibold">到期了，对一下账（{due.length}）</h2>
          <ul className="mt-4 space-y-6">
            {due.map((r) => (
              <li key={r.id}>
                <p className="text-sm text-muted-foreground">{r.news_title}</p>
                <p className="mt-1 border-l-2 border-primary pl-3 text-base font-medium leading-8">{r.judgment}</p>
                <ResolveJudgment predictionId={r.prediction_id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="text-base font-semibold">全部</h2>
      <ol className="mt-4 space-y-8">
        {judgments.map((j) => (
          <li key={j.id} className="border-b pb-8 last:border-b-0">
            <p className="font-mono text-xs text-muted-foreground">
              {formatDueDate(j.created_at)} · {outcomeLabel(j.outcome)}
            </p>
            <p className="mt-1 text-sm">
              {j.signal_id ? (
                <Link
                  href={`/signals/${j.signal_id}`}
                  className="transition-colors duration-150 hover:text-primary"
                >
                  {j.news_title}
                </Link>
              ) : j.news_url ? (
                <a href={j.news_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {j.news_title}
                </a>
              ) : (
                j.news_title
              )}
            </p>
            <div className="mt-3">
              <JudgmentView judgment={j} />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
