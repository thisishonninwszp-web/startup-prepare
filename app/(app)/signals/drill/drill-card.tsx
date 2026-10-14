"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DRILL_FLAGS, drillHit, type AnsweredDrill, type DrillFlag, type OpenDrill } from "@/lib/domains/signals/drills-shared";
import { CONFIDENCE_LEVELS, type ConfidenceKey } from "@/lib/domains/signals/practice-shared";
import { answerDrillAction, flagDrillAction, generateDrillsAction } from "../actions";

/** 揭晓：猜对没有、实际发生了什么、出处。 */
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
    </div>
  );
}

/** 还没答的一道：猜会不会、选把握、写一句为什么，交了马上揭晓。 */
export function DrillCard({ drill }: { drill: OpenDrill }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
      if (result.ok) setRevealed(result.drill);
      else setError(result.message);
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
          <Button className="mt-4" onClick={() => router.refresh()}>
            下一道
          </Button>
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
            placeholder="为什么这么猜？一句话（可以不写，写了揭晓后好对照）"
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
