"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  completeMonthlyPeriod,
  generateRetroDraft,
  setRetroSourceIncluded,
} from "../../actions";
import type { RetroPeriodDetail } from "../../queries";
import type { MonthlyRetrospective } from "../../types";

export function MonthlyRetrospectiveWorkspace({
  initialPeriod,
  activeRules,
}: {
  initialPeriod: RetroPeriodDetail;
  activeRules: { id: string; text: string }[];
}) {
  const router = useRouter();
  const initialDraft = (initialPeriod.final ??
    initialPeriod.draft) as MonthlyRetrospective | null;
  const [draft, setDraft] = useState(initialDraft);
  const [ruleId, setRuleId] = useState(
    initialDraft?.rule_decision.rule_id ?? activeRules[0]?.id ?? ""
  );
  const [action, setAction] = useState<"keep" | "revise" | "retire">(
    initialDraft?.rule_decision.action ?? "keep"
  );
  const [ruleText, setRuleText] = useState(
    initialDraft?.rule_decision.text ?? activeRules[0]?.text ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const completed = initialPeriod.status === "completed";

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const result = (await generateRetroDraft(
        initialPeriod.id
      )) as MonthlyRetrospective;
      setDraft(result);
      setRuleId(result.rule_decision.rule_id);
      setAction(result.rule_decision.action);
      setRuleText(result.rule_decision.text);
      router.refresh();
    } catch (caught) {
      console.error("生成月复盘失败", caught);
      setError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await completeMonthlyPeriod(initialPeriod.id, {
        ...draft,
        rule_decision: { action, rule_id: ruleId, text: ruleText },
      });
      setNotice("月复盘已完成，判断规则历史已保留。");
      router.refresh();
    } catch (caught) {
      console.error("完成月复盘失败", caught);
      setError(caught instanceof Error ? caught.message : "完成失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5]">
      <header className="border-b bg-background px-4 py-7 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <Link href="/retrospectives" className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowLeft className="size-3" />
            返回复盘首页
          </Link>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Monthly pattern correction
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            {initialPeriod.period_start.slice(0, 7)} 判断模式
          </h1>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:px-12">
        <aside>
          <div className="sticky top-6 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">已完成周复盘</h2>
            <div className="mt-4 space-y-2">
              {initialPeriod.sources.map((source) => (
                <label key={source.id} className="flex gap-2 rounded-md border p-2.5 text-xs">
                  <input
                    type="checkbox"
                    defaultChecked={source.included}
                    disabled={completed}
                    onChange={(event) =>
                      setRetroSourceIncluded(
                        initialPeriod.id,
                        source.id,
                        event.target.checked
                      ).catch((caught) =>
                        {
                          console.error("更新月复盘证据范围失败", caught);
                          setError(
                            caught instanceof Error ? caught.message : "更新失败"
                          );
                        }
                      )
                    }
                  />
                  <span>{source.label}</span>
                </label>
              ))}
            </div>
            {!draft && !completed && (
              <Button type="button" className="mt-4 w-full" onClick={generate} disabled={busy}>
                <Sparkles className="mr-2 size-4" />
                生成月度模式
              </Button>
            )}
          </div>
        </aside>

        <section className="space-y-6">
          {draft ? (
            <>
              <section className="rounded-lg border bg-card p-5">
                <h2 className="text-sm font-medium">重复模式与反例</h2>
                <div className="mt-4 space-y-4">
                  {draft.repeated_patterns.map((pattern, index) => (
                    <article key={index} className="border-l-2 border-foreground pl-4">
                      <p className="text-sm font-medium">{pattern.pattern}</p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        反例：{pattern.counterexamples.join("；") || "没有找到"}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <div className="grid gap-4 md:grid-cols-2">
                <List title="已失效规则" items={draft.invalidated_rules} />
                <List title="人生／事业冲突" items={draft.life_business_conflicts} />
              </div>
              <section className="rounded-lg border bg-foreground p-6 text-background">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-50">
                  One focus
                </div>
                <p className="mt-3 text-lg leading-7">{draft.only_focus}</p>
              </section>
              <section className="rounded-lg border bg-card p-5">
                <h2 className="text-sm font-medium">判断规则决定</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <select
                    value={ruleId}
                    disabled={completed}
                    onChange={(event) => {
                      setRuleId(event.target.value);
                      setRuleText(
                        activeRules.find((rule) => rule.id === event.target.value)?.text ?? ""
                      );
                    }}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {activeRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.text}
                      </option>
                    ))}
                  </select>
                  <select
                    value={action}
                    disabled={completed}
                    onChange={(event) =>
                      setAction(event.target.value as "keep" | "revise" | "retire")
                    }
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="keep">保留</option>
                    <option value="revise">改写</option>
                    <option value="retire">废止</option>
                  </select>
                </div>
                <textarea
                  value={ruleText}
                  disabled={completed || action !== "revise"}
                  onChange={(event) => setRuleText(event.target.value)}
                  className="mt-3 min-h-24 w-full rounded-md border bg-background p-3 text-sm disabled:bg-muted"
                />
                {!completed && (
                  <Button type="button" className="mt-4" onClick={complete} disabled={busy}>
                    <Check className="mr-2 size-4" />
                    完成月复盘
                  </Button>
                )}
              </section>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm">
              先确认纳入哪些周复盘。
            </div>
          )}
          {error ? (
            <AiErrorNotice error={error} />
          ) : notice ? (
            <p className="text-sm text-status-mvp">{notice}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={index}>· {item}</li>
        ))}
      </ul>
    </section>
  );
}
