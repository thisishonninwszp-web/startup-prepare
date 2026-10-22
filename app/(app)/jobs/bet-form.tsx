"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, tokyoDate } from "@/lib/domains/jobs/shared";
import { createMarketBetAction } from "./actions";

/** 押一条进判断账本，到期对着上面的次数对账。 */
export function BetForm() {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [dueOn, setDueOn] = useState(addDays(tokyoDate(), 30));
  const [confidence, setConfidence] = useState("50");
  const [message, setMessage] = useState<string | null>(null);

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      const r = await createMarketBetAction({ text, dueOn, confidence: Number(confidence) });
      if (r.ok) {
        setText("");
        setMessage("记上了，到期在「自我」的判断账本里对账。");
      } else setMessage(r.message);
    });

  return (
    <div className="space-y-2 text-sm">
      <Input placeholder="比如：数据分析类再投 5 家，至少 1 家约面试" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          到期
          <Input type="date" className="h-8 w-40" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          把握
          <Input inputMode="numeric" className="h-8 w-16" value={confidence} onChange={(e) => setConfidence(e.target.value)} />%
        </label>
        <Button size="sm" variant="outline" disabled={pending || !text.trim()} onClick={save}>
          把这一条记成判断
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
