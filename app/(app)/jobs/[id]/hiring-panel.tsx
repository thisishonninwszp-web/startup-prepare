"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { HiringContext } from "@/lib/domains/jobs/hiring-shared";
import { tokyoDate } from "@/lib/domains/jobs/shared";
import { generateHiringAction, pickHiringAction } from "../actions";

/**
 * 「这家为什么现在招」：查到的事（原话核对过）+ 推测（标明是推测）+ 书类里怎么体现 + 面试时验证的一句。
 * 他点「我认同这条」，改简历时就按这条挑经历、排顺序。
 */
export function HiringPanel({
  postingId,
  context,
  missingMigration,
}: {
  postingId: string;
  context: HiringContext | null;
  missingMigration: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setError(null);
      const r = await generateHiringAction(postingId);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  const pick = (index: number | null) =>
    startTransition(async () => {
      setError(null);
      const r = await pickHiringAction(postingId, index);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  const sourceOf = (key: string) => context?.sources.find((s) => s.key === key);

  return (
    <section className="space-y-4 text-sm leading-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">这家为什么现在招</h2>
        {!missingMigration && (
          <Button size="sm" variant={context ? "outline" : "default"} disabled={pending} onClick={run}>
            {pending ? "在查这家的中期计划和新闻稿…（二三十秒）" : context ? "重新查" : "去查"}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground">
        招聘页是人事照着现场的需求写的。查这家的中期计划、今年的新闻稿、新事业，猜现场到底缺什么人。下面都是推测：有中介的话，直接问一句「今回の募集背景は？」比这个准。
      </p>
      {missingMigration ? (
        <p className="text-muted-foreground">{missingMigration}</p>
      ) : !context ? (
        <p className="text-muted-foreground">还没查过这家。</p>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="font-medium">查到的事</h3>
            <ul className="space-y-2">
              {context.facts.map((f) => {
                const src = sourceOf(f.source);
                return (
                  <li key={f.key}>
                    <span className="mr-1 font-mono text-xs text-muted-foreground">{f.key}</span>
                    {f.point}
                    <p className="text-xs text-muted-foreground" lang="ja">
                      「{f.quote}」
                      {src?.url ? (
                        <a href={src.url} target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-4">
                          {f.source === "S0" ? "招聘页" : src.title || "出处"}
                        </a>
                      ) : (
                        <span className="ml-1">{f.source === "S0" ? "（招聘页）" : ""}</span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">推测：现场可能缺的人</h3>
            {context.needs.map((n, i) => {
              const chosen = context.picked === i;
              return (
                <div key={n.need} className={`space-y-1 rounded-md border p-3 ${chosen ? "border-primary bg-card" : "border-border"}`}>
                  <p className="font-medium">{n.need}</p>
                  <p className="text-xs text-muted-foreground">依据：{n.facts.join("、")}</p>
                  {n.posting_quote && (
                    <p className="text-xs text-muted-foreground" lang="ja">
                      招聘页上对得上的：「{n.posting_quote}」
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">书类里：</span>
                    {n.show}
                  </p>
                  {n.ask && (
                    <p>
                      <span className="text-muted-foreground">面试时问一句来验证：</span>
                      <span lang="ja">{n.ask}</span>
                    </p>
                  )}
                  <div className="pt-1">
                    {chosen ? (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => pick(null)}>
                        取消认同
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => pick(i)}>
                        我认同这条
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              {context.picked === null
                ? "认同哪条，下面「改简历」就按哪条挑经历、排顺序（不会多写你没做过的事）。都不认同就不用点。"
                : "下面「改简历」会按你认同的这条排。已经改过的那版不会变，要再点一次「改一版」。"}
              {" "}查于 {tokyoDate(new Date(context.updated_at))}。
            </p>
          </div>
        </>
      )}
      {error && <p className="text-muted-foreground">{error}</p>}
    </section>
  );
}
