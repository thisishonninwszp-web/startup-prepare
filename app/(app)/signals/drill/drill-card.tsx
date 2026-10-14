"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DRILL_FLAGS, drillHit, type AnsweredDrill, type DrillFlag, type OpenDrill } from "@/lib/domains/signals/drills-shared";
import { CONFIDENCE_LEVELS, MISS_REASONS, type ConfidenceKey, type MissReason } from "@/lib/domains/signals/practice-shared";
import {
  answerDrillAction,
  flagDrillAction,
  generateDrillsAction,
  markReasonMatchAction,
  setDrillMissReasonAction,
} from "../actions";
import { JudgmentForm } from "../judgment-forms";

/**
 * 你当时的理由 vs 实际是什么决定的，并排摆着，你自己标对上没有。
 * 猜对了但理由没对上，其实是运气 —— 下次照样会错。
 */
function ReasonCheck({ drill }: { drill: AnsweredDrill }) {
  const [match, setMatch] = useState<boolean | null>(drill.reason_match);
  const [judge, setJudge] = useState<boolean | null>(drill.reason_judge);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!drill.decided_by) {
    return <p className="mt-2 text-xs text-muted-foreground">资料里没写清是什么决定了结果，这一道没法对理由。</p>;
  }
  const mark = (value: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await markReasonMatchAction(drill.id, value);
      if (result.ok) {
        setMatch(value);
        setJudge(result.judge);
      } else setError(result.message);
    });
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p>
        <span className="text-muted-foreground">实际是这件事决定的：</span>
        {drill.decided_by}
      </p>
      {drill.decided_basis && drill.decided_basis.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">原文</summary>
          <ul className="mt-1 space-y-1">
            {drill.decided_basis.map((b, i) => (
              <li key={i} className="text-muted-foreground">
                「{b.excerpt}」
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                  {b.title || "来源"} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-1">
        <span className="text-muted-foreground">你当时的理由：</span>
        {drill.reasoning ?? "（没写）"}
      </p>
      {!drill.reasoning ? (
        <p className="mt-1 text-xs text-muted-foreground">下次写一句理由，揭晓时才能拿它和实际原因对照。</p>
      ) : match === null ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => mark(true)}>
            我的理由对上了
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => mark(false)}>
            没对上
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          你标了：{match ? "理由对上了" : "理由没对上"}
          {!match && drillHit(drill) ? " —— 猜对了，但这次是运气。" : ""}
          {match && !drillHit(drill) ? " —— 判断没毛病，是结果有变数。" : ""}
        </p>
      )}
      {match !== null && judge !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          另一个模型单独看了一遍：{judge ? "对上了" : "没对上"}
          {judge !== match ? "（和你标的不一样 —— 回头看看是谁看松了）" : "（和你标的一样）"}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** 揭晓：猜对没有、实际发生了什么、出处，再对一下理由。 */
export function DrillReveal({ drill }: { drill: AnsweredDrill }) {
  const hit = drillHit(drill);
  return (
    <div className="mt-3 rounded-md bg-muted/50 p-4 text-sm leading-7">
      <p className={"font-medium " + (hit ? "text-verdict-go" : "text-verdict-learned")}>
        {hit ? "猜对了" : "猜错了"}：你猜「{drill.guess ? "会" : "不会"}」，实际是「{drill.answer ? "会" : "不会"}」
      </p>
      {drill.criterion && (
        <p className="mt-1 text-xs text-muted-foreground">按这个标准判的：{drill.criterion}</p>
      )}
      <p className="mt-1">
        <span className="text-muted-foreground">实际发生的：</span>
        {drill.what_happened}
      </p>
      {drill.why_similar && (
        <p className="mt-1">
          <span className="text-muted-foreground">和你在看的那件事：</span>
          {drill.why_similar}
        </p>
      )}
      {drill.source_check.status === "corrected" && drill.source_check.correction && (
        <p className="mt-1 text-xs text-muted-foreground">出题时记错了，已按原文改正：{drill.source_check.correction}</p>
      )}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-muted-foreground">出处（原文逐字核对过）</summary>
        <ul className="mt-1 space-y-2">
          {drill.source_check.basis.map((b, i) => (
            <li key={i} className="text-muted-foreground">
              「{b.excerpt}」
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                {b.title || "来源"} ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
      <ReasonCheck drill={drill} />
      {!hit && <MissReasonPick drill={drill} />}
      <TodayBridge drill={drill} />
    </div>
  );
}

/** 猜错了：错在哪一步（和判断账本同一套五类，合在一起数）。 */
function MissReasonPick({ drill }: { drill: AnsweredDrill }) {
  const [reason, setReason] = useState<MissReason | null>(drill.miss_reason);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (reason) return <p className="mt-2 text-xs text-muted-foreground">错在：{MISS_REASONS[reason]}</p>;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-muted-foreground">错在哪一步？选最接近的一个（和判断账本合在一起数）：</p>
      <div className="flex flex-col gap-1.5">
        {(Object.keys(MISS_REASONS) as MissReason[]).map((r) => (
          <Button
            key={r}
            size="sm"
            variant="ghost"
            className="h-auto justify-start whitespace-normal py-1.5 text-left"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await setDrillMissReasonAction(drill.id, r);
                if (result.ok) setReason(r);
                else setError(result.message);
              })
            }
          >
            {MISS_REASONS[r]}
          </Button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** 回到今天：今天那件事会不会也这样？押一条，进判断账本，到期对账。 */
function TodayBridge({ drill }: { drill: AnsweredDrill }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (!drill.today_question || !(drill.topic_signal_id || drill.topic_question_id)) return null;
  if (done) return <p className="mt-3 text-sm text-primary">押进判断账本了，到期回来对账。</p>;
  return (
    <div className="mt-3 border-t border-border pt-3">
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          今天那件事会不会也这样？押一条
        </Button>
      ) : (
        <div className="rounded-md bg-background p-4">
          <JudgmentForm
            signalId={drill.topic_signal_id ?? undefined}
            questionId={drill.topic_signal_id ? undefined : (drill.topic_question_id ?? undefined)}
            question={drill.today_question}
            initialTags={["历史题"]}
            submitLabel="押下，进判断账本"
            onSubmitted={() => setDone(true)}
          />
        </div>
      )}
    </div>
  );
}

/** 还没答的一道：猜会不会、选把握、写一句为什么，交了马上揭晓。 */
/** 答完这一道后，攒着的少于这么多就在后台出下一批（出一批三四十秒，免得干等）。 */
const REFILL_BELOW = 2;

export function DrillCard({ drill, remaining }: { drill: OpenDrill; remaining: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refilling, setRefilling] = useState(false);
  const [refillError, setRefillError] = useState<string | null>(null);

  // 后台出下一批：他在看揭晓的时候就在出，不等他点"下一道"
  const refill = async () => {
    setRefilling(true);
    setRefillError(null);
    const result = await generateDrillsAction();
    if (!result.ok) setRefillError(result.message);
    setRefilling(false);
  };
  const [guess, setGuess] = useState<boolean | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceKey | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [revealed, setRevealed] = useState<AnsweredDrill | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skip = (flag: DrillFlag) =>
    startTransition(async () => {
      setError(null);
      const result = await flagDrillAction(drill.id, flag);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  const submit = () =>
    startTransition(async () => {
      if (guess === null) return;
      setError(null);
      const result = await answerDrillAction(drill.id, guess, confidence, reasoning);
      if (result.ok) {
        setRevealed(result.drill);
        if (remaining < REFILL_BELOW) void refill();
      } else setError(result.message);
    });

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      {drill.topic && <p className="text-xs leading-6 text-muted-foreground">和你最近在看的这件事像：{drill.topic}</p>}
      <p className="mt-2 text-sm leading-7">{drill.setup}</p>
      <p className="mt-3 border-l-2 border-primary pl-3 text-base font-medium leading-8">{drill.question}</p>
      {drill.criterion && (
        <p className="mt-1 pl-3 text-sm leading-7 text-muted-foreground">怎么才算「会」：{drill.criterion}</p>
      )}

      {revealed ? (
        <>
          <DrillReveal drill={revealed} />
          {/* 还攒着题就直接下一道；一道都不剩、下一批还在出，就等它出完 */}
          <Button className="mt-4" disabled={refilling && remaining === 0} onClick={() => router.refresh()}>
            {refilling && remaining === 0 ? "下一批还在出……" : "下一道"}
          </Button>
          {refilling && remaining > 0 && <p className="mt-2 text-xs text-muted-foreground">后台在出下一批。</p>}
          {refillError && <p className="mt-2 text-xs text-muted-foreground">下一批没出成：{refillError}</p>}
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Button variant={guess === true ? "default" : "outline"} size="sm" onClick={() => setGuess(true)}>
              会
            </Button>
            <Button variant={guess === false ? "default" : "outline"} size="sm" onClick={() => setGuess(false)}>
              不会
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONFIDENCE_LEVELS) as ConfidenceKey[]).map((k) => (
              <Button
                key={k}
                variant={confidence === k ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setConfidence(confidence === k ? null : k)}
              >
                {CONFIDENCE_LEVELS[k].label}
              </Button>
            ))}
          </div>
          <Input
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            placeholder="为什么这么猜？写一句（揭晓时会拿它和实际原因对照，看你是猜对了还是想对了）"
            maxLength={300}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={pending || guess === null} onClick={submit}>
              {pending ? "揭晓中……" : "交卷，揭晓"}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setFlagging(!flagging)}>
              {flagging ? "不跳了" : "这题出得不好，跳过"}
            </Button>
          </div>
          {flagging && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="mb-2 text-muted-foreground">哪里不好？选最接近的一个（跳过的不算进次数，攒着拿来改出题）：</p>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(DRILL_FLAGS) as DrillFlag[]).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant="ghost"
                    className="h-auto justify-start whitespace-normal py-1.5 text-left"
                    disabled={pending}
                    onClick={() => skip(f)}
                  >
                    {DRILL_FLAGS[f]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}

/** 没有没答的题了：出一批（三四十秒）。 */
export function GenerateDrillsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await generateDrillsAction();
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "在出题、上网核实答案……三四十秒" : "出几道题"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
