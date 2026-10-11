"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SignalKind } from "@/lib/domains/signals/feeds";
import { generateBriefNow } from "./actions";

/** 手动生成（或重新生成）今天某一份报告。 */
export function GenerateBriefButton({ kind, regenerate = false }: { kind: SignalKind; regenerate?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant={regenerate ? "ghost" : "default"}
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await generateBriefNow(kind);
            if (!result.ok) setNote(result.message);
            else {
              setNote(null);
              router.refresh();
            }
          })
        }
      >
        {pending ? "在挑、在写…" : regenerate ? "重新生成这一份" : "现在生成"}
      </Button>
      {note && <p className="text-xs text-destructive">{note}</p>}
    </div>
  );
}
