"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  MessageSquareWarning,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  addOfflineRetroSource,
  completeWeeklyPeriod,
  continueWeeklyInterview,
  generateRetroDraft,
  refreshWeeklyFinal,
  setRetroSourceIncluded,
} from "../../actions";
import type { RetroPeriodDetail } from "../../queries";
import type { WeeklyRetrospective } from "../../types";

const CAUSE_LABEL = {
  judgment: "判断",
  execution: "执行",
  environment: "环境变化",
  luck: "运气",
  unknown: "仍未知",
} as const;

export function WeeklyRetrospectiveWorkspace({
  initialPeriod,
}: {
  initialPeriod: RetroPeriodDetail;
}) {
  const router = useRouter();
  const initialDraft = (initialPeriod.final ??
    initialPeriod.draft) as WeeklyRetrospective | null;
  const [draft, setDraft] = useState(initialDraft);
  const [answer, setAnswer] = useState("");
  const [offlineLabel, setOfflineLabel] = useState("");
  const [offlineContent, setOfflineContent] = useState("");
  const [offlineContext, setOfflineContext] = useState<
    "personal" | "business" | "cross"
  >("business");
  const [rule, setRule] = useState(initialDraft?.rule ?? "");
  const [commitment, setCommitment] = useState(initialDraft?.commitment ?? "");
  const [prediction, setPrediction] = useState(initialDraft?.prediction.text ?? "");
  const [dueDate, setDueDate] = useState(initialDraft?.prediction.due_date ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function runDraft() {
    setBusy("draft");
    setError(null);
    try {
      const result = (await generateRetroDraft(
        initialPeriod.id
      )) as WeeklyRetrospective;
      applyDraft(result);
      router.refresh();
    } catch (caught) {
      console.error("生成周复盘草稿失败", caught);
      setError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      setBusy(null);
    }
  }

  function applyDraft(result: WeeklyRetrospective) {
    setDraft(result);
    setRule(result.rule);
    setCommitment(result.commitment);
    setPrediction(result.prediction.text);
    setDueDate(result.prediction.due_date);
  }

  async function question() {
    setBusy("question");
    setError(null);
    try {
      const result = await continueWeeklyInterview(
        initialPeriod.id,
        answer || undefined
      );
      setAnswer("");
      setNotice(`AI追问：${result.questions.join(" / ")}`);
      router.refresh();
    } catch (caught) {
      console.error("周复盘追问失败", caught);
      setError(caught instanceof Error ? caught.message : "追问失败");
    } finally {
      setBusy(null);
    }
  }

  async function refreshFinal() {
    setBusy("refresh");
    setError(null);
    try {
      const result = await refreshWeeklyFinal(initialPeriod.id);
      applyDraft(result);
      setNotice("已根据诊断问答更新草稿");
      router.refresh();
    } catch (caught) {
      console.error("更新周复盘失败", caught);
      setError(caught instanceof Error ? caught.message : "更新失败");
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    if (!draft) return;
    setBusy("complete");
    setError(null);
    try {
      await completeWeeklyPeriod(initialPeriod.id, {
        ...draft,
        rule,
        commitment,
        prediction: { text: prediction, due_date: dueDate },
      });
      setNotice("周复盘已完成：规则、行动和预测已进入反馈回路。");
      router.refresh();
    } catch (caught) {
      console.error("完成周复盘失败", caught);
      setError(caught instanceof Error ? caught.message : "完成失败");
    } finally {
      setBusy(null);
    }
  }

  const completed = initialPeriod.status === "completed";
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background px-4 py-7 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/retrospectives"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground"
          >
            <ArrowLeft className="size-3" />
            返回复盘首页
          </Link>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Weekly evidence audit
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">
              {initialPeriod.period_start}—{initialPeriod.period_end}
            </h1>
            {completed && (
              <Link
                href={`/retrospectives/weekly/${initialPeriod.id}/report`}
                target="_blank"
                className="text-xs text-muted-foreground hover:underline"
              >
                生成报告 ↗
              </Link>
            )}
          </div>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            恢复当时判断，再看现实。不要让结果替你重写记忆。
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:px-12">
        <aside>
          <div className="sticky top-6 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">本周期证据</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              先排除噪声，再让AI解释。
            </p>
            <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto">
              {initialPeriod.sources.length === 0 && (
                <p className="text-xs text-muted-foreground">本周没有系统记录，可继续补充线下事实。</p>
              )}
              {initialPeriod.sources.map((source) => (
                <label
                  key={source.id}
                  className="flex gap-2 rounded-md border p-2.5 text-xs"
                >
                  <input
                    type="checkbox"
                    defaultChecked={source.included}
                    disabled={completed}
                    onChange={async (event) => {
                      try {
                        await setRetroSourceIncluded(
                          initialPeriod.id,
                          source.id,
                          event.target.checked
                        );
                      } catch (caught) {
                        console.error("更新周复盘证据范围失败", caught);
                        setError(
                          caught instanceof Error ? caught.message : "更新失败"
                        );
                      }
                    }}
                  />
                  <span>
                    <span className="block font-medium">{source.label}</span>
                    <span className="mt-1 block font-mono text-[9px] uppercase text-muted-foreground">
                      {source.source_type}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {!completed && (
              <details className="mt-4 border-t pt-4">
                <summary className="cursor-pointer text-xs font-medium">
                  补充线下事件
                </summary>
                <input
                  value={offlineLabel}
                  onChange={(event) => setOfflineLabel(event.target.value)}
                  placeholder="事件标题"
                  className="mt-3 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                />
                <textarea
                  value={offlineContent}
                  onChange={(event) => setOfflineContent(event.target.value)}
                  placeholder="只写实际发生的事情"
                  className="mt-2 min-h-20 w-full rounded-md border bg-background p-2 text-xs"
                />
                <select
                  value={offlineContext}
                  onChange={(event) =>
                    setOfflineContext(
                      event.target.value as "personal" | "business" | "cross"
                    )
                  }
                  className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="personal">人生</option>
                  <option value="business">事业</option>
                  <option value="cross">人生／事业交叉</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={!offlineLabel.trim() || !offlineContent.trim()}
                  onClick={async () => {
                    try {
                      await addOfflineRetroSource(initialPeriod.id, {
                        label: offlineLabel,
                        content: offlineContent,
                        context: offlineContext,
                      });
                      setOfflineLabel("");
                      setOfflineContent("");
                      router.refresh();
                    } catch (caught) {
                      console.error("补充周复盘线下事实失败", caught);
                      setError(
                        caught instanceof Error ? caught.message : "补充失败"
                      );
                    }
                  }}
                >
                  保存线下事实
                </Button>
              </details>
            )}
            {!draft && !completed && (
              <Button
                type="button"
                className="mt-4 w-full"
                onClick={runDraft}
                disabled={busy === "draft"}
              >
                <Sparkles className="mr-2 size-4" />
                {busy === "draft" ? "正在对账…" : "生成证据对账"}
              </Button>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          {draft ? (
            <>
              <Pair title="当时以为" items={draft.expected} />
              <Pair title="实际发生" items={draft.actual} />
              <section className="rounded-lg border bg-card p-5">
                <h2 className="text-sm font-medium">差距与原因</h2>
                <div className="mt-4 space-y-3">
                  {draft.gaps.map((gap, index) => (
                    <div key={index} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm leading-6">{gap.statement}</p>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px]">
                          {CAUSE_LABEL[gap.cause]}
                        </span>
                      </div>
                      <div className="mt-2 font-mono text-[9px] text-muted-foreground">
                        {gap.evidence_ids.join(" · ") || "没有直接证据"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="grid gap-4 md:grid-cols-2">
                <Pair title="事后合理化风险" items={draft.hindsight_risks} />
                <Pair title="叙述矛盾" items={draft.contradictions} />
                <Pair title="仍然未知" items={draft.unknowns} />
                <Pair
                  title="人生／事业冲突"
                  items={draft.life_business_conflicts}
                />
              </div>

              {!completed && (
                <section className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5">
                  <div className="flex items-center gap-2">
                    <MessageSquareWarning className="size-4" />
                    <h2 className="text-sm font-medium">诊断追问</h2>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-status-validating/70">
                    回答一个关键缺口，或直接要求AI提出下一轮问题。
                  </p>
                  <textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    className="mt-3 min-h-24 w-full rounded-md border border-status-validating/30 bg-white p-3 text-sm"
                    placeholder="补充当时的真实约束、选择或证据……"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={question}
                      disabled={busy === "question"}
                    >
                      提出下一轮问题
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={refreshFinal}
                      disabled={busy === "refresh"}
                    >
                      <RefreshCcw className="mr-2 size-3.5" />
                      根据回答更新
                    </Button>
                  </div>
                </section>
              )}

              <section className="rounded-lg border bg-foreground p-5 text-background sm:p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-50">
                  Mandatory exit
                </p>
                <h2 className="mt-2 text-lg font-medium">规则、行动、预测</h2>
                <div className="mt-5 space-y-4">
                  <Field label="下次判断规则" value={rule} onChange={setRule} disabled={completed} />
                  <Field label="一个现实行动" value={commitment} onChange={setCommitment} disabled={completed} />
                  <Field label="可证伪预测" value={prediction} onChange={setPrediction} disabled={completed} />
                  <label className="block text-xs opacity-70">
                    到期日
                    <input
                      type="date"
                      value={dueDate}
                      disabled={completed}
                      onChange={(event) => setDueDate(event.target.value)}
                      className="mt-2 block rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-primary-foreground"
                    />
                  </label>
                </div>
                {!completed && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-5"
                    onClick={complete}
                    disabled={busy === "complete"}
                  >
                    <Check className="mr-2 size-4" />
                    完成周复盘
                  </Button>
                )}
              </section>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="text-sm">先确认左侧证据，再生成本周对账。</p>
            </div>
          )}

          {error ? (
            <AiErrorNotice error={error} />
          ) : notice ? (
            <p className="rounded-md border border-status-mvp/30 bg-status-mvp/10 p-3 text-sm text-status-mvp">
              {notice}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Pair({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={index} className="text-sm leading-6 text-muted-foreground">
            · {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block text-xs opacity-70">
      {label}
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-20 w-full rounded-md border border-white/20 bg-white/10 p-3 text-sm leading-6 text-primary-foreground disabled:opacity-70"
      />
    </label>
  );
}
