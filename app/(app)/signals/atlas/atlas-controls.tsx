"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ATLAS_OUTCOMES, type AtlasOutcome } from "@/lib/domains/signals/atlas-shared";
import { rejudgeAtlasAction, researchAtlasAction, setCaseOutcomeAction } from "../actions";

/** 查一批（三四十秒）：空的时候从十件样例开始，之后再找几件。没收进来的写清卡在哪。 */
export function ResearchAtlasButton({ mode, label }: { mode: "seed" | "more"; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dropped, setDropped] = useState<{ thing: string; why: string }[]>([]);
  return (
    <div>
      <Button
        variant={mode === "seed" && label ? "outline" : "default"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            setDropped([]);
            const result = await researchAtlasAction(mode);
            if (result.ok) {
              setMessage(
                [
                  result.tried === 0 ? "这次没有新的可查。" : `这次查了 ${result.tried} 件，收了 ${result.kept} 件。`,
                  result.corrected > 0 ? `早先收的样例里有 ${result.corrected} 件的结果被评高了，已经改回去。` : "",
                ]
                  .filter(Boolean)
                  .join("")
              );
              setDropped(result.dropped);
              router.refresh();
            } else setMessage(result.message);
          })
        }
      >
        {pending ? "在一件件上网核实……三四十秒" : label ?? (mode === "seed" ? "从十件样例开始" : "再找几件")}
      </Button>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      {dropped.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">
          {dropped.map((d) => (
            <li key={d.thing}>
              没收：{d.thing} —— {d.why}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 已经收进来、还没请裁判看过的，请裁判再看一遍（十几秒）。 */
export function RejudgeButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await rejudgeAtlasAction();
            if (result.ok) {
              setMessage(
                `裁判看了 ${result.judged} 件，没过的 ${result.failed} 件（不删，先不算进统计）` +
                  (result.unavailable > 0 ? `；${result.unavailable} 件这次裁判没调通（${result.error ?? "原因不明"}），过会儿再点一次` : "") +
                  (result.left > 0 ? `；时间到了，还剩 ${result.left} 件没判，再点一次接着判` : "") +
                  "。"
              );
              router.refresh();
            } else setMessage(result.message);
          })
        }
      >
        {pending ? "裁判在一条条看原文……十几秒" : `请裁判把已收的再看一遍（${count} 件）`}
      </Button>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

/** 结果不对就手动改一档（分档本身带一点判断）。 */
export function OutcomeEditor({ id, outcome }: { id: string; outcome: AtlasOutcome }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">结果不对？改一档</summary>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {(Object.keys(ATLAS_OUTCOMES) as AtlasOutcome[]).map((o) => (
          <Button
            key={o}
            size="sm"
            variant={o === outcome ? "secondary" : "ghost"}
            disabled={pending || o === outcome}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await setCaseOutcomeAction(id, o);
                if (result.ok) router.refresh();
                else setError(result.message);
              })
            }
          >
            {ATLAS_OUTCOMES[o]}
          </Button>
        ))}
      </div>
      {error && <p className="mt-1 text-destructive">{error}</p>}
    </details>
  );
}
