"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { weekPickToIdeaAction } from "./actions";

/** 这周的一件旁边的「变成想法」：建好以后刷新，这一框换成「已经变成想法了」和它的链接。 */
export function WeekPickButton({ side, signalId }: { side: GapSide; signalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const r = await weekPickToIdeaAction(side, signalId);
              setMessage(r.message);
              if (r.ok) router.refresh();
            } catch {
              setMessage("没连上服务器，过一会儿再试。");
            }
          })
        }
      >
        变成想法
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </span>
  );
}
