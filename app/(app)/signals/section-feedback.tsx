"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setFeedbackAction } from "./actions";

/** 这一节今天有没有用：点一下就记下，攒两周在"信息源体检"里看哪节该砍。 */
export function SectionFeedback({ date, kind, initial }: { date: string; kind: string; initial?: boolean }) {
  const [value, setValue] = useState<boolean | undefined>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (useful: boolean) =>
    startTransition(async () => {
      const r = await setFeedbackAction(date, kind, useful);
      if (r.ok) {
        setValue(useful);
        setError(null);
      } else setError(r.message);
    });
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>这一节今天有用吗？</span>
      <Button size="sm" variant={value === true ? "secondary" : "ghost"} className="h-7 px-2 text-xs" disabled={pending} onClick={() => pick(true)}>
        有用
      </Button>
      <Button size="sm" variant={value === false ? "secondary" : "ghost"} className="h-7 px-2 text-xs" disabled={pending} onClick={() => pick(false)}>
        没用
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
