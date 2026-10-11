"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIDENCE_LEVELS,
  HORIZONS,
  type ConfidenceKey,
  type HorizonKey,
} from "@/lib/domains/signals/practice-shared";
import {
  resolveJudgmentAction,
  retryJudgmentFeedbackAction,
  submitJudgmentAction,
} from "./actions";

/**
 * 先写判断。提交后页面刷新，AI 的分析和挑刺才出现。
 * 摩擦要低：一句话 + 选个期限就能交，把握度可以不选。
 */
export function JudgmentForm({
  signalId,
  question,
  questionLabel,
  initialJudgment = "",
  submitLabel = "写下，然后看答案",
}: {
  signalId: string;
  /** 存进账本的问题。 */
  question: string;
  /** 界面上显示的问题；不给就显示 question。 */
  questionLabel?: string;
  /** 预填的判断（押推论时预填那一步的结论，用户可以改）。 */
  initialJudgment?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [judgment, setJudgment] = useState(initialJudgment);
  const [horizon, setHorizon] = useState<HorizonKey>("3m");
  const [confidence, setConfidence] = useState<ConfidenceKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await submitJudgmentAction({ signalId, question, judgment, horizon, confidence });
          if (result.ok) {
            setError(null);
            router.refresh();
          } else setError(result.message);
        });
      }}
    >
      <p className="text-base font-medium leading-8">{questionLabel ?? question}</p>
      <Textarea
        className="mt-3"
        value={judgment}
        onChange={(e) => setJudgment(e.target.value)}
        placeholder="写一句你的判断。粗糙没关系，要的是你自己的，不是查来的。"
        rows={3}
        maxLength={300}
      />

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 text-muted-foreground">什么时候对账</span>
          {(Object.keys(HORIZONS) as HorizonKey[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={horizon === key ? "secondary" : "ghost"}
              onClick={() => setHorizon(key)}
            >
              {HORIZONS[key].label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 text-muted-foreground">有多大把握</span>
          {(Object.keys(CONFIDENCE_LEVELS) as ConfidenceKey[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={confidence === key ? "secondary" : "ghost"}
              onClick={() => setConfidence(confidence === key ? null : key)}
            >
              {CONFIDENCE_LEVELS[key].label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">可以不选</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4">
        <Button type="submit" disabled={pending || judgment.trim().length < 4}>
          {pending ? "记下了，AI 在挑刺…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** 到期对账：看对了 / 看错了，可以补一句。 */
export function ResolveJudgment({ predictionId }: { predictionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resolve = (outcome: "hit" | "miss") =>
    startTransition(async () => {
      try {
        await resolveJudgmentAction(predictionId, outcome, note);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "没记上");
      }
    });

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="现在实际怎样了？一句话（可以不写）"
        maxLength={200}
      />
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve("hit")}>
          看对了
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve("miss")}>
          看错了
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function RetryFeedback({ judgmentId }: { judgmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="text-sm">
      <p className="text-muted-foreground">AI 的挑刺这次没生成出来，判断已经记下了。</p>
      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryJudgmentFeedbackAction(judgmentId);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "在挑刺…" : "再试一次"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
