"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import { compareDreamCaseBranches } from "../../actions";
import type { DreamCaseDetail } from "../../queries";
import type { DreamBranchComparison as Comparison } from "../../types";

const DIMENSIONS = [
  ["actions", "未来动作"],
  ["non_negotiables", "不可牺牲"],
  ["costs", "愿意承担的代价"],
  ["reality_signals", "现实信号"],
  ["conflicts", "冲突"],
] as const;

export function DreamBranchComparison({
  dreamCase,
}: {
  dreamCase: DreamCaseDetail;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      setComparison(await compareDreamCaseBranches(dreamCase.id));
    } catch (caught) {
      console.error("比较梦想分支失败", caught);
      setError(caught instanceof Error ? caught.message : "比较失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f1ea] px-4 py-8 text-stone-950 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[90rem]">
        <Link
          href={`/dreams/${dreamCase.id}`}
          className="inline-flex items-center gap-2 text-xs text-stone-500"
        >
          <ArrowLeft className="size-3" />
          返回梦想工作台
        </Link>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
              Parallel futures
            </p>
            <h1 className="mt-3 font-serif text-4xl tracking-[-0.04em]">
              不选赢家，只看取舍。
            </h1>
            <p className="mt-3 text-sm text-stone-600">
              {dreamCase.title} · {dreamCase.branches.length}条活跃路径
            </p>
          </div>
          <Button className="rounded-full" onClick={analyze} disabled={busy}>
            <Split className="mr-2 size-4" />
            {busy ? "正在辨认差异…" : "整理共同点与未知"}
          </Button>
        </div>

        <div
          className="mt-8 grid gap-4 overflow-x-auto pb-3"
          style={{
            gridTemplateColumns: `repeat(${dreamCase.branches.length}, minmax(17rem, 1fr))`,
          }}
        >
          {dreamCase.branches.map((branch, index) => (
            <article
              key={branch.id}
              className="rounded-[2rem] border border-stone-300 bg-[#f9f7f2] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] text-stone-400">
                    PATH {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2 className="mt-2 font-serif text-2xl">{branch.name}</h2>
                </div>
                {branch.is_focused ? (
                  <span className="rounded-full bg-stone-900 px-2 py-1 text-[10px] text-white">
                    当前焦点
                  </span>
                ) : null}
              </div>
              {branch.tradeoff ? (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  取舍：{branch.tradeoff}
                </p>
              ) : null}
              <div className="mt-5 space-y-5">
                {DIMENSIONS.map(([dimension, label]) => {
                  const values =
                    branch.canvas?.content[dimension]
                      .filter((item) => item.status === "confirmed")
                      .map((item) => item.text) ?? [];
                  return (
                    <section key={dimension}>
                      <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">
                        {label}
                      </h3>
                      {values.length ? (
                        <ul className="mt-2 space-y-2">
                          {values.map((value) => (
                            <li key={value} className="text-sm leading-6">
                              {value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 font-serif text-sm italic text-stone-400">
                          尚未看清
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        {comparison ? (
          <section className="mt-6 grid gap-5 rounded-[2rem] bg-stone-950 p-6 text-stone-50 md:grid-cols-2">
            <div>
              <h2 className="font-serif text-xl">共同地面</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
                {comparison.common_ground.map((item) => (
                  <li key={item}>— {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-serif text-xl">仍然未知</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
                {comparison.unknowns.map((item) => (
                  <li key={item}>— {item}</li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-2">
              <h2 className="font-serif text-xl">具体差异</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {comparison.differences.map((difference) => (
                  <div
                    key={difference.dimension}
                    className="rounded-2xl border border-white/10 p-4"
                  >
                    <p className="text-xs text-stone-400">
                      {difference.dimension}
                    </p>
                    {difference.branches.map((branch) => (
                      <p key={branch.branch_id} className="mt-2 text-sm">
                        {dreamCase.branches.find(
                          (item) => item.id === branch.branch_id
                        )?.name ?? "路径"}
                        ：{branch.summary}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
        <AiErrorNotice error={error} className="mt-4" />
      </div>
    </main>
  );
}
