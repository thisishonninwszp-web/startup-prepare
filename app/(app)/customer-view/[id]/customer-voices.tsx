"use client";

import { Button } from "@/components/ui/button";
import type { CustomerCaseDetail } from "../queries";
import { unplacedEvidenceIds, type CustomerEvidenceAtom } from "../types";

type ResearchRun = CustomerCaseDetail["runs"][number];

/** 「不同顾客声音」一页：分出来的几类声音、放到一边的证据、AI 漏掉没分的证据。 */
export function CustomerVoices({
  run,
  atoms,
  busyKey,
  onResearch,
  onSelectSegment,
}: {
  run: ResearchRun | undefined;
  atoms: CustomerEvidenceAtom[];
  busyKey: string | null;
  onResearch: () => void;
  onSelectSegment: (key: string) => void;
}) {
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  const setAside = run?.set_aside ?? [];
  // 只列找得到原话的；标题上的条数和下面列出的一致。
  const unplaced = run
    ? unplacedEvidenceIds(run).flatMap((id) => {
        const atom = atomById.get(id);
        return atom ? [atom] : [];
      })
    : [];

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">不同顾客声音</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            选择一种处境与行为，不要把几类人平均成不存在的典型顾客。
          </p>
        </div>
        <Button
          type="button"
          onClick={onResearch}
          className="text-xs underline underline-offset-4"
        >
          用当前证据重新研究
        </Button>
      </div>
      {!run ? (
        <p className="mt-8 text-sm text-muted-foreground">
          先保留材料并运行研究。
        </p>
      ) : run.segments.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          这里空着：这次没分出顾客声音，用到的证据都列在下面了。回收件箱多保留几份对题的材料，再研究一次。
        </p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {run.segments.map((segment) => (
            <article
              key={segment.key}
              className="flex flex-col rounded-lg border bg-card p-5"
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {segment.evidence_ids.length} evidence refs
              </div>
              <h3 className="mt-3 text-sm font-medium">{segment.label}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {segment.situation}
              </p>
              <ul className="mt-4 space-y-1 text-xs leading-5">
                {segment.behaviors.map((item, index) => (
                  <li key={index}>· {item}</li>
                ))}
              </ul>
              <div className="mt-4 rounded-md bg-muted p-3">
                <div className="text-[10px] text-muted-foreground">未知</div>
                {segment.unknowns.map((item, index) => (
                  <p key={index} className="mt-1 text-xs">
                    · {item}
                  </p>
                ))}
              </div>
              <Button
                type="button"
                onClick={() => onSelectSegment(segment.key)}
                disabled={busyKey === segment.key}
                className="mt-5"
              >
                用这类声音建立代理
              </Button>
            </article>
          ))}
        </div>
      )}
      {setAside.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium">
            没用上的证据（<span className="font-mono">{setAside.length}</span>条）
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            说话的不是这类人，或者讲的不是这件事，所以没分进上面的声音。这类人自己说的、和你的假设相反的话不会放在这里。觉得放错了，点上面「用当前证据重新研究」再分一次；对题的材料太少，就回收件箱多保留几份。
          </p>
          <ul className="mt-3 space-y-2">
            {setAside.map((item) => {
              const atom = atomById.get(item.evidence_id);
              return (
                <li
                  key={item.evidence_id}
                  className="rounded-md border bg-card p-3 text-xs leading-5"
                >
                  <span className="text-muted-foreground">
                    {item.reason === "other_person" ? "别的人" : "别的事"}
                    {item.basis ? ` · 原文写着「${item.basis}」` : ""}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                  {atom && <p className="mt-1">「{atom.quote}」</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {unplaced.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium">
            没分进任何一类的证据（<span className="font-mono">{unplaced.length}</span>条）
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            这次研究用到了，AI 却既没分进上面的声音、也没说清为什么放到一边。别当它不存在，自己看一眼：和你想的不一样的话，最容易这样漏掉。
          </p>
          <ul className="mt-3 space-y-2">
            {unplaced.map((atom) => (
              <li
                key={atom.id}
                className="rounded-md border bg-card p-3 text-xs leading-5"
              >
                「{atom.quote}」
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
