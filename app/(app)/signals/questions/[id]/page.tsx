import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { formatTokyoTime } from "@/lib/domains/signals/format";
import { knownTags, listJudgments, listQuestionBets } from "@/lib/domains/signals/practice";
import {
  articleOutline,
  flattenEvidence,
  getQuestion,
  listRelatedReports,
  questionBetQuestion,
} from "@/lib/domains/signals/questions";
import { formatReportDate } from "@/lib/domains/signals/format";
import { AnalogItem, HistoryView } from "../../history-panel";
import { EvidenceList } from "../../inference-tree";
import { JudgmentForm } from "../../judgment-forms";
import { JudgmentView } from "../../judgment-view";
import {
  ArchiveQuestionButton,
  CriterionForm,
  OutlinePanel,
  RemoveUserAnalogButton,
  ResearchButton,
  UserAnalogForm,
  ViewForm,
} from "../question-forms";

export const dynamic = "force-dynamic";
// 查一轮要拆问题、分头上网查、列关键因素、核实历史参照
export const maxDuration = 60;

export default async function QuestionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const question = await getQuestion(user.id, params.id);
  if (question === "missing-schema") {
    return (
      <PageContainer width="narrow">
        <p className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm leading-7 text-status-validating">
          数据库还差一步：迁移 059 没跑。执行 supabase/migrations/059_signal_questions.sql 之后再来。
        </p>
      </PageContainer>
    );
  }
  if (!question) notFound();

  const [bets, allJudgments, related] = await Promise.all([
    listQuestionBets(user.id, question.id),
    listJudgments(user.id).catch(() => []),
    listRelatedReports(user.id, question.id).catch(() => []),
  ]);
  const current = question.views[0];
  const research = question.research;
  const evidence = research ? flattenEvidence(research) : [];
  // 这一轮是照着旧看法查的：支持/反对是相对旧看法说的，要提醒他
  const staleView = research && current && research.basedOnView !== current.view;

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link
          href="/signals/questions"
          className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          ← 我在追的问题
        </Link>
      </p>
      <PageHeader eyebrow="Question" title={question.question} />
      <div className="mb-8">
        <CriterionForm questionId={question.id} initial={question.criterion} />
      </div>

      {/* 看法：先写自己的，再看 AI 查到的 */}
      <section className="mb-10">
        <h2 className="text-base font-semibold">你现在的看法</h2>
        {current ? (
          <>
            <p className="mt-2 border-l-2 border-primary pl-3 text-base font-medium leading-8">{current.view}</p>
            {current.reason && <p className="mt-1 text-sm leading-7 text-muted-foreground">为什么：{current.reason}</p>}
            <p className="mt-1 font-mono text-xs text-muted-foreground">{formatTokyoTime(current.created_at)} 写的</p>
            {question.views.length > 1 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  之前的看法（改过 {question.views.length - 1} 次）
                </summary>
                <ol className="mt-2 space-y-3 border-l-2 border-border pl-3">
                  {question.views.slice(1).map((v) => (
                    <li key={v.id} className="leading-7">
                      <span className="font-mono text-xs text-muted-foreground">{formatTokyoTime(v.created_at)}</span>
                      <p>{v.view}</p>
                      {v.reason && <p className="text-muted-foreground">为什么：{v.reason}</p>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <div className="mt-4">
              <ViewForm questionId={question.id} hasView />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              还没写。先凭直觉写一版再让 AI 去查 —— 没有自己的看法，查到的东西就分不出哪条在支持你、哪条在打你的脸。
              实在没思路，也可以先让 AI 查一轮，看完再写。
            </p>
            <div className="mt-3">
              <ViewForm questionId={question.id} hasView={false} />
            </div>
          </>
        )}
      </section>

      {/* 每日报告里碰到的 */}
      <section className="mb-10">
        <h2 className="text-base font-semibold">每日报告里碰到的</h2>
        {related.length === 0 ? (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            这里空着。之后每天的报告里，直接关系到这个问题的新闻会在这里攒起来 —— 宁缺毋滥，沾边的不算。
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              最近两个月的报告里，有 {related.length} 条直接关系到这个问题。看完想想：你的看法要不要改？
            </p>
            <ul className="mt-3 space-y-3">
              {related.map((r) => (
                <li key={r.signal_id} className="border-l-2 border-border pl-3 leading-7">
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatReportDate(r.brief_date)} · {r.source}
                  </p>
                  <Link
                    href={`/signals/${r.signal_id}`}
                    className="text-base transition-colors duration-150 hover:text-primary"
                  >
                    {r.headline}
                  </Link>
                  <p className="text-sm text-muted-foreground">{r.why}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* AI 查到的 */}
      <section className="mb-10">
        <h2 className="text-base font-semibold">AI 查到的</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          先把你的问题拆成几个小问题，每个小问题正反两个方向各上网搜一次；摘出来的原文都核对过确实在网页里。
          {research ? ` 上次查：${formatTokyoTime(question.researched_at)}。` : ""}
        </p>
        <div className="mt-3">
          <ResearchButton questionId={question.id} label={research ? "再查一轮" : "让 AI 查一轮"} />
        </div>
        {staleView && (
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            这一轮是照着你之前的看法查的，下面的「支持、反对」说的是那一版。看法改了，再查一轮。
          </p>
        )}
        {research && !research.basedOnView && evidence.length > 0 && (
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            查的时候你还没写看法，所以证据都标成「背景」，没分支持和反对。
          </p>
        )}

        {research && (
          <div className="mt-6 space-y-8">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">拆成了这几个小问题</h3>
              <ol className="mt-2 space-y-4">
                {research.subQuestions.map((s, i) => (
                  <li key={i} className="border-l-2 border-border pl-3">
                    <p className="text-base leading-8">{s.question}</p>
                    {s.evidence.length > 0 ? (
                      <EvidenceList evidence={s.evidence} />
                    ) : (
                      <p className="text-sm text-muted-foreground">这一个没查到对得上的资料。</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {research.keyFactors.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">决定答案的几个因素</h3>
                <ul className="mt-2 space-y-4">
                  {research.keyFactors.map((f, i) => (
                    <li key={i} className="border-l-2 border-border pl-3 leading-7">
                      <p className="text-base font-medium">{f.factor}</p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">现在：</span>
                        {f.now}
                        {f.evidence.length > 0 && (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">
                            （依据 {f.evidence.map((n) => `#${n}`).join(" ")}）
                          </span>
                        )}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">出现这种情况就变了：</span>
                        {f.watch}
                      </p>
                    </li>
                  ))}
                </ul>
                {evidence.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">依据编号对应哪条</summary>
                    <ol className="mt-1 space-y-1 leading-6 text-muted-foreground">
                      {evidence.map((e, i) => (
                        <li key={i}>
                          #{i + 1} {e.fact}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}

            {research.history && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">历史上类似的事（拿来当基准）</h3>
                <HistoryView history={research.history} />
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-muted-foreground">你想到的类比</h3>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                你脑子里冒出来的「这跟那次很像」，往往比 AI 找的更贴。写一句是哪一次，AI 展开、上网核实，再写出像和不像。
                它不算进上面的「这类事通常会怎样」，免得你的直觉替自己作证。
              </p>
              {(research.userAnalogs ?? []).length > 0 && (
                <ol className="mt-3 space-y-4">
                  {(research.userAnalogs ?? []).map((a, i) => (
                    <li key={i} className="border-l-2 border-primary pl-3">
                      <AnalogItem analog={a} />
                      <RemoveUserAnalogButton questionId={question.id} index={i} />
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-3">
                <UserAnalogForm questionId={question.id} />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 押进账本 */}
      <section className="mb-10">
        <h2 className="text-base font-semibold">押进判断账本</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          把看法里能检验的那一部分写成一句话，定个对账的日子。五年太远，挑一个几个月内就能看出苗头的。
        </p>
        {bets.length > 0 && (
          <ul className="mt-4 space-y-6">
            {bets.map((b) => (
              <li key={b.id}>
                <JudgmentView judgment={b} showQuestion={false} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <JudgmentForm
            questionId={question.id}
            question={questionBetQuestion(`${question.question}（${new Date().toISOString().slice(0, 10)}）`)}
            questionLabel="几个月后能说清对错的一句话"
            initialJudgment=""
            submitLabel="押进账本"
            knownTags={knownTags(allJudgments)}
          />
        </div>
      </section>

      {/* 每周一篇 */}
      <section className="mb-10">
        <h2 className="text-base font-semibold">整理成一篇</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          照着这个骨架写每周那一篇。它只搬了你的看法和查到的东西，观点要你自己写 —— 写给别人看，最能逼自己想清楚。
        </p>
        <div className="mt-3">
          <OutlinePanel outline={articleOutline(question)} />
        </div>
      </section>

      <ArchiveQuestionButton questionId={question.id} />
    </PageContainer>
  );
}
