"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { routeSignalToGapAction } from "../ideas/info-gap-actions";

type Option = { idea_id: string; idea_title: string; gaps: { id: string; question: string }[] };

/**
 * 这条新闻去哪：补进某个想法还缺的那一格（信息只有改变一个决定时才有用）。
 * 补进去的会在想法页那个缺口下面列出来，信息源体检按它数「进了决定几条」。
 */
export function RouteToGap({ signalId, options }: { signalId: string; options: Option[] }) {
  const [gapId, setGapId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ ideaId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <Link href={`/ideas/${done.ideaId}#gaps`} className="text-sm text-primary underline-offset-4 hover:underline">
        补进去了，去想法页看 →
      </Link>
    );
  }
  if (options.length === 0) {
    return (
      <p className="text-sm leading-7 text-muted-foreground">
        你的想法里还没列信息缺口。去想法页点「列出这个想法还缺什么信息」，之后看到有用的就能补进去。
      </p>
    );
  }
  const ideaOf = (id: string) => options.find((o) => o.gaps.some((g) => g.id === id));
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-3">
        {options.map((o) => (
          <li key={o.idea_id}>
            <p className="font-medium">{o.idea_title}</p>
            <div className="mt-1 flex flex-col gap-1">
              {o.gaps.map((g) => (
                <Button
                  key={g.id}
                  size="sm"
                  variant={gapId === g.id ? "secondary" : "ghost"}
                  className="h-auto justify-start whitespace-normal py-1.5 text-left"
                  onClick={() => setGapId(g.id)}
                >
                  {g.question}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {gapId && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句：它说明了什么（可以不写）" maxLength={200} />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await routeSignalToGapAction(signalId, gapId, note);
                if (r.ok) setDone({ ideaId: ideaOf(gapId)?.idea_id ?? "" });
                else setError(r.message);
              })
            }
          >
            {pending ? "在补……" : "补进这一格"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
