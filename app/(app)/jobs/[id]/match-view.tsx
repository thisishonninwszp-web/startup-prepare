"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { matchCounts, requiredAnyOf, type CareerEntry, type JobPosting } from "@/lib/domains/jobs/shared";
import { refreshMatchAction } from "../actions";

/** 每条条件：底稿里哪条对得上，或者"没有"。只数有几条、缺几条，不算百分比。 */
export function MatchView({ posting, entries }: { posting: JobPosting; entries: CareerEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const { conditions } = posting.facts;
  const match = posting.match;

  const refresh = () =>
    startTransition(async () => {
      setMessage(null);
      const r = await refreshMatchAction(posting.id);
      if (!r.ok) setMessage(r.message);
      else if (r.noEntries) setMessage("底稿里还没有确认过的经历，对照不了。");
      else router.refresh();
    });

  const anyOf = requiredAnyOf(posting.body);
  const counts = match ? matchCounts(conditions, match, anyOf) : null;

  return (
    <section className="space-y-4 text-sm leading-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">跟你的底稿对一遍</h2>
        <Button size="sm" variant="outline" disabled={pending} onClick={refresh}>
          {pending ? "在对……" : match ? "重新对照" : "对照底稿"}
        </Button>
      </div>
      {!match ? (
        <p className="text-muted-foreground">
          还没对照。
          {entries.length === 0 && (
            <>
              底稿里还没有确认过的经历，先去
              <Link href="/jobs/base" className="underline underline-offset-4">
                写几条
              </Link>
              。
            </>
          )}
        </p>
      ) : (
        <>
          {counts &&
            (counts.anyOf ? (
              <p>
                必须条件写的是「下面几条满足一条就行」：对得上 {counts.required.have} 条
                {counts.required.have > 0 ? "，这一关过了。" : "，一条都没对上。"}
                加分条件：有 {counts.bonus.have} 条，缺 {counts.bonus.missing} 条。
              </p>
            ) : (
              <p>
                必须条件：有 {counts.required.have} 条，缺 {counts.required.missing} 条；加分条件：有 {counts.bonus.have} 条，缺{" "}
                {counts.bonus.missing} 条。
              </p>
            ))}
          <p className="rounded-md border border-border bg-card p-3">
            <span className="font-medium">最可能卡你的：</span>
            {match.blocker.text}
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            {conditions.map((c, i) => {
              const ids = match.entry_ids[i] ?? [];
              return (
                <li key={c.quote}>
                  <span className="text-xs text-muted-foreground">{c.required ? (anyOf ? "必须（其一）" : "必须") : "加分"}</span> {c.text}
                  <p className="text-xs text-muted-foreground">原话：「{c.quote}」</p>
                  <p className="text-xs">
                    {ids.length === 0 ? "底稿里没有" : `对得上：${ids.map((id) => byId.get(id)?.org || "（一条底稿）").join("、")}`}
                  </p>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {message && <p className="text-muted-foreground">{message}</p>}
    </section>
  );
}
