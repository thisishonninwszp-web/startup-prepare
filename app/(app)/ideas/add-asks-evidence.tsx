"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AsksSummary } from "@/lib/domains/signals/asks-summary";
import type { OpenGapOption } from "@/lib/domains/ideas/info-gaps-shared";
import { addOwnGapEvidenceAction, listOpenGapOptionsAction } from "./info-gap-actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";
const small = "h-auto min-h-7 whitespace-normal px-2 py-0.5 text-left text-xs";

/** 信息缺口卡片上「数一数」之后：把这一样的那一句（代码拼的，带链接）补进这个缺口。 */
export function AddToThisGap({ gapId, summary }: { gapId: string; summary: AsksSummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <p className="text-xs text-muted-foreground">补进这个缺口了。</p>;
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        className={small}
        disabled={pending}
        title={summary.title}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const r = await addOwnGapEvidenceAction(gapId, summary.title, summary.url ?? "");
              if (r.ok) {
                setDone(true);
                router.refresh();
              } else setError(r.message);
            } catch {
              setError(OFFLINE);
            }
          })
        }
      >
        {pending ? "在补……" : "+ 补进这个缺口"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** 「听一听」之后：选一个想法还缺的那一格，把这一样的那一句补进去（缺口列表点开时才取）。 */
export function AddToIdeaGap({ summary }: { summary: AsksSummary }) {
  const [options, setOptions] = useState<OpenGapOption[] | null>(null);
  const [gapId, setGapId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <Link href={`/ideas/${done}#gaps`} className="text-xs text-primary underline-offset-4 hover:underline">
        补进去了，去想法页看 →
      </Link>
    );
  }

  const open = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await listOpenGapOptionsAction();
        if (r.ok) setOptions(r.options);
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });

  const add = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await addOwnGapEvidenceAction(gapId, summary.title, summary.url ?? "");
        if (r.ok) setDone(options?.find((o) => o.gaps.some((g) => g.id === gapId))?.idea_id ?? "");
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });

  return (
    <div className="space-y-1">
      {options === null ? (
        <Button size="sm" variant="ghost" className={small} disabled={pending} title={summary.title} onClick={open}>
          {pending ? "在取想法的缺口……" : "+ 补进想法的缺口"}
        </Button>
      ) : options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          你的想法里还没列信息缺口。去想法页点「列出这个想法还缺什么信息」，之后这里就能补进去。
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={gapId} onValueChange={setGapId}>
            <SelectTrigger className="h-8 text-xs sm:w-80">
              <SelectValue placeholder="补进哪个想法的哪一格" />
            </SelectTrigger>
            <SelectContent>
              {options.flatMap((o) =>
                o.gaps.map((g) => (
                  <SelectItem key={g.id} value={g.id} className="text-xs">
                    {o.idea_title}：{g.question}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={pending || !gapId} onClick={add}>
            {pending ? "在补……" : "补进去"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
