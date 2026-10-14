"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIDENCE_LEVELS,
  HORIZONS,
  LONG_HORIZONS,
  LONG_JUDGMENT_DAYS,
  MISS_REASONS,
  deadlineDays,
  deadlineLabel,
  normalizeTags,
  type MissReason,
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
  questionId,
  question,
  questionLabel,
  initialJudgment = "",
  submitLabel = "写下，然后看答案",
  knownTags = [],
  defaultHorizon = "3m",
  deadline,
  initialTags = [],
  onSubmitted,
}: {
  /** 预填的标签（比如从历史题押过来的，带上「历史题」）。 */
  initialTags?: string[];
  /** 给了就在押下之后调它、不刷新整页（历史题揭晓页一刷新就跳到下一道了）。 */
  onSubmitted?: () => void;
  /** 默认选哪一档期限（练习题按题目里写的时间点给）。 */
  defaultHorizon?: HorizonKey;
  /** 题目里写了"到某年某月底"：多一个"按题目里的日子"选项，默认选它（YYYY-MM-DD）。 */
  deadline?: string;
  /** 对着一条新闻下的判断。和 questionId 二选一。 */
  signalId?: string;
  /** 对着自己在追的问题下的判断。 */
  questionId?: string;
  /** 用过的标签，给出来点选。 */
  knownTags?: string[];
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
  const [horizon, setHorizon] = useState<HorizonKey>(defaultHorizon);
  // 题目里写了日子就默认按它对账：问"到明年底"却一个月后对账，对不上
  const [byDeadline, setByDeadline] = useState(!!deadline);
  const isLong = byDeadline && deadline ? deadlineDays(deadline) > LONG_JUDGMENT_DAYS : LONG_HORIZONS.includes(horizon);
  const [confidence, setConfidence] = useState<ConfidenceKey | null>(null);
  const [tagText, setTagText] = useState(initialTags.join(" "));
  const [milestone, setMilestone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tags = normalizeTags(tagText);
  const toggleTag = (tag: string) =>
    setTagText((tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]).join(" "));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await submitJudgmentAction({
            signalId,
            questionId,
            question,
            judgment,
            horizon,
            confidence,
            tags,
            milestone: isLong ? milestone : undefined,
            dueDate: byDeadline ? deadline : undefined,
          });
          if (result.ok) {
            setError(null);
            if (onSubmitted) onSubmitted();
            else router.refresh();
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

      {/* 手机上标题单独一行、三个选项等宽排开；宽屏时标题和选项在同一行 */}
      <div className="mt-4 space-y-4 text-sm sm:space-y-3">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="shrink-0 text-muted-foreground sm:w-24">什么时候对账</span>
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            {deadline && (
              <Button
                type="button"
                size="sm"
                className="col-span-3 h-10 sm:h-8"
                variant={byDeadline ? "secondary" : "ghost"}
                onClick={() => setByDeadline(true)}
              >
                按题目：{deadlineLabel(deadline)}
              </Button>
            )}
            {(Object.keys(HORIZONS) as HorizonKey[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                className="h-10 sm:h-8"
                variant={!byDeadline && horizon === key ? "secondary" : "ghost"}
                onClick={() => {
                  setHorizon(key);
                  setByDeadline(false);
                }}
              >
                {HORIZONS[key].label}
              </Button>
            ))}
          </div>
        </div>
        {isLong && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
            <span className="shrink-0 text-muted-foreground sm:w-24 sm:pt-1.5">中途的苗头</span>
            <div className="flex-1">
              <Input
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
                placeholder="半年内能看到什么迹象，说明你在朝对的方向走？（可以不填）"
                maxLength={200}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {byDeadline && deadline ? `要等到${deadlineLabel(deadline)}` : `要等${HORIZONS[horizon].label.replace("后", "")}`}
                才能对账，太久了。填了就自动多押一条半年后对账的，中途也有反馈。
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="shrink-0 text-muted-foreground sm:w-24">
            有多大把握<span className="ml-2 text-xs sm:hidden">可以不选</span>
          </span>
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
            {(Object.keys(CONFIDENCE_LEVELS) as ConfidenceKey[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                className="h-10 sm:h-8"
                variant={confidence === key ? "secondary" : "ghost"}
                onClick={() => setConfidence(confidence === key ? null : key)}
              >
                {CONFIDENCE_LEVELS[key].label}
              </Button>
            ))}
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">可以不选</span>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
          <span className="shrink-0 text-muted-foreground sm:w-24 sm:pt-1.5">
            标签<span className="ml-2 text-xs">可以不填</span>
          </span>
          <div className="flex-1">
            <Input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="空格分开，比如：中国做法 日本经济"
              maxLength={80}
            />
            {knownTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {knownTags.slice(0, 12).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    className="h-8"
                    variant={tags.includes(t) ? "secondary" : "ghost"}
                    onClick={() => toggleTag(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4">
        <Button type="submit" className="h-11 w-full sm:h-9 sm:w-auto" disabled={pending || judgment.trim().length < 4}>
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
  const [askingWhy, setAskingWhy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = (outcome: "hit" | "miss", reason?: MissReason) =>
    startTransition(async () => {
      try {
        await resolveJudgmentAction(predictionId, outcome, note, reason);
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
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setAskingWhy(true)}>
          看错了
        </Button>
      </div>
      {askingWhy && (
        <div className="basis-full rounded-md bg-muted/50 p-3 text-sm sm:mt-1">
          <p className="mb-2 text-muted-foreground">错在哪一步？选最接近的一个：</p>
          <div className="flex flex-col gap-1.5">
            {(Object.keys(MISS_REASONS) as MissReason[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant="ghost"
                className="h-auto justify-start whitespace-normal py-1.5 text-left"
                disabled={pending}
                onClick={() => resolve("miss", r)}
              >
                {MISS_REASONS[r]}
              </Button>
            ))}
          </div>
        </div>
      )}
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
