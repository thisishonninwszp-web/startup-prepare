"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CompareBoard } from "@/lib/domains/signals/compare";
import { setSharePrefAction } from "./memory-actions";

/** 一起练：打开了「公开我的分数」的几个人互相看成绩（默认谁都只看得到自己的）。 */
export function CompareSection({ board, kind }: { board: CompareBoard; kind: "live" | "drill" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = (share: boolean) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await setSharePrefAction(share);
        if (r.ok) router.refresh();
        else setError(r.message);
      } catch {
        setError("没连上服务器（网络断了一下），过一会儿再试。");
      }
    });
  const data = board[kind];
  return (
    <section className="mt-10">
      <h2 className="mb-1 text-base font-semibold">和一起用的人比</h2>
      {!board.sharing ? (
        <>
          <p className="text-sm leading-7 text-muted-foreground">
            一起用的还有 {board.others} 个人，其中 {board.othersSharing} 个打开了「公开我的分数」。你也打开，才看得到彼此的成绩（谁都可以随时关上）。有人一起，比一个人练容易坚持。
          </p>
          <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => toggle(true)}>
            公开我的分数给一起用的人
          </Button>
        </>
      ) : (
        <>
          {!data || data.scores.length < 2 ? (
            <p className="text-sm leading-7 text-muted-foreground">你已经公开了。别人还没打开，打开以后这里就有比较。</p>
          ) : (
            <ul className="space-y-1 text-sm leading-7">
              {data.scores.map((s, i) => (
                <li key={s.user}>
                  <span className="font-medium">{i === 0 ? "你" : s.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    对过账的 {s.n} 道{s.brier !== null ? `，平均分 ${s.brier.toFixed(3)}` : "（满 10 道才给分）"}
                  </span>
                </li>
              ))}
              {data.vs
                .filter((v) => v.n > 0)
                .map((v) => (
                  <li key={v.other} className="text-xs text-muted-foreground">
                    你和 {v.name} 都答过的 {v.n} 道里：你更近 {v.meCloser} 道，{v.name} 更近 {v.otherCloser} 道{v.tie > 0 ? `，一样 ${v.tie} 道` : ""}
                  </li>
                ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs" disabled={pending} onClick={() => toggle(false)}>
            不公开了
          </Button>
        </>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </section>
  );
}
