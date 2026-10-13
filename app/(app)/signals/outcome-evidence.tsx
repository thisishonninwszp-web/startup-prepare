"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { OutcomeEvidence } from "@/lib/domains/signals/practice-shared";
import { checkOutcomeEvidenceAction } from "./actions";
import { EvidenceList } from "./inference-tree";

/**
 * 到期的判断：对账之前先摆出上网查到的"现在实际怎样"。
 * 只摆证据，不替你判 —— 回头看总觉得"我早就知道"，自己判卷容易手松。
 * auto：还没查过就打开页面时自动查（到期的一次最多自动查几条，其余点按钮）。
 */
export function OutcomeEvidenceView({
  judgmentId,
  evidence,
  auto,
}: {
  judgmentId: string;
  evidence: OutcomeEvidence | null;
  auto: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const check = () =>
    startTransition(async () => {
      setError(null);
      const result = await checkOutcomeEvidenceAction(judgmentId);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  useEffect(() => {
    if (evidence || !auto || started.current) return;
    started.current = true;
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending) return <p className="mt-2 text-sm text-muted-foreground">在上网查这件事现在实际怎样了……十几秒。</p>;
  if (!evidence) {
    return (
      <div className="mt-2 text-sm">
        <Button variant="ghost" size="sm" className="h-10 px-2 sm:h-8" onClick={check}>
          先上网查一下现在怎样了
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }
  return (
    <div className="mt-2">
      <p className="text-xs leading-6 text-muted-foreground">
        对账之前先看看查到了什么。支持、反对都是对你那句判断而言的；最后对不对还是你来定。
      </p>
      {evidence.evidence.length > 0 ? (
        <EvidenceList evidence={evidence.evidence} />
      ) : (
        <p className="mt-1 text-sm leading-7 text-muted-foreground">查过了，没找到这件事后来的消息。去原文那边自己看一眼再定。</p>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
