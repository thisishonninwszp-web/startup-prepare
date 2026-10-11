"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createContactPlanAction } from "./actions";

/** 报告建议的人，记成一张触达规划画布；记过就直接给链接。 */
export function ContactPlanButton({ signalId }: { signalId: string }) {
  const [pending, startTransition] = useTransition();
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (canvasId) {
    return (
      <Link href={`/outreach/${canvasId}`} className="text-sm text-primary underline-offset-4 hover:underline">
        记下了，去想在哪儿找到他、怎么开口 →
      </Link>
    );
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createContactPlanAction(signalId);
            if (result.ok) setCanvasId(result.canvasId);
            else setError(result.message);
          })
        }
      >
        {pending ? "在记…" : "记成要找的人"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
