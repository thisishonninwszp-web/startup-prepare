"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Err, useAction } from "./self-forms";
import { answerWindowCandidate, skipWindowCandidate } from "./actions";
import type { WindowCandidates } from "./queries";
import {
  situationFor,
  type Candidate,
} from "@/lib/domains/self-model/candidates";

const SOURCE_LABEL: Record<Candidate["source"], string> = {
  validation: "接触",
  decision: "决定",
  commitment: "承诺",
};

function CandidateRow({
  candidate,
  hypotheses,
  onDone,
}: {
  candidate: Candidate;
  hypotheses: WindowCandidates["hypotheses"];
  onDone: () => void;
}) {
  const [hypothesisId, setHypothesisId] = useState<string | null>(
    hypotheses.length === 1 ? hypotheses[0].id : null
  );
  const [contextKey, setContextKey] = useState(candidate.contextKey);
  const { pending, error, run } = useAction();

  const answer = (outcome: "hit" | "miss") => {
    if (!hypothesisId) return;
    run(
      () =>
        answerWindowCandidate({
          source: candidate.source,
          sourceId: candidate.sourceId,
          hypothesisId,
          outcome,
          contextKey,
          situation: situationFor(candidate),
          occurredOn: candidate.occurredOn,
        }),
      onDone
    );
  };

  return (
    <div className="self-panel">
      <div className="self-panel__head">
        <span className="self-label">{SOURCE_LABEL[candidate.source]}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {candidate.occurredOn}
        </span>
      </div>
      <div className="self-panel__body space-y-3">
        <p className="text-[15px] leading-relaxed">{candidate.text}</p>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">这是哪条假设说的那种情况？</p>
          <div className="flex flex-wrap gap-2">
            {hypotheses.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={item.id === hypothesisId ? "default" : "outline"}
                size="sm"
                onClick={() => setHypothesisId(item.id)}
              >
                <span className="mr-1.5 font-mono text-[11px]">{item.code}</span>
                {item.statement}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">当时算哪一类情况</span>
          <Input
            value={contextKey}
            onChange={(event) => setContextKey(event.target.value)}
            className="h-8 w-48 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || !hypothesisId}
            onClick={() => answer("hit")}
          >
            算，那次我做了
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !hypothesisId}
            onClick={() => answer("miss")}
          >
            算，那次我没做
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  skipWindowCandidate({
                    source: candidate.source,
                    sourceId: candidate.sourceId,
                  }),
                onDone
              )
            }
          >
            不算这种情况
          </Button>
        </div>
        <Err message={error} />
      </div>
    </div>
  );
}

/**
 * 「这算不算」。
 *
 * 记录口反过来：不让你从零填，系统从已有的接触、决定、承诺里挑出来问。
 * 「没做」那个按钮是整块东西存在的理由 —— 没人会主动记自己怂了的那次，
 * 但被问到的时候，人是会认的。
 */
export function CandidatesPanel({ initial }: { initial: WindowCandidates }) {
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const pending = initial.pending.filter(
    (item) => !answered.has(`${item.source}:${item.sourceId}`)
  );

  if (initial.hypotheses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        还没有立着的假设，所以没什么可问的。先在台账里立一条「在什么情况下我会怎样」，
        之后每一次接触、决定、承诺，这里都会来问你算不算那种情况。
      </p>
    );
  }

  if (pending.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        最近的接触、决定、承诺都问过了。下一次发生了什么，这里会再问。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        最近 {pending.length} 件事，每件问一句：算不算你某条假设说的那种情况？
        算的话，那次做了还是没做。「没做」和「做了」一样要记 —— 它是分母。
      </p>
      {pending.slice(0, 5).map((candidate) => (
        <CandidateRow
          key={`${candidate.source}:${candidate.sourceId}`}
          candidate={candidate}
          hypotheses={initial.hypotheses}
          onDone={() =>
            setAnswered((prev) =>
              new Set(prev).add(`${candidate.source}:${candidate.sourceId}`)
            )
          }
        />
      ))}
      {pending.length > 5 && (
        <p className="text-xs text-muted-foreground">
          还有 {pending.length - 5} 件，答完上面的再来。
        </p>
      )}
    </div>
  );
}
