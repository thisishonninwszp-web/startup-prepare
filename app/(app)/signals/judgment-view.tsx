import { CONFIDENCE_LEVELS, displayQuestion, JUDGMENT_MODE_LABELS, type JudgmentRow } from "@/lib/domains/signals/practice-shared";
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
      {showQuestion && <p className="text-sm text-muted-foreground">{displayQuestion(judgment.question)}</p>}
      <p className="mt-2 border-l-2 border-primary pl-3 text-base font-medium leading-8">{judgment.judgment}</p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {/* 099 没跑时不知道来路（undefined），不标 */}
        {judgment.mode !== undefined ? `${JUDGMENT_MODE_LABELS[judgment.mode ?? "blind"]} · ` : ""}
        {formatDueDate(judgment.due_at)} 对账{confidence ? ` · ${confidence}` : ""}
        {judgment.outcome !== "pending" ? ` · ${outcomeLabel(judgment.outcome)}` : ""}
        {judgment.tags.length > 0 ? ` · ${judgment.tags.map((t) => `#${t}`).join(" ")}` : ""}
      </p>
      {judgment.note && <p className="mt-1 text-sm leading-7">后来：{judgment.note}</p>}

      <div className="mt-5">
        {judgment.mode === "agree" ? (
          // 点「行」同意 AI 的不挑刺：AI 挑自己的刺是车轱辘
          <p className="text-sm leading-7 text-muted-foreground">这是你点「行」同意的 AI 判断，不挑刺。到期对账时，对了错了说的是 AI 准不准。</p>
        ) : judgment.feedback ? (
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
