"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CaseFollowup } from "@/lib/domains/jobs/case-shared";
import { submitFollowupAnswersAction } from "../../actions";

/** 面试官的追问，一个个答；答不上来的可以空着（至少答一个）。 */
export function FollowupForm({ id, followups }: { id: string; followups: CaseFollowup[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<string[]>(followups.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await submitFollowupAnswersAction(id, answers);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">面试官追问</h2>
      <p className="text-xs leading-6 text-muted-foreground">像当面被问到那样，一个个答。答不上来的可以空着，复盘里会说。</p>
      {followups.map((f, i) => (
        <div key={i} className="space-y-2">
          <p className="font-medium" lang="ja">
            {f.q_ja}
          </p>
          <p className="text-xs text-muted-foreground">针对你写的：「{f.cites}」</p>
          <Textarea
            lang="ja"
            rows={4}
            value={answers[i]}
            onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
          />
        </div>
      ))}
      <Button disabled={pending || answers.every((a) => !a.trim())} onClick={submit}>
        {pending ? "在写复盘…（二三十秒）" : "答え終わった"}
      </Button>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </section>
  );
}
