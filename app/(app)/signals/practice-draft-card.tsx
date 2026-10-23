"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { pct, SOURCE_LABELS } from "@/lib/domains/signals/forecast-shared";
import { CONFIDENCE_LEVELS, deadlineLabel, draftVerdict, HORIZONS, type HorizonKey, type PracticeDraft } from "@/lib/domains/signals/practice-shared";
import { submitJudgmentAction } from "./actions";
import { JudgmentForm } from "./judgment-forms";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

/**
 * 每天的练习（经用户明确裁决，2026-10-23）：AI 先判好一句，他点「行」原样记进判断账本（不挑刺），
 * 点「不行」方向反过来、他可以改期限把握、在那句后面接着写为什么，交了照旧挑刺；「跳过」只在这一页收起。
 */
export function PracticeDraftCard({
  date,
  signalId,
  question,
  draft,
  knownTags,
  defaultHorizon,
  deadline,
}: {
  /** 这道题是哪一天报告里的（AI 先判存在那一天的报告里，服务器按它读）。 */
  date: string;
  signalId: string;
  question: string;
  draft: PracticeDraft;
  knownTags: string[];
  defaultHorizon: HorizonKey;
  deadline?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "override" | "skipped">("idle");
  const v = draftVerdict(draft.probability, question);
  const flipped = draftVerdict(draft.probability, question, true);
  const due = deadline ? `到${deadlineLabel(deadline)}` : HORIZONS[defaultHorizon].label;

  // 「行」：期限照页面替他选好的那档（题目里写了日子就按日子），句子和把握服务器照 AI 的
  const agree = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await submitJudgmentAction({
          signalId,
          question,
          judgment: "",
          horizon: defaultHorizon,
          confidence: null,
          tags: [],
          dueDate: deadline,
          draft: { date, mode: "agree" },
        });
        if (r.ok) router.refresh();
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });

  if (mode === "skipped") {
    return <p className="mt-4 text-sm leading-7 text-muted-foreground">今天这道不判了。想判的时候刷新一下页面。</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-base leading-8">
        <span className="text-muted-foreground">AI：</span>
        <span className="font-medium">{v.will ? "会" : "不会"}</span>
        <span className="text-muted-foreground"> · {CONFIDENCE_LEVELS[v.confidence].label}（{due}对账）</span>
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">为什么（三种思路各说了几成）</summary>
        <ul className="mt-1 space-y-1">
          {draft.perspectives.map((x) => (
            <li key={x.source}>
              <span className="font-mono text-muted-foreground">
                {SOURCE_LABELS[x.source]} {pct(x.probability)}
              </span>
              <span className="ml-1">{x.reason}</span>
            </li>
          ))}
        </ul>
      </details>
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={agree}>
            {pending ? "在记……" : "行"}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("override")}>
            不行，我觉得{flipped.will ? "会" : "不会"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode("skipped")}>
            跳过
          </Button>
        </div>
      )}
      {mode === "override" && (
        <div className="rounded-md border border-border bg-background p-4">
          <p className="mb-2 text-xs leading-6 text-muted-foreground">句子替你反过来了，后面可以接着写为什么。交了 AI 会挑刺。</p>
          <JudgmentForm
            signalId={signalId}
            question={question}
            questionLabel="你的判断"
            knownTags={knownTags}
            defaultHorizon={defaultHorizon}
            deadline={deadline}
            initialJudgment={flipped.sentence}
            submitLabel="改判，记下"
            draft={{ date, mode: "override" }}
          />
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setMode("idle")}>
            算了，回去
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs leading-6 text-muted-foreground">点「行」不算你的分 —— 那是 AI 的判断，你认可了。周一那道你先自己判。</p>
    </div>
  );
}
