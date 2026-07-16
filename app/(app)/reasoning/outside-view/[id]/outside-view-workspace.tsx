"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  markOutsideViewCheckDone,
  submitOutsideViewDistinction,
} from "@/app/(app)/reasoning/actions";
import type {
  OutsideViewCheck,
  OutsideViewSessionWithItems,
  PrevalenceBucket,
} from "@/app/(app)/reasoning/types";

const PREVALENCE_LABELS: Record<PrevalenceBucket, string> = {
  most: "多数",
  many: "不少",
  some: "部分",
  few: "少数",
};

const PREVALENCE_BADGE: Record<PrevalenceBucket, string> = {
  most: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  many: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  some: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  few: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

function CheckItem({ check }: { check: OutsideViewCheck }) {
  const [done, setDone] = useState(check.is_done);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !done;
    setDone(next);
    startTransition(async () => {
      try {
        await markOutsideViewCheckDone(check.id, next);
      } catch {
        setDone(!next);
      }
    });
  }

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border p-3 transition-opacity ${
        done ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={done ? "取消完成标记" : "标记为已完成"}
        className={`mt-0.5 shrink-0 h-4 w-4 rounded border transition-colors ${
          done
            ? "border-green-500 bg-green-500 text-white"
            : "border-border hover:border-foreground/40"
        } flex items-center justify-center text-[10px]`}
      >
        {done ? "✓" : ""}
      </button>
      <p className="text-sm leading-relaxed">{check.check_text}</p>
    </div>
  );
}

export function OutsideViewWorkspace({
  session,
}: {
  session: OutsideViewSessionWithItems;
}) {
  const [distinction, setDistinction] = useState(session.user_distinctions);
  const [pushback, setPushback] = useState(session.pushback_note);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submitDistinction() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitOutsideViewDistinction(session.id, distinction);
        setPushback(result.pushback);
      } catch (err) {
        setError(err instanceof Error ? err.message : "提交失败，请重试");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <Link href="/reasoning" className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">外部视角/基础比率</h1>
          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
            {session.plan_text}
          </p>
        </div>
      </div>

      {/* 参照类别卡片 */}
      <div className="mb-8 rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            参照类别
          </p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${PREVALENCE_BADGE[session.prevalence_bucket]}`}
          >
            {PREVALENCE_LABELS[session.prevalence_bucket]}是这个结局
          </span>
        </div>
        <p className="text-sm font-medium leading-relaxed">
          {session.reference_class_label}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              最常见的结局
            </p>
            <p className="text-sm leading-relaxed">{session.dominant_pattern}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              背后的机制
            </p>
            <p className="text-sm leading-relaxed">{session.dominant_cause}</p>
          </div>
        </div>
      </div>

      {/* 案例列表 */}
      {session.examples.length > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            参照案例
          </h2>
          {session.examples.map((example) => (
            <div key={example.id} className="rounded-lg border p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    example.is_well_known
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {example.is_well_known ? "已知真实案例" : "典型模式"}
                </span>
                <p className="text-sm font-medium">{example.label}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {example.outcome_note}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 这次可能不一样 */}
      <div className="mb-8 rounded-lg border p-4 space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          我这次可能不一样，因为……
        </h2>
        <textarea
          value={distinction}
          onChange={(e) => setDistinction(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="写下你觉得你的情况和上面这类案例不同的具体理由"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={submitDistinction}
          disabled={pending || !distinction.trim()}
          className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "AI 质疑中…" : "提交给 AI 质疑"}
        </button>
        {pushback && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
              AI 的质疑
            </p>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              {pushback}
            </p>
          </div>
        )}
      </div>

      {/* 检验行动 */}
      {session.checks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            可以立刻去做的检验行动
          </h2>
          {session.checks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}
