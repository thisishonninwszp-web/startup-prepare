import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { getSignalDetail, type SignalAnalysis } from "@/lib/domains/signals/analysis";
import { formatTokyoTime } from "@/lib/domains/signals/format";
import { GENERIC_QUESTION, getJudgmentForSignal, listNodeBets } from "@/lib/domains/signals/practice";
import { NODE_BET_PREFIX } from "@/lib/domains/signals/practice-shared";
import { formatDueDate } from "../judgment-view";
import { AnalysisLoader } from "./analysis-loader";
import { SignalActions } from "../signal-actions";
import { JudgmentForm } from "../judgment-forms";
import { JudgmentView } from "../judgment-view";
import { HistoryPanel } from "../history-panel";
import { InferenceTree } from "../inference-tree";
import { ContactPlanButton } from "../contact-plan-button";
import { getInference } from "@/lib/domains/signals/inference";
import { listOpenGapOptions } from "@/lib/domains/ideas/info-gaps";
import { RouteToGap } from "../route-to-gap";

export const dynamic = "force-dynamic";
// 第一次打开时要读原文 + 调 AI 写深读，默认 10 秒不够。
export const maxDuration = 60;

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <div className="mt-1 text-base leading-8">{children}</div>
    </div>
  );
}

function AnalysisView({ analysis, signalId }: { analysis: SignalAnalysis; signalId: string }) {
  if (analysis.kind === "tools") {
    return (
      <div className="space-y-6">
        <Block label="这是什么">{analysis.what}</Block>
        <Block label="怎么用">{analysis.howToUse}</Block>
        <Block label="适合谁">{analysis.whoFor}</Block>
        <Block label="你可以试">
          <p className="border-l-2 border-primary pl-3">{analysis.tryThis}</p>
        </Block>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Block label="来龙去脉">{analysis.background}</Block>
      <Block label="会落到谁身上">{analysis.chain}</Block>
      <Block label="跟你">
        <p className="border-l-2 border-primary pl-3">{analysis.forYou}</p>
      </Block>
      <Block label="能找谁聊">
        {analysis.who}
        <p className="mt-1 text-muted-foreground">可以这样问：「{analysis.question}」</p>
        <div className="mt-3">
          <ContactPlanButton signalId={signalId} />
        </div>
      </Block>
    </div>
  );
}

export default async function SignalDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [detail, judgment, inference, nodeBets, gapOptions] = await Promise.all([
    getSignalDetail(params.id),
    // 迁移 055 没跑时没有判断练习，详情页照旧直接显示报告
    getJudgmentForSignal(user.id, params.id).catch((e: Error) => {
      if (/signal_judgments/.test(e.message)) return undefined;
      throw e;
    }),
    getInference(params.id),
    listNodeBets(user.id, params.id).catch(() => []),
    listOpenGapOptions(user.id).catch(() => []),
  ]);
  const bets = Object.fromEntries(
    nodeBets.map((b) => [b.question.slice(NODE_BET_PREFIX.length), formatDueDate(b.due_at)])
  );
  if (detail === null) notFound();
  const skipped = searchParams.skip === "1";
  // 还没判断过、也没选跳过：先写判断，报告藏起来
  const gated = judgment === null && !skipped;

  return (
    <PageContainer width="narrow">
      <p className="mb-6 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>

      {detail === "missing-schema" ? (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm leading-7 text-status-validating">
          数据库还差一步：迁移 054 没跑，具体报告存不下来。到 Supabase 的 SQL Editor 执行
          supabase/migrations/054_signal_reports.sql 之后再来。
        </div>
      ) : (
        <article className="animate-fade-up">
          <p className="font-mono text-xs text-muted-foreground">
            {formatTokyoTime(detail.published_at)} · {detail.source}
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-10">{detail.title}</h1>
          {detail.url && (
            <a
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              {detail.kind === "tools" ? "去 GitHub 看 ↗" : "读原文 ↗"}
            </a>
          )}

          {detail.summary && (
            <section className="mt-8">
              <h2 className="text-base font-semibold">
                {detail.kind === "tools" ? "仓库简介" : "发布方的简介"}
              </h2>
              <p className="mt-2 text-base leading-8">{detail.summary}</p>
            </section>
          )}

          {judgment && (
            <section className="mt-10 rounded-lg border bg-card p-5">
              <h2 className="mb-4 text-base font-semibold">你的判断</h2>
              <JudgmentView judgment={judgment} />
            </section>
          )}

          {gated ? (
            <section className="mt-10 rounded-lg border bg-card p-5">
              <h2 className="text-base font-semibold">先写你的判断</h2>
              <p className="mb-4 mt-1 text-sm leading-7 text-muted-foreground">
                写完才看 AI 的报告。先自己想一遍，再对照，练的就是这一下。
              </p>
              {detail.kind === "news" && (
                <div className="mb-5">
                  <HistoryPanel signalId={detail.id} initial={detail.history} />
                </div>
              )}
              <JudgmentForm signalId={detail.id} question={GENERIC_QUESTION} />
              <p className="mt-4 text-sm">
                <Link
                  href={`/signals/${detail.id}?skip=1`}
                  className="text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                >
                  这条不想判断，直接看报告 →
                </Link>
              </p>
            </section>
          ) : (
            <section className="mt-10 rounded-lg border bg-card p-5">
              <h2 className="mb-5 text-base font-semibold">具体报告</h2>
              {detail.analysis ? (
                <AnalysisView analysis={detail.analysis} signalId={detail.id} />
              ) : (
                <AnalysisLoader id={detail.id} />
              )}
            </section>
          )}

          {!gated && detail.kind === "news" && inference !== "missing-schema" && (
            <section id="inference" className="mt-10 scroll-mt-4 rounded-lg border bg-card p-5">
              <h2 className="mb-4 text-base font-semibold">往下推</h2>
              <InferenceTree signalId={detail.id} initial={inference} bets={bets} />
            </section>
          )}

          {!gated && detail.kind === "news" && (
            <section className="mt-10 rounded-lg border bg-card p-5">
              <h2 className="mb-4 text-base font-semibold">历史上类似的事</h2>
              <HistoryPanel signalId={detail.id} initial={detail.history} label="看看历史上类似的事" />
            </section>
          )}

          {detail.excerpt && (
            <section className="mt-10">
              <h2 className="text-base font-semibold">
                {detail.kind === "tools" ? "README 开头" : "原文开头"}
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {detail.excerpt}
                {detail.excerpt.length >= 1200 ? "…" : ""}
              </p>
            </section>
          )}

          <section className="mt-10 border-t pt-6">
            <h2 className="text-base font-semibold">这条去哪</h2>
            <p className="mb-3 mt-1 text-xs leading-6 text-muted-foreground">
              信息只有改变一个决定时才有用。看完选一个去处：补进某个想法还缺的那一格、记成观察、或者只是知道了就放下。
              押一个判断在上面「写判断」或往下推的某一步上。
            </p>
            <p className="mb-2 text-sm font-medium">补进想法的缺口</p>
            <RouteToGap signalId={detail.id} options={gapOptions} />
            {detail.status === "pending" && (
              <div className="mt-6">
                <p className="mb-3 text-sm text-muted-foreground">记成观察，或者只是知道了（不看了）：</p>
                <SignalActions id={detail.id} />
              </div>
            )}
          </section>
        </article>
      )}
    </PageContainer>
  );
}
