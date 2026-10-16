"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  belowFloor,
  categoryLabel,
  locationVerdict,
  REMOTE_LEVELS,
  salaryDiff,
  VISA_FITS,
  type JobPosting,
  type JobProfile,
} from "@/lib/domains/jobs/shared";
import { dropCandidateAction, pickPostingAction } from "./actions";

export function CandidateList({ candidates, profile }: { candidates: JobPosting[]; profile: JobProfile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  if (candidates.length === 0) {
    return <p className="text-sm leading-7 text-muted-foreground">这里空着。今天搜到的岗位会放在这，你点「要这个」才算进你在看的岗位。</p>;
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => {
        const diff = salaryDiff(profile.salaryNow, c.facts.salary_min, c.facts.salary_max);
        const unclear = locationVerdict(c.facts.location, c.facts.remote, profile.locations) === "unclear";
        return (
          <div key={c.id} className="rounded-lg border border-border p-4 text-sm leading-7">
            <p className="font-medium">
              {c.title}
              <span className="ml-2 font-normal text-muted-foreground">{c.company_name}</span>
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{categoryLabel(c.category)}</Badge>
              <Badge variant="muted">
                {c.facts.location || "勤务地没写"} · {REMOTE_LEVELS[c.facts.remote]}
              </Badge>
              {unclear && <Badge variant="muted">地点说不清</Badge>}
              <Badge variant="muted">{diff ?? "年收没写"}</Badge>
              {belowFloor(profile.salaryFloor, c.facts.salary_min, c.facts.salary_max) && <Badge variant="muted">低于你写的下限</Badge>}
              {profile.visa === "gijinkoku" && <Badge variant="muted">签证：{VISA_FITS[c.facts.visa.fit]}</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={pending} onClick={() => act(() => pickPostingAction(c.id))}>
                要这个
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => dropCandidateAction(c.id))}>
                不要
              </Button>
              {c.url && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="self-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  原页面
                </a>
              )}
            </div>
          </div>
        );
      })}
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
