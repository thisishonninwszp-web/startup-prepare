"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CASE_STATUS_LABELS, STUCK_STEPS, type CaseDrillSummary } from "@/lib/domains/jobs/case-shared";
import { tokyoDate } from "@/lib/domains/jobs/shared";
import { createCaseDrillAction } from "../actions";

export function CasePanel({
  postingId,
  drills,
  missingMigration,
}: {
  postingId: string;
  drills: CaseDrillSummary[];
  missingMigration: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      setError(null);
      const r = await createCaseDrillAction(postingId);
      if (!r.ok) setError(r.message);
      else router.push(`/jobs/case/${r.id}`);
    });

  return (
    <section className="space-y-3 text-sm leading-7">
      <h2 className="text-base font-semibold">这家可能会问的 case</h2>
      <p className="text-muted-foreground">按这家的生意出一道ケース面接的题，限时写结构，再被面试官追问两三个。投之前、或者面试前一晚练一道。</p>
      {missingMigration ? (
        <p className="text-muted-foreground">{missingMigration}</p>
      ) : (
        <>
          <Button size="sm" disabled={pending} onClick={create}>
            {pending ? "在按这家出题…（十几秒）" : drills.length > 0 ? "再出一道" : "出一道这家可能会问的 case"}
          </Button>
          {drills.length > 0 && (
            <ul className="space-y-1">
              {drills.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{tokyoDate(new Date(d.created_at))}</span>
                  <Link href={`/jobs/case/${d.id}`} className="underline-offset-4 hover:underline" lang="ja">
                    {d.prompt_ja.length > 40 ? `${d.prompt_ja.slice(0, 40)}…` : d.prompt_ja}
                  </Link>
                  <Badge variant="muted">{d.stuck_step ? STUCK_STEPS[d.stuck_step] : CASE_STATUS_LABELS[d.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="text-muted-foreground">{error}</p>}
    </section>
  );
}
