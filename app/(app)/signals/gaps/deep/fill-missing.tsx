"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { DeepStep } from "@/lib/domains/signals/deep-shared";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { analyzeGapTransferAction, analyzeGapVoicesAction, runThereAction } from "../../actions";

const STEP_NAMES: Record<DeepStep, string> = { there: "那边查一查", transfer: "能不能搬过来", voices: "这边有人在头疼吗" };

/** 没查过的几步按顺序跑：一步一个请求（各自 60 秒内），跑完一步刷新一次；失败的那步写原因，后面的照跑。 */
export function FillMissing({ signalId, side, steps }: { signalId: string; side: GapSide; steps: DeepStep[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [log, setLog] = useState<string[]>([]);
  const run = () =>
    startTransition(async () => {
      setLog([]);
      for (const step of steps) {
        setLog((prev) => [...prev, `${STEP_NAMES[step]}：在查…`]);
        const result =
          step === "there"
            ? await runThereAction(signalId, side)
            : step === "transfer"
              ? await analyzeGapTransferAction(signalId, side)
              : await analyzeGapVoicesAction(signalId, side);
        setLog((prev) => [...prev.slice(0, -1), `${STEP_NAMES[step]}：${result.ok ? "查完了" : `没查成 —— ${result.message}`}`]);
        router.refresh();
      }
    });
  if (steps.length === 0 && log.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {steps.length > 0 && (
        <>
          <p className="text-sm leading-7">
            还有 {steps.length} 步没查：{steps.map((s) => STEP_NAMES[s]).join("、")}。一步三四十秒，按顺序跑，跑完一步就显示一步。
          </p>
          <Button className="mt-2" size="sm" disabled={pending} onClick={run}>
            {pending ? "在查…" : "把缺的都查一遍"}
          </Button>
        </>
      )}
      {log.length > 0 && (
        <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
