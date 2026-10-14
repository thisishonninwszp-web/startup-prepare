import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  dueJudgments,
  listJudgments,
  tallyByTag,
  tallyEvidenceDisagreement,
  tallyJudgments,
  tallyMissReasons,
} from "@/lib/domains/signals/practice";
import { listUserFlaggedSteps } from "@/lib/domains/signals/inference";
import { listAnsweredDrills, tallyDrillMissReasons } from "@/lib/domains/signals/drills";
import type { MissReason } from "@/lib/domains/signals/practice-shared";
import { ResolveJudgment } from "../judgment-forms";
import { OutcomeEvidenceView } from "../outcome-evidence";
import { formatDueDate, JudgmentView, outcomeLabel } from "../judgment-view";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 到期的判断，打开页面时自动查证据的最多几条（每条搜两次），其余点按钮查。 */
const AUTO_EVIDENCE = 3;

export default async function JudgmentLedgerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [judgments, flagged, drills] = await Promise.all([
    listJudgments(user.id).catch((e: Error) => {
      if (/signal_judgments/.test(e.message)) return null;
      throw e;
    }),
    listUserFlaggedSteps().catch(() => []),
    listAnsweredDrills(user.id).catch(() => []),
  ]);
  const drillMisses = tallyDrillMissReasons(drills);

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
      <p className="-mt-4 mb-8 text-sm">
        <Link href="/signals/drill" className="text-primary underline-offset-4 hover:underline">
          对账要等几个月？先做几道历史题，答完马上知道对错 →
        </Link>
      </p>

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
        <Ledger judgments={judgments} drillMisses={drillMisses} />
      )}

      {flagged.length > 0 && (
        <section className="mt-12 border-t pt-6">
          <h2 className="text-base font-semibold">你标过的车轱辘</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            往下推里你标出的「这是车轱辘」。攒够十来条，拿来对照裁判当时怎么判的，重新调它的门槛。
          </p>
          <ul className="mt-3 space-y-3 text-sm leading-7">
            {flagged.map((f, i) => (
              <li key={i} className="border-l-2 border-border pl-3">
                <p className="text-muted-foreground">上一步：{f.parent}</p>
                <p>这一步：{f.claim}</p>
                <p className="font-mono text-xs text-muted-foreground">{f.judgedAs}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}

function Ledger({
  judgments,
  drillMisses,
}: {
  judgments: NonNullable<Awaited<ReturnType<typeof listJudgments>>>;
  /** 历史题猜错时选的原因，和真实判断合在一起数。 */
  drillMisses: Record<MissReason, number>;
}) {
  const tally = tallyJudgments(judgments);
  const byTag = tallyByTag(judgments);
  const missReasons = tallyMissReasons(judgments).filter((m) => m.count + drillMisses[m.reason] > 0);
  const due = dueJudgments(judgments);
  const resolvedCount = tally.hit + tally.miss;
  const disagreement = tallyEvidenceDisagreement(judgments);

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

      {disagreement.checked > 0 && (
        <section className="mb-10">
          <h2 className="text-base font-semibold">你判卷手松不松</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            对账前查过证据的 {disagreement.checked} 条里：你标了看对了、查到的反对比支持多的，
            <span className="font-mono"> {disagreement.hitButAgainst} </span>次；你标了看错了、查到的支持比反对多的，
            <span className="font-mono"> {disagreement.missButFor} </span>次。
            前一种多，说明回头看时容易觉得「我早就知道」；只数次数，翻到那几条自己看是不是真判松了。
          </p>
        </section>
      )}

      {missReasons.length > 0 && (
        <section className="mb-10">
          <h2 className="text-base font-semibold">看错的时候，错在哪一步</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            只数次数，真实判断和历史题合在一起。哪一类最多，下次判断时就在那一步多停一下。
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {missReasons.map((m) => (
              <li key={m.reason}>
                <span className="font-mono">{m.count + drillMisses[m.reason]}</span> 次 · {m.label}
                {drillMisses[m.reason] > 0 && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    （真实判断 {m.count} · 历史题 {drillMisses[m.reason]}）
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {byTag.length > 0 && (
        <section className="mb-10">
          <h2 className="text-base font-semibold">按标签</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            看你在哪类事上写得多、各对了几次。同样只记次数：哪类事你总看错，往下翻那几条看是怎么错的。
          </p>
          <ul className="mt-3 space-y-1 font-mono text-sm">
            {byTag.map((t) => (
              <li key={t.tag} className="flex flex-wrap gap-x-4">
                <span className="min-w-24">#{t.tag}</span>
                <span className="text-muted-foreground">写了 {t.total}</span>
                <span>看对了 {t.hit}</span>
                <span>看错了 {t.miss}</span>
                <span className="text-muted-foreground">还在等 {t.pending}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {due.length > 0 && (
        <section className="mb-10">
          <h2 className="text-base font-semibold">到期了，对一下账（{due.length}）</h2>
          <ul className="mt-4 space-y-6">
            {due.map((r, i) => (
              <li key={r.id}>
                <p className="text-sm text-muted-foreground">{r.news_title}</p>
                <p className="mt-1 border-l-2 border-primary pl-3 text-base font-medium leading-8">{r.judgment}</p>
                <OutcomeEvidenceView judgmentId={r.id} evidence={r.outcome_evidence ?? null} auto={i < AUTO_EVIDENCE && r.outcome_evidence === null} />
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
              {j.question_id ? (
                <Link
                  href={`/signals/questions/${j.question_id}`}
                  className="transition-colors duration-150 hover:text-primary"
                >
                  {j.news_title}
                </Link>
              ) : j.signal_id ? (
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
