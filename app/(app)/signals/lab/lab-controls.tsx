"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { LabVariantKey } from "@/lib/domains/signals/lab-shared";
import { chooseLabVariantAction, runSelectionLabAction } from "../actions";

/** 拿今天的候选再测一次。 */
export function RunLabButton({ label }: { label: string }) {
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
            const result = await runSelectionLabAction();
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "四种挑法在各挑一遍……三四十秒" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** 选这一组（选了就揭晓，不能改）。 */
export function ChooseButton({ runId, variant, letter }: { runId: string; variant: LabVariantKey; letter: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await chooseLabVariantAction(runId, variant);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "记下了……" : `最想读${letter}这一组`}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
