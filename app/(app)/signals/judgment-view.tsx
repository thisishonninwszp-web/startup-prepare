import { CONFIDENCE_LEVELS, type JudgmentRow } from "@/lib/domains/signals/practice-shared";
import { RetryFeedback } from "./judgment-forms";

const DATE = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });

export function formatDueDate(iso: string): string {
  return DATE.format(new Date(iso));
}

function confidenceLabel(value: number | null): string | null {
  if (value === null) return null;
  const level = Object.values(CONFIDENCE_LEVELS).find((l) => l.value === value);
  return level?.label ?? null;
}

export function outcomeLabel(outcome: JudgmentRow["outcome"]): string {
  return outcome === "hit" ? "看对了" : outcome === "miss" ? "看错了" : "还在等";
}

/** 写过的判断 + AI 的挑刺。判断在上、挑刺在下：先看清自己写了什么，再看别人怎么拆。 */
export function JudgmentView({ judgment, showQuestion = true }: { judgment: JudgmentRow; showQuestion?: boolean }) {
  const confidence = confidenceLabel(judgment.confidence);
  return (
    <div>
      {showQuestion && <p className="text-sm text-muted-foreground">{judgment.question}</p>}
      <p className="mt-2 border-l-2 border-primary pl-3 text-base font-medium leading-8">{judgment.judgment}</p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {formatDueDate(judgment.due_at)} 对账{confidence ? ` · ${confidence}` : ""}
        {judgment.outcome !== "pending" ? ` · ${outcomeLabel(judgment.outcome)}` : ""}
      </p>
      {judgment.note && <p className="mt-1 text-sm leading-7">后来：{judgment.note}</p>}

      <div className="mt-5">
        {judgment.feedback ? (
          <dl className="space-y-4 text-base leading-8">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">你没提到的</dt>
              <dd>{judgment.feedback.missed}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">怎么写才能到时候说清对错</dt>
              <dd>{judgment.feedback.sharpen}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">最可能让你看错的理由</dt>
              <dd>{judgment.feedback.counter}</dd>
            </div>
          </dl>
        ) : (
          <RetryFeedback judgmentId={judgment.id} />
        )}
      </div>
    </div>
  );
}
