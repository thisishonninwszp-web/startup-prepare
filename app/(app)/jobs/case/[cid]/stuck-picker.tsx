"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STUCK_STEPS, type StuckStep } from "@/lib/domains/jobs/case-shared";
import { setCaseStuckStepAction } from "../../actions";

/** AI 只提名，他点了才算数（只数次数）。 */
export function StuckPicker({ id, suggested, current }: { id: string; suggested: StuckStep; current: StuckStep | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pick = (step: StuckStep) =>
    startTransition(async () => {
      setError(null);
      const r = await setCaseStuckStepAction(id, step);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">这道主要卡在哪一步</h2>
      <p className="text-xs leading-6 text-muted-foreground">
        {current ? "记下了。想改就再点一个。" : `面试官觉得是「${STUCK_STEPS[suggested]}」。你自己点一个才算数。`}
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STUCK_STEPS) as StuckStep[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={current === s ? "default" : !current && s === suggested ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => pick(s)}
          >
            {STUCK_STEPS[s]}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </section>
  );
}
